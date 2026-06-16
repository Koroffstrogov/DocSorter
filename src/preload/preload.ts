import { contextBridge, ipcRenderer } from "electron";

import type { PrepareClassificationPlanResult } from "../classification/classificationPlan";
import type { DocumentDiscoveryResult, Result } from "../documents/documentDiscovery";
import type { ExactDuplicateAnalysisResult } from "../duplicates/exactDuplicates";
import type { PdfTextExtractionResult } from "../extraction/pdfTextExtraction";
import type { ExecuteClassificationResult, UndoClassificationResult } from "../file-ops/classifyFile";
import type { ActionJournalReadResult } from "../history/actionJournal";
import type { UndoableClassificationAction } from "../history/historyTypes";
import type { ActionJournalEntry } from "../history/historyTypes";
import type { DestinationAvailabilityResult } from "../naming/destinationNameAvailability";
import type { NamingDraft, ProposedFilename } from "../naming/namingDraft";
import type { PreviewData } from "../preview/previewTypes";
import type {
  NamingRulesStatus,
  UserRulesLoadResult,
  UserRulesResult
} from "../rules/userNamingRulesStore";

interface DirectorySelection {
  path: string;
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  selectSourceDirectory: (): Promise<Result<DirectorySelection | null>> =>
    ipcRenderer.invoke("directory:selectSource"),
  selectTargetDirectory: (): Promise<Result<DirectorySelection | null>> =>
    ipcRenderer.invoke("directory:selectTarget"),
  refreshSourceDocuments: (): Promise<Result<DocumentDiscoveryResult>> =>
    ipcRenderer.invoke("documents:refreshSource"),
  getPreviewData: (documentPath: string): Promise<Result<PreviewData>> =>
    ipcRenderer.invoke("preview:getData", documentPath),
  createInitialNamingDraft: (originalName: string): Promise<NamingDraft> =>
    ipcRenderer.invoke("naming:createInitialDraft", originalName),
  buildNamingProposal: (
    draft: NamingDraft,
    originalExtension: string
  ): Promise<ProposedFilename> => ipcRenderer.invoke("naming:buildProposal", draft, originalExtension),
  checkDestinationAvailability: (
    proposedFilename: string
  ): Promise<DestinationAvailabilityResult> =>
    ipcRenderer.invoke("naming:checkDestinationAvailability", proposedFilename),
  prepareClassificationPlan: (
    documentPath: string,
    proposedFilename: string
  ): Promise<PrepareClassificationPlanResult> =>
    ipcRenderer.invoke("classification:preparePlan", documentPath, proposedFilename),
  executeClassification: (
    documentPath: string,
    proposedFilename: string
  ): Promise<ExecuteClassificationResult> =>
    ipcRenderer.invoke("classification:execute", documentPath, proposedFilename),
  undoLastClassification: (): Promise<UndoClassificationResult> =>
    ipcRenderer.invoke("classification:undoLast"),
  getLastUndoableAction: (): Promise<UndoableClassificationAction | null> =>
    ipcRenderer.invoke("classification:getLastUndoableAction"),
  analyzeExactDuplicates: (): Promise<ExactDuplicateAnalysisResult> =>
    ipcRenderer.invoke("duplicates:analyzeExact"),
  extractTextFromActivePdf: (documentPath: string): Promise<PdfTextExtractionResult> =>
    ipcRenderer.invoke("extraction:extractPdfText", documentPath),
  getRecentHistory: (limit?: number): Promise<ActionJournalReadResult<ActionJournalEntry[]>> =>
    ipcRenderer.invoke("history:getRecent", limit),
  getRulesStatus: (): Promise<UserRulesResult<NamingRulesStatus>> =>
    ipcRenderer.invoke("rules:getStatus"),
  getUserRulesCatalog: (): Promise<UserRulesResult<UserRulesLoadResult>> =>
    ipcRenderer.invoke("rules:getUserCatalog"),
  saveUserRulesCatalog: (
    catalog: NamingSuggestionRulesCatalog
  ): Promise<UserRulesResult<NamingRulesStatus>> =>
    ipcRenderer.invoke("rules:saveUserCatalog", catalog),
  reloadNamingRules: (): Promise<UserRulesResult<NamingRulesStatus>> =>
    ipcRenderer.invoke("rules:reload")
};

contextBridge.exposeInMainWorld("docSorter", api);

export type DocSorterApi = typeof api;
