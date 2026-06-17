import path from "node:path";

import { buildFolderInventory } from "../folder-inventory/folderInventory";
import { analyzeFolderNamingProfile, alignNamingInputWithFolderProfile } from "../folder-inventory/namingProfile";
import { rankFolderPlacementCandidates } from "../folder-inventory/placementRanker";
import type {
  FolderInventory,
  FolderNamingProfile,
  FolderPlacementRanking
} from "../folder-inventory/folderInventoryTypes";
import { buildTargetFolderSuggestionsV2 } from "../folders/buildTargetFolderSuggestionsV2";
import type { TargetFolderSuggestionV2, UserFolderPreference } from "../folders/folderSuggestionTypes";
import { generateDocumentNameV2 } from "../naming/documentNameV2";
import type { DuplicateSourceDocument } from "../duplicates/exactDuplicates";
import { loadReferenceDataCatalog } from "../reference-data/referenceDataLoader";
import type { ReferenceDataCatalog } from "../reference-data/referenceDataTypes";
import {
  buildNamingInputV2FromSuggestionDraft,
  buildSuggestionDraftV2
} from "./buildSuggestionDraftV2";
import type { SuggestionDraftV2 } from "./suggestionDraftV2";

export type SuggestionV2TextSource = "pdf-native" | "tesseract-cli";

export interface SuggestionV2TextContext {
  source: SuggestionV2TextSource;
  excerpt: string;
}

export interface SuggestionV2DocumentSuggestion {
  status: "ready";
  documentName: string;
  extension: string;
  draft: SuggestionDraftV2;
  targetFolderSuggestion: TargetFolderSuggestionV2;
  folderPlacement: SuggestionV2FolderPlacementSummary | null;
  folderNamingProfile: SuggestionV2FolderNamingProfileSummary | null;
  missingFields: SuggestionV2MissingField[];
  referenceDataWarnings: string[];
  builtAt: string;
  message: string;
}

export interface SuggestionV2FolderPlacementSummary {
  relativePath: string;
  confidence: number;
  exists: boolean;
  source: "inventory" | "fallback";
  reasons: string[];
  warnings: string[];
}

export interface SuggestionV2FolderNamingProfileSummary {
  status: "detected" | "not-detected";
  conventionExample?: string;
  confidence: number;
  analyzedFileCount: number;
  v2FileCount: number;
  reasons: string[];
  warnings: string[];
  dominantDatePrecision?: "day" | "month" | "year" | "unknown";
  dominantTarget?: string;
  dominantDocumentType?: string;
  dominantIssuer?: string;
}

export type SuggestionV2MissingField = "dateToken" | "target" | "documentType";

export type SuggestionV2ErrorCode =
  | "SUGGESTION_V2_DOCUMENT_NOT_SELECTED"
  | "SUGGESTION_V2_DOCUMENT_NOT_IN_QUEUE"
  | "SUGGESTION_V2_REFERENCE_DATA_INVALID"
  | "SUGGESTION_V2_FAILED";

export type SuggestionV2Result =
  | {
      ok: true;
      value: SuggestionV2DocumentSuggestion;
    }
  | {
      ok: false;
      error: {
        code: SuggestionV2ErrorCode;
        message: string;
      };
    };

export interface BuildSuggestionV2ForDocumentOptions {
  documentPath: string;
  textContext: SuggestionV2TextContext | null;
  legacyDraft: unknown;
  queuedDocuments: Iterable<DuplicateSourceDocument>;
  queuedDocumentPaths: Iterable<string>;
  userDataPath: string;
  targetRootPath?: string | null;
  knownRelativeFolders?: string[];
  now?: () => Date;
}

const TEXT_EXCERPT_LIMIT = 6_000;

export async function buildSuggestionV2ForDocument(
  options: BuildSuggestionV2ForDocumentOptions
): Promise<SuggestionV2Result> {
  const documentPath = options.documentPath.trim();
  if (!documentPath) {
    return {
      ok: false,
      error: {
        code: "SUGGESTION_V2_DOCUMENT_NOT_SELECTED",
        message: "Aucun document sélectionné pour la suggestion v2."
      }
    };
  }

  const documentItem = findQueuedDocument(
    documentPath,
    options.queuedDocuments,
    options.queuedDocumentPaths
  );
  if (!documentItem) {
    return {
      ok: false,
      error: {
        code: "SUGGESTION_V2_DOCUMENT_NOT_IN_QUEUE",
        message: "Le document n'appartient pas à la dernière file scannée."
      }
    };
  }

  try {
    const referenceData = await loadReferenceDataCatalog(getReferenceDataBasePath(options.userDataPath));
    if (!referenceData.ok) {
      return {
        ok: false,
        error: {
          code: "SUGGESTION_V2_REFERENCE_DATA_INVALID",
          message: "Référentiels v2 indisponibles ou invalides."
        }
      };
    }

    const text = limitTextContext(options.textContext);
    const inventory = await loadTargetInventory(options.targetRootPath);
    const draft = buildSuggestionDraftV2({
      fileName: documentItem.name,
      extension: path.extname(documentItem.name).toLowerCase(),
      extractedText: text?.source === "pdf-native" ? text.excerpt : undefined,
      ocrText: text?.source === "tesseract-cli" ? text.excerpt : undefined,
      legacyDraft: options.legacyDraft,
      referenceData: referenceData.catalog
    });
    const placementRanking = inventory
      ? rankFolderPlacementCandidates({
          draft,
          inventory,
          evidenceText: [documentItem.name, text?.excerpt].filter(Boolean).join("\n"),
          folderAliases: getFolderAliasesForDraft(draft, referenceData.catalog)
        })
      : null;
    const documentExtension = path.extname(documentItem.name).toLowerCase();
    const folderNamingProfile = applyNamingProfile(draft, documentExtension, placementRanking);

    const targetFolderSuggestion = buildTargetFolderSuggestionsV2({
      draft,
      knownRelativeFolders: getKnownRelativeFolders(options.knownRelativeFolders ?? [], inventory),
      userFolderPreferences: createPlacementPreferences(draft, placementRanking)
    });
    mergeFolderPlacementContext(targetFolderSuggestion, placementRanking, inventory);

    return {
      ok: true,
      value: {
        status: "ready",
        documentName: documentItem.name,
        extension: documentExtension,
        draft,
        targetFolderSuggestion,
        folderPlacement: placementRanking ? createFolderPlacementSummary(placementRanking) : null,
        folderNamingProfile,
        missingFields: getMissingFields(draft),
        referenceDataWarnings: referenceData.warnings,
        builtAt: (options.now ?? (() => new Date()))().toISOString(),
        message: draft.proposedName
          ? "Suggestion v2 expérimentale prête."
          : "Suggestion v2 expérimentale incomplète."
      }
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "SUGGESTION_V2_FAILED",
        message: "Suggestion v2 indisponible."
      }
    };
  }
}

async function loadTargetInventory(
  targetRootPath: string | null | undefined
): Promise<FolderInventory | null> {
  if (!targetRootPath) {
    return null;
  }

  const result = await buildFolderInventory({
    rootPath: targetRootPath,
    maxDepth: 3,
    sampleFileLimit: 30
  });

  if (!result.ok) {
    return {
      items: [],
      warnings: [result.error.message]
    };
  }

  return result.inventory;
}

function getKnownRelativeFolders(
  knownRelativeFolders: string[],
  inventory: FolderInventory | null
): string[] {
  return uniqueStrings([
    ...knownRelativeFolders,
    ...(inventory?.items.map((item) => item.relativePath) ?? [])
  ]).sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
}

function createPlacementPreferences(
  draft: SuggestionDraftV2,
  placement: FolderPlacementRanking | null
): UserFolderPreference[] {
  if (!placement?.recommended.relativePath) {
    return [];
  }

  const keys = [
    draft.documentType ? `documentType:${draft.documentType}` : "",
    draft.target ? `target:${draft.target}` : "",
    draft.documentType && draft.target ? `documentType:${draft.documentType}|target:${draft.target}` : ""
  ].filter(Boolean);

  return keys.map((matchKey) => ({
    matchKey,
    preferredRelativePath: placement.recommended.relativePath
  }));
}

function mergeFolderPlacementContext(
  targetFolderSuggestion: TargetFolderSuggestionV2,
  placement: FolderPlacementRanking | null,
  inventory: FolderInventory | null
): void {
  targetFolderSuggestion.warnings = uniqueStrings([
    ...targetFolderSuggestion.warnings,
    ...(inventory?.warnings ?? []),
    ...(placement?.warnings ?? []),
    ...(placement?.recommended.warnings ?? [])
  ]);
  targetFolderSuggestion.reasons = uniqueStrings([
    ...targetFolderSuggestion.reasons,
    ...(placement?.reasons ?? []),
    ...(placement?.recommended.reasons ?? [])
  ]);
}

function applyNamingProfile(
  draft: SuggestionDraftV2,
  extension: string,
  placement: FolderPlacementRanking | null
): SuggestionV2FolderNamingProfileSummary | null {
  const item = placement?.recommended.item;
  if (!item) {
    return null;
  }

  const profile = analyzeFolderNamingProfile(item);
  draft.reasons.push(...profile.reasons);
  draft.warnings.push(...profile.warnings);

  const namingInput = buildNamingInputV2FromSuggestionDraft(draft, extension);
  if (!namingInput) {
    return createFolderNamingProfileSummary(profile, extension, []);
  }

  const alignment = alignNamingInputWithFolderProfile(namingInput, profile);
  draft.reasons.push(...alignment.reasons);
  draft.warnings.push(...alignment.warnings);

  if (alignment.changed) {
    draft.dateToken = alignment.input.dateToken;
    const generation = generateDocumentNameV2(alignment.input);
    draft.namingMessages = generation.messages;
    if (generation.isValid) {
      draft.proposedName = generation.filename;
    }
  }

  return createFolderNamingProfileSummary(profile, extension, alignment.warnings);
}

function createFolderPlacementSummary(
  placement: FolderPlacementRanking
): SuggestionV2FolderPlacementSummary {
  const recommended = placement.recommended;
  return {
    relativePath: recommended.relativePath,
    confidence: recommended.confidence,
    exists: recommended.exists,
    source: recommended.source,
    reasons: uniqueStrings([...placement.reasons, ...recommended.reasons]),
    warnings: uniqueStrings([...placement.warnings, ...recommended.warnings])
  };
}

function createFolderNamingProfileSummary(
  profile: FolderNamingProfile,
  extension: string,
  alignmentWarnings: string[]
): SuggestionV2FolderNamingProfileSummary {
  const detected = profile.v2FileCount > 0 && Boolean(
    profile.dominantDatePrecision ||
      profile.dominantTarget ||
      profile.dominantDocumentType ||
      profile.dominantIssuer
  );

  return {
    status: detected ? "detected" : "not-detected",
    ...(detected ? { conventionExample: createConventionExample(profile, extension) } : {}),
    confidence: profile.confidence,
    analyzedFileCount: profile.analyzedFileCount,
    v2FileCount: profile.v2FileCount,
    reasons: profile.reasons,
    warnings: uniqueStrings([...profile.warnings, ...alignmentWarnings]),
    ...(profile.dominantDatePrecision ? { dominantDatePrecision: profile.dominantDatePrecision } : {}),
    ...(profile.dominantTarget ? { dominantTarget: profile.dominantTarget } : {}),
    ...(profile.dominantDocumentType ? { dominantDocumentType: profile.dominantDocumentType } : {}),
    ...(profile.dominantIssuer ? { dominantIssuer: profile.dominantIssuer } : {})
  };
}

function createConventionExample(profile: FolderNamingProfile, extension: string): string {
  const blocks = [
    datePrecisionExample(profile.dominantDatePrecision),
    profile.dominantTarget ?? "cible",
    profile.dominantDocumentType ?? "type-document",
    profile.dominantIssuer
  ].filter(Boolean);

  return `${blocks.join("_")}${extension || ".pdf"}`;
}

function datePrecisionExample(precision: FolderNamingProfile["dominantDatePrecision"]): string {
  switch (precision) {
    case "day":
      return "AAAA-MM-JJ";
    case "month":
      return "AAAA-MM";
    case "year":
      return "AAAA";
    case "unknown":
    default:
      return "DATE";
  }
}

function getFolderAliasesForDraft(
  draft: SuggestionDraftV2,
  catalog: ReferenceDataCatalog
): string[] {
  const target = draft.target?.trim().toLowerCase();
  if (!target) {
    return [];
  }

  return [
    ...catalog.people,
    ...catalog.vehicles,
    ...catalog.properties
  ]
    .filter((entry) => entry.fileAlias.trim().toLowerCase() === target && entry.folderAlias)
    .map((entry) => entry.folderAlias as string);
}

function findQueuedDocument(
  documentPath: string,
  queuedDocuments: Iterable<DuplicateSourceDocument>,
  queuedDocumentPaths: Iterable<string>
): DuplicateSourceDocument | null {
  const resolvedPath = path.resolve(documentPath);
  const allowedPaths = new Set(Array.from(queuedDocumentPaths, (filePath) => path.resolve(filePath)));
  if (!allowedPaths.has(resolvedPath)) {
    return null;
  }

  for (const documentItem of queuedDocuments) {
    if (path.resolve(documentItem.filePath) === resolvedPath) {
      return documentItem;
    }
  }

  return {
    filePath: documentPath,
    name: path.basename(documentPath)
  };
}

function getReferenceDataBasePath(userDataPath: string): string {
  return path.join(userDataPath, "config", "reference-data");
}

function limitTextContext(context: SuggestionV2TextContext | null): SuggestionV2TextContext | null {
  if (!context) {
    return null;
  }

  const excerpt = context.excerpt.trim().slice(0, TEXT_EXCERPT_LIMIT);
  if (!excerpt) {
    return null;
  }

  return {
    source: context.source,
    excerpt
  };
}

function getMissingFields(draft: SuggestionDraftV2): SuggestionV2MissingField[] {
  const missing: SuggestionV2MissingField[] = [];
  if (!draft.dateToken || draft.dateToken === "date-inconnue") {
    missing.push("dateToken");
  }
  if (!draft.target) {
    missing.push("target");
  }
  if (!draft.documentType) {
    missing.push("documentType");
  }

  return missing;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
