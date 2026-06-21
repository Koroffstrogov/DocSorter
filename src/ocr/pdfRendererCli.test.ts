import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findPdfRenderer } from "./pdfRendererCli";
import type { ExecFileRunner } from "./tesseractCli";

describe("findPdfRenderer", () => {
  it("finds pdftoppm from the repository resources/poppler folder in dev mode", async () => {
    const previousCwd = process.cwd();
    const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-poppler-"));
    const popplerDirectory = path.join(root, "resources", "poppler");
    const pdftoppmPath = path.join(popplerDirectory, "pdftoppm.exe");
    await mkdir(popplerDirectory, { recursive: true });
    await writeFile(pdftoppmPath, "fake exe");
    process.chdir(root);

    try {
      const result = await findPdfRenderer({
        platform: "win32",
        envPath: "",
        resourcesPath: path.join(root, "missing-resources"),
        execFileRunner: createVersionRunner(pdftoppmPath)
      });

      expect(result).toEqual({
        ok: true,
        value: {
          path: pdftoppmPath,
          version: "24.08.0"
        }
      });
    } finally {
      process.chdir(previousCwd);
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createVersionRunner(expectedPath: string): ExecFileRunner {
  return (file, args, _options, callback) => {
    expect(file).toBe(expectedPath);
    expect(args).toEqual(["-v"]);
    callback(null, "pdftoppm version 24.08.0", "");
  };
}
