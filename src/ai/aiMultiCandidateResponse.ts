import { normalizeNameBlock } from "../naming/documentNameV2";
import { normalizeTargetFolderRelative } from "../naming/targetFolder";
import {
  AI_CLASSIFICATION_LIMITS,
  type AiClassificationSuggestion,
  type AiClassificationValidationError,
  type AiClassificationValidationResult
} from "./aiClassificationTypes";
import { validateAiClassificationSuggestion } from "./aiClassificationValidator";

export type AiCandidateFieldKey =
  | "dateToken"
  | "subject"
  | "target"
  | "targetKind"
  | "documentType"
  | "issuer"
  | "detail";

export interface AiCandidate {
  value: string;
  score: number;
  reason: string;
  role?: string;
  exists?: boolean;
  requiresCreation?: boolean;
}

export interface AiFieldCandidates {
  selected?: string;
  candidates: AiCandidate[];
}

export interface AiMultiCandidateResponse {
  fields: Record<AiCandidateFieldKey, AiFieldCandidates>;
  folderCandidates: AiCandidate[];
  fileNameCandidates: AiCandidate[];
  warnings: string[];
  confidence: number;
  source: "ollama";
}

export type AiMultiCandidateValidationResult =
  | {
      status: "valid";
      response: AiMultiCandidateResponse;
    }
  | {
      status: "invalid";
      error: AiClassificationValidationError;
    };

const FIELD_KEYS: AiCandidateFieldKey[] = [
  "dateToken",
  "subject",
  "target",
  "targetKind",
  "documentType",
  "issuer",
  "detail"
];

const TOP_LEVEL_KEYS = new Set([
  "fields",
  "folderCandidates",
  "fileNameCandidates",
  "warnings",
  "confidence",
  "source"
]);
const CANDIDATE_KEYS = new Set(["value", "score", "reason", "role", "exists", "requiresCreation"]);
const MAX_CANDIDATES = 3;
const TARGET_KIND_VALUES = new Set(["person", "household", "vehicle", "property", "other"]);
const GENERIC_TARGET_VALUES = new Set([
  "person",
  "personne",
  "household",
  "vehicle",
  "vehicule",
  "document",
  "property",
  "bien",
  "other",
  "autre"
]);

export function validateAiMultiCandidateResponse(value: unknown): AiMultiCandidateValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_OUTPUT_NOT_OBJECT", "La réponse IA multi-candidats n'est pas un objet JSON.");
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      return invalid("AI_OUTPUT_UNKNOWN_FIELD", "La réponse IA contient un champ non prévu.", key);
    }
  }

  if (record.source !== "ollama") {
    return invalid("AI_SOURCE_INVALID", "Source de suggestion IA invalide.", "source");
  }

  if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence)) {
    return invalid("AI_CONFIDENCE_INVALID", "Score IA invalide.", "confidence");
  }

  if (record.confidence < 0 || record.confidence > 100) {
    return invalid("AI_CONFIDENCE_INVALID", "Score IA hors bornes 0..100.", "confidence");
  }

  const fields = readFields(record.fields);
  if (!("ok" in fields)) {
    return fields;
  }

  const fieldConsistency = validateSelectedFields(fields.value);
  if (!("ok" in fieldConsistency)) {
    return fieldConsistency;
  }

  const folderCandidates = readCandidateList(record.folderCandidates, "folderCandidates", true);
  if (!("ok" in folderCandidates)) {
    return folderCandidates;
  }

  const fileNameCandidates = readCandidateList(record.fileNameCandidates, "fileNameCandidates", false);
  if (!("ok" in fileNameCandidates)) {
    return fileNameCandidates;
  }

  if (!isStringArrayOrMissing(record.warnings)) {
    return invalid("AI_FIELD_INVALID", "Liste d'avertissements IA invalide.", "warnings");
  }

  return {
    status: "valid",
    response: {
      fields: fields.value,
      folderCandidates: folderCandidates.value,
      fileNameCandidates: fileNameCandidates.value,
      warnings: normalizeStringList(record.warnings, AI_CLASSIFICATION_LIMITS.warnings),
      confidence: record.confidence,
      source: "ollama"
    }
  };
}

export function adaptMultiCandidateResponseToSuggestion(
  response: AiMultiCandidateResponse
): AiClassificationValidationResult {
  const rawSuggestion: AiClassificationSuggestion = {
    ...readSelectedFields(response),
    ...(selectBestCandidate(response.folderCandidates)?.value
      ? { targetFolder: selectBestCandidate(response.folderCandidates)?.value }
      : {}),
    ...(selectBestCandidate(response.fileNameCandidates)?.value
      ? { proposedName: selectBestCandidate(response.fileNameCandidates)?.value }
      : {}),
    confidence: response.confidence,
    reasons: collectReasons(response),
    warnings: response.warnings,
    source: "ollama"
  };

  return validateAiClassificationSuggestion(rawSuggestion);
}

function readFields(
  value: unknown
): { ok: true; value: Record<AiCandidateFieldKey, AiFieldCandidates> } | AiMultiCandidateValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_FIELD_INVALID", "Bloc fields IA invalide.", "fields");
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!FIELD_KEYS.includes(key as AiCandidateFieldKey)) {
      return invalid("AI_OUTPUT_UNKNOWN_FIELD", "Champ IA inconnu dans fields.", `fields.${key}`);
    }
  }

  const result = {} as Record<AiCandidateFieldKey, AiFieldCandidates>;
  for (const key of FIELD_KEYS) {
    const field = readFieldCandidates(record[key], key);
    if (!("ok" in field)) {
      return field;
    }

    result[key] = field.value;
  }

  return { ok: true, value: result };
}

function readFieldCandidates(
  value: unknown,
  key: AiCandidateFieldKey
): { ok: true; value: AiFieldCandidates } | AiMultiCandidateValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_FIELD_INVALID", "Champ IA multi-candidats invalide.", `fields.${key}`);
  }

  const record = value as Record<string, unknown>;
  if (record.selected !== undefined && typeof record.selected !== "string") {
    return invalid("AI_FIELD_INVALID", "Sélection IA invalide.", `fields.${key}.selected`);
  }

  const candidates = readCandidateList(record.candidates, `fields.${key}.candidates`, false);
  if (!("ok" in candidates)) {
    return candidates;
  }

  if (key === "targetKind") {
    for (const candidate of candidates.value) {
      if (!TARGET_KIND_VALUES.has(normalizeNameBlock(candidate.value))) {
        return invalid(
          "AI_FIELD_INVALID",
          "targetKind IA invalide. Valeurs attendues : person, household, vehicle, property, other.",
          `fields.${key}.candidates`
        );
      }
    }
  }

  return {
    ok: true,
    value: {
      ...(typeof record.selected === "string" && record.selected.trim()
        ? { selected: limitString(record.selected.trim(), AI_CLASSIFICATION_LIMITS.listItemChars) }
        : {}),
      candidates: candidates.value
    }
  };
}

function readCandidateList(
  value: unknown,
  field: string,
  isFolderList: boolean
): { ok: true; value: AiCandidate[] } | AiMultiCandidateValidationResult {
  if (!Array.isArray(value)) {
    return invalid("AI_FIELD_INVALID", "Liste de candidats IA invalide.", field);
  }

  const candidates: AiCandidate[] = [];
  for (const [index, entry] of value.entries()) {
    const candidate = readCandidate(entry, `${field}.${index}`, isFolderList);
    if (!("ok" in candidate)) {
      return candidate;
    }

    candidates.push(candidate.value);
  }

  return {
    ok: true,
    value: candidates.slice(0, MAX_CANDIDATES)
  };
}

function readCandidate(
  value: unknown,
  field: string,
  isFolderCandidate: boolean
): { ok: true; value: AiCandidate } | AiMultiCandidateValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_FIELD_INVALID", "Candidat IA invalide.", field);
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!CANDIDATE_KEYS.has(key)) {
      return invalid("AI_OUTPUT_UNKNOWN_FIELD", "Champ de candidat IA non prévu.", `${field}.${key}`);
    }
  }

  if (typeof record.value !== "string" || !record.value.trim()) {
    return invalid("AI_FIELD_INVALID", "Valeur de candidat IA invalide.", `${field}.value`);
  }

  if (typeof record.score !== "number" || !Number.isFinite(record.score) || record.score < 0 || record.score > 100) {
    return invalid("AI_CONFIDENCE_INVALID", "Score de candidat IA hors bornes.", `${field}.score`);
  }

  if (typeof record.reason !== "string" || !record.reason.trim()) {
    return invalid("AI_FIELD_INVALID", "Raison de candidat IA invalide.", `${field}.reason`);
  }

  if (record.role !== undefined && typeof record.role !== "string") {
    return invalid("AI_FIELD_INVALID", "Rôle de candidat IA invalide.", `${field}.role`);
  }

  if (record.exists !== undefined && typeof record.exists !== "boolean") {
    return invalid("AI_FIELD_INVALID", "Indicateur exists de candidat IA invalide.", `${field}.exists`);
  }

  if (record.requiresCreation !== undefined && typeof record.requiresCreation !== "boolean") {
    return invalid(
      "AI_FIELD_INVALID",
      "Indicateur requiresCreation de candidat IA invalide.",
      `${field}.requiresCreation`
    );
  }

  if (!isFolderCandidate && looksLikePath(record.value)) {
    return invalid("AI_FIELD_INVALID", "Candidat IA invalide : les chemins locaux sont refusés.", `${field}.value`);
  }

  const normalizedValue = isFolderCandidate
    ? normalizeFolderCandidate(record.value)
    : limitString(record.value.trim(), AI_CLASSIFICATION_LIMITS.listItemChars);
  if (!normalizedValue) {
    return invalid("AI_TARGET_FOLDER_INVALID", "Candidat dossier IA invalide ou dangereux.", `${field}.value`);
  }

  return {
    ok: true,
    value: {
      value: normalizedValue,
      score: Math.round(record.score),
      reason: limitString(record.reason.trim(), AI_CLASSIFICATION_LIMITS.listItemChars),
      ...(typeof record.role === "string" && record.role.trim()
        ? { role: normalizeNameBlock(record.role).slice(0, 40) }
        : {}),
      ...(typeof record.exists === "boolean" ? { exists: record.exists } : {}),
      ...(typeof record.requiresCreation === "boolean"
        ? { requiresCreation: record.requiresCreation }
        : {})
    }
  };
}

function validateSelectedFields(
  fields: Record<AiCandidateFieldKey, AiFieldCandidates>
): { ok: true } | Extract<AiMultiCandidateValidationResult, { status: "invalid" }> {
  for (const key of FIELD_KEYS) {
    const selected = fields[key].selected?.trim();
    if (!selected) {
      continue;
    }

    const hasSelectedCandidate = fields[key].candidates.some((candidate) => candidate.value === selected);
    if (!hasSelectedCandidate) {
      return invalid(
        "AI_FIELD_INVALID",
        "Le candidat sélectionné IA doit être présent dans la liste des candidats.",
        `fields.${key}.selected`
      );
    }
  }

  const selectedTarget = normalizeNameBlock(fields.target.selected);
  const selectedDocumentType = normalizeNameBlock(fields.documentType.selected);
  const selectedTargetKind = normalizeNameBlock(fields.targetKind.selected);

  if (selectedTargetKind && !TARGET_KIND_VALUES.has(selectedTargetKind)) {
    return invalid(
      "AI_FIELD_INVALID",
      "targetKind IA invalide. Valeurs attendues : person, household, vehicle, property, other.",
      "fields.targetKind.selected"
    );
  }

  if (selectedTarget && GENERIC_TARGET_VALUES.has(selectedTarget)) {
    return invalid(
      "AI_FIELD_INVALID",
      "Cible IA invalide : target doit être la valeur de nommage, pas une nature générique.",
      "fields.target.selected"
    );
  }

  if (selectedTarget && selectedDocumentType && selectedTarget === selectedDocumentType) {
    return invalid(
      "AI_FIELD_INVALID",
      "Cible IA invalide : target ne doit pas être égal à documentType.",
      "fields.target.selected"
    );
  }

  return { ok: true };
}

function normalizeFolderCandidate(value: string): string | null {
  const normalized = normalizeTargetFolderRelative(value);
  return normalized.ok ? normalized.value : null;
}

function looksLikePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || /[\\/]/.test(value);
}

function readSelectedFields(response: AiMultiCandidateResponse): Partial<AiClassificationSuggestion> {
  return {
    ...(response.fields.dateToken.selected ? { dateToken: response.fields.dateToken.selected } : {}),
    ...(response.fields.subject.selected ? { subject: response.fields.subject.selected } : {}),
    ...(response.fields.target.selected ? { target: response.fields.target.selected } : {}),
    ...(response.fields.documentType.selected ? { documentType: response.fields.documentType.selected } : {}),
    ...(response.fields.issuer.selected ? { issuer: response.fields.issuer.selected } : {}),
    ...(response.fields.detail.selected ? { detail: response.fields.detail.selected } : {})
  };
}

function collectReasons(response: AiMultiCandidateResponse): string[] {
  const reasons = FIELD_KEYS.flatMap((key) => {
    const selected = response.fields[key].selected;
    const candidate = response.fields[key].candidates.find((item) => item.value === selected);
    return candidate?.reason ? [`${key}: ${candidate.reason}`] : [];
  });

  const folder = selectBestCandidate(response.folderCandidates);
  const fileName = selectBestCandidate(response.fileNameCandidates);
  if (folder) {
    reasons.push(`dossier: ${folder.reason}`);
  }
  if (fileName) {
    reasons.push(`nom: ${fileName.reason}`);
  }

  return uniqueStrings(reasons).slice(0, AI_CLASSIFICATION_LIMITS.reasons);
}

function selectBestCandidate(candidates: AiCandidate[]): AiCandidate | null {
  return [...candidates].sort((left, right) =>
    right.score - left.score || left.value.localeCompare(right.value, "fr", { sensitivity: "base" })
  )[0] ?? null;
}

function invalid(
  code: AiClassificationValidationError["code"],
  message: string,
  field?: string
): Extract<AiMultiCandidateValidationResult, { status: "invalid" }> {
  return {
    status: "invalid",
    error: {
      code,
      message,
      ...(field ? { field } : {})
    }
  };
}

function isJsonObject(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArrayOrMissing(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => limitString(item.trim(), AI_CLASSIFICATION_LIMITS.listItemChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function limitString(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}
