export interface NamingDraft {
  documentDate: string;
  subject: string;
  documentType: string;
  keywords: string;
}

export function isNamingDraft(value: unknown): value is NamingDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.documentDate === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.documentType === "string" &&
    typeof candidate.keywords === "string"
  );
}

export type NamingMessageLevel = "error" | "warning" | "info";

export interface NamingMessage {
  level: NamingMessageLevel;
  code:
    | "DATE_REQUIRED"
    | "DATE_INVALID"
    | "SUBJECT_REQUIRED"
    | "TYPE_RECOMMENDED"
    | "NORMALIZED"
    | "TRUNCATED";
  message: string;
}

export interface NamingValidation {
  isValid: boolean;
  normalizedDraft: NamingDraft;
  messages: NamingMessage[];
}

export interface ProposedFilename {
  proposedFilename: string;
  isValid: boolean;
  messages: NamingMessage[];
  normalizedDraft: NamingDraft;
}

const MAX_FILENAME_LENGTH = 180;
const WINDOWS_FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

export function normalizeFilenameBlock(value: string | undefined): string {
  return sanitizeWindowsFilename(value)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function sanitizeWindowsFilename(value: string | undefined): string {
  return removeAccents(value ?? "")
    .replace(WINDOWS_FORBIDDEN_CHARS, " ")
    .replace(/[_-]{2,}/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

export function buildProposedFilename(
  draft: NamingDraft,
  originalExtension: string
): ProposedFilename {
  const validation = validateNamingDraft(draft);
  if (!validation.isValid) {
    return {
      proposedFilename: "",
      isValid: false,
      messages: validation.messages,
      normalizedDraft: validation.normalizedDraft
    };
  }

  const extension = normalizeExtension(originalExtension);
  const blocks = [
    validation.normalizedDraft.documentDate,
    validation.normalizedDraft.subject,
    validation.normalizedDraft.documentType,
    validation.normalizedDraft.keywords
  ].filter(Boolean);
  const messages = [...validation.messages];
  let baseName = avoidReservedWindowsName(blocks.join("_"));
  const maxBaseLength = Math.max(1, MAX_FILENAME_LENGTH - extension.length);

  if (`${baseName}${extension}`.length > MAX_FILENAME_LENGTH) {
    baseName = baseName.slice(0, maxBaseLength).replace(/[-_]+$/g, "");
    messages.push({
      level: "warning",
      code: "TRUNCATED",
      message: "Nom proposé tronqué à 180 caractères."
    });
  }

  return {
    proposedFilename: `${baseName}${extension}`,
    isValid: true,
    messages,
    normalizedDraft: validation.normalizedDraft
  };
}

export function validateNamingDraft(draft: NamingDraft): NamingValidation {
  const normalizedDate = normalizeDocumentDate(draft.documentDate);
  const normalizedDraft: NamingDraft = {
    documentDate: normalizedDate ?? "",
    subject: normalizeFilenameBlock(draft.subject),
    documentType: normalizeFilenameBlock(draft.documentType),
    keywords: normalizeFilenameBlock(draft.keywords)
  };
  const messages: NamingMessage[] = [];

  if (!draft.documentDate.trim()) {
    messages.push({
      level: "warning",
      code: "DATE_REQUIRED",
      message: "Date documentaire à confirmer."
    });
  } else if (!normalizedDate) {
    messages.push({
      level: "error",
      code: "DATE_INVALID",
      message: "Date documentaire invalide. Utiliser AAAA-MM-JJ ou AAAA."
    });
  }

  if (!normalizedDraft.subject) {
    messages.push({
      level: "error",
      code: "SUBJECT_REQUIRED",
      message: "Sujet obligatoire pour générer un nom fiable."
    });
  }

  if (!normalizedDraft.documentType) {
    messages.push({
      level: "warning",
      code: "TYPE_RECOMMENDED",
      message: "Type recommandé."
    });
  }

  if (draftWasNormalized(draft, normalizedDraft)) {
    messages.push({
      level: "info",
      code: "NORMALIZED",
      message: "Certains caractères ont été supprimés ou normalisés."
    });
  }

  return {
    isValid: !messages.some((message) => message.level === "error") && Boolean(normalizedDraft.documentDate),
    normalizedDraft,
    messages
  };
}

export function createInitialNamingDraft(originalName: string): NamingDraft {
  const baseName = stripExtension(originalName);
  const detectedDate = detectDocumentDateFromFilename(baseName) ?? "";
  const subjectSource = detectedDate ? removeDetectedDate(baseName) : baseName;

  return {
    documentDate: detectedDate,
    subject: normalizeFilenameBlock(subjectSource),
    documentType: "",
    keywords: ""
  };
}

export function detectDocumentDateFromFilename(fileName: string): string | null {
  if (/(?:^|[^0-9])\d{1,2}[-_. ]\d{1,2}[-_. ](19|20)\d{2}(?:[^0-9]|$)/.test(fileName)) {
    return null;
  }

  const fullDateMatch = fileName.match(
    /(?:^|[^0-9])((19|20)\d{2})[-_. ](0[1-9]|1[0-2])[-_. ](0[1-9]|[12][0-9]|3[01])(?:[^0-9]|$)/
  );

  if (fullDateMatch) {
    const date = `${fullDateMatch[1]}-${fullDateMatch[3]}-${fullDateMatch[4]}`;
    return normalizeDocumentDate(date);
  }

  const yearMatch = fileName.match(/(?:^|[^0-9])((19|20)\d{2})(?:[^0-9]|$)/);
  return yearMatch ? yearMatch[1] : null;
}

export function resolveFilenameCollision(fileName: string, existingNames: Iterable<string>): string {
  const existing = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
  if (!existing.has(fileName.toLowerCase())) {
    return fileName;
  }

  const extension = getExtension(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  let suffix = 2;

  while (existing.has(`${baseName}_${suffix}${extension}`.toLowerCase())) {
    suffix += 1;
  }

  return `${baseName}_${suffix}${extension}`;
}

function normalizeDocumentDate(value: string): string | null {
  const trimmed = value.trim();

  if (/^(19|20)\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

function normalizeExtension(extension: string): string {
  const normalized = sanitizeWindowsFilename(extension).toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function draftWasNormalized(draft: NamingDraft, normalizedDraft: NamingDraft): boolean {
  return (
    normalizeInputForComparison(draft.subject) !== normalizedDraft.subject ||
    normalizeInputForComparison(draft.documentType) !== normalizedDraft.documentType ||
    normalizeInputForComparison(draft.keywords) !== normalizedDraft.keywords
  );
}

function normalizeInputForComparison(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

function removeAccents(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "");
}

function stripExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const extension = getExtension(baseName);
  return extension ? baseName.slice(0, -extension.length) : baseName;
}

function getExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

function removeDetectedDate(value: string): string {
  return value
    .replace(/(?:^|[^0-9])((19|20)\d{2})[-_. ](0[1-9]|1[0-2])[-_. ](0[1-9]|[12][0-9]|3[01])(?:[^0-9]|$)/, " ")
    .replace(/(?:^|[^0-9])((19|20)\d{2})(?:[^0-9]|$)/, " ");
}

function avoidReservedWindowsName(value: string): string {
  return RESERVED_WINDOWS_NAMES.has(value.toUpperCase()) ? `${value}-document` : value;
}
