import { normalizeNameBlock } from "../naming/documentNameV2";
import type { KnownTarget, KnownTargetKind } from "./knownTargets";

export type KnownTargetEvidenceSource =
  | "text"
  | "ocr"
  | "filename"
  | "selected-folder"
  | "folder-profile"
  | "known-target-alias";

export interface KnownTargetHint {
  fileAlias: string;
  displayName: string;
  kind: KnownTargetKind;
  matchedAliases: string[];
  evidenceSources: KnownTargetEvidenceSource[];
}

export interface BuildKnownTargetHintsInput {
  targets: KnownTarget[];
  filename?: string;
  extractedText?: string;
  ocrText?: string;
  selectedFolder?: string;
  folderProfileTerms?: string[];
}

const MAX_HINTS = 20;
const MAX_MATCHED_ALIASES = 5;
const MAX_HINT_STRING_LENGTH = 80;

export function buildKnownTargetHints(input: BuildKnownTargetHintsInput): KnownTargetHint[] {
  return input.targets
    .filter((target) => target.isActive)
    .map((target) => buildKnownTargetHint(target, input))
    .filter((hint): hint is KnownTargetHint => hint !== null)
    .sort((left, right) =>
      right.evidenceSources.length - left.evidenceSources.length ||
      left.fileAlias.localeCompare(right.fileAlias, "fr", { sensitivity: "base" })
    )
    .slice(0, MAX_HINTS);
}

function buildKnownTargetHint(
  target: KnownTarget,
  input: BuildKnownTargetHintsInput
): KnownTargetHint | null {
  const aliasEntries = buildAliasEntries(target);
  const matchedAliases: string[] = [];
  const evidenceSources = new Set<KnownTargetEvidenceSource>();

  for (const entry of aliasEntries) {
    const sources = findEvidenceSources(entry.normalized, input);
    if (sources.length === 0) {
      continue;
    }

    sources.forEach((source) => evidenceSources.add(source));
    if (entry.fromAlias) {
      evidenceSources.add("known-target-alias");
    }

    if (matchedAliases.some((alias) => aliasCovers(alias, entry.value))) {
      continue;
    }

    matchedAliases.push(entry.value);

    if (matchedAliases.length >= MAX_MATCHED_ALIASES) {
      break;
    }
  }

  if (matchedAliases.length === 0) {
    return null;
  }

  return {
    fileAlias: limitHintString(target.fileAlias),
    displayName: limitHintString(target.displayName),
    kind: target.kind,
    matchedAliases: uniqueStrings(matchedAliases).slice(0, MAX_MATCHED_ALIASES).map(limitHintString),
    evidenceSources: Array.from(evidenceSources).sort()
  };
}

function buildAliasEntries(target: KnownTarget): Array<{ value: string; normalized: string; fromAlias: boolean }> {
  return uniqueStrings([
    target.displayName,
    target.fileAlias,
    ...target.aliases
  ])
    .map((value) => ({
      value: limitHintString(value),
      normalized: normalizeAliasForEvidence(value),
      fromAlias: !sameNormalized(value, target.displayName) && !sameNormalized(value, target.fileAlias)
    }))
    .filter((entry) => entry.normalized.length >= 2)
    .sort((left, right) => right.normalized.length - left.normalized.length);
}

function findEvidenceSources(
  normalizedAlias: string,
  input: BuildKnownTargetHintsInput
): KnownTargetEvidenceSource[] {
  const sources: KnownTargetEvidenceSource[] = [];
  if (containsNormalizedAlias(input.extractedText ?? "", normalizedAlias)) {
    sources.push("text");
  }
  if (containsNormalizedAlias(input.ocrText ?? "", normalizedAlias)) {
    sources.push("ocr");
  }
  if (containsNormalizedAlias(input.filename ?? "", normalizedAlias)) {
    sources.push("filename");
  }
  if (containsNormalizedAlias(input.selectedFolder ?? "", normalizedAlias)) {
    sources.push("selected-folder");
  }
  if ((input.folderProfileTerms ?? []).some((term) => containsNormalizedAlias(term, normalizedAlias))) {
    sources.push("folder-profile");
  }
  return sources;
}

function containsNormalizedAlias(source: string, normalizedAlias: string): boolean {
  const normalizedSource = normalizeAliasForEvidence(source);
  if (!normalizedSource || !normalizedAlias) {
    return false;
  }

  return normalizedSource === normalizedAlias ||
    normalizedSource.includes(`-${normalizedAlias}-`) ||
    normalizedSource.startsWith(`${normalizedAlias}-`) ||
    normalizedSource.endsWith(`-${normalizedAlias}`);
}

function normalizeAliasForEvidence(value: string): string {
  return normalizeNameBlock(removePathLikeText(value));
}

function removePathLikeText(value: string): string {
  return value
    .replace(/[a-zA-Z]:\\[^\s"',;]+/g, " ")
    .replace(/\\\\[^\s"',;]+/g, " ")
    .replace(/file:\/\/[^\s"',;]+/gi, " ");
}

function sameNormalized(left: string, right: string): boolean {
  return normalizeAliasForEvidence(left) === normalizeAliasForEvidence(right);
}

function aliasCovers(existingAlias: string, candidateAlias: string): boolean {
  const existing = normalizeAliasForEvidence(existingAlias);
  const candidate = normalizeAliasForEvidence(candidateAlias);
  return existing === candidate ||
    existing.includes(`-${candidate}-`) ||
    existing.startsWith(`${candidate}-`) ||
    existing.endsWith(`-${candidate}`);
}

function limitHintString(value: string): string {
  return removePathLikeText(value).trim().slice(0, MAX_HINT_STRING_LENGTH);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeAliasForEvidence(trimmed);
    if (!trimmed || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
