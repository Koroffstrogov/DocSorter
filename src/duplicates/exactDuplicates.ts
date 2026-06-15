import { stat } from "node:fs/promises";

import { calculateSha256 } from "../file-ops/fileHash";
import { readCompletedClassifications } from "../history/actionJournal";
import type { UndoableClassificationAction } from "../history/historyTypes";

export type ExactDuplicateAnalysisErrorCode =
  | "SOURCE_NOT_SELECTED"
  | "QUEUE_EMPTY"
  | "FILE_NOT_FOUND"
  | "FILE_HASH_FAILED"
  | "JOURNAL_READ_FAILED"
  | "JOURNAL_CORRUPTED"
  | "UNKNOWN_ERROR";

export interface DuplicateSourceDocument {
  filePath: string;
  name: string;
}

export interface DuplicateFileReference {
  filePath: string;
  name: string;
}

export interface SourceQueueDuplicateMatch {
  type: "source-queue";
  hash: string;
  files: DuplicateFileReference[];
  reliable: true;
}

export interface HistoryDuplicateMatch {
  type: "history";
  hash: string;
  sourceFile: DuplicateFileReference;
  historyFile: DuplicateFileReference & {
    originalName: string;
    classifiedName: string;
    actionId: string;
  };
  reliable: true;
}

export type ExactDuplicateMatch = SourceQueueDuplicateMatch | HistoryDuplicateMatch;

export interface ExactDuplicateFileError {
  filePath: string;
  name: string;
  code: "FILE_NOT_FOUND" | "FILE_HASH_FAILED";
  message: string;
}

export interface ExactDuplicateAnalysis {
  analyzedAt: string;
  sourceFileCount: number;
  hashedSourceFileCount: number;
  matches: ExactDuplicateMatch[];
  fileErrors: ExactDuplicateFileError[];
  ignoredHistoryCount: number;
}

export type ExactDuplicateAnalysisResult =
  | {
      ok: true;
      value: ExactDuplicateAnalysis;
    }
  | {
      ok: false;
      error: {
        code: ExactDuplicateAnalysisErrorCode;
        message: string;
      };
    };

export interface AnalyzeExactDuplicatesOptions {
  sourceDocuments: DuplicateSourceDocument[];
  journalFilePath: string;
  now?: () => Date;
}

interface HashedSourceDocument extends DuplicateSourceDocument {
  hash: string;
}

export async function analyzeExactDuplicates(
  options: AnalyzeExactDuplicatesOptions
): Promise<ExactDuplicateAnalysisResult> {
  if (options.sourceDocuments.length === 0) {
    return {
      ok: false,
      error: {
        code: "QUEUE_EMPTY",
        message: "Aucun document à analyser."
      }
    };
  }

  const hashedSourceDocuments: HashedSourceDocument[] = [];
  const fileErrors: ExactDuplicateFileError[] = [];

  for (const documentItem of options.sourceDocuments) {
    const hashResult = await hashSourceDocument(documentItem);
    if (hashResult.ok) {
      hashedSourceDocuments.push({
        ...documentItem,
        hash: hashResult.value
      });
    } else {
      fileErrors.push({
        filePath: documentItem.filePath,
        name: documentItem.name,
        code: hashResult.error.code,
        message: hashResult.error.message
      });
    }
  }

  const historyResult = await readCompletedClassifications(options.journalFilePath);
  if (!historyResult.ok) {
    return {
      ok: false,
      error: historyResult.error
    };
  }

  const historyMatches = await findHistoryMatches(hashedSourceDocuments, historyResult.value);
  return {
    ok: true,
    value: {
      analyzedAt: (options.now ?? (() => new Date()))().toISOString(),
      sourceFileCount: options.sourceDocuments.length,
      hashedSourceFileCount: hashedSourceDocuments.length,
      matches: [
        ...findSourceQueueDuplicateMatches(hashedSourceDocuments),
        ...historyMatches.matches
      ],
      fileErrors,
      ignoredHistoryCount: historyMatches.ignoredHistoryCount + historyResult.ignoredInvalidLines
    }
  };
}

function findSourceQueueDuplicateMatches(
  hashedDocuments: HashedSourceDocument[]
): SourceQueueDuplicateMatch[] {
  const byHash = new Map<string, HashedSourceDocument[]>();

  for (const documentItem of hashedDocuments) {
    const documents = byHash.get(documentItem.hash) ?? [];
    documents.push(documentItem);
    byHash.set(documentItem.hash, documents);
  }

  return Array.from(byHash.entries())
    .filter(([, documents]) => documents.length >= 2)
    .map(([hash, documents]) => ({
      type: "source-queue" as const,
      hash,
      files: documents.map(toFileReference),
      reliable: true as const
    }));
}

async function findHistoryMatches(
  hashedSourceDocuments: HashedSourceDocument[],
  historyActions: UndoableClassificationAction[]
): Promise<{
  matches: HistoryDuplicateMatch[];
  ignoredHistoryCount: number;
}> {
  const sourceByHash = new Map<string, HashedSourceDocument[]>();
  for (const sourceDocument of hashedSourceDocuments) {
    const documents = sourceByHash.get(sourceDocument.hash) ?? [];
    documents.push(sourceDocument);
    sourceByHash.set(sourceDocument.hash, documents);
  }

  const matches: HistoryDuplicateMatch[] = [];
  let ignoredHistoryCount = 0;

  for (const historyAction of historyActions) {
    const historyHash = await resolveReliableHistoryHash(historyAction);
    if (!historyHash) {
      ignoredHistoryCount += 1;
      continue;
    }

    const sourceDocuments = sourceByHash.get(historyHash) ?? [];
    for (const sourceDocument of sourceDocuments) {
      matches.push({
        type: "history",
        hash: historyHash,
        sourceFile: toFileReference(sourceDocument),
        historyFile: {
          filePath: historyAction.classifiedPath,
          name: historyAction.classifiedName,
          originalName: historyAction.originalName,
          classifiedName: historyAction.classifiedName,
          actionId: historyAction.id
        },
        reliable: true
      });
    }
  }

  return {
    matches,
    ignoredHistoryCount
  };
}

async function resolveReliableHistoryHash(
  historyAction: UndoableClassificationAction
): Promise<string | null> {
  if (!historyAction.sourceHashSha256) {
    return null;
  }

  if (!(await isFile(historyAction.classifiedPath))) {
    return null;
  }

  const currentHash = await calculateSha256(historyAction.classifiedPath);
  if (!currentHash.ok) {
    return null;
  }

  if (historyAction.sourceHashSha256 !== currentHash.value) {
    return null;
  }

  return currentHash.value;
}

async function hashSourceDocument(
  documentItem: DuplicateSourceDocument
): Promise<
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: ExactDuplicateFileError;
    }
> {
  if (!(await isFile(documentItem.filePath))) {
    return {
      ok: false,
      error: {
        filePath: documentItem.filePath,
        name: documentItem.name,
        code: "FILE_NOT_FOUND",
        message: "Fichier indisponible pendant l'analyse des doublons."
      }
    };
  }

  const hashResult = await calculateSha256(documentItem.filePath);
  if (!hashResult.ok) {
    return {
      ok: false,
      error: {
        filePath: documentItem.filePath,
        name: documentItem.name,
        code: "FILE_HASH_FAILED",
        message: "Impossible de calculer l'empreinte du fichier."
      }
    };
  }

  return hashResult;
}

function toFileReference(documentItem: DuplicateSourceDocument): DuplicateFileReference {
  return {
    filePath: documentItem.filePath,
    name: documentItem.name
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
