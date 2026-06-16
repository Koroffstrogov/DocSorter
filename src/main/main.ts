import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { unloadConfiguredOllamaModel } from "../ai/ollamaModelManager";
import { registerIpcHandlers } from "./ipcHandlers";

let aiModelUnloadAttempted = false;

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

registerIpcHandlers({
  app,
  dialog,
  ipcMain
});

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

app.on("before-quit", (event) => {
  if (aiModelUnloadAttempted) {
    return;
  }

  aiModelUnloadAttempted = true;
  event.preventDefault();
  void unloadConfiguredOllamaModel(app.getPath("userData"), { timeoutMs: 2_000 })
    .catch(() => {
      console.warn("Déchargement du modèle IA local échoué.");
    })
    .finally(() => {
      app.quit();
    });
});
