import { normalizeNameBlock } from "../naming/documentNameV2";
import { normalizeTargetFolderRelative } from "../naming/targetFolder";
import {
  AI_CLASSIFICATION_LIMITS,
  type AiClassificationSuggestion,
  type AiClassificationValidationIssue,
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

export interface AiRejectedCandidate {
  field: string;
  index: number;
  rawValue?: string;
  normalizedValue?: string;
  reason: string;
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
  rejectedCandidates: AiRejectedCandidate[];
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
const UNKNOWN_DATE_VALUES = new Set([
  "date-inconnue",
  "date-inconnuee",
  "unknown",
  "inconnue",
  "inconnu",
  "non-renseignee",
  "non-renseigne",
  "n-a",
  "na",
  "aucune",
  "aucun"
]);
const GENERIC_DETAIL_VALUES = new Set([
  "consommation",
  "facture",
  "document",
  "paiement",
  "total",
  "service",
  "contrat"
]);
const SENSITIVE_NUMBER_PATTERN = /\b(?:[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}(?:\s?\d{2})?|\d{11,})\b/;
const FULL_DATE_PATTERN = /\b(?:[0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2}|(?:19|20)\d{2}-[01]\d-[0-3]\d)\b/;

type CandidateListMode =
  | { kind: "field"; fieldKey: AiCandidateFieldKey }
  | { kind: "folder" }
  | { kind: "fileName" };

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

  const fieldConsistency = normalizeSelectedFields(fields.value);

  const folderCandidates = readCandidateList(record.folderCandidates, "folderCandidates", { kind: "folder" });
  if (!("ok" in folderCandidates)) {
    return folderCandidates;
  }

  const fileNameCandidates = readCandidateList(record.fileNameCandidates, "fileNameCandidates", {
    kind: "fileName"
  });
  if (!("ok" in fileNameCandidates)) {
    return fileNameCandidates;
  }

  if (!isStringArrayOrMissing(record.warnings)) {
    return invalid("AI_FIELD_INVALID", "Liste d'avertissements IA invalide.", "warnings");
  }

  const rejectedCandidates = [
    ...fields.rejectedCandidates,
    ...fieldConsistency.rejectedCandidates,
    ...folderCandidates.rejectedCandidates,
    ...fileNameCandidates.rejectedCandidates
  ];
  const warnings = [
    ...normalizeWarnings(record.warnings),
    ...fieldConsistency.warnings,
    ...(rejectedCandidates.length > 0 ? ["Certains candidats IA ont été ignorés. Analyse conservée."] : [])
  ];

  return {
    status: "valid",
    response: {
      fields: fields.value,
      folderCandidates: folderCandidates.value,
      fileNameCandidates: fileNameCandidates.value,
      warnings: uniqueStrings(warnings).slice(0, AI_CLASSIFICATION_LIMITS.warnings),
      rejectedCandidates,
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

  const validation = validateAiClassificationSuggestion(rawSuggestion);
  if (validation.status === "valid") {
    return validation;
  }

  return {
    status: "invalid",
    error: {
      ...validation.error,
      validationErrors: createGlobalValidationErrors(validation.error, response)
    }
  };
}

function readFields(
  value: unknown
):
  | {
      ok: true;
      value: Record<AiCandidateFieldKey, AiFieldCandidates>;
      rejectedCandidates: AiRejectedCandidate[];
    }
  | AiMultiCandidateValidationResult {
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
  const rejectedCandidates: AiRejectedCandidate[] = [];
  for (const key of FIELD_KEYS) {
    const field = readFieldCandidates(record[key], key);
    if (!("ok" in field)) {
      return field;
    }

    result[key] = field.value;
    rejectedCandidates.push(...field.rejectedCandidates);
  }

  return { ok: true, value: result, rejectedCandidates };
}

function readFieldCandidates(
  value: unknown,
  key: AiCandidateFieldKey
):
  | {
      ok: true;
      value: AiFieldCandidates;
      rejectedCandidates: AiRejectedCandidate[];
    }
  | AiMultiCandidateValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_FIELD_INVALID", "Champ IA multi-candidats invalide.", `fields.${key}`);
  }

  const record = value as Record<string, unknown>;
  if (record.selected !== undefined && typeof record.selected !== "string") {
    return invalid("AI_FIELD_INVALID", "Sélection IA invalide.", `fields.${key}.selected`);
  }

  const candidates = readCandidateList(record.candidates, `fields.${key}.candidates`, {
    kind: "field",
    fieldKey: key
  });
  if (!("ok" in candidates)) {
    return candidates;
  }

  const selected = readSelectedCandidate(record.selected, key);
  const rejectedCandidates = [
    ...candidates.rejectedCandidates,
    ...selected.rejectedCandidates
  ];
  const selectedValue = selectFieldValue(selected.value, candidates.value);

  return {
    ok: true,
    value: {
      ...(selectedValue ? { selected: selectedValue } : {}),
      candidates: candidates.value
    },
    rejectedCandidates
  };
}

function readCandidateList(
  value: unknown,
  field: string,
  mode: CandidateListMode
):
  | {
      ok: true;
      value: AiCandidate[];
      rejectedCandidates: AiRejectedCandidate[];
    }
  | AiMultiCandidateValidationResult {
  if (!Array.isArray(value)) {
    return invalid("AI_FIELD_INVALID", "Liste de candidats IA invalide.", field);
  }

  const candidates: AiCandidate[] = [];
  const rejectedCandidates: AiRejectedCandidate[] = [];
  for (const [index, entry] of value.entries()) {
    const candidate = readCandidate(entry, field, index, mode);
    if (!("ok" in candidate)) {
      return candidate;
    }

    if (candidate.value) {
      candidates.push(candidate.value);
    } else if (candidate.rejectedCandidate) {
      rejectedCandidates.push(candidate.rejectedCandidate);
    }
  }

  return {
    ok: true,
    value: candidates.slice(0, MAX_CANDIDATES),
    rejectedCandidates
  };
}

function readCandidate(
  value: unknown,
  field: string,
  index: number,
  mode: CandidateListMode
):
  | {
      ok: true;
      value: AiCandidate | null;
      rejectedCandidate?: AiRejectedCandidate;
    }
  | AiMultiCandidateValidationResult {
  if (!isJsonObject(value)) {
    return invalid("AI_FIELD_INVALID", "Candidat IA invalide.", `${field}.${index}`);
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!CANDIDATE_KEYS.has(key)) {
      return invalid("AI_OUTPUT_UNKNOWN_FIELD", "Champ de candidat IA non prévu.", `${field}.${index}.${key}`);
    }
  }

  if (typeof record.score !== "number" || !Number.isFinite(record.score) || record.score < 0 || record.score > 100) {
    return invalid("AI_CONFIDENCE_INVALID", "Score de candidat IA hors bornes.", `${field}.${index}.score`);
  }

  if (typeof record.reason !== "string" || !record.reason.trim()) {
    return invalid("AI_FIELD_INVALID", "Raison de candidat IA invalide.", `${field}.${index}.reason`);
  }

  if (record.role !== undefined && typeof record.role !== "string") {
    return invalid("AI_FIELD_INVALID", "Rôle de candidat IA invalide.", `${field}.${index}.role`);
  }

  if (record.exists !== undefined && typeof record.exists !== "boolean") {
    return invalid("AI_FIELD_INVALID", "Indicateur exists de candidat IA invalide.", `${field}.${index}.exists`);
  }

  if (record.requiresCreation !== undefined && typeof record.requiresCreation !== "boolean") {
    return invalid(
      "AI_FIELD_INVALID",
      "Indicateur requiresCreation de candidat IA invalide.",
      `${field}.${index}.requiresCreation`
    );
  }

  if (typeof record.value !== "string") {
    return {
      ok: true,
      value: null,
      rejectedCandidate: createRejectedCandidate(field, index, "", "", "Valeur de candidat IA invalide.")
    };
  }

  const rawValue = record.value;
  const normalized = normalizeCandidateValue(rawValue, mode);
  if (!normalized.ok) {
    return {
      ok: true,
      value: null,
      rejectedCandidate: createRejectedCandidate(
        field,
        index,
        rawValue,
        normalized.normalizedValue,
        normalized.reason
      )
    };
  }

  return {
    ok: true,
    value: {
      value: normalized.value,
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

function normalizeSelectedFields(
  fields: Record<AiCandidateFieldKey, AiFieldCandidates>
): { rejectedCandidates: AiRejectedCandidate[]; warnings: string[] } {
  const rejectedCandidates: AiRejectedCandidate[] = [];
  const warnings: string[] = [];

  const selectedTarget = normalizeNameBlock(fields.target.selected);
  const selectedDocumentType = normalizeNameBlock(fields.documentType.selected);

  if (selectedDocumentType === "releve-bancaire") {
    preferJointAccountTarget(fields);
  }

  if (!fields.dateToken.selected) {
    warnings.push("Date IA absente ou invalide : aucun nom final ne sera généré sans date fiable.");
  }

  if (selectedTarget && GENERIC_TARGET_VALUES.has(selectedTarget)) {
    rejectSelectedField(
      fields,
      "target",
      "Cible IA ignorée : target doit être la valeur de nommage, pas une nature générique.",
      rejectedCandidates,
      warnings
    );
  }

  if (selectedTarget && selectedDocumentType && selectedTarget === selectedDocumentType) {
    rejectSelectedField(
      fields,
      "target",
      "Cible IA ignorée : target ne doit pas être égal à documentType.",
      rejectedCandidates,
      warnings
    );
  }

  rejectGenericDetailCandidates(fields, rejectedCandidates, warnings);

  return { rejectedCandidates, warnings };
}

function preferJointAccountTarget(fields: Record<AiCandidateFieldKey, AiFieldCandidates>): void {
  const target = normalizeNameBlock(fields.target.selected);
  const subject = normalizeNameBlock(fields.subject.selected);
  const candidates = [
    ...fields.target.candidates,
    ...fields.subject.candidates
  ];
  const jointAccount = candidates.find((candidate) => normalizeNameBlock(candidate.value) === "compte-joint");
  if (!jointAccount || target === "compte-joint" || subject !== "compte-joint") {
    return;
  }

  const existingIndex = fields.target.candidates.findIndex(
    (candidate) => normalizeNameBlock(candidate.value) === "compte-joint"
  );
  if (existingIndex >= 0) {
    fields.target.candidates[existingIndex] = {
      ...fields.target.candidates[existingIndex],
      score: Math.max(fields.target.candidates[existingIndex].score, jointAccount.score)
    };
  } else {
    fields.target.candidates.unshift({
      value: "compte-joint",
      score: Math.max(jointAccount.score, 90),
      reason: "Compte joint explicite détecté.",
      role: "selected"
    });
  }
  fields.target.selected = "compte-joint";
  fields.target.candidates = fields.target.candidates.slice(0, MAX_CANDIDATES);
}

function rejectGenericDetailCandidates(
  fields: Record<AiCandidateFieldKey, AiFieldCandidates>,
  rejectedCandidates: AiRejectedCandidate[],
  warnings: string[]
): void {
  const before = fields.detail.candidates;
  fields.detail.candidates = before.filter((candidate, index) => {
    const normalized = normalizeNameBlock(candidate.value);
    if (!normalized || !isGenericDetail(normalized, fields)) {
      return true;
    }

    rejectedCandidates.push(createRejectedCandidate(
      "fields.detail.candidates",
      index,
      candidate.value,
      normalized,
      "Détail IA ignoré : valeur générique ou déjà portée par le type documentaire."
    ));
    return false;
  });

  const selectedDetail = normalizeNameBlock(fields.detail.selected);
  if (selectedDetail && isGenericDetail(selectedDetail, fields)) {
    rejectedCandidates.push(createRejectedCandidate(
      "fields.detail.selected",
      -1,
      fields.detail.selected ?? "",
      selectedDetail,
      "Détail IA ignoré : valeur générique ou déjà portée par le type documentaire."
    ));
    fields.detail.selected = selectBestCandidate(fields.detail.candidates)?.value;
  } else if (selectedDetail && !fields.detail.candidates.some((candidate) => candidate.value === selectedDetail)) {
    fields.detail.selected = selectBestCandidate(fields.detail.candidates)?.value;
  }

  if (before.length === fields.detail.candidates.length) {
    return;
  }

  warnings.push("Détail IA ignoré : valeur générique ou déjà portée par le type documentaire.");
}

function isGenericDetail(
  detail: string,
  fields: Record<AiCandidateFieldKey, AiFieldCandidates>
): boolean {
  if (GENERIC_DETAIL_VALUES.has(detail)) {
    return true;
  }

  const documentType = normalizeNameBlock(fields.documentType.selected);
  if (!documentType) {
    return false;
  }

  const detailTokens = detail.split("-").filter(Boolean);
  const documentTypeTokens = new Set(documentType.split("-").filter(Boolean));
  return detailTokens.length > 0 && detailTokens.every((token) => documentTypeTokens.has(token));
}

function readSelectedCandidate(
  value: unknown,
  key: AiCandidateFieldKey
): { value: string; rejectedCandidates: AiRejectedCandidate[] } {
  if (value === undefined || value === null || value === "") {
    return { value: "", rejectedCandidates: [] };
  }

  if (typeof value !== "string") {
    return {
      value: "",
      rejectedCandidates: [
        createRejectedCandidate(`fields.${key}.selected`, -1, "", "", "Sélection IA invalide.")
      ]
    };
  }

  const normalized = normalizeCandidateValue(value, { kind: "field", fieldKey: key });
  if (!normalized.ok) {
    return {
      value: "",
      rejectedCandidates: [
        createRejectedCandidate(
          `fields.${key}.selected`,
          -1,
          value,
          normalized.normalizedValue,
          normalized.reason
        )
      ]
    };
  }

  return { value: normalized.value, rejectedCandidates: [] };
}

function selectFieldValue(selected: string, candidates: AiCandidate[]): string {
  if (selected && candidates.some((candidate) => candidate.value === selected)) {
    return selected;
  }

  return selectBestCandidate(candidates)?.value ?? "";
}

function rejectSelectedField(
  fields: Record<AiCandidateFieldKey, AiFieldCandidates>,
  key: AiCandidateFieldKey,
  reason: string,
  rejectedCandidates: AiRejectedCandidate[],
  warnings: string[]
): void {
  const selected = fields[key].selected;
  if (!selected) {
    return;
  }

  const index = fields[key].candidates.findIndex((candidate) => candidate.value === selected);
  if (index >= 0) {
    rejectedCandidates.push(createRejectedCandidate(`fields.${key}.candidates`, index, selected, selected, reason));
    fields[key].candidates = fields[key].candidates.filter((_, candidateIndex) => candidateIndex !== index);
  } else {
    rejectedCandidates.push(createRejectedCandidate(`fields.${key}.selected`, -1, selected, selected, reason));
  }

  fields[key].selected = selectBestCandidate(fields[key].candidates)?.value;
  warnings.push(reason);
}

function normalizeCandidateValue(
  value: string,
  mode: CandidateListMode
):
  | { ok: true; value: string }
  | { ok: false; normalizedValue?: string; reason: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, normalizedValue: "", reason: "Valeur vide après normalisation." };
  }

  if (mode.kind === "folder") {
    const normalizedFolder = normalizeFolderCandidate(trimmed);
    return normalizedFolder
      ? { ok: true, value: normalizedFolder }
      : {
          ok: false,
          normalizedValue: "",
          reason: "Candidat dossier IA invalide ou dangereux."
        };
  }

  if (mode.kind === "fileName") {
    if (looksLikePath(trimmed) || containsParentTraversal(trimmed) || hasWindowsDriveReference(trimmed)) {
      return {
        ok: false,
        normalizedValue: trimmed,
        reason: "Candidat IA invalide : les chemins locaux sont refusés."
      };
    }

    return { ok: true, value: limitString(trimmed, AI_CLASSIFICATION_LIMITS.listItemChars) };
  }

  if (looksLikePath(trimmed) || containsParentTraversal(trimmed) || hasWindowsDriveReference(trimmed)) {
    return {
      ok: false,
      normalizedValue: normalizeNameBlock(trimmed),
      reason: "Candidat IA invalide : les chemins locaux sont refusés."
    };
  }

  if (SENSITIVE_NUMBER_PATTERN.test(trimmed)) {
    return {
      ok: false,
      normalizedValue: normalizeNameBlock(trimmed),
      reason: "Candidat IA rejeté : numéro sensible probable."
    };
  }

  if (mode.fieldKey !== "dateToken" && FULL_DATE_PATTERN.test(trimmed)) {
    return {
      ok: false,
      normalizedValue: normalizeNameBlock(trimmed),
      reason: "Candidat IA rejeté : date brute hors champ date."
    };
  }

  if (mode.fieldKey === "dateToken") {
    const normalizedDate = normalizeCandidateDateToken(trimmed);
    return normalizedDate
      ? { ok: true, value: normalizedDate }
      : { ok: false, normalizedValue: trimmed, reason: "Date IA invalide." };
  }

  const normalized = normalizeNameBlock(trimmed);
  if (!normalized) {
    return { ok: false, normalizedValue: "", reason: "Valeur vide après normalisation." };
  }

  if (mode.fieldKey === "targetKind" && !TARGET_KIND_VALUES.has(normalized)) {
    return {
      ok: false,
      normalizedValue: normalized,
      reason: "targetKind IA invalide. Valeurs attendues : person, household, vehicle, property, other."
    };
  }

  if (mode.fieldKey === "target" && GENERIC_TARGET_VALUES.has(normalized)) {
    return {
      ok: false,
      normalizedValue: normalized,
      reason: "Cible IA invalide : target doit être la valeur de nommage, pas une nature générique."
    };
  }

  return { ok: true, value: limitString(normalized, AI_CLASSIFICATION_LIMITS.listItemChars) };
}

function normalizeCandidateDateToken(value: string): string {
  const normalized = normalizeNameBlock(value);
  if (!normalized || UNKNOWN_DATE_VALUES.has(normalized) || /^a+$/.test(normalized)) {
    return "";
  }

  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)) {
    return value;
  }

  return "";
}

function createGlobalValidationErrors(
  error: AiClassificationValidationError,
  response: AiMultiCandidateResponse
): AiClassificationValidationIssue[] {
  const issues: AiClassificationValidationIssue[] = [
    {
      ...(error.field ? { field: error.field } : {}),
      ...(error.rawValue ? { rawValue: error.rawValue } : {}),
      ...(error.normalizedValue ? { normalizedValue: error.normalizedValue } : {}),
      reason: error.message
    }
  ];

  for (const candidate of response.rejectedCandidates) {
    issues.push({
      field: candidate.field,
      ...(candidate.rawValue ? { rawValue: candidate.rawValue } : {}),
      ...(candidate.normalizedValue ? { normalizedValue: candidate.normalizedValue } : {}),
      reason: candidate.reason
    });
  }

  return issues;
}

function createRejectedCandidate(
  field: string,
  index: number,
  rawValue: string,
  normalizedValue: string | undefined,
  reason: string
): AiRejectedCandidate {
  return {
    field,
    index,
    ...(rawValue ? { rawValue } : {}),
    ...(normalizedValue ? { normalizedValue } : {}),
    reason
  };
}

function normalizeFolderCandidate(value: string): string | null {
  const normalized = normalizeTargetFolderRelative(value);
  return normalized.ok ? normalized.value : null;
}

function looksLikePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || /[\\/]/.test(value);
}

function hasWindowsDriveReference(value: string): boolean {
  return /^[a-zA-Z]:/.test(value.trim());
}

function containsParentTraversal(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment.trim() === "..") || value.includes("..");
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

function normalizeWarnings(value: unknown): string[] {
  return normalizeStringList(value, AI_CLASSIFICATION_LIMITS.warnings)
    .filter((warning) => !isNeutralWarning(warning));
}

function isNeutralWarning(value: string): boolean {
  const normalized = normalizeNameBlock(value);
  return (
    normalized === "pas-de-probleme-majeur-detecte" ||
    normalized === "aucun-probleme-majeur-detecte" ||
    normalized === "aucun-avertissement" ||
    normalized === "pas-d-avertissement"
  );
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
