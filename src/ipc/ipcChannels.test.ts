import { describe, expect, it } from "vitest";

import { ALLOWED_IPC_CHANNELS, IPC_CHANNELS } from "./ipcChannels";

const REVIEWED_IPC_CHANNELS = [
  "app:getVersion",
  "directory:selectSource",
  "directory:selectTarget",
  "target:listFolders",
  "target:setFolder",
  "target:createFolder",
  "folderLearning:listNames",
  "documents:refreshSource",
  "preview:getData",
  "naming:createInitialDraft",
  "naming:buildProposal",
  "naming:checkDestinationAvailability",
  "classification:preparePlan",
  "classification:execute",
  "classification:undoLast",
  "classification:getLastUndoableAction",
  "duplicates:analyzeExact",
  "extraction:extractPdfText",
  "ocr:getStatus",
  "ocr:selectTesseractExecutable",
  "ocr:selectTessdataDirectory",
  "ocr:saveSettings",
  "ocr:testEngine",
  "ocr:runImage",
  "ai:getStatus",
  "ai:getSettings",
  "ai:saveSettings",
  "ai:testConnection",
  "ai:getModelStatus",
  "ai:preloadModel",
  "ai:unloadModel",
  "ai:runSuggestion",
  "ai:exportDiagnostic",
  "history:getRecent"
] as const;

describe("IPC channel contract", () => {
  it("lists exactly the reviewed IPC channels", () => {
    expect(ALLOWED_IPC_CHANNELS).toEqual([...REVIEWED_IPC_CHANNELS]);
    expect(Object.values(IPC_CHANNELS)).toEqual([...REVIEWED_IPC_CHANNELS]);
  });

  it("does not expose generic file-system channels", () => {
    for (const channel of ALLOWED_IPC_CHANNELS) {
      expect(channel).not.toMatch(/^(fs|file|path):/);
      expect(channel).not.toMatch(/(^|:)(delete|unlink|rm|rename|copy)(:|$)/);
    }
  });
});
