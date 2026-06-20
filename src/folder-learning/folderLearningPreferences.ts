import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeNameBlock } from "../naming/documentNameV2";
import {
  parseFolderFileName,
  type FolderLearningDatePrecision,
  type FolderNamingPattern,
  type ParsedFolderFileName
} from "./parseFolderFileName";

export type FolderLearningPreferenceDetailUsage = "never" | "sometimes" | "often";

export interface FolderLearningPreference {
  folderRelativePath: string;
  preferredSchema?: FolderNamingPattern;
  preferredDatePrecision?: FolderLearningDatePrecision;
  preferredTarget?: string;
  preferredDocumentType?: string;
  preferredIssuer?: string;
  detailUsage?: FolderLearningPreferenceDetailUsage;
  confirmedCount: number;
  lastConfirmedAt: string;
}

export interface FolderLearningPreferencesFile {
  version: 1;
  preferences: FolderLearningPreference[];
}

export interface FolderLearningPreferencesValue<T> {
  value: T;
  warnings: string[];
}

export type FolderLearningPreferencesResult<T> =
  | {
      ok: true;
      value: T;
      warnings: string[];
    }
  | {
      ok: false;
      error: {
        code: "FOLDER_LEARNING_PREFERENCES_WRITE_FAILED";
        message: string;
      };
      warnings: string[];
    };

export interface RecordFolderLearningPreferenceOptions {
  userDataPath: string;
  folderRelativePath: string;
  classifiedName: string;
  confirmedAt?: string;
}

const PREFERENCES_VERSION = 1;
const MAX_PREFERENCES = 500;
const VALID_SCHEMA_PATTERNS = new Set<FolderNamingPattern>([
  "DATE_DOCUMENT",
  "DATE_DOCUMENT_EMETTEUR",
  "DATE_DOCUMENT_CIBLE",
  "DATE_DOCUMENT_CIBLE_EMETTEUR",
  "DATE_CIBLE_DOCUMENT",
  "DATE_CIBLE_DOCUMENT_EMETTEUR",
  "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL",
  "DATE_DOCUMENT_CIBLE_EMETTEUR_DETAIL"
]);

export function getFolderLearningPreferencesPath(userDataPath: string): string {
  return path.join(userDataPath, "config", "folder-learning-preferences.json");
}

export async function loadFolderLearningPreferences(
  userDataPath: string
): Promise<FolderLearningPreferencesValue<FolderLearningPreferencesFile>> {
  const filePath = getFolderLearningPreferencesPath(userDataPath);

  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        value: createEmptyPreferencesFile(),
        warnings: []
      };
    }

    return {
      value: createEmptyPreferencesFile(),
      warnings: ["Préférences de convention indisponibles : lecture impossible."]
    };
  }

  try {
    const parsed = normalizePreferencesFile(JSON.parse(raw));
    return {
      value: parsed.value,
      warnings: parsed.warnings
    };
  } catch {
    return {
      value: createEmptyPreferencesFile(),
      warnings: ["Préférences de convention ignorées : JSON invalide."]
    };
  }
}

export async function getFolderLearningPreferenceForFolder(
  userDataPath: string,
  folderRelativePath: string
): Promise<FolderLearningPreferencesValue<FolderLearningPreference | null>> {
  const normalizedFolder = normalizeFolderRelative(folderRelativePath);
  const loaded = await loadFolderLearningPreferences(userDataPath);

  if (normalizedFolder === null) {
    return {
      value: null,
      warnings: [...loaded.warnings, "Préférence de convention ignorée : dossier relatif invalide."]
    };
  }

  return {
    value: loaded.value.preferences.find(
      (preference) => preference.folderRelativePath === normalizedFolder
    ) ?? null,
    warnings: loaded.warnings
  };
}

export async function recordFolderLearningPreferenceFromClassification(
  options: RecordFolderLearningPreferenceOptions
): Promise<FolderLearningPreferencesResult<FolderLearningPreference | null>> {
  const normalizedFolder = normalizeFolderRelative(options.folderRelativePath);
  if (normalizedFolder === null) {
    return {
      ok: true,
      value: null,
      warnings: ["Préférence de convention non mémorisée : dossier relatif invalide."]
    };
  }

  const parsed = parseFolderFileName(options.classifiedName);
  if (!parsed) {
    return {
      ok: true,
      value: null,
      warnings: ["Préférence de convention non mémorisée : nom final non conforme."]
    };
  }

  const loaded = await loadFolderLearningPreferences(options.userDataPath);
  const confirmedAt = normalizeIsoDate(options.confirmedAt) ?? new Date().toISOString();
  const nextPreference = buildUpdatedPreference(
    loaded.value.preferences.find((preference) => preference.folderRelativePath === normalizedFolder),
    normalizedFolder,
    parsed,
    confirmedAt
  );
  const nextFile: FolderLearningPreferencesFile = {
    version: PREFERENCES_VERSION,
    preferences: [
      nextPreference,
      ...loaded.value.preferences.filter(
        (preference) => preference.folderRelativePath !== normalizedFolder
      )
    ].slice(0, MAX_PREFERENCES)
  };

  const writeResult = await writeFolderLearningPreferences(options.userDataPath, nextFile);
  if (!writeResult.ok) {
    return {
      ...writeResult,
      warnings: loaded.warnings
    };
  }

  return {
    ok: true,
    value: nextPreference,
    warnings: loaded.warnings
  };
}

async function writeFolderLearningPreferences(
  userDataPath: string,
  preferences: FolderLearningPreferencesFile
): Promise<FolderLearningPreferencesResult<void>> {
  const filePath = getFolderLearningPreferencesPath(userDataPath);
  const temporaryPath = `${filePath}.tmp`;

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
    return {
      ok: true,
      value: undefined,
      warnings: []
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "FOLDER_LEARNING_PREFERENCES_WRITE_FAILED",
        message: "Impossible de mémoriser la préférence de convention du dossier."
      },
      warnings: []
    };
  }
}

function buildUpdatedPreference(
  existing: FolderLearningPreference | undefined,
  folderRelativePath: string,
  parsed: ParsedFolderFileName,
  confirmedAt: string
): FolderLearningPreference {
  return {
    folderRelativePath,
    preferredSchema: parsed.pattern,
    preferredDatePrecision: parsed.datePrecision,
    ...(parsed.target ? { preferredTarget: parsed.target } : {}),
    ...(parsed.documentType ? { preferredDocumentType: parsed.documentType } : {}),
    ...(parsed.issuer ? { preferredIssuer: parsed.issuer } : {}),
    detailUsage: mergeDetailUsage(existing?.detailUsage, Boolean(parsed.detail)),
    confirmedCount: Math.max(0, existing?.confirmedCount ?? 0) + 1,
    lastConfirmedAt: confirmedAt
  };
}

function mergeDetailUsage(
  previous: FolderLearningPreferenceDetailUsage | undefined,
  hasDetail: boolean
): FolderLearningPreferenceDetailUsage {
  if (!previous) {
    return hasDetail ? "often" : "never";
  }

  if (previous === "sometimes") {
    return "sometimes";
  }

  if (previous === "never" && hasDetail) {
    return "sometimes";
  }

  if (previous === "often" && !hasDetail) {
    return "sometimes";
  }

  return previous;
}

function normalizePreferencesFile(value: unknown): FolderLearningPreferencesValue<FolderLearningPreferencesFile> {
  if (!value || typeof value !== "object") {
    return {
      value: createEmptyPreferencesFile(),
      warnings: ["Préférences de convention ignorées : structure invalide."]
    };
  }

  const input = value as Record<string, unknown>;
  const preferences = Array.isArray(input.preferences)
    ? input.preferences.map(normalizePreference).filter(isFolderLearningPreference)
    : [];
  const ignoredCount = Array.isArray(input.preferences)
    ? input.preferences.length - preferences.length
    : 0;

  return {
    value: {
      version: PREFERENCES_VERSION,
      preferences: preferences.slice(0, MAX_PREFERENCES)
    },
    warnings: ignoredCount > 0
      ? [`${ignoredCount} préférence(s) de convention ignorée(s) car invalides.`]
      : []
  };
}

function normalizePreference(value: unknown): FolderLearningPreference | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  const folderRelativePath = normalizeFolderRelative(readOptionalString(input.folderRelativePath));
  const confirmedCount = readPositiveInteger(input.confirmedCount);
  const lastConfirmedAt = normalizeIsoDate(readOptionalString(input.lastConfirmedAt));
  if (folderRelativePath === null || confirmedCount === null || !lastConfirmedAt) {
    return null;
  }

  const preferredSchema = readSchema(input.preferredSchema);
  const preferredDatePrecision = readDatePrecision(input.preferredDatePrecision);
  const preferredTarget = normalizeOptionalBlock(input.preferredTarget);
  const preferredDocumentType = normalizeOptionalBlock(input.preferredDocumentType);
  const preferredIssuer = normalizeOptionalBlock(input.preferredIssuer);
  const detailUsage = readDetailUsage(input.detailUsage);

  return {
    folderRelativePath,
    ...(preferredSchema ? { preferredSchema } : {}),
    ...(preferredDatePrecision ? { preferredDatePrecision } : {}),
    ...(preferredTarget ? { preferredTarget } : {}),
    ...(preferredDocumentType ? { preferredDocumentType } : {}),
    ...(preferredIssuer ? { preferredIssuer } : {}),
    ...(detailUsage ? { detailUsage } : {}),
    confirmedCount,
    lastConfirmedAt
  };
}

function normalizeFolderRelative(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")
    .trim();

  if (/^[a-z]:/i.test(normalized) || normalized.startsWith("/") || normalized.includes("..")) {
    return null;
  }

  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment.trim() || /[<>:"|?*]/.test(segment))) {
    return null;
  }

  return segments.join("/");
}

function normalizeOptionalBlock(value: unknown): string | undefined {
  const normalized = normalizeNameBlock(readOptionalString(value));
  return normalized || undefined;
}

function readSchema(value: unknown): FolderNamingPattern | undefined {
  return typeof value === "string" && VALID_SCHEMA_PATTERNS.has(value as FolderNamingPattern)
    ? (value as FolderNamingPattern)
    : undefined;
}

function readDatePrecision(value: unknown): FolderLearningDatePrecision | undefined {
  return value === "day" || value === "month" || value === "year" ? value : undefined;
}

function readDetailUsage(value: unknown): FolderLearningPreferenceDetailUsage | undefined {
  return value === "never" || value === "sometimes" || value === "often" ? value : undefined;
}

function readPositiveInteger(value: unknown): number | null {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 1) {
    return null;
  }

  return Math.min(value, 1_000_000);
}

function normalizeIsoDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function createEmptyPreferencesFile(): FolderLearningPreferencesFile {
  return {
    version: PREFERENCES_VERSION,
    preferences: []
  };
}

function isFolderLearningPreference(value: FolderLearningPreference | null): value is FolderLearningPreference {
  return value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
