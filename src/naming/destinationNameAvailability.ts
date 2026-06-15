import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

export type DestinationAvailabilityErrorCode =
  | "TARGET_NOT_SELECTED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_DIRECTORY"
  | "TARGET_ACCESS_DENIED"
  | "INVALID_FILENAME"
  | "TOO_MANY_COLLISIONS"
  | "UNKNOWN_ERROR";

export interface DestinationAvailabilityError {
  code: DestinationAvailabilityErrorCode;
  message: string;
}

export interface DestinationAvailability {
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
  targetPath: string | null | undefined,
  proposedFilename: string
): Promise<DestinationAvailabilityResult> {
  if (!targetPath) {
    return createError(
      "TARGET_NOT_SELECTED",
      "Aucun dossier cible sélectionné pour contrôler le nom final."
    );
  }

  const filenameValidation = validateDestinationFilename(proposedFilename);
  if (!filenameValidation.ok) {
    return filenameValidation;
  }

  const targetDirectory = await validateTargetDirectory(targetPath);
  if (!targetDirectory.ok) {
    return targetDirectory;
  }

  let existingNames: string[];
  try {
    existingNames = await readdir(targetDirectory.value);
  } catch (error) {
    return createErrorFromFsError(error);
  }

  return checkDestinationNameAvailabilityAgainstNames(
    targetDirectory.value,
    filenameValidation.value,
    existingNames
  );
}

export function checkDestinationNameAvailabilityAgainstNames(
  targetPath: string,
  proposedFilename: string,
  existingNames: Iterable<string>
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

async function validateTargetDirectory(
  targetPath: string
): Promise<
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: DestinationAvailabilityError;
    }
> {
  try {
    const targetStats = await stat(targetPath);
    if (!targetStats.isDirectory()) {
      return createError("TARGET_NOT_DIRECTORY", "La cible sélectionnée n'est pas un dossier.");
    }

    await access(targetPath, constants.R_OK);
    return {
      ok: true,
      value: targetPath
    };
  } catch (error) {
    return createErrorFromFsError(error);
  }
}

function isReservedWindowsName(fileName: string): boolean {
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  return RESERVED_WINDOWS_NAMES.has(baseName.toUpperCase());
}

function createError(
  code: DestinationAvailabilityErrorCode,
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
