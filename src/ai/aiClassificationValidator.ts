import { normalizeNameBlock } from "../naming/documentNameV2";
import { normalizeTargetFolderRelative } from "../naming/targetFolder";
import {
  AI_CLASSIFICATION_LIMITS,
  type AiClassificationInput,
  type AiClassificationSuggestion,
  type AiClassificationValidationError,
  type AiClassificationValidationResult,
  type BoundedAiClassificationInput
} from "./aiClassificationTypes";

const allowedSuggestionKeys = new Set([
  "dateToken",
  "subject",
  "target",
  "documentType",
  "issuer",
  "detail",
  "proposedName",
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
    availableRootFolders: boundFolderList(input.availableRootFolders ?? [], true),
    knownRelativeFolders: boundFolderList(input.knownRelativeFolders ?? [], false),
    knownTargetHints: boundKnownTargetHints(input.knownTargetHints ?? []),
    namingConvention: limitString(
      input.namingConvention ?? "",
      AI_CLASSIFICATION_LIMITS.namingConventionChars
    ),
    detectedDate: validateLegacyDate(input.detectedDate ?? "") ? input.detectedDate?.trim() ?? "" : "",
    detectedYear: /^(19|20)\d{2}$/.test(input.detectedYear?.trim() ?? "")
      ? input.detectedYear?.trim() ?? ""
      : ""
  };
}

function boundKnownTargetHints(
  value: BoundedAiClassificationInput["knownTargetHints"]
): BoundedAiClassificationInput["knownTargetHints"] {
  return value
    .filter((hint) =>
      hint &&
      typeof hint.fileAlias === "string" &&
      typeof hint.displayName === "string" &&
      typeof hint.kind === "string" &&
      Array.isArray(hint.matchedAliases) &&
      Array.isArray(hint.evidenceSources)
    )
    .slice(0, AI_CLASSIFICATION_LIMITS.knownTargetHintCount)
    .map((hint) => ({
      fileAlias: limitString(redactPathLikeText(hint.fileAlias), AI_CLASSIFICATION_LIMITS.knownTargetHintChars),
      displayName: limitString(redactPathLikeText(hint.displayName), AI_CLASSIFICATION_LIMITS.knownTargetHintChars),
      kind: hint.kind,
      matchedAliases: hint.matchedAliases
        .map((alias) => limitString(redactPathLikeText(alias), AI_CLASSIFICATION_LIMITS.knownTargetHintChars))
        .filter(Boolean)
        .slice(0, AI_CLASSIFICATION_LIMITS.knownTargetHintAliases),
      evidenceSources: hint.evidenceSources.filter((source) =>
        source === "text" ||
        source === "ocr" ||
        source === "filename" ||
        source === "selected-folder" ||
        source === "folder-profile" ||
        source === "known-target-alias"
      )
    }))
    .filter((hint) =>
      hint.fileAlias &&
      hint.displayName &&
      hint.matchedAliases.length > 0 &&
      hint.evidenceSources.length > 0
    );
}

function redactPathLikeText(value: string): string {
  return value
    .replace(/[a-zA-Z]:\\[^\s"',;]+/g, "[chemin-local]")
    .replace(/\\\\[^\s"',;]+/g, "[chemin-local]")
    .replace(/file:\/\/[^\s"',;]+/gi, "[chemin-local]");
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

  const dateToken = normalizeAiDateToken(readOptionalString(record.dateToken));
  if (!dateToken.ok) {
    return invalid(
      "AI_DATE_INVALID",
      "Date IA invalide. Utiliser AAAA-MM-JJ, AAAA-MM ou AAAA.",
      "dateToken"
    );
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

  const subject = normalizeOptionalNameBlock(record.subject);
  const target = normalizeOptionalNameBlock(record.target);
  const documentType = normalizeOptionalNameBlock(record.documentType);
  const issuer = normalizeOptionalNameBlock(record.issuer);
  const detail = normalizeOptionalNameBlock(record.detail);
  const proposedName = readOptionalString(record.proposedName);
  const reasons = normalizeStringList(record.reasons, AI_CLASSIFICATION_LIMITS.reasons);
  const warnings = normalizeStringList(record.warnings, AI_CLASSIFICATION_LIMITS.warnings);

  if (
    (record.dateToken !== undefined && typeof record.dateToken !== "string") ||
    (record.subject !== undefined && typeof record.subject !== "string") ||
    (record.target !== undefined && typeof record.target !== "string") ||
    (record.documentType !== undefined && typeof record.documentType !== "string") ||
    (record.issuer !== undefined && typeof record.issuer !== "string") ||
    (record.detail !== undefined && typeof record.detail !== "string") ||
    (record.proposedName !== undefined && typeof record.proposedName !== "string") ||
    (record.targetFolder !== undefined && typeof record.targetFolder !== "string")
  ) {
    return invalid("AI_FIELD_INVALID", "Champ IA invalide.", "field");
  }

  if (
    !isStringArrayOrMissing(record.reasons) ||
    !isStringArrayOrMissing(record.warnings)
  ) {
    return invalid("AI_FIELD_INVALID", "Liste IA invalide.", "list");
  }

  return {
    status: "valid",
    suggestion: {
      ...(dateToken.value ? { dateToken: dateToken.value } : {}),
      ...(subject ? { subject } : {}),
      ...(target ? { target } : {}),
      ...(documentType ? { documentType } : {}),
      ...(issuer ? { issuer } : {}),
      ...(detail ? { detail } : {}),
      ...(proposedName ? { proposedName: limitString(proposedName, AI_CLASSIFICATION_LIMITS.listItemChars) } : {}),
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

function normalizeAiDateToken(value: string): { ok: true; value: string } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }

  if (/^(19|20)\d{2}$/.test(trimmed)) {
    return { ok: true, value: trimmed };
  }

  const monthMatch = trimmed.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/);
  if (monthMatch) {
    return { ok: true, value: `${monthMatch[1]}-${monthMatch[2]}` };
  }

  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(trimmed)) {
    return validateLegacyDate(trimmed) ? { ok: true, value: trimmed } : { ok: false };
  }

  return { ok: false };
}

export function validateLegacyDate(value: string): boolean {
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

function normalizeOptionalNameBlock(value: unknown): string {
  return typeof value === "string" ? normalizeNameBlock(value) : "";
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
