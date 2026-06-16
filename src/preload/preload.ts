import { contextBridge, ipcRenderer } from "electron";

import type { DocSorterApi } from "./preloadApiContract";

const api: DocSorterApi = {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  selectSourceDirectory: () => ipcRenderer.invoke("directory:selectSource"),
  selectTargetDirectory: () => ipcRenderer.invoke("directory:selectTarget"),
  refreshSourceDocuments: () => ipcRenderer.invoke("documents:refreshSource"),
  getPreviewData: (documentPath) => ipcRenderer.invoke("preview:getData", documentPath),
  createInitialNamingDraft: (originalName) =>
    ipcRenderer.invoke("naming:createInitialDraft", originalName),
  buildNamingProposal: (draft, originalExtension) =>
    ipcRenderer.invoke("naming:buildProposal", draft, originalExtension),
  checkDestinationAvailability: (proposedFilename) =>
    ipcRenderer.invoke("naming:checkDestinationAvailability", proposedFilename),
  prepareClassificationPlan: (documentPath, proposedFilename) =>
    ipcRenderer.invoke("classification:preparePlan", documentPath, proposedFilename),
  executeClassification: (documentPath, proposedFilename) =>
    ipcRenderer.invoke("classification:execute", documentPath, proposedFilename),
  undoLastClassification: () => ipcRenderer.invoke("classification:undoLast"),
  getLastUndoableAction: () => ipcRenderer.invoke("classification:getLastUndoableAction"),
  analyzeExactDuplicates: () => ipcRenderer.invoke("duplicates:analyzeExact"),
  extractTextFromActivePdf: (documentPath) =>
    ipcRenderer.invoke("extraction:extractPdfText", documentPath),
  getRecentHistory: (limit) => ipcRenderer.invoke("history:getRecent", limit),
  getRulesStatus: () => ipcRenderer.invoke("rules:getStatus"),
  getUserRulesCatalog: () => ipcRenderer.invoke("rules:getUserCatalog"),
  saveUserRulesCatalog: (catalog) => ipcRenderer.invoke("rules:saveUserCatalog", catalog),
  reloadNamingRules: () => ipcRenderer.invoke("rules:reload")
};

contextBridge.exposeInMainWorld("docSorter", api);
