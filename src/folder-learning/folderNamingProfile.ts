import {
  parseFolderFileName,
  type FolderLearningDatePrecision,
  type FolderLearningFileEntry,
  type FolderNamingPattern,
  type ParsedFolderFileName
} from "./parseFolderFileName";
import {
  recognizeKnownTargetBlocks,
  type FolderLearningKnownTargetReference,
  type FolderLearningTargetBlockAmbiguity,
  type FolderLearningTargetBlockRecognition
} from "./knownTargetBlockRecognition";

export type FolderNamingProfileStatus = "none" | "weak" | "medium" | "strong";
export type FolderNamingProfileDatePrecision = FolderLearningDatePrecision | "mixed";
export type FolderNamingProfileDetailUsage = "never" | "sometimes" | "often";

export interface FolderNamingProfile {
  status: FolderNamingProfileStatus;
  analyzedFileCount: number;
  recognizedFileCount: number;
  dominantPattern?: FolderNamingPattern;
  dominantBlockCount?: number;
  dominantBlocks?: string[];
  dominantDatePrecision?: FolderNamingProfileDatePrecision;
  dominantTarget?: string;
  dominantDocumentType?: string;
  dominantIssuer?: string;
  detailUsage?: FolderNamingProfileDetailUsage;
  targetBlockRecognitions?: FolderLearningTargetBlockRecognition[];
  targetBlockAmbiguities?: FolderLearningTargetBlockAmbiguity[];
  examples: string[];
  reasons: string[];
  warnings: string[];
}

export interface FolderNamingProfileOptions {
  knownTargets?: readonly FolderLearningKnownTargetReference[];
}

interface DominantValue<T extends string> {
  value: T;
  count: number;
  ratio: number;
}

interface DominantNumberValue {
  value: number;
  count: number;
  ratio: number;
}

const DOMINANT_RATIO = 0.6;
const STRONG_COHERENCE_RATIO = 0.8;
const EXAMPLE_LIMIT = 3;

export function buildFolderNamingProfile(
  entries: readonly (string | FolderLearningFileEntry)[],
  options: FolderNamingProfileOptions = {}
): FolderNamingProfile {
  const analyzedEntries = entries.filter(isAnalyzableFileEntry);
  const parsed = analyzedEntries.map(parseFolderFileName).filter(isParsedFolderFileName);
  const ignoredCount = analyzedEntries.length - parsed.length;

  if (parsed.length === 0) {
    return {
      status: "none",
      analyzedFileCount: analyzedEntries.length,
      recognizedFileCount: 0,
      examples: [],
      reasons: ["Aucun nom compatible avec DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext détecté."],
      warnings: ignoredCount > 0 ? [`${ignoredCount} fichier(s) ignoré(s) car non conformes.`] : []
    };
  }

  const dominantPattern = dominantValue(parsed.map((entry) => entry.pattern));
  const dominantBlockCount = dominantNumberValue(parsed.map((entry) => entry.blocks.length));
  const dominantBlocks = buildDominantBlocks(parsed, dominantBlockCount?.value ?? 0);
  const dominantTarget = dominantValue(parsed.map((entry) => entry.target).filter(isString));
  const dominantDocumentType = dominantValue(parsed.map((entry) => entry.documentType).filter(isString));
  const dominantIssuer = dominantValue(parsed.map((entry) => entry.issuer).filter(isString));
  const dominantDatePrecision = detectDominantDatePrecision(parsed);
  const detailUsage = detectDetailUsage(parsed);
  const targetBlockRecognition = recognizeKnownTargetBlocks(dominantBlocks, options.knownTargets ?? []);
  const coherence = computeCoherence({
    parsed,
    dominantTarget,
    dominantDocumentType,
    dominantIssuer,
    dominantDatePrecision,
    detailUsage
  });
  const status = determineStatus(parsed.length, coherence.score);
  const reasons = buildReasons({
    parsed,
    status,
    dominantTarget,
    dominantDocumentType,
    dominantIssuer,
    dominantDatePrecision,
    detailUsage,
    coherenceScore: coherence.score,
    targetBlockRecognitions: targetBlockRecognition.recognitions
  });
  const warnings = buildWarnings({
    ignoredCount,
    parsed,
    dominantTarget,
    dominantDocumentType,
    dominantIssuer,
    dominantDatePrecision,
    detailUsage,
    coherenceWarnings: coherence.warnings,
    targetBlockAmbiguities: targetBlockRecognition.ambiguities
  });

  return {
    status,
    analyzedFileCount: analyzedEntries.length,
    recognizedFileCount: parsed.length,
    ...(dominantPattern ? { dominantPattern: dominantPattern.value } : {}),
    ...(dominantBlockCount ? { dominantBlockCount: dominantBlockCount.value } : {}),
    ...(dominantBlocks.length > 0 ? { dominantBlocks } : {}),
    dominantDatePrecision,
    ...(dominantTarget ? { dominantTarget: dominantTarget.value } : {}),
    ...(dominantDocumentType ? { dominantDocumentType: dominantDocumentType.value } : {}),
    ...(dominantIssuer ? { dominantIssuer: dominantIssuer.value } : {}),
    detailUsage,
    ...(targetBlockRecognition.recognitions.length > 0
      ? { targetBlockRecognitions: targetBlockRecognition.recognitions }
      : {}),
    ...(targetBlockRecognition.ambiguities.length > 0
      ? { targetBlockAmbiguities: targetBlockRecognition.ambiguities }
      : {}),
    examples: parsed.slice(0, EXAMPLE_LIMIT).map((entry) => entry.originalName),
    reasons,
    warnings
  };
}

function isAnalyzableFileEntry(entry: string | FolderLearningFileEntry): boolean {
  return typeof entry === "string" || entry.isFile !== false;
}

function detectDominantDatePrecision(parsed: ParsedFolderFileName[]): FolderNamingProfileDatePrecision {
  const precisions = new Set(parsed.map((entry) => entry.datePrecision));
  if (precisions.size === 1) {
    return parsed[0]?.datePrecision ?? "mixed";
  }

  return "mixed";
}

function detectDetailUsage(parsed: ParsedFolderFileName[]): FolderNamingProfileDetailUsage {
  const withDetailCount = parsed.filter((entry) => Boolean(entry.detail)).length;
  if (withDetailCount === 0) {
    return "never";
  }

  const ratio = withDetailCount / parsed.length;
  return ratio >= 0.6 ? "often" : "sometimes";
}

function buildDominantBlocks(parsed: ParsedFolderFileName[], blockCount: number): string[] {
  const blocks: string[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const dominant = dominantValue(parsed.map((entry) => entry.blocks[index]).filter(isString));
    blocks.push(dominant?.value ?? "");
  }

  return blocks;
}

function computeCoherence(input: {
  parsed: ParsedFolderFileName[];
  dominantTarget: DominantValue<string> | null;
  dominantDocumentType: DominantValue<string> | null;
  dominantIssuer: DominantValue<string> | null;
  dominantDatePrecision: FolderNamingProfileDatePrecision;
  detailUsage: FolderNamingProfileDetailUsage;
}): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let points = 0;
  let maxPoints = 0;

  maxPoints += 1;
  if (input.dominantDatePrecision !== "mixed") {
    points += 1;
  } else {
    warnings.push("Précisions de date mélangées.");
  }

  maxPoints += 1;
  points += scoreDominantSignal(input.dominantTarget, "cible", input.parsed.length, warnings);

  maxPoints += 1;
  points += scoreDominantSignal(input.dominantDocumentType, "type documentaire", input.parsed.length, warnings);

  maxPoints += 1;
  points += scoreIssuerSignal(input.parsed, input.dominantIssuer, warnings);

  maxPoints += 1;
  if (input.detailUsage === "never" || input.detailUsage === "often") {
    points += 1;
  } else {
    points += 0.5;
    warnings.push("Usage du détail irrégulier.");
  }

  return {
    score: maxPoints > 0 ? points / maxPoints : 0,
    warnings
  };
}

function scoreDominantSignal(
  dominant: DominantValue<string> | null,
  label: string,
  totalCount: number,
  warnings: string[]
): number {
  if (!dominant) {
    warnings.push(`Aucun ${label} dominant.`);
    return 0;
  }

  if (dominant.ratio >= STRONG_COHERENCE_RATIO) {
    return 1;
  }

  warnings.push(`${label[0]?.toUpperCase() ?? ""}${label.slice(1)} dominant mais hétérogène.`);
  return dominant.count >= Math.ceil(totalCount * DOMINANT_RATIO) ? 0.5 : 0;
}

function scoreIssuerSignal(
  parsed: ParsedFolderFileName[],
  dominantIssuer: DominantValue<string> | null,
  warnings: string[]
): number {
  const issuerCount = parsed.filter((entry) => Boolean(entry.issuer)).length;
  if (issuerCount === 0) {
    return 1;
  }

  if (issuerCount < parsed.length) {
    warnings.push("Émetteur présent seulement sur une partie des noms.");
    return dominantIssuer && dominantIssuer.ratio >= STRONG_COHERENCE_RATIO ? 0.5 : 0;
  }

  if (!dominantIssuer) {
    warnings.push("Aucun émetteur dominant.");
    return 0;
  }

  if (dominantIssuer.ratio >= STRONG_COHERENCE_RATIO) {
    return 1;
  }

  warnings.push("Émetteur dominant mais hétérogène.");
  return 0.5;
}

function determineStatus(recognizedCount: number, coherenceScore: number): FolderNamingProfileStatus {
  if (recognizedCount === 0) {
    return "none";
  }

  if (recognizedCount <= 3) {
    return "weak";
  }

  if (coherenceScore < 0.5) {
    return "weak";
  }

  if (recognizedCount >= 8) {
    return coherenceScore >= 0.85 ? "strong" : "medium";
  }

  return coherenceScore >= 0.7 ? "medium" : "weak";
}

function buildReasons(input: {
  parsed: ParsedFolderFileName[];
  status: FolderNamingProfileStatus;
  dominantTarget: DominantValue<string> | null;
  dominantDocumentType: DominantValue<string> | null;
  dominantIssuer: DominantValue<string> | null;
  dominantDatePrecision: FolderNamingProfileDatePrecision;
  detailUsage: FolderNamingProfileDetailUsage;
  coherenceScore: number;
  targetBlockRecognitions: FolderLearningTargetBlockRecognition[];
}): string[] {
  const reasons = [
    `${input.parsed.length} nom(s) compatible(s) détecté(s).`,
    `Profil ${input.status} selon le volume et la cohérence des noms.`
  ];

  reasons.push(`Précision de date dominante : ${input.dominantDatePrecision}.`);
  reasons.push(`Usage du détail : ${input.detailUsage}.`);
  reasons.push(`Cohérence estimée : ${Math.round(input.coherenceScore * 100)}%.`);

  if (input.dominantTarget) {
    reasons.push(`Cible dominante : ${input.dominantTarget.value}.`);
  }

  if (input.dominantDocumentType) {
    reasons.push(`Type documentaire dominant : ${input.dominantDocumentType.value}.`);
  }

  if (input.dominantIssuer) {
    reasons.push(`Émetteur dominant : ${input.dominantIssuer.value}.`);
  }

  for (const recognition of input.targetBlockRecognitions) {
    reasons.push(recognition.reason);
  }

  return reasons;
}

function buildWarnings(input: {
  ignoredCount: number;
  parsed: ParsedFolderFileName[];
  dominantTarget: DominantValue<string> | null;
  dominantDocumentType: DominantValue<string> | null;
  dominantIssuer: DominantValue<string> | null;
  dominantDatePrecision: FolderNamingProfileDatePrecision;
  detailUsage: FolderNamingProfileDetailUsage;
  coherenceWarnings: string[];
  targetBlockAmbiguities: FolderLearningTargetBlockAmbiguity[];
}): string[] {
  const warnings = [...input.coherenceWarnings];
  if (input.ignoredCount > 0) {
    warnings.unshift(`${input.ignoredCount} fichier(s) ignoré(s) car non conformes.`);
  }

  if (input.parsed.length === 1) {
    warnings.push("Un seul nom reconnu : profil peu fiable.");
  }

  for (const ambiguity of input.targetBlockAmbiguities) {
    warnings.push(ambiguity.reason);
  }

  return Array.from(new Set(warnings));
}

function dominantValue<T extends string>(values: readonly T[]): DominantValue<T> | null {
  if (values.length === 0) {
    return null;
  }

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0], "fr", { sensitivity: "base" });
  });
  const best = sorted[0];
  if (!best) {
    return null;
  }

  const ratio = best[1] / values.length;
  if (ratio < DOMINANT_RATIO) {
    return null;
  }

  return {
    value: best[0],
    count: best[1],
    ratio
  };
}

function dominantNumberValue(values: readonly number[]): DominantNumberValue | null {
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
  if (ratio < DOMINANT_RATIO) {
    return null;
  }

  return {
    value: best[0],
    count: best[1],
    ratio
  };
}

function isParsedFolderFileName(value: ParsedFolderFileName | null): value is ParsedFolderFileName {
  return value !== null;
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
