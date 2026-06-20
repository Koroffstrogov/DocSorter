import { stat, unlink } from "node:fs/promises";
import path from "node:path";

export type DocumentDiscardMode = "trash" | "permanent";

export type DocumentDiscardErrorCode =
  | "DOCUMENT_DISCARD_NOT_CONFIRMED"
  | "DOCUMENT_DISCARD_NO_DOCUMENT"
  | "DOCUMENT_DISCARD_INVALID_MODE";

export interface DocumentDiscardFailure {
  filePath: string;
  name: string;
  code:
    | "DOCUMENT_NOT_IN_QUEUE"
    | "DOCUMENT_NOT_FOUND"
    | "DOCUMENT_NOT_FILE"
    | "DOCUMENT_TRASH_FAILED"
    | "DOCUMENT_DELETE_FAILED";
  message: string;
}

export interface DocumentDiscardSummary {
  mode: DocumentDiscardMode;
  requestedCount: number;
  discardedFilePaths: string[];
  discardedCount: number;
  failures: DocumentDiscardFailure[];
  message: string;
}

export type DocumentDiscardResult =
  | {
      ok: true;
      value: DocumentDiscardSummary;
    }
  | {
      ok: false;
      error: {
        code: DocumentDiscardErrorCode;
        message: string;
      };
    };

export interface DiscardDocumentsOptions {
  documentPaths: string[];
  mode: DocumentDiscardMode;
  confirmed: boolean;
  queuedDocumentPaths: Iterable<string>;
  statFile?: typeof stat;
  trashItem?: (filePath: string) => Promise<void>;
  unlinkFile?: (filePath: string) => Promise<void>;
}

export async function discardDocuments(options: DiscardDocumentsOptions): Promise<DocumentDiscardResult> {
  if (!options.confirmed) {
    return {
      ok: false,
      error: {
        code: "DOCUMENT_DISCARD_NOT_CONFIRMED",
        message: "Suppression refusée : confirmation manquante."
      }
    };
  }

  if (options.mode !== "trash" && options.mode !== "permanent") {
    return {
      ok: false,
      error: {
        code: "DOCUMENT_DISCARD_INVALID_MODE",
        message: "Mode de suppression invalide."
      }
    };
  }

  const documentPaths = uniqueResolvedPaths(options.documentPaths);
  if (documentPaths.length === 0) {
    return {
      ok: false,
      error: {
        code: "DOCUMENT_DISCARD_NO_DOCUMENT",
        message: "Aucun document à supprimer."
      }
    };
  }

  const queuedPaths = new Set(Array.from(options.queuedDocumentPaths, (filePath) => path.resolve(filePath)));
  const failures: DocumentDiscardFailure[] = [];
  const discardedFilePaths: string[] = [];
  const statFile = options.statFile ?? stat;
  const discardOne = options.mode === "trash"
    ? options.trashItem
    : options.unlinkFile ?? unlink;

  for (const filePath of documentPaths) {
    const name = path.basename(filePath);
    if (!queuedPaths.has(filePath)) {
      failures.push({
        filePath,
        name,
        code: "DOCUMENT_NOT_IN_QUEUE",
        message: "Document hors de la dernière file scannée."
      });
      continue;
    }

    const checked = await checkFile(filePath, statFile);
    if (!checked.ok) {
      failures.push({
        filePath,
        name,
        code: checked.code,
        message: checked.message
      });
      continue;
    }

    if (!discardOne) {
      failures.push({
        filePath,
        name,
        code: "DOCUMENT_TRASH_FAILED",
        message: "Corbeille indisponible."
      });
      continue;
    }

    try {
      await discardOne(filePath);
      discardedFilePaths.push(filePath);
    } catch {
      failures.push({
        filePath,
        name,
        code: options.mode === "trash" ? "DOCUMENT_TRASH_FAILED" : "DOCUMENT_DELETE_FAILED",
        message: options.mode === "trash"
          ? "Mise à la corbeille impossible."
          : "Suppression définitive impossible."
      });
    }
  }

  return {
    ok: true,
    value: {
      mode: options.mode,
      requestedCount: documentPaths.length,
      discardedFilePaths,
      discardedCount: discardedFilePaths.length,
      failures,
      message: createDiscardMessage(options.mode, discardedFilePaths.length, failures.length)
    }
  };
}

function uniqueResolvedPaths(documentPaths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const documentPath of documentPaths) {
    if (typeof documentPath !== "string" || documentPath.trim().length === 0) {
      continue;
    }

    const resolved = path.resolve(documentPath.trim());
    if (seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

async function checkFile(
  filePath: string,
  statFile: typeof stat
): Promise<
  | { ok: true }
  | { ok: false; code: "DOCUMENT_NOT_FOUND" | "DOCUMENT_NOT_FILE"; message: string }
> {
  try {
    const stats = await statFile(filePath);
    if (!stats.isFile()) {
      return {
        ok: false,
        code: "DOCUMENT_NOT_FILE",
        message: "Le chemin ne pointe pas vers un fichier."
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      code: "DOCUMENT_NOT_FOUND",
      message: "Document introuvable."
    };
  }
}

function createDiscardMessage(mode: DocumentDiscardMode, discardedCount: number, failureCount: number): string {
  const action = mode === "trash" ? "mis à la corbeille" : "supprimé définitivement";
  const suffix = failureCount > 0
    ? ` ${failureCount} échec${failureCount > 1 ? "s" : ""}.`
    : "";
  return `${discardedCount} document${discardedCount > 1 ? "s" : ""} ${action}.${suffix}`;
}
