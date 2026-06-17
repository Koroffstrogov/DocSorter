import { describe, expect, it } from "vitest";

import { ALLOWED_IPC_CHANNELS, IPC_CHANNELS } from "./ipcChannels";

const REVIEWED_IPC_CHANNELS = [
  "app:getVersion",
  "directory:selectSource",
  "directory:selectTarget",
  "target:listFolders",
  "target:setFolder",
  "target:createFolder",
  "documents:refreshSource",
  "preview:getData",
  "naming:createInitialDraft",
  "naming:buildProposal",
  "naming:checkDestinationAvailability",
  "suggestion-v2:build",
  "suggestion-v2:diagnose",
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
  "ai:unloadModel",
  "ai:runSuggestion",
  "history:getRecent",
  "rules:getStatus",
  "rules:getUserCatalog",
  "rules:saveUserCatalog",
  "rules:reload",
  "reference-data:getStatus",
  "reference-data:openFolder",
  "reference-data:createMissing",
  "reference-data:validateFile",
  "reference-data:saveFile",
  "reference-data:reload"
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
