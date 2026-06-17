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
  buildSuggestionV2: (documentPath, textContext, legacyDraft) =>
    ipcRenderer.invoke("suggestion-v2:build", documentPath, textContext, legacyDraft),
  runSuggestionV2Diagnostic: (documentPath, textContext, legacyDraft, includeAi) =>
    ipcRenderer.invoke("suggestion-v2:diagnose", documentPath, textContext, legacyDraft, includeAi),
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
  unloadAiModel: () => ipcRenderer.invoke("ai:unloadModel"),
  runAiSuggestionForActiveDocument: (documentPath, textContext) =>
    ipcRenderer.invoke("ai:runSuggestion", documentPath, textContext),
  getRecentHistory: (limit) => ipcRenderer.invoke("history:getRecent", limit),
  getRulesStatus: () => ipcRenderer.invoke("rules:getStatus"),
  getUserRulesCatalog: () => ipcRenderer.invoke("rules:getUserCatalog"),
  saveUserRulesCatalog: (catalog) => ipcRenderer.invoke("rules:saveUserCatalog", catalog),
  reloadNamingRules: () => ipcRenderer.invoke("rules:reload"),
  getReferenceDataStatus: () => ipcRenderer.invoke("reference-data:getStatus"),
  openReferenceDataFolder: () => ipcRenderer.invoke("reference-data:openFolder"),
  createMissingReferenceDataFiles: () => ipcRenderer.invoke("reference-data:createMissing"),
  validateReferenceDataFile: (fileKey, content) =>
    ipcRenderer.invoke("reference-data:validateFile", fileKey, content),
  saveReferenceDataFile: (fileKey, content) =>
    ipcRenderer.invoke("reference-data:saveFile", fileKey, content),
  reloadReferenceData: () => ipcRenderer.invoke("reference-data:reload")
};

contextBridge.exposeInMainWorld("docSorter", api);
