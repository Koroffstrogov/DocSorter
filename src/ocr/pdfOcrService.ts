import type { Stats } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getAnalysisCacheFilePath,
  type PdfAnalysisCacheEntry,
  type PdfAnalysisCacheFingerprint
} from "../analysis/pdfAnalysisCache";
import {
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_EXTRACTED_TEXT_PREVIEW_CHARS,
  MAX_PDF_OCR_PAGES,
  MAX_PDF_TEXT_EXTRACTION_PAGES,
  MAX_PDF_TEXT_EXTRACTION_BYTES,
  PDF_OCR_DPI,
  PDF_OCR_PAGE_TIMEOUT_MS,
  PDF_OCR_TIMEOUT_MS
} from "../config/processingLimits";
import {
  aggregatePageTextWithinLimit,
  buildPdfTextQuality,
  createTextExcerpt,
  extractNativePdfText,
  normalizeExtractedText,
  type PdfOcrPageSummary,
  type PdfOcrSummary,
  type PdfTextExtraction,
  type PdfTextExtractionSource,
  type RawPdfTextExtraction
} from "../extraction/pdfTextExtraction";
import {
  findPdfRenderer,
  renderPdfPageToPng,
  type PdfRenderedPage,
  type PdfRendererStatus
} from "./pdfRendererCli";
import {
  getOcrStatus
} from "./tesseractConfig";
import {
  runTesseractImageOcr,
  type TesseractImageOcrOptions,
  type TesseractImageOcrOutput
} from "./tesseractCli";
import {
  createOcrError,
  ocrFailure,
  type OcrError,
  type OcrResult,
  type OcrSettings,
  type PdfOcrQuality,
  type OcrStatus
} from "./ocrTypes";

export type PdfOcrStatusKind = "ready" | "not-configured" | "error";
export type PdfOcrToolStatusKind = "ready" | "missing" | "error";

export interface PdfOcrToolStatus {
  status: PdfOcrToolStatusKind;
  path: string;
  message: string;
  version?: string;
}

export interface PdfOcrStatus {
  status: PdfOcrStatusKind;
  message: string;
  tesseract: PdfOcrToolStatus;
  tesseractSettings?: OcrSettings;
  renderer: PdfOcrToolStatus;
  error: OcrError | null;
}

export interface PdfOcrProgress {
  documentPath: string;
  page: number;
  pageIndex: number;
  pageCount: number;
  message: string;
}

export type PdfOcrResult = OcrResult<PdfTextExtraction>;

export interface RunPdfOcrForDocumentOptions {
  documentPath: string;
  queuedDocumentPaths: Iterable<string>;
  userDataPath: string;
  maxFileBytes?: number;
  maxPagesToOcr?: number;
  maxTextChars?: number;
  maxExcerptLength?: number;
  dpi?: number;
  timeoutMs?: number;
  pageTimeoutMs?: number;
  now?: () => Date;
  getTimeMs?: () => number;
  statFile?: (filePath: string) => Promise<Pick<Stats, "isFile" | "size" | "mtimeMs">>;
  getPdfOcrStatus?: (userDataPath: string) => Promise<OcrResult<PdfOcrStatus>>;
  extractNativeText?: (documentPath: string, options: { maxPages: number }) => Promise<RawPdfTextExtraction>;
  renderPage?: (options: {
    rendererPath: string;
    pdfPath: string;
    page: number;
    outputDirectory: string;
    dpi: number;
    timeoutMs: number;
  }) => Promise<OcrResult<PdfRenderedPage>>;
  runOcr?: (
    settings: OcrSettings,
    imagePath: string,
    options: TesseractImageOcrOptions
  ) => Promise<OcrResult<TesseractImageOcrOutput>>;
  makeTempDirectory?: (prefix: string) => Promise<string>;
  removeDirectory?: (directoryPath: string) => Promise<void>;
  writeCacheFile?: (filePath: string, content: string) => Promise<void>;
  makeDirectory?: (directoryPath: string) => Promise<void>;
  onProgress?: (progress: PdfOcrProgress) => void;
}

export interface PdfOcrPageResult {
  page: number;
  status: "success" | "failed" | "skipped";
  text: string;
  durationMs: number;
  warning?: string;
}

const MAX_TESSERACT_PDF_OUTPUT_BYTES = 160_000;
const PDF_OCR_STANDARD_DPI = 300;
const PDF_OCR_HIGH_DPI = 400;
const PDF_OCR_SAFETY_DPI = PDF_OCR_DPI;
const PDF_OCR_LARGE_FILE_BYTES = 15 * 1024 * 1024;
const PDF_OCR_LONG_DOCUMENT_PAGES = 10;

export interface PdfOcrDpiResolution {
  dpi: number;
  warnings: string[];
}

export async function getPdfOcrStatus(
  userDataPath: string,
  options: {
    getOcrStatus?: (userDataPath: string) => Promise<OcrResult<OcrStatus>>;
    findRenderer?: () => Promise<OcrResult<PdfRendererStatus>>;
  } = {}
): Promise<OcrResult<PdfOcrStatus>> {
  const ocrStatusResult = await (options.getOcrStatus ?? getOcrStatus)(userDataPath);
  if (!ocrStatusResult.ok) {
    return ocrStatusResult;
  }

  const ocrStatus = ocrStatusResult.value;
  const { settings: tesseractSettings, ...tesseract } = createTesseractToolStatus(ocrStatus);
  const rendererResult = await (options.findRenderer ?? (() => findPdfRenderer()))();
  const renderer = rendererResult.ok
    ? {
        status: "ready" as const,
        path: rendererResult.value.path,
        message: "Rendu PDF disponible.",
        ...(rendererResult.value.version ? { version: rendererResult.value.version } : {})
      }
    : {
        status: "missing" as const,
        path: "",
        message: rendererResult.error.message
      };

  if (tesseract.status === "ready" && renderer.status === "ready") {
    return {
      ok: true,
      value: {
        status: "ready",
        message: "OCR PDF prêt.",
        tesseract,
        tesseractSettings,
        renderer,
        error: null
      }
    };
  }

  const error = tesseract.status !== "ready"
    ? createOcrError("OCR_ENGINE_NOT_CONFIGURED", tesseract.message)
    : createOcrError("OCR_PDF_RENDERER_NOT_FOUND", renderer.message);

  return {
    ok: true,
    value: {
      status: "not-configured",
      message: error.message,
      tesseract,
      renderer,
      error
    }
  };
}

export async function runPdfOcrForDocument(
  options: RunPdfOcrForDocumentOptions
): Promise<PdfOcrResult> {
  const normalizedDocumentPath = options.documentPath.trim();
  const maxFileBytes = options.maxFileBytes ?? MAX_PDF_TEXT_EXTRACTION_BYTES;
  const statFile = options.statFile ?? stat;

  if (!normalizedDocumentPath || path.extname(normalizedDocumentPath).toLowerCase() !== ".pdf") {
    return ocrFailure("OCR_INPUT_NOT_SUPPORTED", "OCR PDF disponible uniquement pour les PDF de la file.");
  }

  if (!isDocumentInQueue(normalizedDocumentPath, options.queuedDocumentPaths)) {
    return ocrFailure("OCR_INPUT_NOT_SUPPORTED", "Document non présent dans la dernière file scannée.");
  }

  const fileCheck = await checkReadablePdfFile(normalizedDocumentPath, statFile);
  if (!fileCheck.ok) {
    return ocrFailure("OCR_INPUT_NOT_FOUND", "PDF indisponible pour OCR.");
  }

  if (fileCheck.stats.size > maxFileBytes) {
    return ocrFailure("OCR_INPUT_TOO_LARGE", "OCR non lancé : PDF trop volumineux.");
  }

  const statusResult = await (options.getPdfOcrStatus ?? getPdfOcrStatus)(options.userDataPath);
  if (!statusResult.ok) {
    return statusResult;
  }

  const status = statusResult.value;
  if (status.status !== "ready" || status.error) {
    return {
      ok: false,
      error: status.error ?? createOcrError("OCR_ENGINE_NOT_CONFIGURED", status.message)
    };
  }

  const nativeExtraction = await extractNativePdfTextForOcr(normalizedDocumentPath, options);
  if (!nativeExtraction.ok) {
    return nativeExtraction;
  }

  const pagesToOcr = selectPdfPagesForOcr(
    nativeExtraction.value,
    options.maxPagesToOcr ?? MAX_PDF_OCR_PAGES
  );
  if (pagesToOcr.pages.length === 0) {
    return ocrFailure("OCR_PDF_NO_PAGES", "Aucune page PDF à OCRiser.");
  }

  const getTimeMs = options.getTimeMs ?? Date.now;
  const timeoutMs = options.timeoutMs ?? PDF_OCR_TIMEOUT_MS;
  const dpiResolution = resolvePdfOcrDpi({
    quality: status.tesseractSettings?.pdfQuality ?? "standard",
    fileSizeBytes: fileCheck.stats.size,
    pageCountToOcr: pagesToOcr.pages.length,
    overrideDpi: options.dpi
  });
  const startedAt = getTimeMs();
  const extractedAt = (options.now ?? (() => new Date()))().toISOString();
  const tempDirectory = await (options.makeTempDirectory ?? ((prefix) => mkdtemp(prefix)))(
    path.join(os.tmpdir(), "docsorter-pdf-ocr-")
  );

  try {
    const pageResults: PdfOcrPageResult[] = [];
    const renderPage = options.renderPage ?? ((renderOptions) => renderPdfPageToPng({
      rendererPath: renderOptions.rendererPath,
      pdfPath: renderOptions.pdfPath,
      page: renderOptions.page,
      outputDirectory: renderOptions.outputDirectory,
      dpi: renderOptions.dpi,
      timeoutMs: renderOptions.timeoutMs
    }));
    const runOcr = options.runOcr ?? runTesseractImageOcr;

    for (const [index, page] of pagesToOcr.pages.entries()) {
      if (getTimeMs() - startedAt > timeoutMs) {
        for (const skippedPage of pagesToOcr.pages.slice(index)) {
          pageResults.push({
            page: skippedPage,
            status: "failed",
            text: "",
            durationMs: 0,
            warning: "OCR PDF interrompu : délai dépassé."
          });
        }
        break;
      }

      options.onProgress?.({
        documentPath: normalizedDocumentPath,
        page,
        pageIndex: index + 1,
        pageCount: pagesToOcr.pages.length,
        message: `OCR PDF page ${index + 1}/${pagesToOcr.pages.length}`
      });
      const pageStartedAt = getTimeMs();
      const rendered = await renderPage({
        rendererPath: status.renderer.path,
        pdfPath: normalizedDocumentPath,
        page,
        outputDirectory: tempDirectory,
        dpi: dpiResolution.dpi,
        timeoutMs: options.pageTimeoutMs ?? PDF_OCR_PAGE_TIMEOUT_MS
      });
      if (!rendered.ok) {
        pageResults.push({
          page,
          status: "failed",
          text: "",
          durationMs: Math.max(0, Math.round(getTimeMs() - pageStartedAt)),
          warning: rendered.error.message
        });
        continue;
      }

      const tesseractSettings = status.tesseractSettings;
      if (!tesseractSettings) {
        pageResults.push({
          page,
          status: "failed",
          text: "",
          durationMs: Math.max(0, Math.round(getTimeMs() - pageStartedAt)),
          warning: "Tesseract non configuré."
        });
        continue;
      }

      const ocr = await runOcr(tesseractSettings, rendered.value.imagePath, {
        language: tesseractSettings.language,
        psm: tesseractSettings.psm,
        timeoutMs: options.pageTimeoutMs ?? PDF_OCR_PAGE_TIMEOUT_MS,
        maxOutputBytes: MAX_TESSERACT_PDF_OUTPUT_BYTES
      } as TesseractImageOcrOptions);
      const durationMs = Math.max(0, Math.round(getTimeMs() - pageStartedAt));
      if (!ocr.ok) {
        pageResults.push({
          page,
          status: "failed",
          text: "",
          durationMs,
          warning: ocr.error.message
        });
        continue;
      }

      const text = normalizeExtractedText(ocr.value.stdout);
      pageResults.push({
        page,
        status: text ? "success" : "failed",
        text,
        durationMs,
        ...(text ? {} : { warning: "Aucun texte OCR exploitable détecté sur cette page." })
      });
    }

    const durationMs = Math.max(0, Math.round(getTimeMs() - startedAt));
    const extraction = buildPdfOcrExtraction(nativeExtraction.value, pageResults, {
      extractedAt,
      durationMs,
      renderer: "pdftoppm",
      dpi: dpiResolution.dpi,
      maxTextChars: options.maxTextChars ?? MAX_EXTRACTED_TEXT_CHARS,
      maxExcerptLength: options.maxExcerptLength ?? MAX_EXTRACTED_TEXT_PREVIEW_CHARS,
      truncatedOcrPages: pagesToOcr.truncatedPages,
      warnings: dpiResolution.warnings
    });
    const cacheWritten = await writePdfOcrCacheEntry(normalizedDocumentPath, fileCheck.stats, extraction, {
      userDataPath: options.userDataPath,
      makeDirectory: options.makeDirectory,
      writeCacheFile: options.writeCacheFile
    });

    return {
      ok: true,
      value: {
        ...extraction,
        fromCache: false,
        warnings: cacheWritten
          ? extraction.pdfOcr?.warnings ?? []
          : [...(extraction.pdfOcr?.warnings ?? []), "Cache OCR PDF non sauvegardé."]
      }
    };
  } finally {
    await (options.removeDirectory ?? ((directoryPath) => rm(directoryPath, { recursive: true, force: true })))(
      tempDirectory
    ).catch(() => undefined);
  }
}

export function resolvePdfOcrDpi(options: {
  quality: PdfOcrQuality;
  fileSizeBytes: number;
  pageCountToOcr: number;
  overrideDpi?: number;
}): PdfOcrDpiResolution {
  if (typeof options.overrideDpi === "number" && Number.isFinite(options.overrideDpi) && options.overrideDpi > 0) {
    return {
      dpi: Math.round(options.overrideDpi),
      warnings: []
    };
  }

  const requestedDpi = pdfOcrQualityDpi(options.quality);
  if (
    requestedDpi > PDF_OCR_SAFETY_DPI &&
    (options.fileSizeBytes > PDF_OCR_LARGE_FILE_BYTES ||
      options.pageCountToOcr > PDF_OCR_LONG_DOCUMENT_PAGES)
  ) {
    return {
      dpi: PDF_OCR_SAFETY_DPI,
      warnings: [
        "Qualité OCR PDF réduite à 200 DPI : PDF long ou volumineux."
      ]
    };
  }

  return {
    dpi: requestedDpi,
    warnings: []
  };
}

function pdfOcrQualityDpi(quality: PdfOcrQuality): number {
  switch (quality) {
    case "fast":
      return PDF_OCR_DPI;
    case "standard":
      return PDF_OCR_STANDARD_DPI;
    case "high":
      return PDF_OCR_HIGH_DPI;
  }
}

export function selectPdfPagesForOcr(
  rawExtraction: RawPdfTextExtraction,
  maxPages: number
): { pages: number[]; truncatedPages: number[] } {
  const quality = buildPdfTextQuality(rawExtraction);
  const pages = quality.pages
    .filter((page) => page.status === "text-empty" || page.status === "text-weak")
    .map((page) => page.page);
  const limit = Math.max(0, Math.floor(maxPages));
  return {
    pages: pages.slice(0, limit),
    truncatedPages: pages.slice(limit)
  };
}

export function buildPdfOcrExtraction(
  rawExtraction: RawPdfTextExtraction,
  pageResults: PdfOcrPageResult[],
  options: {
    extractedAt: string;
    durationMs: number;
    renderer: "pdftoppm";
    dpi: number;
    maxTextChars: number;
    maxExcerptLength: number;
    truncatedOcrPages: number[];
    warnings?: string[];
  }
): PdfTextExtraction {
  const pageResultsByPage = new Map(pageResults.map((result) => [result.page, result]));
  const mergedPageTexts = rawExtraction.pageTexts.map((nativeText, index) => {
    const page = index + 1;
    const ocr = pageResultsByPage.get(page);
    return ocr?.status === "success" && ocr.text ? ocr.text : normalizeExtractedText(nativeText);
  });
  const boundedText = aggregatePageTextWithinLimit(mergedPageTexts, options.maxTextChars);
  const text = boundedText.text;
  const excerpt = createTextExcerpt(text, options.maxExcerptLength);
  const succeededPages = pageResults
    .filter((result) => result.status === "success")
    .map((result) => result.page);
  const failedPages = pageResults
    .filter((result) => result.status === "failed")
    .map((result) => result.page);
  const nativeOkPages = buildPdfTextQuality(rawExtraction).pages
    .filter((page) => page.status === "text-ok")
    .map((page) => page.page);
  const finalTextSource = resolveFinalTextSource(nativeOkPages, succeededPages);
  const ocrCharacterCount = pageResults
    .filter((result) => result.status === "success")
    .reduce((total, result) => total + result.text.length, 0);
  const ocrQuality = scorePdfOcrQuality(pageResults, text);
  const warnings = [
    ...(options.warnings ?? []),
    ...pageResults
      .filter((result) => result.warning)
      .map((result) => `Page ${result.page} : ${result.warning}`),
    ...(options.truncatedOcrPages.length > 0
      ? [`OCR PDF limité : ${options.truncatedOcrPages.length} page(s) non traitée(s).`]
      : []),
    ...(ocrQuality.qualityLabel === "faible"
      ? ["Qualité OCR faible : vérifiez le texte extrait avant analyse IA."]
      : [])
  ];
  const pdfOcr: PdfOcrSummary = {
    requestedPages: pageResults.map((result) => result.page),
    succeededPages,
    failedPages,
    durationMs: options.durationMs,
    ocrCharacterCount,
    qualityScore: ocrQuality.qualityScore,
    qualityLabel: ocrQuality.qualityLabel,
    renderer: options.renderer,
    dpi: options.dpi,
    pages: pageResults.map((result): PdfOcrPageSummary => ({
      page: result.page,
      status: result.status,
      usefulTextChars: countUsefulTextChars(result.text),
      ...(result.warning ? { warning: result.warning } : {})
    })),
    warnings
  };

  return {
    status: text.length > 0 ? "text-found" : "empty",
    source: finalTextSource,
    pageCount: rawExtraction.pageCount,
    pagesAnalyzed: rawExtraction.pagesAnalyzed,
    text,
    characterCount: text.length,
    excerpt,
    excerptCharacterCount: excerpt.length,
    truncated: boundedText.truncated || excerpt.length < text.length,
    extractedAt: options.extractedAt,
    pdfTextQuality: buildPdfTextQuality(rawExtraction),
    finalTextSource,
    pdfOcr,
    warnings
  };
}

export function scorePdfOcrQuality(
  pageResults: PdfOcrPageResult[],
  mergedText: string
): { qualityScore: number; qualityLabel: "faible" | "correcte" | "bonne" } {
  if (pageResults.length === 0) {
    return { qualityScore: 0, qualityLabel: "faible" };
  }

  const successCount = pageResults.filter((result) => result.status === "success").length;
  const successRatio = successCount / pageResults.length;
  const usefulTextChars = countUsefulTextChars(mergedText);
  const characterScore = Math.min(40, Math.round(usefulTextChars / 12));
  const qualityScore = clampQualityScore(Math.round(successRatio * 60 + characterScore));

  return {
    qualityScore,
    qualityLabel: qualityScore >= 75 ? "bonne" : qualityScore >= 45 ? "correcte" : "faible"
  };
}

function clampQualityScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function createTesseractToolStatus(status: OcrStatus): PdfOcrToolStatus & { settings?: OcrSettings } {
  if (status.status === "configured" && !status.error && status.detectedVersion) {
    return {
      status: "ready",
      path: status.tesseractPath,
      message: "Tesseract disponible.",
      version: status.detectedVersion,
      settings: status.settings
    };
  }

  return {
    status: status.status === "error" ? "error" : "missing",
    path: status.tesseractPath,
    message: status.error?.message ?? "OCR non configuré."
  };
}

function resolveFinalTextSource(nativeOkPages: number[], succeededPages: number[]): PdfTextExtractionSource {
  if (succeededPages.length === 0) {
    return "pdf-native";
  }
  return nativeOkPages.length > 0 ? "pdf-hybrid" : "pdf-ocr";
}

async function extractNativePdfTextForOcr(
  documentPath: string,
  options: RunPdfOcrForDocumentOptions
): Promise<OcrResult<RawPdfTextExtraction>> {
  try {
    return {
      ok: true,
      value: await (options.extractNativeText ?? extractNativePdfText)(documentPath, {
        maxPages: MAX_PDF_TEXT_EXTRACTION_PAGES
      })
    };
  } catch {
    return ocrFailure("OCR_PROCESS_FAILED", "Extraction du texte PDF natif impossible.");
  }
}

async function checkReadablePdfFile(
  filePath: string,
  statFile: (filePath: string) => Promise<Pick<Stats, "isFile" | "size" | "mtimeMs">>
): Promise<{ ok: true; stats: Pick<Stats, "size" | "mtimeMs"> } | { ok: false }> {
  try {
    const fileStats = await statFile(filePath);
    if (!fileStats.isFile()) {
      return { ok: false };
    }

    return {
      ok: true,
      stats: {
        size: fileStats.size,
        mtimeMs: fileStats.mtimeMs
      }
    };
  } catch {
    return { ok: false };
  }
}

async function writePdfOcrCacheEntry(
  documentPath: string,
  stats: Pick<Stats, "size" | "mtimeMs">,
  extraction: PdfTextExtraction,
  options: {
    userDataPath: string;
    makeDirectory?: (directoryPath: string) => Promise<void>;
    writeCacheFile?: (filePath: string, content: string) => Promise<void>;
  }
): Promise<boolean> {
  const cacheFilePath = getAnalysisCacheFilePath(options.userDataPath, documentPath);
  const entry: PdfAnalysisCacheEntry = {
    version: 1,
    fingerprint: createFingerprint(documentPath, stats),
    analyzedAt: extraction.extractedAt,
    textExtraction: withoutCacheMetadata(extraction),
    error: null
  };

  try {
    if (options.makeDirectory) {
      await options.makeDirectory(path.dirname(cacheFilePath));
    } else {
      await mkdir(path.dirname(cacheFilePath), { recursive: true });
    }
    await (options.writeCacheFile ?? writeFile)(cacheFilePath, `${JSON.stringify(entry, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

function createFingerprint(
  documentPath: string,
  stats: Pick<Stats, "size" | "mtimeMs">
): PdfAnalysisCacheFingerprint {
  return {
    documentPath: path.resolve(documentPath),
    sizeBytes: stats.size,
    mtimeMs: stats.mtimeMs
  };
}

function withoutCacheMetadata(extraction: PdfTextExtraction): PdfTextExtraction {
  const { fromCache: _fromCache, ...stored } = extraction;
  return stored;
}

function isDocumentInQueue(documentPath: string, queuedDocumentPaths: Iterable<string>): boolean {
  const normalizedDocumentPath = path.resolve(documentPath);
  return new Set(Array.from(queuedDocumentPaths, (queuedPath) => path.resolve(queuedPath))).has(
    normalizedDocumentPath
  );
}

function countUsefulTextChars(value: string): number {
  return value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}
