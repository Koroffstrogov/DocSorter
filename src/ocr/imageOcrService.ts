import type { Stats } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getAnalysisCacheFilePath,
  type PdfAnalysisCacheFingerprint
} from "../analysis/pdfAnalysisCache";
import {
  IMAGE_OCR_TIMEOUT_MS,
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_EXTRACTED_TEXT_PREVIEW_CHARS,
  MAX_IMAGE_OCR_BYTES
} from "../config/processingLimits";
import {
  createTextExcerpt,
  normalizeExtractedText
} from "../extraction/pdfTextExtraction";
import { getOcrStatus } from "./tesseractConfig";
import {
  runTesseractImageOcr,
  type TesseractImageOcrOptions,
  type TesseractImageOcrOutput
} from "./tesseractCli";
import {
  ocrFailure,
  type ImageOcrPreprocessingMode,
  type OcrError,
  type OcrResult,
  type OcrSettings,
  type OcrStatus
} from "./ocrTypes";
import {
  prepareImageForOcr,
  type PreparedImageForOcr
} from "./imagePreprocess";

export type ImageOcrStatus = "text-found" | "empty";
export type ImageOcrSource = "tesseract-cli";

export interface ImageOcrExtraction {
  status: ImageOcrStatus;
  source: ImageOcrSource;
  language: string;
  psm: number;
  text: string;
  excerpt: string;
  characterCount: number;
  excerptCharacterCount: number;
  truncated: boolean;
  durationMs: number;
  extractedAt: string;
  fromCache: boolean;
  ocrPreprocessingApplied: boolean;
  ocrPreprocessingMode: ImageOcrPreprocessingMode;
  warnings: string[];
}

export type ImageOcrResult = OcrResult<ImageOcrExtraction>;

export interface RunImageOcrForDocumentOptions {
  documentPath: string;
  queuedDocumentPaths: Iterable<string>;
  userDataPath: string;
  forceRefresh?: boolean;
  maxFileBytes?: number;
  maxTextChars?: number;
  maxExcerptLength?: number;
  now?: () => Date;
  getTimeMs?: () => number;
  statFile?: (filePath: string) => Promise<Pick<Stats, "isFile" | "size" | "mtimeMs">>;
  getStatus?: (userDataPath: string) => Promise<OcrResult<OcrStatus>>;
  runOcr?: (
    settings: OcrSettings,
    imagePath: string,
    options: TesseractImageOcrOptions
  ) => Promise<OcrResult<TesseractImageOcrOutput>>;
  prepareImageForOcr?: (
    inputPath: string,
    options: {
      enabled: boolean;
      mode: ImageOcrPreprocessingMode;
    }
  ) => Promise<PreparedImageForOcr>;
  readCacheFile?: (filePath: string) => Promise<string | Buffer>;
  writeCacheFile?: (filePath: string, content: string) => Promise<void>;
  makeDirectory?: (directoryPath: string) => Promise<void>;
}

interface ImageOcrCacheFingerprint extends PdfAnalysisCacheFingerprint {
  engine: ImageOcrSource;
  engineVersion: string;
  language: string;
  psm: number;
  preprocessingMode: ImageOcrPreprocessingMode;
  preprocessingVersion: 1;
}

interface ImageOcrCacheEntry {
  version: 1;
  kind: "image-ocr";
  fingerprint: ImageOcrCacheFingerprint;
  analyzedAt: string;
  extraction: ImageOcrExtraction;
  error: { code: string; message: string } | null;
}

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const DEFAULT_IMAGE_OCR_PSM = 6;
const MAX_TESSERACT_IMAGE_OUTPUT_BYTES = 120_000;

export async function runImageOcrForDocument(
  options: RunImageOcrForDocumentOptions
): Promise<ImageOcrResult> {
  const normalizedDocumentPath = options.documentPath.trim();
  const maxFileBytes = options.maxFileBytes ?? MAX_IMAGE_OCR_BYTES;
  const statFile = options.statFile ?? stat;

  if (!normalizedDocumentPath) {
    return ocrFailure("OCR_INPUT_NOT_SUPPORTED", "Aucun document image sélectionné.");
  }

  if (!isDocumentInQueue(normalizedDocumentPath, options.queuedDocumentPaths)) {
    return ocrFailure(
      "OCR_INPUT_NOT_SUPPORTED",
      "Document non présent dans la dernière file scannée."
    );
  }

  if (!isSupportedImageExtension(normalizedDocumentPath)) {
    return ocrFailure(
      "OCR_INPUT_NOT_SUPPORTED",
      "OCR image disponible uniquement pour les images JPG, JPEG et PNG."
    );
  }

  const fileCheck = await checkReadableImageFile(normalizedDocumentPath, statFile);
  if (!fileCheck.ok) {
    return ocrFailure("OCR_INPUT_NOT_FOUND", "Image indisponible pour OCR.");
  }

  if (fileCheck.stats.size > maxFileBytes) {
    return ocrFailure("OCR_INPUT_TOO_LARGE", "OCR non lancé : image trop volumineuse.");
  }

  const statusResult = await (options.getStatus ?? getOcrStatus)(options.userDataPath);
  if (!statusResult.ok) {
    return statusResult;
  }

  const status = statusResult.value;
  if (status.status !== "configured" || status.error) {
    return {
      ok: false,
      error: status.error ?? {
        code: "OCR_ENGINE_NOT_CONFIGURED",
        message: "Tesseract n'est pas configuré."
      }
    };
  }

  const engineVersion = status.detectedVersion ?? status.settings.detectedVersion;
  if (!engineVersion) {
    return ocrFailure(
      "OCR_ENGINE_NOT_CONFIGURED",
      "Tesseract doit être testé dans le panneau OCR local avant l'OCR image."
    );
  }

  const language = status.settings.language || "fra";
  const psm = Number.isInteger(status.settings.psm) ? status.settings.psm : DEFAULT_IMAGE_OCR_PSM;
  const preprocessingMode = status.settings.imagePreprocessingMode ?? "standard";
  const fingerprint = createFingerprint(normalizedDocumentPath, fileCheck.stats, {
    engineVersion,
    language,
    psm,
    preprocessingMode
  });
  const cacheFilePath = getAnalysisCacheFilePath(options.userDataPath, normalizedDocumentPath);
  if (!options.forceRefresh) {
    const cached = await readCacheEntry(cacheFilePath, options.readCacheFile ?? readFile);
    if (cached && fingerprintsMatch(cached.fingerprint, fingerprint)) {
      return {
        ok: true,
        value: {
          ...normalizeCachedImageOcrExtraction(cached.extraction),
          fromCache: true
        }
      };
    }
  }

  const startedAt = (options.getTimeMs ?? Date.now)();
  const extractedAt = (options.now ?? (() => new Date()))().toISOString();
  const runOcr = options.runOcr ?? runTesseractImageOcr;
  const preparedImage = await (options.prepareImageForOcr ?? prepareImageForOcr)(
    normalizedDocumentPath,
    {
      enabled: preprocessingMode !== "none",
      mode: preprocessingMode
    }
  );
  let result: OcrResult<TesseractImageOcrOutput>;
  try {
    result = await runOcr(status.settings, preparedImage.inputForTesseract, {
      language,
      psm,
      timeoutMs: IMAGE_OCR_TIMEOUT_MS,
      maxOutputBytes: MAX_TESSERACT_IMAGE_OUTPUT_BYTES
    });
  } finally {
    await preparedImage.cleanup();
  }
  const durationMs = Math.max(0, Math.round((options.getTimeMs ?? Date.now)() - startedAt));

  if (!result.ok) {
    return result;
  }

  const extraction = buildImageOcrExtraction(result.value.stdout, {
    language,
    psm,
    durationMs,
    extractedAt,
    ocrPreprocessingApplied: preparedImage.preprocessingApplied,
    ocrPreprocessingMode: preparedImage.preprocessingMode,
    maxTextChars: options.maxTextChars ?? MAX_EXTRACTED_TEXT_CHARS,
    maxExcerptLength: options.maxExcerptLength ?? MAX_EXTRACTED_TEXT_PREVIEW_CHARS
  });
  const extractionWithWarnings = {
    ...extraction,
    warnings: [...extraction.warnings, ...preparedImage.warnings]
  };
  const cacheWritten = await writeCacheEntry(
    cacheFilePath,
    {
      version: 1,
      kind: "image-ocr",
      fingerprint,
      analyzedAt: extractedAt,
      extraction: extractionWithWarnings,
      error: null
    },
    options
  );

  return {
    ok: true,
    value: {
      ...extractionWithWarnings,
      fromCache: false,
      warnings: cacheWritten
        ? extractionWithWarnings.warnings
        : [...extractionWithWarnings.warnings, "Cache OCR non sauvegardé."]
    }
  };
}

export function buildImageOcrExtraction(
  rawText: string,
  options: {
    language: string;
    psm: number;
    durationMs: number;
    extractedAt: string;
    ocrPreprocessingApplied?: boolean;
    ocrPreprocessingMode?: ImageOcrPreprocessingMode;
    maxTextChars?: number;
    maxExcerptLength?: number;
  }
): ImageOcrExtraction {
  const maxTextChars = options.maxTextChars ?? MAX_EXTRACTED_TEXT_CHARS;
  const normalizedText = normalizeExtractedText(rawText);
  const text =
    normalizedText.length <= maxTextChars
      ? normalizedText
      : normalizedText.slice(0, maxTextChars).trimEnd();
  const excerpt = createTextExcerpt(text, options.maxExcerptLength ?? MAX_EXTRACTED_TEXT_PREVIEW_CHARS);

  return {
    status: text.length > 0 ? "text-found" : "empty",
    source: "tesseract-cli",
    language: options.language,
    psm: options.psm,
    text,
    excerpt,
    characterCount: text.length,
    excerptCharacterCount: excerpt.length,
    truncated: normalizedText.length > text.length || excerpt.length < text.length,
    durationMs: options.durationMs,
    extractedAt: options.extractedAt,
    fromCache: false,
    ocrPreprocessingApplied: options.ocrPreprocessingApplied ?? false,
    ocrPreprocessingMode: options.ocrPreprocessingMode ?? "none",
    warnings: []
  };
}

export function isSupportedImageExtension(documentPath: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(documentPath).toLowerCase());
}

async function checkReadableImageFile(
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

function createFingerprint(
  documentPath: string,
  stats: Pick<Stats, "size" | "mtimeMs">,
  options: {
    engineVersion: string;
    language: string;
    psm: number;
    preprocessingMode: ImageOcrPreprocessingMode;
  }
): ImageOcrCacheFingerprint {
  return {
    documentPath: path.resolve(documentPath),
    sizeBytes: stats.size,
    mtimeMs: stats.mtimeMs,
    engine: "tesseract-cli",
    engineVersion: options.engineVersion,
    language: options.language,
    psm: options.psm,
    preprocessingMode: options.preprocessingMode,
    preprocessingVersion: 1
  };
}

async function readCacheEntry(
  cacheFilePath: string,
  readCacheFile: (filePath: string) => Promise<string | Buffer>
): Promise<ImageOcrCacheEntry | null> {
  try {
    const raw = await readCacheFile(cacheFilePath);
    const parsed = JSON.parse(String(raw)) as unknown;
    return isImageOcrCacheEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCacheEntry(
  cacheFilePath: string,
  entry: ImageOcrCacheEntry,
  options: RunImageOcrForDocumentOptions
): Promise<boolean> {
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

function isDocumentInQueue(documentPath: string, queuedDocumentPaths: Iterable<string>): boolean {
  const normalizedDocumentPath = path.resolve(documentPath);
  return new Set(Array.from(queuedDocumentPaths, (queuedPath) => path.resolve(queuedPath))).has(
    normalizedDocumentPath
  );
}

function fingerprintsMatch(
  left: ImageOcrCacheFingerprint,
  right: ImageOcrCacheFingerprint
): boolean {
  return (
    path.resolve(left.documentPath) === path.resolve(right.documentPath) &&
    left.sizeBytes === right.sizeBytes &&
    left.mtimeMs === right.mtimeMs &&
    left.engine === right.engine &&
    left.engineVersion === right.engineVersion &&
    left.language === right.language &&
    left.psm === right.psm &&
    normalizeFingerprintPreprocessingMode(left) === normalizeFingerprintPreprocessingMode(right) &&
    normalizeFingerprintPreprocessingVersion(left) === normalizeFingerprintPreprocessingVersion(right)
  );
}

function normalizeFingerprintPreprocessingMode(
  fingerprint: Partial<ImageOcrCacheFingerprint>
): ImageOcrPreprocessingMode {
  return fingerprint.preprocessingMode === "standard" ? "standard" : "none";
}

function normalizeFingerprintPreprocessingVersion(
  fingerprint: Partial<ImageOcrCacheFingerprint>
): 1 {
  return fingerprint.preprocessingVersion === 1 ? 1 : 1;
}

function normalizeCachedImageOcrExtraction(extraction: ImageOcrExtraction): ImageOcrExtraction {
  return {
    ...extraction,
    ocrPreprocessingApplied: extraction.ocrPreprocessingApplied ?? false,
    ocrPreprocessingMode: extraction.ocrPreprocessingMode ?? "none"
  };
}

function isImageOcrCacheEntry(value: unknown): value is ImageOcrCacheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ImageOcrCacheEntry>;
  return (
    candidate.version === 1 &&
    candidate.kind === "image-ocr" &&
    isImageOcrFingerprint(candidate.fingerprint) &&
    typeof candidate.analyzedAt === "string" &&
    isImageOcrExtraction(candidate.extraction) &&
    (candidate.error === null || isCachedError(candidate.error))
  );
}

function isImageOcrFingerprint(value: unknown): value is ImageOcrCacheFingerprint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ImageOcrCacheFingerprint>;
  return (
    typeof candidate.documentPath === "string" &&
    typeof candidate.sizeBytes === "number" &&
    typeof candidate.mtimeMs === "number" &&
    candidate.engine === "tesseract-cli" &&
    typeof candidate.engineVersion === "string" &&
    typeof candidate.language === "string" &&
    typeof candidate.psm === "number" &&
    (candidate.preprocessingMode === undefined ||
      candidate.preprocessingMode === "none" ||
      candidate.preprocessingMode === "standard") &&
    (candidate.preprocessingVersion === undefined || candidate.preprocessingVersion === 1)
  );
}

function isImageOcrExtraction(value: unknown): value is ImageOcrExtraction {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ImageOcrExtraction>;
  return (
    (candidate.status === "text-found" || candidate.status === "empty") &&
    candidate.source === "tesseract-cli" &&
    typeof candidate.language === "string" &&
    typeof candidate.psm === "number" &&
    typeof candidate.text === "string" &&
    typeof candidate.excerpt === "string" &&
    typeof candidate.characterCount === "number" &&
    typeof candidate.excerptCharacterCount === "number" &&
    typeof candidate.truncated === "boolean" &&
    typeof candidate.durationMs === "number" &&
    typeof candidate.extractedAt === "string" &&
    (candidate.ocrPreprocessingApplied === undefined ||
      typeof candidate.ocrPreprocessingApplied === "boolean") &&
    (candidate.ocrPreprocessingMode === undefined ||
      candidate.ocrPreprocessingMode === "none" ||
      candidate.ocrPreprocessingMode === "standard") &&
    Array.isArray(candidate.warnings)
  );
}

function isCachedError(value: unknown): value is OcrError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}
