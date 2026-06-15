import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type SupportedDocumentExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";

export type DocumentStatus = "pending";

export type AppErrorCode =
  | "SOURCE_NOT_SELECTED"
  | "DIRECTORY_NOT_FOUND"
  | "DIRECTORY_ACCESS_DENIED"
  | "DIRECTORY_UNAVAILABLE"
  | "FILE_NOT_FOUND"
  | "FILE_ACCESS_DENIED"
  | "FILE_UNAVAILABLE"
  | "UNSUPPORTED_FILE_TYPE"
  | "PREVIEW_NOT_ALLOWED"
  | "UNKNOWN_ERROR";

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface DocumentItem {
  name: string;
  filePath: string;
  extension: SupportedDocumentExtension;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  status: DocumentStatus;
}

export interface DocumentDiscoveryResult {
  sourcePath: string;
  documents: DocumentItem[];
}

const SUPPORTED_EXTENSIONS = new Set<SupportedDocumentExtension>([".pdf", ".jpg", ".jpeg", ".png"]);

export async function discoverDocuments(sourcePath: string | undefined): Promise<Result<DocumentDiscoveryResult>> {
  const normalizedSourcePath = sourcePath?.trim();

  if (!normalizedSourcePath) {
    return failure("SOURCE_NOT_SELECTED");
  }

  try {
    const sourceStats = await stat(normalizedSourcePath);
    if (!sourceStats.isDirectory()) {
      return failure("DIRECTORY_NOT_FOUND");
    }
  } catch (error) {
    return failure(mapFileSystemError(error));
  }

  try {
    const entries = await readdir(normalizedSourcePath, { withFileTypes: true });
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) => !entry.name.startsWith("~$"))
        .filter((entry) => isSupportedExtension(path.extname(entry.name)))
        .map((entry) => toDocumentItem(normalizedSourcePath, entry.name))
    );

    return {
      ok: true,
      value: {
        sourcePath: normalizedSourcePath,
        documents: documents
          .filter((document): document is DocumentItem => Boolean(document))
          .sort(compareDocuments)
      }
    };
  } catch (error) {
    return failure(mapFileSystemError(error));
  }
}

export function isSupportedExtension(extension: string): extension is SupportedDocumentExtension {
  return SUPPORTED_EXTENSIONS.has(extension.toLowerCase() as SupportedDocumentExtension);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function compareDocuments(left: DocumentItem, right: DocumentItem): number {
  const byName = left.name.toLowerCase().localeCompare(right.name.toLowerCase(), "fr", {
    numeric: true,
    sensitivity: "base"
  });

  if (byName !== 0) {
    return byName;
  }

  return left.filePath.localeCompare(right.filePath, "fr");
}

async function toDocumentItem(sourcePath: string, name: string): Promise<DocumentItem | null> {
  const filePath = path.join(sourcePath, name);

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return null;
    }

    return {
      name,
      filePath,
      extension: path.extname(name).toLowerCase() as SupportedDocumentExtension,
      sizeBytes: fileStats.size,
      sizeLabel: formatBytes(fileStats.size),
      modifiedAt: fileStats.mtime.toISOString(),
      status: "pending"
    };
  } catch {
    return null;
  }
}

export function failure(code: AppErrorCode): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message: errorMessageByCode(code)
    }
  };
}

function errorMessageByCode(code: AppErrorCode): string {
  switch (code) {
    case "SOURCE_NOT_SELECTED":
      return "Aucun dossier source sélectionné.";
    case "DIRECTORY_NOT_FOUND":
      return "Dossier source introuvable.";
    case "DIRECTORY_ACCESS_DENIED":
      return "Accès au dossier source refusé.";
    case "DIRECTORY_UNAVAILABLE":
      return "Dossier source indisponible.";
    case "FILE_NOT_FOUND":
      return "Fichier indisponible.";
    case "FILE_ACCESS_DENIED":
      return "Accès au fichier refusé.";
    case "FILE_UNAVAILABLE":
      return "Fichier indisponible.";
    case "UNSUPPORTED_FILE_TYPE":
      return "Format de prévisualisation non supporté.";
    case "PREVIEW_NOT_ALLOWED":
      return "Aperçu non autorisé pour ce fichier.";
    case "UNKNOWN_ERROR":
      return "Impossible de lire le dossier source.";
  }
}

export function mapFileSystemError(error: unknown): AppErrorCode {
  if (!isNodeFileSystemError(error)) {
    return "UNKNOWN_ERROR";
  }

  switch (error.code) {
    case "ENOENT":
    case "ENOTDIR":
      return "DIRECTORY_NOT_FOUND";
    case "EACCES":
    case "EPERM":
      return "DIRECTORY_ACCESS_DENIED";
    case "EBUSY":
    case "ENETDOWN":
    case "ENETUNREACH":
    case "ETIMEDOUT":
      return "DIRECTORY_UNAVAILABLE";
    default:
      return "UNKNOWN_ERROR";
  }
}

function isNodeFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
