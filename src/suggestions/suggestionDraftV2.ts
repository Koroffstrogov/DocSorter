import type { NamingV2Message } from "../naming/documentNameV2";
import type { SelectedDateToken } from "../dates/dateCandidateTypes";

export type SuggestionDraftV2FieldSource =
  | "reference-data"
  | "legacy-filename"
  | "manual"
  | "fallback";

export interface SuggestionDraftV2Source {
  target?: SuggestionDraftV2FieldSource;
  documentType?: SuggestionDraftV2FieldSource;
  issuer?: SuggestionDraftV2FieldSource;
  detail?: SuggestionDraftV2FieldSource;
  dateToken?: "legacy-filename" | "date-engine" | "manual" | "fallback";
}

export interface SuggestionDraftV2 {
  dateToken?: string;
  target?: string;
  documentType?: string;
  issuer?: string;
  detail?: string;
  proposedName?: string;
  dateSelection?: SelectedDateToken;
  semanticDeduplication?: {
    changed: boolean;
    removedTerms: string[];
    before: {
      issuer?: string;
      detail?: string;
    };
    after: {
      issuer?: string;
      detail?: string;
    };
    reasons: string[];
  };
  confidence: number;
  reasons: string[];
  warnings: string[];
  source: SuggestionDraftV2Source;
  namingMessages: NamingV2Message[];
}
