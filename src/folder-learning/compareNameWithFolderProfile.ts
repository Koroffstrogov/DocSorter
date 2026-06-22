import {
  generateDocumentNameV2,
  normalizeNameBlock,
  type NamingInputV2
} from "../naming/documentNameV2";
import type { FolderNamingProfile } from "./folderNamingProfile";
import {
  parseFolderFileName,
  type FolderNamingPattern,
  type ParsedFolderFileName
} from "./parseFolderFileName";
import type { FolderLearningPreference } from "./folderLearningPreferences";

export type FolderProfileNameRecommendation = "keep-ai" | "prefer-folder-profile" | "manual-review";

export interface FolderProfileNameComparison {
  aiName: string;
  alignedName?: string;
  detectedPattern?: FolderNamingPattern;
  recommendation: FolderProfileNameRecommendation;
  confidence: number;
  appliedChanges: string[];
  reasons: string[];
  warnings: string[];
  pipeline?: FolderLearningPipelineStep[];
}

export interface FolderProfileNameFields {
  dateToken: string;
  target: string;
  documentType: string;
  subject?: string;
  issuer?: string;
  detail?: string;
}

export type FolderLearningPipelineStepId =
  | "content-ai-analysis"
  | "folder-candidate"
  | "folder-name-scan"
  | "folder-schema-analysis"
  | "aligned-name-proposal";

export interface FolderLearningPipelineStep {
  id: FolderLearningPipelineStepId;
  status: "ready" | "warning" | "blocked";
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  output: unknown;
  warnings: string[];
  blockingReason?: string;
}

export type CompareNameWithFolderProfileInput =
  (
    | {
        aiName: string;
        extension?: string;
        profile: FolderNamingProfile;
      }
    | {
        aiFields: FolderProfileNameFields;
        extension: string;
        profile: FolderNamingProfile;
      }
  ) & {
    preference?: FolderLearningPreference | null;
  };

interface ResolvedAiName {
  aiName: string;
  input: NamingInputV2 | null;
  warnings: string[];
}

interface FolderSchemaAnalysis {
  status: "ready" | "ambiguous" | "blocked";
  pattern?: FolderNamingPattern;
  fieldOrder: FolderSchemaField[];
  confidence: number;
  reasons: string[];
  warnings: string[];
  blockingReason?: string;
}

interface PreferenceSignal {
  status: "none" | "coherent" | "contradictory";
  confirmedCount: number;
  reasons: string[];
  warnings: string[];
}

type FolderSchemaField = "target" | "documentType" | "subject" | "issuer" | "detail";

const SCHEMA_FIELD_ORDERS: Array<{ pattern: FolderNamingPattern; fields: FolderSchemaField[] }> = [
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

export function compareNameWithFolderProfile(
  input: CompareNameWithFolderProfileInput
): FolderProfileNameComparison {
  const profile = input.profile;
  const resolved = resolveAiName(input);
  const preferenceSignal = analyzePreferenceSignal(profile, input.preference ?? null);
  const reasons: string[] = [...preferenceSignal.reasons];
  const warnings = [...resolved.warnings, ...preferenceSignal.warnings];

  if (profile.status === "none") {
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "keep-ai",
      confidence: 40,
      appliedChanges: [],
      reasons: ["Aucun profil de nommage exploitable dans le dossier."],
      warnings
    };
    comparison.pipeline = createPipeline(profile, resolved, null, comparison);
    return {
      ...comparison
    };
  }

  if (!resolved.input) {
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 20,
      appliedChanges: [],
      reasons: ["Le nom IA final ne respecte pas la convention attendue."],
      warnings
    };
    comparison.pipeline = createPipeline(profile, resolved, null, comparison);
    return {
      ...comparison
    };
  }

  if (preferenceSignal.status === "contradictory") {
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 35,
      appliedChanges: [],
      reasons: [
        "La préférence locale confirmée contredit les noms présents dans le dossier.",
        ...preferenceSignal.reasons
      ],
      warnings
    };
    comparison.pipeline = createPipeline(profile, resolved, null, comparison);
    return comparison;
  }

  const schema = analyzeFolderSchema(profile, resolved.input);

  if (profile.dominantDatePrecision === "mixed") {
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 40,
      appliedChanges: [],
      reasons: ["Le profil contient plusieurs précisions de date."],
      warnings: [...warnings, "Convention de date hétérogène : alignement non appliqué."]
    };
    comparison.pipeline = createPipeline(profile, resolved, schema, comparison);
    return comparison;
  }

  if (schema.status !== "ready") {
    const compatibilityWarning = profile.dominantDocumentType &&
      normalizeNameBlock(profile.dominantDocumentType) !== normalizeNameBlock(resolved.input.documentType)
      ? `Type dominant du dossier différent : ${profile.dominantDocumentType}.`
      : "";
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: schema.status === "ambiguous" ? 45 : 35,
      appliedChanges: [],
      reasons: schema.reasons.length
        ? schema.reasons
        : ["Le schéma réel du dossier n'a pas pu être inféré de façon fiable."],
      warnings: [...warnings, ...schema.warnings, compatibilityWarning, schema.blockingReason ?? ""].filter(Boolean)
    };
    comparison.pipeline = createPipeline(profile, resolved, schema, comparison);
    return comparison;
  }

  const documentTypeCheck = checkDocumentTypeCompatibility(resolved.input, profile, schema);
  if (!documentTypeCheck.compatible) {
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 45,
      appliedChanges: [],
      reasons: ["Le type documentaire IA diffère du type dominant du dossier."],
      warnings: [...warnings, documentTypeCheck.warning]
    };
    comparison.pipeline = createPipeline(profile, resolved, schema, comparison);
    return comparison;
  }

  const alignment = buildAlignedInput(resolved.input, profile, schema);
  warnings.push(...alignment.warnings);
  reasons.push(...alignment.reasons);

  if (alignment.appliedChanges.length === 0) {
    const needsManualReview = alignment.warnings.some((warning) => warning.includes("alignement non appliqué"));
    const generated = generateAlignedName(alignment.input, schema);
    warnings.push(...generated.warnings);
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      ...(!needsManualReview && generated.filename ? { alignedName: generated.filename } : {}),
      detectedPattern: schema.pattern,
      recommendation: needsManualReview || profile.status === "weak" ? "manual-review" : "keep-ai",
      confidence: needsManualReview ? 50 : profile.status === "strong" ? 85 : profile.status === "medium" ? 65 : 45,
      appliedChanges: [],
      reasons: [
        needsManualReview
          ? "Le profil contient une dominante hétérogène : validation manuelle recommandée."
          : profile.status === "weak"
          ? "Le nom IA est déjà compatible avec le profil faible du dossier."
          : "Le nom IA est déjà compatible avec le profil du dossier.",
        ...reasons
      ],
      warnings
    };
    comparison.pipeline = createPipeline(profile, resolved, schema, comparison);
    return comparison;
  }

  const generated = generateAlignedName(alignment.input, schema);
  warnings.push(...generated.warnings);

  if (!generated.filename) {
    const comparison: FolderProfileNameComparison = {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 30,
      appliedChanges: alignment.appliedChanges,
      reasons: ["Un alignement a été tenté mais le nom généré n'est pas valide."],
      warnings
    };
    comparison.pipeline = createPipeline(profile, resolved, schema, comparison);
    return comparison;
  }

  const comparison = applyPreferenceSignal({
    aiName: resolved.aiName,
    alignedName: generated.filename,
    detectedPattern: schema.pattern,
    recommendation: profile.status === "strong" ? "prefer-folder-profile" : "manual-review",
    confidence: profile.status === "strong" ? 85 : profile.status === "medium" ? 65 : 45,
    appliedChanges: alignment.appliedChanges,
    reasons: [
      profile.status === "strong"
        ? "Profil fort : la convention du dossier est recommandée."
        : profile.status === "medium"
        ? "Profil moyen : un nom aligné est proposé pour validation."
        : "Profil faible : un nom aligné est proposé pour validation manuelle.",
      ...reasons
    ],
    warnings
  }, preferenceSignal);
  comparison.pipeline = createPipeline(profile, resolved, schema, comparison);
  return comparison;
}

function applyPreferenceSignal(
  comparison: FolderProfileNameComparison,
  preference: PreferenceSignal
): FolderProfileNameComparison {
  if (preference.status !== "coherent") {
    return comparison;
  }

  const reasons = Array.from(new Set([...comparison.reasons, ...preference.reasons]));
  if (
    comparison.alignedName &&
    preference.confirmedCount >= 2 &&
    comparison.recommendation === "manual-review"
  ) {
    return {
      ...comparison,
      recommendation: "prefer-folder-profile",
      confidence: Math.max(comparison.confidence, 75),
      reasons: Array.from(new Set(["Préférence locale confirmée : nom aligné renforcé.", ...reasons]))
    };
  }

  return {
    ...comparison,
    reasons
  };
}

function analyzePreferenceSignal(
  profile: FolderNamingProfile,
  preference: FolderLearningPreference | null
): PreferenceSignal {
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
      normalizeNameBlock(profile.dominantTarget) !== normalizeNameBlock(preference.preferredTarget)
      ? "cible"
      : "",
    profile.dominantDocumentType &&
      preference.preferredDocumentType &&
      normalizeNameBlock(profile.dominantDocumentType) !== normalizeNameBlock(preference.preferredDocumentType)
      ? "type documentaire"
      : "",
    profile.dominantIssuer &&
      preference.preferredIssuer &&
      normalizeNameBlock(profile.dominantIssuer) !== normalizeNameBlock(preference.preferredIssuer)
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

function resolveAiName(input: CompareNameWithFolderProfileInput): ResolvedAiName {
  if ("aiFields" in input) {
    const generated = generateDocumentNameV2({
      ...input.aiFields,
      extension: input.extension
    });
    return {
      aiName: generated.filename,
      input: generated.isValid ? generated.normalizedInput : null,
      warnings: generated.messages
        .filter((message) => message.level !== "info")
        .map((message) => message.message)
    };
  }

  const parsed = parseFolderFileName(input.aiName);
  if (!parsed) {
    return {
      aiName: input.aiName,
      input: null,
      warnings: ["Nom IA non compatible avec la convention DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext."]
    };
  }

  return {
    aiName: input.aiName,
    input: namingInputFromParsedName(parsed, input.extension),
    warnings: []
  };
}

function namingInputFromParsedName(parsed: ParsedFolderFileName, extensionOverride: string | undefined): NamingInputV2 {
  return {
    dateToken: parsed.dateToken,
    target: parsed.target,
    documentType: parsed.documentType,
    ...(parsed.subject ? { subject: parsed.subject } : {}),
    ...(parsed.issuer ? { issuer: parsed.issuer } : {}),
    ...(parsed.detail ? { detail: parsed.detail } : {}),
    extension: extensionOverride ?? parsed.extension
  };
}

function checkDocumentTypeCompatibility(
  input: NamingInputV2,
  profile: FolderNamingProfile,
  schema: FolderSchemaAnalysis
): { compatible: true } | { compatible: false; warning: string } {
  const schemaDocumentType = valueForSchemaField(profile, schema, "documentType");
  if (!schemaDocumentType) {
    return {
      compatible: false,
      warning: "Aucun type documentaire dominant : alignement non appliqué."
    };
  }

  if (normalizeNameBlock(schemaDocumentType) !== normalizeNameBlock(input.documentType)) {
    return {
      compatible: false,
      warning: `Type dominant du dossier différent : ${schemaDocumentType}.`
    };
  }

  return { compatible: true };
}

function buildAlignedInput(
  input: NamingInputV2,
  profile: FolderNamingProfile,
  schema: FolderSchemaAnalysis
): {
  input: NamingInputV2;
  appliedChanges: string[];
  reasons: string[];
  warnings: string[];
} {
  const aligned: NamingInputV2 = { ...input };
  const appliedChanges: string[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  const dateToken = alignDatePrecision(input.dateToken, profile.dominantDatePrecision);
  if (dateToken !== input.dateToken) {
    aligned.dateToken = dateToken;
    appliedChanges.push("datePrecision");
    reasons.push("Précision de date alignée sur les noms existants du dossier.");
  } else if (profile.dominantDatePrecision === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateToken)) {
    warnings.push("Impossible d'augmenter la précision de date sans inventer de jour.");
  }

  const schemaTarget = valueForSchemaField(profile, schema, "target");
  if (schema.fieldOrder.includes("target") && schemaTarget && canApplySchemaField(profile, schema, "target")) {
    const target = normalizeNameBlock(schemaTarget);
    if (target && target !== normalizeNameBlock(input.target)) {
      aligned.target = target;
      appliedChanges.push("target");
      reasons.push("Cible alignée sur la cible dominante du dossier.");
    }
  } else if (schemaTarget && normalizeNameBlock(schemaTarget) !== normalizeNameBlock(input.target)) {
    warnings.push("Cible dominante hétérogène : alignement non appliqué.");
  }

  if (!schema.fieldOrder.includes("subject") && normalizeNameBlock(input.subject)) {
    aligned.subject = undefined;
    appliedChanges.push("subject");
    reasons.push("Sujet supprimé car le schéma local n'utilise pas ce bloc.");
  } else if (
    schema.fieldOrder.includes("subject") &&
    valueForSchemaField(profile, schema, "subject")
  ) {
    const subject = normalizeNameBlock(valueForSchemaField(profile, schema, "subject"));
    if (subject && subject !== normalizeNameBlock(input.subject)) {
      aligned.subject = subject;
      appliedChanges.push("subject");
      reasons.push("Sujet aligné sur le sujet dominant du dossier.");
    }
  }

  if (!schema.fieldOrder.includes("issuer") && normalizeNameBlock(input.issuer)) {
    aligned.issuer = undefined;
    appliedChanges.push("issuer");
    reasons.push("Émetteur supprimé car le schéma local n'utilise pas ce bloc.");
  } else if (
    schema.fieldOrder.includes("issuer") &&
    valueForSchemaField(profile, schema, "issuer") &&
    canApplySchemaField(profile, schema, "issuer")
  ) {
    const issuer = normalizeNameBlock(valueForSchemaField(profile, schema, "issuer"));
    if (issuer && issuer !== normalizeNameBlock(input.issuer)) {
      aligned.issuer = issuer;
      appliedChanges.push("issuer");
      reasons.push("Émetteur aligné sur l'émetteur dominant du dossier.");
    }
  }

  if ((!schema.fieldOrder.includes("detail") || profile.detailUsage === "never") && normalizeNameBlock(input.detail)) {
    aligned.detail = undefined;
    appliedChanges.push("detail");
    reasons.push("Détail supprimé car les noms existants du dossier n'utilisent pas ce bloc.");
  }

  if (profile.detailUsage === "sometimes" && normalizeNameBlock(input.detail)) {
    warnings.push("Usage du détail irrégulier dans le dossier : validation manuelle recommandée.");
  }

  return {
    input: aligned,
    appliedChanges,
    reasons,
    warnings
  };
}

function analyzeFolderSchema(profile: FolderNamingProfile, input: NamingInputV2): FolderSchemaAnalysis {
  const blocks = (profile.dominantBlocks ?? []).map((block) => normalizeNameBlock(block)).filter(Boolean);
  const targetBlockAmbiguityWarnings = (profile.targetBlockAmbiguities ?? []).map((ambiguity) => ambiguity.reason);
  if (blocks.length === 0) {
    return {
      status: "blocked",
      fieldOrder: [],
      confidence: 0,
      reasons: [],
      warnings: targetBlockAmbiguityWarnings,
      blockingReason: "Aucun bloc dominant disponible pour inférer le schéma du dossier."
    };
  }

  const fieldValues: Record<FolderSchemaField, string> = {
    target: normalizeNameBlock(input.target),
    documentType: normalizeNameBlock(input.documentType),
    subject: normalizeNameBlock(input.subject),
    issuer: normalizeNameBlock(input.issuer),
    detail: normalizeNameBlock(input.detail)
  };
  const compatible = SCHEMA_FIELD_ORDERS
    .filter((schema) => schema.fields.length === blocks.length)
    .map((schema) => {
      const matchedFields = schema.fields.filter((field, index) =>
        isCompatibleSchemaValue(blocks[index] ?? "", fieldValues[field]) ||
        isKnownTargetBlockMatch(profile, index, field)
      );
      return {
        ...schema,
        score: matchedFields.length,
        matchedFields
      };
    })
    .sort((left, right) => right.score - left.score || left.pattern.localeCompare(right.pattern));
  const best = compatible[0];
  if (!best || best.score === 0 || (best.fields.length > 1 && best.score < 2)) {
    return {
      status: "blocked",
      fieldOrder: [],
      confidence: 0,
      reasons: [],
      warnings: [
        "Schéma du dossier non reconnu à partir des champs IA courants.",
        ...targetBlockAmbiguityWarnings
      ],
      blockingReason: "Correspondance insuffisante entre les blocs du dossier et les champs IA."
    };
  }

  const tied = compatible.filter((schema) => schema.score === best.score);
  if (tied.length > 1) {
    return {
      status: "ambiguous",
      fieldOrder: [],
      confidence: Math.round((best.score / best.fields.length) * 100),
      reasons: [`Schémas possibles : ${tied.map((schema) => schema.pattern).join(", ")}.`],
      warnings: [
        "Schéma du dossier ambigu : validation manuelle nécessaire.",
        ...targetBlockAmbiguityWarnings
      ],
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
      ? ["Schéma détecté avec certains blocs alignés depuis la dominante du dossier."]
      : []
  };
}

function valueForSchemaField(
  profile: FolderNamingProfile,
  schema: FolderSchemaAnalysis,
  field: FolderSchemaField
): string {
  const index = schema.fieldOrder.indexOf(field);
  return index >= 0 ? profile.dominantBlocks?.[index] ?? "" : "";
}

function canApplySchemaField(
  profile: FolderNamingProfile,
  schema: FolderSchemaAnalysis,
  field: FolderSchemaField
): boolean {
  const index = schema.fieldOrder.indexOf(field);
  if (index < 0 || !profile.dominantBlocks?.[index]) {
    return false;
  }

  if (field === "target") {
    return !hasProfileWarning(profile, "cible");
  }

  if (field === "issuer") {
    return !hasProfileWarning(profile, "émetteur");
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
  profile: FolderNamingProfile,
  blockIndex: number,
  field: FolderSchemaField
): boolean {
  return field === "target" &&
    (profile.targetBlockRecognitions ?? []).some((recognition) => recognition.position === blockIndex);
}

function generateAlignedName(
  input: NamingInputV2,
  schema: FolderSchemaAnalysis
): { filename?: string; warnings: string[] } {
  if (!schema.pattern || schema.fieldOrder.length === 0) {
    return { warnings: ["Schéma local absent : nom aligné non généré."] };
  }

  const dateToken = input.dateToken.trim();
  const extension = input.extension.startsWith(".") ? input.extension : `.${input.extension}`;
  const blocks = schema.fieldOrder.map((field) => normalizeNameBlock(input[field])).filter(Boolean);
  if (!dateToken || blocks.length !== schema.fieldOrder.length || !/^\.[a-z0-9]+$/.test(extension)) {
    return { warnings: ["Nom aligné incomplet après application du schéma local."] };
  }

  return {
    filename: [dateToken, ...blocks].join("_") + extension.toLowerCase(),
    warnings: []
  };
}

function createPipeline(
  profile: FolderNamingProfile,
  resolved: ResolvedAiName,
  schema: FolderSchemaAnalysis | null,
  comparison: FolderProfileNameComparison
): FolderLearningPipelineStep[] {
  const aiVariables = resolved.input
    ? {
        dateToken: resolved.input.dateToken,
        target: resolved.input.target,
        documentType: resolved.input.documentType,
        subject: resolved.input.subject ?? "",
        issuer: resolved.input.issuer ?? "",
        detail: resolved.input.detail ?? ""
      }
    : {};

  return [
    {
      id: "content-ai-analysis",
      status: resolved.input ? "ready" : "blocked",
      inputs: { aiName: resolved.aiName },
      variables: aiVariables,
      output: resolved.input ? "Champs IA exploitables." : null,
      warnings: resolved.warnings,
      ...(resolved.input ? {} : { blockingReason: "Nom ou champs IA incomplets." })
    },
    {
      id: "folder-candidate",
      status: profile.analyzedFileCount > 0 ? "ready" : "blocked",
      inputs: { analyzedFileCount: profile.analyzedFileCount },
      variables: { recognizedFileCount: profile.recognizedFileCount },
      output: profile.examples,
      warnings: [],
      ...(profile.analyzedFileCount > 0 ? {} : { blockingReason: "Aucun nom de fichier fourni." })
    },
    {
      id: "folder-name-scan",
      status: profile.recognizedFileCount > 0 ? "ready" : "blocked",
      inputs: { examples: profile.examples },
      variables: {
        status: profile.status,
        dominantDatePrecision: profile.dominantDatePrecision,
        dominantBlocks: profile.dominantBlocks ?? [],
        localPreferenceSignal: comparison.reasons.find((reason) =>
          reason.includes("Préférence locale confirmée")
        )
          ? comparison.reasons.find((reason) => reason.includes("Préférence locale confirmée"))
          : ""
      },
      output: {
        recognizedFileCount: profile.recognizedFileCount,
        dominantPattern: profile.dominantPattern
      },
      warnings: profile.warnings,
      ...(profile.recognizedFileCount > 0 ? {} : { blockingReason: "Aucun nom compatible détecté." })
    },
    {
      id: "folder-schema-analysis",
      status: schema?.status === "ready" ? "ready" : schema?.status === "ambiguous" ? "warning" : "blocked",
      inputs: { dominantBlocks: profile.dominantBlocks ?? [] },
      variables: {
        detectedPattern: schema?.pattern ?? "",
        fieldOrder: schema?.fieldOrder ?? [],
        confidence: schema?.confidence ?? 0,
        targetBlockRecognitions: profile.targetBlockRecognitions ?? [],
        targetBlockAmbiguities: profile.targetBlockAmbiguities ?? []
      },
      output: schema?.reasons ?? [],
      warnings: schema?.warnings ?? [],
      ...(schema?.blockingReason ? { blockingReason: schema.blockingReason } : {})
    },
    {
      id: "aligned-name-proposal",
      status: comparison.alignedName ? "ready" : comparison.recommendation === "manual-review" ? "warning" : "blocked",
      inputs: { aiName: comparison.aiName, detectedPattern: comparison.detectedPattern ?? "" },
      variables: {
        appliedChanges: comparison.appliedChanges,
        confidence: comparison.confidence
      },
      output: {
        recommendation: comparison.recommendation,
        alignedName: comparison.alignedName ?? ""
      },
      warnings: comparison.warnings,
      ...(comparison.alignedName ? {} : { blockingReason: "Aucun nom aligné applicable automatiquement." })
    }
  ];
}

function alignDatePrecision(
  dateToken: string,
  precision: FolderNamingProfile["dominantDatePrecision"]
): string {
  if (precision === "month" && /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateToken)) {
    return dateToken.slice(0, 7);
  }

  if (precision === "year" && /^(19|20)\d{2}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(dateToken)) {
    return dateToken.slice(0, 4);
  }

  return dateToken;
}

function canApplyDominantTarget(profile: FolderNamingProfile): boolean {
  return !hasProfileWarning(profile, "cible");
}

function canApplyDominantIssuer(profile: FolderNamingProfile): boolean {
  return !hasProfileWarning(profile, "émetteur");
}

function hasProfileWarning(profile: FolderNamingProfile, signal: string): boolean {
  const normalizedSignal = normalizeNameBlock(signal);
  return profile.warnings.some((warning) => normalizeNameBlock(warning).includes(normalizedSignal));
}
