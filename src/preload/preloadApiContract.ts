import type { PrepareClassificationPlanResult } from "../classification/classificationPlan";
import type {
  AiDocumentSuggestion,
  AiDocumentTextContext
} from "../ai/ollamaDocumentSuggestion";
import type { OllamaModelStatus } from "../ai/ollamaModelManager";
import type { AiConnectionTestStatus } from "../ai/ollamaProvider";
import type {
  AiSettings,
  AiSettingsInput,
  AiSettingsResult,
  AiStatus
} from "../ai/ollamaSettings";
import type { DocumentDiscoveryResult, Result } from "../documents/documentDiscovery";
import type { ExactDuplicateAnalysisResult } from "../duplicates/exactDuplicates";
import type { PdfTextExtractionResult } from "../extraction/pdfTextExtraction";
import type { ExecuteClassificationResult, UndoClassificationResult } from "../file-ops/classifyFile";
import type { ActionJournalReadResult } from "../history/actionJournal";
import type { UndoableClassificationAction } from "../history/historyTypes";
import type { ActionJournalEntry } from "../history/historyTypes";
import { IPC_CHANNELS, type IpcChannel } from "../ipc/ipcChannels";
import type { DestinationAvailabilityResult } from "../naming/destinationNameAvailability";
import type { NamingDraft, ProposedFilename } from "../naming/namingDraft";
import type {
  ImageOcrResult
} from "../ocr/imageOcrService";
import type {
  OcrPathSelection,
  OcrResult,
  OcrSettingsInput,
  OcrStatus
} from "../ocr/ocrTypes";
import type { PreviewData } from "../preview/previewTypes";
import type {
  SuggestionV2Result,
  SuggestionV2TextContext
} from "../suggestions/buildSuggestionV2ForDocument";
import type {
  SuggestionV2DiagnosticResult
} from "../diagnostics/suggestionV2Diagnostic";
import type {
  TargetFolderCreation,
  TargetFolderList,
  TargetFolderResult
} from "../naming/targetFolder";
import type {
  NamingRulesStatus,
  UserRulesLoadResult,
  UserRulesResult
} from "../rules/userNamingRulesStore";
import type {
  ReferenceDataFileInfo,
  ReferenceDataFileKey,
  ReferenceDataOverview,
  ReferenceDataStoreResult
} from "../reference-data/referenceDataStore";

interface DirectorySelection {
  path: string;
}

export interface IpcInvoker {
  invoke: (channel: IpcChannel, ...args: unknown[]) => Promise<unknown>;
}

export const ALLOWED_PRELOAD_API_METHODS = [
  "getVersion",
  "selectSourceDirectory",
  "selectTargetDirectory",
  "listTargetFolders",
  "setTargetFolder",
  "createTargetFolder",
  "refreshSourceDocuments",
  "getPreviewData",
  "createInitialNamingDraft",
  "buildNamingProposal",
  "checkDestinationAvailability",
  "buildSuggestionV2",
  "runSuggestionV2Diagnostic",
  "prepareClassificationPlan",
  "executeClassification",
  "undoLastClassification",
  "getLastUndoableAction",
  "analyzeExactDuplicates",
  "extractTextFromActivePdf",
  "getOcrStatus",
  "selectTesseractExecutable",
  "selectTessdataDirectory",
  "saveOcrSettings",
  "testOcrEngine",
  "runOcrForActiveImage",
  "getAiStatus",
  "getAiSettings",
  "saveAiSettings",
  "testAiConnection",
  "getAiModelStatus",
  "unloadAiModel",
  "runAiSuggestionForActiveDocument",
  "getRecentHistory",
  "getRulesStatus",
  "getUserRulesCatalog",
  "saveUserRulesCatalog",
  "reloadNamingRules",
  "getReferenceDataStatus",
  "openReferenceDataFolder",
  "createMissingReferenceDataFiles",
  "validateReferenceDataFile",
  "saveReferenceDataFile",
  "reloadReferenceData"
] as const;

export type PreloadApiMethod = (typeof ALLOWED_PRELOAD_API_METHODS)[number];

export function createPreloadApi(ipc: IpcInvoker) {
  return {
    getVersion: (): Promise<string> =>
      ipc.invoke(IPC_CHANNELS.appGetVersion) as Promise<string>,
    selectSourceDirectory: (): Promise<Result<DirectorySelection | null>> =>
      ipc.invoke(IPC_CHANNELS.directorySelectSource) as Promise<Result<DirectorySelection | null>>,
    selectTargetDirectory: (): Promise<Result<DirectorySelection | null>> =>
      ipc.invoke(IPC_CHANNELS.directorySelectTarget) as Promise<Result<DirectorySelection | null>>,
    listTargetFolders: (): Promise<TargetFolderResult<TargetFolderList>> =>
      ipc.invoke(IPC_CHANNELS.targetListFolders) as Promise<TargetFolderResult<TargetFolderList>>,
    setTargetFolder: (targetFolder: string): Promise<TargetFolderResult<string>> =>
      ipc.invoke(
        IPC_CHANNELS.targetSetFolder,
        targetFolder
      ) as Promise<TargetFolderResult<string>>,
    createTargetFolder: (
      targetFolder: string
    ): Promise<TargetFolderResult<TargetFolderCreation>> =>
      ipc.invoke(
        IPC_CHANNELS.targetCreateFolder,
        targetFolder
      ) as Promise<TargetFolderResult<TargetFolderCreation>>,
    refreshSourceDocuments: (): Promise<Result<DocumentDiscoveryResult>> =>
      ipc.invoke(IPC_CHANNELS.documentsRefreshSource) as Promise<Result<DocumentDiscoveryResult>>,
    getPreviewData: (documentPath: string): Promise<Result<PreviewData>> =>
      ipc.invoke(IPC_CHANNELS.previewGetData, documentPath) as Promise<Result<PreviewData>>,
    createInitialNamingDraft: (originalName: string): Promise<NamingDraft> =>
      ipc.invoke(IPC_CHANNELS.namingCreateInitialDraft, originalName) as Promise<NamingDraft>,
    buildNamingProposal: (
      draft: NamingDraft,
      originalExtension: string
    ): Promise<ProposedFilename> =>
      ipc.invoke(
        IPC_CHANNELS.namingBuildProposal,
        draft,
        originalExtension
      ) as Promise<ProposedFilename>,
    checkDestinationAvailability: (
      proposedFilename: string
    ): Promise<DestinationAvailabilityResult> =>
      ipc.invoke(
        IPC_CHANNELS.namingCheckDestinationAvailability,
        proposedFilename
      ) as Promise<DestinationAvailabilityResult>,
    buildSuggestionV2: (
      documentPath: string,
      textContext: SuggestionV2TextContext | null,
      legacyDraft: NamingDraft
    ): Promise<SuggestionV2Result> =>
      ipc.invoke(
        IPC_CHANNELS.suggestionV2Build,
        documentPath,
        textContext,
        legacyDraft
      ) as Promise<SuggestionV2Result>,
    runSuggestionV2Diagnostic: (
      documentPath: string,
      textContext: SuggestionV2TextContext | null,
      legacyDraft: NamingDraft,
      includeAi: boolean
    ): Promise<SuggestionV2DiagnosticResult> =>
      ipc.invoke(
        IPC_CHANNELS.suggestionV2Diagnose,
        documentPath,
        textContext,
        legacyDraft,
        includeAi
      ) as Promise<SuggestionV2DiagnosticResult>,
    prepareClassificationPlan: (
      documentPath: string,
      proposedFilename: string
    ): Promise<PrepareClassificationPlanResult> =>
      ipc.invoke(
        IPC_CHANNELS.classificationPreparePlan,
        documentPath,
        proposedFilename
      ) as Promise<PrepareClassificationPlanResult>,
    executeClassification: (
      documentPath: string,
      proposedFilename: string
    ): Promise<ExecuteClassificationResult> =>
      ipc.invoke(
        IPC_CHANNELS.classificationExecute,
        documentPath,
        proposedFilename
      ) as Promise<ExecuteClassificationResult>,
    undoLastClassification: (): Promise<UndoClassificationResult> =>
      ipc.invoke(IPC_CHANNELS.classificationUndoLast) as Promise<UndoClassificationResult>,
    getLastUndoableAction: (): Promise<UndoableClassificationAction | null> =>
      ipc.invoke(
        IPC_CHANNELS.classificationGetLastUndoableAction
      ) as Promise<UndoableClassificationAction | null>,
    analyzeExactDuplicates: (): Promise<ExactDuplicateAnalysisResult> =>
      ipc.invoke(IPC_CHANNELS.duplicatesAnalyzeExact) as Promise<ExactDuplicateAnalysisResult>,
    extractTextFromActivePdf: (documentPath: string): Promise<PdfTextExtractionResult> =>
      ipc.invoke(
        IPC_CHANNELS.extractionExtractPdfText,
        documentPath
      ) as Promise<PdfTextExtractionResult>,
    getOcrStatus: (): Promise<OcrResult<OcrStatus>> =>
      ipc.invoke(IPC_CHANNELS.ocrGetStatus) as Promise<OcrResult<OcrStatus>>,
    selectTesseractExecutable: (): Promise<OcrResult<OcrPathSelection | null>> =>
      ipc.invoke(IPC_CHANNELS.ocrSelectTesseractExecutable) as Promise<
        OcrResult<OcrPathSelection | null>
      >,
    selectTessdataDirectory: (): Promise<OcrResult<OcrPathSelection | null>> =>
      ipc.invoke(IPC_CHANNELS.ocrSelectTessdataDirectory) as Promise<
        OcrResult<OcrPathSelection | null>
      >,
    saveOcrSettings: (settings: OcrSettingsInput): Promise<OcrResult<OcrStatus>> =>
      ipc.invoke(IPC_CHANNELS.ocrSaveSettings, settings) as Promise<OcrResult<OcrStatus>>,
    testOcrEngine: (): Promise<OcrResult<OcrStatus>> =>
      ipc.invoke(IPC_CHANNELS.ocrTestEngine) as Promise<OcrResult<OcrStatus>>,
    runOcrForActiveImage: (documentPath: string): Promise<ImageOcrResult> =>
      ipc.invoke(IPC_CHANNELS.ocrRunImage, documentPath) as Promise<ImageOcrResult>,
    getAiStatus: (): Promise<AiSettingsResult<AiStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiGetStatus) as Promise<AiSettingsResult<AiStatus>>,
    getAiSettings: (): Promise<AiSettingsResult<AiSettings>> =>
      ipc.invoke(IPC_CHANNELS.aiGetSettings) as Promise<AiSettingsResult<AiSettings>>,
    saveAiSettings: (settings: AiSettingsInput): Promise<AiSettingsResult<AiStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiSaveSettings, settings) as Promise<AiSettingsResult<AiStatus>>,
    testAiConnection: (): Promise<AiSettingsResult<AiConnectionTestStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiTestConnection) as Promise<
        AiSettingsResult<AiConnectionTestStatus>
      >,
    getAiModelStatus: (): Promise<AiSettingsResult<OllamaModelStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiGetModelStatus) as Promise<AiSettingsResult<OllamaModelStatus>>,
    unloadAiModel: (): Promise<AiSettingsResult<OllamaModelStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiUnloadModel) as Promise<AiSettingsResult<OllamaModelStatus>>,
    runAiSuggestionForActiveDocument: (
      documentPath: string,
      textContext: AiDocumentTextContext,
      legacyDraft: NamingDraft
    ): Promise<AiSettingsResult<AiDocumentSuggestion>> =>
      ipc.invoke(
        IPC_CHANNELS.aiRunSuggestion,
        documentPath,
        textContext,
        legacyDraft
      ) as Promise<AiSettingsResult<AiDocumentSuggestion>>,
    getRecentHistory: (limit?: number): Promise<ActionJournalReadResult<ActionJournalEntry[]>> =>
      ipc.invoke(IPC_CHANNELS.historyGetRecent, limit) as Promise<
        ActionJournalReadResult<ActionJournalEntry[]>
      >,
    getRulesStatus: (): Promise<UserRulesResult<NamingRulesStatus>> =>
      ipc.invoke(IPC_CHANNELS.rulesGetStatus) as Promise<UserRulesResult<NamingRulesStatus>>,
    getUserRulesCatalog: (): Promise<UserRulesResult<UserRulesLoadResult>> =>
      ipc.invoke(IPC_CHANNELS.rulesGetUserCatalog) as Promise<
        UserRulesResult<UserRulesLoadResult>
      >,
    saveUserRulesCatalog: (
      catalog: NamingSuggestionRulesCatalog
    ): Promise<UserRulesResult<NamingRulesStatus>> =>
      ipc.invoke(
        IPC_CHANNELS.rulesSaveUserCatalog,
        catalog
      ) as Promise<UserRulesResult<NamingRulesStatus>>,
    reloadNamingRules: (): Promise<UserRulesResult<NamingRulesStatus>> =>
      ipc.invoke(IPC_CHANNELS.rulesReload) as Promise<UserRulesResult<NamingRulesStatus>>,
    getReferenceDataStatus: (): Promise<ReferenceDataStoreResult<ReferenceDataOverview>> =>
      ipc.invoke(IPC_CHANNELS.referenceDataGetStatus) as Promise<
        ReferenceDataStoreResult<ReferenceDataOverview>
      >,
    openReferenceDataFolder: (): Promise<ReferenceDataStoreResult<{ path: string }>> =>
      ipc.invoke(IPC_CHANNELS.referenceDataOpenFolder) as Promise<
        ReferenceDataStoreResult<{ path: string }>
      >,
    createMissingReferenceDataFiles: (): Promise<ReferenceDataStoreResult<ReferenceDataOverview>> =>
      ipc.invoke(IPC_CHANNELS.referenceDataCreateMissing) as Promise<
        ReferenceDataStoreResult<ReferenceDataOverview>
      >,
    validateReferenceDataFile: (
      fileKey: ReferenceDataFileKey,
      content: string
    ): Promise<ReferenceDataStoreResult<ReferenceDataFileInfo>> =>
      ipc.invoke(
        IPC_CHANNELS.referenceDataValidateFile,
        fileKey,
        content
      ) as Promise<ReferenceDataStoreResult<ReferenceDataFileInfo>>,
    saveReferenceDataFile: (
      fileKey: ReferenceDataFileKey,
      content: string
    ): Promise<ReferenceDataStoreResult<ReferenceDataFileInfo>> =>
      ipc.invoke(
        IPC_CHANNELS.referenceDataSaveFile,
        fileKey,
        content
      ) as Promise<ReferenceDataStoreResult<ReferenceDataFileInfo>>,
    reloadReferenceData: (): Promise<ReferenceDataStoreResult<ReferenceDataOverview>> =>
      ipc.invoke(IPC_CHANNELS.referenceDataReload) as Promise<
        ReferenceDataStoreResult<ReferenceDataOverview>
      >
  };
}

export type DocSorterApi = ReturnType<typeof createPreloadApi>;
