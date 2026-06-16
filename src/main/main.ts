import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";

import { registerIpcHandlers } from "./ipcHandlers";

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
