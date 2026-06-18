import path from "node:path";

import { normalizeNameBlock } from "../naming/documentNameV2";

export interface FilenameLikeTargetContext {
  fileName?: string;
  documentType?: string;
  dateToken?: string;
}

const DOCUMENT_EXTENSION_PATTERN = /\.(pdf|jpg|jpeg|png)$/i;
const TEST_PREFIX_PATTERN = /^t\d{2}(?:-|$)/;
const YEAR_PATTERN = /(?:^|-)(?:19|20)\d{2}(?:-|$)/;

export function isFilenameLikeTarget(
  value: string | undefined,
  context: FilenameLikeTargetContext = {}
): boolean {
  const trimmed = value?.trim() ?? "";
  const normalized = normalizeNameBlock(trimmed);
  if (!normalized) {
    return false;
  }

  const documentType = normalizeNameBlock(context.documentType);
  const normalizedBaseName = normalizeNameBlock(removeExtension(path.basename(context.fileName ?? "")));

  if (TEST_PREFIX_PATTERN.test(normalized)) {
    return true;
  }

  if (DOCUMENT_EXTENSION_PATTERN.test(trimmed)) {
    return true;
  }

  if (containsLongIdentifier(trimmed)) {
    return true;
  }

  if (documentType && normalized === documentType) {
    return true;
  }

  if (
    documentType &&
    normalized.includes(documentType) &&
    (YEAR_PATTERN.test(normalized) || TEST_PREFIX_PATTERN.test(normalized))
  ) {
    return true;
  }

  if (normalizedBaseName && normalized === normalizedBaseName) {
    return true;
  }

  const dateToken = context.dateToken?.trim();
  if (dateToken && normalizedBaseName && normalized === normalizeNameBlock(`${normalizedBaseName}-${dateToken}`)) {
    return true;
  }

  return false;
}

function removeExtension(value: string): string {
  return value.replace(/\.[^.\\/]+$/, "");
}

function containsLongIdentifier(value: string): boolean {
  const compact = value.replace(/[-_\s]/g, "");
  return /[A-Za-z0-9]{18,}/.test(compact) && /\d/.test(compact);
}
