import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getOcrSettingsPath,
  getOcrStatus,
  loadOcrSettings,
  saveOcrSettings
} from "./tesseractConfig";

const temporaryRoots: string[] = [];

describe("tesseract OCR configuration", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map(async (root) => {
        await rm(root, { recursive: true, force: true });
      })
    );
    temporaryRoots.length = 0;
  });

  it("reports a missing config as not configured without creating a file", async () => {
    const workspace = await createWorkspace();

    const status = await getOcrStatus(workspace.userData, {
      envPath: "",
      resourcesPath: workspace.resources
    });

    expect(status.ok).toBe(true);
    expect(status.ok && status.value.status).toBe("not-configured");
    expect(status.ok && status.value.error?.code).toBe("OCR_ENGINE_NOT_CONFIGURED");
    await expect(readFile(getOcrSettingsPath(workspace.userData), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("returns a clean error for invalid JSON", async () => {
    const workspace = await createWorkspace();
    await mkdir(path.dirname(getOcrSettingsPath(workspace.userData)), { recursive: true });
    await writeFile(getOcrSettingsPath(workspace.userData), "{invalid-json", "utf8");

    const settings = await loadOcrSettings(workspace.userData);

    expect(settings).toEqual({
      ok: false,
      error: {
        code: "OCR_CONFIG_READ_FAILED",
        message: "La configuration OCR n'est pas un JSON valide."
      }
    });
  });

  it("saves a valid local configuration", async () => {
    const workspace = await createWorkspace({ withLanguage: true });

    const result = await saveOcrSettings(workspace.userData, {
      tesseractPath: workspace.tesseractPath,
      tessdataPath: workspace.tessdataPath,
      language: "fra",
      psm: 3,
      pdfQuality: "high",
      imagePreprocessingMode: "standard"
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe("configured");
    const saved = JSON.parse(await readFile(getOcrSettingsPath(workspace.userData), "utf8"));
    expect(saved).toMatchObject({
      tesseractPath: workspace.tesseractPath,
      tessdataPath: workspace.tessdataPath,
      language: "fra",
      psm: 3,
      pdfQuality: "high",
      imagePreprocessingMode: "standard"
    });
  });

  it("migrates old OCR settings to standard PDF quality and standard image preprocessing", async () => {
    const workspace = await createWorkspace();
    await mkdir(path.dirname(getOcrSettingsPath(workspace.userData)), { recursive: true });
    await writeFile(getOcrSettingsPath(workspace.userData), JSON.stringify({
      tesseractPath: workspace.tesseractPath,
      tessdataPath: workspace.tessdataPath,
      language: "fra",
      psm: 3
    }), "utf8");

    const settings = await loadOcrSettings(workspace.userData);

    expect(settings.ok && settings.value.pdfQuality).toBe("standard");
    expect(settings.ok && settings.value.imagePreprocessingMode).toBe("standard");
  });

  it("refuses an absent Tesseract path", async () => {
    const workspace = await createWorkspace({ withLanguage: true });

    const result = await saveOcrSettings(workspace.userData, {
      tesseractPath: path.join(workspace.root, "missing", "tesseract.exe"),
      tessdataPath: workspace.tessdataPath,
      language: "fra",
      psm: 3
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_ENGINE_NOT_FOUND");
  });

  it("refuses an invalid image preprocessing mode", async () => {
    const workspace = await createWorkspace({ withLanguage: true });

    const result = await saveOcrSettings(workspace.userData, {
      tesseractPath: workspace.tesseractPath,
      tessdataPath: workspace.tessdataPath,
      language: "fra",
      psm: 3,
      imagePreprocessingMode: "aggressive" as never
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toBe(
      "Le prétraitement OCR image configuré est invalide."
    );
  });

  it("refuses an absent tessdata directory", async () => {
    const workspace = await createWorkspace();

    const result = await saveOcrSettings(workspace.userData, {
      tesseractPath: workspace.tesseractPath,
      tessdataPath: path.join(workspace.root, "missing-tessdata"),
      language: "fra",
      psm: 3
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_TESSDATA_NOT_FOUND");
  });

  it("detects missing fra.traineddata", async () => {
    const workspace = await createWorkspace();

    const result = await saveOcrSettings(workspace.userData, {
      tesseractPath: workspace.tesseractPath,
      tessdataPath: workspace.tessdataPath,
      language: "fra",
      psm: 3
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_LANGUAGE_DATA_MISSING");
    expect(!result.ok && result.error.message).toContain("fra.traineddata");
  });
});

async function createWorkspace(options: { withLanguage?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-ocr-config-"));
  temporaryRoots.push(root);

  const userData = path.join(root, "userData");
  const resources = path.join(root, "resources");
  const tesseractDirectory = path.join(root, "Tesseract-OCR");
  const tesseractPath = path.join(tesseractDirectory, "tesseract.exe");
  const tessdataPath = path.join(tesseractDirectory, "tessdata");

  await mkdir(tessdataPath, { recursive: true });
  await mkdir(resources, { recursive: true });
  await writeFile(tesseractPath, "", "utf8");
  if (options.withLanguage) {
    await writeFile(path.join(tessdataPath, "fra.traineddata"), "", "utf8");
  }

  return {
    root,
    userData,
    resources,
    tesseractPath,
    tessdataPath
  };
}
