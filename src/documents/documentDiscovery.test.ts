import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverDocuments, type DocumentDiscoveryResult, type Result } from "./documentDiscovery";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("discoverDocuments", () => {
  it("lists supported PDF/JPG/JPEG/PNG files only", async () => {
    const directory = await createTempDirectory();
    await writeFile(path.join(directory, "document.pdf"), "pdf");
    await writeFile(path.join(directory, "photo.JPG"), "jpg");
    await writeFile(path.join(directory, "scan.jpeg"), "jpeg");
    await writeFile(path.join(directory, "receipt.png"), "png");
    await writeFile(path.join(directory, "notes.txt"), "txt");
    await writeFile(path.join(directory, "~$draft.pdf"), "temp");
    await mkdir(path.join(directory, "nested"));
    await writeFile(path.join(directory, "nested", "inside.pdf"), "nested");

    const result = await discoverDocuments(directory);
    const value = expectOk(result);

    expect(value.documents.map((document) => document.name)).toEqual([
      "document.pdf",
      "photo.JPG",
      "receipt.png",
      "scan.jpeg"
    ]);
    expect(value.documents.map((document) => document.extension)).toEqual([
      ".pdf",
      ".jpg",
      ".png",
      ".jpeg"
    ]);
    expect(value.documents.every((document) => document.status === "pending")).toBe(true);
  });

  it("returns basic metadata for each document", async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, "invoice.pdf");
    await writeFile(filePath, "abc");

    const expectedStats = await stat(filePath);
    const result = await discoverDocuments(directory);
    const value = expectOk(result);

    expect(value.documents).toHaveLength(1);
    expect(value.documents[0]).toMatchObject({
      name: "invoice.pdf",
      filePath,
      extension: ".pdf",
      sizeBytes: 3,
      sizeLabel: "3 B",
      modifiedAt: expectedStats.mtime.toISOString(),
      status: "pending"
    });
  });

  it("returns a clean error when the source directory is missing", async () => {
    const directory = path.join(os.tmpdir(), `docsorter-missing-${Date.now()}`);

    const result = await discoverDocuments(directory);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DIRECTORY_NOT_FOUND",
        message: "Dossier source introuvable."
      }
    });
  });

  it("returns a clean error when the source directory is not selected", async () => {
    const result = await discoverDocuments("");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SOURCE_NOT_SELECTED",
        message: "Aucun dossier source sélectionné."
      }
    });
  });

  it("does not modify files while discovering documents", async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, "readonly.pdf");
    await writeFile(filePath, "stable content");

    const beforeContent = await readFile(filePath, "utf8");
    const beforeEntries = (await readdir(directory)).sort();
    const beforeStats = await stat(filePath);

    const result = await discoverDocuments(directory);

    expectOk(result);
    await expect(readFile(filePath, "utf8")).resolves.toBe(beforeContent);
    await expect(readdir(directory).then((entries) => entries.sort())).resolves.toEqual(beforeEntries);
    expect((await stat(filePath)).mtimeMs).toBe(beforeStats.mtimeMs);
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-"));
  tempDirectories.push(directory);
  return directory;
}

function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result.value;
}
