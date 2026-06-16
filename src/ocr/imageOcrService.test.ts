import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getAnalysisCacheFilePath } from "../analysis/pdfAnalysisCache";
import {
  runImageOcrForDocument,
  type ImageOcrResult,
  type RunImageOcrForDocumentOptions
} from "./imageOcrService";
import type { OcrResult, OcrSettings, OcrStatus } from "./ocrTypes";
import type { TesseractImageOcrOutput } from "./tesseractCli";

const temporaryRoots: string[] = [];

describe("runImageOcrForDocument", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map(async (root) => {
        await rm(root, { recursive: true, force: true });
      })
    );
    temporaryRoots.length = 0;
  });

  it("refuses PDFs", async () => {
    const workspace = await createWorkspace("document.pdf");
    const result = await runImageOcrForDocument(createOptions(workspace));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_INPUT_NOT_SUPPORTED");
  });

  it("refuses unsupported extensions", async () => {
    const workspace = await createWorkspace("document.gif");
    const result = await runImageOcrForDocument(createOptions(workspace));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_INPUT_NOT_SUPPORTED");
  });

  it("refuses a document outside the scanned queue", async () => {
    const workspace = await createWorkspace("image.png");
    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        queuedDocumentPaths: [path.join(workspace.source, "other.png")]
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain("file scannée");
  });

  it("refuses a missing image", async () => {
    const workspace = await createWorkspace("image.png");
    await rm(workspace.documentPath);

    const result = await runImageOcrForDocument(createOptions(workspace));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_INPUT_NOT_FOUND");
  });

  it("refuses an image over the OCR size limit", async () => {
    const workspace = await createWorkspace("image.png");

    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        maxFileBytes: 3,
        runOcr: vi.fn(async () => createOcrOutput("texte"))
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_INPUT_TOO_LARGE");
  });

  it("refuses OCR when Tesseract is not configured and tested", async () => {
    const workspace = await createWorkspace("image.png");

    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        getStatus: async () => ({
          ok: true,
          value: {
            ...createOcrStatus(workspace),
            status: "not-configured",
            detectedVersion: null,
            error: {
              code: "OCR_ENGINE_NOT_CONFIGURED",
              message: "OCR local non configuré."
            }
          }
        })
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_ENGINE_NOT_CONFIGURED");
  });

  it("runs OCR successfully with a mocked Tesseract runner", async () => {
    const workspace = await createWorkspace("image.jpg");
    const runOcr = vi.fn(async () => createOcrOutput(" Facture garage\nTotal 42 euros "));

    const result = await runImageOcrForDocument(createOptions(workspace, { runOcr }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe("text-found");
    expect(result.ok && result.value.source).toBe("tesseract-cli");
    expect(result.ok && result.value.language).toBe("fra");
    expect(result.ok && result.value.psm).toBe(6);
    expect(result.ok && result.value.excerpt).toContain("Facture garage");
    expect(result.ok && result.value.fromCache).toBe(false);
    expect(runOcr).toHaveBeenCalledTimes(1);
  });

  it("returns an empty OCR result when Tesseract returns no exploitable text", async () => {
    const workspace = await createWorkspace("image.png");

    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        runOcr: vi.fn(async () => createOcrOutput(" \n\t "))
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe("empty");
    expect(result.ok && result.value.characterCount).toBe(0);
  });

  it("maps OCR timeout", async () => {
    const workspace = await createWorkspace("image.png");

    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        runOcr: vi.fn(async () => ({
          ok: false,
          error: {
            code: "OCR_TIMEOUT",
            message: "Timeout OCR."
          }
        }))
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_TIMEOUT");
  });

  it("maps a non-zero Tesseract exit", async () => {
    const workspace = await createWorkspace("image.png");

    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        runOcr: vi.fn(async () => ({
          ok: false,
          error: {
            code: "OCR_PROCESS_FAILED",
            message: "Erreur OCR."
          }
        }))
      })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("OCR_PROCESS_FAILED");
  });

  it("uses the cache and avoids the runner on matching fingerprint", async () => {
    const workspace = await createWorkspace("image.png");
    const firstRun = vi.fn(async () => createOcrOutput("texte cache"));
    const secondRun = vi.fn(async () => createOcrOutput("ne devrait pas tourner"));

    await runImageOcrForDocument(createOptions(workspace, { runOcr: firstRun }));
    const second = await runImageOcrForDocument(createOptions(workspace, { runOcr: secondRun }));

    expect(second.ok).toBe(true);
    expect(second.ok && second.value.fromCache).toBe(true);
    expect(second.ok && second.value.excerpt).toBe("texte cache");
    expect(secondRun).not.toHaveBeenCalled();
  });

  it("runs the runner on cache miss", async () => {
    const workspace = await createWorkspace("image.png");
    const runOcr = vi.fn(async () => createOcrOutput("nouveau texte"));

    const result = await runImageOcrForDocument(createOptions(workspace, { runOcr }));

    expect(result.ok).toBe(true);
    expect(runOcr).toHaveBeenCalledTimes(1);
  });

  it("ignores a corrupted cache and reruns OCR", async () => {
    const workspace = await createWorkspace("image.png");
    await mkdir(path.dirname(getAnalysisCacheFilePath(workspace.userData, workspace.documentPath)), {
      recursive: true
    });
    await writeFile(
      getAnalysisCacheFilePath(workspace.userData, workspace.documentPath),
      "{invalid-json",
      "utf8"
    );
    const runOcr = vi.fn(async () => createOcrOutput("texte apres cache corrompu"));

    const result = await runImageOcrForDocument(createOptions(workspace, { runOcr }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.excerpt).toContain("texte apres cache");
    expect(runOcr).toHaveBeenCalledTimes(1);
  });

  it("does not modify source or target documents", async () => {
    const workspace = await createWorkspace("image.png", "contenu image sensible");
    const targetBefore = await readdir(workspace.target);

    const result = await runImageOcrForDocument(
      createOptions(workspace, {
        runOcr: vi.fn(async () => createOcrOutput("texte"))
      })
    );

    expect(result.ok).toBe(true);
    expect(await readFile(workspace.documentPath, "utf8")).toBe("contenu image sensible");
    expect(await readdir(workspace.source)).toEqual(["image.png"]);
    expect(await readdir(workspace.target)).toEqual(targetBefore);
  });
});

async function createWorkspace(filename: string, content = "image-bytes") {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-image-ocr-"));
  temporaryRoots.push(root);

  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const userData = path.join(root, "userData");
  const documentPath = path.join(source, filename);

  await mkdir(source, { recursive: true });
  await mkdir(target, { recursive: true });
  await mkdir(userData, { recursive: true });
  await writeFile(documentPath, content, "utf8");

  return {
    root,
    source,
    target,
    userData,
    documentPath
  };
}

function createOptions(
  workspace: Awaited<ReturnType<typeof createWorkspace>>,
  overrides: Partial<RunImageOcrForDocumentOptions> = {}
): RunImageOcrForDocumentOptions {
  return {
    documentPath: workspace.documentPath,
    queuedDocumentPaths: [workspace.documentPath],
    userDataPath: workspace.userData,
    rulesCatalog: createEmptyCatalog(),
    getStatus: async () => ({
      ok: true,
      value: createOcrStatus(workspace)
    }),
    runOcr: vi.fn(async () => createOcrOutput("texte OCR")),
    now: () => new Date("2026-06-16T10:00:00.000Z"),
    getTimeMs: createTimeStepper(),
    ...overrides
  };
}

function createOcrStatus(workspace: Awaited<ReturnType<typeof createWorkspace>>): OcrStatus {
  const settings: OcrSettings = {
    tesseractPath: path.join(workspace.root, "tesseract.exe"),
    tessdataPath: path.join(workspace.root, "tessdata"),
    language: "fra",
    psm: 6,
    lastTestedAt: "2026-06-16T09:00:00.000Z",
    detectedVersion: "5.3.4"
  };

  return {
    status: "configured",
    settingsPath: path.join(workspace.userData, "config", "ocr-settings.json"),
    settings,
    tesseractPath: settings.tesseractPath,
    tessdataPath: settings.tessdataPath,
    language: settings.language,
    psm: settings.psm,
    detectedVersion: settings.detectedVersion,
    lastTestedAt: settings.lastTestedAt,
    availableLanguages: ["fra"],
    missingLanguages: [],
    message: "OCR local configuré.",
    error: null
  };
}

function createOcrOutput(stdout: string): OcrResult<TesseractImageOcrOutput> {
  return {
    ok: true,
    value: {
      stdout,
      stderr: ""
    }
  };
}

function createTimeStepper(): () => number {
  let value = 1_000;
  return () => {
    value += 123;
    return value;
  };
}

function createEmptyCatalog(): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: []
  };
}
