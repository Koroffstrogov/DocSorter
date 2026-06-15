import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prepareClassificationPlan } from "./classificationPlan";

const fixedNow = () => new Date("2026-06-15T12:00:00.000Z");

describe("prepareClassificationPlan", () => {
  it("prepares a ready plan when source, queue, target and destination are valid", async () => {
    const fixture = await createFixture();

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: fixture.targetDir,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("ready");
      expect(result.value.message).toBe("Plan prêt — aucun fichier modifié");
      expect(result.value.sourcePath).toBe(path.resolve(fixture.sourceFile));
      expect(result.value.currentName).toBe("source.pdf");
      expect(result.value.targetPath).toBe(fixture.targetDir);
      expect(result.value.proposedFilename).toBe("2026-06-15_Facture_Energie.pdf");
      expect(result.value.destinationPath).toBe(
        path.join(fixture.targetDir, "2026-06-15_Facture_Energie.pdf")
      );
      expect(result.value.extension).toBe(".pdf");
      expect(result.value.sourceFileStatus).toBe("present");
      expect(result.value.targetDirectoryStatus).toBe("available");
      expect(result.value.collisionStatus).toBe("available");
      expect(result.value.preparedAt).toBe("2026-06-15T12:00:00.000Z");
      expect(result.value.checks.every((check) => check.status === "ok")).toBe(true);
    }
  });

  it("refuses the plan when the source document no longer exists", async () => {
    const fixture = await createFixture();
    const missingSource = path.join(fixture.sourceDir, "missing.pdf");

    const result = await prepareClassificationPlan({
      documentPath: missingSource,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: fixture.targetDir,
      queuedDocumentPaths: [missingSource],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SOURCE_DOCUMENT_NOT_FOUND");
      expect(result.value.status).toBe("blocked");
      expect(result.value.sourceFileStatus).toBe("missing");
    }
  });

  it("refuses the plan when the source document is not in the scanned queue", async () => {
    const fixture = await createFixture();

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: fixture.targetDir,
      queuedDocumentPaths: [],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SOURCE_DOCUMENT_NOT_IN_QUEUE");
      expect(result.value.sourceFileStatus).toBe("not-in-queue");
    }
  });

  it("refuses the plan when no target is selected", async () => {
    const fixture = await createFixture();

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: null,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_SELECTED");
      expect(result.value.targetDirectoryStatus).toBe("not-selected");
    }
  });

  it("refuses the plan when the target directory no longer exists", async () => {
    const fixture = await createFixture();
    const missingTarget = path.join(fixture.root, "missing-target");

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: missingTarget,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_FOUND");
      expect(result.value.targetDirectoryStatus).toBe("not-found");
    }
  });

  it("refuses the plan when the target path is not a directory", async () => {
    const fixture = await createFixture();
    const fileTarget = path.join(fixture.root, "not-a-directory.txt");
    await writeFile(fileTarget, "target");

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: fileTarget,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_DIRECTORY");
      expect(result.value.targetDirectoryStatus).toBe("not-directory");
    }
  });

  it("refuses the plan when the proposed filename is invalid", async () => {
    const fixture = await createFixture();

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "facture/energie.pdf",
      selectedTargetPath: fixture.targetDir,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_FILENAME");
      expect(result.value.collisionStatus).toBe("invalid");
    }
  });

  it("refuses the plan when the destination already exists", async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.targetDir, "2026-06-15_Facture_Energie.pdf"), "existing");

    const result = await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: fixture.targetDir,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DESTINATION_ALREADY_EXISTS");
      expect(result.value.collisionStatus).toBe("already-exists");
      expect(result.value.destinationPath).toBe(
        path.join(fixture.targetDir, "2026-06-15_Facture_Energie.pdf")
      );
    }
  });

  it("does not create, rename, move or delete files while preparing a plan", async () => {
    const fixture = await createFixture();
    const sourceBefore = await readFile(fixture.sourceFile, "utf8");
    const sourceDirBefore = await readdir(fixture.sourceDir);
    const targetDirBefore = await readdir(fixture.targetDir);

    await prepareClassificationPlan({
      documentPath: fixture.sourceFile,
      proposedFilename: "2026-06-15_Facture_Energie.pdf",
      selectedTargetPath: fixture.targetDir,
      queuedDocumentPaths: [fixture.sourceFile],
      now: fixedNow
    });

    await expect(stat(fixture.sourceFile)).resolves.toMatchObject({ size: sourceBefore.length });
    await expect(readFile(fixture.sourceFile, "utf8")).resolves.toBe(sourceBefore);
    await expect(readdir(fixture.sourceDir)).resolves.toEqual(sourceDirBefore);
    await expect(readdir(fixture.targetDir)).resolves.toEqual(targetDirBefore);
  });
});

async function createFixture(): Promise<{
  root: string;
  sourceDir: string;
  targetDir: string;
  sourceFile: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-classification-"));
  const sourceDir = path.join(root, "source");
  const targetDir = path.join(root, "target");
  const sourceFile = path.join(sourceDir, "source.pdf");

  await mkdir(sourceDir);
  await mkdir(targetDir);
  await writeFile(sourceFile, "source");

  return {
    root,
    sourceDir,
    targetDir,
    sourceFile
  };
}
