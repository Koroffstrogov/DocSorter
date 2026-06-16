import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { prepareClassificationPlan } from "../classification/classificationPlan";
import { discoverDocuments, type Result } from "../documents/documentDiscovery";
import { analyzeExactDuplicates, type DuplicateSourceDocument } from "../duplicates/exactDuplicates";
import { extractTextFromPdfDocument } from "../extraction/pdfTextExtraction";
import { executeClassification, undoLastClassification } from "../file-ops/classifyFile";
import {
  getActionJournalFilePath,
  readLastUndoableClassification,
  readRecentActions
} from "../history/actionJournal";
import type { UndoableClassificationAction } from "../history/historyTypes";
import { IPC_CHANNELS } from "../ipc/ipcChannels";
import {
  buildProposedFilename,
  createInitialNamingDraft,
  isNamingDraft
} from "../naming/namingDraft";
import { checkDestinationNameAvailability } from "../naming/destinationNameAvailability";
import { getPreviewData } from "../preview/previewService";
import {
  loadMergedNamingRulesCatalog,
  loadUserRulesCatalog,
  saveUserRulesCatalog
} from "../rules/userNamingRulesStore";

interface DirectorySelection {
  path: string;
}

let selectedSourcePath: string | null = null;
let selectedTargetPath: string | null = null;
let queuedDocumentPaths = new Set<string>();
let queuedDocuments: DuplicateSourceDocument[] = [];
let lastUndoableAction: UndoableClassificationAction | null = null;
const physicallyUndoneActionIds = new Set<string>();

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: "DocSorter Local",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload", "preload.js")
    }
  });

  void mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appGetVersion, () => app.getVersion());

  ipcMain.handle(IPC_CHANNELS.directorySelectSource, () => selectSourceDirectory());
  ipcMain.handle(IPC_CHANNELS.directorySelectTarget, () => selectTargetDirectory());
  ipcMain.handle(IPC_CHANNELS.documentsRefreshSource, () => refreshSelectedSourceDocuments());
  ipcMain.handle(IPC_CHANNELS.namingCreateInitialDraft, (_event, originalName: unknown) => {
    if (typeof originalName !== "string") {
      return createInitialNamingDraft("");
    }

    return createInitialNamingDraft(originalName);
  });
  ipcMain.handle(IPC_CHANNELS.namingBuildProposal, (_event, draft: unknown, originalExtension: unknown) => {
    if (!isNamingDraft(draft) || typeof originalExtension !== "string") {
      return buildProposedFilename(
        {
          documentDate: "",
          subject: "",
          documentType: "",
          keywords: ""
        },
        ""
      );
    }

    return buildProposedFilename(draft, originalExtension);
  });
  ipcMain.handle(IPC_CHANNELS.namingCheckDestinationAvailability, (_event, proposedFilename: unknown) =>
    checkDestinationNameAvailability(
      selectedTargetPath,
      typeof proposedFilename === "string" ? proposedFilename : ""
    )
  );
  ipcMain.handle(
    IPC_CHANNELS.classificationPreparePlan,
    (_event, documentPath: unknown, proposedFilename: unknown) =>
      prepareClassificationPlan({
        documentPath: typeof documentPath === "string" ? documentPath : "",
        proposedFilename: typeof proposedFilename === "string" ? proposedFilename : "",
        selectedTargetPath,
        queuedDocumentPaths
      })
  );
  ipcMain.handle(
    IPC_CHANNELS.classificationExecute,
    async (_event, documentPath: unknown, proposedFilename: unknown) => {
      const result = await executeClassification({
        documentPath: typeof documentPath === "string" ? documentPath : "",
        proposedFilename: typeof proposedFilename === "string" ? proposedFilename : "",
        selectedTargetPath,
        queuedDocumentPaths,
        journalFilePath: getActionJournalFilePath(app.getPath("userData"))
      });

      if (result.ok) {
        lastUndoableAction = result.value.undoableAction;
        physicallyUndoneActionIds.delete(result.value.undoableAction.id);
        queuedDocumentPaths.delete(path.resolve(result.value.undoableAction.originalPath));
        queuedDocuments = queuedDocuments.filter(
          (documentItem) =>
            path.resolve(documentItem.filePath) !== path.resolve(result.value.undoableAction.originalPath)
        );
      }

      return result;
    }
  );
  ipcMain.handle(IPC_CHANNELS.classificationUndoLast, async () => {
    const result = await undoLastClassification({
      undoableAction: lastUndoableAction,
      journalFilePath: getActionJournalFilePath(app.getPath("userData"))
    });

    if (result.ok) {
      physicallyUndoneActionIds.add(result.value.originalActionId);
      queuedDocumentPaths.add(path.resolve(result.value.restoredPath));
      queuedDocuments.push({
        filePath: result.value.restoredPath,
        name: path.basename(result.value.restoredPath)
      });
      lastUndoableAction = null;
    }

    return result;
  });
  ipcMain.handle(IPC_CHANNELS.classificationGetLastUndoableAction, () => getLastUndoableAction());
  ipcMain.handle(IPC_CHANNELS.duplicatesAnalyzeExact, () => analyzeQueuedExactDuplicates());
  ipcMain.handle(IPC_CHANNELS.extractionExtractPdfText, (_event, documentPath: unknown) =>
    extractTextFromActivePdf(typeof documentPath === "string" ? documentPath : "")
  );
  ipcMain.handle(IPC_CHANNELS.historyGetRecent, (_event, limit: unknown) =>
    readRecentActions(
      getJournalFilePath(),
      typeof limit === "number" && Number.isFinite(limit) ? limit : 8
    )
  );
  ipcMain.handle(IPC_CHANNELS.rulesGetStatus, () =>
    loadMergedNamingRulesCatalog(app.getPath("userData"))
  );
  ipcMain.handle(IPC_CHANNELS.rulesGetUserCatalog, () =>
    loadUserRulesCatalog(app.getPath("userData"))
  );
  ipcMain.handle(IPC_CHANNELS.rulesReload, () =>
    loadMergedNamingRulesCatalog(app.getPath("userData"))
  );
  ipcMain.handle(IPC_CHANNELS.rulesSaveUserCatalog, async (_event, catalog: unknown) => {
    const result = await saveUserRulesCatalog(
      app.getPath("userData"),
      catalog as NamingSuggestionRulesCatalog
    );

    if (!result.ok) {
      return result;
    }

    return loadMergedNamingRulesCatalog(app.getPath("userData"));
  });

  ipcMain.handle(IPC_CHANNELS.previewGetData, (_event, documentPath: unknown) => {
    if (typeof documentPath !== "string") {
      return getPreviewData(undefined, {
        sourcePath: selectedSourcePath,
        queuedDocumentPaths
      });
    }

    return getPreviewData(documentPath, {
      sourcePath: selectedSourcePath,
      queuedDocumentPaths
    });
  });
}

async function selectSourceDirectory(): Promise<Result<DirectorySelection | null>> {
  const selection = await selectDirectory("Choisir le dossier source");
  if (selection.ok && selection.value) {
    selectedSourcePath = selection.value.path;
    queuedDocumentPaths = new Set();
    queuedDocuments = [];
  }

  return selection;
}

async function selectTargetDirectory(): Promise<Result<DirectorySelection | null>> {
  const selection = await selectDirectory("Choisir le dossier cible");
  if (selection.ok && selection.value) {
    selectedTargetPath = selection.value.path;
  }

  return selection;
}

async function refreshSelectedSourceDocuments() {
  if (!selectedSourcePath) {
    queuedDocumentPaths = new Set();
    queuedDocuments = [];
    return discoverDocuments(undefined);
  }

  return refreshSourceDocuments(selectedSourcePath);
}

async function refreshSourceDocuments(sourcePath: string) {
  const result = await discoverDocuments(sourcePath);
  if (result.ok) {
    queuedDocumentPaths = new Set(
      result.value.documents.map((documentItem) => path.resolve(documentItem.filePath))
    );
    queuedDocuments = result.value.documents.map((documentItem) => ({
      filePath: documentItem.filePath,
      name: documentItem.name
    }));
  } else {
    queuedDocumentPaths = new Set();
    queuedDocuments = [];
  }

  return result;
}

async function getLastUndoableAction(): Promise<UndoableClassificationAction | null> {
  if (lastUndoableAction) {
    if (physicallyUndoneActionIds.has(lastUndoableAction.id)) {
      lastUndoableAction = null;
      return null;
    }

    return lastUndoableAction;
  }

  const journalAction = await readLastUndoableClassification(getJournalFilePath());
  if (!journalAction.ok) {
    return null;
  }

  if (journalAction.value && physicallyUndoneActionIds.has(journalAction.value.id)) {
    return null;
  }

  lastUndoableAction = journalAction.value;
  return lastUndoableAction;
}

async function analyzeQueuedExactDuplicates() {
  if (!selectedSourcePath) {
    return {
      ok: false,
      error: {
        code: "SOURCE_NOT_SELECTED",
        message: "Aucun dossier source sélectionné."
      }
    };
  }

  return analyzeExactDuplicates({
    sourceDocuments: queuedDocuments,
    journalFilePath: getJournalFilePath()
  });
}

async function extractTextFromActivePdf(documentPath: string) {
  return extractTextFromPdfDocument({
    documentPath,
    queuedDocumentPaths
  });
}

function getJournalFilePath(): string {
  return getActionJournalFilePath(app.getPath("userData"));
}

async function selectDirectory(title: string): Promise<Result<DirectorySelection | null>> {
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

registerIpcHandlers();

void app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
