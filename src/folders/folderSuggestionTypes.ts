import type { SuggestionDraftV2 } from "../suggestions/suggestionDraftV2";

export type FolderDepthLabel = "court" | "equilibre" | "detaille";

export type FolderSuggestionSource =
  | "rules-v2"
  | "existing-folder"
  | "preference"
  | "fallback";

export interface FolderDepthOption {
  label: FolderDepthLabel;
  relativePath: string;
  depth: number;
  recommended: boolean;
  confidence: number;
  reasons: string[];
  warnings: string[];
  requiresCreation?: boolean;
  source: FolderSuggestionSource;
}

export interface TargetFolderSuggestionV2 {
  recommended?: FolderDepthOption;
  options: FolderDepthOption[];
  warnings: string[];
  reasons: string[];
}

export interface KnownFolderStat {
  relativePath: string;
  documentCount?: number;
  similarDocumentCount?: number;
}

export interface UserFolderPreference {
  matchKey: string;
  preferredDepth?: number;
  preferredRelativePath?: string;
}

export interface BuildTargetFolderSuggestionsV2Input {
  draft: SuggestionDraftV2;
  knownRelativeFolders?: string[];
  knownFolderStats?: KnownFolderStat[];
  userFolderPreferences?: UserFolderPreference[];
}

export interface FolderRuleV2 {
  domainPath: string;
  requireTargetWarning?: boolean;
  preferDetailedForSeries?: boolean;
  detailedForExistingOnly?: boolean;
  unknownFallback?: boolean;
}
