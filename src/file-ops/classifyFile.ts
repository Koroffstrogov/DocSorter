import { randomUUID } from "node:crypto";
import { access, rename, stat } from "node:fs/promises";
import path from "node:path";

import {
  type ClassificationPlan,
  type ClassificationPlanErrorCode,
  prepareClassificationPlan
} from "../classification/classificationPlan";
import {
  checkTargetDirectoryWritable as defaultCheckTargetDirectoryWritable,
  type TargetDirectoryWritableChecker
} from "../filesystem/targetDirectoryAccess";
import {
  appendActionJournalEntry,
  readLastUndoableClassification,
  type ActionJournalResult
} from "../history/actionJournal";
import type { ActionJournalEntry, UndoableClassificationAction } from "../history/historyTypes";
import { calculateSha256 } from "./fileHash";

export type ExecuteClassificationErrorCode =
  | ClassificationPlanErrorCode
  | "HASH_FAILED"
  | "MOVE_FAILED"
  | "MOVE_ACROSS_DEVICES_UNSUPPORTED"
  | "JOURNAL_WRITE_FAILED"
  | "UNKNOWN_ERROR";

export type UndoClassificationErrorCode =
  | "NO_UNDO_AVAILABLE"
  | "UNDO_SOURCE_MISSING"
  | "UNDO_DESTINATION_OCCUPIED"
  | "UNDO_HASH_MISMATCH"
  | "UNDO_MOVE_FAILED"
  | "JOURNAL_READ_FAILED"
  | "JOURNAL_CORRUPTED"
  | "UNKNOWN_ERROR";

export interface ClassificationOperationError {
  code: ExecuteClassificationErrorCode;
  message: string;
}

export interface UndoClassificationError {
  code: UndoClassificationErrorCode;
  message: string;
}

export type ExecuteClassificationStatus = "completed" | "completed-with-journal-warning";
export type UndoClassificationStatus = "completed" | "undo-completed-with-journal-warning";

export interface ClassificationJournalWarning {
  code: "CLASSIFIED_BUT_JOURNAL_INCOMPLETE";
  message: string;
}

export interface UndoJournalWarning {
  code: "UNDO_COMPLETED_BUT_JOURNAL_INCOMPLETE";
  message: string;
}

export interface ExecuteClassificationValue {
  status: ExecuteClassificationStatus;
  plan: ClassificationPlan & { status: "ready" };
  undoableAction: UndoableClassificationAction;
  message: string;
  journalWarning?: ClassificationJournalWarning;
}

export type ExecuteClassificationResult =
  | {
      ok: true;
      value: ExecuteClassificationValue;
    }
  | {
      ok: false;
      error: ClassificationOperationError;
      plan?: ClassificationPlan;
    };

export interface UndoClassificationValue {
  status: UndoClassificationStatus;
  originalActionId: string;
  restoredPath: string;
  classifiedPath: string;
  message: string;
  journalWarning?: UndoJournalWarning;
}

export type UndoClassificationResult =
  | {
      ok: true;
      value: UndoClassificationValue;
    }
  | {
      ok: false;
      error: UndoClassificationError;
    };

export interface ExecuteClassificationOptions {
  documentPath: string;
  proposedFilename: string;
  selectedTargetPath: string | null | undefined;
  targetFolder?: string;
  queuedDocumentPaths: Iterable<string>;
  journalFilePath: string;
  now?: () => Date;
  createId?: () => string;
  renameFile?: (oldPath: string, newPath: string) => Promise<void>;
  appendJournalEntry?: JournalEntryWriter;
  checkTargetDirectoryWritable?: TargetDirectoryWritableChecker;
}

export interface UndoClassificationOptions {
  undoableAction: UndoableClassificationAction | null;
  journalFilePath: string;
  now?: () => Date;
  createId?: () => string;
  renameFile?: (oldPath: string, newPath: string) => Promise<void>;
  appendJournalEntry?: JournalEntryWriter;
}

type JournalEntryWriter = (
  journalFilePath: string,
  entry: ActionJournalEntry
) => Promise<ActionJournalResult>;

export async function executeClassification(
  options: ExecuteClassificationOptions
): Promise<ExecuteClassificationResult> {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const renameFile = options.renameFile ?? rename;
  const appendJournalEntry = options.appendJournalEntry ?? appendActionJournalEntry;
  const checkTargetDirectoryWritable =
    options.checkTargetDirectoryWritable ?? defaultCheckTargetDirectoryWritable;
  const actionId = createId();
  const timestamp = now().toISOString();

  const planResult = await prepareClassificationPlan({
    documentPath: options.documentPath,
    proposedFilename: options.proposedFilename,
    selectedTargetPath: options.selectedTargetPath,
    targetFolder: options.targetFolder,
    queuedDocumentPaths: options.queuedDocumentPaths,
    checkTargetDirectoryWritable,
    now
  });

  if (!planResult.ok) {
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp,
      plan: planResult.value,
      errorCode: planResult.error.code,
      errorMessage: planResult.error.message
    });
    return {
      ok: false,
      error: planResult.error,
      plan: planResult.value
    };
  }

  const plan = planResult.value;
  if (path.extname(plan.proposedFilename).toLowerCase() !== plan.extension) {
    const error = {
      code: "INVALID_FILENAME" as const,
      message: "Extension proposée incohérente avec le document source."
    };
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp,
      plan,
      errorCode: error.code,
      errorMessage: error.message
    });
    return {
      ok: false,
      error,
      plan
    };
  }

  const hashResult = await calculateSha256(plan.sourcePath);
  if (!hashResult.ok) {
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp,
      plan,
      errorCode: hashResult.error.code,
      errorMessage: hashResult.error.message
    });
    return {
      ok: false,
      error: hashResult.error,
      plan
    };
  }

  const targetWritable = await checkTargetDirectoryWritable(plan.targetPath);
  if (!targetWritable.ok) {
    const error = {
      code: targetWritable.error.code as ExecuteClassificationErrorCode,
      message: targetWritable.error.message
    };
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp,
      plan,
      sourceHashSha256: hashResult.value,
      errorCode: error.code,
      errorMessage: error.message
    });
    return {
      ok: false,
      error,
      plan
    };
  }

  if (await pathExists(plan.destinationPath)) {
    const error = {
      code: "DESTINATION_ALREADY_EXISTS" as const,
      message: "Le nom proposé est déjà utilisé."
    };
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp,
      plan,
      sourceHashSha256: hashResult.value,
      errorCode: error.code,
      errorMessage: error.message
    });
    return {
      ok: false,
      error,
      plan
    };
  }

  const startedJournal = await appendJournalEntry(options.journalFilePath, {
    id: actionId,
    timestamp,
    action: "classify",
    status: "started",
    oldPath: plan.sourcePath,
    newPath: plan.destinationPath,
    oldName: plan.currentName,
    newName: plan.proposedFilename,
    sourceHashSha256: hashResult.value
  });

  if (!startedJournal.ok) {
    return {
      ok: false,
      error: startedJournal.error,
      plan
    };
  }

  try {
    await renameFile(plan.sourcePath, plan.destinationPath);
  } catch (error) {
    const operationError = moveErrorFromFsError(error);
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp: now().toISOString(),
      plan,
      sourceHashSha256: hashResult.value,
      errorCode: operationError.code,
      errorMessage: operationError.message
    });
    return {
      ok: false,
      error: operationError,
      plan
    };
  }

  const destinationExists = await isFile(plan.destinationPath);
  const sourceStillExists = await pathExists(plan.sourcePath);
  if (!destinationExists || sourceStillExists) {
    const error = {
      code: "MOVE_FAILED" as const,
      message: "Classement impossible après déplacement incomplet."
    };
    await writeClassifyFailure(appendJournalEntry, options.journalFilePath, {
      id: actionId,
      timestamp: now().toISOString(),
      plan,
      sourceHashSha256: hashResult.value,
      errorCode: error.code,
      errorMessage: error.message
    });
    return {
      ok: false,
      error,
      plan
    };
  }

  const completedAt = now().toISOString();
  const undoableAction: UndoableClassificationAction = {
    id: actionId,
    completedAt,
    originalPath: plan.sourcePath,
    classifiedPath: plan.destinationPath,
    originalName: plan.currentName,
    classifiedName: plan.proposedFilename,
    sourceHashSha256: hashResult.value
  };

  const completedJournal = await appendJournalEntry(options.journalFilePath, {
    id: actionId,
    timestamp: completedAt,
    action: "classify",
    status: "completed",
    oldPath: plan.sourcePath,
    newPath: plan.destinationPath,
    oldName: plan.currentName,
    newName: plan.proposedFilename,
    sourceHashSha256: hashResult.value
  });

  if (!completedJournal.ok) {
    return {
      ok: true,
      value: {
        status: "completed-with-journal-warning",
        plan,
        undoableAction,
        message: "Le fichier a été classé, mais le journal n'a pas pu être finalisé.",
        journalWarning: {
          code: "CLASSIFIED_BUT_JOURNAL_INCOMPLETE",
          message: "Le fichier a été classé, mais le journal n'a pas pu être finalisé."
        }
      }
    };
  }

  return {
    ok: true,
    value: {
      status: "completed",
      plan,
      undoableAction,
      message: "Document classé"
    }
  };
}

export async function undoLastClassification(
  options: UndoClassificationOptions
): Promise<UndoClassificationResult> {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const renameFile = options.renameFile ?? rename;
  const appendJournalEntry = options.appendJournalEntry ?? appendActionJournalEntry;
  const undoId = createId();
  const timestamp = now().toISOString();
  const action = await resolveUndoableAction(options.undoableAction, options.journalFilePath);

  if (!action.ok) {
    return {
      ok: false,
      error: action.error
    };
  }

  if (!action.value) {
    return {
      ok: false,
      error: {
        code: "NO_UNDO_AVAILABLE",
        message: "Aucune action à annuler."
      }
    };
  }

  if (!(await isFile(action.value.classifiedPath))) {
    const error = {
      code: "UNDO_SOURCE_MISSING" as const,
      message: "Le fichier classé n'est plus disponible."
    };
    await writeUndoFailure(appendJournalEntry, options.journalFilePath, undoId, timestamp, action.value, error);
    return {
      ok: false,
      error
    };
  }

  if (action.value.sourceHashSha256) {
    const classifiedHash = await calculateSha256(action.value.classifiedPath);
    if (!classifiedHash.ok) {
      const error = {
        code: "UNDO_MOVE_FAILED" as const,
        message: "Annulation impossible."
      };
      await writeUndoFailure(appendJournalEntry, options.journalFilePath, undoId, timestamp, action.value, error);
      return {
        ok: false,
        error
      };
    }

    if (classifiedHash.value !== action.value.sourceHashSha256) {
      const error = {
        code: "UNDO_HASH_MISMATCH" as const,
        message: "Annulation refusée car le fichier classé semble avoir changé."
      };
      await writeUndoFailure(appendJournalEntry, options.journalFilePath, undoId, timestamp, action.value, error);
      return {
        ok: false,
        error
      };
    }
  }

  if (await pathExists(action.value.originalPath)) {
    const error = {
      code: "UNDO_DESTINATION_OCCUPIED" as const,
      message: "Annulation impossible : le chemin source est déjà occupé."
    };
    await writeUndoFailure(appendJournalEntry, options.journalFilePath, undoId, timestamp, action.value, error);
    return {
      ok: false,
      error
    };
  }

  try {
    await renameFile(action.value.classifiedPath, action.value.originalPath);
  } catch {
    const error = {
      code: "UNDO_MOVE_FAILED" as const,
      message: "Annulation impossible."
    };
    await writeUndoFailure(appendJournalEntry, options.journalFilePath, undoId, now().toISOString(), action.value, error);
    return {
      ok: false,
      error
    };
  }

  const originalRestored = await isFile(action.value.originalPath);
  const classifiedStillExists = await pathExists(action.value.classifiedPath);
  if (!originalRestored || classifiedStillExists) {
    const error = {
      code: "UNDO_MOVE_FAILED" as const,
      message: "Annulation impossible après déplacement incomplet."
    };
    await writeUndoFailure(appendJournalEntry, options.journalFilePath, undoId, now().toISOString(), action.value, error);
    return {
      ok: false,
      error
    };
  }

  const completedJournal = await appendJournalEntry(options.journalFilePath, {
    id: undoId,
    timestamp: now().toISOString(),
    action: "undo-classify",
    status: "completed",
    originalActionId: action.value.id,
    restoredPath: action.value.originalPath,
    classifiedPath: action.value.classifiedPath,
    oldName: action.value.classifiedName,
    newName: action.value.originalName,
    sourceHashSha256: action.value.sourceHashSha256
  });

  if (!completedJournal.ok) {
    return {
      ok: true,
      value: {
        status: "undo-completed-with-journal-warning",
        originalActionId: action.value.id,
        restoredPath: action.value.originalPath,
        classifiedPath: action.value.classifiedPath,
        message: "La dernière action a été annulée, mais le journal n'a pas pu être finalisé.",
        journalWarning: {
          code: "UNDO_COMPLETED_BUT_JOURNAL_INCOMPLETE",
          message: "La dernière action a été annulée, mais le journal n'a pas pu être finalisé."
        }
      }
    };
  }

  return {
    ok: true,
    value: {
      status: "completed",
      originalActionId: action.value.id,
      restoredPath: action.value.originalPath,
      classifiedPath: action.value.classifiedPath,
      message: "Dernière action annulée"
    }
  };
}

async function resolveUndoableAction(
  sessionAction: UndoableClassificationAction | null,
  journalFilePath: string
): Promise<
  | {
      ok: true;
      value: UndoableClassificationAction | null;
    }
  | {
      ok: false;
      error: UndoClassificationError;
    }
> {
  if (sessionAction) {
    return {
      ok: true,
      value: sessionAction
    };
  }

  const journalAction = await readLastUndoableClassification(journalFilePath);
  if (!journalAction.ok) {
    return {
      ok: false,
      error: journalAction.error
    };
  }

  return {
    ok: true,
    value: journalAction.value
  };
}

async function writeClassifyFailure(
  appendJournalEntry: JournalEntryWriter,
  journalFilePath: string,
  details: {
    id: string;
    timestamp: string;
    plan: ClassificationPlan;
    errorCode: string;
    errorMessage: string;
    sourceHashSha256?: string;
  }
): Promise<void> {
  await appendJournalEntry(journalFilePath, {
    id: details.id,
    timestamp: details.timestamp,
    action: "classify",
    status: "failed",
    oldPath: details.plan.sourcePath || undefined,
    newPath: details.plan.destinationPath || undefined,
    oldName: details.plan.currentName || undefined,
    newName: details.plan.proposedFilename || undefined,
    sourceHashSha256: details.sourceHashSha256,
    errorCode: details.errorCode,
    errorMessage: details.errorMessage
  });
}

async function writeUndoFailure(
  appendJournalEntry: JournalEntryWriter,
  journalFilePath: string,
  id: string,
  timestamp: string,
  action: UndoableClassificationAction,
  error: UndoClassificationError
): Promise<void> {
  await appendJournalEntry(journalFilePath, {
    id,
    timestamp,
    action: "undo-classify",
    status: "failed",
    originalActionId: action.id,
    restoredPath: action.originalPath,
    classifiedPath: action.classifiedPath,
    oldName: action.classifiedName,
    newName: action.originalName,
    sourceHashSha256: action.sourceHashSha256,
    errorCode: error.code,
    errorMessage: error.message
  });
}

function moveErrorFromFsError(error: unknown): ClassificationOperationError {
  if (isNodeError(error) && error.code === "EXDEV") {
    return {
      code: "MOVE_ACROSS_DEVICES_UNSUPPORTED",
      message: "Déplacement entre volumes non supporté dans ce lot."
    };
  }

  return {
    code: "MOVE_FAILED",
    message: "Classement impossible."
  };
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
