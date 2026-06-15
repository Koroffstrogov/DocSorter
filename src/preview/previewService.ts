import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  failure,
  isSupportedExtension,
  mapFileSystemError,
  type AppErrorCode
} from "../documents/documentDiscovery";
import {
  getPreviewKind,
  getPreviewMimeType,
  isPathInsideDirectory
} from "./previewGuards";
import type { PreviewDataResult } from "./previewTypes";

export interface PreviewAccessContext {
  sourcePath: string | null;
  queuedDocumentPaths: ReadonlySet<string>;
}

export async function getPreviewData(
  documentPath: string | undefined,
  context: PreviewAccessContext
): Promise<PreviewDataResult> {
  const normalizedDocumentPath = documentPath?.trim();

  if (!context.sourcePath) {
    return failure("SOURCE_NOT_SELECTED");
  }

  if (!normalizedDocumentPath || !context.queuedDocumentPaths.has(path.resolve(normalizedDocumentPath))) {
    return failure("PREVIEW_NOT_ALLOWED");
  }

  if (!isPathInsideDirectory(normalizedDocumentPath, context.sourcePath)) {
    return failure("PREVIEW_NOT_ALLOWED");
  }

  const extension = path.extname(normalizedDocumentPath).toLowerCase();
  if (!isSupportedExtension(extension)) {
    return failure("UNSUPPORTED_FILE_TYPE");
  }

  const kind = getPreviewKind(extension);
  if (!kind) {
    return failure("UNSUPPORTED_FILE_TYPE");
  }

  try {
    const fileStats = await stat(normalizedDocumentPath);
    if (!fileStats.isFile()) {
      return failure("FILE_NOT_FOUND");
    }
  } catch (error) {
    return failure(mapPreviewFileSystemError(error));
  }

  try {
    const fileBuffer = await readFile(normalizedDocumentPath);
    const bytes = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );

    return {
      ok: true,
      value: {
        kind,
        filePath: normalizedDocumentPath,
        extension,
        mimeType: getPreviewMimeType(extension),
        bytes
      }
    };
  } catch (error) {
    return failure(mapPreviewFileSystemError(error));
  }
}

function mapPreviewFileSystemError(error: unknown): AppErrorCode {
  const mappedError = mapFileSystemError(error);

  switch (mappedError) {
    case "DIRECTORY_NOT_FOUND":
      return "FILE_NOT_FOUND";
    case "DIRECTORY_ACCESS_DENIED":
      return "FILE_ACCESS_DENIED";
    case "DIRECTORY_UNAVAILABLE":
      return "FILE_UNAVAILABLE";
    case "SOURCE_NOT_SELECTED":
    case "UNKNOWN_ERROR":
    case "FILE_NOT_FOUND":
    case "FILE_ACCESS_DENIED":
    case "FILE_UNAVAILABLE":
    case "UNSUPPORTED_FILE_TYPE":
    case "PREVIEW_NOT_ALLOWED":
      return mappedError;
  }
}
