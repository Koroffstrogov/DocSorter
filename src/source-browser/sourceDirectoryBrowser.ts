import { readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  formatBytes,
  isSupportedExtension,
  mapFileSystemError,
  type Result
} from "../documents/documentDiscovery";

export type SourceDirectoryEntryKind = "directory" | "file";

export interface SourceDirectoryEntry {
  name: string;
  path: string;
  kind: SourceDirectoryEntryKind;
  extension?: string;
  supportedDocument: boolean;
  sizeLabel?: string;
  modifiedAt?: string;
}

export interface SourceDirectoryShortcut {
  label: string;
  path: string;
  available: boolean;
}

export interface SourceDirectoryListing {
  currentPath: string;
  parentPath: string | null;
  rootPath: string;
  entries: SourceDirectoryEntry[];
  directoryCount: number;
  fileCount: number;
  supportedDocumentCount: number;
  shortcuts: SourceDirectoryShortcut[];
  drives: SourceDirectoryShortcut[];
  truncated: boolean;
  entryLimit: number;
  warnings: string[];
}

interface SourceDirectoryBrowserOptions {
  entryLimit?: number;
  homePath?: string;
  cwd?: string;
  driveLabels?: Record<string, string>;
}

const DEFAULT_ENTRY_LIMIT = 500;
const execFileAsync = promisify(execFile);

export async function listSourceDirectory(
  requestedPath?: string | null,
  options: SourceDirectoryBrowserOptions = {}
): Promise<Result<SourceDirectoryListing>> {
  const entryLimit = options.entryLimit ?? DEFAULT_ENTRY_LIMIT;
  const currentPath = path.resolve(normalizeRequestedPath(requestedPath, options.homePath));

  try {
    const directoryStats = await stat(currentPath);
    if (!directoryStats.isDirectory()) {
      return failure("DIRECTORY_NOT_FOUND");
    }
  } catch (error) {
    return failure(toSourceDirectoryErrorCode(mapFileSystemError(error)));
  }

  try {
    const directoryEntries = await readdir(currentPath, { withFileTypes: true });
    const sortedEntries = directoryEntries
      .filter((entry) => entry.name !== "." && entry.name !== "..")
      .sort(compareDirectoryEntries);
    const visibleEntries = sortedEntries.slice(0, entryLimit);
    const entries = await Promise.all(
      visibleEntries.map((entry) => toSourceDirectoryEntry(currentPath, entry))
    );
    const fileCount = directoryEntries.filter((entry) => entry.isFile()).length;
    const supportedDocumentCount = directoryEntries.filter((entry) =>
      entry.isFile() && isSupportedExtension(path.extname(entry.name))
    ).length;
    const rootPath = path.parse(currentPath).root;

    return {
      ok: true,
      value: {
        currentPath,
        parentPath: currentPath === rootPath ? null : path.dirname(currentPath),
        rootPath,
        entries: entries.filter((entry): entry is SourceDirectoryEntry => Boolean(entry)),
        directoryCount: directoryEntries.filter((entry) => entry.isDirectory()).length,
        fileCount,
        supportedDocumentCount,
        shortcuts: await buildShortcuts(currentPath, options),
        drives: await buildDriveShortcuts(options),
        truncated: sortedEntries.length > entryLimit,
        entryLimit,
        warnings: sortedEntries.length > entryLimit
          ? [`Affichage limité aux ${entryLimit} premières entrées.`]
          : []
      }
    };
  } catch (error) {
    return failure(toSourceDirectoryErrorCode(mapFileSystemError(error)));
  }
}

function normalizeRequestedPath(requestedPath: string | null | undefined, homePath?: string): string {
  const trimmedPath = requestedPath?.trim();
  return trimmedPath || homePath || os.homedir();
}

function compareDirectoryEntries(left: { name: string; isDirectory: () => boolean }, right: { name: string; isDirectory: () => boolean }): number {
  if (left.isDirectory() !== right.isDirectory()) {
    return left.isDirectory() ? -1 : 1;
  }

  return left.name.localeCompare(right.name, "fr", {
    numeric: true,
    sensitivity: "base"
  });
}

async function toSourceDirectoryEntry(
  directoryPath: string,
  entry: { name: string; isDirectory: () => boolean; isFile: () => boolean }
): Promise<SourceDirectoryEntry | null> {
  const entryPath = path.join(directoryPath, entry.name);

  if (entry.isDirectory()) {
    return {
      name: entry.name,
      path: entryPath,
      kind: "directory",
      supportedDocument: false
    };
  }

  if (!entry.isFile()) {
    return null;
  }

  const extension = path.extname(entry.name).toLowerCase();
  try {
    const fileStats = await stat(entryPath);
    return {
      name: entry.name,
      path: entryPath,
      kind: "file",
      extension,
      supportedDocument: isSupportedExtension(extension),
      sizeLabel: formatBytes(fileStats.size),
      modifiedAt: fileStats.mtime.toISOString()
    };
  } catch {
    return {
      name: entry.name,
      path: entryPath,
      kind: "file",
      extension,
      supportedDocument: isSupportedExtension(extension)
    };
  }
}

async function buildShortcuts(
  currentPath: string,
  options: SourceDirectoryBrowserOptions
): Promise<SourceDirectoryShortcut[]> {
  const homePath = path.resolve(options.homePath || os.homedir());
  const cwd = path.resolve(options.cwd || process.cwd());
  const candidates = [
    { label: "Accueil", path: homePath },
    { label: "Téléchargements", path: path.join(homePath, "Downloads") },
    { label: "Documents", path: path.join(homePath, "Documents") },
    { label: "Bureau", path: path.join(homePath, "Desktop") },
    { label: "Racine du disque", path: path.parse(currentPath).root },
    { label: "Disque application", path: path.parse(cwd).root }
  ];
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    const key = path.resolve(candidate.path).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return Promise.all(
    uniqueCandidates.map(async (candidate) => ({
      label: candidate.label,
      path: candidate.path,
      available: await isDirectoryAvailable(candidate.path)
    }))
  );
}

async function buildDriveShortcuts(options: SourceDirectoryBrowserOptions): Promise<SourceDirectoryShortcut[]> {
  if (process.platform !== "win32") {
    const rootPath = path.parse(process.cwd()).root;
    return [
      {
        label: rootPath,
        path: rootPath,
        available: await isDirectoryAvailable(rootPath)
      }
    ];
  }

  const driveLabels = options.driveLabels ?? await readWindowsDriveLabels();
  const candidates = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({
    label: formatDriveLabel(`${letter}:`, driveLabels[`${letter}:`]),
    path: `${letter}:\\`
  }));
  const checkedCandidates = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      available: await isDirectoryAvailable(candidate.path)
    }))
  );

  return checkedCandidates.filter((candidate) => candidate.available);
}

async function readWindowsDriveLabels(): Promise<Record<string, string>> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress"
      ],
      {
        timeout: 3000,
        windowsHide: true
      }
    );
    return parseWindowsDriveLabels(String(stdout));
  } catch {
    return {};
  }
}

function parseWindowsDriveLabels(rawValue: string): Record<string, string> {
  const text = rawValue.trim();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const labels: Record<string, string> = {};
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const deviceId = String((row as { DeviceID?: unknown }).DeviceID ?? "").toUpperCase();
      const volumeName = String((row as { VolumeName?: unknown }).VolumeName ?? "").trim();
      if (/^[A-Z]:$/.test(deviceId) && volumeName) {
        labels[deviceId] = volumeName;
      }
    }
    return labels;
  } catch {
    return {};
  }
}

function formatDriveLabel(deviceId: string, volumeName: string | undefined): string {
  const label = volumeName?.trim();
  return label ? `${deviceId} ${label}` : deviceId;
}

async function isDirectoryAvailable(directoryPath: string): Promise<boolean> {
  try {
    const directoryStats = await stat(directoryPath);
    return directoryStats.isDirectory();
  } catch {
    return false;
  }
}

function failure(code: "DIRECTORY_NOT_FOUND" | "DIRECTORY_ACCESS_DENIED" | "DIRECTORY_UNAVAILABLE" | "UNKNOWN_ERROR"): Result<never> {
  const messages = {
    DIRECTORY_NOT_FOUND: "Dossier source introuvable.",
    DIRECTORY_ACCESS_DENIED: "Accès au dossier source refusé.",
    DIRECTORY_UNAVAILABLE: "Dossier source indisponible.",
    UNKNOWN_ERROR: "Impossible de lire le dossier source."
  };

  return {
    ok: false,
    error: {
      code,
      message: messages[code]
    }
  };
}

function toSourceDirectoryErrorCode(
  code: ReturnType<typeof mapFileSystemError>
): "DIRECTORY_NOT_FOUND" | "DIRECTORY_ACCESS_DENIED" | "DIRECTORY_UNAVAILABLE" | "UNKNOWN_ERROR" {
  switch (code) {
    case "DIRECTORY_NOT_FOUND":
    case "DIRECTORY_ACCESS_DENIED":
    case "DIRECTORY_UNAVAILABLE":
      return code;
    default:
      return "UNKNOWN_ERROR";
  }
}
