import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { discardDocuments } from "./discardDocuments";

const DOCUMENT_PATH = path.resolve("C:\\source\\document.pdf");

describe("discardDocuments", () => {
  it("refuses any discard without explicit confirmation", async () => {
    const trashItem = vi.fn(async () => undefined);

    const result = await discardDocuments({
      documentPaths: [DOCUMENT_PATH],
      mode: "trash",
      confirmed: false,
      queuedDocumentPaths: [DOCUMENT_PATH],
      trashItem
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_DISCARD_NOT_CONFIRMED"
      }
    });
    expect(trashItem).not.toHaveBeenCalled();
  });

  it("moves queued files to the trash only through the injected trash function", async () => {
    const trashItem = vi.fn(async () => undefined);
    const unlinkFile = vi.fn(async () => undefined);

    const result = await discardDocuments({
      documentPaths: [DOCUMENT_PATH],
      mode: "trash",
      confirmed: true,
      queuedDocumentPaths: [DOCUMENT_PATH],
      statFile: async () => ({ isFile: () => true }),
      trashItem,
      unlinkFile
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "trash",
        discardedFilePaths: [DOCUMENT_PATH],
        failures: []
      }
    });
    expect(trashItem).toHaveBeenCalledWith(DOCUMENT_PATH);
    expect(unlinkFile).not.toHaveBeenCalled();
  });

  it("uses permanent unlink only for confirmed permanent discard", async () => {
    const trashItem = vi.fn(async () => undefined);
    const unlinkFile = vi.fn(async () => undefined);

    const result = await discardDocuments({
      documentPaths: [DOCUMENT_PATH],
      mode: "permanent",
      confirmed: true,
      queuedDocumentPaths: [DOCUMENT_PATH],
      statFile: async () => ({ isFile: () => true }),
      trashItem,
      unlinkFile
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "permanent",
        discardedFilePaths: [DOCUMENT_PATH],
        failures: []
      }
    });
    expect(unlinkFile).toHaveBeenCalledWith(DOCUMENT_PATH);
    expect(trashItem).not.toHaveBeenCalled();
  });

  it("rejects paths outside the scanned queue", async () => {
    const trashItem = vi.fn(async () => undefined);

    const result = await discardDocuments({
      documentPaths: [DOCUMENT_PATH],
      mode: "trash",
      confirmed: true,
      queuedDocumentPaths: [],
      statFile: async () => ({ isFile: () => true }),
      trashItem
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        discardedFilePaths: [],
        failures: [
          {
            code: "DOCUMENT_NOT_IN_QUEUE"
          }
        ]
      }
    });
    expect(trashItem).not.toHaveBeenCalled();
  });
});
