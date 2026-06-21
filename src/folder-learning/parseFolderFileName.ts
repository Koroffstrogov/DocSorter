export type FolderLearningDatePrecision = "day" | "month" | "year" | "school-year";

export interface FolderLearningFileEntry {
  name: string;
  isFile?: boolean;
}

export interface ParsedFolderFileName {
  originalName: string;
  dateToken: string;
  datePrecision: FolderLearningDatePrecision;
  blocks: string[];
  target: string;
  documentType: string;
  subject?: string;
  issuer?: string;
  detail?: string;
  extension: ".pdf" | ".jpg" | ".jpeg" | ".png";
  pattern: FolderNamingPattern;
}

export type FolderNamingPattern =
  | "DATE_DOCUMENT"
  | "DATE_DOCUMENT_EMETTEUR"
  | "DATE_DOCUMENT_CIBLE"
  | "DATE_DOCUMENT_CIBLE_EMETTEUR"
  | "DATE_CIBLE_DOCUMENT"
  | "DATE_CIBLE_DOCUMENT_SUBJECT"
  | "DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR"
  | "DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR_DETAIL"
  | "DATE_CIBLE_DOCUMENT_EMETTEUR"
  | "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL"
  | "DATE_DOCUMENT_CIBLE_EMETTEUR_DETAIL";

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
  if (parts.length < 2 || parts.length > 6 || parts.some((part) => !isNormalizedNameBlock(part))) {
    return null;
  }

  const [dateToken, ...blocks] = parts;
  const datePrecision = detectDatePrecision(dateToken);
  if (!datePrecision) {
    return null;
  }
  const semantic = defaultSemanticFromBlocks(blocks);

  return {
    originalName: fileName,
    dateToken,
    datePrecision,
    blocks,
    target: semantic.target,
    documentType: semantic.documentType,
    ...(semantic.subject ? { subject: semantic.subject } : {}),
    ...(semantic.issuer ? { issuer: semantic.issuer } : {}),
    ...(semantic.detail ? { detail: semantic.detail } : {}),
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

  if (isSchoolYearToken(value)) {
    return "school-year";
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

function defaultSemanticFromBlocks(blocks: string[]): {
  target: string;
  documentType: string;
  issuer?: string;
  subject?: string;
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
    ...(third ? { issuer: third } : {}),
    ...(fourth ? { detail: fourth } : {})
  };
}

function patternForPartCount(partCount: number): FolderNamingPattern {
  if (partCount === 2) {
    return "DATE_DOCUMENT";
  }

  if (partCount === 5) {
    return "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL";
  }

  if (partCount === 6) {
    return "DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR_DETAIL";
  }

  if (partCount === 4) {
    return "DATE_CIBLE_DOCUMENT_EMETTEUR";
  }

  return "DATE_CIBLE_DOCUMENT";
}

function isSchoolYearToken(value: string): boolean {
  const match = value.match(/^((?:19|20)\d{2})-((?:19|20)\d{2})$/);
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
}
