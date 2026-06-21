import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listSourceDirectory } from "./sourceDirectoryBrowser";

describe("listSourceDirectory", () => {
  it("lists folders and files while marking supported documents", async () => {
    const directory = await createTempDirectory();
    await mkdir(path.join(directory, "incoming"));
    await writeFile(path.join(directory, "scan.pdf"), "pdf");
    await writeFile(path.join(directory, "photo.jpg"), "jpg");
    await writeFile(path.join(directory, "notes.txt"), "txt");

    const result = await listSourceDirectory(directory, { homePath: directory, cwd: directory });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.currentPath).toBe(path.resolve(directory));
    expect(result.value.directoryCount).toBe(1);
    expect(result.value.fileCount).toBe(3);
    expect(result.value.supportedDocumentCount).toBe(2);
    expect(result.value.entries.map((entry) => entry.name)).toEqual([
      "incoming",
      "notes.txt",
      "photo.jpg",
      "scan.pdf"
    ]);
    expect(result.value.entries[0]).toMatchObject({
      kind: "directory",
      supportedDocument: false
    });
    expect(result.value.entries.find((entry) => entry.name === "scan.pdf")).toMatchObject({
      kind: "file",
      extension: ".pdf",
      supportedDocument: true
    });
    expect(result.value.entries.find((entry) => entry.name === "notes.txt")).toMatchObject({
      kind: "file",
      extension: ".txt",
      supportedDocument: false
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("returns the parent path and ignores unsupported special entries without mutation", async () => {
    const directory = await createTempDirectory();
    const child = path.join(directory, "child");
    await mkdir(child);
    await writeFile(path.join(child, "document.pdf"), "pdf");
    const beforeEntries = await readdir(child);
    const beforeStats = await stat(path.join(child, "document.pdf"));

    const result = await listSourceDirectory(child, { homePath: directory, cwd: directory });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parentPath).toBe(path.resolve(directory));
      expect(result.value.entries).toHaveLength(1);
    }
    await expect(readdir(child)).resolves.toEqual(beforeEntries);
    expect((await stat(path.join(child, "document.pdf"))).mtimeMs).toBe(beforeStats.mtimeMs);

    await rm(directory, { recursive: true, force: true });
  });

  it("fails clearly for a missing directory", async () => {
    const result = await listSourceDirectory(path.join(os.tmpdir(), "docsorter-missing-directory"));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DIRECTORY_NOT_FOUND"
      }
    });
  });
});

async function createTempDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "docsorter-source-browser-"));
}
