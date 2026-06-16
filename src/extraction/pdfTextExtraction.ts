import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type PdfTextExtractionStatus = "text-found" | "empty";

export type PdfTextExtractionErrorCode =
  | "DOCUMENT_NOT_SELECTED"
  | "DOCUMENT_NOT_IN_QUEUE"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_NOT_PDF"
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
  now?: () => Date;
}

export interface RawPdfTextExtraction {
  pageCount: number;
  pagesAnalyzed: number;
  pageTexts: string[];
}

export interface PdfTextExtractor {
  extractText: (documentPath: string) => Promise<RawPdfTextExtraction>;
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

const defaultMaxExcerptLength = 5000;

export async function extractTextFromPdfDocument(
  options: ExtractTextFromPdfDocumentOptions,
  extractor: PdfTextExtractor = {
    extractText: extractNativePdfText
  }
): Promise<PdfTextExtractionResult> {
  const normalizedDocumentPath = options.documentPath.trim();
  if (!normalizedDocumentPath) {
    return pdfTextExtractionFailure("DOCUMENT_NOT_SELECTED");
  }

  if (!isDocumentInQueue(normalizedDocumentPath, options.queuedDocumentPaths)) {
    return pdfTextExtractionFailure("DOCUMENT_NOT_IN_QUEUE");
  }

  if (path.extname(normalizedDocumentPath).toLowerCase() !== ".pdf") {
    return pdfTextExtractionFailure("DOCUMENT_NOT_PDF");
  }

  if (!(await isReadableFile(normalizedDocumentPath))) {
    return pdfTextExtractionFailure("DOCUMENT_NOT_FOUND");
  }

  try {
    const rawExtraction = await extractor.extractText(normalizedDocumentPath);
    return {
      ok: true,
      value: buildPdfTextExtraction(rawExtraction, {
        maxExcerptLength: options.maxExcerptLength ?? defaultMaxExcerptLength,
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
    extractedAt: string;
  }
): PdfTextExtraction {
  const text = aggregatePageText(rawExtraction.pageTexts);
  const excerpt = createTextExcerpt(text, options.maxExcerptLength);

  return {
    status: text.length > 0 ? "text-found" : "empty",
    pageCount: rawExtraction.pageCount,
    pagesAnalyzed: rawExtraction.pagesAnalyzed,
    characterCount: text.length,
    excerpt,
    excerptCharacterCount: excerpt.length,
    truncated: excerpt.length < text.length,
    extractedAt: options.extractedAt
  };
}

export function aggregatePageText(pageTexts: string[]): string {
  return pageTexts.map(normalizeExtractedText).filter(Boolean).join("\n\n").trim();
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

async function extractNativePdfText(documentPath: string): Promise<RawPdfTextExtraction> {
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

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
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

async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
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
