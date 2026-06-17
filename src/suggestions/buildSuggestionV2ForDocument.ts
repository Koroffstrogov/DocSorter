import path from "node:path";

import { buildTargetFolderSuggestionsV2 } from "../folders/buildTargetFolderSuggestionsV2";
import type { TargetFolderSuggestionV2 } from "../folders/folderSuggestionTypes";
import type { DuplicateSourceDocument } from "../duplicates/exactDuplicates";
import { loadReferenceDataCatalog } from "../reference-data/referenceDataLoader";
import { buildSuggestionDraftV2 } from "./buildSuggestionDraftV2";
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
  missingFields: SuggestionV2MissingField[];
  referenceDataWarnings: string[];
  builtAt: string;
  message: string;
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
    const draft = buildSuggestionDraftV2({
      fileName: documentItem.name,
      extension: path.extname(documentItem.name).toLowerCase(),
      extractedText: text?.source === "pdf-native" ? text.excerpt : undefined,
      ocrText: text?.source === "tesseract-cli" ? text.excerpt : undefined,
      legacyDraft: options.legacyDraft,
      referenceData: referenceData.catalog
    });
    const targetFolderSuggestion = buildTargetFolderSuggestionsV2({
      draft,
      knownRelativeFolders: options.knownRelativeFolders ?? []
    });

    return {
      ok: true,
      value: {
        status: "ready",
        documentName: documentItem.name,
        extension: path.extname(documentItem.name).toLowerCase(),
        draft,
        targetFolderSuggestion,
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
