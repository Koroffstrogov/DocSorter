import type { Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_EXTRACTED_TEXT_PREVIEW_CHARS,
  MAX_PDF_TEXT_EXTRACTION_BYTES,
  MAX_PDF_TEXT_EXTRACTION_PAGES
} from "../config/processingLimits";

export type PdfTextExtractionStatus = "text-found" | "empty";

export type PdfTextExtractionErrorCode =
  | "DOCUMENT_NOT_SELECTED"
  | "DOCUMENT_NOT_IN_QUEUE"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_NOT_PDF"
  | "PDF_TOO_LARGE_FOR_TEXT_EXTRACTION"
  | "PDF_TEXT_EMPTY"
  | "PDF_PROTECTED_OR_UNREADABLE"
  | "PDF_EXTRACTION_FAILED"
  | "UNKNOWN_ERROR";

export interface PdfTextExtraction {
  status: PdfTextExtractionStatus;
  pageCount: number;
  pagesAnalyzed: number;
  characterCount: number;
  excerpt: string;
  excerptCharacterCount: number;
  truncated: boolean;
  extractedAt: string;
}

export type PdfTextExtractionResult =
  | {
      ok: true;
      value: PdfTextExtraction;
    }
  | {
      ok: false;
      error: {
        code: PdfTextExtractionErrorCode;
        message: string;
      };
    };

export interface ExtractTextFromPdfDocumentOptions {
  documentPath: string;
  queuedDocumentPaths: Iterable<string>;
  maxExcerptLength?: number;
  maxFileBytes?: number;
  maxPages?: number;
  maxExtractedTextChars?: number;
  statFile?: (filePath: string) => Promise<Pick<Stats, "isFile" | "size">>;
  now?: () => Date;
}

export interface RawPdfTextExtraction {
  pageCount: number;
  pagesAnalyzed: number;
  pageTexts: string[];
}

export interface PdfTextExtractor {
  extractText: (
    documentPath: string,
    options: { maxPages: number }
  ) => Promise<RawPdfTextExtraction>;
}

interface PdfJsModule {
  getDocument: (options: {
    data: Uint8Array;
    disableWorker: true;
    useSystemFonts: true;
  }) => PdfDocumentLoadingTask;
}

interface PdfDocumentLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  destroy: () => Promise<void>;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
}

interface PdfPageProxy {
  getTextContent: () => Promise<PdfTextContent>;
}

interface PdfTextContent {
  items: Array<PdfTextItem | Record<string, unknown>>;
}

interface PdfTextItem {
  str: string;
}

export async function extractTextFromPdfDocument(
  options: ExtractTextFromPdfDocumentOptions,
  extractor: PdfTextExtractor = {
    extractText: extractNativePdfText
  }
): Promise<PdfTextExtractionResult> {
  const normalizedDocumentPath = options.documentPath.trim();
  const statFile = options.statFile ?? stat;
  const maxFileBytes = options.maxFileBytes ?? MAX_PDF_TEXT_EXTRACTION_BYTES;
  const maxPages = options.maxPages ?? MAX_PDF_TEXT_EXTRACTION_PAGES;
  const maxExtractedTextChars = options.maxExtractedTextChars ?? MAX_EXTRACTED_TEXT_CHARS;
  if (!normalizedDocumentPath) {
    return pdfTextExtractionFailure("DOCUMENT_NOT_SELECTED");
  }

  if (!isDocumentInQueue(normalizedDocumentPath, options.queuedDocumentPaths)) {
    return pdfTextExtractionFailure("DOCUMENT_NOT_IN_QUEUE");
  }

  if (path.extname(normalizedDocumentPath).toLowerCase() !== ".pdf") {
    return pdfTextExtractionFailure("DOCUMENT_NOT_PDF");
  }

  const fileCheck = await checkReadablePdfFile(normalizedDocumentPath, statFile);
  if (!fileCheck.ok) {
    return pdfTextExtractionFailure("DOCUMENT_NOT_FOUND");
  }

  if (fileCheck.size > maxFileBytes) {
    return pdfTextExtractionFailure("PDF_TOO_LARGE_FOR_TEXT_EXTRACTION");
  }

  try {
    const rawExtraction = await extractor.extractText(normalizedDocumentPath, { maxPages });
    return {
      ok: true,
      value: buildPdfTextExtraction(rawExtraction, {
        maxExcerptLength: options.maxExcerptLength ?? MAX_EXTRACTED_TEXT_PREVIEW_CHARS,
        maxExtractedTextChars,
        extractedAt: (options.now ?? (() => new Date()))().toISOString()
      })
    };
  } catch (error) {
    return pdfTextExtractionFailure(mapPdfExtractionError(error));
  }
}

export function buildPdfTextExtraction(
  rawExtraction: RawPdfTextExtraction,
  options: {
    maxExcerptLength: number;
    maxExtractedTextChars?: number;
    extractedAt: string;
  }
): PdfTextExtraction {
  const boundedText = aggregatePageTextWithinLimit(
    rawExtraction.pageTexts,
    options.maxExtractedTextChars ?? MAX_EXTRACTED_TEXT_CHARS
  );
  const text = boundedText.text;
  const excerpt = createTextExcerpt(text, options.maxExcerptLength);

  return {
    status: text.length > 0 ? "text-found" : "empty",
    pageCount: rawExtraction.pageCount,
    pagesAnalyzed: rawExtraction.pagesAnalyzed,
    characterCount: text.length,
    excerpt,
    excerptCharacterCount: excerpt.length,
    truncated:
      rawExtraction.pagesAnalyzed < rawExtraction.pageCount ||
      boundedText.truncated ||
      excerpt.length < text.length,
    extractedAt: options.extractedAt
  };
}

export function aggregatePageText(pageTexts: string[]): string {
  return aggregatePageTextWithinLimit(pageTexts, Number.POSITIVE_INFINITY).text;
}

export function aggregatePageTextWithinLimit(
  pageTexts: string[],
  maxLength: number
): { text: string; truncated: boolean } {
  if (Number.isNaN(maxLength) || maxLength <= 0) {
    return {
      text: "",
      truncated: pageTexts.some((pageText) => normalizeExtractedText(pageText).length > 0)
    };
  }

  const effectiveMaxLength = Number.isFinite(maxLength) ? maxLength : Number.POSITIVE_INFINITY;
  let text = "";
  let truncated = false;

  for (const pageText of pageTexts) {
    const normalizedPageText = normalizeExtractedText(pageText);
    if (!normalizedPageText) {
      continue;
    }

    const separator = text ? "\n\n" : "";
    const nextChunk = `${separator}${normalizedPageText}`;
    const remaining = effectiveMaxLength - text.length;
    if (nextChunk.length > remaining) {
      text = `${text}${nextChunk.slice(0, Math.max(0, remaining))}`.trimEnd();
      truncated = true;
      break;
    }

    text = `${text}${nextChunk}`;
  }

  return {
    text: text.trim(),
    truncated
  };
}

export function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/[ \t\f\v\r]*\n+[ \t\f\v\r]*/g, "\n")
    .trim();
}

export function createTextExcerpt(text: string, maxLength: number): string {
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return "";
  }

  return text.length <= maxLength ? text : text.slice(0, maxLength).trimEnd();
}

export function pdfTextExtractionFailure(
  code: PdfTextExtractionErrorCode
): PdfTextExtractionResult {
  return {
    ok: false,
    error: {
      code,
      message: pdfTextExtractionErrorMessage(code)
    }
  };
}

async function extractNativePdfText(
  documentPath: string,
  options: { maxPages: number }
): Promise<RawPdfTextExtraction> {
  const pdfJs = await loadPdfJs();
  const fileBuffer = await readFile(documentPath);
  const bytes = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  const loadingTask = pdfJs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useSystemFonts: true
  });

  try {
    const documentProxy = await loadingTask.promise;
    const pageTexts: string[] = [];
    const pagesToAnalyze = Math.min(
      documentProxy.numPages,
      Math.max(0, Math.floor(options.maxPages))
    );

    for (let pageNumber = 1; pageNumber <= pagesToAnalyze; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pageTexts.push(extractTextItems(textContent));
    }

    return {
      pageCount: documentProxy.numPages,
      pagesAnalyzed: pageTexts.length,
      pageTexts
    };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

async function loadPdfJs(): Promise<PdfJsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
}

function extractTextItems(textContent: PdfTextContent): string {
  return textContent.items
    .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
    .filter(Boolean)
    .join(" ");
}

async function checkReadablePdfFile(
  filePath: string,
  statFile: (filePath: string) => Promise<Pick<Stats, "isFile" | "size">>
): Promise<{ ok: true; size: number } | { ok: false }> {
  try {
    const fileStats = await statFile(filePath);
    if (!fileStats.isFile()) {
      return { ok: false };
    }

    return {
      ok: true,
      size: fileStats.size
    };
  } catch {
    return { ok: false };
  }
}

function isDocumentInQueue(documentPath: string, queuedDocumentPaths: Iterable<string>): boolean {
  const normalizedDocumentPath = path.resolve(documentPath);
  return new Set(Array.from(queuedDocumentPaths, (queuedPath) => path.resolve(queuedPath))).has(
    normalizedDocumentPath
  );
}

function mapPdfExtractionError(error: unknown): PdfTextExtractionErrorCode {
  if (!error || typeof error !== "object") {
    return "UNKNOWN_ERROR";
  }

  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";

  if (/password|encrypted/i.test(name) || /password|encrypted/i.test(message)) {
    return "PDF_PROTECTED_OR_UNREADABLE";
  }

  if (/invalid|missing|unexpected/i.test(name)) {
    return "PDF_PROTECTED_OR_UNREADABLE";
  }

  return "PDF_EXTRACTION_FAILED";
}

function pdfTextExtractionErrorMessage(code: PdfTextExtractionErrorCode): string {
  switch (code) {
    case "DOCUMENT_NOT_SELECTED":
      return "Aucun document sélectionné.";
    case "DOCUMENT_NOT_IN_QUEUE":
      return "Document non présent dans la dernière file scannée.";
    case "DOCUMENT_NOT_FOUND":
      return "Document PDF indisponible.";
    case "DOCUMENT_NOT_PDF":
      return "Extraction texte disponible uniquement pour les PDF.";
    case "PDF_TOO_LARGE_FOR_TEXT_EXTRACTION":
      return "Extraction non lancée : PDF trop volumineux.";
    case "PDF_TEXT_EMPTY":
      return "Aucun texte exploitable détecté — OCR nécessaire plus tard.";
    case "PDF_PROTECTED_OR_UNREADABLE":
      return "PDF protégé ou illisible.";
    case "PDF_EXTRACTION_FAILED":
      return "Extraction du texte PDF impossible.";
    case "UNKNOWN_ERROR":
      return "Extraction du texte PDF impossible.";
  }
}
