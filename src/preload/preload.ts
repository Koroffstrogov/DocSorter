import { contextBridge, ipcRenderer } from "electron";

import type { DocSorterApi } from "./preloadApiContract";

const api: DocSorterApi = {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  selectSourceDirectory: () => ipcRenderer.invoke("directory:selectSource"),
  selectTargetDirectory: () => ipcRenderer.invoke("directory:selectTarget"),
  listTargetFolders: () => ipcRenderer.invoke("target:listFolders"),
  setTargetFolder: (targetFolder) => ipcRenderer.invoke("target:setFolder", targetFolder),
  createTargetFolder: (targetFolder) => ipcRenderer.invoke("target:createFolder", targetFolder),
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
  getOcrStatus: () => ipcRenderer.invoke("ocr:getStatus"),
  selectTesseractExecutable: () => ipcRenderer.invoke("ocr:selectTesseractExecutable"),
  selectTessdataDirectory: () => ipcRenderer.invoke("ocr:selectTessdataDirectory"),
  saveOcrSettings: (settings) => ipcRenderer.invoke("ocr:saveSettings", settings),
  testOcrEngine: () => ipcRenderer.invoke("ocr:testEngine"),
  runOcrForActiveImage: (documentPath) => ipcRenderer.invoke("ocr:runImage", documentPath),
  getAiStatus: () => ipcRenderer.invoke("ai:getStatus"),
  getAiSettings: () => ipcRenderer.invoke("ai:getSettings"),
  saveAiSettings: (settings) => ipcRenderer.invoke("ai:saveSettings", settings),
  testAiConnection: () => ipcRenderer.invoke("ai:testConnection"),
  getAiModelStatus: () => ipcRenderer.invoke("ai:getModelStatus"),
  preloadAiModel: () => ipcRenderer.invoke("ai:preloadModel"),
  unloadAiModel: () => ipcRenderer.invoke("ai:unloadModel"),
  runAiSuggestionForActiveDocument: (documentPath, textContext) =>
    ipcRenderer.invoke("ai:runSuggestion", documentPath, textContext),
  exportAiDiagnostic: (documentPath, textContext, aiResult) =>
    ipcRenderer.invoke("ai:exportDiagnostic", documentPath, textContext, aiResult),
  getRecentHistory: (limit) => ipcRenderer.invoke("history:getRecent", limit),
};

contextBridge.exposeInMainWorld("docSorter", api);
