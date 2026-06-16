import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  checkTargetDirectoryWritable,
  type TargetDirectoryWritableChecker
} from "../filesystem/targetDirectoryAccess";
import {
  resolveTargetFolder,
  type TargetFolderErrorCode
} from "./targetFolder";

export type DestinationAvailabilityErrorCode =
  | "TARGET_NOT_SELECTED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_DIRECTORY"
  | "TARGET_ACCESS_DENIED"
  | "TARGET_NOT_WRITABLE"
  | "TARGET_FOLDER_INVALID"
  | "TARGET_FOLDER_NOT_FOUND"
  | "TARGET_FOLDER_NOT_DIRECTORY"
  | "INVALID_FILENAME"
  | "TOO_MANY_COLLISIONS"
  | "UNKNOWN_ERROR";

export interface DestinationAvailabilityError {
  code: DestinationAvailabilityErrorCode;
  message: string;
}

export interface DestinationAvailability {
  targetRootPath: string;
  targetFolder: string;
  status: "available" | "collision";
  targetPath: string;
  proposedFilename: string;
  finalFilename: string;
  finalPath: string;
  alternativeFilename: string | null;
  message: string;
}

export type DestinationAvailabilityResult =
  | {
      ok: true;
      value: DestinationAvailability;
    }
  | DestinationAvailabilityFailure;

type DestinationAvailabilityFailure = {
  ok: false;
  error: DestinationAvailabilityError;
};

export interface CheckDestinationNameAvailabilityOptions {
  checkTargetDirectoryWritable?: TargetDirectoryWritableChecker;
  targetFolder?: string;
}

const MAX_FILENAME_LENGTH = 255;
const MAX_COLLISION_SUFFIX = 99;
const WINDOWS_FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
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

export async function checkDestinationNameAvailability(
  targetRootPath: string | null | undefined,
  proposedFilename: string,
  options: CheckDestinationNameAvailabilityOptions = {}
): Promise<DestinationAvailabilityResult> {
  const filenameValidation = validateDestinationFilename(proposedFilename);
  if (!filenameValidation.ok) {
    return filenameValidation;
  }

  const targetFolder = await resolveTargetFolder(
    targetRootPath,
    options.targetFolder ?? "",
    {
      checkTargetDirectoryWritable:
        options.checkTargetDirectoryWritable ?? checkTargetDirectoryWritable
    }
  );
  if (!targetFolder.ok) {
    return createTargetFolderResolutionError(targetFolder.error.code, targetFolder.error.message);
  }

  let existingNames: string[];
  try {
    existingNames = await readdir(targetFolder.value.targetPath);
  } catch (error) {
    return createErrorFromFsError(error);
  }

  return checkDestinationNameAvailabilityAgainstNames(
    targetFolder.value.targetPath,
    filenameValidation.value,
    existingNames,
    {
      targetRootPath: targetFolder.value.targetRootPath,
      targetFolder: targetFolder.value.targetFolder
    }
  );
}

export function checkDestinationNameAvailabilityAgainstNames(
  targetPath: string,
  proposedFilename: string,
  existingNames: Iterable<string>,
  options: {
    targetRootPath?: string;
    targetFolder?: string;
  } = {}
): DestinationAvailabilityResult {
  const filenameValidation = validateDestinationFilename(proposedFilename);
  if (!filenameValidation.ok) {
    return filenameValidation;
  }

  const availableFilename = resolveAvailableFilename(filenameValidation.value, existingNames);
  if (!availableFilename) {
    return createError(
      "TOO_MANY_COLLISIONS",
      "Trop de noms similaires existent déjà dans le dossier cible."
    );
  }

  const hasCollision = availableFilename !== filenameValidation.value;
  return {
    ok: true,
    value: {
      status: hasCollision ? "collision" : "available",
      targetRootPath: options.targetRootPath ?? targetPath,
      targetFolder: options.targetFolder ?? "",
      targetPath,
      proposedFilename: filenameValidation.value,
      finalFilename: availableFilename,
      finalPath: path.join(targetPath, availableFilename),
      alternativeFilename: hasCollision ? availableFilename : null,
      message: hasCollision
        ? "Nom déjà utilisé dans la cible. Un suffixe disponible est proposé."
        : "Nom disponible dans la cible."
    }
  };
}

export function resolveAvailableFilename(
  proposedFilename: string,
  existingNames: Iterable<string>
): string | null {
  const filenameValidation = validateDestinationFilename(proposedFilename);
  if (!filenameValidation.ok) {
    return null;
  }

  const existing = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
  if (!existing.has(filenameValidation.value.toLowerCase())) {
    return filenameValidation.value;
  }

  const extension = path.extname(filenameValidation.value);
  const baseName = extension
    ? filenameValidation.value.slice(0, -extension.length)
    : filenameValidation.value;

  for (let suffix = 2; suffix <= MAX_COLLISION_SUFFIX; suffix += 1) {
    const candidate = `${baseName}_${suffix}${extension}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return null;
}

export function validateDestinationFilename(
  proposedFilename: string
):
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: DestinationAvailabilityError;
    } {
  if (typeof proposedFilename !== "string") {
    return createError("INVALID_FILENAME", "Nom proposé invalide.");
  }

  if (!proposedFilename || proposedFilename !== proposedFilename.trim()) {
    return createError("INVALID_FILENAME", "Nom proposé invalide ou vide.");
  }

  if (proposedFilename.length > MAX_FILENAME_LENGTH) {
    return createError("INVALID_FILENAME", "Nom proposé trop long pour Windows.");
  }

  if (
    proposedFilename.includes("..") ||
    proposedFilename.includes("/") ||
    proposedFilename.includes("\\") ||
    path.win32.isAbsolute(proposedFilename) ||
    path.posix.isAbsolute(proposedFilename) ||
    path.win32.basename(proposedFilename) !== proposedFilename ||
    path.posix.basename(proposedFilename) !== proposedFilename
  ) {
    return createError("INVALID_FILENAME", "Le nom proposé doit être un nom de fichier simple.");
  }

  if (WINDOWS_FORBIDDEN_CHARS.test(proposedFilename) || /[. ]$/.test(proposedFilename)) {
    return createError("INVALID_FILENAME", "Nom proposé incompatible avec Windows.");
  }

  if (isReservedWindowsName(proposedFilename)) {
    return createError("INVALID_FILENAME", "Nom proposé réservé par Windows.");
  }

  return {
    ok: true,
    value: proposedFilename
  };
}

function isReservedWindowsName(fileName: string): boolean {
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  return RESERVED_WINDOWS_NAMES.has(baseName.toUpperCase());
}

function createError(
  code: DestinationAvailabilityErrorCode | TargetFolderErrorCode,
  message: string
): DestinationAvailabilityFailure {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function createTargetFolderResolutionError(
  code: TargetFolderErrorCode,
  message: string
): DestinationAvailabilityFailure {
  if (code === "TARGET_NOT_WRITABLE") {
    return createError("TARGET_NOT_WRITABLE", "Contrôle cible indisponible : écriture refusée.");
  }

  return createError(code, message);
}

function createErrorFromFsError(error: unknown): DestinationAvailabilityFailure {
  if (isNodeError(error)) {
    if (error.code === "ENOENT") {
      return createError("TARGET_NOT_FOUND", "Le dossier cible sélectionné n'existe plus.");
    }

    if (error.code === "EACCES" || error.code === "EPERM") {
      return createError("TARGET_ACCESS_DENIED", "Accès refusé au dossier cible.");
    }
  }

  return createError("UNKNOWN_ERROR", "Contrôle de destination impossible.");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
