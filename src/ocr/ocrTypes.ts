export type OcrErrorCode =
  | "OCR_ENGINE_NOT_CONFIGURED"
  | "OCR_ENGINE_NOT_FOUND"
  | "OCR_TESSDATA_NOT_FOUND"
  | "OCR_LANGUAGE_DATA_MISSING"
  | "OCR_VERSION_FAILED"
  | "OCR_LIST_LANGS_FAILED"
  | "OCR_PROCESS_TIMEOUT"
  | "OCR_INPUT_NOT_SUPPORTED"
  | "OCR_INPUT_NOT_FOUND"
  | "OCR_INPUT_TOO_LARGE"
  | "OCR_PDF_RENDERER_NOT_FOUND"
  | "OCR_PDF_RENDER_FAILED"
  | "OCR_PDF_NO_PAGES"
  | "OCR_TIMEOUT"
  | "OCR_PROCESS_FAILED"
  | "OCR_TEXT_EMPTY"
  | "OCR_CACHE_READ_FAILED"
  | "OCR_CACHE_WRITE_FAILED"
  | "OCR_CONFIG_READ_FAILED"
  | "OCR_CONFIG_WRITE_FAILED"
  | "UNKNOWN_ERROR";

export interface OcrError {
  code: OcrErrorCode;
  message: string;
}

export type OcrResult<T> = { ok: true; value: T } | { ok: false; error: OcrError };

export interface OcrSettings {
  tesseractPath: string;
  tessdataPath: string;
  language: string;
  psm: number;
  pdfQuality: PdfOcrQuality;
  imagePreprocessingMode: ImageOcrPreprocessingMode;
  lastTestedAt: string | null;
  detectedVersion: string | null;
}

export type OcrSettingsInput = Partial<OcrSettings>;

export type PdfOcrQuality = "fast" | "standard" | "high";
export type ImageOcrPreprocessingMode = "none" | "standard";

export type OcrStatusKind = "not-configured" | "configured" | "error";

export interface OcrStatus {
  status: OcrStatusKind;
  settingsPath: string;
  settings: OcrSettings;
  tesseractPath: string;
  tessdataPath: string;
  language: string;
  psm: number;
  detectedVersion: string | null;
  lastTestedAt: string | null;
  availableLanguages: string[];
  missingLanguages: string[];
  message: string;
  error: OcrError | null;
}

export interface OcrPathSelection {
  path: string;
}

export const DEFAULT_OCR_LANGUAGE = "fra";
export const DEFAULT_OCR_PSM = 3;
export const DEFAULT_PDF_OCR_QUALITY: PdfOcrQuality = "standard";
export const DEFAULT_IMAGE_OCR_PREPROCESSING_MODE: ImageOcrPreprocessingMode = "standard";

export function createOcrError(code: OcrErrorCode, message = ocrErrorMessage(code)): OcrError {
  return {
    code,
    message
  };
}

export function ocrFailure<T = never>(
  code: OcrErrorCode,
  message = ocrErrorMessage(code)
): OcrResult<T> {
  return {
    ok: false,
    error: createOcrError(code, message)
  };
}

export function ocrErrorMessage(code: OcrErrorCode): string {
  switch (code) {
    case "OCR_ENGINE_NOT_CONFIGURED":
      return "OCR local non configuré.";
    case "OCR_ENGINE_NOT_FOUND":
      return "Tesseract est introuvable.";
    case "OCR_TESSDATA_NOT_FOUND":
      return "Le dossier tessdata est introuvable.";
    case "OCR_LANGUAGE_DATA_MISSING":
      return "Données de langue OCR manquantes.";
    case "OCR_VERSION_FAILED":
      return "Impossible de lire la version de Tesseract.";
    case "OCR_LIST_LANGS_FAILED":
      return "Impossible de lister les langues Tesseract.";
    case "OCR_PROCESS_TIMEOUT":
      return "Le test Tesseract a dépassé le délai autorisé.";
    case "OCR_INPUT_NOT_SUPPORTED":
      return "OCR image disponible uniquement pour les images JPG, JPEG et PNG de la file.";
    case "OCR_INPUT_NOT_FOUND":
      return "Image indisponible pour OCR.";
    case "OCR_INPUT_TOO_LARGE":
      return "OCR non lancé : image trop volumineuse.";
    case "OCR_PDF_RENDERER_NOT_FOUND":
      return "Rendu PDF indisponible.";
    case "OCR_PDF_RENDER_FAILED":
      return "Rendu PDF impossible.";
    case "OCR_PDF_NO_PAGES":
      return "Aucune page PDF à OCRiser.";
    case "OCR_TIMEOUT":
      return "Timeout OCR.";
    case "OCR_PROCESS_FAILED":
      return "Erreur OCR.";
    case "OCR_TEXT_EMPTY":
      return "Aucun texte exploitable détecté.";
    case "OCR_CACHE_READ_FAILED":
      return "Cache OCR illisible.";
    case "OCR_CACHE_WRITE_FAILED":
      return "Cache OCR non sauvegardé.";
    case "OCR_CONFIG_READ_FAILED":
      return "Configuration OCR illisible.";
    case "OCR_CONFIG_WRITE_FAILED":
      return "Impossible de sauvegarder la configuration OCR.";
    case "UNKNOWN_ERROR":
      return "Erreur OCR inconnue.";
  }
}
