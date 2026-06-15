import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { discoverDocuments, type Result } from "../documents/documentDiscovery";

interface DirectorySelection {
  path: string;
}

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

  ipcMain.handle("directory:selectSource", () => selectDirectory("Choisir le dossier source"));
  ipcMain.handle("directory:selectTarget", () => selectDirectory("Choisir le dossier cible"));

  ipcMain.handle("documents:list", (_event, sourcePath: unknown) => {
    if (typeof sourcePath !== "string") {
      return discoverDocuments(undefined);
    }

    return discoverDocuments(sourcePath);
  });
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
