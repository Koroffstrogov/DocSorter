import type {
  DocumentTypeReference,
  PersonReference,
  ProviderReference,
  ReferenceCandidate,
  ReferenceCandidateKind,
  ReferenceDetectionInput,
  ReferenceDetectionResult,
  ReferenceEntryBase
} from "./referenceDataTypes";
import { normalizeAliasForDetection } from "./referenceDataValidation";

interface AliasMatch {
  confidence: number;
  reasons: string[];
  matchedAliases: string[];
}

const MAX_CONFIDENCE = 95;
const BIRTH_DATE_ONLY_CONFIDENCE = 45;
const DOMAIN_CONFIDENCE = 75;

export { normalizeAliasForDetection };

export function detectReferenceCandidates(
  input: ReferenceDetectionInput
): ReferenceDetectionResult {
  const filename = normalizeAliasForDetection(input.filename ?? "");
  const text = normalizeAliasForDetection(input.text ?? "");
  const rawSearchText = `${input.filename ?? ""} ${input.text ?? ""}`.toLowerCase();

  const targetCandidates = [
    ...input.catalog.people
      .map((entry) => createPersonCandidate(entry, filename, text))
      .filter(isReferenceCandidate),
    ...input.catalog.vehicles
      .map((entry) => createEntryCandidate("vehicle", entry, filename, text))
      .filter(isReferenceCandidate),
    ...input.catalog.properties
      .map((entry) => createEntryCandidate("property", entry, filename, text))
      .filter(isReferenceCandidate)
  ].sort(compareCandidates);

  const documentTypeCandidates = input.catalog.documentTypes
    .map((entry) => createDocumentTypeCandidate(entry, filename, text))
    .filter(isReferenceCandidate)
    .sort(compareCandidates);

  const issuerCandidates = input.catalog.providers
    .map((entry) => createProviderCandidate(entry, filename, text, rawSearchText))
    .filter(isReferenceCandidate)
    .sort(compareCandidates);

  return {
    targetCandidates,
    documentTypeCandidates,
    issuerCandidates,
    warnings: []
  };
}

function createPersonCandidate(
  entry: PersonReference,
  filename: string,
  text: string
): ReferenceCandidate | null {
  if (entry.enabled === false) {
    return null;
  }

  const aliasMatch = matchEntryAliases("person", entry, filename, text);
  const birthDateMatched = entry.birthDate ? birthDateMatches(entry.birthDate, filename, text) : false;

  if (aliasMatch.confidence === 0 && !birthDateMatched) {
    return null;
  }

  const confidence = aliasMatch.confidence > 0
    ? clampConfidence(aliasMatch.confidence + (birthDateMatched ? 5 : 0))
    : BIRTH_DATE_ONLY_CONFIDENCE;

  return {
    kind: "person",
    id: entry.id,
    label: entry.label,
    fileAlias: entry.fileAlias,
    ...(entry.folderAlias ? { folderAlias: entry.folderAlias } : {}),
    confidence,
    reasons: [
      ...aliasMatch.reasons,
      ...(birthDateMatched ? ["indice date de naissance détecté"] : [])
    ],
    matchedAliases: aliasMatch.matchedAliases
  };
}

function createEntryCandidate(
  kind: "vehicle" | "property",
  entry: ReferenceEntryBase,
  filename: string,
  text: string
): ReferenceCandidate | null {
  if (entry.enabled === false) {
    return null;
  }

  const aliasMatch = matchEntryAliases(kind, entry, filename, text);
  if (aliasMatch.confidence === 0) {
    return null;
  }

  return {
    kind,
    id: entry.id,
    label: entry.label,
    fileAlias: entry.fileAlias,
    ...(entry.folderAlias ? { folderAlias: entry.folderAlias } : {}),
    confidence: aliasMatch.confidence,
    reasons: aliasMatch.reasons,
    matchedAliases: aliasMatch.matchedAliases
  };
}

function createDocumentTypeCandidate(
  entry: DocumentTypeReference,
  filename: string,
  text: string
): ReferenceCandidate | null {
  if (entry.enabled === false) {
    return null;
  }

  const aliasMatch = matchEntryAliases("documentType", entry, filename, text);
  if (aliasMatch.confidence === 0) {
    return null;
  }

  return {
    kind: "documentType",
    id: entry.id,
    label: entry.label,
    fileAlias: entry.fileAlias,
    confidence: aliasMatch.confidence,
    reasons: aliasMatch.reasons,
    matchedAliases: aliasMatch.matchedAliases
  };
}

function createProviderCandidate(
  entry: ProviderReference,
  filename: string,
  text: string,
  rawSearchText: string
): ReferenceCandidate | null {
  if (entry.enabled === false) {
    return null;
  }

  const aliasMatch = matchEntryAliases("provider", entry, filename, text);
  const domainMatches = (entry.domains ?? []).filter((domain) =>
    domainAppearsInText(domain, rawSearchText)
  );
  const domainConfidence = domainMatches.length > 0 ? DOMAIN_CONFIDENCE : 0;
  const confidence = Math.max(aliasMatch.confidence, domainConfidence);

  if (confidence === 0) {
    return null;
  }

  return {
    kind: "provider",
    id: entry.id,
    label: entry.label,
    fileAlias: entry.fileAlias,
    confidence: clampConfidence(confidence + (aliasMatch.confidence && domainConfidence ? 5 : 0)),
    reasons: [
      ...aliasMatch.reasons,
      ...(domainMatches.length > 0 ? ["domaine fournisseur détecté"] : [])
    ],
    matchedAliases: [
      ...aliasMatch.matchedAliases,
      ...domainMatches.map((domain) => `domain:${domain}`)
    ]
  };
}

function matchEntryAliases(
  kind: ReferenceCandidateKind,
  entry: Pick<ReferenceEntryBase, "label" | "fileAlias" | "folderAlias" | "aliases">,
  filename: string,
  text: string
): AliasMatch {
  const aliases = collectSearchAliases(entry);
  const filenameMatches = aliases.filter((alias) => containsNormalizedPhrase(filename, alias));
  const textMatches = aliases.filter((alias) => containsNormalizedPhrase(text, alias));
  const matchedAliases = Array.from(new Set([...filenameMatches, ...textMatches]));

  if (matchedAliases.length === 0) {
    return {
      confidence: 0,
      reasons: [],
      matchedAliases: []
    };
  }

  const baseConfidence = filenameMatches.length > 0 && textMatches.length > 0
    ? 90
    : filenameMatches.length > 0
      ? 80
      : 70;
  const bonus = matchedAliases.length > 1 ? 5 : 0;

  return {
    confidence: clampConfidence(baseConfidence + bonus),
    reasons: [createAliasReason(kind, matchedAliases[0] ?? "")],
    matchedAliases
  };
}

function collectSearchAliases(
  entry: Pick<ReferenceEntryBase, "label" | "fileAlias" | "folderAlias" | "aliases">
): string[] {
  const rawAliases = [
    entry.label,
    entry.fileAlias,
    entry.folderAlias,
    ...entry.aliases
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return Array.from(new Set(rawAliases.map(normalizeAliasForDetection))).filter(
    (alias) => alias.replace(/\s/g, "").length >= 3
  );
}

function createAliasReason(kind: ReferenceCandidateKind, alias: string): string {
  if (kind === "person") {
    return "alias de personne détecté";
  }

  return `alias '${alias}' détecté`;
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) {
    return false;
  }

  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escapedPhrase}(?:\\s|$)`).test(text);
}

function birthDateMatches(birthDate: string, filename: string, text: string): boolean {
  const [year, month, day] = birthDate.split("-");
  const variants = [
    birthDate,
    `${day}/${month}/${year}`,
    `${day}-${month}-${year}`,
    `${day} ${month} ${year}`,
    `${year} ${month} ${day}`
  ].map(normalizeAliasForDetection);

  return variants.some(
    (variant) => containsNormalizedPhrase(filename, variant) || containsNormalizedPhrase(text, variant)
  );
}

function domainAppearsInText(domain: string, rawSearchText: string): boolean {
  if (!domain || !rawSearchText) {
    return false;
  }

  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9.-])${escapedDomain}(?:$|[^a-z0-9.-])`, "i").test(
    rawSearchText
  );
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(MAX_CONFIDENCE, Math.round(value)));
}

function compareCandidates(left: ReferenceCandidate, right: ReferenceCandidate): number {
  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence;
  }

  return left.label.localeCompare(right.label, "fr");
}

function isReferenceCandidate(value: ReferenceCandidate | null): value is ReferenceCandidate {
  return value !== null;
}
