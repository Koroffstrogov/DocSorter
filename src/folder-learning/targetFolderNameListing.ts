import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  checkTargetDirectoryWritable,
  type TargetDirectoryWritableChecker
} from "../filesystem/targetDirectoryAccess";
import {
  normalizeTargetFolderRelative,
  type TargetFolderResult
} from "../naming/targetFolder";
import type { FolderLearningPreference } from "./folderLearningPreferences";

export interface FolderLearningTargetEntry {
  name: string;
  isFile: boolean;
}

export interface FolderLearningTargetFolderNames {
  targetFolder: string;
  entries: FolderLearningTargetEntry[];
  preference?: FolderLearningPreference;
  truncated: boolean;
  entryLimit: number;
  warnings: string[];
}

export type FolderLearningTargetFolderNamesResult =
  TargetFolderResult<FolderLearningTargetFolderNames>;

export interface FolderLearningNameListingOptions {
  entryLimit?: number;
  checkTargetDirectoryWritable?: TargetDirectoryWritableChecker;
  readDirectory?: (targetPath: string) => Promise<FolderLearningDirectoryEntry[]>;
}

interface FolderLearningDirectoryEntry {
  name: string;
  isFile: () => boolean;
  isDirectory: () => boolean;
}

const DEFAULT_ENTRY_LIMIT = 500;

export async function listTargetFolderNames(
  targetRootPath: string | null | undefined,
  targetFolder: string,
  options: FolderLearningNameListingOptions = {}
): Promise<FolderLearningTargetFolderNamesResult> {
  const rootAccess = await (options.checkTargetDirectoryWritable ?? checkTargetDirectoryWritable)(
    targetRootPath
  );
  if (!rootAccess.ok) {
    return {
      ok: false,
      error: rootAccess.error
    };
  }

  const normalized = normalizeTargetFolderRelative(targetFolder);
  if (!normalized.ok) {
    return normalized;
  }

  const targetPath = normalized.value
    ? path.resolve(rootAccess.value, ...normalized.value.split("/"))
    : rootAccess.value;

  if (normalized.value && !isStrictSubPath(rootAccess.value, targetPath)) {
    return {
      ok: false,
      error: {
        code: "TARGET_FOLDER_INVALID",
        message: "Le sous-dossier cible doit rester sous la racine."
      }
    };
  }

  const entryLimit = Math.max(1, Math.min(1_000, Math.floor(options.entryLimit ?? DEFAULT_ENTRY_LIMIT)));
  let directoryEntries: FolderLearningDirectoryEntry[];
  try {
    directoryEntries = await (options.readDirectory ?? readDirectoryEntries)(targetPath);
  } catch {
    return {
      ok: true,
      value: {
        targetFolder: normalized.value,
        entries: [],
        truncated: false,
        entryLimit,
        warnings: ["Convention du dossier indisponible : lecture du dossier impossible."]
      }
    };
  }

  const visibleEntries = directoryEntries
    .filter((entry) => !entry.name.startsWith("~$"))
    .filter((entry) => entry.isFile() || entry.isDirectory());
  const limitedEntries = visibleEntries.slice(0, entryLimit);

  return {
    ok: true,
    value: {
      targetFolder: normalized.value,
      entries: limitedEntries.map((entry) => ({
        name: entry.name,
        isFile: entry.isFile()
      })),
      truncated: visibleEntries.length > limitedEntries.length,
      entryLimit,
      warnings: visibleEntries.length > limitedEntries.length
        ? [`Lecture limitée aux ${entryLimit} premières entrées du dossier.`]
        : []
    }
  };
}

async function readDirectoryEntries(targetPath: string): Promise<FolderLearningDirectoryEntry[]> {
  return readdir(targetPath, { withFileTypes: true });
}

function isStrictSubPath(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
