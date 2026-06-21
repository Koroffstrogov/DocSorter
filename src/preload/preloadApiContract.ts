import type { PrepareClassificationPlanResult } from "../classification/classificationPlan";
import type {
  AiDocumentSuggestion,
  AiDocumentTextContext
} from "../ai/ollamaDocumentSuggestion";
import type { AiDiagnosticResult } from "../diagnostics/aiDiagnostic";
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
import type {
  DocumentDiscardMode,
  DocumentDiscardResult
} from "../file-ops/discardDocuments";
import type { FolderLearningTargetFolderNamesResult } from "../folder-learning/targetFolderNameListing";
import type { ActionJournalReadResult } from "../history/actionJournal";
import type { UndoableClassificationAction } from "../history/historyTypes";
import type { ActionJournalEntry } from "../history/historyTypes";
import { IPC_CHANNELS, type IpcChannel } from "../ipc/ipcChannels";
import type {
  KnownTargetInput,
  KnownTargetsList,
  KnownTargetsResult
} from "../known-targets/knownTargets";
import type { DestinationAvailabilityResult } from "../naming/destinationNameAvailability";
import type { NamingDraft, ProposedFilename } from "../naming/namingDraft";
import type {
  ImageOcrResult
} from "../ocr/imageOcrService";
import type {
  PdfOcrProgress,
  PdfOcrResult,
  PdfOcrStatus
} from "../ocr/pdfOcrService";
import type {
  OcrPathSelection,
  OcrResult,
  OcrSettingsInput,
  OcrStatus
} from "../ocr/ocrTypes";
import type { PreviewData } from "../preview/previewTypes";
import type { SourceDirectoryListing } from "../source-browser/sourceDirectoryBrowser";
import type {
  TargetFolderCreation,
  TargetFolderList,
  TargetFolderResult
} from "../naming/targetFolder";

interface DirectorySelection {
  path: string;
}

export interface IpcInvoker {
  invoke: (channel: IpcChannel, ...args: unknown[]) => Promise<unknown>;
  on?: (
    channel: IpcChannel,
    listener: (event: unknown, value: unknown) => void
  ) => () => void;
}

export const ALLOWED_PRELOAD_API_METHODS = [
  "getVersion",
  "selectSourceDirectory",
  "listSourceDirectory",
  "selectTargetDirectory",
  "listTargetFolders",
  "setTargetFolder",
  "createTargetFolder",
  "listTargetFolderNames",
  "refreshSourceDocuments",
  "discardDocuments",
  "getPreviewData",
  "createInitialNamingDraft",
  "buildNamingProposal",
  "checkDestinationAvailability",
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
  "getPdfOcrStatus",
  "runOcrForActivePdf",
  "onPdfOcrProgress",
  "getAiStatus",
  "getAiSettings",
  "saveAiSettings",
  "testAiConnection",
  "getAiModelStatus",
  "preloadAiModel",
  "unloadAiModel",
  "runAiSuggestionForActiveDocument",
  "exportAiDiagnostic",
  "listKnownTargets",
  "createKnownTarget",
  "updateKnownTarget",
  "deactivateKnownTarget",
  "deleteKnownTarget",
  "getRecentHistory"
] as const;

export type PreloadApiMethod = (typeof ALLOWED_PRELOAD_API_METHODS)[number];

export function createPreloadApi(ipc: IpcInvoker) {
  return {
    getVersion: (): Promise<string> =>
      ipc.invoke(IPC_CHANNELS.appGetVersion) as Promise<string>,
    selectSourceDirectory: (sourcePath?: string): Promise<Result<DirectorySelection | null>> =>
      ipc.invoke(
        IPC_CHANNELS.directorySelectSource,
        sourcePath
      ) as Promise<Result<DirectorySelection | null>>,
    listSourceDirectory: (sourcePath?: string | null): Promise<Result<SourceDirectoryListing>> =>
      ipc.invoke(
        IPC_CHANNELS.sourceListDirectory,
        sourcePath
      ) as Promise<Result<SourceDirectoryListing>>,
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
    listTargetFolderNames: (): Promise<FolderLearningTargetFolderNamesResult> =>
      ipc.invoke(IPC_CHANNELS.folderLearningListNames) as Promise<FolderLearningTargetFolderNamesResult>,
    refreshSourceDocuments: (): Promise<Result<DocumentDiscoveryResult>> =>
      ipc.invoke(IPC_CHANNELS.documentsRefreshSource) as Promise<Result<DocumentDiscoveryResult>>,
    discardDocuments: (
      documentPaths: string[],
      mode: DocumentDiscardMode,
      confirmed: boolean
    ): Promise<DocumentDiscardResult> =>
      ipc.invoke(
        IPC_CHANNELS.documentsDiscard,
        { documentPaths, mode, confirmed }
      ) as Promise<DocumentDiscardResult>,
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
    runOcrForActiveImage: (
      documentPath: string,
      options?: { forceRefresh?: boolean }
    ): Promise<ImageOcrResult> =>
      ipc.invoke(IPC_CHANNELS.ocrRunImage, documentPath, options) as Promise<ImageOcrResult>,
    getPdfOcrStatus: (): Promise<OcrResult<PdfOcrStatus>> =>
      ipc.invoke(IPC_CHANNELS.ocrGetPdfStatus) as Promise<OcrResult<PdfOcrStatus>>,
    runOcrForActivePdf: (documentPath: string): Promise<PdfOcrResult> =>
      ipc.invoke(IPC_CHANNELS.ocrRunPdf, documentPath) as Promise<PdfOcrResult>,
    onPdfOcrProgress: (listener: (progress: Omit<PdfOcrProgress, "documentPath">) => void): (() => void) =>
      ipc.on?.(IPC_CHANNELS.ocrPdfProgress, (_event, value) => {
        if (isPdfOcrProgress(value)) {
          listener(value);
        }
      }) ?? (() => undefined),
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
    preloadAiModel: (): Promise<AiSettingsResult<OllamaModelStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiPreloadModel) as Promise<AiSettingsResult<OllamaModelStatus>>,
    unloadAiModel: (): Promise<AiSettingsResult<OllamaModelStatus>> =>
      ipc.invoke(IPC_CHANNELS.aiUnloadModel) as Promise<AiSettingsResult<OllamaModelStatus>>,
    runAiSuggestionForActiveDocument: (
      documentPath: string,
      textContext: AiDocumentTextContext
    ): Promise<AiSettingsResult<AiDocumentSuggestion>> =>
      ipc.invoke(
        IPC_CHANNELS.aiRunSuggestion,
        documentPath,
        textContext
      ) as Promise<AiSettingsResult<AiDocumentSuggestion>>,
    exportAiDiagnostic: (
      documentPath: string,
      textContext: AiDocumentTextContext | null,
      aiResult: unknown
    ): Promise<AiDiagnosticResult> =>
      ipc.invoke(
        IPC_CHANNELS.aiExportDiagnostic,
        documentPath,
        textContext,
        aiResult
      ) as Promise<AiDiagnosticResult>,
    listKnownTargets: (): Promise<KnownTargetsResult<KnownTargetsList>> =>
      ipc.invoke(IPC_CHANNELS.knownTargetsList) as Promise<KnownTargetsResult<KnownTargetsList>>,
    createKnownTarget: (
      input: KnownTargetInput
    ): Promise<KnownTargetsResult<KnownTargetsList>> =>
      ipc.invoke(
        IPC_CHANNELS.knownTargetsCreate,
        input
      ) as Promise<KnownTargetsResult<KnownTargetsList>>,
    updateKnownTarget: (
      id: string,
      input: KnownTargetInput
    ): Promise<KnownTargetsResult<KnownTargetsList>> =>
      ipc.invoke(
        IPC_CHANNELS.knownTargetsUpdate,
        id,
        input
      ) as Promise<KnownTargetsResult<KnownTargetsList>>,
    deactivateKnownTarget: (
      id: string
    ): Promise<KnownTargetsResult<KnownTargetsList>> =>
      ipc.invoke(
        IPC_CHANNELS.knownTargetsDeactivate,
        id
      ) as Promise<KnownTargetsResult<KnownTargetsList>>,
    deleteKnownTarget: (
      id: string
    ): Promise<KnownTargetsResult<KnownTargetsList>> =>
      ipc.invoke(
        IPC_CHANNELS.knownTargetsDelete,
        id
      ) as Promise<KnownTargetsResult<KnownTargetsList>>,
    getRecentHistory: (limit?: number): Promise<ActionJournalReadResult<ActionJournalEntry[]>> =>
      ipc.invoke(IPC_CHANNELS.historyGetRecent, limit) as Promise<
        ActionJournalReadResult<ActionJournalEntry[]>
      >
  };
}

export type DocSorterApi = ReturnType<typeof createPreloadApi>;

function isPdfOcrProgress(value: unknown): value is Omit<PdfOcrProgress, "documentPath"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Omit<PdfOcrProgress, "documentPath">>;
  return (
    typeof candidate.page === "number" &&
    typeof candidate.pageIndex === "number" &&
    typeof candidate.pageCount === "number" &&
    typeof candidate.message === "string"
  );
}
