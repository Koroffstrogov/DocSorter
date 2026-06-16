import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import "./defaultNamingSuggestionRules";
import "./namingSuggestionRulesCatalog";

export type UserRulesErrorCode =
  | "USER_RULES_NOT_FOUND"
  | "USER_RULES_INVALID_JSON"
  | "USER_RULES_INVALID_SCHEMA"
  | "USER_RULES_READ_FAILED"
  | "USER_RULES_WRITE_FAILED"
  | "USER_RULES_BACKUP_FAILED"
  | "UNKNOWN_ERROR";

export interface UserRulesError {
  code: UserRulesErrorCode;
  message: string;
}

export type UserRulesResult<T> = { ok: true; value: T } | { ok: false; error: UserRulesError };

export type UserRulesFileStatus = "loaded" | "created" | "invalid" | "read-error";

export interface UserRulesLoadResult {
  catalog: NamingSuggestionRulesCatalog;
  userRulesPath: string;
  created: boolean;
}

export interface NamingRulesStatus {
  status: UserRulesFileStatus;
  message: string;
  userRulesPath: string;
  userCatalog: NamingSuggestionRulesCatalog;
  mergedCatalog: NamingSuggestionRulesCatalog;
  defaultRuleCount: number;
  userRuleCount: number;
  warning: UserRulesError | null;
}

export function getUserRulesPath(userDataPath: string): string {
  return path.join(userDataPath, "config", "naming-suggestion-rules.json");
}

export async function ensureUserRulesFile(userDataPath: string): Promise<UserRulesResult<{ created: boolean }>> {
  const rulesPath = getUserRulesPath(userDataPath);

  try {
    await access(rulesPath);
    return { ok: true, value: { created: false } };
  } catch (error) {
    if (!isNotFoundError(error)) {
      return failure("USER_RULES_READ_FAILED", "Impossible d'accéder au fichier de règles utilisateur.");
    }
  }

  try {
    await mkdir(path.dirname(rulesPath), { recursive: true });
    await writeFile(rulesPath, `${JSON.stringify(createEmptyRulesCatalog(), null, 2)}\n`, "utf8");
    return { ok: true, value: { created: true } };
  } catch {
    return failure("USER_RULES_WRITE_FAILED", "Impossible de créer le fichier de règles utilisateur.");
  }
}

export async function loadUserRulesCatalog(
  userDataPath: string
): Promise<UserRulesResult<UserRulesLoadResult>> {
  const rulesPath = getUserRulesPath(userDataPath);
  const ensureResult = await ensureUserRulesFile(userDataPath);

  if (!ensureResult.ok) {
    return ensureResult;
  }

  let rawCatalog = "";
  try {
    rawCatalog = await readFile(rulesPath, "utf8");
  } catch (error) {
    return failure(
      isNotFoundError(error) ? "USER_RULES_NOT_FOUND" : "USER_RULES_READ_FAILED",
      "Impossible de lire le fichier de règles utilisateur."
    );
  }

  let parsedCatalog: unknown;
  try {
    parsedCatalog = JSON.parse(rawCatalog);
  } catch {
    return failure("USER_RULES_INVALID_JSON", "Le fichier de règles utilisateur n'est pas un JSON valide.");
  }

  const validation = globalThis.DocSorterNamingSuggestionRulesCatalog.validateNamingSuggestionRulesCatalog(
    parsedCatalog
  );
  if (!validation.isValid || !validation.catalog) {
    return failure("USER_RULES_INVALID_SCHEMA", "Le fichier de règles utilisateur ne respecte pas le schéma.");
  }

  const duplicateId = findForbiddenUserRuleId(validation.catalog);
  if (duplicateId) {
    return failure(
      "USER_RULES_INVALID_SCHEMA",
      `L'identifiant de règle utilisateur '${duplicateId}' est déjà utilisé.`
    );
  }

  return {
    ok: true,
    value: {
      catalog: validation.catalog,
      userRulesPath: rulesPath,
      created: ensureResult.value.created
    }
  };
}

export async function saveUserRulesCatalog(
  userDataPath: string,
  catalog: NamingSuggestionRulesCatalog
): Promise<UserRulesResult<void>> {
  const validation = globalThis.DocSorterNamingSuggestionRulesCatalog.validateNamingSuggestionRulesCatalog(
    catalog
  );
  if (!validation.isValid || !validation.catalog) {
    return failure("USER_RULES_INVALID_SCHEMA", "Les règles utilisateur ne respectent pas le schéma.");
  }

  const duplicateId = findForbiddenUserRuleId(validation.catalog);
  if (duplicateId) {
    return failure(
      "USER_RULES_INVALID_SCHEMA",
      `L'identifiant de règle utilisateur '${duplicateId}' est déjà utilisé.`
    );
  }

  const rulesPath = getUserRulesPath(userDataPath);
  const temporaryPath = `${rulesPath}.tmp`;

  try {
    await mkdir(path.dirname(rulesPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(validation.catalog, null, 2)}\n`, "utf8");
    await rename(temporaryPath, rulesPath);
    return { ok: true, value: undefined };
  } catch {
    return failure("USER_RULES_WRITE_FAILED", "Impossible de sauvegarder les règles utilisateur.");
  }
}

export async function loadMergedNamingRulesCatalog(
  userDataPath: string
): Promise<UserRulesResult<NamingRulesStatus>> {
  const defaultCatalog =
    globalThis.DocSorterNamingSuggestionRulesCatalog.getDefaultNamingSuggestionRulesCatalog();
  const userRulesPath = getUserRulesPath(userDataPath);
  const userRules = await loadUserRulesCatalog(userDataPath);

  if (!userRules.ok) {
    return {
      ok: true,
      value: createNamingRulesStatus({
        status: userRules.error.code === "USER_RULES_INVALID_JSON" ||
          userRules.error.code === "USER_RULES_INVALID_SCHEMA"
          ? "invalid"
          : "read-error",
        message: "Règles par défaut utilisées. Les règles utilisateur ne sont pas chargées.",
        userRulesPath,
        defaultCatalog,
        userCatalog: createEmptyRulesCatalog(),
        warning: userRules.error
      })
    };
  }

  const mergedCatalog = globalThis.DocSorterNamingSuggestionRulesCatalog.mergeNamingSuggestionRulesCatalogs(
    defaultCatalog,
    userRules.value.catalog
  );

  return {
    ok: true,
    value: {
      status: userRules.value.created ? "created" : "loaded",
      message: userRules.value.created
        ? "Fichier de règles utilisateur créé."
        : "Règles utilisateur chargées.",
      userRulesPath: userRules.value.userRulesPath,
      userCatalog: userRules.value.catalog,
      mergedCatalog,
      defaultRuleCount: countRules(defaultCatalog),
      userRuleCount: countRules(userRules.value.catalog),
      warning: null
    }
  };
}

function createNamingRulesStatus(options: {
  status: UserRulesFileStatus;
  message: string;
  userRulesPath: string;
  defaultCatalog: NamingSuggestionRulesCatalog;
  userCatalog: NamingSuggestionRulesCatalog;
  warning: UserRulesError | null;
}): NamingRulesStatus {
  return {
    status: options.status,
    message: options.message,
    userRulesPath: options.userRulesPath,
    userCatalog: options.userCatalog,
    mergedCatalog: options.defaultCatalog,
    defaultRuleCount: countRules(options.defaultCatalog),
    userRuleCount: countRules(options.userCatalog),
    warning: options.warning
  };
}

function findForbiddenUserRuleId(catalog: NamingSuggestionRulesCatalog): string | null {
  const defaultIds = new Set(collectRuleIds(globalThis.DocSorterDefaultNamingSuggestionRules));
  const userIds = new Set<string>();

  for (const id of collectRuleIds(catalog)) {
    if (defaultIds.has(id)) {
      return id;
    }

    if (userIds.has(id)) {
      return id;
    }

    userIds.add(id);
  }

  return null;
}

function collectRuleIds(catalog: NamingSuggestionRulesCatalog): string[] {
  return [
    ...catalog.documentTypeRules.map((rule) => rule.id),
    ...catalog.subjectRules.map((rule) => rule.id),
    ...catalog.keywordRules.map((rule) => rule.id ?? "").filter(Boolean)
  ];
}

function countRules(catalog: NamingSuggestionRulesCatalog): number {
  return (
    catalog.documentTypeRules.length + catalog.subjectRules.length + catalog.keywordRules.length
  );
}

function createEmptyRulesCatalog(): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: []
  };
}

function failure(code: UserRulesErrorCode, message: string): UserRulesResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function isNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
