import { contextBridge, ipcRenderer } from "electron";

import type { DocumentDiscoveryResult, Result } from "../documents/documentDiscovery";

interface DirectorySelection {
  path: string;
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  selectSourceDirectory: (): Promise<Result<DirectorySelection | null>> =>
    ipcRenderer.invoke("directory:selectSource"),
  selectTargetDirectory: (): Promise<Result<DirectorySelection | null>> =>
    ipcRenderer.invoke("directory:selectTarget"),
  listDocuments: (sourcePath: string): Promise<Result<DocumentDiscoveryResult>> =>
    ipcRenderer.invoke("documents:list", sourcePath)
};

contextBridge.exposeInMainWorld("docSorter", api);

export type DocSorterApi = typeof api;
