import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type KnownTargetKind = "person" | "household" | "vehicle" | "property" | "other";

export interface KnownTarget {
  id: string;
  kind: KnownTargetKind;
  displayName: string;
  fileAlias: string;
  aliases: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnownTargetInput = Partial<Omit<KnownTarget, "id" | "createdAt" | "updatedAt">> & {
  id?: string;
};

export interface KnownTargetsCatalog {
  version: 1;
  targets: KnownTarget[];
}

export interface KnownTargetsList {
  targets: KnownTarget[];
  warnings: string[];
}

export interface KnownTargetsError {
  code:
    | "KNOWN_TARGET_INVALID"
    | "KNOWN_TARGET_DUPLICATE"
    | "KNOWN_TARGET_NOT_FOUND"
    | "KNOWN_TARGETS_WRITE_FAILED";
  message: string;
  field?: string;
}

export type KnownTargetsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: KnownTargetsError };

const TARGETS_VERSION = 1;
const MAX_TARGETS = 500;
const MAX_NAME_LENGTH = 120;
const MAX_ALIAS_LENGTH = 80;
const MAX_ALIASES = 20;

const KIND_VALUES = new Set<KnownTargetKind>([
  "person",
  "household",
  "vehicle",
  "property",
  "other"
]);

export function getKnownTargetsPath(userDataPath: string): string {
  return path.join(userDataPath, "config", "known-targets.json");
}

export async function listKnownTargets(userDataPath: string): Promise<KnownTargetsResult<KnownTargetsList>> {
  const loaded = await loadKnownTargetsCatalog(userDataPath);
  if (!loaded.ok) {
    return loaded;
  }

  return {
    ok: true,
    value: {
      targets: [...loaded.value.catalog.targets],
      warnings: loaded.value.warnings
    }
  };
}

export async function createKnownTarget(
  userDataPath: string,
  input: KnownTargetInput,
  now: () => Date = () => new Date()
): Promise<KnownTargetsResult<KnownTargetsList>> {
  const loaded = await loadKnownTargetsCatalog(userDataPath);
  if (!loaded.ok) {
    return loaded;
  }

  const normalized = normalizeKnownTargetInput(input, now().toISOString());
  if (!normalized.ok) {
    return normalized;
  }

  const duplicate = findDuplicateFileAlias(loaded.value.catalog.targets, normalized.value.fileAlias);
  if (duplicate) {
    return knownTargetsFailure("KNOWN_TARGET_DUPLICATE", "Alias fichier déjà utilisé.", "fileAlias");
  }

  const catalog: KnownTargetsCatalog = {
    version: TARGETS_VERSION,
    targets: [...loaded.value.catalog.targets, normalized.value]
  };
  return saveAndListKnownTargets(userDataPath, catalog);
}

export async function updateKnownTarget(
  userDataPath: string,
  id: string,
  input: KnownTargetInput,
  now: () => Date = () => new Date()
): Promise<KnownTargetsResult<KnownTargetsList>> {
  const loaded = await loadKnownTargetsCatalog(userDataPath);
  if (!loaded.ok) {
    return loaded;
  }

  const existing = loaded.value.catalog.targets.find((target) => target.id === id);
  if (!existing) {
    return knownTargetsFailure("KNOWN_TARGET_NOT_FOUND", "Cible locale introuvable.", "id");
  }

  const normalized = normalizeKnownTargetInput(
    {
      ...existing,
      ...input,
      id: existing.id,
      isActive: typeof input.isActive === "boolean" ? input.isActive : existing.isActive
    },
    now().toISOString(),
    existing
  );
  if (!normalized.ok) {
    return normalized;
  }

  const duplicate = findDuplicateFileAlias(
    loaded.value.catalog.targets.filter((target) => target.id !== existing.id),
    normalized.value.fileAlias
  );
  if (duplicate) {
    return knownTargetsFailure("KNOWN_TARGET_DUPLICATE", "Alias fichier déjà utilisé.", "fileAlias");
  }

  const catalog: KnownTargetsCatalog = {
    version: TARGETS_VERSION,
    targets: loaded.value.catalog.targets.map((target) =>
      target.id === existing.id ? normalized.value : target
    )
  };
  return saveAndListKnownTargets(userDataPath, catalog);
}

export async function deactivateKnownTarget(
  userDataPath: string,
  id: string,
  now: () => Date = () => new Date()
): Promise<KnownTargetsResult<KnownTargetsList>> {
  const loaded = await loadKnownTargetsCatalog(userDataPath);
  if (!loaded.ok) {
    return loaded;
  }

  let found = false;
  const updatedAt = now().toISOString();
  const catalog: KnownTargetsCatalog = {
    version: TARGETS_VERSION,
    targets: loaded.value.catalog.targets.map((target) => {
      if (target.id !== id) {
        return target;
      }
      found = true;
      return {
        ...target,
        isActive: false,
        updatedAt
      };
    })
  };

  if (!found) {
    return knownTargetsFailure("KNOWN_TARGET_NOT_FOUND", "Cible locale introuvable.", "id");
  }

  return saveAndListKnownTargets(userDataPath, catalog);
}

export async function deleteKnownTarget(
  userDataPath: string,
  id: string
): Promise<KnownTargetsResult<KnownTargetsList>> {
  const loaded = await loadKnownTargetsCatalog(userDataPath);
  if (!loaded.ok) {
    return loaded;
  }

  const nextTargets = loaded.value.catalog.targets.filter((target) => target.id !== id);
  if (nextTargets.length === loaded.value.catalog.targets.length) {
    return knownTargetsFailure("KNOWN_TARGET_NOT_FOUND", "Cible locale introuvable.", "id");
  }

  return saveAndListKnownTargets(userDataPath, {
    version: TARGETS_VERSION,
    targets: nextTargets
  });
}

export function normalizeKnownTargetFileAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ALIAS_LENGTH);
}

async function loadKnownTargetsCatalog(
  userDataPath: string
): Promise<KnownTargetsResult<{ catalog: KnownTargetsCatalog; warnings: string[] }>> {
  const targetsPath = getKnownTargetsPath(userDataPath);
  let rawValue = "";
  try {
    rawValue = await readFile(targetsPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        ok: true,
        value: {
          catalog: { version: TARGETS_VERSION, targets: [] },
          warnings: []
        }
      };
    }

    return {
      ok: true,
      value: {
        catalog: { version: TARGETS_VERSION, targets: [] },
        warnings: ["Liste locale des cibles illisible : liste vide utilisée."]
      }
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    const normalized = normalizeKnownTargetsCatalog(parsed);
    return {
      ok: true,
      value: {
        catalog: normalized.catalog,
        warnings: normalized.warnings
      }
    };
  } catch {
    return {
      ok: true,
      value: {
        catalog: { version: TARGETS_VERSION, targets: [] },
        warnings: ["Liste locale des cibles invalide : liste vide utilisée."]
      }
    };
  }
}

function normalizeKnownTargetsCatalog(value: unknown): {
  catalog: KnownTargetsCatalog;
  warnings: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      catalog: { version: TARGETS_VERSION, targets: [] },
      warnings: ["Liste locale des cibles invalide : liste vide utilisée."]
    };
  }

  const input = value as { targets?: unknown };
  const rows = Array.isArray(input.targets) ? input.targets.slice(0, MAX_TARGETS) : [];
  const targets: KnownTarget[] = [];
  const warnings: string[] = [];
  const seenAliases = new Set<string>();

  rows.forEach((row, index) => {
    const normalized = normalizeKnownTargetRecord(row);
    if (!normalized.ok) {
      warnings.push(`Cible locale ${index + 1} ignorée : ${normalized.error.message}`);
      return;
    }

    if (seenAliases.has(normalized.value.fileAlias)) {
      warnings.push(`Cible locale ${index + 1} ignorée : alias fichier en doublon.`);
      return;
    }

    seenAliases.add(normalized.value.fileAlias);
    targets.push(normalized.value);
  });

  return {
    catalog: {
      version: TARGETS_VERSION,
      targets
    },
    warnings
  };
}

function normalizeKnownTargetRecord(value: unknown): KnownTargetsResult<KnownTarget> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return knownTargetsFailure("KNOWN_TARGET_INVALID", "entrée invalide.");
  }

  const input = value as Record<string, unknown>;
  const createdAt = readIsoDate(input.createdAt) || new Date(0).toISOString();
  return normalizeKnownTargetInput(
    {
      id: readString(input.id),
      kind: readString(input.kind) as KnownTargetKind,
      displayName: readString(input.displayName),
      fileAlias: readString(input.fileAlias),
      aliases: readAliases(input.aliases),
      isActive: typeof input.isActive === "boolean" ? input.isActive : true
    },
    readIsoDate(input.updatedAt) || createdAt,
    {
      id: readString(input.id),
      kind: "other",
      displayName: "",
      fileAlias: "",
      aliases: [],
      isActive: true,
      createdAt,
      updatedAt: createdAt
    }
  );
}

function normalizeKnownTargetInput(
  input: KnownTargetInput,
  timestamp: string,
  existing?: KnownTarget
): KnownTargetsResult<KnownTarget> {
  const rawDisplayName = readString(input.displayName).slice(0, MAX_NAME_LENGTH);
  const rawFileAlias = readString(input.fileAlias).slice(0, MAX_ALIAS_LENGTH);
  const aliasSource = rawFileAlias || rawDisplayName;
  if (!aliasSource) {
    return knownTargetsFailure("KNOWN_TARGET_INVALID", "Alias nom requis.", "fileAlias");
  }

  const kind = KIND_VALUES.has(input.kind as KnownTargetKind)
    ? input.kind as KnownTargetKind
    : "other";
  const fileAlias = normalizeKnownTargetFileAlias(aliasSource);
  if (!isSafeFileAlias(fileAlias)) {
    return knownTargetsFailure("KNOWN_TARGET_INVALID", "Alias fichier invalide.", "fileAlias");
  }

  const id = existing?.id || createKnownTargetId(fileAlias);
  const displayName = fileAlias;
  const aliases = normalizeAliases(
    [...readAliases(input.aliases), rawDisplayName].filter(Boolean),
    displayName,
    fileAlias
  );
  const createdAt = existing?.createdAt || timestamp;

  return {
    ok: true,
    value: {
      id,
      kind,
      displayName,
      fileAlias,
      aliases,
      isActive: typeof input.isActive === "boolean" ? input.isActive : true,
      createdAt,
      updatedAt: timestamp
    }
  };
}

function normalizeAliases(
  input: unknown,
  displayName: string,
  fileAlias: string
): string[] {
  const values = readAliases(input);
  const aliases = [displayName, fileAlias, ...values]
    .map((value) => value.trim().slice(0, MAX_NAME_LENGTH))
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const alias of aliases) {
    const key = alias
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(alias);
    if (result.length >= MAX_ALIASES) {
      break;
    }
  }
  return result;
}

function readAliases(value: unknown): string[] {
  const values = typeof value === "string"
    ? value.split(/[,;\r\n]+/)
    : Array.isArray(value)
      ? value.flatMap((alias) => typeof alias === "string" ? alias.split(/[,;\r\n]+/) : [])
      : [];
  return values.map(readString).filter(Boolean);
}

function isSafeFileAlias(value: string): boolean {
  return Boolean(
    value &&
      value.length <= MAX_ALIAS_LENGTH &&
      /^[a-z0-9][a-z0-9-]*$/.test(value) &&
      !value.includes("..") &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !/^[a-z]:/i.test(value) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)
  );
}

function findDuplicateFileAlias(targets: KnownTarget[], fileAlias: string): KnownTarget | null {
  return targets.find((target) => target.fileAlias.toLowerCase() === fileAlias.toLowerCase()) ?? null;
}

async function saveAndListKnownTargets(
  userDataPath: string,
  catalog: KnownTargetsCatalog
): Promise<KnownTargetsResult<KnownTargetsList>> {
  const writeResult = await writeKnownTargetsCatalog(userDataPath, catalog);
  if (!writeResult.ok) {
    return writeResult;
  }

  return {
    ok: true,
    value: {
      targets: [...catalog.targets],
      warnings: []
    }
  };
}

async function writeKnownTargetsCatalog(
  userDataPath: string,
  catalog: KnownTargetsCatalog
): Promise<KnownTargetsResult<void>> {
  const targetsPath = getKnownTargetsPath(userDataPath);
  const temporaryPath = `${targetsPath}.tmp`;
  try {
    await mkdir(path.dirname(targetsPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    await rename(temporaryPath, targetsPath);
    return { ok: true, value: undefined };
  } catch {
    return knownTargetsFailure("KNOWN_TARGETS_WRITE_FAILED", "Impossible de sauvegarder la liste locale des cibles.");
  }
}

function createKnownTargetId(fileAlias: string): string {
  return fileAlias;
}

function knownTargetsFailure<T = never>(
  code: KnownTargetsError["code"],
  message: string,
  field?: string
): KnownTargetsResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(field ? { field } : {})
    }
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readIsoDate(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as NodeJS.ErrnoException).code === "ENOENT" ||
        (error as NodeJS.ErrnoException).code === "ENOTDIR")
  );
}
