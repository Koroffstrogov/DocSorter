import { describe, expect, it } from "vitest";

import { ALLOWED_IPC_CHANNELS, IPC_CHANNELS } from "./ipcChannels";

const REVIEWED_IPC_CHANNELS = [
  "app:getVersion",
  "directory:selectSource",
  "directory:selectTarget",
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
  "history:getRecent",
  "rules:getStatus",
  "rules:getUserCatalog",
  "rules:saveUserCatalog",
  "rules:reload"
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
