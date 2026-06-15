import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { calculateSha256 } from "../file-ops/fileHash";
import { appendActionJournalEntry } from "../history/actionJournal";
import { analyzeExactDuplicates, type DuplicateSourceDocument } from "./exactDuplicates";

const fixedNow = () => new Date("2026-06-15T12:00:00.000Z");

describe("analyzeExactDuplicates", () => {
  it("detects two identical files in the source queue", async () => {
    const fixture = await createFixture();
    const left = await createSourceFile(fixture, "a.pdf", "same");
    const right = await createSourceFile(fixture, "b.pdf", "same");

    const result = await analyzeExactDuplicates({
      sourceDocuments: [left, right],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toHaveLength(1);
      expect(result.value.matches[0]).toMatchObject({
        type: "source-queue",
        reliable: true
      });
      if (result.value.matches[0].type === "source-queue") {
        expect(result.value.matches[0].files.map((file) => file.name).sort()).toEqual([
          "a.pdf",
          "b.pdf"
        ]);
      }
    }
  });

  it("does not report different files as duplicates", async () => {
    const fixture = await createFixture();
    const left = await createSourceFile(fixture, "a.pdf", "left");
    const right = await createSourceFile(fixture, "b.pdf", "right");

    const result = await analyzeExactDuplicates({
      sourceDocuments: [left, right],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toEqual([]);
    }
  });

  it("groups three identical source files in a single source duplicate group", async () => {
    const fixture = await createFixture();
    const documents = await Promise.all([
      createSourceFile(fixture, "a.pdf", "same"),
      createSourceFile(fixture, "b.pdf", "same"),
      createSourceFile(fixture, "c.pdf", "same")
    ]);

    const result = await analyzeExactDuplicates({
      sourceDocuments: documents,
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const sourceGroups = result.value.matches.filter((match) => match.type === "source-queue");
      expect(sourceGroups).toHaveLength(1);
      expect(sourceGroups[0].type).toBe("source-queue");
      if (sourceGroups[0].type === "source-queue") {
        expect(sourceGroups[0].files).toHaveLength(3);
      }
    }
  });

  it("returns a file-level error when a source file disappeared during analysis", async () => {
    const fixture = await createFixture();
    const existing = await createSourceFile(fixture, "a.pdf", "same");
    const missing = {
      filePath: path.join(fixture.sourceDir, "missing.pdf"),
      name: "missing.pdf"
    };

    const result = await analyzeExactDuplicates({
      sourceDocuments: [existing, missing],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fileErrors).toEqual([
        expect.objectContaining({
          filePath: missing.filePath,
          name: "missing.pdf",
          code: "FILE_NOT_FOUND"
        })
      ]);
    }
  });

  it("matches a source file with a completed non-undone classification from history", async () => {
    const fixture = await createFixture();
    const source = await createSourceFile(fixture, "copy.pdf", "same");
    const classifiedPath = path.join(fixture.targetDir, "classified.pdf");
    await writeFile(classifiedPath, "same");
    const hash = await requireHash(classifiedPath);
    await appendActionJournalEntry(fixture.journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: path.join(fixture.sourceDir, "original.pdf"),
      newPath: classifiedPath,
      oldName: "original.pdf",
      newName: "classified.pdf",
      sourceHashSha256: hash
    });

    const result = await analyzeExactDuplicates({
      sourceDocuments: [source],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toHaveLength(1);
      expect(result.value.matches[0]).toMatchObject({
        type: "history",
        hash,
        sourceFile: {
          name: "copy.pdf"
        },
        historyFile: {
          name: "classified.pdf",
          actionId: "classify-1"
        }
      });
    }
  });

  it("ignores a completed classification that has been undone", async () => {
    const fixture = await createFixture();
    const source = await createSourceFile(fixture, "copy.pdf", "same");
    const classifiedPath = path.join(fixture.targetDir, "classified.pdf");
    await writeFile(classifiedPath, "same");
    const hash = await requireHash(classifiedPath);
    await appendActionJournalEntry(fixture.journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: path.join(fixture.sourceDir, "original.pdf"),
      newPath: classifiedPath,
      oldName: "original.pdf",
      newName: "classified.pdf",
      sourceHashSha256: hash
    });
    await appendActionJournalEntry(fixture.journalFile, {
      id: "undo-1",
      timestamp: "2026-06-15T12:05:00.000Z",
      action: "undo-classify",
      status: "completed",
      originalActionId: "classify-1"
    });

    const result = await analyzeExactDuplicates({
      sourceDocuments: [source],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toEqual([]);
    }
  });

  it("ignores history entries whose classified destination no longer exists", async () => {
    const fixture = await createFixture();
    const source = await createSourceFile(fixture, "copy.pdf", "same");
    await appendActionJournalEntry(fixture.journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: path.join(fixture.sourceDir, "original.pdf"),
      newPath: path.join(fixture.targetDir, "missing.pdf"),
      oldName: "original.pdf",
      newName: "missing.pdf",
      sourceHashSha256: "unused"
    });

    const result = await analyzeExactDuplicates({
      sourceDocuments: [source],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toEqual([]);
      expect(result.value.ignoredHistoryCount).toBe(1);
    }
  });

  it("ignores history entries without a stored classification hash", async () => {
    const fixture = await createFixture();
    const source = await createSourceFile(fixture, "copy.pdf", "same");
    const classifiedPath = path.join(fixture.targetDir, "classified.pdf");
    await writeFile(classifiedPath, "same");
    await appendActionJournalEntry(fixture.journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: path.join(fixture.sourceDir, "original.pdf"),
      newPath: classifiedPath,
      oldName: "original.pdf",
      newName: "classified.pdf"
    });

    const result = await analyzeExactDuplicates({
      sourceDocuments: [source],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toEqual([]);
      expect(result.value.ignoredHistoryCount).toBe(1);
    }
  });

  it("ignores a history file modified after classification", async () => {
    const fixture = await createFixture();
    const source = await createSourceFile(fixture, "copy.pdf", "same");
    const classifiedPath = path.join(fixture.targetDir, "classified.pdf");
    await writeFile(classifiedPath, "same");
    const originalHash = await requireHash(classifiedPath);
    await writeFile(classifiedPath, "changed");
    await appendActionJournalEntry(fixture.journalFile, {
      id: "classify-1",
      timestamp: "2026-06-15T12:00:00.000Z",
      action: "classify",
      status: "completed",
      oldPath: path.join(fixture.sourceDir, "original.pdf"),
      newPath: classifiedPath,
      oldName: "original.pdf",
      newName: "classified.pdf",
      sourceHashSha256: originalHash
    });

    const result = await analyzeExactDuplicates({
      sourceDocuments: [source],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.matches).toEqual([]);
      expect(result.value.ignoredHistoryCount).toBe(1);
    }
  });

  it("does not modify, delete or move files while analyzing", async () => {
    const fixture = await createFixture();
    const source = await createSourceFile(fixture, "copy.pdf", "same");
    const sourceBefore = await readFile(source.filePath, "utf8");
    const sourceDirBefore = (await readdir(fixture.sourceDir)).sort();
    const targetDirBefore = (await readdir(fixture.targetDir)).sort();

    await analyzeExactDuplicates({
      sourceDocuments: [source],
      journalFilePath: fixture.journalFile,
      now: fixedNow
    });

    await expect(readFile(source.filePath, "utf8")).resolves.toBe(sourceBefore);
    expect((await readdir(fixture.sourceDir)).sort()).toEqual(sourceDirBefore);
    expect((await readdir(fixture.targetDir)).sort()).toEqual(targetDirBefore);
  });
});

async function createFixture(): Promise<{
  root: string;
  sourceDir: string;
  targetDir: string;
  journalFile: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-duplicates-"));
  const sourceDir = path.join(root, "source");
  const targetDir = path.join(root, "target");
  const journalFile = path.join(root, "history", "actions.jsonl");
  await mkdir(sourceDir);
  await mkdir(targetDir);
  return {
    root,
    sourceDir,
    targetDir,
    journalFile
  };
}

async function createSourceFile(
  fixture: { sourceDir: string },
  name: string,
  content: string
): Promise<DuplicateSourceDocument> {
  const filePath = path.join(fixture.sourceDir, name);
  await writeFile(filePath, content);
  return {
    filePath,
    name
  };
}

async function requireHash(filePath: string): Promise<string> {
  const hash = await calculateSha256(filePath);
  if (!hash.ok) {
    throw new Error("Expected hash calculation to succeed");
  }

  return hash.value;
}
