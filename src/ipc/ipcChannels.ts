export const IPC_CHANNELS = {
  appGetVersion: "app:getVersion",
  directorySelectSource: "directory:selectSource",
  directorySelectTarget: "directory:selectTarget",
  targetListFolders: "target:listFolders",
  targetSetFolder: "target:setFolder",
  targetCreateFolder: "target:createFolder",
  documentsRefreshSource: "documents:refreshSource",
  previewGetData: "preview:getData",
  namingCreateInitialDraft: "naming:createInitialDraft",
  namingBuildProposal: "naming:buildProposal",
  namingCheckDestinationAvailability: "naming:checkDestinationAvailability",
  classificationPreparePlan: "classification:preparePlan",
  classificationExecute: "classification:execute",
  classificationUndoLast: "classification:undoLast",
  classificationGetLastUndoableAction: "classification:getLastUndoableAction",
  duplicatesAnalyzeExact: "duplicates:analyzeExact",
  extractionExtractPdfText: "extraction:extractPdfText",
  ocrGetStatus: "ocr:getStatus",
  ocrSelectTesseractExecutable: "ocr:selectTesseractExecutable",
  ocrSelectTessdataDirectory: "ocr:selectTessdataDirectory",
  ocrSaveSettings: "ocr:saveSettings",
  ocrTestEngine: "ocr:testEngine",
  ocrRunImage: "ocr:runImage",
  historyGetRecent: "history:getRecent",
  rulesGetStatus: "rules:getStatus",
  rulesGetUserCatalog: "rules:getUserCatalog",
  rulesSaveUserCatalog: "rules:saveUserCatalog",
  rulesReload: "rules:reload"
} as const;

export const ALLOWED_IPC_CHANNELS = Object.values(IPC_CHANNELS);

export type IpcChannel = (typeof ALLOWED_IPC_CHANNELS)[number];
