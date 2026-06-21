import { contextBridge, ipcRenderer } from "electron";

import type { DocSorterApi } from "./preloadApiContract";

const api: DocSorterApi = {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  selectSourceDirectory: (sourcePath) => ipcRenderer.invoke("directory:selectSource", sourcePath),
  listSourceDirectory: (sourcePath) => ipcRenderer.invoke("source:listDirectory", sourcePath),
  selectTargetDirectory: () => ipcRenderer.invoke("directory:selectTarget"),
  listTargetFolders: () => ipcRenderer.invoke("target:listFolders"),
  setTargetFolder: (targetFolder) => ipcRenderer.invoke("target:setFolder", targetFolder),
  createTargetFolder: (targetFolder) => ipcRenderer.invoke("target:createFolder", targetFolder),
  listTargetFolderNames: () => ipcRenderer.invoke("folderLearning:listNames"),
  refreshSourceDocuments: () => ipcRenderer.invoke("documents:refreshSource"),
  discardDocuments: (documentPaths, mode, confirmed) =>
    ipcRenderer.invoke("documents:discard", { documentPaths, mode, confirmed }),
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
  getPdfOcrStatus: () => ipcRenderer.invoke("ocr:getPdfStatus"),
  runOcrForActivePdf: (documentPath) => ipcRenderer.invoke("ocr:runPdf", documentPath),
  onPdfOcrProgress: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      if (
        progress &&
        typeof progress === "object" &&
        typeof (progress as { page?: unknown }).page === "number" &&
        typeof (progress as { pageIndex?: unknown }).pageIndex === "number" &&
        typeof (progress as { pageCount?: unknown }).pageCount === "number" &&
        typeof (progress as { message?: unknown }).message === "string"
      ) {
        listener(progress as Parameters<typeof listener>[0]);
      }
    };
    ipcRenderer.on("ocr:pdfProgress", callback);
    return () => {
      ipcRenderer.removeListener("ocr:pdfProgress", callback);
    };
  },
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
  listKnownTargets: () => ipcRenderer.invoke("knownTargets:list"),
  createKnownTarget: (input) => ipcRenderer.invoke("knownTargets:create", input),
  updateKnownTarget: (id, input) => ipcRenderer.invoke("knownTargets:update", id, input),
  deactivateKnownTarget: (id) => ipcRenderer.invoke("knownTargets:deactivate", id),
  getRecentHistory: (limit) => ipcRenderer.invoke("history:getRecent", limit),
};

contextBridge.exposeInMainWorld("docSorter", api);
