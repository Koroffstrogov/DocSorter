import { contextBridge, ipcRenderer } from "electron";

import type { RenameDraft, RenameDraftInput } from "../core/renameDraft";

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  previewRename: (input: RenameDraftInput): Promise<RenameDraft> =>
    ipcRenderer.invoke("rename:preview", input)
};

contextBridge.exposeInMainWorld("docSorter", api);

export type DocSorterApi = typeof api;
