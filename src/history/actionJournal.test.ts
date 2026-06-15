import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendActionJournalEntry,
  isActionAlreadyUndone,
  readLastUndoableClassification,
  readRecentActions
} from "./actionJournal";

describe("actionJournal reads", () => {
  it("returns an empty history when the journal is absent", async () => {
    const journalFile = path.join(await createRoot(), "missing", "actions.jsonl");

    const recent = await readRecentActions(journalFile, 5);
    const undoable = await readLastUndoableClassification(journalFile);

    expect(recent).toEqual({
      ok: true,
      value: [],
      ignoredInvalidLines: 0
    });
    expect(undoable).toEqual({
      ok: true,
      value: null,
      ignoredInvalidLines: 0
    });
  });

  it("ignores invalid JSONL lines without crashing", async () => {
    const journalFile = path.join(await createRoot(), "actions.jsonl");
    await writeFile(
      journalFile,
      [
        "not-json",
        JSON.stringify({
          id: "a1",
          timestamp: "2026-06-15T12:00:00.000Z",
          action: "classify",
          status: "completed",
          oldPath: "C:\\source\\a.pdf",
          newPath: "C:\\target\\b.pdf",
          oldName: "a.pdf",
          newName: "b.pdf"
        }),
        JSON.stringify({ id: "missing-action", timestamp: "2026-06-15T12:01:00.000Z" })
      ].join("\n")
    );

    const recent = await readRecentActions(journalFile, 10);

    expect(recent.ok).toBe(true);
    if (recent.ok) {
      expect(recent.value).toHaveLength(1);
      expect(recent.ignoredInvalidLines).toBe(2);
      expect(recent.value[0].id).toBe("a1");
    }
  });

  it("returns recent valid actions newest first", async () => {
    const journalFile = path.join(await createRoot(), "history", "actions.jsonl");
    await appendActionJournalEntry(journalFile, {
      id: "a1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: "old-a",
      newPath: "new-a",
      oldName: "old-a.pdf",
      newName: "new-a.pdf"
    });
    await appendActionJournalEntry(journalFile, {
      id: "a2",
      timestamp: "2026-06-15T12:01:00.000Z",
      action: "undo-classify",
      status: "completed",
      originalActionId: "a1",
      oldName: "new-a.pdf",
      newName: "old-a.pdf"
    });

    const recent = await readRecentActions(journalFile, 2);

    expect(recent.ok).toBe(true);
    if (recent.ok) {
      expect(recent.value.map((entry) => entry.id)).toEqual(["a2", "a1"]);
    }
  });

  it("identifies the last completed classification when it has not been undone", async () => {
    const journalFile = path.join(await createRoot(), "history", "actions.jsonl");
    await appendActionJournalEntry(journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: "C:\\source\\a.pdf",
      newPath: "C:\\target\\b.pdf",
      oldName: "a.pdf",
      newName: "b.pdf",
      sourceHashSha256: "hash"
    });

    const undoable = await readLastUndoableClassification(journalFile);

    expect(undoable.ok).toBe(true);
    if (undoable.ok) {
      expect(undoable.value).toEqual({
        id: "classify-1",
        completedAt: "2026-06-15T12:00:00.000Z",
        originalPath: "C:\\source\\a.pdf",
        classifiedPath: "C:\\target\\b.pdf",
        originalName: "a.pdf",
        classifiedName: "b.pdf",
        sourceHashSha256: "hash"
      });
    }
  });

  it("does not propose a classification that has already been undone", async () => {
    const journalFile = path.join(await createRoot(), "history", "actions.jsonl");
    await appendActionJournalEntry(journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: "old",
      newPath: "new",
      oldName: "old.pdf",
      newName: "new.pdf"
    });
    await appendActionJournalEntry(journalFile, {
      id: "undo-1",
      timestamp: "2026-06-15T12:05:00.000Z",
      action: "undo-classify",
      status: "completed",
      originalActionId: "classify-1"
    });

    const undoable = await readLastUndoableClassification(journalFile);
    const alreadyUndone = await isActionAlreadyUndone(journalFile, "classify-1");

    expect(undoable.ok).toBe(true);
    if (undoable.ok) {
      expect(undoable.value).toBeNull();
    }
    expect(alreadyUndone.ok).toBe(true);
    if (alreadyUndone.ok) {
      expect(alreadyUndone.value).toBe(true);
    }
  });
});

async function createRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "docsorter-journal-"));
}
