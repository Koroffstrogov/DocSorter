import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { discoverDocuments, type Result } from "../documents/documentDiscovery";
import {
  buildProposedFilename,
  createInitialNamingDraft,
  isNamingDraft
} from "../naming/namingDraft";
import { getPreviewData } from "../preview/previewService";

interface DirectorySelection {
  path: string;
}

let selectedSourcePath: string | null = null;
let selectedTargetPath: string | null = null;
let queuedDocumentPaths = new Set<string>();

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
  } else {
    queuedDocumentPaths = new Set();
  }

  return result;
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
