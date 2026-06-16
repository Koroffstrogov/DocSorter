import { normalizeFilenameBlock } from "../naming/namingDraft";
import { normalizeTargetFolderRelative } from "../naming/targetFolder";
import {
  AI_CLASSIFICATION_LIMITS,
  type AiClassificationInput,
  type AiClassificationSuggestion,
  type AiClassificationValidationError,
  type AiClassificationValidationResult,
  type AiRuleSuggestionSnapshot,
  type BoundedAiClassificationInput
} from "./aiClassificationTypes";

const allowedSuggestionKeys = new Set([
  "date",
  "documentType",
  "subject",
  "keywords",
  "targetFolder",
  "confidence",
  "reasons",
  "warnings",
  "source"
]);

export function boundAiClassificationInput(
  input: AiClassificationInput
): BoundedAiClassificationInput {
  return {
    filename: limitString(input.filename, AI_CLASSIFICATION_LIMITS.filenameChars),
    extension: normalizeExtension(input.extension),
    extractedTextExcerpt: limitString(
      input.extractedTextExcerpt ?? "",
      AI_CLASSIFICATION_LIMITS.textExcerptChars
    ),
    ocrTextExcerpt: limitString(
      input.ocrTextExcerpt ?? "",
      AI_CLASSIFICATION_LIMITS.textExcerptChars
    ),
    currentRuleSuggestions: boundRuleSuggestions(input.currentRuleSuggestions ?? null),
    availableRootFolders: boundFolderList(input.availableRootFolders ?? [], true),
    knownRelativeFolders: boundFolderList(input.knownRelativeFolders ?? [], false),
    namingConvention: limitString(
      input.namingConvention ?? "",
      AI_CLASSIFICATION_LIMITS.namingConventionChars
    ),
    detectedDate: validateDate(input.detectedDate ?? "") ? input.detectedDate?.trim() ?? "" : "",
    detectedYear: /^(19|20)\d{2}$/.test(input.detectedYear?.trim() ?? "")
      ? input.detectedYear?.trim() ?? ""
      : ""
  };
}

export function validateAiClassificationSuggestion(
  value: unknown
): AiClassificationValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_OUTPUT_NOT_OBJECT", "La suggestion IA n'est pas un objet JSON.");
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedSuggestionKeys.has(key)) {
      return invalid(
        "AI_OUTPUT_UNKNOWN_FIELD",
        "La suggestion IA contient un champ non prévu.",
        key
      );
    }
  }

  if (record.source !== "simulated-ai" && record.source !== "ollama") {
    return invalid("AI_SOURCE_INVALID", "Source de suggestion IA invalide.", "source");
  }

  if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence)) {
    return invalid("AI_CONFIDENCE_INVALID", "Score IA invalide.", "confidence");
  }

  if (record.confidence < 0 || record.confidence > 100) {
    return invalid("AI_CONFIDENCE_INVALID", "Score IA hors bornes 0..100.", "confidence");
  }

  const date = readOptionalString(record.date);
  if (date && !validateDate(date)) {
    return invalid("AI_DATE_INVALID", "Date IA invalide. Utiliser AAAA-MM-JJ ou AAAA.", "date");
  }

  const targetFolder = readOptionalString(record.targetFolder);
  const normalizedTargetFolder = targetFolder ? normalizeTargetFolderRelative(targetFolder) : null;
  if (normalizedTargetFolder && !normalizedTargetFolder.ok) {
    return invalid(
      "AI_TARGET_FOLDER_INVALID",
      "Dossier cible IA invalide ou dangereux.",
      "targetFolder"
    );
  }

  const documentType = normalizeOptionalFilenameField(record.documentType);
  const subject = normalizeOptionalFilenameField(record.subject);
  const keywords = normalizeStringList(record.keywords, AI_CLASSIFICATION_LIMITS.keywords)
    .map(normalizeFilenameBlock)
    .filter(Boolean);
  const reasons = normalizeStringList(record.reasons, AI_CLASSIFICATION_LIMITS.reasons);
  const warnings = normalizeStringList(record.warnings, AI_CLASSIFICATION_LIMITS.warnings);

  if (
    (record.documentType !== undefined && typeof record.documentType !== "string") ||
    (record.subject !== undefined && typeof record.subject !== "string") ||
    (record.date !== undefined && typeof record.date !== "string") ||
    (record.targetFolder !== undefined && typeof record.targetFolder !== "string")
  ) {
    return invalid("AI_FIELD_INVALID", "Champ IA invalide.", "field");
  }

  if (
    !isStringArrayOrMissing(record.keywords) ||
    !isStringArrayOrMissing(record.reasons) ||
    !isStringArrayOrMissing(record.warnings)
  ) {
    return invalid("AI_FIELD_INVALID", "Liste IA invalide.", "list");
  }

  return {
    status: "valid",
    suggestion: {
      ...(date ? { date } : {}),
      ...(documentType ? { documentType } : {}),
      ...(subject ? { subject } : {}),
      keywords: uniqueStrings(keywords).slice(0, AI_CLASSIFICATION_LIMITS.keywords),
      ...(normalizedTargetFolder?.ok && normalizedTargetFolder.value
        ? { targetFolder: normalizedTargetFolder.value }
        : {}),
      confidence: record.confidence,
      reasons,
      warnings,
      source: record.source
    }
  };
}

export function validateDate(value: string): boolean {
  const trimmed = value.trim();
  if (/^(19|20)\d{2}$/.test(trimmed)) {
    return true;
  }

  if (!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === trimmed;
}

function boundRuleSuggestions(
  suggestions: AiRuleSuggestionSnapshot | null
): AiRuleSuggestionSnapshot | null {
  if (!suggestions) {
    return null;
  }

  return {
    date: validateDate(suggestions.date ?? "") ? suggestions.date?.trim() ?? null : null,
    documentType: normalizeFilenameBlock(suggestions.documentType ?? ""),
    subject: normalizeFilenameBlock(suggestions.subject ?? ""),
    keywords: uniqueStrings(
      (suggestions.keywords ?? [])
        .slice(0, AI_CLASSIFICATION_LIMITS.keywords)
        .map((keyword) => normalizeFilenameBlock(keyword))
        .filter(Boolean)
    ),
    targetFolder: normalizeSafeFolder(suggestions.targetFolder ?? ""),
    confidence:
      typeof suggestions.confidence === "number" && Number.isFinite(suggestions.confidence)
        ? Math.max(0, Math.min(100, suggestions.confidence))
        : undefined,
    reasons: normalizeStringList(suggestions.reasons, AI_CLASSIFICATION_LIMITS.reasons)
  };
}

function boundFolderList(folders: string[], rootOnly: boolean): string[] {
  const normalized = folders
    .map((folder) => normalizeSafeFolder(folder))
    .filter((folder): folder is string => Boolean(folder))
    .filter((folder) => !rootOnly || !folder.includes("/"))
    .slice(0, AI_CLASSIFICATION_LIMITS.folderCount);

  return uniqueStrings(normalized);
}

function normalizeSafeFolder(value: string): string | null {
  const result = normalizeTargetFolderRelative(value);
  return result.ok && result.value ? result.value : null;
}

function normalizeOptionalFilenameField(value: unknown): string {
  return typeof value === "string" ? normalizeFilenameBlock(value) : "";
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => limitString(item, AI_CLASSIFICATION_LIMITS.listItemChars))
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isStringArrayOrMissing(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isJsonObject(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeExtension(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function limitString(value: string, maxLength: number): string {
  const text = String(value);
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function invalid(
  code: AiClassificationValidationError["code"],
  message: string,
  field?: string
): AiClassificationValidationResult {
  return {
    status: "invalid",
    error: {
      code,
      message,
      ...(field ? { field } : {})
    }
  };
}
