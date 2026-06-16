import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { PrepareClassificationPlanResult } from "../classification/classificationPlan";
import type { Result } from "../documents/documentDiscovery";
import type { ExactDuplicateAnalysisResult } from "../duplicates/exactDuplicates";
import type { PdfTextExtractionResult } from "../extraction/pdfTextExtraction";
import type {
  ExecuteClassificationResult,
  UndoClassificationResult
} from "../file-ops/classifyFile";
import type { ActionJournalReadResult } from "../history/actionJournal";
import type { ActionJournalEntry, UndoableClassificationAction } from "../history/historyTypes";
import { IPC_CHANNELS, type IpcChannel } from "../ipc/ipcChannels";
import type { DestinationAvailabilityResult } from "../naming/destinationNameAvailability";
import type {
  TargetFolderCreation,
  TargetFolderList,
  TargetFolderResult
} from "../naming/targetFolder";
import type { NamingDraft, ProposedFilename } from "../naming/namingDraft";
import type { PreviewDataResult } from "../preview/previewTypes";
import type {
  NamingRulesStatus,
  UserRulesLoadResult,
  UserRulesResult
} from "../rules/userNamingRulesStore";
import {
  createMainProcessAppState,
  registerIpcHandlers,
  SENSITIVE_IPC_HANDLERS,
  type AppLike,
  type DialogLike,
  type IpcHandlerListener,
  type IpcHandlerServices,
  type MainProcessAppState
} from "./ipcHandlers";

const SOURCE_PATH = "C:\\source";
const TARGET_PATH = "C:\\target";
const TARGET_FOLDER = "Vehicules/Renault-Captur";
const USER_DATA_PATH = "C:\\user-data";
const JOURNAL_PATH = path.join(USER_DATA_PATH, "history", "actions.jsonl");
const DOCUMENT_PATH = path.join(SOURCE_PATH, "document.pdf");
const CLASSIFIED_PATH = path.join(TARGET_PATH, "Vehicules", "Renault-Captur", "document-classe.pdf");

const DOCUMENT_ITEM = {
  name: "document.pdf",
  filePath: DOCUMENT_PATH,
  extension: ".pdf" as const,
  sizeBytes: 42,
  sizeLabel: "42 B",
  modifiedAt: "2026-06-16T00:00:00.000Z",
  status: "pending" as const
};

const UNDOABLE_ACTION: UndoableClassificationAction = {
  id: "action-1",
  completedAt: "2026-06-16T10:00:00.000Z",
  originalPath: DOCUMENT_PATH,
  classifiedPath: CLASSIFIED_PATH,
  originalName: "document.pdf",
  classifiedName: "document-classe.pdf",
  sourceHashSha256: "hash"
};

describe("sensitive IPC handler contract", () => {
  it("documents which handlers may receive a renderer document path", () => {
    expect(
      SENSITIVE_IPC_HANDLERS.filter((handler) => handler.acceptsRendererPath).map(
        (handler) => handler.channel
      )
    ).toEqual([
      IPC_CHANNELS.previewGetData,
      IPC_CHANNELS.extractionExtractPdfText,
      IPC_CHANNELS.classificationPreparePlan,
      IPC_CHANNELS.classificationExecute
    ]);

    expect(contractFor(IPC_CHANNELS.namingCheckDestinationAvailability)).toMatchObject({
      acceptsRendererPath: false,
      usesMainTarget: true
    });
    expect(contractFor(IPC_CHANNELS.targetSetFolder)).toMatchObject({
      acceptsRendererPath: false,
      usesMainTarget: true
    });
    expect(contractFor(IPC_CHANNELS.targetCreateFolder)).toMatchObject({
      acceptsRendererPath: false,
      usesMainTarget: true
    });
    expect(contractFor(IPC_CHANNELS.extractionExtractPdfText)).toMatchObject({
      acceptsRendererPath: true,
      usesMainSource: true,
      usesUserDataPath: true
    });
    expect(contractFor(IPC_CHANNELS.classificationExecute)).toMatchObject({
      acceptsRendererPath: true,
      usesMainTarget: true,
      usesUserDataPath: true
    });
    expect(contractFor(IPC_CHANNELS.classificationGetLastUndoableAction)).toMatchObject({
      acceptsRendererPath: false,
      usesUserDataPath: true
    });
    expect(contractFor(IPC_CHANNELS.rulesSaveUserCatalog)).toMatchObject({
      acceptsRendererPath: false,
      usesUserDataPath: true
    });
  });
});

describe("registerIpcHandlers", () => {
  it("stores selected source and target in main state without accepting renderer paths", async () => {
    const appState = createState({
      queuedDocumentPaths: new Set([path.resolve(DOCUMENT_PATH)]),
      queuedDocuments: [{ filePath: DOCUMENT_PATH, name: "document.pdf" }]
    });
    const harness = createHarness({
      appState,
      dialogResponses: [
        { canceled: false, filePaths: [SOURCE_PATH] },
        { canceled: false, filePaths: [TARGET_PATH] }
      ]
    });

    await harness.invoke(IPC_CHANNELS.directorySelectSource, "C:\\renderer-source");
    await harness.invoke(IPC_CHANNELS.directorySelectTarget, "C:\\renderer-target");

    expect(appState.selectedSourcePath).toBe(SOURCE_PATH);
    expect(appState.selectedTargetPath).toBe(TARGET_PATH);
    expect(appState.selectedTargetFolder).toBe("");
    expect(appState.queuedDocumentPaths.size).toBe(0);
    expect(appState.queuedDocuments).toEqual([]);
    expect(harness.dialogCalls.map((call) => call.title)).toEqual([
      "Choisir le dossier source",
      "Choisir le dossier cible"
    ]);
  });

  it("refreshes only the source path stored in main state", async () => {
    const appState = createState({ selectedSourcePath: SOURCE_PATH });
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(IPC_CHANNELS.documentsRefreshSource, "C:\\renderer-source");

    expect(services.discoverDocuments).toHaveBeenCalledWith(SOURCE_PATH);
    expect(appState.queuedDocumentPaths.has(path.resolve(DOCUMENT_PATH))).toBe(true);
    expect(appState.queuedDocuments).toEqual([{ filePath: DOCUMENT_PATH, name: "document.pdf" }]);
  });

  it("passes preview access context from main state to the preview service", async () => {
    const appState = createStateWithQueue();
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(IPC_CHANNELS.previewGetData, DOCUMENT_PATH, "C:\\renderer-source");

    expect(services.getPreviewData).toHaveBeenCalledTimes(1);
    const [documentPath, context] = vi.mocked(services.getPreviewData).mock.calls[0];
    expect(documentPath).toBe(DOCUMENT_PATH);
    expect(context.sourcePath).toBe(SOURCE_PATH);
    expect(context.queuedDocumentPaths).toBe(appState.queuedDocumentPaths);
  });

  it("passes extraction only the active document and main-state queue", async () => {
    const appState = createStateWithQueue();
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(IPC_CHANNELS.extractionExtractPdfText, DOCUMENT_PATH, "C:\\other.pdf");

    expect(services.loadMergedNamingRulesCatalog).toHaveBeenCalledWith(USER_DATA_PATH);
    expect(services.extractTextFromPdfDocument).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      queuedDocumentPaths: appState.queuedDocumentPaths,
      userDataPath: USER_DATA_PATH,
      rulesCatalog: createEmptyCatalog()
    });
  });

  it("checks destination availability with the target stored in main state", async () => {
    const appState = createState({ selectedTargetPath: TARGET_PATH, selectedTargetFolder: TARGET_FOLDER });
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(
      IPC_CHANNELS.namingCheckDestinationAvailability,
      "document-classe.pdf",
      "C:\\renderer-target"
    );

    expect(services.checkDestinationNameAvailability).toHaveBeenCalledWith(
      TARGET_PATH,
      "document-classe.pdf",
      TARGET_FOLDER
    );
  });

  it("lists, stores and creates only relative target folders under main-state target root", async () => {
    const appState = createState({ selectedTargetPath: TARGET_PATH });
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(IPC_CHANNELS.targetListFolders, "C:\\renderer-target");
    const setResult = await harness.invoke(IPC_CHANNELS.targetSetFolder, TARGET_FOLDER);
    await harness.invoke(IPC_CHANNELS.targetCreateFolder, TARGET_FOLDER);

    expect(services.listTargetSubdirectories).toHaveBeenCalledWith(TARGET_PATH);
    expect(services.normalizeTargetFolderRelative).toHaveBeenCalledWith(TARGET_FOLDER);
    expect(services.createTargetSubdirectory).toHaveBeenCalledWith(TARGET_PATH, TARGET_FOLDER);
    expect(setResult).toEqual({ ok: true, value: TARGET_FOLDER });
    expect(appState.selectedTargetFolder).toBe(TARGET_FOLDER);
  });

  it("prepares and executes classification with main-state target, queue and journal path", async () => {
    const appState = createStateWithQueue({ selectedTargetFolder: TARGET_FOLDER });
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(
      IPC_CHANNELS.classificationPreparePlan,
      DOCUMENT_PATH,
      "document-classe.pdf",
      CLASSIFIED_PATH
    );
    await harness.invoke(
      IPC_CHANNELS.classificationExecute,
      DOCUMENT_PATH,
      "document-classe.pdf",
      CLASSIFIED_PATH
    );

    expect(services.prepareClassificationPlan).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      proposedFilename: "document-classe.pdf",
      selectedTargetPath: TARGET_PATH,
      targetFolder: TARGET_FOLDER,
      queuedDocumentPaths: appState.queuedDocumentPaths
    });
    expect(services.executeClassification).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      proposedFilename: "document-classe.pdf",
      selectedTargetPath: TARGET_PATH,
      targetFolder: TARGET_FOLDER,
      queuedDocumentPaths: appState.queuedDocumentPaths,
      journalFilePath: JOURNAL_PATH
    });
    expect(appState.lastUndoableAction).toEqual(UNDOABLE_ACTION);
    expect(appState.queuedDocumentPaths.has(path.resolve(DOCUMENT_PATH))).toBe(false);
  });

  it("undoes only the last main-state action and restores the queue from the service result", async () => {
    const appState = createState({
      lastUndoableAction: UNDOABLE_ACTION
    });
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(IPC_CHANNELS.classificationUndoLast, CLASSIFIED_PATH);

    expect(services.undoLastClassification).toHaveBeenCalledWith({
      undoableAction: UNDOABLE_ACTION,
      journalFilePath: JOURNAL_PATH
    });
    expect(appState.lastUndoableAction).toBeNull();
    expect(appState.queuedDocumentPaths.has(path.resolve(DOCUMENT_PATH))).toBe(true);
    expect(appState.queuedDocuments).toEqual([{ filePath: DOCUMENT_PATH, name: "document.pdf" }]);
  });

  it("loads the last undoable action only from the controlled journal path", async () => {
    const appState = createState();
    const services = createServices();
    const harness = createHarness({ appState, services });

    const result = await harness.invoke(
      IPC_CHANNELS.classificationGetLastUndoableAction,
      CLASSIFIED_PATH
    );

    expect(services.readLastUndoableClassification).toHaveBeenCalledWith(JOURNAL_PATH);
    expect(result).toEqual(UNDOABLE_ACTION);
    expect(appState.lastUndoableAction).toEqual(UNDOABLE_ACTION);
  });

  it("analyzes duplicates and reads history using only main-state queue and journal path", async () => {
    const appState = createStateWithQueue();
    const services = createServices();
    const harness = createHarness({ appState, services });

    await harness.invoke(IPC_CHANNELS.duplicatesAnalyzeExact, "C:\\renderer-source");
    await harness.invoke(IPC_CHANNELS.historyGetRecent, "C:\\renderer-journal");

    expect(services.analyzeExactDuplicates).toHaveBeenCalledWith({
      sourceDocuments: appState.queuedDocuments,
      journalFilePath: JOURNAL_PATH
    });
    expect(services.readRecentActions).toHaveBeenCalledWith(JOURNAL_PATH, 8);
  });

  it("loads and saves user rules under app userData, never from a renderer path", async () => {
    const services = createServices();
    const harness = createHarness({ services });
    const catalog = createEmptyCatalog();

    await harness.invoke(IPC_CHANNELS.rulesGetStatus, "C:\\renderer-rules.json");
    await harness.invoke(IPC_CHANNELS.rulesGetUserCatalog, "C:\\renderer-rules.json");
    await harness.invoke(IPC_CHANNELS.rulesSaveUserCatalog, catalog, "C:\\renderer-rules.json");
    await harness.invoke(IPC_CHANNELS.rulesReload, "C:\\renderer-rules.json");

    expect(services.loadMergedNamingRulesCatalog).toHaveBeenCalledWith(USER_DATA_PATH);
    expect(services.loadUserRulesCatalog).toHaveBeenCalledWith(USER_DATA_PATH);
    expect(services.saveUserRulesCatalog).toHaveBeenCalledWith(USER_DATA_PATH, catalog);
    expect(harness.appPathCalls).toEqual(["userData", "userData", "userData", "userData", "userData"]);
  });
});

function contractFor(channel: IpcChannel) {
  const contract = SENSITIVE_IPC_HANDLERS.find((handler) => handler.channel === channel);
  if (!contract) {
    throw new Error(`Missing sensitive IPC contract for ${channel}`);
  }

  return contract;
}

function createHarness(options: {
  appState?: MainProcessAppState;
  services?: IpcHandlerServices;
  dialogResponses?: Array<{ canceled: boolean; filePaths: string[] }>;
} = {}) {
  const handlers = new Map<IpcChannel, IpcHandlerListener>();
  const dialogCalls: Array<{ title: string; properties: ["openDirectory"] }> = [];
  const appPathCalls: string[] = [];
  const dialogResponses = [...(options.dialogResponses ?? [])];
  const app: AppLike = {
    getVersion: () => "0.1.0",
    getPath: (name) => {
      appPathCalls.push(name);
      return USER_DATA_PATH;
    }
  };
  const dialog: DialogLike = {
    showOpenDialog: async (dialogOptions) => {
      dialogCalls.push(dialogOptions);
      return dialogResponses.shift() ?? { canceled: true, filePaths: [] };
    }
  };
  const services = options.services ?? createServices();

  registerIpcHandlers({
    app,
    dialog,
    ipcMain: {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      }
    },
    appState: options.appState ?? createMainProcessAppState(),
    services
  });

  return {
    appPathCalls,
    dialogCalls,
    services,
    invoke: async (channel: IpcChannel, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler registered for ${channel}`);
      }

      return handler({}, ...args);
    }
  };
}

function createState(overrides: Partial<MainProcessAppState> = {}): MainProcessAppState {
  return {
    ...createMainProcessAppState(),
    ...overrides
  };
}

function createStateWithQueue(overrides: Partial<MainProcessAppState> = {}): MainProcessAppState {
  return createState({
    selectedSourcePath: SOURCE_PATH,
    selectedTargetPath: TARGET_PATH,
    queuedDocumentPaths: new Set([path.resolve(DOCUMENT_PATH)]),
    queuedDocuments: [{ filePath: DOCUMENT_PATH, name: "document.pdf" }],
    ...overrides
  });
}

function createServices(overrides: Partial<IpcHandlerServices> = {}): IpcHandlerServices {
  return {
    discoverDocuments: vi.fn(async () => ({
      ok: true,
      value: {
        sourcePath: SOURCE_PATH,
        documents: [DOCUMENT_ITEM]
      }
    })),
    createInitialNamingDraft: vi.fn(() => ({
      documentDate: "",
      subject: "",
      documentType: "",
      keywords: ""
    })),
    isNamingDraft: vi.fn((value: unknown): value is NamingDraft => {
      return Boolean(value && typeof value === "object");
    }),
    buildProposedFilename: vi.fn(() => ({
      proposedFilename: "document.pdf",
      isValid: true,
      messages: [],
      normalizedDraft: {
        documentDate: "2026-06-16",
        subject: "document",
        documentType: "",
        keywords: ""
      }
    })),
    checkDestinationNameAvailability: vi.fn(async () => ({
      ok: true,
      value: {
        status: "available",
        targetRootPath: TARGET_PATH,
        targetFolder: TARGET_FOLDER,
        targetPath: TARGET_PATH,
        proposedFilename: "document-classe.pdf",
        finalFilename: "document-classe.pdf",
        finalPath: CLASSIFIED_PATH,
        alternativeFilename: null,
        message: "Nom disponible dans la cible."
      }
    })),
    normalizeTargetFolderRelative: vi.fn((targetFolder: string): TargetFolderResult<string> => ({
      ok: true,
      value: targetFolder
    })),
    listTargetSubdirectories: vi.fn(async () => ({
      ok: true,
      value: {
        targetRootPath: TARGET_PATH,
        folders: [TARGET_FOLDER]
      }
    } as TargetFolderResult<TargetFolderList>)),
    createTargetSubdirectory: vi.fn(async (_targetPath, targetFolder) => ({
      ok: true,
      value: {
        targetRootPath: TARGET_PATH,
        targetFolder,
        targetPath: path.join(TARGET_PATH, ...targetFolder.split("/")),
        exists: true,
        created: true,
        message: "Dossier cible créé."
      }
    } as TargetFolderResult<TargetFolderCreation>)),
    prepareClassificationPlan: vi.fn(async () => ({
      ok: true,
      value: {}
    } as unknown as PrepareClassificationPlanResult)),
    executeClassification: vi.fn(async () => ({
      ok: true,
      value: {
        status: "completed",
        plan: {},
        undoableAction: UNDOABLE_ACTION,
        message: "Document classé"
      }
    } as unknown as ExecuteClassificationResult)),
    undoLastClassification: vi.fn(async () => ({
      ok: true,
      value: {
        status: "completed",
        originalActionId: UNDOABLE_ACTION.id,
        restoredPath: DOCUMENT_PATH,
        classifiedPath: CLASSIFIED_PATH,
        message: "Dernière action annulée"
      }
    } as unknown as UndoClassificationResult)),
    getActionJournalFilePath: vi.fn(() => JOURNAL_PATH),
    readLastUndoableClassification: vi.fn(async () => ({
      ok: true,
      value: UNDOABLE_ACTION,
      ignoredInvalidLines: 0
    } as ActionJournalReadResult<UndoableClassificationAction | null>)),
    readRecentActions: vi.fn(async () => ({
      ok: true,
      value: [],
      ignoredInvalidLines: 0
    } as ActionJournalReadResult<ActionJournalEntry[]>)),
    analyzeExactDuplicates: vi.fn(async () => ({
      ok: true,
      value: {
        analyzedAt: "2026-06-16T10:00:00.000Z",
        sourceFileCount: 1,
        hashedSourceFileCount: 1,
        matches: [],
        fileErrors: [],
        ignoredHistoryCount: 0
      }
    } as ExactDuplicateAnalysisResult)),
    extractTextFromPdfDocument: vi.fn(async () => ({
      ok: true,
      value: {
        status: "text-found",
        pageCount: 1,
        pagesAnalyzed: 1,
        characterCount: 4,
        excerpt: "test",
        excerptCharacterCount: 4,
        truncated: false,
        extractedAt: "2026-06-16T10:00:00.000Z"
      }
    } as PdfTextExtractionResult)),
    getPreviewData: vi.fn(async () => ({
      ok: true,
      value: {
        kind: "pdf",
        filePath: DOCUMENT_PATH,
        extension: ".pdf",
        mimeType: "application/pdf",
        bytes: new ArrayBuffer(0)
      }
    } as PreviewDataResult)),
    loadMergedNamingRulesCatalog: vi.fn(async () => ({
      ok: true,
      value: createRulesStatus()
    } as UserRulesResult<NamingRulesStatus>)),
    loadUserRulesCatalog: vi.fn(async () => ({
      ok: true,
      value: {
        catalog: createEmptyCatalog(),
        userRulesPath: path.join(USER_DATA_PATH, "config", "naming-suggestion-rules.json"),
        created: false
      }
    } as UserRulesResult<UserRulesLoadResult>)),
    saveUserRulesCatalog: vi.fn(async () => ({
      ok: true,
      value: undefined
    } as UserRulesResult<void>)),
    ...overrides
  };
}

function createRulesStatus(): NamingRulesStatus {
  const catalog = createEmptyCatalog();
  return {
    status: "loaded",
    message: "Règles utilisateur chargées.",
    userRulesPath: path.join(USER_DATA_PATH, "config", "naming-suggestion-rules.json"),
    userCatalog: catalog,
    mergedCatalog: catalog,
    defaultRuleCount: 0,
    userRuleCount: 0,
    warning: null
  };
}

function createEmptyCatalog(): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: []
  };
}
