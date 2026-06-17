export type DatePrecision =
  | "day"
  | "month"
  | "year"
  | "school-year"
  | "approximate-year"
  | "unknown";

export type DateRole =
  | "document"
  | "issue"
  | "period"
  | "effective"
  | "signature"
  | "scan"
  | "file"
  | "unknown";

export type DateSource =
  | "text"
  | "ocr"
  | "file-name"
  | "metadata"
  | "manual"
  | "fallback";

export interface DateCandidate {
  token: string;
  precision: DatePrecision;
  role: DateRole;
  source: DateSource;
  confidence: number;
  reasons: string[];
  warnings: string[];
}

export interface SelectedDateToken {
  dateToken: string;
  selected?: DateCandidate;
  candidates: DateCandidate[];
  confidence: number;
  reasons: string[];
  warnings: string[];
}

export interface BuildDateCandidatesInput {
  fileName?: string;
  extractedText?: string;
  ocrText?: string;
  metadataText?: string;
  documentType?: string;
  fileCreatedAt?: string;
  fileModifiedAt?: string;
  pdfCreatedAt?: string;
  pdfModifiedAt?: string;
  exifTakenAt?: string;
  scanDate?: string;
}

export interface DateSelectionContext {
  documentType?: string;
}
