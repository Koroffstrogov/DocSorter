export type AiClassificationSource = "simulated-ai" | "ollama";

export interface AiSuggestionV2Snapshot {
  dateToken?: string | null;
  target?: string | null;
  documentType?: string | null;
  issuer?: string | null;
  detail?: string | null;
  targetFolder?: string | null;
  proposedName?: string | null;
  missingFields?: string[];
  confidence?: number;
  reasons?: string[];
  warnings?: string[];
}

export interface AiClassificationInput {
  filename: string;
  extension: string;
  extractedTextExcerpt?: string;
  ocrTextExcerpt?: string;
  currentSuggestionV2?: AiSuggestionV2Snapshot | null;
  availableRootFolders?: string[];
  knownRelativeFolders?: string[];
  namingConvention?: string;
  detectedDate?: string;
  detectedYear?: string;
}

export interface BoundedAiClassificationInput extends AiClassificationInput {
  extractedTextExcerpt: string;
  ocrTextExcerpt: string;
  currentSuggestionV2: AiSuggestionV2Snapshot | null;
  availableRootFolders: string[];
  knownRelativeFolders: string[];
  namingConvention: string;
  detectedDate: string;
  detectedYear: string;
}

export interface AiClassificationSuggestion {
  dateToken?: string;
  target?: string;
  documentType?: string;
  issuer?: string;
  detail?: string;
  targetFolder?: string;
  confidence: number;
  reasons: string[];
  warnings: string[];
  source: AiClassificationSource;
}

export type AiClassificationValidationErrorCode =
  | "AI_OUTPUT_NOT_OBJECT"
  | "AI_OUTPUT_UNKNOWN_FIELD"
  | "AI_SOURCE_INVALID"
  | "AI_CONFIDENCE_INVALID"
  | "AI_DATE_INVALID"
  | "AI_TARGET_FOLDER_INVALID"
  | "AI_FIELD_INVALID"
  | "AI_PROVIDER_FAILED";

export interface AiClassificationValidationError {
  code: AiClassificationValidationErrorCode;
  message: string;
  field?: string;
}

export type AiClassificationValidationResult =
  | {
      status: "valid";
      suggestion: AiClassificationSuggestion;
    }
  | {
      status: "invalid";
      error: AiClassificationValidationError;
    };

export type AiClassificationProvider = (
  input: BoundedAiClassificationInput
) => AiClassificationSuggestion | unknown | Promise<AiClassificationSuggestion | unknown>;

export type AiClassificationOrchestratorResult =
  | {
      status: "ready";
      input: BoundedAiClassificationInput;
      suggestion: AiClassificationSuggestion;
    }
  | {
      status: "invalid";
      input: BoundedAiClassificationInput;
      error: AiClassificationValidationError;
    };

export const AI_CLASSIFICATION_LIMITS = {
  textExcerptChars: 6_000,
  filenameChars: 180,
  namingConventionChars: 500,
  folderCount: 50,
  listItemChars: 120,
  keywords: 5,
  reasons: 8,
  warnings: 8
} as const;
