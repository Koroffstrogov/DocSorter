import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPdfOcrExtraction,
  getPdfOcrStatus,
  resolvePdfOcrDpi,
  runPdfOcrForDocument,
  scorePdfOcrQuality,
  selectPdfPagesForOcr,
  type PdfOcrStatus
} from "./pdfOcrService";
import type { OcrStatus } from "./ocrTypes";

const fixedNow = () => new Date("2026-06-20T10:00:00.000Z");

describe("pdf OCR status", () => {
  it("reports a clean disabled status when PDF renderer is absent", async () => {
    const result = await getPdfOcrStatus("C:\\userData", {
      getOcrStatus: async () => ({ ok: true, value: createConfiguredOcrStatus() }),
      findRenderer: async () => ({
        ok: false,
        error: {
          code: "OCR_PDF_RENDERER_NOT_FOUND",
          message: "Rendu PDF indisponible."
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "not-configured",
        message: "Rendu PDF indisponible.",
        tesseract: { status: "ready" },
        renderer: { status: "missing" }
      }
    });
  });
});

describe("pdf OCR service", () => {
  it("plans OCR only for empty or weak PDF pages", () => {
    const result = selectPdfPagesForOcr({
      pageCount: 3,
      pagesAnalyzed: 3,
      pageTexts: [
        Array.from({ length: 60 }, (_entry, index) => `mot${index}`).join(" "),
        "",
        "texte faible"
      ]
    }, 20);

    expect(result).toEqual({
      pages: [2, 3],
      truncatedPages: []
    });
  });

  it("merges native OK pages with OCR text", () => {
    const strongText = Array.from({ length: 60 }, (_entry, index) => `mot${index}`).join(" ");
    const extraction = buildPdfOcrExtraction(
      {
        pageCount: 2,
        pagesAnalyzed: 2,
        pageTexts: [strongText, ""]
      },
      [
        {
          page: 2,
          status: "success",
          text: "Texte OCR page deux",
          durationMs: 120
        }
      ],
      {
        extractedAt: "2026-06-20T10:00:00.000Z",
        durationMs: 150,
        renderer: "pdftoppm",
        dpi: 200,
        maxTextChars: 20_000,
        maxExcerptLength: 5_000,
        truncatedOcrPages: []
      }
    );

    expect(extraction).toMatchObject({
      status: "text-found",
      source: "pdf-hybrid",
      finalTextSource: "pdf-hybrid",
      pdfOcr: {
        requestedPages: [2],
        succeededPages: [2],
        failedPages: [],
        ocrCharacterCount: 19,
        qualityScore: expect.any(Number),
        qualityLabel: "bonne"
      }
    });
    expect(extraction.text).toContain("mot0");
    expect(extraction.text).toContain("Texte OCR page deux");
  });

  it("runs manual PDF OCR without mutating the source file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-pdf-ocr-test-"));
    const documentPath = path.join(root, "scan.pdf");
    await writeFile(documentPath, "%PDF source", "utf8");
    const before = await readFile(documentPath, "utf8");
    const beforeStats = await stat(documentPath);
    const progress: string[] = [];
    const cacheWrites: string[] = [];
    const removed: string[] = [];

    const result = await runPdfOcrForDocument({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath: path.join(root, "userData"),
      getPdfOcrStatus: async () => ({ ok: true, value: createReadyPdfOcrStatus() }),
      extractNativeText: async () => ({
        pageCount: 2,
        pagesAnalyzed: 2,
        pageTexts: [
          Array.from({ length: 60 }, (_entry, index) => `mot${index}`).join(" "),
          ""
        ]
      }),
      renderPage: async (options) => ({
        ok: true,
        value: {
          page: options.page,
          imagePath: path.join(root, `page-${options.page}.png`)
        }
      }),
      runOcr: async () => ({
        ok: true,
        value: {
          stdout: "Texte OCR page deux",
          stderr: ""
        }
      }),
      makeTempDirectory: async () => path.join(root, "tmp"),
      removeDirectory: async (directoryPath) => {
        removed.push(directoryPath);
      },
      makeDirectory: async () => undefined,
      writeCacheFile: async (_filePath, content) => {
        cacheWrites.push(content);
      },
      onProgress: (event) => {
        progress.push(event.message);
      },
      now: fixedNow,
      getTimeMs: createIncreasingClock()
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe("pdf-hybrid");
      expect(result.value.text).toContain("Texte OCR page deux");
      expect(result.value.pdfOcr?.requestedPages).toEqual([2]);
      expect(result.value.pdfOcr?.dpi).toBe(300);
      expect(result.value.pdfOcr?.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.value.pdfOcr?.qualityScore).toBeLessThanOrEqual(100);
      expect(result.value.fromCache).toBe(false);
    }
    expect(progress).toEqual(["OCR PDF page 1/1"]);
    expect(cacheWrites).toHaveLength(1);
    expect(removed).toEqual([path.join(root, "tmp")]);
    await expect(readFile(documentPath, "utf8")).resolves.toBe(before);
    expect((await stat(documentPath)).mtimeMs).toBe(beforeStats.mtimeMs);
  });

  it("keeps weak native text with a warning when one page OCR fails", () => {
    const extraction = buildPdfOcrExtraction(
      {
        pageCount: 1,
        pagesAnalyzed: 1,
        pageTexts: ["texte faible"]
      },
      [
        {
          page: 1,
          status: "failed",
          text: "",
          durationMs: 120,
          warning: "Erreur OCR."
        }
      ],
      {
        extractedAt: "2026-06-20T10:00:00.000Z",
        durationMs: 150,
        renderer: "pdftoppm",
        dpi: 200,
        maxTextChars: 20_000,
        maxExcerptLength: 5_000,
        truncatedOcrPages: []
      }
    );

    expect(extraction).toMatchObject({
      status: "text-found",
      source: "pdf-native",
      pdfOcr: {
        failedPages: [1],
        warnings: [
          "Page 1 : Erreur OCR.",
          "Qualité OCR faible : vérifiez le texte extrait avant analyse IA."
        ]
      }
    });
    expect(extraction.text).toBe("texte faible");
  });

  it("stops page processing when the global OCR PDF timeout is reached", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-pdf-ocr-timeout-test-"));
    const documentPath = path.join(root, "scan.pdf");
    await writeFile(documentPath, "%PDF source", "utf8");
    let renderCalls = 0;
    const clockValues = [0, 1_000];

    const result = await runPdfOcrForDocument({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath: path.join(root, "userData"),
      timeoutMs: 10,
      getTimeMs: () => clockValues.shift() ?? 1_000,
      getPdfOcrStatus: async () => ({ ok: true, value: createReadyPdfOcrStatus() }),
      extractNativeText: async () => ({
        pageCount: 2,
        pagesAnalyzed: 2,
        pageTexts: ["texte faible", ""]
      }),
      renderPage: async () => {
        renderCalls += 1;
        return {
          ok: true,
          value: {
            page: 1,
            imagePath: path.join(root, "page-1.png")
          }
        };
      },
      makeTempDirectory: async () => path.join(root, "tmp"),
      removeDirectory: async () => undefined,
      makeDirectory: async () => undefined,
      writeCacheFile: async () => undefined,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    expect(renderCalls).toBe(0);
    if (result.ok) {
      expect(result.value.pdfOcr?.failedPages).toEqual([1, 2]);
      expect(result.value.pdfOcr?.warnings).toContain("Page 1 : OCR PDF interrompu : délai dépassé.");
      expect(result.value.pdfOcr?.warnings).toContain("Page 2 : OCR PDF interrompu : délai dépassé.");
    }
  });

  it("resolves PDF OCR DPI from quality with safety fallback", () => {
    expect(resolvePdfOcrDpi({
      quality: "fast",
      fileSizeBytes: 1_000,
      pageCountToOcr: 1
    })).toEqual({ dpi: 200, warnings: [] });
    expect(resolvePdfOcrDpi({
      quality: "standard",
      fileSizeBytes: 1_000,
      pageCountToOcr: 1
    })).toEqual({ dpi: 300, warnings: [] });
    expect(resolvePdfOcrDpi({
      quality: "high",
      fileSizeBytes: 1_000,
      pageCountToOcr: 1
    })).toEqual({ dpi: 400, warnings: [] });
    expect(resolvePdfOcrDpi({
      quality: "high",
      fileSizeBytes: 16 * 1024 * 1024,
      pageCountToOcr: 1
    })).toEqual({
      dpi: 200,
      warnings: ["Qualité OCR PDF réduite à 200 DPI : PDF long ou volumineux."]
    });
    expect(resolvePdfOcrDpi({
      quality: "high",
      fileSizeBytes: 1_000,
      pageCountToOcr: 11
    }).dpi).toBe(200);
    expect(resolvePdfOcrDpi({
      quality: "high",
      fileSizeBytes: 16 * 1024 * 1024,
      pageCountToOcr: 11,
      overrideDpi: 350
    })).toEqual({ dpi: 350, warnings: [] });
  });

  it("scores PDF OCR quality", () => {
    expect(scorePdfOcrQuality([
      { page: 1, status: "success", text: "Texte OCR exploitable avec plusieurs mots utiles", durationMs: 20 }
    ], "Texte OCR exploitable avec plusieurs mots utiles").qualityLabel).toBe("correcte");
    expect(scorePdfOcrQuality([
      { page: 1, status: "failed", text: "", durationMs: 20, warning: "Erreur OCR." }
    ], "").qualityLabel).toBe("faible");
  });
});

function createConfiguredOcrStatus(): OcrStatus {
  return {
    status: "configured",
    settingsPath: "C:\\userData\\config\\ocr-settings.json",
    settings: {
      tesseractPath: "C:\\Tools\\tesseract.exe",
      tessdataPath: "C:\\Tools\\tessdata",
      language: "fra",
      psm: 3,
      pdfQuality: "standard",
      lastTestedAt: "2026-06-20T10:00:00.000Z",
      detectedVersion: "5.4.0"
    },
    tesseractPath: "C:\\Tools\\tesseract.exe",
    tessdataPath: "C:\\Tools\\tessdata",
    language: "fra",
    psm: 3,
    detectedVersion: "5.4.0",
    lastTestedAt: "2026-06-20T10:00:00.000Z",
    availableLanguages: ["fra"],
    missingLanguages: [],
    message: "OCR local configuré.",
    error: null
  };
}

function createReadyPdfOcrStatus(): PdfOcrStatus {
  return {
    status: "ready",
    message: "OCR PDF prêt.",
    tesseract: {
      status: "ready",
      path: "C:\\Tools\\tesseract.exe",
      message: "Tesseract disponible.",
      version: "5.4.0"
    },
    tesseractSettings: createConfiguredOcrStatus().settings,
    renderer: {
      status: "ready",
      path: "C:\\Tools\\pdftoppm.exe",
      message: "Rendu PDF disponible.",
      version: "24.02.0"
    },
    error: null
  };
}

function createIncreasingClock(): () => number {
  let value = 0;
  return () => {
    value += 50;
    return value;
  };
}
