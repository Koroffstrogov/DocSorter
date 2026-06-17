import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadReferenceDataCatalog } from "./referenceDataLoader";
import type { ReferenceDataValidationError } from "./referenceDataTypes";
import {
  validateDocumentTypeReferences,
  validatePeopleReferences,
  validatePropertyReferences,
  validateProviderReferences,
  validateVehicleReferences
} from "./referenceDataValidation";

export type ReferenceDataFileKey =
  | "people"
  | "vehicles"
  | "properties"
  | "providers"
  | "documentTypes";

export type ReferenceDataFileStatus = "absent" | "valid" | "invalid" | "read-error";

export type ReferenceDataStoreErrorCode =
  | "REFERENCE_DATA_FILE_NOT_ALLOWED"
  | "REFERENCE_DATA_DIRECTORY_MISSING"
  | "REFERENCE_DATA_OPEN_FAILED"
  | "REFERENCE_DATA_INVALID_JSON"
  | "REFERENCE_DATA_INVALID_SCHEMA"
  | "REFERENCE_DATA_WRITE_FAILED"
  | "REFERENCE_DATA_READ_FAILED";

export interface ReferenceDataFileInfo {
  key: ReferenceDataFileKey;
  label: string;
  relativePath: string;
  status: ReferenceDataFileStatus;
  content: string;
  entryCount: number;
  errors: ReferenceDataValidationError[];
  warnings: string[];
}

export interface ReferenceDataOverview {
  basePath: string;
  files: ReferenceDataFileInfo[];
  catalogStatus: "ready" | "blocked";
  catalogWarnings: string[];
}

export type ReferenceDataStoreResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: {
        code: ReferenceDataStoreErrorCode;
        message: string;
        fileKey?: ReferenceDataFileKey;
        details?: ReferenceDataValidationError[];
      };
    };

interface ReferenceDataFileDefinition {
  key: ReferenceDataFileKey;
  label: string;
  relativePath: string;
  validate: (input: unknown) => {
    values: unknown[];
    errors: ReferenceDataValidationError[];
    warnings: string[];
  };
}

const REFERENCE_DATA_FILES: ReferenceDataFileDefinition[] = [
  {
    key: "people",
    label: "Personnes",
    relativePath: path.join("entities", "people.json"),
    validate: validatePeopleReferences
  },
  {
    key: "vehicles",
    label: "Véhicules",
    relativePath: path.join("entities", "vehicles.json"),
    validate: validateVehicleReferences
  },
  {
    key: "properties",
    label: "Biens",
    relativePath: path.join("entities", "properties.json"),
    validate: validatePropertyReferences
  },
  {
    key: "providers",
    label: "Fournisseurs",
    relativePath: path.join("entities", "providers.json"),
    validate: validateProviderReferences
  },
  {
    key: "documentTypes",
    label: "Types documentaires",
    relativePath: "document-types.json",
    validate: validateDocumentTypeReferences
  }
];

export async function getReferenceDataOverview(
  userDataPath: string
): Promise<ReferenceDataStoreResult<ReferenceDataOverview>> {
  const basePath = getReferenceDataBasePath(userDataPath);
  const files = await Promise.all(
    REFERENCE_DATA_FILES.map((definition) => readReferenceDataFile(basePath, definition))
  );
  const catalog = await loadReferenceDataCatalog(basePath);

  return {
    ok: true,
    value: {
      basePath,
      files,
      catalogStatus: catalog.ok ? "ready" : "blocked",
      catalogWarnings: catalog.warnings
    }
  };
}

export async function reloadReferenceDataOverview(
  userDataPath: string
): Promise<ReferenceDataStoreResult<ReferenceDataOverview>> {
  return getReferenceDataOverview(userDataPath);
}

export async function createMissingReferenceDataFiles(
  userDataPath: string
): Promise<ReferenceDataStoreResult<ReferenceDataOverview>> {
  const basePath = getReferenceDataBasePath(userDataPath);

  try {
    for (const definition of REFERENCE_DATA_FILES) {
      const filePath = getReferenceDataFilePath(basePath, definition);
      if (await fileExists(filePath)) {
        continue;
      }

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, "[]\n", "utf8");
    }
  } catch {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_WRITE_FAILED",
        message: "Création des fichiers de référentiels impossible."
      }
    };
  }

  return getReferenceDataOverview(userDataPath);
}

export async function validateReferenceDataFileContent(
  fileKey: unknown,
  content: unknown
): Promise<ReferenceDataStoreResult<ReferenceDataFileInfo>> {
  const definition = getReferenceDataFileDefinition(fileKey);
  if (!definition) {
    return createFileNotAllowedError();
  }

  return validateReferenceDataFileContentSync(definition, content);
}

export async function saveReferenceDataFile(
  userDataPath: string,
  fileKey: unknown,
  content: unknown
): Promise<ReferenceDataStoreResult<ReferenceDataFileInfo>> {
  const definition = getReferenceDataFileDefinition(fileKey);
  if (!definition) {
    return createFileNotAllowedError();
  }

  const validation = validateReferenceDataFileContentSync(definition, content);
  if (!validation.ok) {
    return validation;
  }

  const basePath = getReferenceDataBasePath(userDataPath);
  const filePath = getReferenceDataFilePath(basePath, definition);
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${validation.value.content.trimEnd()}\n`, "utf8");
  } catch {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_WRITE_FAILED",
        message: "Sauvegarde du référentiel impossible.",
        fileKey: definition.key
      }
    };
  }

  return readReferenceDataFile(basePath, definition).then((file) => ({
    ok: true,
    value: file
  }));
}

export async function openReferenceDataDirectory(
  userDataPath: string,
  openPath: (directoryPath: string) => Promise<string>
): Promise<ReferenceDataStoreResult<{ path: string }>> {
  const basePath = getReferenceDataBasePath(userDataPath);
  if (!(await directoryExists(basePath))) {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_DIRECTORY_MISSING",
        message: "Le dossier des référentiels n'existe pas encore."
      }
    };
  }

  const errorMessage = await openPath(basePath);
  if (errorMessage) {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_OPEN_FAILED",
        message: "Ouverture du dossier des référentiels impossible."
      }
    };
  }

  return {
    ok: true,
    value: {
      path: basePath
    }
  };
}

export function getReferenceDataBasePath(userDataPath: string): string {
  return path.join(userDataPath, "config", "reference-data");
}

function validateReferenceDataFileContentSync(
  definition: ReferenceDataFileDefinition,
  content: unknown
): ReferenceDataStoreResult<ReferenceDataFileInfo> {
  if (typeof content !== "string") {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_INVALID_JSON",
        message: "Le contenu du référentiel doit être du texte JSON.",
        fileKey: definition.key
      }
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_INVALID_JSON",
        message: "Le référentiel n'est pas un JSON valide.",
        fileKey: definition.key
      }
    };
  }

  const validation = definition.validate(parsed);
  if (validation.errors.length > 0) {
    return {
      ok: false,
      error: {
        code: "REFERENCE_DATA_INVALID_SCHEMA",
        message: "Le référentiel ne respecte pas le schéma.",
        fileKey: definition.key,
        details: validation.errors
      }
    };
  }

  return {
    ok: true,
    value: {
      key: definition.key,
      label: definition.label,
      relativePath: definition.relativePath.replace(/\\/g, "/"),
      status: "valid",
      content: `${JSON.stringify(validation.values, null, 2)}\n`,
      entryCount: validation.values.length,
      errors: [],
      warnings: validation.warnings
    }
  };
}

async function readReferenceDataFile(
  basePath: string,
  definition: ReferenceDataFileDefinition
): Promise<ReferenceDataFileInfo> {
  const filePath = getReferenceDataFilePath(basePath, definition);
  try {
    const content = await readFile(filePath, "utf8");
    const validation = validateReferenceDataFileContentSync(definition, content);
    if (validation.ok) {
      return validation.value;
    }

    return {
      key: definition.key,
      label: definition.label,
      relativePath: definition.relativePath.replace(/\\/g, "/"),
      status: "invalid",
      content,
      entryCount: 0,
      errors: validation.error.details ?? [
        {
          category: definition.key,
          field: "root",
          message: validation.error.message
        }
      ],
      warnings: []
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        key: definition.key,
        label: definition.label,
        relativePath: definition.relativePath.replace(/\\/g, "/"),
        status: "absent",
        content: "[]\n",
        entryCount: 0,
        errors: [],
        warnings: []
      };
    }

    return {
      key: definition.key,
      label: definition.label,
      relativePath: definition.relativePath.replace(/\\/g, "/"),
      status: "read-error",
      content: "",
      entryCount: 0,
      errors: [
        {
          category: definition.key,
          field: "root",
          message: "Lecture du référentiel impossible."
        }
      ],
      warnings: []
    };
  }
}

function getReferenceDataFileDefinition(
  fileKey: unknown
): ReferenceDataFileDefinition | null {
  return typeof fileKey === "string"
    ? REFERENCE_DATA_FILES.find((definition) => definition.key === fileKey) ?? null
    : null;
}

function getReferenceDataFilePath(
  basePath: string,
  definition: ReferenceDataFileDefinition
): string {
  return path.join(basePath, definition.relativePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const info = await stat(directoryPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function createFileNotAllowedError<T>(): ReferenceDataStoreResult<T> {
  return {
    ok: false,
    error: {
      code: "REFERENCE_DATA_FILE_NOT_ALLOWED",
      message: "Fichier de référentiel non autorisé."
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
