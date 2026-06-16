import { readFile } from "node:fs/promises";
import path from "node:path";

import { defaultDocumentTypes } from "./defaultDocumentTypes";
import type {
  DocumentTypeReference,
  PersonReference,
  PropertyReference,
  ProviderReference,
  ReferenceDataCatalog,
  ReferenceDataValidationError,
  VehicleReference
} from "./referenceDataTypes";
import {
  validateDocumentTypeReferences,
  validatePeopleReferences,
  validatePropertyReferences,
  validateProviderReferences,
  validateReferenceDataCatalog,
  validateVehicleReferences
} from "./referenceDataValidation";

export type ReferenceDataLoadErrorCode =
  | "REFERENCE_DATA_INVALID_JSON"
  | "REFERENCE_DATA_INVALID_SCHEMA"
  | "REFERENCE_DATA_READ_FAILED";

export interface ReferenceDataConfigPaths {
  peoplePath: string;
  vehiclesPath: string;
  propertiesPath: string;
  providersPath: string;
  documentTypesPath: string;
}

export interface ReferenceDataLoadError {
  code: ReferenceDataLoadErrorCode;
  message: string;
  filePath: string;
  details?: ReferenceDataValidationError[];
}

export type LoadReferenceDataResult =
  | {
      ok: true;
      status: "ready";
      catalog: ReferenceDataCatalog;
      paths: ReferenceDataConfigPaths;
      warnings: string[];
    }
  | {
      ok: false;
      status: "blocked";
      errors: ReferenceDataLoadError[];
      paths: ReferenceDataConfigPaths;
      warnings: string[];
    };

type ReadJsonResult =
  | { state: "loaded"; value: unknown }
  | { state: "missing" }
  | { state: "invalid-json" }
  | { state: "read-error" };

export async function loadReferenceDataCatalog(
  baseConfigPath: string
): Promise<LoadReferenceDataResult> {
  const paths = getReferenceDataConfigPaths(baseConfigPath);
  const warnings: string[] = [];
  const errors: ReferenceDataLoadError[] = [];

  const [people, vehicles, properties, providers, documentTypes] = await Promise.all([
    readReferenceList<PersonReference>(
      paths.peoplePath,
      "people",
      validatePeopleReferences,
      warnings,
      errors
    ),
    readReferenceList<VehicleReference>(
      paths.vehiclesPath,
      "vehicles",
      validateVehicleReferences,
      warnings,
      errors
    ),
    readReferenceList<PropertyReference>(
      paths.propertiesPath,
      "properties",
      validatePropertyReferences,
      warnings,
      errors
    ),
    readReferenceList<ProviderReference>(
      paths.providersPath,
      "providers",
      validateProviderReferences,
      warnings,
      errors
    ),
    readDocumentTypes(paths.documentTypesPath, warnings, errors)
  ]);

  if (errors.length > 0) {
    return {
      ok: false,
      status: "blocked",
      errors,
      paths,
      warnings
    };
  }

  const catalog: ReferenceDataCatalog = {
    version: 1,
    people,
    vehicles,
    properties,
    providers,
    documentTypes
  };

  const validation = validateReferenceDataCatalog(catalog);
  if (!validation.isValid || !validation.catalog) {
    return {
      ok: false,
      status: "blocked",
      errors: [
        {
          code: "REFERENCE_DATA_INVALID_SCHEMA",
          message: "Le catalogue de référentiels ne respecte pas le schéma.",
          filePath: baseConfigPath,
          details: validation.errors
        }
      ],
      paths,
      warnings
    };
  }

  return {
    ok: true,
    status: "ready",
    catalog: validation.catalog,
    paths,
    warnings
  };
}

export function getReferenceDataConfigPaths(baseConfigPath: string): ReferenceDataConfigPaths {
  return {
    peoplePath: path.join(baseConfigPath, "entities", "people.json"),
    vehiclesPath: path.join(baseConfigPath, "entities", "vehicles.json"),
    propertiesPath: path.join(baseConfigPath, "entities", "properties.json"),
    providersPath: path.join(baseConfigPath, "entities", "providers.json"),
    documentTypesPath: path.join(baseConfigPath, "document-types.json")
  };
}

async function readReferenceList<T>(
  filePath: string,
  category: string,
  validate: (input: unknown) => { values: T[]; errors: ReferenceDataValidationError[] },
  warnings: string[],
  errors: ReferenceDataLoadError[]
): Promise<T[]> {
  const readResult = await readJsonIfExists(filePath);

  if (readResult.state === "missing") {
    warnings.push(`Référentiel ${category} absent : liste vide utilisée.`);
    return [];
  }

  if (readResult.state === "invalid-json") {
    errors.push({
      code: "REFERENCE_DATA_INVALID_JSON",
      message: "Le référentiel n'est pas un JSON valide.",
      filePath
    });
    return [];
  }

  if (readResult.state === "read-error") {
    errors.push({
      code: "REFERENCE_DATA_READ_FAILED",
      message: "Lecture du référentiel impossible.",
      filePath
    });
    return [];
  }

  const validation = validate(readResult.value);
  if (validation.errors.length > 0) {
    errors.push({
      code: "REFERENCE_DATA_INVALID_SCHEMA",
      message: "Le référentiel ne respecte pas le schéma.",
      filePath,
      details: validation.errors
    });
    return [];
  }

  return validation.values;
}

async function readDocumentTypes(
  filePath: string,
  warnings: string[],
  errors: ReferenceDataLoadError[]
): Promise<DocumentTypeReference[]> {
  const defaultValidation = validateDocumentTypeReferences(defaultDocumentTypes);
  const defaults = defaultValidation.values;
  const readResult = await readJsonIfExists(filePath);

  if (readResult.state === "missing") {
    warnings.push("Référentiel documentTypes absent : types par défaut utilisés.");
    return defaults;
  }

  if (readResult.state === "invalid-json") {
    errors.push({
      code: "REFERENCE_DATA_INVALID_JSON",
      message: "Le référentiel de types documentaires n'est pas un JSON valide.",
      filePath
    });
    return defaults;
  }

  if (readResult.state === "read-error") {
    errors.push({
      code: "REFERENCE_DATA_READ_FAILED",
      message: "Lecture du référentiel de types documentaires impossible.",
      filePath
    });
    return defaults;
  }

  const userValidation = validateDocumentTypeReferences(readResult.value);
  if (userValidation.errors.length > 0) {
    errors.push({
      code: "REFERENCE_DATA_INVALID_SCHEMA",
      message: "Le référentiel de types documentaires ne respecte pas le schéma.",
      filePath,
      details: userValidation.errors
    });
    return defaults;
  }

  return mergeDocumentTypes(defaults, userValidation.values);
}

function mergeDocumentTypes(
  defaultTypes: DocumentTypeReference[],
  userTypes: DocumentTypeReference[]
): DocumentTypeReference[] {
  const byId = new Map<string, DocumentTypeReference>();

  for (const documentType of defaultTypes) {
    byId.set(documentType.id, documentType);
  }

  for (const documentType of userTypes) {
    byId.set(documentType.id, documentType);
  }

  return Array.from(byId.values());
}

async function readJsonIfExists(filePath: string): Promise<ReadJsonResult> {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    return isNotFoundError(error) ? { state: "missing" } : { state: "read-error" };
  }

  try {
    return {
      state: "loaded",
      value: JSON.parse(raw) as unknown
    };
  } catch {
    return { state: "invalid-json" };
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
