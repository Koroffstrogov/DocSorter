export type FolderLearningDatePrecision = "day" | "month" | "year";

export interface FolderLearningFileEntry {
  name: string;
  isFile?: boolean;
}

export interface ParsedFolderFileName {
  originalName: string;
  dateToken: string;
  datePrecision: FolderLearningDatePrecision;
  target: string;
  documentType: string;
  issuer?: string;
  detail?: string;
  extension: ".pdf" | ".jpg" | ".jpeg" | ".png";
  pattern: FolderNamingPattern;
}

export type FolderNamingPattern =
  | "DATE_CIBLE_DOCUMENT"
  | "DATE_CIBLE_DOCUMENT_EMETTEUR"
  | "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL";

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const NORMALIZED_NAME_BLOCK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFolderFileName(input: string | FolderLearningFileEntry): ParsedFolderFileName | null {
  const fileName = typeof input === "string" ? input : input.name;
  if (typeof input !== "string" && input.isFile === false) {
    return null;
  }

  if (!fileName || /[\\/]/.test(fileName)) {
    return null;
  }

  const extension = readSupportedExtension(fileName);
  if (!extension) {
    return null;
  }

  const baseName = fileName.slice(0, -extension.length);
  const parts = baseName.split("_");
  if (parts.length < 3 || parts.length > 5 || parts.some((part) => !isNormalizedNameBlock(part))) {
    return null;
  }

  const [dateToken, target, documentType, issuer, detail] = parts;
  const datePrecision = detectDatePrecision(dateToken);
  if (!datePrecision) {
    return null;
  }

  return {
    originalName: fileName,
    dateToken,
    datePrecision,
    target,
    documentType,
    ...(issuer ? { issuer } : {}),
    ...(detail ? { detail } : {}),
    extension,
    pattern: patternForPartCount(parts.length)
  };
}

function readSupportedExtension(fileName: string): ParsedFolderFileName["extension"] | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  const extension = fileName.slice(dotIndex).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(extension) ? (extension as ParsedFolderFileName["extension"]) : null;
}

function detectDatePrecision(value: string): FolderLearningDatePrecision | null {
  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    return isRealIsoDate(value) ? "day" : null;
  }

  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) {
    return "month";
  }

  if (/^(19|20)\d{2}$/.test(value)) {
    return "year";
  }

  return null;
}

function isRealIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isNormalizedNameBlock(value: string): boolean {
  return NORMALIZED_NAME_BLOCK.test(value);
}

function patternForPartCount(partCount: number): FolderNamingPattern {
  if (partCount === 5) {
    return "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL";
  }

  if (partCount === 4) {
    return "DATE_CIBLE_DOCUMENT_EMETTEUR";
  }

  return "DATE_CIBLE_DOCUMENT";
}
