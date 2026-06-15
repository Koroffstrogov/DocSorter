import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { ActionJournalEntry, UndoableClassificationAction } from "./historyTypes";

export interface ActionJournalWriteResult {
  ok: true;
}

export interface ActionJournalWriteFailure {
  ok: false;
  error: {
    code: "JOURNAL_WRITE_FAILED";
    message: string;
  };
}

export type ActionJournalResult = ActionJournalWriteResult | ActionJournalWriteFailure;

export type ActionJournalReadErrorCode = "JOURNAL_READ_FAILED" | "JOURNAL_CORRUPTED";

export type ActionJournalReadResult<T> =
  | {
      ok: true;
      value: T;
      ignoredInvalidLines: number;
    }
  | {
      ok: false;
      error: {
        code: ActionJournalReadErrorCode;
        message: string;
      };
    };

export function getActionJournalFilePath(userDataPath: string): string {
  return path.join(userDataPath, "history", "actions.jsonl");
}

export async function appendActionJournalEntry(
  journalFilePath: string,
  entry: ActionJournalEntry
): Promise<ActionJournalResult> {
  try {
    await mkdir(path.dirname(journalFilePath), { recursive: true });
    await appendFile(journalFilePath, `${JSON.stringify(entry)}\n`, "utf8");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: {
        code: "JOURNAL_WRITE_FAILED",
        message: "Impossible d'écrire le journal d'action."
      }
    };
  }
}

export async function readRecentActions(
  journalFilePath: string,
  limit = 10
): Promise<ActionJournalReadResult<ActionJournalEntry[]>> {
  const entries = await readActionJournalEntries(journalFilePath);
  if (!entries.ok) {
    return entries;
  }

  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 10;
  return {
    ok: true,
    value: entries.value.slice(-normalizedLimit).reverse(),
    ignoredInvalidLines: entries.ignoredInvalidLines
  };
}

export async function readLastUndoableClassification(
  journalFilePath: string
): Promise<ActionJournalReadResult<UndoableClassificationAction | null>> {
  const entries = await readActionJournalEntries(journalFilePath);
  if (!entries.ok) {
    return entries;
  }

  const lastCompletedClassification = [...entries.value]
    .reverse()
    .find((entry) => entry.action === "classify" && entry.status === "completed");

  if (!lastCompletedClassification) {
    return {
      ok: true,
      value: null,
      ignoredInvalidLines: entries.ignoredInvalidLines
    };
  }

  if (isActionAlreadyUndoneFromEntries(entries.value, lastCompletedClassification.id)) {
    return {
      ok: true,
      value: null,
      ignoredInvalidLines: entries.ignoredInvalidLines
    };
  }

  if (
    !lastCompletedClassification.oldPath ||
    !lastCompletedClassification.newPath ||
    !lastCompletedClassification.oldName ||
    !lastCompletedClassification.newName
  ) {
    return {
      ok: true,
      value: null,
      ignoredInvalidLines: entries.ignoredInvalidLines
    };
  }

  return {
    ok: true,
    value: {
      id: lastCompletedClassification.id,
      completedAt: lastCompletedClassification.timestamp,
      originalPath: lastCompletedClassification.oldPath,
      classifiedPath: lastCompletedClassification.newPath,
      originalName: lastCompletedClassification.oldName,
      classifiedName: lastCompletedClassification.newName,
      sourceHashSha256: lastCompletedClassification.sourceHashSha256
    },
    ignoredInvalidLines: entries.ignoredInvalidLines
  };
}

export async function isActionAlreadyUndone(
  journalFilePath: string,
  actionId: string
): Promise<ActionJournalReadResult<boolean>> {
  const entries = await readActionJournalEntries(journalFilePath);
  if (!entries.ok) {
    return entries;
  }

  return {
    ok: true,
    value: isActionAlreadyUndoneFromEntries(entries.value, actionId),
    ignoredInvalidLines: entries.ignoredInvalidLines
  };
}

async function readActionJournalEntries(
  journalFilePath: string
): Promise<ActionJournalReadResult<ActionJournalEntry[]>> {
  let content: string;

  try {
    content = await readFile(journalFilePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        ok: true,
        value: [],
        ignoredInvalidLines: 0
      };
    }

    return {
      ok: false,
      error: {
        code: "JOURNAL_READ_FAILED",
        message: "Impossible de lire le journal d'action."
      }
    };
  }

  const entries: ActionJournalEntry[] = [];
  let ignoredInvalidLines = 0;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      if (isActionJournalEntry(parsed)) {
        entries.push(parsed);
      } else {
        ignoredInvalidLines += 1;
      }
    } catch {
      ignoredInvalidLines += 1;
    }
  }

  return {
    ok: true,
    value: entries,
    ignoredInvalidLines
  };
}

function isActionAlreadyUndoneFromEntries(entries: ActionJournalEntry[], actionId: string): boolean {
  return entries.some(
    (entry) =>
      entry.action === "undo-classify" &&
      entry.status === "completed" &&
      entry.originalActionId === actionId
  );
}

function isActionJournalEntry(value: unknown): value is ActionJournalEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.timestamp === "string" &&
    (candidate.action === "classify" || candidate.action === "undo-classify") &&
    (candidate.status === "started" || candidate.status === "completed" || candidate.status === "failed") &&
    isOptionalString(candidate.originalActionId) &&
    isOptionalString(candidate.oldPath) &&
    isOptionalString(candidate.newPath) &&
    isOptionalString(candidate.oldName) &&
    isOptionalString(candidate.newName) &&
    isOptionalString(candidate.restoredPath) &&
    isOptionalString(candidate.classifiedPath) &&
    isOptionalString(candidate.sourceHashSha256) &&
    isOptionalString(candidate.errorCode) &&
    isOptionalString(candidate.errorMessage)
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
