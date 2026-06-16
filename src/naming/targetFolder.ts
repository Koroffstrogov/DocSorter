import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  checkTargetDirectoryWritable,
  type TargetDirectoryWritableChecker
} from "../filesystem/targetDirectoryAccess";

export type TargetFolderErrorCode =
  | "TARGET_NOT_SELECTED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_DIRECTORY"
  | "TARGET_ACCESS_DENIED"
  | "TARGET_NOT_WRITABLE"
  | "TARGET_FOLDER_INVALID"
  | "TARGET_FOLDER_NOT_FOUND"
  | "TARGET_FOLDER_NOT_DIRECTORY"
  | "UNKNOWN_ERROR";

export interface TargetFolderError {
  code: TargetFolderErrorCode;
  message: string;
}

export interface TargetFolderResolution {
  targetRootPath: string;
  targetFolder: string;
  targetPath: string;
  exists: boolean;
}

export interface TargetFolderList {
  targetRootPath: string;
  folders: string[];
}

export interface TargetFolderCreation {
  targetRootPath: string;
  targetFolder: string;
  targetPath: string;
  exists: boolean;
  created: boolean;
  message: string;
}

export type TargetFolderResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: TargetFolderError;
    };

export interface TargetFolderOptions {
  checkTargetDirectoryWritable?: TargetDirectoryWritableChecker;
  makeDirectory?: (targetPath: string) => Promise<void>;
}

const MAX_TARGET_FOLDER_DEPTH = 3;
const WINDOWS_FORBIDDEN_SEGMENT_CHARS = /[<>:"|?*\u0000-\u001F]/;
const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

export function normalizeTargetFolderRelative(
  value: string
): TargetFolderResult<string> {
  if (typeof value !== "string") {
    return createError("TARGET_FOLDER_INVALID", "Sous-dossier cible invalide.");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      ok: true,
      value: ""
    };
  }

  if (
    path.win32.isAbsolute(trimmed) ||
    path.posix.isAbsolute(trimmed) ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    return createError("TARGET_FOLDER_INVALID", "Le sous-dossier cible doit être relatif.");
  }

  const normalizedSeparators = trimmed.replace(/\\/g, "/");
  const segments = normalizedSeparators.split("/").map((segment) => segment.trim());
  if (segments.some((segment) => !segment)) {
    return createError("TARGET_FOLDER_INVALID", "Sous-dossier cible invalide.");
  }

  if (segments.length > MAX_TARGET_FOLDER_DEPTH) {
    return createError(
      "TARGET_FOLDER_INVALID",
      "Sous-dossier cible trop profond : maximum 3 niveaux."
    );
  }

  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("..") ||
      WINDOWS_FORBIDDEN_SEGMENT_CHARS.test(segment) ||
      /[. ]$/.test(segment) ||
      isReservedWindowsName(segment)
    ) {
      return createError("TARGET_FOLDER_INVALID", "Sous-dossier cible invalide.");
    }
  }

  return {
    ok: true,
    value: segments.join("/")
  };
}

export async function resolveTargetFolder(
  targetRootPath: string | null | undefined,
  targetFolder: string,
  options: TargetFolderOptions = {}
): Promise<TargetFolderResult<TargetFolderResolution>> {
  const base = await resolveTargetFolderBase(targetRootPath, targetFolder, options);
  if (!base.ok) {
    return base;
  }

  const targetAccess = await checkWritable(base.value.targetPath, options);
  if (!targetAccess.ok) {
    return mapFolderAccessError(targetAccess.error.code);
  }

  return {
    ok: true,
    value: {
      ...base.value,
      exists: true
    }
  };
}

export async function resolveTargetFolderForCreation(
  targetRootPath: string | null | undefined,
  targetFolder: string,
  options: TargetFolderOptions = {}
): Promise<TargetFolderResult<TargetFolderResolution>> {
  const base = await resolveTargetFolderBase(targetRootPath, targetFolder, options);
  if (!base.ok) {
    return base;
  }

  const existingState = await getExistingDirectoryState(base.value.targetPath);
  if (existingState === "file") {
    return createError("TARGET_FOLDER_NOT_DIRECTORY", "Le sous-dossier cible n'est pas un dossier.");
  }

  return {
    ok: true,
    value: {
      ...base.value,
      exists: existingState === "directory"
    }
  };
}

export async function listTargetSubdirectories(
  targetRootPath: string | null | undefined,
  options: TargetFolderOptions = {}
): Promise<TargetFolderResult<TargetFolderList>> {
  const rootAccess = await checkWritable(targetRootPath, options);
  if (!rootAccess.ok) {
    return mapRootAccessError(rootAccess.error.code);
  }

  const folders: string[] = [];
  await collectSubdirectories(rootAccess.value, "", 1, folders);

  return {
    ok: true,
    value: {
      targetRootPath: rootAccess.value,
      folders: folders.sort((left, right) => left.localeCompare(right, "fr"))
    }
  };
}

export async function createTargetSubdirectory(
  targetRootPath: string | null | undefined,
  targetFolder: string,
  options: TargetFolderOptions = {}
): Promise<TargetFolderResult<TargetFolderCreation>> {
  const rootAccess = await checkWritable(targetRootPath, options);
  if (!rootAccess.ok) {
    return mapRootAccessError(rootAccess.error.code);
  }

  const resolution = await resolveTargetFolderForCreation(rootAccess.value, targetFolder, options);
  if (!resolution.ok) {
    return resolution;
  }

  if (!resolution.value.targetFolder) {
    return {
      ok: true,
      value: {
        ...resolution.value,
        created: false,
        message: "Classement à la racine cible."
      }
    };
  }

  if (resolution.value.exists) {
    return {
      ok: true,
      value: {
        ...resolution.value,
        created: false,
        message: "Le dossier cible existe déjà."
      }
    };
  }

  try {
    await (options.makeDirectory ?? defaultMakeDirectory)(resolution.value.targetPath);
  } catch {
    return createError("UNKNOWN_ERROR", "Création du sous-dossier cible impossible.");
  }

  const finalAccess = await checkWritable(resolution.value.targetPath, options);
  if (!finalAccess.ok) {
    return mapFolderAccessError(finalAccess.error.code);
  }

  return {
    ok: true,
    value: {
      ...resolution.value,
      exists: true,
      created: true,
      message: "Dossier cible créé."
    }
  };
}

async function resolveTargetFolderBase(
  targetRootPath: string | null | undefined,
  targetFolder: string,
  options: TargetFolderOptions
): Promise<TargetFolderResult<TargetFolderResolution>> {
  const rootAccess = await checkWritable(targetRootPath, options);
  if (!rootAccess.ok) {
    return mapRootAccessError(rootAccess.error.code);
  }

  const normalized = normalizeTargetFolderRelative(targetFolder);
  if (!normalized.ok) {
    return normalized;
  }

  const targetPath = normalized.value
    ? path.resolve(rootAccess.value, ...normalized.value.split("/"))
    : rootAccess.value;

  if (normalized.value && !isStrictSubPath(rootAccess.value, targetPath)) {
    return createError("TARGET_FOLDER_INVALID", "Le sous-dossier cible doit rester sous la racine.");
  }

  return {
    ok: true,
    value: {
      targetRootPath: rootAccess.value,
      targetFolder: normalized.value,
      targetPath,
      exists: false
    }
  };
}

async function checkWritable(
  targetPath: string | null | undefined,
  options: TargetFolderOptions
) {
  return (options.checkTargetDirectoryWritable ?? checkTargetDirectoryWritable)(targetPath);
}

async function collectSubdirectories(
  rootPath: string,
  relativePath: string,
  depth: number,
  folders: string[]
): Promise<void> {
  if (depth > MAX_TARGET_FOLDER_DEPTH) {
    return;
  }

  const absolutePath = relativePath ? path.join(rootPath, ...relativePath.split("/")) : rootPath;
  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const normalized = normalizeTargetFolderRelative(candidate);
    if (!normalized.ok) {
      continue;
    }

    folders.push(normalized.value);
    await collectSubdirectories(rootPath, normalized.value, depth + 1, folders);
  }
}

async function getExistingDirectoryState(
  targetPath: string
): Promise<"missing" | "directory" | "file"> {
  try {
    const stats = await stat(targetPath);
    return stats.isDirectory() ? "directory" : "file";
  } catch {
    return "missing";
  }
}

async function defaultMakeDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

function isStrictSubPath(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function isReservedWindowsName(segment: string): boolean {
  return RESERVED_WINDOWS_NAMES.has(segment.toUpperCase());
}

function mapRootAccessError(code: string): TargetFolderResult<never> {
  switch (code) {
    case "TARGET_NOT_SELECTED":
      return createError("TARGET_NOT_SELECTED", "Aucune racine cible sélectionnée.");
    case "TARGET_NOT_FOUND":
      return createError("TARGET_NOT_FOUND", "La racine cible n'existe plus.");
    case "TARGET_NOT_DIRECTORY":
      return createError("TARGET_NOT_DIRECTORY", "La racine cible n'est pas un dossier.");
    case "TARGET_ACCESS_DENIED":
      return createError("TARGET_ACCESS_DENIED", "Accès refusé à la racine cible.");
    case "TARGET_NOT_WRITABLE":
      return createError("TARGET_NOT_WRITABLE", "La racine cible n'est pas accessible en écriture.");
    default:
      return createError("UNKNOWN_ERROR", "Contrôle de la racine cible impossible.");
  }
}

function mapFolderAccessError(code: string): TargetFolderResult<never> {
  switch (code) {
    case "TARGET_NOT_FOUND":
      return createError("TARGET_FOLDER_NOT_FOUND", "Le sous-dossier cible n'existe pas.");
    case "TARGET_NOT_DIRECTORY":
      return createError("TARGET_FOLDER_NOT_DIRECTORY", "Le sous-dossier cible n'est pas un dossier.");
    case "TARGET_ACCESS_DENIED":
      return createError("TARGET_ACCESS_DENIED", "Accès refusé au sous-dossier cible.");
    case "TARGET_NOT_WRITABLE":
      return createError("TARGET_NOT_WRITABLE", "Le sous-dossier cible n'est pas accessible en écriture.");
    default:
      return mapRootAccessError(code);
  }
}

function createError(
  code: TargetFolderErrorCode,
  message: string
): TargetFolderResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}
