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
});

describe("registerIpcHandlers", () => {
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
      userDataPath: USER_DATA_PATH
    });
  });

  it("runs IA suggestions with queue, userData and target folders from main state", async () => {
    const harness = createHarness();

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
      competingRelativePaths: ["Vehicules"]
    });
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
        message: "Réponse IA invalide."
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
          message: "Réponse IA invalide."
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
});

function contractFor(channel: IpcChannel) {
  return SENSITIVE_IPC_HANDLERS.find((contract) => contract.channel === channel);
}

function createHarness(overrides: Partial<IpcHandlerServices> = {}): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => Promise<unknown>;
  services: IpcHandlerServices;
  state: MainProcessAppState;
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

  registerIpcHandlers({
    ipcMain,
    dialog: createDialog(),
    app: createApp(),
    appState: state,
    services
  });

  return {
    services,
    state,
    invoke: async (channel, ...args) => {
      const listener = handlers.get(channel);
      if (!listener) {
        throw new Error(`No handler registered for ${channel}`);
      }
      return listener({}, ...args) as Promise<unknown>;
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
    prepareClassificationPlan: vi.fn(async () => ({
      status: "ready",
      plan: null,
      checks: [],
      error: null
    })),
    executeClassification: vi.fn(async () => ({
      ok: true,
      value: {
        action: {
          id: "action-1",
          kind: "classification",
          createdAt: "2026-06-18T10:00:00.000Z",
          sourcePath: DOCUMENT_PATH,
          destinationPath: path.join(TARGET_PATH, "Vehicules", "document.pdf"),
          originalName: "document.pdf",
          finalName: "document.pdf",
          targetRootPath: TARGET_PATH,
          targetFolder: "Vehicules"
        },
        undoableAction: {
          id: "action-1",
          originalPath: DOCUMENT_PATH,
          classifiedPath: path.join(TARGET_PATH, "Vehicules", "document.pdf")
        },
        warning: null
      }
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
