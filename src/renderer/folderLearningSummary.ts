interface FolderLearningSummaryInput {
  targetFolder?: string;
  entries: FolderLearningNameEntry[];
  preference?: FolderLearningPreference | null;
  aiName: string;
  aiFields: AiSelectionFields | null;
  extension: SupportedDocumentExtension;
  warnings?: string[];
  knownTargets?: KnownTarget[];
}

interface FolderLearningSummaryApi {
  buildAnalysis: (input: FolderLearningSummaryInput) => FolderLearningAnalysis;
}

interface Window {
  DocSorterFolderLearningSummary: FolderLearningSummaryApi;
}

var DocSorterFolderLearningSummary: FolderLearningSummaryApi;

(() => {
  type ParsedDatePrecision = "day" | "month" | "year" | "school-year";
  type SchemaStatus = "ready" | "ambiguous" | "blocked";
  type SchemaField = "target" | "documentType" | "subject" | "issuer" | "detail";

  interface ParsedName {
    originalName: string;
    dateToken: string;
    datePrecision: ParsedDatePrecision;
    blocks: string[];
    target: string;
    documentType: string;
    subject?: string;
    issuer?: string;
    detail?: string;
    pattern: string;
  }

  interface DominantValue {
    value: string;
    count: number;
    ratio: number;
  }

  interface SchemaAnalysis {
    status: SchemaStatus;
    pattern?: string;
    fieldOrder: SchemaField[];
    confidence: number;
    reasons: string[];
    warnings: string[];
    blockingReason?: string;
  }

  interface AiInputFields {
    dateToken: string;
    target: string;
    documentType: string;
    subject: string;
    issuer: string;
    detail: string;
  }

  interface TargetBlockRecognition {
    block: string;
    position: number;
    field: "target";
    target: {
      id: string;
      displayName: string;
      fileAlias: string;
      kind?: string;
    };
    matchType: "exact-alias" | "exact-display-name" | "controlled-prefix";
    confidence: number;
    reason: string;
  }

  interface TargetBlockAmbiguity {
    block: string;
    position: number;
    matchingFileAliases: string[];
    reason: string;
  }

  interface TargetToken {
    value: string;
    normalized: string;
    matchType: "exact-alias" | "exact-display-name";
    target: KnownTarget;
  }

  const SUPPORTED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
  const BLOCK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const DOMINANT_RATIO = 0.6;
  const STRONG_RATIO = 0.8;
  const SCHEMA_FIELD_ORDERS: Array<{ pattern: string; fields: SchemaField[] }> = [
    { pattern: "DATE_DOCUMENT", fields: ["documentType"] },
    { pattern: "DATE_DOCUMENT_EMETTEUR", fields: ["documentType", "issuer"] },
    { pattern: "DATE_CIBLE_DOCUMENT", fields: ["target", "documentType"] },
    { pattern: "DATE_DOCUMENT_CIBLE", fields: ["documentType", "target"] },
    { pattern: "DATE_CIBLE_DOCUMENT_SUBJECT", fields: ["target", "documentType", "subject"] },
    { pattern: "DATE_CIBLE_DOCUMENT_EMETTEUR", fields: ["target", "documentType", "issuer"] },
    { pattern: "DATE_DOCUMENT_CIBLE_EMETTEUR", fields: ["documentType", "target", "issuer"] },
    { pattern: "DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR", fields: ["target", "documentType", "subject", "issuer"] },
    { pattern: "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL", fields: ["target", "documentType", "issuer", "detail"] },
    { pattern: "DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR_DETAIL", fields: ["target", "documentType", "subject", "issuer", "detail"] },
    { pattern: "DATE_DOCUMENT_CIBLE_EMETTEUR_DETAIL", fields: ["documentType", "target", "issuer", "detail"] }
  ];

  function buildAnalysis(input: FolderLearningSummaryInput): FolderLearningAnalysis {
    const profile = buildProfile(input.entries, input.warnings ?? [], input.preference ?? null, input.knownTargets ?? []);
    const aiInput = readAiInput(input);
    const schema = aiInput ? analyzeSchema(profile, aiInput) : blockedSchema("Champs IA incomplets.");
    const profileWithSchema = applySchemaSemantics(profile, schema);
    const comparison = buildComparison(profileWithSchema, input, aiInput, schema);
    return {
      profile: profileWithSchema,
      comparison,
      pipeline: buildPipeline(input, profileWithSchema, aiInput, schema, comparison)
    };
  }

  function buildProfile(
    entries: FolderLearningNameEntry[],
    externalWarnings: string[],
    preference: FolderLearningPreference | null,
    knownTargets: KnownTarget[]
  ): FolderLearningProfile {
    const analyzableEntries = entries.filter((entry) => entry.isFile);
    const parsed = analyzableEntries.map((entry) => parseName(entry.name)).filter(isParsedName);
    const ignoredCount = analyzableEntries.length - parsed.length;

    if (parsed.length === 0) {
      return {
        status: "none",
        analyzedFileCount: analyzableEntries.length,
        recognizedFileCount: 0,
        localPreference: preference ?? undefined,
        examples: [],
        reasons: uniqueStrings([
          "Aucun nom compatible détecté dans le dossier cible.",
          preference ? `Préférence locale confirmée ${preference.confirmedCount} fois.` : ""
        ]),
        warnings: uniqueStrings([
          ...externalWarnings,
          ignoredCount > 0 ? `${ignoredCount} fichier(s) ignoré(s) car non conformes.` : ""
        ])
      };
    }

    const dominantDatePrecision = datePrecision(parsed);
    const dominantBlockCount = dominantNumber(parsed.map((entry) => entry.blocks.length));
    const dominantBlocks = buildDominantBlocks(parsed, dominantBlockCount?.value ?? 0);
    const dominantTarget = dominantValue(parsed.map((entry) => entry.target).filter(Boolean));
    const dominantDocumentType = dominantValue(parsed.map((entry) => entry.documentType).filter(Boolean));
    const dominantIssuer = dominantValue(parsed.map((entry) => entry.issuer).filter(isString));
    const detailUsage = detailUsageFor(parsed);
    const targetBlockSignal = recognizeTargetBlocks(dominantBlocks, knownTargets);
    const coherence = coherenceScore({
      parsed,
      dominantDatePrecision,
      dominantTarget,
      dominantDocumentType,
      dominantIssuer,
      detailUsage
    });
    const status = statusFor(parsed.length, coherence.score);

    return {
      status,
      analyzedFileCount: analyzableEntries.length,
      recognizedFileCount: parsed.length,
      dominantPattern: dominantValue(parsed.map((entry) => entry.pattern))?.value,
      dominantBlockCount: dominantBlockCount?.value,
      dominantBlocks,
      dominantDatePrecision,
      dominantTarget: dominantTarget?.value,
      dominantDocumentType: dominantDocumentType?.value,
      dominantIssuer: dominantIssuer?.value,
      detailUsage,
      targetBlockRecognitions: targetBlockSignal.recognitions,
      targetBlockAmbiguities: targetBlockSignal.ambiguities,
      localPreference: preference ?? undefined,
      examples: parsed.slice(0, 3).map((entry) => entry.originalName),
      reasons: uniqueStrings([
        `${parsed.length} nom(s) compatible(s) détecté(s).`,
        dominantTarget ? `Cible dominante : ${dominantTarget.value}.` : "",
        dominantDocumentType ? `Type documentaire dominant : ${dominantDocumentType.value}.` : "",
        dominantIssuer ? `Émetteur dominant : ${dominantIssuer.value}.` : "",
        ...targetBlockSignal.recognitions.map((recognition) => recognition.reason),
        preference ? `Préférence locale confirmée ${preference.confirmedCount} fois.` : ""
      ]),
      warnings: uniqueStrings([
        ...externalWarnings,
        ignoredCount > 0 ? `${ignoredCount} fichier(s) ignoré(s) car non conformes.` : "",
        ...coherence.warnings,
        ...targetBlockSignal.ambiguities.map((ambiguity) => ambiguity.reason),
        parsed.length === 1 ? "Un seul nom reconnu : profil peu fiable." : ""
      ])
    };
  }

  function buildComparison(
    profile: FolderLearningProfile,
    input: FolderLearningSummaryInput,
    aiInput: AiInputFields | null,
    schema: SchemaAnalysis
  ): FolderLearningComparison | null {
    if (!aiInput) {
      return null;
    }

    const preferenceSignal = preferenceSignalFor(profile);
    const preferenceReasons = preferenceSignal.reasons;
    const preferenceWarnings = preferenceSignal.warnings;
    if (preferenceSignal.status === "contradictory") {
      return {
        aiName: input.aiName,
        recommendation: "manual-review",
        confidence: 35,
        appliedChanges: [],
        reasons: [
          "La préférence locale confirmée contredit les noms présents dans le dossier.",
          ...preferenceReasons
        ],
        warnings: preferenceWarnings
      };
    }

    if (profile.status === "none") {
      return {
        aiName: input.aiName,
        recommendation: "keep-ai",
        confidence: 40,
        appliedChanges: [],
        reasons: ["Aucun profil exploitable dans le dossier.", ...preferenceReasons],
        warnings: preferenceWarnings
      };
    }

    if (profile.dominantDatePrecision === "mixed") {
      return {
        aiName: input.aiName,
        recommendation: "manual-review",
        confidence: 40,
        appliedChanges: [],
        reasons: ["Précisions de date mélangées dans le dossier.", ...preferenceReasons],
        warnings: uniqueStrings(["Convention de date hétérogène : alignement non appliqué.", ...preferenceWarnings])
      };
    }

    if (schema.status !== "ready") {
      return {
        aiName: input.aiName,
        recommendation: "manual-review",
        confidence: schema.status === "ambiguous" ? 45 : 35,
        appliedChanges: [],
        reasons: schema.reasons.length
          ? [...schema.reasons, ...preferenceReasons]
          : ["Le schéma réel du dossier n'a pas pu être inféré.", ...preferenceReasons],
        warnings: uniqueStrings([...schema.warnings, schema.blockingReason ?? "", ...preferenceWarnings])
      };
    }

    const schemaDocumentType = schemaValue(profile, schema, "documentType");
    if (!schemaDocumentType || normalizeBlock(schemaDocumentType) !== aiInput.documentType) {
      return {
        aiName: input.aiName,
        detectedPattern: schema.pattern,
        recommendation: "manual-review",
        confidence: 45,
        appliedChanges: [],
        reasons: ["Type documentaire différent du profil dominant du dossier.", ...preferenceReasons],
        warnings: uniqueStrings([
          `Type documentaire dominant incompatible : ${schemaDocumentType || "absent"}.`,
          ...preferenceWarnings
        ])
      };
    }

    const aligned = { ...aiInput };
    const appliedChanges: string[] = [];
    const reasons: string[] = [];
    const warnings: string[] = [...schema.warnings, ...preferenceWarnings];

    const alignedDate = alignDatePrecision(aiInput.dateToken, profile.dominantDatePrecision);
    if (alignedDate !== aiInput.dateToken) {
      aligned.dateToken = alignedDate;
      appliedChanges.push("datePrecision");
      reasons.push("Précision de date alignée sur le dossier.");
    }

    const schemaTarget = schemaValue(profile, schema, "target");
    if (
      schema.fieldOrder.includes("target") &&
      schemaTarget &&
      normalizeBlock(schemaTarget) !== aiInput.target &&
      canApplySchemaField(profile, "target")
    ) {
      aligned.target = normalizeBlock(schemaTarget);
      appliedChanges.push("target");
      reasons.push("Cible alignée sur le dossier.");
    } else if (schemaTarget && normalizeBlock(schemaTarget) !== aiInput.target && !canApplySchemaField(profile, "target")) {
      warnings.push("Cible dominante hétérogène : alignement non appliqué.");
    }

    const schemaSubject = schemaValue(profile, schema, "subject");
    if (!schema.fieldOrder.includes("subject") && normalizeBlock(aiInput.subject)) {
      aligned.subject = "";
      appliedChanges.push("subject");
      reasons.push("Sujet supprimé car absent du schéma local.");
    } else if (schemaSubject && normalizeBlock(schemaSubject) !== normalizeBlock(aiInput.subject)) {
      aligned.subject = normalizeBlock(schemaSubject);
      appliedChanges.push("subject");
      reasons.push("Sujet aligné sur le dossier.");
    }

    const schemaIssuer = schemaValue(profile, schema, "issuer");
    if (!schema.fieldOrder.includes("issuer") && normalizeBlock(aiInput.issuer)) {
      aligned.issuer = "";
      appliedChanges.push("issuer");
      reasons.push("Émetteur supprimé car absent du schéma local.");
    } else if (
      schemaIssuer &&
      normalizeBlock(schemaIssuer) !== normalizeBlock(aiInput.issuer) &&
      canApplySchemaField(profile, "issuer")
    ) {
      aligned.issuer = normalizeBlock(schemaIssuer);
      appliedChanges.push("issuer");
      reasons.push("Émetteur aligné sur le dossier.");
    }

    if ((!schema.fieldOrder.includes("detail") || profile.detailUsage === "never") && normalizeBlock(aiInput.detail)) {
      aligned.detail = "";
      appliedChanges.push("detail");
      reasons.push("Détail supprimé car absent des noms existants.");
    }

    if (appliedChanges.length === 0) {
      const alignedName = buildName(aligned, schema, input.extension);
      return {
        aiName: input.aiName,
        ...(warnings.length > 0 ? {} : { alignedName }),
        detectedPattern: schema.pattern,
        recommendation: warnings.length > 0 || profile.status === "weak" ? "manual-review" : "keep-ai",
        confidence: warnings.length > 0 ? 50 : profile.status === "strong" ? 85 : profile.status === "medium" ? 65 : 45,
        appliedChanges,
        reasons: warnings.length > 0
          ? ["Profil hétérogène : validation manuelle recommandée."]
          : [
              profile.status === "weak"
                ? "Le nom IA est compatible avec la convention faible du dossier."
                : "Le nom IA est compatible avec la convention du dossier.",
              ...preferenceReasons
            ],
        warnings
      };
    }

    const alignedName = buildName(aligned, schema, input.extension);
    return applyPreferenceSignal({
      aiName: input.aiName,
      alignedName,
      detectedPattern: schema.pattern,
      recommendation: profile.status === "strong" ? "prefer-folder-profile" : "manual-review",
      confidence: profile.status === "strong" ? 85 : profile.status === "medium" ? 65 : 45,
      appliedChanges,
      reasons: [
        profile.status === "weak"
          ? "Profil faible : nom aligné proposé pour validation manuelle."
          : "",
        ...reasons,
        ...preferenceReasons
      ].filter(Boolean),
      warnings
    }, preferenceSignal);
  }

  function parseName(fileName: string): ParsedName | null {
    if (!fileName || /[\\/]/.test(fileName)) {
      return null;
    }

    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex <= 0) {
      return null;
    }

    const extension = fileName.slice(dotIndex).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return null;
    }

    const parts = fileName.slice(0, dotIndex).split("_");
    if (parts.length < 2 || parts.length > 6 || parts.some((part) => !BLOCK_PATTERN.test(part))) {
      return null;
    }

    const precision = precisionForDate(parts[0]);
    if (!precision) {
      return null;
    }

    const blocks = parts.slice(1);
    const semantic = defaultSemanticFromBlocks(blocks);
    return {
      originalName: fileName,
      dateToken: parts[0],
      datePrecision: precision,
      blocks,
      target: semantic.target,
      documentType: semantic.documentType,
      subject: semantic.subject,
      issuer: semantic.issuer,
      detail: semantic.detail,
      pattern: defaultPatternForBlockCount(blocks.length)
    };
  }

  function readAiInput(input: FolderLearningSummaryInput): AiInputFields | null {
    const fields = input.aiFields;
    if (fields) {
      const dateToken = normalizeDate(fields.dateToken);
      const target = normalizeBlock(fields.target);
      const documentType = normalizeBlock(fields.documentType);
      if (!dateToken || !target || !documentType) {
        return null;
      }

      return {
        dateToken,
        target,
        documentType,
        subject: normalizeOptionalBlock(fields.subject),
        issuer: normalizeOptionalBlock(fields.issuer),
        detail: normalizeOptionalBlock(fields.detail)
      };
    }

    const parsed = parseName(input.aiName);
    if (!parsed) {
      return null;
    }

    return {
      dateToken: parsed.dateToken,
      target: parsed.target,
      documentType: parsed.documentType,
      subject: parsed.subject ?? "",
      issuer: parsed.issuer ?? "",
      detail: parsed.detail ?? ""
    };
  }

  function analyzeSchema(profile: FolderLearningProfile, fields: AiInputFields): SchemaAnalysis {
    const blocks = (profile.dominantBlocks ?? []).map(normalizeBlock).filter(Boolean);
    const targetBlockAmbiguityWarnings = (profile.targetBlockAmbiguities ?? []).map((ambiguity) => ambiguity.reason);
    if (blocks.length === 0) {
      return blockedSchema("Aucun bloc dominant disponible.", targetBlockAmbiguityWarnings);
    }

    const values: Record<SchemaField, string> = {
      target: fields.target,
      documentType: fields.documentType,
      subject: fields.subject,
      issuer: fields.issuer,
      detail: fields.detail
    };
    const candidates = SCHEMA_FIELD_ORDERS
      .filter((schema) => schema.fields.length === blocks.length)
      .map((schema) => {
        const matches = schema.fields.filter((field, index) =>
          isCompatibleSchemaValue(blocks[index] ?? "", values[field]) ||
          isKnownTargetBlockMatch(profile, index, field)
        );
        return {
          ...schema,
          score: matches.length,
          matches
        };
      })
      .sort((left, right) => right.score - left.score || left.pattern.localeCompare(right.pattern));
    const best = candidates[0];
    if (!best || best.score === 0 || (best.fields.length > 1 && best.score < 2)) {
      return {
        status: "blocked",
        fieldOrder: [],
        confidence: 0,
        reasons: [],
        warnings: ["Schéma du dossier non reconnu à partir des champs IA.", ...targetBlockAmbiguityWarnings],
        blockingReason: "Correspondance insuffisante entre blocs et champs IA."
      };
    }

    const tied = candidates.filter((candidate) => candidate.score === best.score);
    if (tied.length > 1) {
      return {
        status: "ambiguous",
        fieldOrder: [],
        confidence: Math.round((best.score / best.fields.length) * 100),
        reasons: [`Schémas possibles : ${tied.map((candidate) => candidate.pattern).join(", ")}.`],
        warnings: ["Schéma du dossier ambigu : validation manuelle nécessaire.", ...targetBlockAmbiguityWarnings],
        blockingReason: "Plusieurs ordres de blocs sont plausibles."
      };
    }

    return {
      status: "ready",
      pattern: best.pattern,
      fieldOrder: best.fields,
      confidence: Math.round((best.score / best.fields.length) * 100),
      reasons: [`Schéma détecté : ${best.pattern}.`],
      warnings: best.score < best.fields.length
        ? ["Schéma détecté avec certains blocs alignés depuis le dossier."]
        : []
    };
  }

  function applySchemaSemantics(profile: FolderLearningProfile, schema: SchemaAnalysis): FolderLearningProfile {
    if (schema.status !== "ready" || !schema.pattern) {
      return profile;
    }

    const next: FolderLearningProfile = {
      ...profile,
      dominantPattern: schema.pattern
    };
    const target = schemaValue(profile, schema, "target");
    const documentType = schemaValue(profile, schema, "documentType");
    const issuer = schemaValue(profile, schema, "issuer");
    if (target) {
      next.dominantTarget = target;
    } else {
      delete next.dominantTarget;
    }
    if (documentType) {
      next.dominantDocumentType = documentType;
    } else {
      delete next.dominantDocumentType;
    }
    if (issuer) {
      next.dominantIssuer = issuer;
    } else {
      delete next.dominantIssuer;
    }
    return next;
  }

  function buildName(
    fields: AiInputFields,
    schema: SchemaAnalysis,
    extension: SupportedDocumentExtension
  ): string {
    const blocks = schema.fieldOrder
      .map((field) => normalizeOptionalBlock(fields[field]))
      .filter(Boolean);
    return [fields.dateToken, ...blocks].join("_") + extension;
  }

  function canApplySchemaField(profile: FolderLearningProfile, field: SchemaField): boolean {
    if (field === "target") {
      return !hasProfileWarning(profile, "cible");
    }
    if (field === "issuer") {
      return !hasProfileWarning(profile, "emetteur") && !hasProfileWarning(profile, "émetteur");
    }
    return true;
  }

  function isCompatibleSchemaValue(folderValue: string, aiValue: string): boolean {
    if (!folderValue || !aiValue) {
      return false;
    }
    return folderValue === aiValue || folderValue.startsWith(`${aiValue}-`) || aiValue.startsWith(`${folderValue}-`);
  }

  function isKnownTargetBlockMatch(
    profile: FolderLearningProfile,
    blockIndex: number,
    field: SchemaField
  ): boolean {
    return field === "target" &&
      (profile.targetBlockRecognitions ?? []).some((recognition) => recognition.position === blockIndex);
  }

  function recognizeTargetBlocks(
    blocks: string[],
    knownTargets: KnownTarget[]
  ): { recognitions: TargetBlockRecognition[]; ambiguities: TargetBlockAmbiguity[] } {
    const tokens = buildTargetTokens(knownTargets);
    const recognitions: TargetBlockRecognition[] = [];
    const ambiguities: TargetBlockAmbiguity[] = [];

    blocks.forEach((block, position) => {
      const normalizedBlock = normalizeBlock(block);
      if (!normalizedBlock) {
        return;
      }

      const matches = tokens
        .map((token) => matchTargetToken(normalizedBlock, token))
        .filter(isTargetTokenMatch)
        .sort((left, right) =>
          right.confidence - left.confidence ||
          left.token.target.fileAlias.localeCompare(right.token.target.fileAlias, "fr", { sensitivity: "base" })
        );
      if (matches.length === 0) {
        return;
      }

      const bestConfidence = matches[0]?.confidence ?? 0;
      const bestMatches = matches.filter((match) => match.confidence === bestConfidence);
      const distinctTargets = new Map(bestMatches.map((match) => [match.token.target.id, match]));
      if (distinctTargets.size > 1) {
        ambiguities.push({
          block,
          position,
          matchingFileAliases: Array.from(distinctTargets.values())
            .map((match) => match.token.target.fileAlias)
            .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" })),
          reason: `Bloc "${block}" ambigu : plusieurs cibles locales correspondent.`
        });
        return;
      }

      const best = bestMatches[0];
      if (!best) {
        return;
      }

      recognitions.push({
        block,
        position,
        field: "target",
        target: {
          id: best.token.target.id,
          displayName: best.token.target.displayName,
          fileAlias: best.token.target.fileAlias,
          kind: best.token.target.kind
        },
        matchType: best.matchType,
        confidence: best.confidence,
        reason: `Bloc "${block}" reconnu comme cible via ${labelForTargetMatch(best.matchType)} du référentiel.`
      });
    });

    return { recognitions, ambiguities };
  }

  function buildTargetTokens(knownTargets: KnownTarget[]): TargetToken[] {
    const tokens: TargetToken[] = [];
    const seen = new Set<string>();
    for (const target of knownTargets) {
      if (!target.isActive) {
        continue;
      }

      const displayName = normalizeBlock(target.displayName);
      if (displayName && !seen.has(`${target.id}:display:${displayName}`)) {
        seen.add(`${target.id}:display:${displayName}`);
        tokens.push({ value: target.displayName, normalized: displayName, matchType: "exact-display-name", target });
      }

      for (const value of [target.fileAlias, ...target.aliases]) {
        const normalized = normalizeBlock(value);
        if (!normalized || seen.has(`${target.id}:alias:${normalized}`)) {
          continue;
        }
        seen.add(`${target.id}:alias:${normalized}`);
        tokens.push({ value, normalized, matchType: "exact-alias", target });
      }
    }
    return tokens.sort((left, right) => right.normalized.length - left.normalized.length);
  }

  function matchTargetToken(
    normalizedBlock: string,
    token: TargetToken
  ): { token: TargetToken; matchType: TargetBlockRecognition["matchType"]; confidence: number } | null {
    if (normalizedBlock === token.normalized) {
      return {
        token,
        matchType: token.matchType,
        confidence: token.matchType === "exact-alias" ? 95 : 92
      };
    }

    if (isControlledPrefixMatch(normalizedBlock, token.normalized)) {
      return {
        token,
        matchType: "controlled-prefix",
        confidence: 75
      };
    }

    return null;
  }

  function isControlledPrefixMatch(left: string, right: string): boolean {
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    return shorter.length >= 3 &&
      !["doc", "pdf", "scan", "test", "file", "fichier", "document"].includes(shorter) &&
      longer.length > shorter.length &&
      longer.startsWith(`${shorter}-`);
  }

  function isTargetTokenMatch(
    value: { token: TargetToken; matchType: TargetBlockRecognition["matchType"]; confidence: number } | null
  ): value is { token: TargetToken; matchType: TargetBlockRecognition["matchType"]; confidence: number } {
    return value !== null;
  }

  function labelForTargetMatch(matchType: TargetBlockRecognition["matchType"]): string {
    if (matchType === "exact-display-name") {
      return "nom affiché";
    }
    if (matchType === "controlled-prefix") {
      return "préfixe contrôlé";
    }
    return "alias";
  }

  function hasProfileWarning(profile: FolderLearningProfile, signal: string): boolean {
    const normalizedSignal = normalizeBlock(signal);
    return profile.warnings.some((warning) => normalizeBlock(warning).includes(normalizedSignal));
  }

  function buildPipeline(
    input: FolderLearningSummaryInput,
    profile: FolderLearningProfile,
    aiInput: AiInputFields | null,
    schema: SchemaAnalysis,
    comparison: FolderLearningComparison | null
  ): FolderLearningPipelineStep[] {
    const aiVariables: Record<string, unknown> = aiInput
      ? {
          dateToken: aiInput.dateToken,
          target: aiInput.target,
          documentType: aiInput.documentType,
          subject: aiInput.subject,
          issuer: aiInput.issuer,
          detail: aiInput.detail
        }
      : {};

    return [
      {
        id: "content-ai-analysis",
        status: aiInput ? "ready" : "blocked",
        inputs: { aiName: input.aiName },
        variables: aiVariables,
        output: aiInput ? "Champs IA exploitables." : null,
        warnings: [],
        ...(aiInput ? {} : { blockingReason: "Analyse IA absente ou incomplète." })
      },
      {
        id: "folder-candidate",
        status: input.entries.length > 0 ? "ready" : "blocked",
        inputs: { targetFolder: input.targetFolder ?? "" },
        variables: { entryCount: input.entries.length },
        output: { truncated: false },
        warnings: input.warnings ?? [],
        ...(input.entries.length > 0 ? {} : { blockingReason: "Aucun nom de dossier cible à analyser." })
      },
      {
        id: "folder-name-scan",
        status: profile.recognizedFileCount > 0 ? "ready" : "blocked",
        inputs: { examples: profile.examples },
        variables: {
          status: profile.status,
          recognizedFileCount: profile.recognizedFileCount,
          dominantDatePrecision: profile.dominantDatePrecision,
          dominantBlocks: profile.dominantBlocks ?? [],
          localPreferenceConfirmedCount: profile.localPreference?.confirmedCount ?? 0
        },
        output: { dominantPattern: profile.dominantPattern ?? "" },
        warnings: profile.warnings,
        ...(profile.recognizedFileCount > 0 ? {} : { blockingReason: "Aucun nom compatible détecté." })
      },
      {
        id: "folder-schema-analysis",
        status: schema.status === "ready" ? "ready" : schema.status === "ambiguous" ? "warning" : "blocked",
        inputs: { dominantBlocks: profile.dominantBlocks ?? [] },
        variables: {
          detectedPattern: schema.pattern ?? "",
          fieldOrder: schema.fieldOrder,
          confidence: schema.confidence,
          targetBlockRecognitions: profile.targetBlockRecognitions ?? [],
          targetBlockAmbiguities: profile.targetBlockAmbiguities ?? []
        },
        output: schema.reasons,
        warnings: schema.warnings,
        ...(schema.blockingReason ? { blockingReason: schema.blockingReason } : {})
      },
      {
        id: "aligned-name-proposal",
        status: comparison?.alignedName ? "ready" : comparison?.recommendation === "manual-review" ? "warning" : "blocked",
        inputs: { aiName: comparison?.aiName ?? input.aiName },
        variables: {
          appliedChanges: comparison?.appliedChanges ?? [],
          confidence: comparison?.confidence ?? 0
        },
        output: {
          recommendation: comparison?.recommendation ?? "",
          alignedName: comparison?.alignedName ?? ""
        },
        warnings: comparison?.warnings ?? [],
        ...(comparison?.alignedName ? {} : { blockingReason: "Aucun nom aligné proposé." })
      }
    ];
  }

  function schemaValue(profile: FolderLearningProfile, schema: SchemaAnalysis, field: SchemaField): string {
    const index = schema.fieldOrder.indexOf(field);
    return index >= 0 ? profile.dominantBlocks?.[index] ?? "" : "";
  }

  function defaultSemanticFromBlocks(blocks: string[]): {
    target: string;
    documentType: string;
    subject?: string;
    issuer?: string;
    detail?: string;
  } {
    if (blocks.length === 1) {
      return {
        target: "",
        documentType: blocks[0] ?? ""
      };
    }

    const [target, documentType, third, fourth, fifth] = blocks;
    if (blocks.length === 5) {
      return {
        target: target ?? "",
        documentType: documentType ?? "",
        subject: third,
        issuer: fourth,
        detail: fifth
      };
    }

    return {
      target: target ?? "",
      documentType: documentType ?? "",
      issuer: third,
      detail: fourth
    };
  }

  function defaultPatternForBlockCount(count: number): string {
    if (count === 1) {
      return "DATE_DOCUMENT";
    }
    if (count === 3) {
      return "DATE_CIBLE_DOCUMENT_EMETTEUR";
    }
    if (count === 4) {
      return "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL";
    }
    if (count === 5) {
      return "DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR_DETAIL";
    }
    return "DATE_CIBLE_DOCUMENT";
  }

  function precisionForDate(value: string): ParsedDatePrecision | null {
    if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? "day" : null;
    }
    if (/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) {
      return "month";
    }
    if (/^(19|20)\d{2}$/.test(value)) {
      return "year";
    }
    if (isSchoolYearDate(value)) {
      return "school-year";
    }
    return null;
  }

  function normalizeDate(value: string): string {
    const trimmed = normalizeSchoolYearSeparator(value.trim());
    return precisionForDate(trimmed) ? trimmed : "";
  }

  function normalizeSchoolYearSeparator(value: string): string {
    const match = value.match(/^((?:19|20)\d{2})[/-]((?:19|20)\d{2})$/);
    return match ? `${match[1]}-${match[2]}` : value;
  }

  function isSchoolYearDate(value: string): boolean {
    const match = value.match(/^((?:19|20)\d{2})-((?:19|20)\d{2})$/);
    return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
  }

  function normalizeBlock(value: string | undefined): string {
    return (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeOptionalBlock(value: string | undefined): string {
    const normalized = normalizeBlock(value);
    return normalized === "aucun" ||
      normalized === "none" ||
      normalized === "neant" ||
      normalized === "n-a" ||
      normalized === "sans"
      ? ""
      : normalized;
  }

  function datePrecision(parsed: ParsedName[]): FolderLearningDatePrecision {
    const values = new Set(parsed.map((entry) => entry.datePrecision));
    return values.size === 1 ? parsed[0].datePrecision : "mixed";
  }

  function detailUsageFor(parsed: ParsedName[]): FolderLearningDetailUsage {
    const count = parsed.filter((entry) => Boolean(entry.detail)).length;
    if (count === 0) {
      return "never";
    }
    return count / parsed.length >= 0.6 ? "often" : "sometimes";
  }

  function buildDominantBlocks(parsed: ParsedName[], blockCount: number): string[] {
    const blocks: string[] = [];
    for (let index = 0; index < blockCount; index += 1) {
      blocks.push(dominantValue(parsed.map((entry) => entry.blocks[index]).filter(isString))?.value ?? "");
    }
    return blocks;
  }

  function coherenceScore(input: {
    parsed: ParsedName[];
    dominantDatePrecision: FolderLearningDatePrecision;
    dominantTarget: DominantValue | null;
    dominantDocumentType: DominantValue | null;
    dominantIssuer: DominantValue | null;
    detailUsage: FolderLearningDetailUsage;
  }): { score: number; warnings: string[] } {
    const warnings: string[] = [];
    let score = 0;
    if (input.dominantDatePrecision !== "mixed") {
      score += 1;
    } else {
      warnings.push("Précisions de date mélangées.");
    }
    score += dominantScore(input.dominantTarget, "Cible", warnings);
    score += dominantScore(input.dominantDocumentType, "Type documentaire", warnings);
    score += issuerScore(input.parsed, input.dominantIssuer, warnings);
    score += input.detailUsage === "sometimes" ? 0.5 : 1;
    if (input.detailUsage === "sometimes") {
      warnings.push("Usage du détail irrégulier.");
    }

    return { score: score / 5, warnings };
  }

  function dominantScore(value: DominantValue | null, label: string, warnings: string[]): number {
    if (!value) {
      warnings.push(`${label} non dominant.`);
      return 0;
    }
    if (value.ratio >= STRONG_RATIO) {
      return 1;
    }
    warnings.push(`${label} dominant mais hétérogène.`);
    return 0.5;
  }

  function issuerScore(parsed: ParsedName[], value: DominantValue | null, warnings: string[]): number {
    const issuerCount = parsed.filter((entry) => Boolean(entry.issuer)).length;
    if (issuerCount === 0) {
      return 1;
    }
    if (issuerCount < parsed.length) {
      warnings.push("Émetteur présent seulement sur une partie des noms.");
      return 0.5;
    }
    return dominantScore(value, "Émetteur", warnings);
  }

  function statusFor(count: number, coherence: number): FolderLearningProfileStatus {
    if (count === 0) {
      return "none";
    }
    if (count <= 3 || coherence < 0.5) {
      return "weak";
    }
    if (count >= 8) {
      return coherence >= 0.85 ? "strong" : "medium";
    }
    return coherence >= 0.7 ? "medium" : "weak";
  }

  function dominantValue(values: string[]): DominantValue | null {
    if (values.length === 0) {
      return null;
    }
    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((left, right) =>
      right[1] - left[1] || left[0].localeCompare(right[0], "fr", { sensitivity: "base" })
    );
    const best = sorted[0];
    if (!best) {
      return null;
    }
    const ratio = best[1] / values.length;
    return ratio >= DOMINANT_RATIO ? { value: best[0], count: best[1], ratio } : null;
  }

  function dominantNumber(values: number[]): { value: number; count: number; ratio: number } | null {
    if (values.length === 0) {
      return null;
    }
    const counts = new Map<number, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0] - right[0]);
    const best = sorted[0];
    if (!best) {
      return null;
    }
    const ratio = best[1] / values.length;
    return ratio >= DOMINANT_RATIO ? { value: best[0], count: best[1], ratio } : null;
  }

  function alignDatePrecision(dateToken: string, precision: FolderLearningDatePrecision | undefined): string {
    if (precision === "month" && /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateToken)) {
      return dateToken.slice(0, 7);
    }
    if (precision === "year" && /^(19|20)\d{2}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(dateToken)) {
      return dateToken.slice(0, 4);
    }
    return dateToken;
  }

  function applyPreferenceSignal(
    comparison: FolderLearningComparison,
    signal: { status: "none" | "coherent" | "contradictory"; confirmedCount: number; reasons: string[]; warnings: string[] }
  ): FolderLearningComparison {
    if (signal.status !== "coherent") {
      return comparison;
    }

    const reasons = uniqueStrings([...comparison.reasons, ...signal.reasons]);
    if (
      comparison.alignedName &&
      signal.confirmedCount >= 2 &&
      comparison.recommendation === "manual-review"
    ) {
      return {
        ...comparison,
        recommendation: "prefer-folder-profile",
        confidence: Math.max(comparison.confidence, 75),
        reasons: uniqueStrings(["Préférence locale confirmée : nom aligné renforcé.", ...reasons])
      };
    }

    return {
      ...comparison,
      reasons
    };
  }

  function preferenceSignalFor(profile: FolderLearningProfile): {
    status: "none" | "coherent" | "contradictory";
    confirmedCount: number;
    reasons: string[];
    warnings: string[];
  } {
    const preference = profile.localPreference;
    if (!preference) {
      return {
        status: "none",
        confirmedCount: 0,
        reasons: [],
        warnings: []
      };
    }

    const reasons = [`Préférence locale confirmée ${preference.confirmedCount} fois.`];
    if (profile.recognizedFileCount === 0) {
      return {
        status: "coherent",
        confirmedCount: preference.confirmedCount,
        reasons,
        warnings: []
      };
    }

    const conflicts = [
      profile.dominantDatePrecision &&
        profile.dominantDatePrecision !== "mixed" &&
        preference.preferredDatePrecision &&
        profile.dominantDatePrecision !== preference.preferredDatePrecision
        ? "précision de date"
        : "",
      profile.dominantTarget &&
        preference.preferredTarget &&
        normalizeBlock(profile.dominantTarget) !== normalizeBlock(preference.preferredTarget)
        ? "cible"
        : "",
      profile.dominantDocumentType &&
        preference.preferredDocumentType &&
        normalizeBlock(profile.dominantDocumentType) !== normalizeBlock(preference.preferredDocumentType)
        ? "type documentaire"
        : "",
      profile.dominantIssuer &&
        preference.preferredIssuer &&
        normalizeBlock(profile.dominantIssuer) !== normalizeBlock(preference.preferredIssuer)
        ? "émetteur"
        : "",
      profile.detailUsage &&
        preference.detailUsage &&
        profile.detailUsage !== preference.detailUsage &&
        profile.detailUsage !== "sometimes" &&
        preference.detailUsage !== "sometimes"
        ? "usage du détail"
        : ""
    ].filter(Boolean);

    if (conflicts.length > 0) {
      return {
        status: "contradictory",
        confirmedCount: preference.confirmedCount,
        reasons,
        warnings: [`Préférence locale contradictoire avec le dossier : ${conflicts.join(", ")}.`]
      };
    }

    return {
      status: "coherent",
      confirmedCount: preference.confirmedCount,
      reasons,
      warnings: []
    };
  }

  function blockedSchema(reason: string, warnings: string[] = []): SchemaAnalysis {
    return {
      status: "blocked",
      fieldOrder: [],
      confidence: 0,
      reasons: [],
      warnings,
      blockingReason: reason
    };
  }

  function isParsedName(value: ParsedName | null): value is ParsedName {
    return value !== null;
  }

  function isString(value: string | undefined): value is string {
    return typeof value === "string" && value.length > 0;
  }

  function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  DocSorterFolderLearningSummary = {
    buildAnalysis
  };
  globalThis.DocSorterFolderLearningSummary = DocSorterFolderLearningSummary;
})();
