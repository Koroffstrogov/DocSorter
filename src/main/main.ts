import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { prepareClassificationPlan } from "../classification/classificationPlan";
import { discoverDocuments, type Result } from "../documents/documentDiscovery";
import { analyzeExactDuplicates, type DuplicateSourceDocument } from "../duplicates/exactDuplicates";
import { executeClassification, undoLastClassification } from "../file-ops/classifyFile";
import {
  getActionJournalFilePath,
  readLastUndoableClassification,
  readRecentActions
} from "../history/actionJournal";
import type { UndoableClassificationAction } from "../history/historyTypes";
import {
  buildProposedFilename,
  createInitialNamingDraft,
  isNamingDraft
} from "../naming/namingDraft";
import { checkDestinationNameAvailability } from "../naming/destinationNameAvailability";
import { getPreviewData } from "../preview/previewService";

interface DirectorySelection {
  path: string;
}

let selectedSourcePath: string | null = null;
let selectedTargetPath: string | null = null;
let queuedDocumentPaths = new Set<string>();
let queuedDocuments: DuplicateSourceDocument[] = [];
let lastUndoableAction: UndoableClassificationAction | null = null;

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
  ipcMain.handle("app:getVersion", () => app.getVersion());

  ipcMain.handle("directory:selectSource", () => selectSourceDirectory());
  ipcMain.handle("directory:selectTarget", () => selectTargetDirectory());
  ipcMain.handle("documents:refreshSource", () => refreshSelectedSourceDocuments());
  ipcMain.handle("naming:createInitialDraft", (_event, originalName: unknown) => {
    if (typeof originalName !== "string") {
      return createInitialNamingDraft("");
    }

    return createInitialNamingDraft(originalName);
  });
  ipcMain.handle("naming:buildProposal", (_event, draft: unknown, originalExtension: unknown) => {
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
  ipcMain.handle("naming:checkDestinationAvailability", (_event, proposedFilename: unknown) =>
    checkDestinationNameAvailability(
      selectedTargetPath,
      typeof proposedFilename === "string" ? proposedFilename : ""
    )
  );
  ipcMain.handle(
    "classification:preparePlan",
    (_event, documentPath: unknown, proposedFilename: unknown) =>
      prepareClassificationPlan({
        documentPath: typeof documentPath === "string" ? documentPath : "",
        proposedFilename: typeof proposedFilename === "string" ? proposedFilename : "",
        selectedTargetPath,
        queuedDocumentPaths
      })
  );
  ipcMain.handle(
    "classification:execute",
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
        queuedDocumentPaths.delete(path.resolve(result.value.undoableAction.originalPath));
        queuedDocuments = queuedDocuments.filter(
          (documentItem) =>
            path.resolve(documentItem.filePath) !== path.resolve(result.value.undoableAction.originalPath)
        );
      }

      return result;
    }
  );
  ipcMain.handle("classification:undoLast", async () => {
    const result = await undoLastClassification({
      undoableAction: lastUndoableAction,
      journalFilePath: getActionJournalFilePath(app.getPath("userData"))
    });

    if (result.ok) {
      queuedDocumentPaths.add(path.resolve(result.value.restoredPath));
      queuedDocuments.push({
        filePath: result.value.restoredPath,
        name: path.basename(result.value.restoredPath)
      });
      lastUndoableAction = null;
    }

    return result;
  });
  ipcMain.handle("classification:getLastUndoableAction", () => getLastUndoableAction());
  ipcMain.handle("duplicates:analyzeExact", () => analyzeQueuedExactDuplicates());
  ipcMain.handle("history:getRecent", (_event, limit: unknown) =>
    readRecentActions(
      getJournalFilePath(),
      typeof limit === "number" && Number.isFinite(limit) ? limit : 8
    )
  );

  ipcMain.handle("preview:getData", (_event, documentPath: unknown) => {
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
    return lastUndoableAction;
  }

  const journalAction = await readLastUndoableClassification(getJournalFilePath());
  if (!journalAction.ok) {
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
