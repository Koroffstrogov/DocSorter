import { constants, type Stats } from "node:fs";
import { access, stat } from "node:fs/promises";

export type TargetDirectoryAccessErrorCode =
  | "TARGET_NOT_SELECTED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_DIRECTORY"
  | "TARGET_ACCESS_DENIED"
  | "TARGET_NOT_WRITABLE"
  | "UNKNOWN_ERROR";

export interface TargetDirectoryAccessError {
  code: TargetDirectoryAccessErrorCode;
  message: string;
}

export type TargetDirectoryAccessResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: TargetDirectoryAccessError;
    };

export type TargetDirectoryWritableChecker = (
  targetPath: string | null | undefined
) => Promise<TargetDirectoryAccessResult>;

export interface TargetDirectoryAccessOptions {
  statPath?: (targetPath: string) => Promise<Pick<Stats, "isDirectory">>;
  accessPath?: (targetPath: string, mode: number) => Promise<void>;
}

export async function checkTargetDirectoryWritable(
  targetPath: string | null | undefined,
  options: TargetDirectoryAccessOptions = {}
): Promise<TargetDirectoryAccessResult> {
  const normalizedTargetPath = targetPath?.trim() ?? "";
  if (!normalizedTargetPath) {
    return createError("TARGET_NOT_SELECTED", "Aucun dossier cible sélectionné.");
  }

  const statPath = options.statPath ?? stat;
  const accessPath = options.accessPath ?? access;

  try {
    const targetStats = await statPath(normalizedTargetPath);
    if (!targetStats.isDirectory()) {
      return createError("TARGET_NOT_DIRECTORY", "La cible sélectionnée n'est pas un dossier.");
    }
  } catch (error) {
    return createErrorFromStatError(error);
  }

  try {
    await accessPath(normalizedTargetPath, constants.W_OK);
  } catch (error) {
    return createErrorFromWritableAccessError(error);
  }

  return {
    ok: true,
    value: normalizedTargetPath
  };
}

function createError(
  code: TargetDirectoryAccessErrorCode,
  message: string
): TargetDirectoryAccessResult {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function createErrorFromStatError(error: unknown): TargetDirectoryAccessResult {
  if (isNodeError(error)) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return createError("TARGET_NOT_FOUND", "Le dossier cible n'est plus disponible.");
    }

    if (error.code === "EACCES" || error.code === "EPERM") {
      return createError("TARGET_ACCESS_DENIED", "Accès refusé au dossier cible.");
    }
  }

  return createError("UNKNOWN_ERROR", "Contrôle du dossier cible impossible.");
}

function createErrorFromWritableAccessError(error: unknown): TargetDirectoryAccessResult {
  if (isNodeError(error)) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return createError("TARGET_NOT_FOUND", "Le dossier cible n'est plus disponible.");
    }

    if (error.code === "EACCES" || error.code === "EPERM") {
      return createError(
        "TARGET_NOT_WRITABLE",
        "Le dossier cible n'est pas accessible en écriture. Vérifiez les droits Windows ou la disponibilité du NAS."
      );
    }
  }

  return createError("UNKNOWN_ERROR", "Contrôle du dossier cible impossible.");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
