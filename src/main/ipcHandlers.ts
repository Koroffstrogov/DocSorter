import path from "node:path";

import {
  runOllamaSuggestionForDocument as runOllamaSuggestionForDocumentService,
  type AiDocumentSuggestion,
  type AiDocumentTextContext
} from "../ai/ollamaDocumentSuggestion";
import {
  getConfiguredOllamaModelStatus as getConfiguredOllamaModelStatusService,
  unloadConfiguredOllamaModel as unloadConfiguredOllamaModelService,
  type OllamaModelStatus
} from "../ai/ollamaModelManager";
import {
  getAiStatus as getAiStatusService,
  loadAiSettings as loadAiSettingsService,
  saveAiSettings as saveAiSettingsService,
  type AiSettings,
  type AiSettingsInput,
  type AiSettingsResult,
  type AiStatus
} from "../ai/ollamaSettings";
import {
  testAiConnection as testAiConnectionService,
  type AiConnectionTestStatus
} from "../ai/ollamaProvider";
import {
  extractTextFromPdfDocumentWithAnalysisCache as extractTextFromPdfDocumentService
} from "../analysis/pdfAnalysisCache";
import {
  prepareClassificationPlan as prepareClassificationPlanService,
  type PrepareClassificationPlanResult
} from "../classification/classificationPlan";
import {
  discoverDocuments as discoverDocumentsService,
  type DocumentDiscoveryResult,
  type Result
} from "../documents/documentDiscovery";
import {
  analyzeExactDuplicates as analyzeExactDuplicatesService,
  type DuplicateSourceDocument,
  type ExactDuplicateAnalysisResult
} from "../duplicates/exactDuplicates";
import {
  type PdfTextExtractionResult
} from "../extraction/pdfTextExtraction";
import {
  executeClassification as executeClassificationService,
  undoLastClassification as undoLastClassificationService,
  type ExecuteClassificationResult,
  type UndoClassificationResult
} from "../file-ops/classifyFile";
import {
  getActionJournalFilePath as getActionJournalFilePathService,
  readLastUndoableClassification as readLastUndoableClassificationService,
  readRecentActions as readRecentActionsService,
  type ActionJournalReadResult
} from "../history/actionJournal";
import type { ActionJournalEntry, UndoableClassificationAction } from "../history/historyTypes";
import { IPC_CHANNELS, type IpcChannel } from "../ipc/ipcChannels";
import {
  checkDestinationNameAvailability as checkDestinationNameAvailabilityService,
  type DestinationAvailabilityResult
} from "../naming/destinationNameAvailability";
import {
  createTargetSubdirectory as createTargetSubdirectoryService,
  listTargetSubdirectories as listTargetSubdirectoriesService,
  normalizeTargetFolderRelative as normalizeTargetFolderRelativeService,
  type TargetFolderCreation,
  type TargetFolderList,
  type TargetFolderResult
} from "../naming/targetFolder";
import {
  buildProposedFilename as buildProposedFilenameService,
  createInitialNamingDraft as createInitialNamingDraftService,
  isNamingDraft as isNamingDraftService,
  type NamingDraft,
  type ProposedFilename
} from "../naming/namingDraft";
import {
  getPreviewData as getPreviewDataService,
  type PreviewAccessContext
} from "../preview/previewService";
import type { PreviewDataResult } from "../preview/previewTypes";
import { testOcrEngine as testOcrEngineService } from "../ocr/tesseractCli";
import {
  runImageOcrForDocument as runImageOcrForDocumentService,
  type ImageOcrResult
} from "../ocr/imageOcrService";
import {
  getOcrStatus as getOcrStatusService,
  saveOcrSettings as saveOcrSettingsService
} from "../ocr/tesseractConfig";
import type {
  OcrPathSelection,
  OcrResult,
  OcrSettingsInput,
  OcrStatus
} from "../ocr/ocrTypes";
import {
  loadMergedNamingRulesCatalog as loadMergedNamingRulesCatalogService,
  loadUserRulesCatalog as loadUserRulesCatalogService,
  saveUserRulesCatalog as saveUserRulesCatalogService,
  type NamingRulesStatus,
  type UserRulesLoadResult,
  type UserRulesResult
} from "../rules/userNamingRulesStore";

interface DirectorySelection {
  path: string;
}

export interface IpcMainLike {
  handle: (channel: IpcChannel, listener: IpcHandlerListener) => void;
}

export type IpcHandlerListener = (event: unknown, ...args: unknown[]) => unknown;

export interface AppLike {
  getVersion: () => string;
  getPath: (name: "userData") => string;
}

export interface DialogLike {
  showOpenDialog: (options: {
    title: string;
    properties: Array<"openDirectory" | "openFile">;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
}

export interface MainProcessAppState {
  selectedSourcePath: string | null;
  selectedTargetPath: string | null;
  selectedTargetFolder: string;
  queuedDocumentPaths: Set<string>;
  queuedDocuments: DuplicateSourceDocument[];
  lastUndoableAction: UndoableClassificationAction | null;
  physicallyUndoneActionIds: Set<string>;
}

export interface IpcHandlerServices {
  discoverDocuments: (
    sourcePath: string | undefined
  ) => Promise<Result<DocumentDiscoveryResult>>;
  createInitialNamingDraft: (originalName: string) => NamingDraft;
  isNamingDraft: (value: unknown) => value is NamingDraft;
  buildProposedFilename: (draft: NamingDraft, originalExtension: string) => ProposedFilename;
  checkDestinationNameAvailability: (
    targetPath: string | null | undefined,
    proposedFilename: string,
    targetFolder?: string
  ) => Promise<DestinationAvailabilityResult>;
  normalizeTargetFolderRelative: (targetFolder: string) => TargetFolderResult<string>;
  listTargetSubdirectories: (
    targetPath: string | null | undefined
  ) => Promise<TargetFolderResult<TargetFolderList>>;
  createTargetSubdirectory: (
    targetPath: string | null | undefined,
    targetFolder: string
  ) => Promise<TargetFolderResult<TargetFolderCreation>>;
  prepareClassificationPlan: (options: {
    documentPath: string;
    proposedFilename: string;
    selectedTargetPath: string | null | undefined;
    targetFolder?: string;
    queuedDocumentPaths: Iterable<string>;
  }) => Promise<PrepareClassificationPlanResult>;
  executeClassification: (options: {
    documentPath: string;
    proposedFilename: string;
    selectedTargetPath: string | null | undefined;
    targetFolder?: string;
    queuedDocumentPaths: Iterable<string>;
    journalFilePath: string;
  }) => Promise<ExecuteClassificationResult>;
  undoLastClassification: (options: {
    undoableAction: UndoableClassificationAction | null;
    journalFilePath: string;
  }) => Promise<UndoClassificationResult>;
  getActionJournalFilePath: (userDataPath: string) => string;
  readLastUndoableClassification: (
    journalFilePath: string
  ) => Promise<ActionJournalReadResult<UndoableClassificationAction | null>>;
  readRecentActions: (
    journalFilePath: string,
    limit?: number
  ) => Promise<ActionJournalReadResult<ActionJournalEntry[]>>;
  analyzeExactDuplicates: (options: {
    sourceDocuments: DuplicateSourceDocument[];
    journalFilePath: string;
  }) => Promise<ExactDuplicateAnalysisResult>;
  extractTextFromPdfDocument: (options: {
    documentPath: string;
    queuedDocumentPaths: Iterable<string>;
    userDataPath: string;
    rulesCatalog: NamingSuggestionRulesCatalog;
  }) => Promise<PdfTextExtractionResult>;
  getPreviewData: (
    documentPath: string | undefined,
    context: PreviewAccessContext
  ) => Promise<PreviewDataResult>;
  getOcrStatus: (userDataPath: string) => Promise<OcrResult<OcrStatus>>;
  saveOcrSettings: (
    userDataPath: string,
    settings: OcrSettingsInput
  ) => Promise<OcrResult<OcrStatus>>;
  testOcrEngine: (userDataPath: string) => Promise<OcrResult<OcrStatus>>;
  runImageOcrForDocument: (options: {
    documentPath: string;
    queuedDocumentPaths: Iterable<string>;
    userDataPath: string;
    rulesCatalog: NamingSuggestionRulesCatalog;
  }) => Promise<ImageOcrResult>;
  getAiStatus: (userDataPath: string) => Promise<AiSettingsResult<AiStatus>>;
  loadAiSettings: (userDataPath: string) => Promise<AiSettingsResult<AiSettings>>;
  saveAiSettings: (
    userDataPath: string,
    settings: AiSettingsInput
  ) => Promise<AiSettingsResult<AiStatus>>;
  testAiConnection: (userDataPath: string) => Promise<AiSettingsResult<AiConnectionTestStatus>>;
  getAiModelStatus: (userDataPath: string) => Promise<AiSettingsResult<OllamaModelStatus>>;
  unloadAiModel: (userDataPath: string) => Promise<AiSettingsResult<OllamaModelStatus>>;
  runAiSuggestionForDocument: (options: {
    documentPath: string;
    textContext: AiDocumentTextContext | null;
    queuedDocuments: Iterable<DuplicateSourceDocument>;
    queuedDocumentPaths: Iterable<string>;
    userDataPath: string;
    rulesCatalog: NamingSuggestionRulesCatalog;
    knownRelativeFolders: string[];
  }) => Promise<AiSettingsResult<AiDocumentSuggestion>>;
  loadMergedNamingRulesCatalog: (
    userDataPath: string
  ) => Promise<UserRulesResult<NamingRulesStatus>>;
  loadUserRulesCatalog: (
    userDataPath: string
  ) => Promise<UserRulesResult<UserRulesLoadResult>>;
  saveUserRulesCatalog: (
    userDataPath: string,
    catalog: NamingSuggestionRulesCatalog
  ) => Promise<UserRulesResult<void>>;
}

export interface RegisterIpcHandlersOptions {
  ipcMain: IpcMainLike;
  dialog: DialogLike;
  app: AppLike;
  appState?: MainProcessAppState;
  services?: IpcHandlerServices;
}

export interface SensitiveIpcHandlerContract {
  channel: IpcChannel;
  acceptsRendererPath: boolean;
  usesMainSource: boolean;
  usesMainTarget: boolean;
  usesUserDataPath: boolean;
  serviceName: string;
}

export const SENSITIVE_IPC_HANDLERS: SensitiveIpcHandlerContract[] = [
  {
    channel: IPC_CHANNELS.directorySelectSource,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: false,
    serviceName: "dialog.showOpenDialog"
  },
  {
    channel: IPC_CHANNELS.directorySelectTarget,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: false,
    serviceName: "dialog.showOpenDialog"
  },
  {
    channel: IPC_CHANNELS.targetListFolders,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: true,
    usesUserDataPath: false,
    serviceName: "listTargetSubdirectories"
  },
  {
    channel: IPC_CHANNELS.targetSetFolder,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: true,
    usesUserDataPath: false,
    serviceName: "normalizeTargetFolderRelative"
  },
  {
    channel: IPC_CHANNELS.targetCreateFolder,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: true,
    usesUserDataPath: false,
    serviceName: "createTargetSubdirectory"
  },
  {
    channel: IPC_CHANNELS.documentsRefreshSource,
    acceptsRendererPath: false,
    usesMainSource: true,
    usesMainTarget: false,
    usesUserDataPath: false,
    serviceName: "discoverDocuments"
  },
  {
    channel: IPC_CHANNELS.previewGetData,
    acceptsRendererPath: true,
    usesMainSource: true,
    usesMainTarget: false,
    usesUserDataPath: false,
    serviceName: "getPreviewData"
  },
  {
    channel: IPC_CHANNELS.extractionExtractPdfText,
    acceptsRendererPath: true,
    usesMainSource: true,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "extractTextFromPdfDocument"
  },
  {
    channel: IPC_CHANNELS.ocrGetStatus,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "getOcrStatus"
  },
  {
    channel: IPC_CHANNELS.ocrSelectTesseractExecutable,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: false,
    serviceName: "dialog.showOpenDialog"
  },
  {
    channel: IPC_CHANNELS.ocrSelectTessdataDirectory,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: false,
    serviceName: "dialog.showOpenDialog"
  },
  {
    channel: IPC_CHANNELS.ocrSaveSettings,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "saveOcrSettings"
  },
  {
    channel: IPC_CHANNELS.ocrTestEngine,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "testOcrEngine"
  },
  {
    channel: IPC_CHANNELS.ocrRunImage,
    acceptsRendererPath: true,
    usesMainSource: true,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "runImageOcrForDocument"
  },
  {
    channel: IPC_CHANNELS.aiGetStatus,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "getAiStatus"
  },
  {
    channel: IPC_CHANNELS.aiGetSettings,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "loadAiSettings"
  },
  {
    channel: IPC_CHANNELS.aiSaveSettings,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "saveAiSettings"
  },
  {
    channel: IPC_CHANNELS.aiTestConnection,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "testAiConnection"
  },
  {
    channel: IPC_CHANNELS.aiGetModelStatus,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "getAiModelStatus"
  },
  {
    channel: IPC_CHANNELS.aiUnloadModel,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "unloadAiModel"
  },
  {
    channel: IPC_CHANNELS.aiRunSuggestion,
    acceptsRendererPath: true,
    usesMainSource: true,
    usesMainTarget: true,
    usesUserDataPath: true,
    serviceName: "runAiSuggestionForDocument"
  },
  {
    channel: IPC_CHANNELS.namingCheckDestinationAvailability,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: true,
    usesUserDataPath: false,
    serviceName: "checkDestinationNameAvailability"
  },
  {
    channel: IPC_CHANNELS.classificationPreparePlan,
    acceptsRendererPath: true,
    usesMainSource: true,
    usesMainTarget: true,
    usesUserDataPath: false,
    serviceName: "prepareClassificationPlan"
  },
  {
    channel: IPC_CHANNELS.classificationExecute,
    acceptsRendererPath: true,
    usesMainSource: true,
    usesMainTarget: true,
    usesUserDataPath: true,
    serviceName: "executeClassification"
  },
  {
    channel: IPC_CHANNELS.classificationUndoLast,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "undoLastClassification"
  },
  {
    channel: IPC_CHANNELS.classificationGetLastUndoableAction,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "readLastUndoableClassification"
  },
  {
    channel: IPC_CHANNELS.duplicatesAnalyzeExact,
    acceptsRendererPath: false,
    usesMainSource: true,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "analyzeExactDuplicates"
  },
  {
    channel: IPC_CHANNELS.historyGetRecent,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "readRecentActions"
  },
  {
    channel: IPC_CHANNELS.rulesGetStatus,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "loadMergedNamingRulesCatalog"
  },
  {
    channel: IPC_CHANNELS.rulesGetUserCatalog,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "loadUserRulesCatalog"
  },
  {
    channel: IPC_CHANNELS.rulesSaveUserCatalog,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "saveUserRulesCatalog"
  },
  {
    channel: IPC_CHANNELS.rulesReload,
    acceptsRendererPath: false,
    usesMainSource: false,
    usesMainTarget: false,
    usesUserDataPath: true,
    serviceName: "loadMergedNamingRulesCatalog"
  }
];

export const defaultIpcHandlerServices: IpcHandlerServices = {
  discoverDocuments: discoverDocumentsService,
  createInitialNamingDraft: createInitialNamingDraftService,
  isNamingDraft: isNamingDraftService,
  buildProposedFilename: buildProposedFilenameService,
  checkDestinationNameAvailability: (targetPath, proposedFilename, targetFolder) =>
    checkDestinationNameAvailabilityService(targetPath, proposedFilename, { targetFolder }),
  normalizeTargetFolderRelative: normalizeTargetFolderRelativeService,
  listTargetSubdirectories: listTargetSubdirectoriesService,
  createTargetSubdirectory: createTargetSubdirectoryService,
  prepareClassificationPlan: prepareClassificationPlanService,
  executeClassification: executeClassificationService,
  undoLastClassification: undoLastClassificationService,
  getActionJournalFilePath: getActionJournalFilePathService,
  readLastUndoableClassification: readLastUndoableClassificationService,
  readRecentActions: readRecentActionsService,
  analyzeExactDuplicates: analyzeExactDuplicatesService,
  extractTextFromPdfDocument: extractTextFromPdfDocumentService,
  getPreviewData: getPreviewDataService,
  getOcrStatus: getOcrStatusService,
  saveOcrSettings: saveOcrSettingsService,
  testOcrEngine: testOcrEngineService,
  runImageOcrForDocument: runImageOcrForDocumentService,
  getAiStatus: getAiStatusService,
  loadAiSettings: loadAiSettingsService,
  saveAiSettings: saveAiSettingsService,
  testAiConnection: testAiConnectionService,
  getAiModelStatus: getConfiguredOllamaModelStatusService,
  unloadAiModel: unloadConfiguredOllamaModelService,
  runAiSuggestionForDocument: runOllamaSuggestionForDocumentService,
  loadMergedNamingRulesCatalog: loadMergedNamingRulesCatalogService,
  loadUserRulesCatalog: loadUserRulesCatalogService,
  saveUserRulesCatalog: saveUserRulesCatalogService
};

export function createMainProcessAppState(): MainProcessAppState {
  return {
    selectedSourcePath: null,
    selectedTargetPath: null,
    selectedTargetFolder: "",
    queuedDocumentPaths: new Set(),
    queuedDocuments: [],
    lastUndoableAction: null,
    physicallyUndoneActionIds: new Set()
  };
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): MainProcessAppState {
  const state = options.appState ?? createMainProcessAppState();
  const services = options.services ?? defaultIpcHandlerServices;

  options.ipcMain.handle(IPC_CHANNELS.appGetVersion, () => options.app.getVersion());

  options.ipcMain.handle(IPC_CHANNELS.directorySelectSource, () =>
    selectSourceDirectory(options.dialog, state)
  );
  options.ipcMain.handle(IPC_CHANNELS.directorySelectTarget, () =>
    selectTargetDirectory(options.dialog, state)
  );
  options.ipcMain.handle(IPC_CHANNELS.documentsRefreshSource, () =>
    refreshSelectedSourceDocuments(state, services)
  );
  options.ipcMain.handle(IPC_CHANNELS.targetListFolders, () =>
    services.listTargetSubdirectories(state.selectedTargetPath)
  );
  options.ipcMain.handle(IPC_CHANNELS.targetSetFolder, (_event, targetFolder: unknown) => {
    const result = services.normalizeTargetFolderRelative(
      typeof targetFolder === "string" ? targetFolder : ""
    );
    if (result.ok) {
      state.selectedTargetFolder = result.value;
    }

    return result;
  });
  options.ipcMain.handle(IPC_CHANNELS.targetCreateFolder, async (_event, targetFolder: unknown) => {
    const result = await services.createTargetSubdirectory(
      state.selectedTargetPath,
      typeof targetFolder === "string" ? targetFolder : ""
    );
    if (result.ok) {
      state.selectedTargetFolder = result.value.targetFolder;
    }

    return result;
  });
  options.ipcMain.handle(IPC_CHANNELS.namingCreateInitialDraft, (_event, originalName: unknown) => {
    if (typeof originalName !== "string") {
      return services.createInitialNamingDraft("");
    }

    return services.createInitialNamingDraft(originalName);
  });
  options.ipcMain.handle(
    IPC_CHANNELS.namingBuildProposal,
    (_event, draft: unknown, originalExtension: unknown) => {
      if (!services.isNamingDraft(draft) || typeof originalExtension !== "string") {
        return services.buildProposedFilename(
          {
            documentDate: "",
            subject: "",
            documentType: "",
            keywords: ""
          },
          ""
        );
      }

      return services.buildProposedFilename(draft, originalExtension);
    }
  );
  options.ipcMain.handle(
    IPC_CHANNELS.namingCheckDestinationAvailability,
    (_event, proposedFilename: unknown) =>
      services.checkDestinationNameAvailability(
        state.selectedTargetPath,
        typeof proposedFilename === "string" ? proposedFilename : "",
        state.selectedTargetFolder
      )
  );
  options.ipcMain.handle(
    IPC_CHANNELS.classificationPreparePlan,
    (_event, documentPath: unknown, proposedFilename: unknown) =>
      services.prepareClassificationPlan({
        documentPath: typeof documentPath === "string" ? documentPath : "",
        proposedFilename: typeof proposedFilename === "string" ? proposedFilename : "",
        selectedTargetPath: state.selectedTargetPath,
        targetFolder: state.selectedTargetFolder,
        queuedDocumentPaths: state.queuedDocumentPaths
      })
  );
  options.ipcMain.handle(
    IPC_CHANNELS.classificationExecute,
    async (_event, documentPath: unknown, proposedFilename: unknown) => {
      const result = await services.executeClassification({
        documentPath: typeof documentPath === "string" ? documentPath : "",
        proposedFilename: typeof proposedFilename === "string" ? proposedFilename : "",
        selectedTargetPath: state.selectedTargetPath,
        targetFolder: state.selectedTargetFolder,
        queuedDocumentPaths: state.queuedDocumentPaths,
        journalFilePath: getJournalFilePath(options.app, services)
      });

      if (result.ok) {
        state.lastUndoableAction = result.value.undoableAction;
        state.physicallyUndoneActionIds.delete(result.value.undoableAction.id);
        state.queuedDocumentPaths.delete(path.resolve(result.value.undoableAction.originalPath));
        state.queuedDocuments = state.queuedDocuments.filter(
          (documentItem) =>
            path.resolve(documentItem.filePath) !==
            path.resolve(result.value.undoableAction.originalPath)
        );
      }

      return result;
    }
  );
  options.ipcMain.handle(IPC_CHANNELS.classificationUndoLast, async () => {
    const result = await services.undoLastClassification({
      undoableAction: state.lastUndoableAction,
      journalFilePath: getJournalFilePath(options.app, services)
    });

    if (result.ok) {
      state.physicallyUndoneActionIds.add(result.value.originalActionId);
      state.queuedDocumentPaths.add(path.resolve(result.value.restoredPath));
      state.queuedDocuments.push({
        filePath: result.value.restoredPath,
        name: path.basename(result.value.restoredPath)
      });
      state.lastUndoableAction = null;
    }

    return result;
  });
  options.ipcMain.handle(IPC_CHANNELS.classificationGetLastUndoableAction, () =>
    getLastUndoableAction(options.app, state, services)
  );
  options.ipcMain.handle(IPC_CHANNELS.duplicatesAnalyzeExact, () =>
    analyzeQueuedExactDuplicates(options.app, state, services)
  );
  options.ipcMain.handle(IPC_CHANNELS.extractionExtractPdfText, async (_event, documentPath: unknown) =>
    services.extractTextFromPdfDocument({
      documentPath: typeof documentPath === "string" ? documentPath : "",
      queuedDocumentPaths: state.queuedDocumentPaths,
      userDataPath: options.app.getPath("userData"),
      rulesCatalog: await getRulesCatalogForAnalysis(options.app, services)
    })
  );
  options.ipcMain.handle(IPC_CHANNELS.ocrGetStatus, () =>
    services.getOcrStatus(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.ocrSelectTesseractExecutable, () =>
    selectTesseractExecutable(options.dialog)
  );
  options.ipcMain.handle(IPC_CHANNELS.ocrSelectTessdataDirectory, () =>
    selectTessdataDirectory(options.dialog)
  );
  options.ipcMain.handle(IPC_CHANNELS.ocrSaveSettings, (_event, settings: unknown) =>
    services.saveOcrSettings(options.app.getPath("userData"), settings as OcrSettingsInput)
  );
  options.ipcMain.handle(IPC_CHANNELS.ocrTestEngine, () =>
    services.testOcrEngine(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.ocrRunImage, async (_event, documentPath: unknown) =>
    services.runImageOcrForDocument({
      documentPath: typeof documentPath === "string" ? documentPath : "",
      queuedDocumentPaths: state.queuedDocumentPaths,
      userDataPath: options.app.getPath("userData"),
      rulesCatalog: await getRulesCatalogForAnalysis(options.app, services)
    })
  );
  options.ipcMain.handle(IPC_CHANNELS.aiGetStatus, () =>
    services.getAiStatus(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.aiGetSettings, () =>
    services.loadAiSettings(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.aiSaveSettings, (_event, settings: unknown) =>
    services.saveAiSettings(options.app.getPath("userData"), settings as AiSettingsInput)
  );
  options.ipcMain.handle(IPC_CHANNELS.aiTestConnection, () =>
    services.testAiConnection(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.aiGetModelStatus, () =>
    services.getAiModelStatus(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.aiUnloadModel, () =>
    services.unloadAiModel(options.app.getPath("userData"))
  );
  options.ipcMain.handle(
    IPC_CHANNELS.aiRunSuggestion,
    async (_event, documentPath: unknown, textContext: unknown) =>
      services.runAiSuggestionForDocument({
        documentPath: typeof documentPath === "string" ? documentPath : "",
        textContext: readAiDocumentTextContext(textContext),
        queuedDocuments: state.queuedDocuments,
        queuedDocumentPaths: state.queuedDocumentPaths,
        userDataPath: options.app.getPath("userData"),
        rulesCatalog: await getRulesCatalogForAnalysis(options.app, services),
        knownRelativeFolders: await getKnownTargetFoldersForAi(state, services)
      })
  );
  options.ipcMain.handle(IPC_CHANNELS.historyGetRecent, (_event, limit: unknown) =>
    services.readRecentActions(
      getJournalFilePath(options.app, services),
      typeof limit === "number" && Number.isFinite(limit) ? limit : 8
    )
  );
  options.ipcMain.handle(IPC_CHANNELS.rulesGetStatus, () =>
    services.loadMergedNamingRulesCatalog(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.rulesGetUserCatalog, () =>
    services.loadUserRulesCatalog(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.rulesReload, () =>
    services.loadMergedNamingRulesCatalog(options.app.getPath("userData"))
  );
  options.ipcMain.handle(IPC_CHANNELS.rulesSaveUserCatalog, async (_event, catalog: unknown) => {
    const result = await services.saveUserRulesCatalog(
      options.app.getPath("userData"),
      catalog as NamingSuggestionRulesCatalog
    );

    if (!result.ok) {
      return result;
    }

    return services.loadMergedNamingRulesCatalog(options.app.getPath("userData"));
  });

  options.ipcMain.handle(IPC_CHANNELS.previewGetData, (_event, documentPath: unknown) => {
    if (typeof documentPath !== "string") {
      return services.getPreviewData(undefined, {
        sourcePath: state.selectedSourcePath,
        queuedDocumentPaths: state.queuedDocumentPaths
      });
    }

    return services.getPreviewData(documentPath, {
      sourcePath: state.selectedSourcePath,
      queuedDocumentPaths: state.queuedDocumentPaths
    });
  });

  return state;
}

async function selectSourceDirectory(
  dialog: DialogLike,
  state: MainProcessAppState
): Promise<Result<DirectorySelection | null>> {
  const selection = await selectDirectory(dialog, "Choisir le dossier source");
  if (selection.ok && selection.value) {
    state.selectedSourcePath = selection.value.path;
    state.queuedDocumentPaths = new Set();
    state.queuedDocuments = [];
  }

  return selection;
}

async function selectTargetDirectory(
  dialog: DialogLike,
  state: MainProcessAppState
): Promise<Result<DirectorySelection | null>> {
  const selection = await selectDirectory(dialog, "Choisir le dossier cible");
  if (selection.ok && selection.value) {
    state.selectedTargetPath = selection.value.path;
    state.selectedTargetFolder = "";
  }

  return selection;
}

async function refreshSelectedSourceDocuments(
  state: MainProcessAppState,
  services: IpcHandlerServices
) {
  if (!state.selectedSourcePath) {
    state.queuedDocumentPaths = new Set();
    state.queuedDocuments = [];
    return services.discoverDocuments(undefined);
  }

  return refreshSourceDocuments(state.selectedSourcePath, state, services);
}

async function refreshSourceDocuments(
  sourcePath: string,
  state: MainProcessAppState,
  services: IpcHandlerServices
) {
  const result = await services.discoverDocuments(sourcePath);
  if (result.ok) {
    state.queuedDocumentPaths = new Set(
      result.value.documents.map((documentItem) => path.resolve(documentItem.filePath))
    );
    state.queuedDocuments = result.value.documents.map((documentItem) => ({
      filePath: documentItem.filePath,
      name: documentItem.name
    }));
  } else {
    state.queuedDocumentPaths = new Set();
    state.queuedDocuments = [];
  }

  return result;
}

async function getLastUndoableAction(
  app: AppLike,
  state: MainProcessAppState,
  services: IpcHandlerServices
): Promise<UndoableClassificationAction | null> {
  if (state.lastUndoableAction) {
    if (state.physicallyUndoneActionIds.has(state.lastUndoableAction.id)) {
      state.lastUndoableAction = null;
      return null;
    }

    return state.lastUndoableAction;
  }

  const journalAction = await services.readLastUndoableClassification(
    getJournalFilePath(app, services)
  );
  if (!journalAction.ok) {
    return null;
  }

  if (journalAction.value && state.physicallyUndoneActionIds.has(journalAction.value.id)) {
    return null;
  }

  state.lastUndoableAction = journalAction.value;
  return state.lastUndoableAction;
}

async function analyzeQueuedExactDuplicates(
  app: AppLike,
  state: MainProcessAppState,
  services: IpcHandlerServices
) {
  if (!state.selectedSourcePath) {
    return {
      ok: false,
      error: {
        code: "SOURCE_NOT_SELECTED",
        message: "Aucun dossier source sélectionné."
      }
    };
  }

  return services.analyzeExactDuplicates({
    sourceDocuments: state.queuedDocuments,
    journalFilePath: getJournalFilePath(app, services)
  });
}

function getJournalFilePath(app: AppLike, services: IpcHandlerServices): string {
  return services.getActionJournalFilePath(app.getPath("userData"));
}

async function getRulesCatalogForAnalysis(
  app: AppLike,
  services: IpcHandlerServices
): Promise<NamingSuggestionRulesCatalog> {
  const status = await services.loadMergedNamingRulesCatalog(app.getPath("userData"));
  if (status.ok) {
    return status.value.mergedCatalog;
  }

  return globalThis.DocSorterNamingSuggestionRulesCatalog.getDefaultNamingSuggestionRulesCatalog();
}

async function getKnownTargetFoldersForAi(
  state: MainProcessAppState,
  services: IpcHandlerServices
): Promise<string[]> {
  const folders = new Set<string>();
  if (state.selectedTargetFolder) {
    folders.add(state.selectedTargetFolder);
  }

  const listedFolders = await services.listTargetSubdirectories(state.selectedTargetPath);
  if (listedFolders.ok) {
    listedFolders.value.folders.forEach((folder) => folders.add(folder));
  }

  return Array.from(folders).sort((left, right) =>
    left.localeCompare(right, "fr", { sensitivity: "base" })
  );
}

function readAiDocumentTextContext(value: unknown): AiDocumentTextContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AiDocumentTextContext>;
  if (
    (candidate.source !== "pdf-native" && candidate.source !== "tesseract-cli") ||
    typeof candidate.excerpt !== "string"
  ) {
    return null;
  }

  return {
    source: candidate.source,
    excerpt: candidate.excerpt
  };
}

async function selectDirectory(
  dialog: DialogLike,
  title: string
): Promise<Result<DirectorySelection | null>> {
  try {
    const result = await dialog.showOpenDialog({
      title,
      properties: ["openDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, value: null };
    }

    return { ok: true, value: { path: result.filePaths[0] } };
  } catch {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Impossible d'ouvrir le sélecteur de dossier."
      }
    };
  }
}

async function selectTesseractExecutable(
  dialog: DialogLike
): Promise<OcrResult<OcrPathSelection | null>> {
  return selectOcrPath(dialog, {
    title: "Choisir tesseract.exe",
    properties: ["openFile"],
    filters: [
      {
        name: "Tesseract",
        extensions: ["exe"]
      }
    ],
    errorMessage: "Impossible d'ouvrir le sélecteur de tesseract.exe."
  });
}

async function selectTessdataDirectory(
  dialog: DialogLike
): Promise<OcrResult<OcrPathSelection | null>> {
  return selectOcrPath(dialog, {
    title: "Choisir le dossier tessdata",
    properties: ["openDirectory"],
    errorMessage: "Impossible d'ouvrir le sélecteur de dossier tessdata."
  });
}

async function selectOcrPath(
  dialog: DialogLike,
  options: {
    title: string;
    properties: Array<"openDirectory" | "openFile">;
    filters?: Array<{ name: string; extensions: string[] }>;
    errorMessage: string;
  }
): Promise<OcrResult<OcrPathSelection | null>> {
  try {
    const result = await dialog.showOpenDialog({
      title: options.title,
      properties: options.properties,
      ...(options.filters ? { filters: options.filters } : {})
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, value: null };
    }

    return { ok: true, value: { path: result.filePaths[0] } };
  } catch {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: options.errorMessage
      }
    };
  }
}
