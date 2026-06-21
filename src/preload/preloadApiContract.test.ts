import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ALLOWED_IPC_CHANNELS, IPC_CHANNELS, type IpcChannel } from "../ipc/ipcChannels";
import {
  ALLOWED_PRELOAD_API_METHODS,
  createPreloadApi,
  type IpcInvoker
} from "./preloadApiContract";

const FORBIDDEN_PRELOAD_METHODS = [
  "readFile",
  "writeFile",
  "exists",
  "stat",
  "readDir",
  "rename",
  "delete",
  "remove",
  "unlink",
  "rm",
  "copyFile",
  "mkdir",
  "openPath",
  "shellOpenPath"
] as const;

describe("preload API surface", () => {
  it("exposes exactly the reviewed API methods", () => {
    const api = createPreloadApi(createRecordingInvoker().invoker);

    expect(Object.keys(api)).toEqual([...ALLOWED_PRELOAD_API_METHODS]);
  });

  it("does not expose generic file-system helpers", () => {
    const api = createPreloadApi(createRecordingInvoker().invoker);
    const exposedMethods = new Set(Object.keys(api));

    for (const forbiddenMethod of FORBIDDEN_PRELOAD_METHODS) {
      expect(exposedMethods.has(forbiddenMethod)).toBe(false);
    }
  });

  it("routes each preload method to its reviewed IPC channel", async () => {
    const recorder = createRecordingInvoker();
    const api = createPreloadApi(recorder.invoker);

    await api.getVersion();
    await api.selectSourceDirectory();
    await api.listSourceDirectory("C:\\source");
    await api.selectTargetDirectory();
    await api.listTargetFolders();
    await api.setTargetFolder("Vehicules/Renault-Captur");
    await api.createTargetFolder("Vehicules/Renault-Captur");
    await api.listTargetFolderNames();
    await api.refreshSourceDocuments();
    await api.discardDocuments(["C:\\source\\document.pdf"], "trash", true);
    await api.getPreviewData("C:\\source\\document.pdf");
    await api.createInitialNamingDraft("document.pdf");
    await api.buildNamingProposal(
      {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      ".pdf"
    );
    await api.checkDestinationAvailability("document.pdf");
    await api.prepareClassificationPlan("C:\\source\\document.pdf", "document.pdf");
    await api.executeClassification("C:\\source\\document.pdf", "document.pdf");
    await api.undoLastClassification();
    await api.getLastUndoableAction();
    await api.analyzeExactDuplicates();
    await api.extractTextFromActivePdf("C:\\source\\document.pdf");
    await api.getOcrStatus();
    await api.selectTesseractExecutable();
    await api.selectTessdataDirectory();
    await api.saveOcrSettings({
      tesseractPath: "C:\\Tools\\Tesseract-OCR\\tesseract.exe",
      tessdataPath: "C:\\Tools\\Tesseract-OCR\\tessdata",
      language: "fra",
      psm: 3
    });
    await api.testOcrEngine();
    await api.runOcrForActiveImage("C:\\source\\image.png");
    await api.getPdfOcrStatus();
    await api.runOcrForActivePdf("C:\\source\\document.pdf");
    const unsubscribePdfOcrProgress = api.onPdfOcrProgress(() => undefined);
    unsubscribePdfOcrProgress();
    await api.getAiStatus();
    await api.getAiSettings();
    await api.saveAiSettings({
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      profileId: "gemma3-4b",
      model: "gemma3:4b",
      think: false,
      timeoutMs: 30_000,
      keepAlive: "30m"
    });
    await api.testAiConnection();
    await api.getAiModelStatus();
    await api.preloadAiModel();
    await api.unloadAiModel();
    await api.runAiSuggestionForActiveDocument("C:\\source\\document.pdf", {
      source: "pdf-native",
      excerpt: "texte extrait"
    });
    await api.exportAiDiagnostic(
      "C:\\source\\document.pdf",
      {
        source: "pdf-native",
        excerpt: "texte extrait"
      },
      {
        ok: false,
        error: {
          code: "AI_OUTPUT_INVALID",
          message: "Réponse IA invalide."
        }
      }
    );
    await api.getRecentHistory(8);

    expect(recorder.calls.map((call) => call.channel)).toEqual([
      IPC_CHANNELS.appGetVersion,
      IPC_CHANNELS.directorySelectSource,
      IPC_CHANNELS.sourceListDirectory,
      IPC_CHANNELS.directorySelectTarget,
      IPC_CHANNELS.targetListFolders,
      IPC_CHANNELS.targetSetFolder,
      IPC_CHANNELS.targetCreateFolder,
      IPC_CHANNELS.folderLearningListNames,
      IPC_CHANNELS.documentsRefreshSource,
      IPC_CHANNELS.documentsDiscard,
      IPC_CHANNELS.previewGetData,
      IPC_CHANNELS.namingCreateInitialDraft,
      IPC_CHANNELS.namingBuildProposal,
      IPC_CHANNELS.namingCheckDestinationAvailability,
      IPC_CHANNELS.classificationPreparePlan,
      IPC_CHANNELS.classificationExecute,
      IPC_CHANNELS.classificationUndoLast,
      IPC_CHANNELS.classificationGetLastUndoableAction,
      IPC_CHANNELS.duplicatesAnalyzeExact,
      IPC_CHANNELS.extractionExtractPdfText,
      IPC_CHANNELS.ocrGetStatus,
      IPC_CHANNELS.ocrSelectTesseractExecutable,
      IPC_CHANNELS.ocrSelectTessdataDirectory,
      IPC_CHANNELS.ocrSaveSettings,
      IPC_CHANNELS.ocrTestEngine,
      IPC_CHANNELS.ocrRunImage,
      IPC_CHANNELS.ocrGetPdfStatus,
      IPC_CHANNELS.ocrRunPdf,
      IPC_CHANNELS.ocrPdfProgress,
      IPC_CHANNELS.aiGetStatus,
      IPC_CHANNELS.aiGetSettings,
      IPC_CHANNELS.aiSaveSettings,
      IPC_CHANNELS.aiTestConnection,
      IPC_CHANNELS.aiGetModelStatus,
      IPC_CHANNELS.aiPreloadModel,
      IPC_CHANNELS.aiUnloadModel,
      IPC_CHANNELS.aiRunSuggestion,
      IPC_CHANNELS.aiExportDiagnostic,
      IPC_CHANNELS.historyGetRecent
    ]);
  });
});

describe("preload runtime", () => {
  it("keeps the sandboxed preload free of local runtime imports", async () => {
    const preloadSource = await readPreloadRuntimeSource();

    expect(preloadSource).not.toMatch(/^import\s+(?!type\b)[^\n]*from\s+["']\.\//m);
    expect(preloadSource).not.toMatch(/require\(["']\.\//);
  });

  it("keeps the runtime API methods aligned with the reviewed contract", async () => {
    const preloadSource = await readPreloadRuntimeSource();
    const apiBlock = preloadSource.match(/const api: DocSorterApi = \{([\s\S]*?)\n\};/)?.[1] ?? "";
    const runtimeMethods = [...apiBlock.matchAll(/^  ([A-Za-z]\w+):/gm)].map(
      (match) => match[1]
    );

    expect(runtimeMethods).toEqual([...ALLOWED_PRELOAD_API_METHODS]);
  });

  it("keeps runtime IPC channels aligned with the reviewed channel list", async () => {
    const preloadSource = await readPreloadRuntimeSource();
    const runtimeChannels = [
      ...preloadSource.matchAll(/ipcRenderer\.(?:invoke|on)\("([^"]+)"/g)
    ].map((match) => match[1]);

    expect(runtimeChannels).toEqual([...ALLOWED_IPC_CHANNELS]);
  });
});

function readPreloadRuntimeSource(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "preload", "preload.ts"), "utf8");
}

function createRecordingInvoker(): {
  invoker: IpcInvoker;
  calls: Array<{ channel: IpcChannel; args: unknown[] }>;
} {
  const calls: Array<{ channel: IpcChannel; args: unknown[] }> = [];

  return {
    calls,
    invoker: {
      invoke: (channel, ...args) => {
        calls.push({ channel, args });
        return Promise.resolve(null);
      },
      on: (channel) => {
        calls.push({ channel, args: [] });
        return () => undefined;
      }
    }
  };
}
