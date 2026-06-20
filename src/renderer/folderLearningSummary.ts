interface FolderLearningSummaryInput {
  entries: FolderLearningNameEntry[];
  aiName: string;
  aiFields: AiSelectionFields | null;
  extension: SupportedDocumentExtension;
  warnings?: string[];
}

interface FolderLearningSummaryApi {
  buildAnalysis: (input: FolderLearningSummaryInput) => FolderLearningAnalysis;
}

interface Window {
  DocSorterFolderLearningSummary: FolderLearningSummaryApi;
}

var DocSorterFolderLearningSummary: FolderLearningSummaryApi;

(() => {
  const SUPPORTED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
  const BLOCK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const DOMINANT_RATIO = 0.6;
  const STRONG_RATIO = 0.8;

  interface ParsedName {
    originalName: string;
    dateToken: string;
    datePrecision: "day" | "month" | "year";
    target: string;
    documentType: string;
    issuer?: string;
    detail?: string;
    pattern: string;
  }

  interface DominantValue {
    value: string;
    count: number;
    ratio: number;
  }

  function buildAnalysis(input: FolderLearningSummaryInput): FolderLearningAnalysis {
    const profile = buildProfile(input.entries, input.warnings ?? []);
    const comparison = buildComparison(profile, input);
    return {
      profile,
      comparison
    };
  }

  function buildProfile(entries: FolderLearningNameEntry[], externalWarnings: string[]): FolderLearningProfile {
    const analyzableEntries = entries.filter((entry) => entry.isFile);
    const parsed = analyzableEntries.map((entry) => parseName(entry.name)).filter(isParsedName);
    const ignoredCount = analyzableEntries.length - parsed.length;

    if (parsed.length === 0) {
      return {
        status: "none",
        analyzedFileCount: analyzableEntries.length,
        recognizedFileCount: 0,
        examples: [],
        reasons: ["Aucun nom compatible détecté dans le dossier cible."],
        warnings: uniqueStrings([
          ...externalWarnings,
          ignoredCount > 0 ? `${ignoredCount} fichier(s) ignoré(s) car non conformes.` : ""
        ])
      };
    }

    const dominantDatePrecision = datePrecision(parsed);
    const dominantTarget = dominantValue(parsed.map((entry) => entry.target));
    const dominantDocumentType = dominantValue(parsed.map((entry) => entry.documentType));
    const dominantIssuer = dominantValue(parsed.map((entry) => entry.issuer).filter(isString));
    const detailUsage = detailUsageFor(parsed);
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
      dominantDatePrecision,
      dominantTarget: dominantTarget?.value,
      dominantDocumentType: dominantDocumentType?.value,
      dominantIssuer: dominantIssuer?.value,
      detailUsage,
      examples: parsed.slice(0, 3).map((entry) => entry.originalName),
      reasons: uniqueStrings([
        `${parsed.length} nom(s) compatible(s) détecté(s).`,
        dominantTarget ? `Cible dominante : ${dominantTarget.value}.` : "",
        dominantDocumentType ? `Type documentaire dominant : ${dominantDocumentType.value}.` : "",
        dominantIssuer ? `Émetteur dominant : ${dominantIssuer.value}.` : ""
      ]),
      warnings: uniqueStrings([
        ...externalWarnings,
        ignoredCount > 0 ? `${ignoredCount} fichier(s) ignoré(s) car non conformes.` : "",
        ...coherence.warnings,
        parsed.length === 1 ? "Un seul nom reconnu : profil peu fiable." : ""
      ])
    };
  }

  function buildComparison(
    profile: FolderLearningProfile,
    input: FolderLearningSummaryInput
  ): FolderLearningComparison | null {
    const aiInput = readAiInput(input);
    if (!aiInput) {
      return null;
    }

    if (profile.status === "none") {
      return {
        aiName: input.aiName,
        recommendation: "keep-ai",
        confidence: 40,
        appliedChanges: [],
        reasons: ["Aucun profil exploitable dans le dossier."],
        warnings: []
      };
    }

    if (profile.status === "weak") {
      return {
        aiName: input.aiName,
        recommendation: hasNotableDivergence(aiInput, profile) ? "manual-review" : "keep-ai",
        confidence: 35,
        appliedChanges: [],
        reasons: ["Profil faible : aucun alignement automatique proposé."],
        warnings: ["Profil trop faible pour proposer un nom aligné."]
      };
    }

    if (profile.dominantDatePrecision === "mixed") {
      return {
        aiName: input.aiName,
        recommendation: "manual-review",
        confidence: 40,
        appliedChanges: [],
        reasons: ["Précisions de date mélangées dans le dossier."],
        warnings: ["Convention de date hétérogène : alignement non appliqué."]
      };
    }

    if (!profile.dominantDocumentType || normalizeBlock(profile.dominantDocumentType) !== aiInput.documentType) {
      return {
        aiName: input.aiName,
        recommendation: "manual-review",
        confidence: 45,
        appliedChanges: [],
        reasons: ["Type documentaire différent du profil dominant du dossier."],
        warnings: ["Type documentaire dominant incompatible : alignement non appliqué."]
      };
    }

    const aligned = { ...aiInput };
    const appliedChanges: string[] = [];
    const reasons: string[] = [];
    const warnings: string[] = [];

    const alignedDate = alignDatePrecision(aiInput.dateToken, profile.dominantDatePrecision);
    if (alignedDate !== aiInput.dateToken) {
      aligned.dateToken = alignedDate;
      appliedChanges.push("datePrecision");
      reasons.push("Précision de date alignée sur le dossier.");
    }

    if (canUseDominant(profile, "cible") && profile.dominantTarget && normalizeBlock(profile.dominantTarget) !== aiInput.target) {
      aligned.target = normalizeBlock(profile.dominantTarget);
      appliedChanges.push("target");
      reasons.push("Cible alignée sur le dossier.");
    } else if (profile.dominantTarget && normalizeBlock(profile.dominantTarget) !== aiInput.target) {
      warnings.push("Cible dominante hétérogène : alignement non appliqué.");
    }

    if (canUseDominant(profile, "emetteur") && profile.dominantIssuer && normalizeBlock(profile.dominantIssuer) !== normalizeBlock(aiInput.issuer)) {
      aligned.issuer = normalizeBlock(profile.dominantIssuer);
      appliedChanges.push("issuer");
      reasons.push("Émetteur aligné sur le dossier.");
    } else if (profile.dominantIssuer && normalizeBlock(profile.dominantIssuer) !== normalizeBlock(aiInput.issuer)) {
      warnings.push("Émetteur dominant hétérogène : alignement non appliqué.");
    }

    if (profile.detailUsage === "never" && normalizeBlock(aiInput.detail)) {
      aligned.detail = "";
      appliedChanges.push("detail");
      reasons.push("Détail supprimé car absent des noms existants.");
    }

    if (appliedChanges.length === 0) {
      return {
        aiName: input.aiName,
        recommendation: warnings.length > 0 ? "manual-review" : "keep-ai",
        confidence: warnings.length > 0 ? 50 : profile.status === "strong" ? 85 : 65,
        appliedChanges,
        reasons: warnings.length > 0
          ? ["Profil hétérogène : validation manuelle recommandée."]
          : ["Le nom IA est compatible avec la convention du dossier."],
        warnings
      };
    }

    return {
      aiName: input.aiName,
      alignedName: buildName(aligned, input.extension),
      recommendation: profile.status === "strong" ? "prefer-folder-profile" : "manual-review",
      confidence: profile.status === "strong" ? 85 : 65,
      appliedChanges,
      reasons,
      warnings
    };
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
    if (parts.length < 3 || parts.length > 5 || parts.some((part) => !BLOCK_PATTERN.test(part))) {
      return null;
    }

    const precision = precisionForDate(parts[0]);
    if (!precision) {
      return null;
    }

    return {
      originalName: fileName,
      dateToken: parts[0],
      datePrecision: precision,
      target: parts[1],
      documentType: parts[2],
      issuer: parts[3],
      detail: parts[4],
      pattern: parts.length === 5
        ? "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL"
        : parts.length === 4
          ? "DATE_CIBLE_DOCUMENT_EMETTEUR"
          : "DATE_CIBLE_DOCUMENT"
    };
  }

  function readAiInput(input: FolderLearningSummaryInput): {
    dateToken: string;
    target: string;
    documentType: string;
    issuer: string;
    detail: string;
  } | null {
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
      issuer: parsed.issuer ?? "",
      detail: parsed.detail ?? ""
    };
  }

  function buildName(
    fields: {
      dateToken: string;
      target: string;
      documentType: string;
      issuer: string;
      detail: string;
    },
    extension: SupportedDocumentExtension
  ): string {
    return [
      fields.dateToken,
      fields.target,
      fields.documentType,
      normalizeOptionalBlock(fields.issuer),
      normalizeOptionalBlock(fields.detail)
    ].filter(Boolean).join("_") + extension;
  }

  function precisionForDate(value: string): "day" | "month" | "year" | null {
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
    return null;
  }

  function normalizeDate(value: string): string {
    const trimmed = value.trim();
    return precisionForDate(trimmed) ? trimmed : "";
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

  function hasNotableDivergence(
    fields: { target: string; documentType: string; issuer: string; detail: string },
    profile: FolderLearningProfile
  ): boolean {
    return Boolean(
      profile.dominantTarget && normalizeBlock(profile.dominantTarget) !== fields.target ||
      profile.dominantDocumentType && normalizeBlock(profile.dominantDocumentType) !== fields.documentType ||
      profile.dominantIssuer && normalizeBlock(profile.dominantIssuer) !== normalizeBlock(fields.issuer) ||
      profile.detailUsage === "never" && fields.detail
    );
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

  function canUseDominant(profile: FolderLearningProfile, signal: "cible" | "emetteur"): boolean {
    return !profile.warnings.some((warning) => normalizeBlock(warning).includes(signal));
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
