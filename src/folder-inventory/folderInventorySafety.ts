import path from "node:path";

import { normalizeTargetFolderRelative } from "../naming/targetFolder";

const DEFAULT_MAX_DEPTH = 3;

export type FolderInventoryPathSafety =
  | {
      ok: true;
      relativePath: string;
      depth: number;
    }
  | {
      ok: false;
      reason: "empty" | "absolute" | "invalid" | "too-deep" | "outside-root";
    };

export function normalizeInventoryRelativePath(
  relativePath: string,
  maxDepth = DEFAULT_MAX_DEPTH
): FolderInventoryPathSafety {
  const trimmed = relativePath.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  if (path.win32.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) {
    return { ok: false, reason: "absolute" };
  }

  const normalized = normalizeTargetFolderRelative(trimmed);
  if (!normalized.ok || !normalized.value) {
    return { ok: false, reason: "invalid" };
  }

  const depth = normalized.value.split("/").length;
  if (depth > maxDepth) {
    return { ok: false, reason: "too-deep" };
  }

  return {
    ok: true,
    relativePath: normalized.value,
    depth
  };
}

export function relativePathFromRoot(
  rootPath: string,
  absolutePath: string,
  maxDepth = DEFAULT_MAX_DEPTH
): FolderInventoryPathSafety {
  const relative = path.relative(path.resolve(rootPath), path.resolve(absolutePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, reason: "outside-root" };
  }

  return normalizeInventoryRelativePath(relative.replace(/\\/g, "/"), maxDepth);
}
