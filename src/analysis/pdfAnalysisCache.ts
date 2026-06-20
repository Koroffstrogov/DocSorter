import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  extractTextFromPdfDocument,
  type ExtractTextFromPdfDocumentOptions,
  type PdfTextExtraction,
  type PdfTextExtractionResult
} from "../extraction/pdfTextExtraction";

type PdfTextExtractionError = Extract<PdfTextExtractionResult, { ok: false }>["error"];

export interface PdfAnalysisCacheFingerprint {
  documentPath: string;
  sizeBytes: number;
  mtimeMs: number;
  hashSha256?: string;
}

export interface PdfAnalysisCacheEntry {
  version: 1;
  fingerprint: PdfAnalysisCacheFingerprint;
  analyzedAt: string;
  textExtraction: PdfTextExtraction | null;
  error: { code: string; message: string } | null;
}

export interface ExtractPdfTextWithAnalysisCacheOptions extends ExtractTextFromPdfDocumentOptions {
  userDataPath: string;
  extractText?: (options: ExtractTextFromPdfDocumentOptions) => Promise<PdfTextExtractionResult>;
  statDocument?: (filePath: string) => Promise<Pick<Stats, "isFile" | "size" | "mtimeMs">>;
  readCacheFile?: (filePath: string) => Promise<string>;
  writeCacheFile?: (filePath: string, content: string) => Promise<void>;
  makeDirectory?: (directoryPath: string) => Promise<void>;
}

export function getAnalysisCacheDirectory(userDataPath: string): string {
  return path.join(userDataPath, "cache", "analysis");
}

export function getAnalysisCacheFilePath(userDataPath: string, documentPath: string): string {
  const key = createHash("sha256").update(path.resolve(documentPath)).digest("hex");
  return path.join(getAnalysisCacheDirectory(userDataPath), `${key}.json`);
}

export async function extractTextFromPdfDocumentWithAnalysisCache(
  options: ExtractPdfTextWithAnalysisCacheOptions
): Promise<PdfTextExtractionResult> {
  const documentPath = options.documentPath.trim();
  const cacheEligible = isCacheEligibleDocument(documentPath, options.queuedDocumentPaths);
  const fingerprint = cacheEligible
    ? await createFingerprint(documentPath, options.statDocument ?? stat)
    : null;
  const cacheFilePath = getAnalysisCacheFilePath(options.userDataPath, documentPath || "document");

  if (fingerprint) {
    const cached = await readCacheEntry(cacheFilePath, options.readCacheFile ?? readFile);
    if (cached && fingerprintsMatch(cached.fingerprint, fingerprint)) {
      if (cached.error) {
        return { ok: false, error: cached.error as PdfTextExtractionError };
      }

      if (cached.textExtraction) {
        return {
          ok: true,
          value: {
            ...cached.textExtraction,
            fromCache: true
          }
        };
      }
    }
  }

  const analyzedAt = (options.now ?? (() => new Date()))().toISOString();
  const extractText = options.extractText ?? extractTextFromPdfDocument;
  const extraction = await extractText({
    ...options,
    now: () => new Date(analyzedAt)
  });

  if (!fingerprint) {
    return extraction;
  }

  if (!extraction.ok) {
    await writeCacheEntry(cacheFilePath, {
      version: 1,
      fingerprint,
      analyzedAt,
      textExtraction: null,
      error: {
        code: extraction.error.code,
        message: extraction.error.message
      }
    }, options);
    return extraction;
  }

  await writeCacheEntry(cacheFilePath, {
    version: 1,
    fingerprint,
    analyzedAt,
    textExtraction: withoutCacheMetadata(extraction.value),
    error: null
  }, options);

  return {
    ok: true,
    value: {
      ...extraction.value,
      fromCache: false
    }
  };
}

async function createFingerprint(
  documentPath: string,
  statDocument: (filePath: string) => Promise<Pick<Stats, "isFile" | "size" | "mtimeMs">>
): Promise<PdfAnalysisCacheFingerprint | null> {
  if (!documentPath) {
    return null;
  }

  try {
    const stats = await statDocument(documentPath);
    if (!stats.isFile()) {
      return null;
    }

    return {
      documentPath: path.resolve(documentPath),
      sizeBytes: stats.size,
      mtimeMs: stats.mtimeMs
    };
  } catch {
    return null;
  }
}

async function readCacheEntry(
  cacheFilePath: string,
  readCacheFile: (filePath: string) => Promise<string | Buffer>
): Promise<PdfAnalysisCacheEntry | null> {
  try {
    const raw = await readCacheFile(cacheFilePath);
    const parsed = JSON.parse(String(raw)) as unknown;
    return isCacheEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCacheEntry(
  cacheFilePath: string,
  entry: PdfAnalysisCacheEntry,
  options: ExtractPdfTextWithAnalysisCacheOptions
): Promise<void> {
  try {
    if (options.makeDirectory) {
      await options.makeDirectory(path.dirname(cacheFilePath));
    } else {
      await mkdir(path.dirname(cacheFilePath), { recursive: true });
    }
    await (options.writeCacheFile ?? writeFile)(cacheFilePath, `${JSON.stringify(entry, null, 2)}\n`);
  } catch {
    return;
  }
}

function isCacheEligibleDocument(documentPath: string, queuedDocumentPaths: Iterable<string>): boolean {
  if (!documentPath || path.extname(documentPath).toLowerCase() !== ".pdf") {
    return false;
  }

  const normalizedDocumentPath = path.resolve(documentPath);
  return new Set(Array.from(queuedDocumentPaths, (queuedPath) => path.resolve(queuedPath))).has(
    normalizedDocumentPath
  );
}

function withoutCacheMetadata(extraction: PdfTextExtraction): PdfTextExtraction {
  const { fromCache: _fromCache, ...stored } = extraction;
  return stored;
}

function fingerprintsMatch(
  left: PdfAnalysisCacheFingerprint,
  right: PdfAnalysisCacheFingerprint
): boolean {
  return (
    path.resolve(left.documentPath) === path.resolve(right.documentPath) &&
    left.sizeBytes === right.sizeBytes &&
    left.mtimeMs === right.mtimeMs &&
    (left.hashSha256 ?? "") === (right.hashSha256 ?? "")
  );
}

function isCacheEntry(value: unknown): value is PdfAnalysisCacheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PdfAnalysisCacheEntry>;
  return (
    candidate.version === 1 &&
    isFingerprint(candidate.fingerprint) &&
    typeof candidate.analyzedAt === "string" &&
    (candidate.textExtraction === null || isTextExtraction(candidate.textExtraction)) &&
    (candidate.error === null || isCachedError(candidate.error))
  );
}

function isFingerprint(value: unknown): value is PdfAnalysisCacheFingerprint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PdfAnalysisCacheFingerprint>;
  return (
    typeof candidate.documentPath === "string" &&
    typeof candidate.sizeBytes === "number" &&
    typeof candidate.mtimeMs === "number"
  );
}

function isTextExtraction(value: unknown): value is PdfTextExtraction {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PdfTextExtraction>;
  return (
    (candidate.status === "text-found" || candidate.status === "empty") &&
    typeof candidate.excerpt === "string" &&
    typeof candidate.extractedAt === "string" &&
    (candidate.pdfTextQuality === undefined || isPdfTextQuality(candidate.pdfTextQuality))
  );
}

function isPdfTextQuality(value: unknown): value is PdfTextExtraction["pdfTextQuality"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as NonNullable<PdfTextExtraction["pdfTextQuality"]>;
  return (
    typeof candidate.pageCount === "number" &&
    typeof candidate.nativeTextChars === "number" &&
    typeof candidate.usefulTextChars === "number" &&
    Array.isArray(candidate.pages) &&
    (
      candidate.decision === "native-ok" ||
      candidate.decision === "ocr-recommended" ||
      candidate.decision === "hybrid-ocr-recommended" ||
      candidate.decision === "unknown"
    ) &&
    typeof candidate.reason === "string" &&
    Array.isArray(candidate.warnings)
  );
}

function isCachedError(value: unknown): value is { code: string; message: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}
