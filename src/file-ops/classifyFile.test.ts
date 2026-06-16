import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  executeClassification,
  undoLastClassification,
  type ExecuteClassificationOptions
} from "./classifyFile";
import {
  appendActionJournalEntry,
  type ActionJournalResult
} from "../history/actionJournal";
import type { ActionJournalEntry } from "../history/historyTypes";

const fixedNow = () => new Date("2026-06-15T12:00:00.000Z");

describe("executeClassification", () => {
  it("renames, moves and journals a successful classification", async () => {
    const fixture = await createFixture();

    const result = await executeClassification(createExecuteOptions(fixture));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.undoableAction.originalPath).toBe(fixture.sourceFile);
      expect(result.value.undoableAction.classifiedPath).toBe(fixture.destinationFile);
      expect(result.value.undoableAction.sourceHashSha256).toHaveLength(64);
    }
    await expect(stat(fixture.sourceFile)).rejects.toThrow();
    await expect(readFile(fixture.destinationFile, "utf8")).resolves.toBe("source");

    const journal = await readJournal(fixture.journalFile);
    expect(journal.map((entry) => entry.status)).toEqual(["started", "completed"]);
    expect(journal[0]).toMatchObject({
      action: "classify",
      oldPath: fixture.sourceFile,
      newPath: fixture.destinationFile,
      oldName: "source.pdf",
      newName: "2026-06-15_Facture_Energie.pdf"
    });
  });

  it("does not move the file when the started journal entry cannot be written", async () => {
    const fixture = await createFixture();
    let renameCalled = false;

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        appendJournalEntry: async () => journalWriteFailure(),
        renameFile: async () => {
          renameCalled = true;
        }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("JOURNAL_WRITE_FAILED");
    }
    expect(renameCalled).toBe(false);
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(stat(fixture.destinationFile)).rejects.toThrow();
  });

  it("reports a journal warning when the file is moved but the completed entry fails", async () => {
    const fixture = await createFixture();

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        appendJournalEntry: failMatchingJournalEntry(
          (entry) => entry.action === "classify" && entry.status === "completed"
        )
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("completed-with-journal-warning");
      expect(result.value.status).not.toBe("completed");
      expect(result.value.journalWarning?.code).toBe("CLASSIFIED_BUT_JOURNAL_INCOMPLETE");
      expect(result.value.message).toBe("Le fichier a été classé, mais le journal n'a pas pu être finalisé.");
      expect(result.value.undoableAction.classifiedPath).toBe(fixture.destinationFile);
    }
    await expect(stat(fixture.sourceFile)).rejects.toThrow();
    await expect(readFile(fixture.destinationFile, "utf8")).resolves.toBe("source");

    const journal = await readJournal(fixture.journalFile);
    expect(journal.map((entry) => entry.status)).toEqual(["started"]);
  });

  it("refuses classification when the source disappeared", async () => {
    const fixture = await createFixture();
    const missingSource = path.join(fixture.sourceDir, "missing.pdf");

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        documentPath: missingSource,
        queuedDocumentPaths: [missingSource]
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SOURCE_DOCUMENT_NOT_FOUND");
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    const journal = await readJournal(fixture.journalFile);
    expect(journal.at(-1)).toMatchObject({
      action: "classify",
      status: "failed",
      errorCode: "SOURCE_DOCUMENT_NOT_FOUND"
    });
  });

  it("refuses classification when the target disappeared", async () => {
    const fixture = await createFixture();
    const missingTarget = path.join(fixture.root, "missing-target");

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        selectedTargetPath: missingTarget
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_FOUND");
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
  });

  it("refuses classification when the destination already exists and does not overwrite it", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.destinationFile, "existing");

    const result = await executeClassification(createExecuteOptions(fixture));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DESTINATION_ALREADY_EXISTS");
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(readFile(fixture.destinationFile, "utf8")).resolves.toBe("existing");
  });

  it("refuses classification before rename when the final target write check fails", async () => {
    const fixture = await createFixture();
    let writableCheckCount = 0;
    let renameCalled = false;

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        checkTargetDirectoryWritable: async () => {
          writableCheckCount += 1;
          if (writableCheckCount === 1) {
            return {
              ok: true,
              value: fixture.targetDir
            };
          }

          return {
            ok: false,
            error: {
              code: "TARGET_NOT_WRITABLE",
              message: "Le dossier cible n'est pas accessible en écriture."
            }
          };
        },
        renameFile: async () => {
          renameCalled = true;
        }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_WRITABLE");
    }
    expect(renameCalled).toBe(false);
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(stat(fixture.destinationFile)).rejects.toThrow();

    const journal = await readJournal(fixture.journalFile);
    expect(journal.map((entry) => entry.status)).toEqual(["failed"]);
    expect(journal.at(-1)).toMatchObject({
      errorCode: "TARGET_NOT_WRITABLE"
    });
  });

  it("refuses classification when the proposed name is invalid", async () => {
    const fixture = await createFixture();

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        proposedFilename: "facture/energie.pdf"
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_FILENAME");
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
  });

  it("does not copy-delete when rename reports EXDEV", async () => {
    const fixture = await createFixture();

    const result = await executeClassification(
      createExecuteOptions(fixture, {
        renameFile: async () => {
          const error = new Error("Cross-device link") as NodeJS.ErrnoException;
          error.code = "EXDEV";
          throw error;
        }
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MOVE_ACROSS_DEVICES_UNSUPPORTED");
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(stat(fixture.destinationFile)).rejects.toThrow();

    const journal = await readJournal(fixture.journalFile);
    expect(journal.map((entry) => entry.status)).toEqual(["started", "failed"]);
    expect(journal.at(-1)).toMatchObject({
      errorCode: "MOVE_ACROSS_DEVICES_UNSUPPORTED"
    });
  });
});

describe("undoLastClassification", () => {
  it("restores the last classified file and journals the undo", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }

    const result = await undoLastClassification({
      undoableAction: executeResult.value.undoableAction,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-1"
    });

    expect(result.ok).toBe(true);
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(stat(fixture.destinationFile)).rejects.toThrow();

    const journal = await readJournal(fixture.journalFile);
    expect(journal.at(-1)).toMatchObject({
      id: "undo-1",
      action: "undo-classify",
      status: "completed",
      originalActionId: "classify-1",
      restoredPath: fixture.sourceFile,
      classifiedPath: fixture.destinationFile
    });
  });

  it("reports a journal warning when undo restores the file but the completed entry fails", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }

    const result = await undoLastClassification({
      undoableAction: executeResult.value.undoableAction,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-warning",
      appendJournalEntry: failMatchingJournalEntry(
        (entry) => entry.action === "undo-classify" && entry.status === "completed"
      )
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("undo-completed-with-journal-warning");
      expect(result.value.status).not.toBe("completed");
      expect(result.value.journalWarning?.code).toBe("UNDO_COMPLETED_BUT_JOURNAL_INCOMPLETE");
      expect(result.value.message).toBe(
        "La dernière action a été annulée, mais le journal n'a pas pu être finalisé."
      );
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(stat(fixture.destinationFile)).rejects.toThrow();

    const journal = await readJournal(fixture.journalFile);
    expect(journal.map((entry) => `${entry.action}:${entry.status}`)).toEqual([
      "classify:started",
      "classify:completed"
    ]);
  });

  it("restores the last classified file after reconstructing it from the journal", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }

    const result = await undoLastClassification({
      undoableAction: null,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-persistent"
    });

    expect(result.ok).toBe(true);
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("source");
    await expect(stat(fixture.destinationFile)).rejects.toThrow();
  });

  it("refuses undo when no action is available", async () => {
    const fixture = await createFixture();

    const result = await undoLastClassification({
      undoableAction: null,
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NO_UNDO_AVAILABLE");
    }
  });

  it("refuses undo when the classified file is missing", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }
    await rm(fixture.destinationFile);

    const result = await undoLastClassification({
      undoableAction: executeResult.value.undoableAction,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-missing"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNDO_SOURCE_MISSING");
    }
  });

  it("refuses undo when the original source path is occupied", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }
    await writeFile(fixture.sourceFile, "occupied");

    const result = await undoLastClassification({
      undoableAction: executeResult.value.undoableAction,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-occupied"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNDO_DESTINATION_OCCUPIED");
    }
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe("occupied");
    await expect(readFile(fixture.destinationFile, "utf8")).resolves.toBe("source");
  });

  it("refuses undo when the classified file hash changed", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }
    await writeFile(fixture.destinationFile, "changed");

    const result = await undoLastClassification({
      undoableAction: null,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-hash"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNDO_HASH_MISMATCH");
    }
    await expect(stat(fixture.sourceFile)).rejects.toThrow();
    await expect(readFile(fixture.destinationFile, "utf8")).resolves.toBe("changed");
  });

  it("does not offer multiple undo after the latest classification is undone", async () => {
    const fixture = await createFixture();
    const executeResult = await executeClassification(createExecuteOptions(fixture));
    if (!executeResult.ok) {
      throw new Error("Expected successful classification");
    }

    const firstUndo = await undoLastClassification({
      undoableAction: null,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-once"
    });
    expect(firstUndo.ok).toBe(true);

    const secondUndo = await undoLastClassification({
      undoableAction: null,
      journalFilePath: fixture.journalFile,
      now: fixedNow,
      createId: () => "undo-twice"
    });

    expect(secondUndo.ok).toBe(false);
    if (!secondUndo.ok) {
      expect(secondUndo.error.code).toBe("NO_UNDO_AVAILABLE");
    }
  });
});

interface Fixture {
  root: string;
  sourceDir: string;
  targetDir: string;
  journalFile: string;
  sourceFile: string;
  destinationFile: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-classify-"));
  const sourceDir = path.join(root, "source");
  const targetDir = path.join(root, "target");
  const journalFile = path.join(root, "journal", "actions.jsonl");
  const sourceFile = path.join(sourceDir, "source.pdf");
  const destinationFile = path.join(targetDir, "2026-06-15_Facture_Energie.pdf");

  await mkdir(sourceDir);
  await mkdir(targetDir);
  await writeFile(sourceFile, "source");

  return {
    root,
    sourceDir,
    targetDir,
    journalFile,
    sourceFile,
    destinationFile
  };
}

function createExecuteOptions(
  fixture: Fixture,
  overrides: Partial<ExecuteClassificationOptions> = {}
): ExecuteClassificationOptions {
  return {
    documentPath: fixture.sourceFile,
    proposedFilename: "2026-06-15_Facture_Energie.pdf",
    selectedTargetPath: fixture.targetDir,
    queuedDocumentPaths: [fixture.sourceFile],
    journalFilePath: fixture.journalFile,
    now: fixedNow,
    createId: () => "classify-1",
    ...overrides
  };
}

async function readJournal(journalFile: string): Promise<Array<Record<string, unknown>>> {
  const content = await readFile(journalFile, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function failMatchingJournalEntry(
  predicate: (entry: ActionJournalEntry) => boolean
): (journalFilePath: string, entry: ActionJournalEntry) => Promise<ActionJournalResult> {
  return (journalFilePath, entry) => {
    if (predicate(entry)) {
      return Promise.resolve(journalWriteFailure());
    }

    return appendActionJournalEntry(journalFilePath, entry);
  };
}

function journalWriteFailure(): ActionJournalResult {
  return {
    ok: false,
    error: {
      code: "JOURNAL_WRITE_FAILED",
      message: "Impossible d'écrire le journal d'action."
    }
  };
}
