import { normalizeNameBlock } from "../naming/documentNameV2";
import { normalizeTargetFolderRelative } from "../naming/targetFolder";
import type {
  DocumentTypeReference,
  PersonReference,
  PropertyReference,
  ProviderReference,
  ReferenceDataCatalog,
  ReferenceDataValidationError,
  ReferenceDataValidationResult,
  ReferenceDateRule,
  ReferenceEntryBase,
  ReferenceTargetKind,
  VehicleReference
} from "./referenceDataTypes";

interface ReferenceListValidation<T> {
  values: T[];
  errors: ReferenceDataValidationError[];
  warnings: string[];
}

type BaseEntryWithKind = ReferenceEntryBase | ProviderReference;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_ALIAS_LENGTH = 3;
const TARGET_KINDS = new Set<ReferenceTargetKind>(["person", "vehicle", "property", "foyer"]);
const DATE_RULES = new Set<ReferenceDateRule>([
  "document-date",
  "period-year",
  "unknown-ok"
]);

export function createEmptyReferenceDataCatalog(): ReferenceDataCatalog {
  return {
    version: 1,
    people: [],
    vehicles: [],
    properties: [],
    providers: [],
    documentTypes: []
  };
}

export function validateReferenceDataCatalog(input: unknown): ReferenceDataValidationResult {
  const errors: ReferenceDataValidationError[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return invalid([
      createValidationError("catalog", "root", "Le catalogue de référentiels est invalide.")
    ]);
  }

  if (input.version !== 1) {
    errors.push(createValidationError("catalog", "version", "Version de référentiel non supportée."));
  }

  const people = validatePeopleReferences(input.people);
  const vehicles = validateVehicleReferences(input.vehicles);
  const properties = validatePropertyReferences(input.properties);
  const providers = validateProviderReferences(input.providers);
  const documentTypes = validateDocumentTypeReferences(input.documentTypes);

  for (const validation of [people, vehicles, properties, providers, documentTypes]) {
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
      catalog: null
    };
  }

  return {
    isValid: true,
    errors: [],
    warnings,
    catalog: {
      version: 1,
      people: people.values,
      vehicles: vehicles.values,
      properties: properties.values,
      providers: providers.values,
      documentTypes: documentTypes.values
    }
  };
}

export function validatePeopleReferences(input: unknown): ReferenceListValidation<PersonReference> {
  const base = validateBaseReferenceEntries<PersonReference>(input, "people", true);
  if (base.errors.length > 0) {
    return base;
  }

  const values = base.values.map((entry, index) => {
    const raw = Array.isArray(input) ? input[index] : null;
    const birthDate = isRecord(raw) && typeof raw.birthDate === "string"
      ? raw.birthDate.trim()
      : undefined;
    const useBirthDateForDetectionOnly = isRecord(raw)
      ? raw.useBirthDateForDetectionOnly === true
      : undefined;

    if (birthDate !== undefined && !isRealIsoDate(birthDate)) {
      base.errors.push(
        createValidationError("people", "birthDate", "Date de naissance invalide.", entry.id, index)
      );
    }

    return {
      ...entry,
      ...(birthDate ? { birthDate } : {}),
      ...(useBirthDateForDetectionOnly === true ? { useBirthDateForDetectionOnly } : {})
    };
  });

  return {
    ...base,
    values
  };
}

export function validateVehicleReferences(input: unknown): ReferenceListValidation<VehicleReference> {
  return validateBaseReferenceEntries<VehicleReference>(input, "vehicles", true);
}

export function validatePropertyReferences(input: unknown): ReferenceListValidation<PropertyReference> {
  return validateBaseReferenceEntries<PropertyReference>(input, "properties", true);
}

export function validateProviderReferences(input: unknown): ReferenceListValidation<ProviderReference> {
  const base = validateBaseReferenceEntries<ProviderReference>(input, "providers", false);
  if (base.errors.length > 0) {
    return base;
  }

  const values = base.values.map((entry, index) => {
    const raw = Array.isArray(input) ? input[index] : null;
    const domains = isRecord(raw) && raw.domains !== undefined
      ? normalizeDomains(raw.domains, entry.id, index, base.errors)
      : undefined;

    return {
      id: entry.id,
      label: entry.label,
      fileAlias: entry.fileAlias,
      aliases: entry.aliases,
      ...(entry.enabled === false ? { enabled: false } : {}),
      ...(domains && domains.length > 0 ? { domains } : {})
    };
  });

  return {
    ...base,
    values
  };
}

export function validateDocumentTypeReferences(
  input: unknown
): ReferenceListValidation<DocumentTypeReference> {
  if (!Array.isArray(input)) {
    return {
      values: [],
      errors: [
        createValidationError("documentTypes", "root", "Le référentiel doit être une liste.")
      ],
      warnings: []
    };
  }

  const errors: ReferenceDataValidationError[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const values: DocumentTypeReference[] = [];

  input.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(
        createValidationError("documentTypes", "entry", "Entrée de référentiel invalide.", undefined, index)
      );
      return;
    }

    const id = normalizeRequiredId(entry.id, "documentTypes", index, errors, ids);
    const label = normalizeRequiredString(entry.label, "documentTypes", "label", id, index, errors);
    const fileAlias = normalizeFileAlias(entry.fileAlias, "documentTypes", id, index, errors);
    const aliases = normalizeAliases(
      entry.aliases,
      "documentTypes",
      id,
      index,
      entry.enabled === false,
      errors
    );
    const domain = typeof entry.domain === "string" && entry.domain.trim()
      ? normalizeNameBlock(entry.domain)
      : undefined;
    const defaultTargetKind = normalizeEnumField(
      entry.defaultTargetKind,
      TARGET_KINDS,
      "documentTypes",
      "defaultTargetKind",
      id,
      index,
      errors
    );
    const defaultDateRule = normalizeEnumField(
      entry.defaultDateRule,
      DATE_RULES,
      "documentTypes",
      "defaultDateRule",
      id,
      index,
      errors
    );

    if (!id || !label || !fileAlias) {
      return;
    }

    values.push({
      id,
      label,
      fileAlias,
      aliases,
      ...(domain ? { domain } : {}),
      ...(defaultTargetKind ? { defaultTargetKind } : {}),
      ...(defaultDateRule ? { defaultDateRule } : {}),
      ...(entry.enabled === false ? { enabled: false } : {})
    });
  });

  return {
    values,
    errors,
    warnings
  };
}

export function normalizeAliasForDetection(value: string): string {
  return removeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateBaseReferenceEntries<T extends BaseEntryWithKind>(
  input: unknown,
  category: string,
  allowFolderAlias: boolean
): ReferenceListValidation<T> {
  if (!Array.isArray(input)) {
    return {
      values: [],
      errors: [createValidationError(category, "root", "Le référentiel doit être une liste.")],
      warnings: []
    };
  }

  const errors: ReferenceDataValidationError[] = [];
  const ids = new Set<string>();
  const values: T[] = [];

  input.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(createValidationError(category, "entry", "Entrée de référentiel invalide.", undefined, index));
      return;
    }

    const id = normalizeRequiredId(entry.id, category, index, errors, ids);
    const label = normalizeRequiredString(entry.label, category, "label", id, index, errors);
    const fileAlias = normalizeFileAlias(entry.fileAlias, category, id, index, errors);
    const aliases = normalizeAliases(
      entry.aliases,
      category,
      id,
      index,
      entry.enabled === false,
      errors
    );
    const folderAlias = allowFolderAlias
      ? normalizeFolderAlias(entry.folderAlias, category, id, index, errors)
      : undefined;

    if (!id || !label || !fileAlias) {
      return;
    }

    values.push({
      id,
      label,
      fileAlias,
      aliases,
      ...(folderAlias ? { folderAlias } : {}),
      ...(entry.enabled === false ? { enabled: false } : {})
    } as T);
  });

  return {
    values,
    errors,
    warnings: []
  };
}

function normalizeRequiredId(
  value: unknown,
  category: string,
  index: number,
  errors: ReferenceDataValidationError[],
  ids: Set<string>
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(createValidationError(category, "id", "Identifiant obligatoire.", undefined, index));
    return null;
  }

  const id = value.trim();
  if (!ID_PATTERN.test(id)) {
    errors.push(createValidationError(category, "id", "Identifiant invalide.", id, index));
    return null;
  }

  if (ids.has(id)) {
    errors.push(createValidationError(category, "id", "Identifiant dupliqué.", id, index));
    return null;
  }

  ids.add(id);
  return id;
}

function normalizeRequiredString(
  value: unknown,
  category: string,
  field: string,
  id: string | null,
  index: number,
  errors: ReferenceDataValidationError[]
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(createValidationError(category, field, "Champ obligatoire.", id ?? undefined, index));
    return null;
  }

  return value.trim();
}

function normalizeFileAlias(
  value: unknown,
  category: string,
  id: string | null,
  index: number,
  errors: ReferenceDataValidationError[]
): string | null {
  if (typeof value !== "string") {
    errors.push(createValidationError(category, "fileAlias", "Alias de fichier obligatoire.", id ?? undefined, index));
    return null;
  }

  const normalized = normalizeNameBlock(value);
  if (!normalized) {
    errors.push(createValidationError(category, "fileAlias", "Alias de fichier invalide.", id ?? undefined, index));
    return null;
  }

  return normalized;
}

function normalizeFolderAlias(
  value: unknown,
  category: string,
  id: string | null,
  index: number,
  errors: ReferenceDataValidationError[]
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(createValidationError(category, "folderAlias", "Alias de dossier invalide.", id ?? undefined, index));
    return undefined;
  }

  const normalized = normalizeTargetFolderRelative(value);
  if (!normalized.ok) {
    errors.push(createValidationError(category, "folderAlias", "Alias de dossier invalide.", id ?? undefined, index));
    return undefined;
  }

  return normalized.value || undefined;
}

function normalizeAliases(
  value: unknown,
  category: string,
  id: string | null,
  index: number,
  isDisabled: boolean,
  errors: ReferenceDataValidationError[]
): string[] {
  if (!Array.isArray(value)) {
    errors.push(createValidationError(category, "aliases", "Liste d'alias invalide.", id ?? undefined, index));
    return [];
  }

  const aliases = Array.from(
    new Set(
      value
        .filter((alias): alias is string => typeof alias === "string")
        .map((alias) => alias.trim())
        .filter(Boolean)
    )
  );

  if (!isDisabled && aliases.length === 0) {
    errors.push(createValidationError(category, "aliases", "Alias obligatoire.", id ?? undefined, index));
  }

  for (const alias of aliases) {
    if (normalizeAliasForDetection(alias).replace(/\s/g, "").length < MIN_ALIAS_LENGTH) {
      errors.push(createValidationError(category, "aliases", "Alias trop court.", id ?? undefined, index));
      break;
    }
  }

  return aliases;
}

function normalizeDomains(
  value: unknown,
  id: string,
  index: number,
  errors: ReferenceDataValidationError[]
): string[] {
  if (!Array.isArray(value)) {
    errors.push(createValidationError("providers", "domains", "Liste de domaines invalide.", id, index));
    return [];
  }

  const domains = Array.from(
    new Set(
      value
        .filter((domain): domain is string => typeof domain === "string")
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  for (const domain of domains) {
    if (!isValidDomain(domain)) {
      errors.push(createValidationError("providers", "domains", "Domaine invalide.", id, index));
      break;
    }
  }

  return domains;
}

function normalizeEnumField<T extends string>(
  value: unknown,
  allowedValues: Set<T>,
  category: string,
  field: string,
  id: string | null,
  index: number,
  errors: ReferenceDataValidationError[]
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && allowedValues.has(value as T)) {
    return value as T;
  }

  errors.push(createValidationError(category, field, "Valeur non supportée.", id ?? undefined, index));
  return undefined;
}

function isValidDomain(value: string): boolean {
  return (
    !value.includes("://") &&
    !value.includes("/") &&
    !/\s/.test(value) &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(value)
  );
}

function invalid(errors: ReferenceDataValidationError[]): ReferenceDataValidationResult {
  return {
    isValid: false,
    errors,
    warnings: [],
    catalog: null
  };
}

function createValidationError(
  category: string,
  field: string,
  message: string,
  id?: string,
  index?: number
): ReferenceDataValidationError {
  return {
    category,
    field,
    message,
    ...(id ? { id } : {}),
    ...(index !== undefined ? { index } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRealIsoDate(value: string): boolean {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function removeAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
