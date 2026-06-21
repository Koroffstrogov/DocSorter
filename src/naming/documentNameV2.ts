import type { NamingDraft } from "./namingDraft";

export interface NamingInputV2 {
  dateToken: string;
  target: string;
  documentType: string;
  subject?: string;
  issuer?: string;
  detail?: string;
  extension: string;
}

export type NamingV2MessageLevel = "error" | "warning" | "info";

export type NamingV2MessageCode =
  | "DATE_REQUIRED"
  | "DATE_INVALID"
  | "TARGET_REQUIRED"
  | "DOCUMENT_TYPE_REQUIRED"
  | "RESERVED_WINDOWS_NAME"
  | "EMPTY_FILENAME"
  | "SENSITIVE_DATE"
  | "SENSITIVE_NUMBER"
  | "SENSITIVE_IDENTIFIER"
  | "LONG_FILENAME"
  | "LONG_PATH"
  | "NORMALIZED";

export interface NamingV2Message {
  level: NamingV2MessageLevel;
  code: NamingV2MessageCode;
  field?: keyof NamingInputV2;
  message: string;
}

export interface GeneratedDocumentNameV2 {
  filename: string;
  baseName: string;
  extension: string;
  isValid: boolean;
  normalizedInput: NamingInputV2;
  messages: NamingV2Message[];
}

export interface GenerateDocumentNameV2Options {
  targetDirectoryPath?: string;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WINDOWS_FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const CONTROL_CHARS = /[\u0000-\u001F]/g;
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
const LONG_BASE_WARNING_LENGTH = 100;
const LONG_PATH_WARNING_LENGTH = 180;

export function generateDocumentNameV2(
  input: NamingInputV2,
  options: GenerateDocumentNameV2Options = {}
): GeneratedDocumentNameV2 {
  const messages: NamingV2Message[] = [];
  const normalizedInput: NamingInputV2 = {
    dateToken: normalizeDateToken(input.dateToken),
    target: normalizeNameBlock(input.target),
    documentType: normalizeNameBlock(input.documentType),
    subject: normalizeNameBlock(input.subject),
    issuer: normalizeNameBlock(input.issuer),
    detail: normalizeNameBlock(input.detail),
    extension: normalizeExtension(input.extension)
  };

  addDateMessages(input.dateToken, normalizedInput.dateToken, messages);
  addRequiredBlockMessage("target", normalizedInput.target, "Cible obligatoire.", messages);
  addRequiredBlockMessage(
    "documentType",
    normalizedInput.documentType,
    "Type de document obligatoire.",
    messages
  );
  addOptionalReservedBlockMessages(normalizedInput, messages);
  addNormalizationMessage(input, normalizedInput, messages);
  messages.push(...detectSensitiveNameParts(input));

  const blocks = [
    normalizedInput.dateToken,
    normalizedInput.target,
    normalizedInput.documentType,
    normalizedInput.subject,
    normalizedInput.issuer,
    normalizedInput.detail
  ].filter(Boolean);
  const baseName = blocks.join("_");
  if (!baseName) {
    messages.push({
      level: "error",
      code: "EMPTY_FILENAME",
      message: "Nom de fichier vide."
    });
  }

  if (isReservedWindowsName(baseName)) {
    messages.push({
      level: "error",
      code: "RESERVED_WINDOWS_NAME",
      message: "Nom de fichier réservé par Windows."
    });
  }

  if (baseName.length > LONG_BASE_WARNING_LENGTH) {
    messages.push({
      level: "warning",
      code: "LONG_FILENAME",
      message: "Nom de fichier long : vérifier la lisibilité et le chemin complet."
    });
  }

  const filename = `${baseName}${normalizedInput.extension}`;
  if (options.targetDirectoryPath?.trim()) {
    const fullPath = `${options.targetDirectoryPath.replace(/[\\/]+$/g, "")}\\${filename}`;
    if (fullPath.length > LONG_PATH_WARNING_LENGTH) {
      messages.push({
        level: "warning",
        code: "LONG_PATH",
        message: "Chemin complet potentiellement long : vérifier la destination finale."
      });
    }
  }

  return {
    filename,
    baseName,
    extension: normalizedInput.extension,
    isValid: !messages.some((message) => message.level === "error"),
    normalizedInput,
    messages
  };
}

export function normalizeNameBlock(value: string | undefined): string {
  return sanitizeWindowsFileName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function sanitizeWindowsFileName(value: string | undefined): string {
  return removeAccents(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(WINDOWS_FORBIDDEN_CHARS, " ")
    .replace(/[_\s-]+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

export function validateDateToken(value: string): NamingV2Message | null {
  const token = normalizeDateToken(value);
  if (!token) {
    return {
      level: "error",
      code: "DATE_REQUIRED",
      field: "dateToken",
      message: "Date obligatoire."
    };
  }

  if (token === "date-inconnue" || /^(19|20)\d{2}-env$/.test(token)) {
    return null;
  }

  if (/^(19|20)\d{2}$/.test(token)) {
    return null;
  }

  if (isSchoolYearToken(token)) {
    return null;
  }

  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(token)) {
    return null;
  }

  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(token)) {
    return isRealIsoDate(token)
      ? null
      : {
          level: "error",
          code: "DATE_INVALID",
          field: "dateToken",
          message: "Date invalide."
        };
  }

  return {
    level: "error",
    code: "DATE_INVALID",
    field: "dateToken",
    message: "Date non contrôlée. Utiliser AAAA-MM-JJ, AAAA-MM, AAAA-AAAA, AAAA, AAAA-env ou date-inconnue."
  };
}

export function detectSensitiveNameParts(input: NamingInputV2): NamingV2Message[] {
  const messages: NamingV2Message[] = [];
  const fields: Array<keyof NamingInputV2> = ["target", "documentType", "subject", "issuer", "detail"];

  for (const field of fields) {
    const value = input[field];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    if (containsSensitiveDate(value)) {
      messages.push({
        level: "warning",
        code: "SENSITIVE_DATE",
        field,
        message: "Date sensible probable détectée hors bloc date."
      });
    }

    if (containsFrenchSocialSecurityNumber(value)) {
      messages.push({
        level: "warning",
        code: "SENSITIVE_NUMBER",
        field,
        message: "Numéro sensible probable détecté."
      });
    }

    if (containsLongIdentifier(value)) {
      messages.push({
        level: "warning",
        code: "SENSITIVE_IDENTIFIER",
        field,
        message: "Identifiant long probable détecté."
      });
    }
  }

  return messages;
}

export function applyCollisionSuffix(fileName: string, index: number): string {
  const suffixIndex = Math.max(2, Math.floor(index));
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
  return `${baseName}_${String(suffixIndex).padStart(2, "0")}${extension}`;
}

export function namingInputV2FromLegacyDraft(
  draft: NamingDraft,
  extension: string
): NamingInputV2 {
  return {
    dateToken: draft.documentDate,
    target: draft.subject,
    documentType: draft.documentType,
    detail: draft.keywords,
    extension
  };
}

export function generateDocumentNameV2FromLegacyDraft(
  draft: NamingDraft,
  extension: string
): GeneratedDocumentNameV2 {
  return generateDocumentNameV2(namingInputV2FromLegacyDraft(draft, extension));
}

function normalizeDateToken(value: string): string {
  const trimmed = (value ?? "").trim().toLowerCase();
  const schoolYear = trimmed.match(/^((?:19|20)\d{2})[/-]((?:19|20)\d{2})$/);
  return schoolYear ? `${schoolYear[1]}-${schoolYear[2]}` : trimmed;
}

function normalizeExtension(value: string): string {
  const normalized = normalizeNameBlock(value);
  return normalized ? `.${normalized.replace(/^\.+/, "")}` : "";
}

function addDateMessages(
  originalDateToken: string,
  normalizedDateToken: string,
  messages: NamingV2Message[]
): void {
  const dateMessage = validateDateToken(originalDateToken);
  if (dateMessage) {
    messages.push(dateMessage);
    return;
  }

  if (originalDateToken.trim() !== normalizedDateToken) {
    messages.push({
      level: "info",
      code: "NORMALIZED",
      field: "dateToken",
      message: "Date normalisée."
    });
  }
}

function addRequiredBlockMessage(
  field: "target" | "documentType",
  value: string,
  message: string,
  messages: NamingV2Message[]
): void {
  if (!value) {
    messages.push({
      level: "error",
      code: field === "target" ? "TARGET_REQUIRED" : "DOCUMENT_TYPE_REQUIRED",
      field,
      message
    });
  } else if (isReservedWindowsName(value)) {
    messages.push({
      level: "error",
      code: "RESERVED_WINDOWS_NAME",
      field,
      message: "Bloc réservé par Windows."
    });
  }
}

function addOptionalReservedBlockMessages(
  input: NamingInputV2,
  messages: NamingV2Message[]
): void {
  const fields: Array<"subject" | "issuer" | "detail"> = ["subject", "issuer", "detail"];
  for (const field of fields) {
    const value = input[field];
    if (value && isReservedWindowsName(value)) {
      messages.push({
        level: "error",
        code: "RESERVED_WINDOWS_NAME",
        field,
        message: "Bloc réservé par Windows."
      });
    }
  }
}

function addNormalizationMessage(
  input: NamingInputV2,
  normalizedInput: NamingInputV2,
  messages: NamingV2Message[]
): void {
  const changed = (
    [
      ["target", input.target, normalizedInput.target],
      ["documentType", input.documentType, normalizedInput.documentType],
      ["subject", input.subject ?? "", normalizedInput.subject ?? ""],
      ["issuer", input.issuer ?? "", normalizedInput.issuer ?? ""],
      ["detail", input.detail ?? "", normalizedInput.detail ?? ""],
      ["extension", input.extension, normalizedInput.extension]
    ] as const
  ).some(([, original, normalized]) => normalizeForComparison(original) !== normalized);

  if (changed) {
    messages.push({
      level: "info",
      code: "NORMALIZED",
      message: "Certains blocs ont été normalisés."
    });
  }
}

function isRealIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isSchoolYearToken(value: string): boolean {
  const match = value.match(/^((?:19|20)\d{2})-((?:19|20)\d{2})$/);
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
}

function containsSensitiveDate(value: string): boolean {
  return (
    /(?:^|[^0-9])([0-3]?\d)[-/]([01]?\d)[-/]((?:19|20)\d{2})(?:$|[^0-9])/.test(value) ||
    /(?:^|[^0-9])((?:19|20)\d{2})-([01]\d)-([0-3]\d)(?:$|[^0-9])/.test(value)
  );
}

function containsFrenchSocialSecurityNumber(value: string): boolean {
  const compact = value.replace(/\D/g, "");
  return /[12]\d{12}(?:\d{2})?/.test(compact);
}

function containsLongIdentifier(value: string): boolean {
  const compact = value.replace(/[-_\s]/g, "");
  return /[A-Za-z0-9]{18,}/.test(compact) && /\d/.test(compact);
}

function isReservedWindowsName(value: string): boolean {
  const baseName = value.split(".")[0]?.toUpperCase() ?? "";
  return RESERVED_WINDOWS_NAMES.has(baseName);
}

function normalizeForComparison(value: string): string {
  return normalizeNameBlock(value);
}

function removeAccents(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "");
}
