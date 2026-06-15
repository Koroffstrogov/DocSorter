import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getPreviewData } from "./previewService";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("getPreviewData", () => {
  it("returns preview bytes for an allowed queued image", async () => {
    const directory = await createTempDirectory();
    const imagePath = path.join(directory, "receipt.png");
    await writeFile(imagePath, "png-bytes");

    const result = await getPreviewData(imagePath, {
      sourcePath: directory,
      queuedDocumentPaths: new Set([path.resolve(imagePath)])
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("image");
      expect(result.value.extension).toBe(".png");
      expect(result.value.mimeType).toBe("image/png");
      expect(result.value.bytes.byteLength).toBe(9);
    }
  });

  it("returns preview bytes for an allowed queued PDF", async () => {
    const directory = await createTempDirectory();
    const pdfPath = path.join(directory, "document.pdf");
    await writeFile(pdfPath, "%PDF-1.7");

    const result = await getPreviewData(pdfPath, {
      sourcePath: directory,
      queuedDocumentPaths: new Set([path.resolve(pdfPath)])
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("pdf");
      expect(result.value.mimeType).toBe("application/pdf");
    }
  });

  it("refuses a file that was not part of the queue", async () => {
    const directory = await createTempDirectory();
    const imagePath = path.join(directory, "receipt.png");
    await writeFile(imagePath, "png-bytes");

    const result = await getPreviewData(imagePath, {
      sourcePath: directory,
      queuedDocumentPaths: new Set()
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "PREVIEW_NOT_ALLOWED",
        message: "Aperçu non autorisé pour ce fichier."
      }
    });
  });

  it("refuses unsupported extensions even if they are queued", async () => {
    const directory = await createTempDirectory();
    const textPath = path.join(directory, "notes.txt");
    await writeFile(textPath, "text");

    const result = await getPreviewData(textPath, {
      sourcePath: directory,
      queuedDocumentPaths: new Set([path.resolve(textPath)])
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_FILE_TYPE",
        message: "Format de prévisualisation non supporté."
      }
    });
  });

  it("returns a clean error if a queued file disappeared", async () => {
    const directory = await createTempDirectory();
    const pdfPath = path.join(directory, "missing.pdf");

    const result = await getPreviewData(pdfPath, {
      sourcePath: directory,
      queuedDocumentPaths: new Set([path.resolve(pdfPath)])
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "FILE_NOT_FOUND",
        message: "Fichier indisponible."
      }
    });
  });

  it("does not modify a file while reading preview data", async () => {
    const directory = await createTempDirectory();
    const pdfPath = path.join(directory, "stable.pdf");
    await writeFile(pdfPath, "stable");

    const beforeContent = await readFile(pdfPath, "utf8");
    const beforeStats = await stat(pdfPath);

    const result = await getPreviewData(pdfPath, {
      sourcePath: directory,
      queuedDocumentPaths: new Set([path.resolve(pdfPath)])
    });

    expect(result.ok).toBe(true);
    await expect(readFile(pdfPath, "utf8")).resolves.toBe(beforeContent);
    expect((await stat(pdfPath)).mtimeMs).toBe(beforeStats.mtimeMs);
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-preview-"));
  tempDirectories.push(directory);
  return directory;
}
