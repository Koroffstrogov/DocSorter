export type AiClassificationSource = "simulated-ai" | "ollama";

export interface AiClassificationInput {
  filename: string;
  extension: string;
  extractedTextExcerpt?: string;
  ocrTextExcerpt?: string;
  availableRootFolders?: string[];
  knownRelativeFolders?: string[];
  namingConvention?: string;
  detectedDate?: string;
  detectedYear?: string;
}

export interface BoundedAiClassificationInput extends AiClassificationInput {
  extractedTextExcerpt: string;
  ocrTextExcerpt: string;
  availableRootFolders: string[];
  knownRelativeFolders: string[];
  namingConvention: string;
  detectedDate: string;
  detectedYear: string;
}

export interface AiClassificationSuggestion {
  dateToken?: string;
  subject?: string;
  target?: string;
  documentType?: string;
  issuer?: string;
  detail?: string;
  proposedName?: string;
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
  rawValue?: string;
  normalizedValue?: string;
  validationErrors?: AiClassificationValidationIssue[];
}

export interface AiClassificationValidationIssue {
  field?: string;
  rawValue?: string;
  normalizedValue?: string;
  evidence?: "text" | "filename" | "selected-folder" | "folder-profile" | "document-policy" | "none";
  reason: string;
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
