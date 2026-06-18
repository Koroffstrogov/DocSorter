import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import {
  buildAiClassificationSuggestion
} from "./aiClassificationOrchestrator";
import type {
  AiClassificationInput,
  AiClassificationSuggestion,
  AiSuggestionV2Snapshot,
  BoundedAiClassificationInput
} from "./aiClassificationTypes";
import {
  generateOllamaCompletion,
  type OllamaHttpClient
} from "./ollamaClient";
import {
  defaultOllamaModelManager,
  type OllamaModelManagerLike,
  type OllamaModelStatus
} from "./ollamaModelManager";
import { buildOllamaClassificationPrompt } from "./ollamaPromptBuilder";
import {
  aiFailure,
  loadAiSettings,
  type AiSettingsResult
} from "./ollamaSettings";
import {
  buildSuggestionV2ForDocument,
  type SuggestionV2DocumentSuggestion,
  type SuggestionV2TextContext
} from "../suggestions/buildSuggestionV2ForDocument";
import { isFilenameLikeTarget } from "../suggestions/filenameLikeTarget";

export type AiDocumentTextSource = "pdf-native" | "tesseract-cli";

export interface AiDocumentTextContext {
  source: AiDocumentTextSource;
  excerpt: string;
}

export interface AiQueuedDocument {
  filePath: string;
  name: string;
}

export interface AiDocumentSuggestion {
  status: "ready";
  documentName: string;
  extension: string;
  model: string;
  suggestedAt: string;
  textSource: AiDocumentTextSource;
  modelStatus: OllamaModelStatus;
  input: BoundedAiClassificationInput;
  deterministicSuggestion: SuggestionV2DocumentSuggestion;
  suggestion: AiClassificationSuggestion;
  promptCharacterCount: number;
  differsFromSuggestionV2: boolean;
  message: string;
}

export interface RunOllamaSuggestionForDocumentOptions {
  documentPath: string;
  textContext: AiDocumentTextContext | null;
  legacyDraft: unknown;
  queuedDocuments: Iterable<AiQueuedDocument>;
  queuedDocumentPaths: Iterable<string>;
  userDataPath: string;
  targetRootPath?: string | null;
  knownRelativeFolders?: string[];
  competingRelativePaths?: string[];
  fetchClient?: OllamaHttpClient;
  modelManager?: OllamaModelManagerLike;
  statFile?: (filePath: string) => Promise<Pick<Stats, "isFile">>;
  now?: () => Date;
}

const FISCAL_DOCUMENT_TYPES = new Set(["avis-imposition", "declaration-revenus", "taxe-fonciere"]);

export async function runOllamaSuggestionForDocument(
  options: RunOllamaSuggestionForDocumentOptions
): Promise<AiSettingsResult<AiDocumentSuggestion>> {
  const activeDocument = findQueuedDocument(
    options.documentPath,
    options.queuedDocuments,
    options.queuedDocumentPaths
  );
  if (!activeDocument.ok) {
    return activeDocument;
  }

  const fileCheck = await checkDocumentStillAvailable(
    activeDocument.value.filePath,
    options.statFile ?? stat
  );
  if (!fileCheck.ok) {
    return fileCheck;
  }

  const textContext = normalizeTextContext(options.textContext);
  if (!textContext) {
    return aiFailure("AI_TEXT_NOT_AVAILABLE", "Texte extrait requis avant l'analyse IA locale.");
  }

  const deterministicSuggestion = await buildSuggestionV2ForDocument({
    documentPath: activeDocument.value.filePath,
    textContext: textContext as SuggestionV2TextContext,
    legacyDraft: options.legacyDraft,
    queuedDocuments: options.queuedDocuments,
    queuedDocumentPaths: options.queuedDocumentPaths,
    userDataPath: options.userDataPath,
    targetRootPath: options.targetRootPath,
    knownRelativeFolders: options.knownRelativeFolders ?? [],
    competingRelativePaths: options.competingRelativePaths ?? []
  });
  if (!deterministicSuggestion.ok) {
    return aiFailure("AI_OUTPUT_INVALID", "Contexte V2 indisponible pour l'analyse IA.");
  }

  const settingsResult = await loadAiSettings(options.userDataPath);
  if (!settingsResult.ok) {
    return settingsResult;
  }

  const settings = settingsResult.value;
  if (!settings.enabled) {
    return aiFailure("AI_PROVIDER_DISABLED", "IA locale désactivée.");
  }

  if (!settings.model.trim()) {
    return aiFailure("AI_CONFIG_INVALID", "Modèle Ollama non renseigné.");
  }

  const modelReady = await (options.modelManager ?? defaultOllamaModelManager).ensureModelReady(settings);
  if (!modelReady.ok) {
    return modelReady;
  }

  const aiInput = buildAiInput({
    documentName: activeDocument.value.name,
    extension: path.extname(activeDocument.value.name),
    textContext,
    deterministicSuggestion: deterministicSuggestion.value,
    knownRelativeFolders: options.knownRelativeFolders ?? []
  });
  const prompt = buildOllamaClassificationPrompt(aiInput);
  const generation = await generateOllamaCompletion(settings, prompt.prompt, {
    fetchClient: options.fetchClient,
    now: options.now
  });
  if (!generation.ok) {
    return generation;
  }

  const parsed = parseOllamaJson(generation.value.responseText);
  if (!parsed.ok) {
    return parsed;
  }

  const classified = await buildAiClassificationSuggestion(prompt.input, () => parsed.value);
  if (classified.status !== "ready") {
    return aiFailure("AI_OUTPUT_INVALID", "Suggestion IA invalide.");
  }

  const sanitizedSuggestion = sanitizeAiSuggestionV2(
    classified.suggestion,
    prompt.input.currentSuggestionV2,
    prompt.input.filename
  );

  const differsFromSuggestionV2 = differsFromDeterministicSuggestion(
    sanitizedSuggestion,
    prompt.input.currentSuggestionV2
  );

  return {
    ok: true,
    value: {
      status: "ready",
      documentName: activeDocument.value.name,
      extension: prompt.input.extension,
      model: generation.value.model,
      suggestedAt: generation.value.generatedAt,
      textSource: textContext.source,
      modelStatus: modelReady.value,
      input: prompt.input,
      deterministicSuggestion: deterministicSuggestion.value,
      suggestion: sanitizedSuggestion,
      promptCharacterCount: prompt.prompt.length,
      differsFromSuggestionV2,
      message: differsFromSuggestionV2
        ? "Suggestion IA V2 prête. Diffère de la proposition V2."
        : "Suggestion IA V2 prête."
    }
  };
}

function sanitizeAiSuggestionV2(
  suggestion: AiClassificationSuggestion,
  deterministic: AiSuggestionV2Snapshot | null,
  fileName: string
): AiClassificationSuggestion {
  const next: AiClassificationSuggestion = {
    ...suggestion,
    reasons: [...suggestion.reasons],
    warnings: [...suggestion.warnings]
  };
  const documentType = next.documentType?.trim() ?? deterministic?.documentType?.trim() ?? "";

  if (
    next.target &&
    isFilenameLikeTarget(next.target, {
      fileName,
      documentType,
      dateToken: next.dateToken ?? deterministic?.dateToken ?? undefined
    })
  ) {
    delete next.target;
    next.warnings.push("Cible IA ignorée : ressemble à un nom de fichier ou au type documentaire.");
  }

  if (isFoyerFiscalSuggestion(next, deterministic)) {
    next.target = "foyer";
    if (next.issuer === "foyer") {
      delete next.issuer;
      next.warnings.push("Émetteur IA foyer ignoré : déjà utilisé comme cible fiscale.");
    }
    if (next.detail === "foyer") {
      delete next.detail;
      next.warnings.push("Détail IA foyer ignoré : déjà utilisé comme cible fiscale.");
    }
    if (!next.reasons.includes("Cible foyer conservée depuis la proposition V2 fiscale.")) {
      next.reasons.push("Cible foyer conservée depuis la proposition V2 fiscale.");
    }
  }

  next.reasons = uniqueStrings(next.reasons).slice(0, 8);
  next.warnings = uniqueStrings(next.warnings).slice(0, 8);
  return next;
}

function isFoyerFiscalSuggestion(
  suggestion: AiClassificationSuggestion,
  deterministic: AiSuggestionV2Snapshot | null
): boolean {
  const documentType = suggestion.documentType ?? deterministic?.documentType ?? "";
  if (!FISCAL_DOCUMENT_TYPES.has(documentType)) {
    return false;
  }

  return deterministic?.target === "foyer" || suggestion.target === undefined || suggestion.target === "foyer";
}

function findQueuedDocument(
  documentPath: string,
  queuedDocuments: Iterable<AiQueuedDocument>,
  queuedDocumentPaths: Iterable<string>
): AiSettingsResult<AiQueuedDocument> {
  const normalizedDocumentPath = documentPath.trim();
  if (!normalizedDocumentPath) {
    return aiFailure("AI_DOCUMENT_NOT_SELECTED", "Aucun document sélectionné pour l'analyse IA.");
  }

  const resolvedDocumentPath = path.resolve(normalizedDocumentPath);
  const queuePathSet = new Set(Array.from(queuedDocumentPaths, (queuedPath) => path.resolve(queuedPath)));
  if (!queuePathSet.has(resolvedDocumentPath)) {
    return aiFailure("AI_DOCUMENT_NOT_IN_QUEUE", "Document non présent dans la dernière file scannée.");
  }

  const documentItem = Array.from(queuedDocuments).find(
    (candidate) => path.resolve(candidate.filePath) === resolvedDocumentPath
  );

  return {
    ok: true,
    value: {
      filePath: documentItem?.filePath ?? normalizedDocumentPath,
      name: path.basename(documentItem?.name ?? normalizedDocumentPath)
    }
  };
}

async function checkDocumentStillAvailable(
  documentPath: string,
  statFile: (filePath: string) => Promise<Pick<Stats, "isFile">>
): Promise<AiSettingsResult<void>> {
  try {
    const stats = await statFile(documentPath);
    if (!stats.isFile()) {
      return aiFailure("AI_DOCUMENT_NOT_FOUND", "Document indisponible pour l'analyse IA.");
    }

    return { ok: true, value: undefined };
  } catch {
    return aiFailure("AI_DOCUMENT_NOT_FOUND", "Document indisponible pour l'analyse IA.");
  }
}

function normalizeTextContext(value: AiDocumentTextContext | null): AiDocumentTextContext | null {
  if (!value || (value.source !== "pdf-native" && value.source !== "tesseract-cli")) {
    return null;
  }

  const excerpt = value.excerpt.trim();
  if (!excerpt) {
    return null;
  }

  return {
    source: value.source,
    excerpt: excerpt.slice(0, 6_000)
  };
}

function buildAiInput(options: {
  documentName: string;
  extension: string;
  textContext: AiDocumentTextContext;
  deterministicSuggestion: SuggestionV2DocumentSuggestion;
  knownRelativeFolders: string[];
}): AiClassificationInput {
  const dateToken = options.deterministicSuggestion.draft.dateToken ?? "";
  return {
    filename: path.basename(options.documentName),
    extension: options.extension,
    extractedTextExcerpt:
      options.textContext.source === "pdf-native" ? options.textContext.excerpt : "",
    ocrTextExcerpt:
      options.textContext.source === "tesseract-cli" ? options.textContext.excerpt : "",
    currentSuggestionV2: toAiSuggestionV2Snapshot(options.deterministicSuggestion),
    knownRelativeFolders: options.knownRelativeFolders,
    availableRootFolders: rootFoldersFromRelativeFolders(options.knownRelativeFolders),
    namingConvention: "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext",
    detectedDate: dateToken,
    detectedYear: dateToken.match(/^(19|20)\d{2}/)?.[0] ?? ""
  };
}

function toAiSuggestionV2Snapshot(
  suggestion: SuggestionV2DocumentSuggestion
): AiSuggestionV2Snapshot | null {
  const targetFolder = getDeterministicTargetFolder(suggestion);
  if (
    !suggestion.draft.dateToken &&
    !suggestion.draft.target &&
    !suggestion.draft.documentType &&
    !suggestion.draft.issuer &&
    !suggestion.draft.detail &&
    !targetFolder
  ) {
    return null;
  }

  return {
    dateToken: suggestion.draft.dateToken ?? null,
    target: suggestion.draft.target ?? null,
    documentType: suggestion.draft.documentType ?? null,
    issuer: suggestion.draft.issuer ?? null,
    detail: suggestion.draft.detail ?? null,
    targetFolder: targetFolder || null,
    proposedName: suggestion.draft.proposedName ?? null,
    missingFields: suggestion.missingFields,
    confidence: suggestion.draft.confidence,
    reasons: suggestion.draft.reasons,
    warnings: suggestion.draft.warnings
  };
}

function getDeterministicTargetFolder(suggestion: SuggestionV2DocumentSuggestion): string {
  return (
    suggestion.targetFolderSuggestion.recommended?.relativePath ??
    suggestion.folderPlacement?.relativePath ??
    ""
  ).trim();
}

function rootFoldersFromRelativeFolders(folders: string[]): string[] {
  return Array.from(
    new Set(
      folders
        .map((folder) => folder.split("/")[0]?.trim() ?? "")
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
}

function parseOllamaJson(value: string): AiSettingsResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return aiFailure("AI_OUTPUT_INVALID", "Suggestion IA invalide.");
  }
}

function differsFromDeterministicSuggestion(
  suggestion: AiClassificationSuggestion,
  deterministic: AiSuggestionV2Snapshot | null
): boolean {
  if (!deterministic) {
    return false;
  }

  return (
    differs(suggestion.dateToken, deterministic.dateToken) ||
    differs(suggestion.target, deterministic.target) ||
    differs(suggestion.documentType, deterministic.documentType) ||
    differs(suggestion.issuer, deterministic.issuer) ||
    differs(suggestion.detail, deterministic.detail) ||
    differs(suggestion.targetFolder, deterministic.targetFolder)
  );
}

function differs(left: string | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() !== right.trim().toLowerCase());
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
