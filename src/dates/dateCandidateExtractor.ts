import type {
  BuildDateCandidatesInput,
  DateCandidate,
  DatePrecision,
  DateRole,
  DateSource
} from "./dateCandidateTypes";
import {
  formatDateToken,
  normalizeDateText,
  parseFrenchDate,
  parseIsoDate,
  parseMonthToken
} from "./dateTokenFormatter";

type CandidateDraft = Omit<DateCandidate, "confidence"> & { confidence: number };

const MONTH_NAME_PATTERN =
  "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre";

export function extractDateCandidates(input: BuildDateCandidatesInput): DateCandidate[] {
  const candidates: DateCandidate[] = [];

  collectTextCandidates(input.fileName, "file-name", candidates);
  collectTextCandidates(input.extractedText, "text", candidates);
  collectTextCandidates(input.ocrText, "ocr", candidates);
  collectTextCandidates(input.metadataText, "metadata", candidates);
  collectTechnicalCandidate(input.fileCreatedAt, "file", "Date de création fichier.", 25, candidates);
  collectTechnicalCandidate(input.fileModifiedAt, "file", "Date de modification fichier.", 25, candidates);
  collectTechnicalCandidate(input.pdfCreatedAt, "file", "Date de création PDF.", 35, candidates);
  collectTechnicalCandidate(input.pdfModifiedAt, "file", "Date de modification PDF.", 35, candidates);
  collectTechnicalCandidate(input.exifTakenAt, "scan", "Date EXIF disponible.", 55, candidates);
  collectTechnicalCandidate(input.scanDate, "scan", "Date de scan disponible.", 55, candidates);

  return deduplicateCandidates(candidates);
}

function collectTextCandidates(
  value: string | undefined,
  source: DateSource,
  candidates: DateCandidate[]
): void {
  if (!value?.trim()) {
    return;
  }

  const text = normalizeDateText(value);
  collectSchoolYears(text, source, candidates);
  collectMonthlyRanges(text, source, candidates);
  collectIsoDates(text, source, candidates);
  collectFrenchNumericDates(text, source, candidates);
  collectFrenchTextualDates(text, source, candidates);
  collectMonthCandidates(text, source, candidates);
  collectContextualYears(text, source, candidates);
}

function collectSchoolYears(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const pattern = /(?:annee scolaire\s+)?((?:19|20)\d{2})\s*[-/]\s*((?:19|20)\d{2})/g;
  for (const match of text.matchAll(pattern)) {
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (endYear !== startYear + 1) {
      continue;
    }

    candidates.push({
      token: `${startYear}-${endYear}`,
      precision: "school-year",
      role: "period",
      source,
      confidence: sourceConfidence(source, "period", "school-year", true),
      reasons: ["Année scolaire détectée."],
      warnings: []
    });
  }
}

function collectMonthlyRanges(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const pattern =
    /du\s+([0-3]?\d)[/-]([01]?\d)[/-]((?:19|20)\d{2})\s+au\s+([0-3]?\d)[/-]([01]?\d)[/-]((?:19|20)\d{2})/g;

  for (const match of text.matchAll(pattern)) {
    if (match[2] !== match[5] || match[3] !== match[6]) {
      continue;
    }

    const token = formatDateToken({
      year: Number(match[3]),
      month: Number(match[2])
    });
    if (!token) {
      continue;
    }

    candidates.push({
      token,
      precision: "month",
      role: "period",
      source,
      confidence: sourceConfidence(source, "period", "month", true),
      reasons: ["Période mensuelle explicite détectée."],
      warnings: []
    });
  }
}

function collectIsoDates(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const pattern = /\b((?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/g;
  for (const match of text.matchAll(pattern)) {
    addParsedDate(match[1] ?? "", match.index ?? 0, text, source, "day", candidates);
  }
}

function collectFrenchNumericDates(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const pattern = /\b([0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2})\b/g;
  for (const match of text.matchAll(pattern)) {
    addParsedDate(match[1] ?? "", match.index ?? 0, text, source, "day", candidates);
  }
}

function collectFrenchTextualDates(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const pattern = new RegExp(`\\b([0-3]?\\d\\s+(?:${MONTH_NAME_PATTERN})\\s+(?:19|20)\\d{2})\\b`, "g");
  for (const match of text.matchAll(pattern)) {
    addParsedDate(match[1] ?? "", match.index ?? 0, text, source, "day", candidates);
  }
}

function collectMonthCandidates(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const monthPatterns = [
    /\b((?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2})\b/g,
    /\b((?:19|20)\d{2}-(?:0[1-9]|1[0-2]))\b/g,
    new RegExp(`\\b((?:${MONTH_NAME_PATTERN})\\s+(?:19|20)\\d{2})\\b`, "g")
  ];

  for (const pattern of monthPatterns) {
    for (const match of text.matchAll(pattern)) {
      const rawValue = match[1] ?? "";
      if (isEmbeddedDatePart(text, match.index ?? 0, rawValue.length)) {
        continue;
      }

      const token = parseMonthToken(rawValue);
      if (!token || isBirthContextAround(text, match.index ?? 0)) {
        continue;
      }

      const snippet = createSnippet(text, match.index ?? 0);
      const role = inferRole(snippet, "month");
      candidates.push({
        token,
        precision: "month",
        role,
        source,
        confidence: sourceConfidence(source, role, "month", role !== "unknown"),
        reasons: [createReason(role, "Période mensuelle détectée.")],
        warnings: []
      });
    }
  }
}

function collectContextualYears(text: string, source: DateSource, candidates: DateCandidate[]): void {
  const pattern = /\b((?:19|20)\d{2})\b/g;
  for (const match of text.matchAll(pattern)) {
    const snippet = createSnippet(text, match.index ?? 0);
    if (!yearHasUsefulContext(snippet) || isBirthContextAround(text, match.index ?? 0)) {
      continue;
    }

    const token = parseIsoDate(match[1] ?? "");
    if (!token) {
      continue;
    }

    const role = inferRole(snippet, "year");
    candidates.push({
      token,
      precision: "year",
      role,
      source,
      confidence: sourceConfidence(source, role, "year", true),
      reasons: [createReason(role, "Année documentaire détectée.")],
      warnings: []
    });
  }
}

function addParsedDate(
  rawValue: string,
  index: number,
  text: string,
  source: DateSource,
  precision: DatePrecision,
  candidates: DateCandidate[]
): void {
  const snippet = createSnippet(text, index);
  if (isBirthContextAround(text, index)) {
    return;
  }

  const token = parseIsoDate(rawValue) ?? parseFrenchDate(rawValue);
  if (!token) {
    return;
  }

  const role = inferRole(snippet, precision);
  candidates.push({
    token,
    precision,
    role,
    source,
    confidence: sourceConfidence(source, role, precision, role !== "unknown"),
    reasons: [createReason(role, "Date explicite détectée.")],
    warnings: []
  });
}

function collectTechnicalCandidate(
  value: string | undefined,
  role: DateRole,
  reason: string,
  confidence: number,
  candidates: DateCandidate[]
): void {
  const token = parseTechnicalDate(value);
  if (!token) {
    return;
  }

  candidates.push({
    token,
    precision: token.length === 10 ? "day" : token.length === 7 ? "month" : "year",
    role,
    source: "metadata",
    confidence,
    reasons: [reason],
    warnings: ["Date technique : vérifier avant usage comme date documentaire."]
  });
}

function parseTechnicalDate(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = normalizeDateText(value);
  const fullDate = normalized.match(/\b((?:19|20)\d{2}-[01]\d-[0-3]\d)(?=$|[^0-9])/);
  if (fullDate) {
    return parseIsoDate(fullDate[1] ?? "");
  }

  const monthDate = normalized.match(/\b((?:19|20)\d{2}-[01]\d)\b/);
  if (monthDate) {
    return parseIsoDate(monthDate[1] ?? "");
  }

  return parseIsoDate(normalized);
}

function inferRole(snippet: string, precision: DatePrecision): DateRole {
  if (/prise d'effet|date d'effet|effet au|effet le/.test(snippet)) {
    return "effective";
  }

  if (/signature|signe le|signee le/.test(snippet)) {
    return "signature";
  }

  if (/periode|validite|revenus|imposition|avis|annee scolaire|exercice|du .* au /.test(snippet)) {
    return "period";
  }

  if (/facture du|date de facture|facture le|date d'emission|emission|emis le|emise le|etabli le|etablie le|delivre le|delivree le/.test(snippet)) {
    return "issue";
  }

  if (/controle technique|date du controle|controle du|mise a jour|mis a jour/.test(snippet)) {
    return "document";
  }

  return precision === "school-year" ? "period" : "unknown";
}

function sourceConfidence(
  source: DateSource,
  role: DateRole,
  precision: DatePrecision,
  explicitContext: boolean
): number {
  let confidence = source === "file-name" ? 55 : source === "metadata" ? 50 : 70;
  if (explicitContext) {
    confidence += 15;
  }
  if (precision === "day") {
    confidence += 5;
  }
  if (precision === "school-year") {
    confidence += 20;
  }
  if (role === "period" && precision === "month") {
    confidence += 10;
  }

  return Math.max(0, Math.min(95, confidence));
}

function createReason(role: DateRole, fallback: string): string {
  switch (role) {
    case "issue":
      return "Date d'émission ou de facture détectée.";
    case "period":
      return "Période documentaire détectée.";
    case "effective":
      return "Date d'effet détectée.";
    case "signature":
      return "Date de signature détectée.";
    case "document":
      return "Date documentaire détectée.";
    default:
      return fallback;
  }
}

function yearHasUsefulContext(snippet: string): boolean {
  return /avis|imposition|revenus|annee|exercice|scolaire|periode|validite|releve|bulletin/.test(snippet);
}

function isBirthContextAround(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 30), index);
  return /(ne le|nee le|date de naissance|naissance)\s*$/.test(prefix);
}

function createSnippet(text: string, index: number): string {
  return text.slice(Math.max(0, index - 45), index + 70);
}

function isEmbeddedDatePart(text: string, index: number, length: number): boolean {
  const before = index > 0 ? text[index - 1] : "";
  const after = text[index + length] ?? "";
  return before === "/" || before === "-" || after === "/" || after === "-";
}

function deduplicateCandidates(candidates: DateCandidate[]): DateCandidate[] {
  const byKey = new Map<string, DateCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.token}|${candidate.precision}|${candidate.role}|${candidate.source}`;
    const existing = byKey.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return left.token.localeCompare(right.token);
  });
}
