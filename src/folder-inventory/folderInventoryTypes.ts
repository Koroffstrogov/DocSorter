import type { NamingInputV2 } from "../naming/documentNameV2";
import type { SuggestionDraftV2 } from "../suggestions/suggestionDraftV2";

export interface FolderInventoryItem {
  relativePath: string;
  depth: number;
  childFolderCount: number;
  fileCount: number;
  sampleFileNames: string[];
}

export interface FolderInventory {
  items: FolderInventoryItem[];
  warnings: string[];
}

export type FolderInventoryErrorCode =
  | "TARGET_NOT_SELECTED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_DIRECTORY"
  | "TARGET_READ_FAILED";

export type FolderInventoryResult =
  | {
      ok: true;
      inventory: FolderInventory;
    }
  | {
      ok: false;
      error: {
        code: FolderInventoryErrorCode;
        message: string;
      };
    };

export interface BuildFolderInventoryOptions {
  rootPath: string | null | undefined;
  maxDepth?: number;
  sampleFileLimit?: number;
}

export interface FolderPlacementCandidate {
  relativePath: string;
  score: number;
  confidence: number;
  exists: boolean;
  reasons: string[];
  warnings: string[];
  item?: FolderInventoryItem;
  source: "inventory" | "fallback";
}

export interface RankFolderPlacementInput {
  draft: SuggestionDraftV2;
  inventory: FolderInventory;
  evidenceText?: string;
  folderAliases?: string[];
  competingRelativePaths?: string[];
  fallbackPath?: string;
}

export interface FolderPlacementRanking {
  recommended: FolderPlacementCandidate;
  candidates: FolderPlacementCandidate[];
  warnings: string[];
  reasons: string[];
}

export type NamingDatePrecision = "day" | "month" | "year" | "unknown";

export interface FolderNamingProfile {
  analyzedFileCount: number;
  v2FileCount: number;
  dominantDatePrecision?: NamingDatePrecision;
  dominantTarget?: string;
  dominantDocumentType?: string;
  dominantIssuer?: string;
  confidence: number;
  reasons: string[];
  warnings: string[];
}

export interface NamingProfileAlignment {
  input: NamingInputV2;
  changed: boolean;
  reasons: string[];
  warnings: string[];
}
