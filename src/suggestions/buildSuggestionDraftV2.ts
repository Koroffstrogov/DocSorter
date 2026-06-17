import {
  generateDocumentNameV2,
  namingInputV2FromLegacyDraft,
  normalizeNameBlock,
  type GeneratedDocumentNameV2,
  type GenerateDocumentNameV2Options,
  type NamingInputV2
} from "../naming/documentNameV2";
import { buildSelectedDateToken } from "../dates/dateCandidateSelector";
import { isNamingDraft, type NamingDraft } from "../naming/namingDraft";
import { detectReferenceCandidates } from "../reference-data/referenceDataMatcher";
import type {
  ReferenceCandidate,
  ReferenceDataCatalog,
  ReferenceDetectionResult
} from "../reference-data/referenceDataTypes";
import type { SuggestionDraftV2, SuggestionDraftV2Source } from "./suggestionDraftV2";

export interface BuildSuggestionDraftV2Input {
  fileName: string;
  extension?: string;
  extractedText?: string;
  ocrText?: string;
  metadataText?: string;
  legacyDraft?: unknown;
  referenceData?: ReferenceDetectionResult | ReferenceDataCatalog | null;
  targetDirectoryPath?: string;
  fileCreatedAt?: string;
  fileModifiedAt?: string;
  pdfCreatedAt?: string;
  pdfModifiedAt?: string;
  exifTakenAt?: string;
  scanDate?: string;
}

export interface SelectReferenceCandidateOptions {
  minimumConfidence?: number;
  ambiguityDelta?: number;
}

export type ReferenceCandidateSelectionResult =
  | {
      status: "selected";
      candidate: ReferenceCandidate;
      warning: null;
    }
  | {
      status: "none" | "below-threshold" | "ambiguous";
      candidate: null;
      warning: string | null;
    };

const DEFAULT_MINIMUM_CONFIDENCE = 60;
const DEFAULT_AMBIGUITY_DELTA = 5;

export function buildSuggestionDraftV2(input: BuildSuggestionDraftV2Input): SuggestionDraftV2 {
  const warnings: string[] = [];
  const reasons: string[] = [];
  const source: SuggestionDraftV2Source = {};
  const confidenceParts: number[] = [];
  const legacyDraft = isNamingDraft(input.legacyDraft) ? input.legacyDraft : null;
  const referenceData = resolveReferenceData(input, warnings);

  const draft: SuggestionDraftV2 = {
    confidence: 0,
    reasons,
    warnings,
    source,
    namingMessages: []
  };

  applyReferenceFields(draft, referenceData, confidenceParts);
  applyLegacyFallbackFields(draft, legacyDraft, confidenceParts);
  applyDateToken(draft, input, legacyDraft, confidenceParts);

  const generation = generateProposedNameFromSuggestionDraft(draft, resolveExtension(input), {
    targetDirectoryPath: input.targetDirectoryPath
  });

  if (generation) {
    draft.namingMessages = generation.messages;
    draft.warnings.push(
      ...generation.messages
        .filter((message) => message.level !== "info")
        .map((message) => message.message)
    );

    if (generation.isValid) {
      draft.proposedName = generation.filename;
    }
  } else {
    if (!draft.target) {
      draft.warnings.push("Cible absente : nom v2 final non généré.");
    }
    if (!draft.documentType) {
      draft.warnings.push("Type documentaire absent : nom v2 final non généré.");
    }
  }

  draft.confidence = computeConfidence(confidenceParts, draft);
  draft.warnings = uniqueStrings(draft.warnings);
  draft.reasons = uniqueStrings(draft.reasons);
  return draft;
}

export function selectBestReferenceCandidate(
  candidates: ReferenceCandidate[],
  options: SelectReferenceCandidateOptions = {}
): ReferenceCandidateSelectionResult {
  const minimumConfidence = options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
  const ambiguityDelta = options.ambiguityDelta ?? DEFAULT_AMBIGUITY_DELTA;
  const sorted = [...candidates].sort(compareCandidates);
  const best = sorted[0];

  if (!best) {
    return {
      status: "none",
      candidate: null,
      warning: null
    };
  }

  if (best.confidence < minimumConfidence) {
    return {
      status: "below-threshold",
      candidate: null,
      warning: "Candidat référentiel sous le seuil de confiance."
    };
  }

  const competing = sorted[1];
  if (competing && best.confidence - competing.confidence <= ambiguityDelta) {
    return {
      status: "ambiguous",
      candidate: null,
      warning: "Référentiel ambigu : plusieurs candidats proches, choix manuel requis."
    };
  }

  return {
    status: "selected",
    candidate: best,
    warning: null
  };
}

export function buildNamingInputV2FromSuggestionDraft(
  draft: SuggestionDraftV2,
  extension: string
): NamingInputV2 | null {
  if (!draft.dateToken || !draft.target || !draft.documentType) {
    return null;
  }

  return {
    dateToken: draft.dateToken,
    target: draft.target,
    documentType: draft.documentType,
    ...(draft.issuer ? { issuer: draft.issuer } : {}),
    ...(draft.detail ? { detail: draft.detail } : {}),
    extension
  };
}

export function generateProposedNameFromSuggestionDraft(
  draft: SuggestionDraftV2,
  extension: string,
  options: GenerateDocumentNameV2Options = {}
): GeneratedDocumentNameV2 | null {
  const namingInput = buildNamingInputV2FromSuggestionDraft(draft, extension);
  return namingInput ? generateDocumentNameV2(namingInput, options) : null;
}

function applyDateToken(
  draft: SuggestionDraftV2,
  input: BuildSuggestionDraftV2Input,
  legacyDraft: NamingDraft | null,
  confidenceParts: number[]
): void {
  const legacyDate = legacyDraft?.documentDate.trim() || "";
  if (legacyDate) {
    draft.dateToken = legacyDate.toLowerCase();
    draft.source.dateToken = "legacy";
    draft.reasons.push("Date reprise du brouillon existant.");
    confidenceParts.push(70);
    return;
  }

  const selectedDate = buildSelectedDateToken({
    fileName: input.fileName,
    extractedText: input.extractedText,
    ocrText: input.ocrText,
    metadataText: input.metadataText,
    documentType: draft.documentType,
    fileCreatedAt: input.fileCreatedAt,
    fileModifiedAt: input.fileModifiedAt,
    pdfCreatedAt: input.pdfCreatedAt,
    pdfModifiedAt: input.pdfModifiedAt,
    exifTakenAt: input.exifTakenAt,
    scanDate: input.scanDate
  });

  draft.dateSelection = selectedDate;
  draft.dateToken = selectedDate.dateToken;
  draft.source.dateToken = selectedDate.selected?.source ?? "fallback";
  draft.reasons.push(...selectedDate.reasons);
  draft.warnings.push(...selectedDate.warnings);

  if (selectedDate.selected) {
    confidenceParts.push(selectedDate.confidence);
  }
}

function applyReferenceFields(
  draft: SuggestionDraftV2,
  referenceData: ReferenceDetectionResult,
  confidenceParts: number[]
): void {
  const target = selectBestReferenceCandidate(referenceData.targetCandidates);
  const documentType = selectBestReferenceCandidate(referenceData.documentTypeCandidates);
  const issuer = selectBestReferenceCandidate(referenceData.issuerCandidates);

  applyCandidateField(draft, "target", target, confidenceParts);
  applyCandidateField(draft, "documentType", documentType, confidenceParts);
  applyCandidateField(draft, "issuer", issuer, confidenceParts, true);

  draft.warnings.push(...referenceData.warnings);
}

function applyCandidateField(
  draft: SuggestionDraftV2,
  field: "target" | "documentType" | "issuer",
  selection: ReferenceCandidateSelectionResult,
  confidenceParts: number[],
  optional = false
): void {
  if (selection.status === "selected") {
    draft[field] = selection.candidate.fileAlias;
    draft.source[field] = "reference-data";
    confidenceParts.push(selection.candidate.confidence);
    draft.reasons.push(...selection.candidate.reasons);
    return;
  }

  if (selection.warning && (!optional || selection.status === "ambiguous")) {
    draft.warnings.push(`${field}: ${selection.warning}`);
  }
}

function applyLegacyFallbackFields(
  draft: SuggestionDraftV2,
  legacyDraft: NamingDraft | null,
  confidenceParts: number[]
): void {
  if (!legacyDraft) {
    return;
  }

  const legacyInput = namingInputV2FromLegacyDraft(legacyDraft, "");
  applyLegacyField(draft, "target", legacyInput.target, confidenceParts);
  applyLegacyField(draft, "documentType", legacyInput.documentType, confidenceParts);
  applyLegacyField(draft, "detail", legacyInput.detail, confidenceParts);
}

function applyLegacyField(
  draft: SuggestionDraftV2,
  field: "target" | "documentType" | "detail",
  value: string | undefined,
  confidenceParts: number[]
): void {
  if (draft[field] || !value?.trim()) {
    return;
  }

  const normalized = normalizeNameBlock(value);
  if (!normalized) {
    return;
  }

  draft[field] = normalized;
  draft.source[field] = "legacy";
  confidenceParts.push(50);
  draft.reasons.push("Champ repris du brouillon existant.");
}

function resolveReferenceData(
  input: BuildSuggestionDraftV2Input,
  warnings: string[]
): ReferenceDetectionResult {
  if (!input.referenceData) {
    return createEmptyReferenceDetectionResult();
  }

  if (isReferenceDetectionResult(input.referenceData)) {
    return input.referenceData;
  }

  if (isReferenceDataCatalog(input.referenceData)) {
    return detectReferenceCandidates({
      filename: input.fileName,
      text: combineText(input),
      catalog: input.referenceData
    });
  }

  warnings.push("Référentiels non exploitables : brouillon construit sans candidats locaux.");
  return createEmptyReferenceDetectionResult();
}

function combineText(input: BuildSuggestionDraftV2Input): string {
  return [input.extractedText, input.ocrText, input.metadataText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function createEmptyReferenceDetectionResult(): ReferenceDetectionResult {
  return {
    targetCandidates: [],
    documentTypeCandidates: [],
    issuerCandidates: [],
    warnings: []
  };
}

function isReferenceDetectionResult(value: unknown): value is ReferenceDetectionResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReferenceDetectionResult>;
  return (
    Array.isArray(candidate.targetCandidates) &&
    Array.isArray(candidate.documentTypeCandidates) &&
    Array.isArray(candidate.issuerCandidates)
  );
}

function isReferenceDataCatalog(value: unknown): value is ReferenceDataCatalog {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReferenceDataCatalog>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.people) &&
    Array.isArray(candidate.vehicles) &&
    Array.isArray(candidate.properties) &&
    Array.isArray(candidate.providers) &&
    Array.isArray(candidate.documentTypes)
  );
}

function resolveExtension(input: BuildSuggestionDraftV2Input): string {
  if (input.extension !== undefined) {
    return input.extension;
  }

  const lastPathSegment = input.fileName.split(/[\\/]/).pop() ?? input.fileName;
  const dotIndex = lastPathSegment.lastIndexOf(".");
  return dotIndex > 0 ? lastPathSegment.slice(dotIndex) : "";
}

function computeConfidence(confidenceParts: number[], draft: SuggestionDraftV2): number {
  if (confidenceParts.length === 0) {
    return draft.proposedName ? 30 : 0;
  }

  return Math.round(
    confidenceParts.reduce((sum, confidence) => sum + confidence, 0) / confidenceParts.length
  );
}

function compareCandidates(left: ReferenceCandidate, right: ReferenceCandidate): number {
  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence;
  }

  return left.label.localeCompare(right.label, "fr");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
