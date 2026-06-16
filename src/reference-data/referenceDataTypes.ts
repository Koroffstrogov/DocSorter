export type ReferenceAlias = string;

export type ReferenceCandidateKind =
  | "person"
  | "vehicle"
  | "property"
  | "provider"
  | "documentType";

export type ReferenceTargetKind = "person" | "vehicle" | "property" | "foyer";

export type ReferenceDateRule = "document-date" | "period-year" | "unknown-ok";

export interface ReferenceEntryBase {
  id: string;
  label: string;
  fileAlias: string;
  folderAlias?: string;
  aliases: ReferenceAlias[];
  enabled?: boolean;
}

export interface PersonReference extends ReferenceEntryBase {
  birthDate?: string;
  useBirthDateForDetectionOnly?: boolean;
}

export interface VehicleReference extends ReferenceEntryBase {}

export interface PropertyReference extends ReferenceEntryBase {}

export interface ProviderReference extends Omit<ReferenceEntryBase, "folderAlias"> {
  domains?: string[];
}

export interface DocumentTypeReference {
  id: string;
  label: string;
  fileAlias: string;
  aliases: string[];
  domain?: string;
  defaultTargetKind?: ReferenceTargetKind;
  defaultDateRule?: ReferenceDateRule;
  enabled?: boolean;
}

export interface ReferenceDataCatalog {
  version: 1;
  people: PersonReference[];
  vehicles: VehicleReference[];
  properties: PropertyReference[];
  providers: ProviderReference[];
  documentTypes: DocumentTypeReference[];
}

export interface ReferenceCandidate {
  kind: ReferenceCandidateKind;
  id: string;
  label: string;
  fileAlias: string;
  folderAlias?: string;
  confidence: number;
  reasons: string[];
  matchedAliases: string[];
}

export interface ReferenceDetectionResult {
  targetCandidates: ReferenceCandidate[];
  documentTypeCandidates: ReferenceCandidate[];
  issuerCandidates: ReferenceCandidate[];
  warnings: string[];
}

export interface ReferenceDetectionInput {
  filename?: string;
  text?: string;
  catalog: ReferenceDataCatalog;
}

export interface ReferenceDataValidationError {
  category: string;
  field: string;
  message: string;
  id?: string;
  index?: number;
}

export interface ReferenceDataValidationResult {
  isValid: boolean;
  errors: ReferenceDataValidationError[];
  warnings: string[];
  catalog: ReferenceDataCatalog | null;
}
