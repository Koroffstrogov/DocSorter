import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ALLOWED_IPC_CHANNELS, IPC_CHANNELS, type IpcChannel } from "../ipc/ipcChannels";
import {
  createMainProcessAppState,
  registerIpcHandlers,
  SENSITIVE_IPC_HANDLERS,
  type AppLike,
  type DialogLike,
  type IpcHandlerListener,
  type IpcHandlerServices,
  type IpcMainLike,
  type MainProcessAppState
} from "./ipcHandlers";

const USER_DATA_PATH = "C:\\Users\\Seb\\AppData\\Roaming\\docsorter-local";
const SOURCE_PATH = "C:\\source";
const TARGET_PATH = "C:\\target";
const DOCUMENT_PATH = path.join(SOURCE_PATH, "document.pdf");

describe("sensitive IPC handler contract", () => {
  it("keeps deterministic suggestion, rules and reference-data channels out of the reviewed surface", () => {
    expect(ALLOWED_IPC_CHANNELS).not.toContain("suggestion-v2:build");
    expect(ALLOWED_IPC_CHANNELS).not.toContain("suggestion-v2:diagnose");
    expect(ALLOWED_IPC_CHANNELS).not.toContain("rules:getStatus");
    expect(ALLOWED_IPC_CHANNELS).not.toContain("reference-data:getStatus");
  });

  it("documents the bounded IA diagnostic export channel", () => {
    expect(contractFor(IPC_CHANNELS.aiExportDiagnostic)).toMatchObject({
      acceptsRendererPath: true,
      usesMainSource: true,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "writeAiDiagnostic"
    });
  });

  it("documents the bounded IA model preload channel", () => {
    expect(contractFor(IPC_CHANNELS.aiPreloadModel)).toMatchObject({
      acceptsRendererPath: false,
      usesMainSource: false,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "preloadAiModel"
    });
  });

  it("documents the read-only folder learning listing channel", () => {
    expect(contractFor(IPC_CHANNELS.folderLearningListNames)).toMatchObject({
      acceptsRendererPath: false,
      usesMainSource: false,
      usesMainTarget: true,
      usesUserDataPath: true,
      serviceName: "listTargetFolderNames + getFolderLearningPreferenceForFolder"
    });
  });

  it("documents the read-only source directory browser channel", () => {
    expect(contractFor(IPC_CHANNELS.sourceListDirectory)).toMatchObject({
      acceptsRendererPath: true,
      usesMainSource: true,
      usesMainTarget: false,
      usesUserDataPath: false,
      serviceName: "listSourceDirectory"
    });
  });

  it("documents the bounded document discard channel", () => {
    expect(contractFor(IPC_CHANNELS.documentsDiscard)).toMatchObject({
      acceptsRendererPath: true,
      usesMainSource: true,
      usesMainTarget: false,
      usesUserDataPath: false,
      serviceName: "discardDocuments"
    });
  });

  it("documents the bounded OCR PDF channels", () => {
    expect(contractFor(IPC_CHANNELS.ocrGetPdfStatus)).toMatchObject({
      acceptsRendererPath: false,
      usesMainSource: false,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "getPdfOcrStatus"
    });
    expect(contractFor(IPC_CHANNELS.ocrRunPdf)).toMatchObject({
      acceptsRendererPath: true,
      usesMainSource: true,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "runPdfOcrForDocument"
    });
  });

  it("documents bounded local known-targets channels", () => {
    expect(contractFor(IPC_CHANNELS.knownTargetsList)).toMatchObject({
      acceptsRendererPath: false,
      usesMainSource: false,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "listKnownTargets"
    });
    expect(contractFor(IPC_CHANNELS.knownTargetsCreate)).toMatchObject({
      acceptsRendererPath: false,
      usesMainSource: false,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "createKnownTarget"
    });
    expect(contractFor(IPC_CHANNELS.knownTargetsDelete)).toMatchObject({
      acceptsRendererPath: false,
      usesMainSource: false,
      usesMainTarget: false,
      usesUserDataPath: true,
      serviceName: "deleteKnownTarget"
    });
  });
});

describe("registerIpcHandlers", () => {
  it("sets the source from a directory selected in the custom source picker", async () => {
    const harness = createHarness();
    const selectedDirectoryPath = path.join(SOURCE_PATH, "incoming");
    vi.mocked(harness.services.listSourceDirectory).mockResolvedValueOnce({
      ok: true,
      value: createSourceListing(selectedDirectoryPath)
    });

    const result = await harness.invoke(IPC_CHANNELS.directorySelectSource, selectedDirectoryPath);

    expect(harness.dialog.showOpenDialog).not.toHaveBeenCalled();
    expect(harness.services.listSourceDirectory).toHaveBeenCalledWith(selectedDirectoryPath);
    expect(result).toEqual({
      ok: true,
      value: {
        path: selectedDirectoryPath
      }
    });
    expect(harness.state.selectedSourcePath).toBe(selectedDirectoryPath);
    expect(harness.state.queuedDocumentPaths.size).toBe(0);
    expect(harness.state.queuedDocuments).toEqual([]);
  });

  it("keeps the native source fallback in directory mode", async () => {
    const harness = createHarness();
    vi.mocked(harness.dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [SOURCE_PATH]
    });

    await harness.invoke(IPC_CHANNELS.directorySelectSource);

    expect(harness.dialog.showOpenDialog).toHaveBeenCalledWith({
      title: "Choisir le dossier source",
      properties: ["openDirectory"]
    });
  });

  it("lists source directory contents for the custom picker", async () => {
    const harness = createHarness();

    const result = await harness.invoke(IPC_CHANNELS.sourceListDirectory, SOURCE_PATH);

    expect(result).toMatchObject({
      ok: true,
      value: {
        currentPath: SOURCE_PATH
      }
    });
    expect(harness.services.listSourceDirectory).toHaveBeenCalledWith(SOURCE_PATH);
  });

  it("keeps the target picker in directory mode", async () => {
    const harness = createHarness();
    vi.mocked(harness.dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [TARGET_PATH]
    });

    await harness.invoke(IPC_CHANNELS.directorySelectTarget);

    expect(harness.dialog.showOpenDialog).toHaveBeenCalledWith({
      title: "Choisir le dossier cible",
      properties: ["openDirectory"]
    });
    expect(harness.state.selectedTargetPath).toBe(TARGET_PATH);
  });

  it("passes extraction only the active document, main-state queue and userData", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.extractionExtractPdfText, DOCUMENT_PATH);

    expect(harness.services.extractTextFromPdfDocument).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      queuedDocumentPaths: harness.state.queuedDocumentPaths,
      userDataPath: USER_DATA_PATH
    });
  });

  it("runs image OCR without rules catalog construction", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.ocrRunImage, DOCUMENT_PATH);

    expect(harness.services.runImageOcrForDocument).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      queuedDocumentPaths: harness.state.queuedDocumentPaths,
      userDataPath: USER_DATA_PATH,
      forceRefresh: false
    });
  });

  it("passes image OCR force refresh when requested", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.ocrRunImage, DOCUMENT_PATH, { forceRefresh: true });

    expect(harness.services.runImageOcrForDocument).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      queuedDocumentPaths: harness.state.queuedDocumentPaths,
      userDataPath: USER_DATA_PATH,
      forceRefresh: true
    });
  });

  it("discards documents only through main-state queue and updates queue state", async () => {
    const harness = createHarness();

    const result = await harness.invoke(IPC_CHANNELS.documentsDiscard, {
      documentPaths: [DOCUMENT_PATH],
      mode: "trash",
      confirmed: true
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        discardedFilePaths: [path.resolve(DOCUMENT_PATH)]
      }
    });
    expect(harness.services.discardDocuments).toHaveBeenCalledWith({
      documentPaths: [DOCUMENT_PATH],
      mode: "trash",
      confirmed: true,
      queuedDocumentPaths: expect.any(Set),
      trashItem: undefined
    });
    expect(harness.state.queuedDocumentPaths.has(path.resolve(DOCUMENT_PATH))).toBe(false);
    expect(harness.state.queuedDocuments).toEqual([]);
  });

  it("reads PDF OCR readiness only from userData", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.ocrGetPdfStatus);

    expect(harness.services.getPdfOcrStatus).toHaveBeenCalledWith(USER_DATA_PATH);
  });

  it("runs PDF OCR manually with queue, userData and bounded progress events", async () => {
    const sent: Array<{ channel: IpcChannel; value: unknown }> = [];
    const harness = createHarness();

    await harness.invokeWithSender(IPC_CHANNELS.ocrRunPdf, sent, DOCUMENT_PATH);

    expect(harness.services.runPdfOcrForDocument).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      queuedDocumentPaths: harness.state.queuedDocumentPaths,
      userDataPath: USER_DATA_PATH,
      onProgress: expect.any(Function)
    });
    const options = vi.mocked(harness.services.runPdfOcrForDocument).mock.calls[0]?.[0];
    options?.onProgress?.({
      documentPath: DOCUMENT_PATH,
      page: 2,
      pageIndex: 1,
      pageCount: 3,
      message: "OCR PDF page 1/3"
    });
    expect(sent).toEqual([
      {
        channel: IPC_CHANNELS.ocrPdfProgress,
        value: {
          page: 2,
          pageIndex: 1,
          pageCount: 3,
          message: "OCR PDF page 1/3"
        }
      }
    ]);
    expect(JSON.stringify(sent)).not.toContain(DOCUMENT_PATH);
  });

  it("runs IA suggestions with queue, userData and target folders from main state", async () => {
    const harness = createHarness();
    vi.mocked(harness.services.listKnownTargets).mockResolvedValueOnce({
      ok: true,
      value: {
        targets: [
          {
            id: "paul",
            kind: "person",
            displayName: "paul",
            fileAlias: "paul",
            aliases: ["Paul Martin"],
            isActive: true,
            createdAt: "2026-06-21T08:00:00.000Z",
            updatedAt: "2026-06-21T08:00:00.000Z"
          },
          {
            id: "captur",
            kind: "vehicle",
            displayName: "captur",
            fileAlias: "captur",
            aliases: ["Renault Captur"],
            isActive: false,
            createdAt: "2026-06-21T08:00:00.000Z",
            updatedAt: "2026-06-21T08:00:00.000Z"
          }
        ],
        warnings: []
      }
    });

    await harness.invoke(IPC_CHANNELS.aiRunSuggestion, DOCUMENT_PATH, {
      source: "pdf-native",
      excerpt: "texte extrait"
    });

    expect(harness.services.runAiSuggestionForDocument).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      textContext: {
        source: "pdf-native",
        excerpt: "texte extrait"
      },
      queuedDocuments: harness.state.queuedDocuments,
      queuedDocumentPaths: harness.state.queuedDocumentPaths,
      userDataPath: USER_DATA_PATH,
      targetRootPath: TARGET_PATH,
      knownRelativeFolders: ["Scolarite", "Vehicules", "Vehicules/Captur"],
      knownTargets: [
        expect.objectContaining({
          fileAlias: "paul",
          isActive: true
        })
      ],
      selectedTargetFolder: "Vehicules",
      competingRelativePaths: ["Vehicules"]
    });
    expect(harness.services.listKnownTargets).toHaveBeenCalledWith(USER_DATA_PATH);
  });

  it("lists target folder names only from main-state target and selected folder", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.folderLearningListNames);

    expect(harness.services.listTargetFolderNames).toHaveBeenCalledWith(TARGET_PATH, "Vehicules");
    expect(harness.services.getFolderLearningPreferenceForFolder).toHaveBeenCalledWith(
      USER_DATA_PATH,
      "Vehicules"
    );
  });

  it("preloads the IA model only with userData from main state", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.aiPreloadModel);

    expect(harness.services.preloadAiModel).toHaveBeenCalledWith(USER_DATA_PATH);
  });

  it("exports IA diagnostics only for a document present in the scanned queue", async () => {
    const harness = createHarness();

    const result = await harness.invoke(IPC_CHANNELS.aiExportDiagnostic, DOCUMENT_PATH, {
      source: "pdf-native",
      excerpt: "texte extrait"
    }, {
      ok: false,
      error: {
        code: "AI_OUTPUT_INVALID",
        message: "Réponse IA invalide.",
        field: "fields.documentType.selected",
        validationErrors: [
          {
            field: "fields.documentType.selected",
            reason: "Candidat invalide."
          }
        ],
        diagnosticPipeline: [
          {
            id: "candidate-validation",
            status: "blocked",
            inputs: {},
            variables: {},
            output: "Réponse IA invalide.",
            warnings: [],
            blockingReason: "Réponse IA invalide."
          }
        ]
      }
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        diagnosticKind: "ai"
      }
    });
    expect(harness.services.writeAiDiagnostic).toHaveBeenCalledWith({
      userDataPath: USER_DATA_PATH,
      documentName: "document.pdf",
      extension: ".pdf",
      textContext: {
        source: "pdf-native",
        excerpt: "texte extrait"
      },
      aiResult: {
        ok: false,
        error: {
          code: "AI_OUTPUT_INVALID",
          message: "Réponse IA invalide.",
          field: "fields.documentType.selected",
          validationErrors: [
            {
              field: "fields.documentType.selected",
              reason: "Candidat invalide."
            }
          ],
          diagnosticPipeline: [
            {
              id: "candidate-validation",
              status: "blocked",
              inputs: {},
              variables: {},
              output: "Réponse IA invalide.",
              warnings: [],
              blockingReason: "Réponse IA invalide."
            }
          ]
        }
      }
    });
  });

  it("rejects IA diagnostic export for a document outside the scanned queue", async () => {
    const harness = createHarness();

    const result = await harness.invoke(
      IPC_CHANNELS.aiExportDiagnostic,
      path.join(SOURCE_PATH, "outside.pdf"),
      null,
      null
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DIAGNOSTIC_DOCUMENT_NOT_IN_QUEUE"
      }
    });
    expect(harness.services.writeAiDiagnostic).not.toHaveBeenCalled();
  });

  it("routes known-targets IPC to bounded userData services", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.knownTargetsList);
    await harness.invoke(IPC_CHANNELS.knownTargetsCreate, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul",
      aliases: "Paul, Paulo, P. Martin",
      ignoredPath: "C:\\secret\\document.pdf"
    });
    await harness.invoke(IPC_CHANNELS.knownTargetsUpdate, "paul", {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul-martin",
      aliases: "Paul Martin, P. Martin, PM",
      isActive: true
    });
    await harness.invoke(IPC_CHANNELS.knownTargetsDeactivate, "paul");
    await harness.invoke(IPC_CHANNELS.knownTargetsDelete, "paul");

    expect(harness.services.listKnownTargets).toHaveBeenCalledWith(USER_DATA_PATH);
    expect(harness.services.createKnownTarget).toHaveBeenCalledWith(USER_DATA_PATH, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul",
      aliases: ["Paul", "Paulo", "P. Martin"]
    });
    expect(harness.services.updateKnownTarget).toHaveBeenCalledWith(USER_DATA_PATH, "paul", {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul-martin",
      aliases: ["Paul Martin", "P. Martin", "PM"],
      isActive: true
    });
    expect(harness.services.deactivateKnownTarget).toHaveBeenCalledWith(USER_DATA_PATH, "paul");
    expect(harness.services.deleteKnownTarget).toHaveBeenCalledWith(USER_DATA_PATH, "paul");
  });

  it("keeps real classification on existing main-state target, queue and journal path", async () => {
    const harness = createHarness();

    await harness.invoke(IPC_CHANNELS.classificationExecute, DOCUMENT_PATH, "document.pdf");

    expect(harness.services.executeClassification).toHaveBeenCalledWith({
      documentPath: DOCUMENT_PATH,
      proposedFilename: "document.pdf",
      selectedTargetPath: TARGET_PATH,
      targetFolder: "Vehicules",
      queuedDocumentPaths: harness.state.queuedDocumentPaths,
      journalFilePath: path.join(USER_DATA_PATH, "classification-actions.jsonl")
    });
  });

  it("records folder-learning preference only after successful classification", async () => {
    const harness = createHarness();

    await harness.invoke(
      IPC_CHANNELS.classificationExecute,
      DOCUMENT_PATH,
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    );
    await Promise.resolve();

    expect(harness.services.recordFolderLearningPreferenceFromClassification).toHaveBeenCalledWith({
      userDataPath: USER_DATA_PATH,
      folderRelativePath: "Vehicules",
      classifiedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      confirmedAt: "2026-06-18T10:00:00.000Z"
    });
  });

  it("does not learn from IA analysis or failed classification", async () => {
    const harness = createHarness({
      executeClassification: vi.fn(async () => ({
        ok: false,
        error: {
          code: "INVALID_FILENAME",
          message: "Nom invalide."
        }
      }))
    });

    await harness.invoke(IPC_CHANNELS.aiRunSuggestion, DOCUMENT_PATH, {
      source: "pdf-native",
      excerpt: "texte extrait"
    });
    await harness.invoke(IPC_CHANNELS.classificationExecute, DOCUMENT_PATH, "bad/name.pdf");
    await Promise.resolve();

    expect(harness.services.recordFolderLearningPreferenceFromClassification).not.toHaveBeenCalled();
  });
});

function contractFor(channel: IpcChannel) {
  return SENSITIVE_IPC_HANDLERS.find((contract) => contract.channel === channel);
}

function createHarness(overrides: Partial<IpcHandlerServices> = {}): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => Promise<unknown>;
  invokeWithSender: (
    channel: IpcChannel,
    sent: Array<{ channel: IpcChannel; value: unknown }>,
    ...args: unknown[]
  ) => Promise<unknown>;
  services: IpcHandlerServices;
  state: MainProcessAppState;
  dialog: DialogLike;
} {
  const handlers = new Map<IpcChannel, IpcHandlerListener>();
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    }
  };
  const state = createMainProcessAppState();
  state.selectedSourcePath = SOURCE_PATH;
  state.selectedTargetPath = TARGET_PATH;
  state.selectedTargetFolder = "Vehicules";
  state.queuedDocumentPaths = new Set([path.resolve(DOCUMENT_PATH)]);
  state.queuedDocuments = [{ filePath: DOCUMENT_PATH, name: "document.pdf" }];

  const services = {
    ...createServices(),
    ...overrides
  };
  const dialog = createDialog();

  registerIpcHandlers({
    ipcMain,
    dialog,
    app: createApp(),
    appState: state,
    services
  });

  return {
    services,
    state,
    dialog,
    invoke: async (channel, ...args) => {
      const listener = handlers.get(channel);
      if (!listener) {
        throw new Error(`No handler registered for ${channel}`);
      }
      return listener({}, ...args) as Promise<unknown>;
    },
    invokeWithSender: async (channel, sent, ...args) => {
      const listener = handlers.get(channel);
      if (!listener) {
        throw new Error(`No handler registered for ${channel}`);
      }
      return listener({
        sender: {
          send: (eventChannel: IpcChannel, value: unknown) => {
            sent.push({ channel: eventChannel, value });
          }
        }
      }, ...args) as Promise<unknown>;
    }
  };
}

function createServices(): IpcHandlerServices {
  return {
    discoverDocuments: vi.fn(async () => ({
      ok: true,
      value: {
        sourcePath: SOURCE_PATH,
        documents: [],
        skippedEntries: [],
        scannedAt: "2026-06-18T10:00:00.000Z"
      }
    })),
    listSourceDirectory: vi.fn(async (sourcePath?: string | null) => ({
      ok: true,
      value: createSourceListing(sourcePath || SOURCE_PATH)
    })),
    discardDocuments: vi.fn(async () => ({
      ok: true,
      value: {
        mode: "trash",
        requestedCount: 1,
        discardedFilePaths: [path.resolve(DOCUMENT_PATH)],
        discardedCount: 1,
        failures: [],
        message: "1 document mis à la corbeille."
      }
    })),
    createInitialNamingDraft: vi.fn(() => ({
      documentDate: "",
      subject: "",
      documentType: "",
      keywords: ""
    })),
    isNamingDraft: vi.fn((value): value is { documentDate: string; subject: string; documentType: string; keywords: string } =>
      Boolean(value && typeof value === "object")
    ),
    buildProposedFilename: vi.fn(() => ({
      proposedFilename: "document.pdf",
      isValid: true,
      messages: [],
      normalizedDraft: {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      }
    })),
    checkDestinationNameAvailability: vi.fn(async () => ({
      ok: true,
      value: {
        status: "available",
        targetRootPath: TARGET_PATH,
        targetFolder: "Vehicules",
        targetPath: path.join(TARGET_PATH, "Vehicules"),
        proposedFilename: "document.pdf",
        finalFilename: "document.pdf",
        finalPath: path.join(TARGET_PATH, "Vehicules", "document.pdf"),
        alternativeFilename: null,
        message: "Nom disponible."
      }
    })),
    normalizeTargetFolderRelative: vi.fn(() => ({ ok: true, value: "Vehicules" })),
    listTargetSubdirectories: vi.fn(async () => ({
      ok: true,
      value: {
        targetRootPath: TARGET_PATH,
        folders: ["Scolarite", "Vehicules", "Vehicules/Captur"]
      }
    })),
    createTargetSubdirectory: vi.fn(async () => ({
      ok: true,
      value: {
        targetRootPath: TARGET_PATH,
        targetFolder: "Vehicules",
        targetPath: path.join(TARGET_PATH, "Vehicules"),
        created: false,
        message: "Dossier prêt."
      }
    })),
    listTargetFolderNames: vi.fn(async () => ({
      ok: true,
      value: {
        targetFolder: "Vehicules",
        entries: [
          {
            name: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
            isFile: true
          }
        ],
        truncated: false,
        entryLimit: 500,
        warnings: []
      }
    })),
    getFolderLearningPreferenceForFolder: vi.fn(async () => ({
      value: {
        folderRelativePath: "Vehicules",
        preferredSchema: "DATE_CIBLE_DOCUMENT",
        preferredDatePrecision: "year",
        preferredTarget: "captur",
        preferredDocumentType: "facture-entretien",
        confirmedCount: 2,
        lastConfirmedAt: "2026-06-18T10:00:00.000Z"
      },
      warnings: []
    })),
    prepareClassificationPlan: vi.fn(async () => ({
      status: "ready",
      plan: null,
      checks: [],
      error: null
    })),
    executeClassification: vi.fn(async () => ({
      ok: true,
      value: {
        status: "completed",
        plan: {
          status: "ready",
          sourcePath: DOCUMENT_PATH,
          currentName: "document.pdf",
          proposedFilename: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
          extension: ".pdf",
          targetRootPath: TARGET_PATH,
          targetFolder: "Vehicules",
          targetPath: path.join(TARGET_PATH, "Vehicules"),
          destinationPath: path.join(
            TARGET_PATH,
            "Vehicules",
            "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
          ),
          checks: []
        },
        undoableAction: {
          id: "action-1",
          completedAt: "2026-06-18T10:00:00.000Z",
          originalPath: DOCUMENT_PATH,
          classifiedPath: path.join(
            TARGET_PATH,
            "Vehicules",
            "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
          ),
          originalName: "document.pdf",
          classifiedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
          sourceHashSha256: "a".repeat(64)
        },
        message: "Document classé"
      }
    })),
    recordFolderLearningPreferenceFromClassification: vi.fn(async () => ({
      ok: true,
      value: null,
      warnings: []
    })),
    undoLastClassification: vi.fn(async () => ({
      ok: true,
      value: {
        originalActionId: "action-1",
        restoredPath: DOCUMENT_PATH,
        warning: null
      }
    })),
    getActionJournalFilePath: vi.fn((userDataPath) =>
      path.join(userDataPath, "classification-actions.jsonl")
    ),
    readLastUndoableClassification: vi.fn(async () => ({ ok: true, value: null })),
    readRecentActions: vi.fn(async () => ({ ok: true, value: [] })),
    analyzeExactDuplicates: vi.fn(async () => ({
      ok: true,
      value: {
        analyzedAt: "2026-06-18T10:00:00.000Z",
        sourceFileCount: 1,
        hashedSourceFileCount: 1,
        matches: [],
        fileErrors: [],
        ignoredHistoryCount: 0
      }
    })),
    extractTextFromPdfDocument: vi.fn(async () => ({
      ok: true,
      value: {
        status: "text-found",
        pageCount: 1,
        pagesAnalyzed: 1,
        characterCount: 12,
        excerpt: "texte extrait",
        excerptCharacterCount: 12,
        truncated: false,
        extractedAt: "2026-06-18T10:00:00.000Z"
      }
    })),
    getPreviewData: vi.fn(async () => ({
      ok: true,
      value: {
        kind: "pdf",
        filePath: DOCUMENT_PATH,
        extension: ".pdf",
        mimeType: "application/pdf",
        bytes: new ArrayBuffer(0)
      }
    })),
    getOcrStatus: vi.fn(async () => ({ ok: true, value: createOcrStatus() })),
    saveOcrSettings: vi.fn(async () => ({ ok: true, value: createOcrStatus() })),
    testOcrEngine: vi.fn(async () => ({ ok: true, value: createOcrStatus() })),
    getPdfOcrStatus: vi.fn(async () => ({
      ok: true,
      value: {
        status: "ready",
        message: "OCR PDF prêt.",
        tesseract: {
          status: "ready",
          path: "C:\\Tools\\tesseract.exe",
          message: "Tesseract disponible.",
          version: "5.4.0"
        },
        renderer: {
          status: "ready",
          path: "C:\\Tools\\pdftoppm.exe",
          message: "Rendu PDF disponible.",
          version: "24.02.0"
        },
        error: null
      }
    })),
    runImageOcrForDocument: vi.fn(async () => ({
      ok: true,
      value: {
        status: "text-found",
        source: "tesseract-cli",
        language: "fra",
        psm: 6,
        text: "texte extrait",
        excerpt: "texte extrait",
        characterCount: 12,
        excerptCharacterCount: 12,
        truncated: false,
        durationMs: 12,
        extractedAt: "2026-06-18T10:00:00.000Z",
        fromCache: false,
        warnings: []
      }
    })),
    runPdfOcrForDocument: vi.fn(async () => ({
      ok: true,
      value: {
        status: "text-found",
        source: "pdf-hybrid",
        pageCount: 2,
        pagesAnalyzed: 2,
        text: "texte extrait OCR PDF",
        characterCount: 22,
        excerpt: "texte extrait OCR PDF",
        excerptCharacterCount: 22,
        truncated: false,
        extractedAt: "2026-06-18T10:00:00.000Z",
        finalTextSource: "pdf-hybrid",
        fromCache: false
      }
    })),
    getAiStatus: vi.fn(async () => ({ ok: true, value: createAiStatus() })),
    loadAiSettings: vi.fn(async () => ({ ok: true, value: createAiStatus().settings })),
    saveAiSettings: vi.fn(async () => ({ ok: true, value: createAiStatus() })),
    testAiConnection: vi.fn(async () => ({
      ok: true,
      value: {
        status: "ok",
        message: "Connexion Ollama OK.",
        testedAt: "2026-06-18T10:00:00.000Z"
      }
    })),
    getAiModelStatus: vi.fn(async () => ({ ok: true, value: createAiModelStatus() })),
    preloadAiModel: vi.fn(async () => ({ ok: true, value: createAiModelStatus() })),
    unloadAiModel: vi.fn(async () => ({ ok: true, value: createAiModelStatus() })),
    runAiSuggestionForDocument: vi.fn(async () => ({
      ok: true,
      value: createAiSuggestion()
    })),
    writeAiDiagnostic: vi.fn(async () => ({
      ok: true,
      value: {
        mode: "diagnosticComplet",
        diagnosticKind: "ai",
        diagnosticPath: path.join(USER_DATA_PATH, "diagnostics", "diagnostic.json"),
        documentName: "document.pdf",
        message: "Diagnostic IA complet exporté."
      }
    })),
    listKnownTargets: vi.fn(async () => ({
      ok: true,
      value: {
        targets: [],
        warnings: []
      }
    })),
    createKnownTarget: vi.fn(async () => ({
      ok: true,
      value: {
        targets: [],
        warnings: []
      }
    })),
    updateKnownTarget: vi.fn(async () => ({
      ok: true,
      value: {
        targets: [],
        warnings: []
      }
    })),
    deactivateKnownTarget: vi.fn(async () => ({
      ok: true,
      value: {
        targets: [],
        warnings: []
      }
    })),
    deleteKnownTarget: vi.fn(async () => ({
      ok: true,
      value: {
        targets: [],
        warnings: []
      }
    }))
  };
}

function createApp(): AppLike {
  return {
    getVersion: () => "0.1.0",
    getPath: () => USER_DATA_PATH
  };
}

function createDialog(): DialogLike {
  return {
    showOpenDialog: vi.fn(async () => ({
      canceled: true,
      filePaths: []
    }))
  };
}

function createSourceListing(currentPath: string) {
  return {
    currentPath,
    parentPath: path.dirname(currentPath),
    rootPath: path.parse(currentPath).root,
    entries: [
      {
        name: "document.pdf",
        path: path.join(currentPath, "document.pdf"),
        kind: "file" as const,
        extension: ".pdf",
        supportedDocument: true,
        sizeLabel: "12 KB",
        modifiedAt: "2026-06-18T10:00:00.000Z"
      }
    ],
    directoryCount: 0,
    fileCount: 1,
    supportedDocumentCount: 1,
    shortcuts: [],
    drives: [],
    truncated: false,
    entryLimit: 500,
    warnings: []
  };
}

function createOcrStatus() {
  return {
    status: "configured" as const,
    settingsPath: path.join(USER_DATA_PATH, "config", "ocr-settings.json"),
    settings: {
      tesseractPath: "C:\\Tools\\tesseract.exe",
      tessdataPath: "C:\\Tools\\tessdata",
      language: "fra",
      psm: 6,
      lastTestedAt: "2026-06-18T10:00:00.000Z",
      detectedVersion: "5.3.4"
    },
    tesseractPath: "C:\\Tools\\tesseract.exe",
    tessdataPath: "C:\\Tools\\tessdata",
    language: "fra",
    psm: 6,
    detectedVersion: "5.3.4",
    lastTestedAt: "2026-06-18T10:00:00.000Z",
    availableLanguages: ["fra"],
    missingLanguages: [],
    message: "OCR local configuré.",
    error: null
  };
}

function createAiStatus() {
  return {
    settingsPath: path.join(USER_DATA_PATH, "config", "ai-settings.json"),
    settings: {
      enabled: true,
      provider: "ollama" as const,
      baseUrl: "http://localhost:11434/",
      profileId: "gemma3-4b" as const,
      model: "gemma3:4b",
      think: false,
      timeoutMs: 30000,
      keepAlive: "30m",
      lastTestAt: null,
      lastStatus: "ok" as const,
      lastError: null
    },
    status: "ok" as const,
    message: "IA locale prête.",
    error: null
  };
}

function createAiModelStatus() {
  return {
    status: "ready" as const,
    model: "gemma3:4b",
    message: "Modèle IA prêt.",
    loadedAt: "2026-06-18T10:00:00.000Z",
    keepAliveUntil: null,
    lastCheckedAt: "2026-06-18T10:00:00.000Z",
    error: null
  };
}

function createAiSuggestion() {
  return {
    status: "ready" as const,
    documentName: "document.pdf",
    extension: ".pdf",
    model: "mistral-small:latest",
    suggestedAt: "2026-06-18T10:00:00.000Z",
    textSource: "pdf-native" as const,
    modelStatus: createAiModelStatus(),
    input: {
      filename: "document.pdf",
      extension: ".pdf",
      extractedTextExcerpt: "texte extrait",
      ocrTextExcerpt: "",
      availableRootFolders: ["Fiscalite"],
      knownRelativeFolders: ["Vehicules"],
      namingConvention: "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext",
      detectedDate: "",
      detectedYear: ""
    },
    profile: {
      id: "gemma3-4b" as const,
      label: "gemma3:4b",
      model: "gemma3:4b",
      think: false
    },
    responseJson: {
      fields: {
        dateToken: { selected: "2026", candidates: [] },
        subject: { selected: "foyer", candidates: [] },
        target: { selected: "foyer", candidates: [] },
        targetKind: { selected: "household", candidates: [] },
        documentType: { selected: "avis-imposition", candidates: [] },
        issuer: { selected: "", candidates: [] },
        detail: { selected: "", candidates: [] }
      },
      folderCandidates: [],
      fileNameCandidates: [],
      warnings: [],
      confidence: 90,
      source: "ollama" as const
    },
    thinking: null,
    suggestion: {
      dateToken: "2026",
      target: "foyer",
      documentType: "avis-imposition",
      issuer: "",
      detail: "",
      proposedName: "2026_foyer_avis-imposition.pdf",
      targetFolder: "Fiscalite/Foyer/2026",
      confidence: 90,
      reasons: ["Type documentaire détecté."],
      warnings: [],
      source: "ollama" as const
    },
    promptCharacterCount: 1200,
    message: "Suggestion IA prête."
  };
}
