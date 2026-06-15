import path from "node:path";

import type { SupportedDocumentExtension } from "../documents/documentDiscovery";
import type { PreviewKind } from "./previewTypes";

export const MIN_PREVIEW_ZOOM = 0.5;
export const MAX_PREVIEW_ZOOM = 3;
export const DEFAULT_PREVIEW_ZOOM = 1;
export const PREVIEW_ZOOM_STEP = 0.25;

const PREVIEW_KIND_BY_EXTENSION: Record<SupportedDocumentExtension, PreviewKind> = {
  ".pdf": "pdf",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image"
};

export function getPreviewKind(extension: string): PreviewKind | null {
  const normalizedExtension = extension.toLowerCase() as SupportedDocumentExtension;
  return PREVIEW_KIND_BY_EXTENSION[normalizedExtension] ?? null;
}

export function getPreviewMimeType(extension: SupportedDocumentExtension): string {
  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
  }
}

export function clampPreviewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return DEFAULT_PREVIEW_ZOOM;
  }

  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, roundZoom(zoom)));
}

export function getPreviousPage(currentPage: number): number {
  return Math.max(1, Math.floor(currentPage) - 1);
}

export function getNextPage(currentPage: number, pageCount: number): number {
  return Math.min(normalizePageCount(pageCount), Math.floor(currentPage) + 1);
}

export function clampPdfPage(page: number, pageCount: number): number {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(normalizedPageCount, Math.max(1, Math.floor(page)));
}

export function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const resolvedDirectory = path.resolve(directoryPath);
  const resolvedFilePath = path.resolve(filePath);
  const relativePath = path.relative(resolvedDirectory, resolvedFilePath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function normalizePageCount(pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return 1;
  }

  return Math.floor(pageCount);
}

function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}
