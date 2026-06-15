import { contextBridge, ipcRenderer } from "electron";

import type { DocumentDiscoveryResult, Result } from "../documents/documentDiscovery";
import type { PreviewData } from "../preview/previewTypes";

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
    ipcRenderer.invoke("documents:list", sourcePath),
  getPreviewData: (documentPath: string): Promise<Result<PreviewData>> =>
    ipcRenderer.invoke("preview:getData", documentPath)
};

contextBridge.exposeInMainWorld("docSorter", api);

export type DocSorterApi = typeof api;
