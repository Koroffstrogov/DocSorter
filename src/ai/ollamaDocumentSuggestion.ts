import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import type {
  AiClassificationInput,
  AiClassificationSuggestion,
  BoundedAiClassificationInput
} from "./aiClassificationTypes";
import type { AiModelProfile } from "./aiModelProfiles";
import { getAiModelProfile } from "./aiModelProfiles";
import {
  adaptMultiCandidateResponseToSuggestion,
  type AiMultiCandidateResponse,
  validateAiMultiCandidateResponse
} from "./aiMultiCandidateResponse";
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
  generateDocumentNameV2,
  normalizeNameBlock
} from "../naming/documentNameV2";
import { isFilenameLikeTarget } from "./aiSuggestionSafety";

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
  profile: Pick<AiModelProfile, "id" | "label" | "model" | "think">;
  responseJson: AiMultiCandidateResponse;
  thinking: string | null;
  suggestion: AiClassificationSuggestion;
  promptCharacterCount: number;
  message: string;
}

export interface RunOllamaSuggestionForDocumentOptions {
  documentPath: string;
  textContext: AiDocumentTextContext | null;
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
    knownRelativeFolders: options.knownRelativeFolders ?? []
  });
  const prompt = buildOllamaClassificationPrompt(aiInput);
  const generation = await generateOllamaCompletion(settings, prompt.prompt, {
    fetchClient: options.fetchClient,
    now: options.now,
    format: prompt.format,
    think: settings.think
  });
  if (!generation.ok) {
    return generation;
  }

  const parsed = parseOllamaJson(generation.value.responseText);
  if (!parsed.ok) {
    return parsed;
  }

  const multiCandidateValidation = validateAiMultiCandidateResponse(parsed.value);
  if (multiCandidateValidation.status === "invalid") {
    return aiFailure("AI_OUTPUT_INVALID", multiCandidateValidation.error.message);
  }

  const adapted = adaptMultiCandidateResponseToSuggestion(multiCandidateValidation.response);
  if (adapted.status !== "valid") {
    return aiFailure("AI_OUTPUT_INVALID", adapted.error.message);
  }

  const sanitizedSuggestion = sanitizeAiSuggestion(adapted.suggestion, prompt.input);
  const profile = getAiModelProfile(settings.profileId);

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
      profile: {
        id: profile.id,
        label: profile.label,
        model: profile.model,
        think: profile.think
      },
      responseJson: multiCandidateValidation.response,
      thinking: generation.value.thinkingText,
      suggestion: sanitizedSuggestion,
      promptCharacterCount: prompt.prompt.length,
      message: "Suggestion IA autonome prête."
    }
  };
}

function sanitizeAiSuggestion(
  suggestion: AiClassificationSuggestion,
  input: BoundedAiClassificationInput
): AiClassificationSuggestion {
  const next: AiClassificationSuggestion = {
    ...suggestion,
    reasons: [...suggestion.reasons],
    warnings: [...suggestion.warnings]
  };
  const documentType = next.documentType?.trim() ?? "";
  sanitizeNameBlocks(next);

  if (
    next.subject &&
    isFilenameLikeTarget(next.subject, {
      fileName: input.filename,
      documentType,
      dateToken: next.dateToken
    })
  ) {
    delete next.subject;
    next.warnings.push("Sujet IA ignoré : ressemble à un nom de fichier ou au type documentaire.");
  }

  if (
    next.target &&
    isFilenameLikeTarget(next.target, {
      fileName: input.filename,
      documentType,
      dateToken: next.dateToken
    })
  ) {
    delete next.target;
    next.warnings.push("Cible IA ignorée : ressemble à un nom de fichier ou au type documentaire.");
  }

  applyInferredTargetFolder(next, input);
  applyGeneratedProposedName(next, input.extension);

  next.reasons = uniqueStrings(next.reasons).slice(0, 8);
  next.warnings = uniqueStrings(next.warnings).slice(0, 8);
  return next;
}

function sanitizeNameBlocks(suggestion: AiClassificationSuggestion): void {
  const removed: string[] = [];
  suggestion.subject = sanitizeOptionalBlock(suggestion.subject, removed);
  suggestion.target = sanitizeOptionalBlock(suggestion.target, removed);
  suggestion.documentType = sanitizeOptionalBlock(suggestion.documentType, removed);
  suggestion.issuer = sanitizeOptionalBlock(suggestion.issuer, removed);
  suggestion.detail = sanitizeOptionalBlock(suggestion.detail, removed);

  const documentTypeTerms = tokenSet(suggestion.documentType);
  if (suggestion.subject && documentTypeTerms.size > 0) {
    suggestion.subject = removeTermsIfNonEmpty(suggestion.subject, documentTypeTerms, removed);
  }

  const issuerTerms = tokenSet(suggestion.issuer);
  if (suggestion.subject && issuerTerms.size > 0) {
    suggestion.subject = removeTermsIfNonEmpty(suggestion.subject, issuerTerms, removed);
  }

  if (suggestion.detail) {
    const detailForbiddenTerms = new Set([
      ...tokenSet(suggestion.subject),
      ...tokenSet(suggestion.documentType),
      ...tokenSet(suggestion.issuer)
    ]);
    suggestion.detail = removeTerms(suggestion.detail, detailForbiddenTerms, removed);
    if (!suggestion.detail) {
      delete suggestion.detail;
    }
  }

  if (removed.length > 0) {
    suggestion.warnings.push(`Termes IA ignorés dans le nom proposé : ${uniqueStrings(removed).join(", ")}.`);
  }
}

function sanitizeOptionalBlock(value: string | undefined, removed: string[]): string | undefined {
  const normalized = normalizeNameBlock(value);
  if (!normalized) {
    return undefined;
  }

  const tokens = normalized.split("-").filter(Boolean);
  const containsDocSorter = tokens.includes("docsorter");
  const kept = tokens.filter((token) => {
    if (token === "docsorter" || (containsDocSorter && token === "local")) {
      removed.push(token);
      return false;
    }

    return true;
  });

  return kept.length > 0 ? kept.join("-") : undefined;
}

function removeTermsIfNonEmpty(
  value: string,
  termsToRemove: Set<string>,
  removed: string[]
): string {
  const cleaned = removeTerms(value, termsToRemove, removed);
  return cleaned || value;
}

function removeTerms(
  value: string,
  termsToRemove: Set<string>,
  removed: string[]
): string {
  const kept = normalizeNameBlock(value)
    .split("-")
    .filter(Boolean)
    .filter((term) => {
      if (termsToRemove.has(term)) {
        removed.push(term);
        return false;
      }

      return true;
    });

  return kept.join("-");
}

function tokenSet(value: string | undefined): Set<string> {
  return new Set(
    normalizeNameBlock(value)
      .split("-")
      .filter((term) => term.length >= 2)
  );
}

function applyInferredTargetFolder(
  suggestion: AiClassificationSuggestion,
  input: BoundedAiClassificationInput
): void {
  if (suggestion.targetFolder?.trim()) {
    return;
  }

  const inferred = inferKnownTargetFolder(suggestion, input);
  if (!inferred) {
    return;
  }

  suggestion.targetFolder = inferred;
  suggestion.reasons.push(`Sous-dossier cible complété depuis l'arborescence connue : ${inferred}.`);
}

function inferKnownTargetFolder(
  suggestion: AiClassificationSuggestion,
  input: BoundedAiClassificationInput
): string | null {
  const folderKeys = inferFolderKeys(suggestion, input);
  if (folderKeys.length === 0) {
    return null;
  }

  const candidates = input.knownRelativeFolders
    .map((folder) => ({
      folder,
      normalizedRoot: normalizeNameBlock(folder.split(/[\\/]/)[0] ?? folder),
      depth: folder.split(/[\\/]/).filter(Boolean).length
    }))
    .filter((candidate) =>
      folderKeys.some((key) => FOLDER_KEY_ALIASES[key].has(candidate.normalizedRoot))
    )
    .sort((left, right) => left.depth - right.depth || left.folder.localeCompare(right.folder, "fr"));

  return candidates[0]?.folder ?? null;
}

type FolderKey = "vehicles" | "fiscal" | "health" | "school" | "bank" | "home" | "insurance";

const FOLDER_KEY_ALIASES: Record<FolderKey, Set<string>> = {
  vehicles: new Set(["vehicules", "vehicule", "vehicles", "vehicle"]),
  fiscal: new Set(["fiscalite", "impots", "impot"]),
  health: new Set(["sante", "sante-famille"]),
  school: new Set(["scolarite", "ecole"]),
  bank: new Set(["banque", "finances", "finance"]),
  home: new Set(["maison", "habitation"]),
  insurance: new Set(["assurances", "assurance"])
};

function inferFolderKeys(
  suggestion: AiClassificationSuggestion,
  input: BoundedAiClassificationInput
): FolderKey[] {
  const signal = normalizeNameBlock([
    suggestion.subject,
    suggestion.target,
    suggestion.documentType,
    suggestion.issuer,
    suggestion.detail,
    input.filename,
    input.extractedTextExcerpt,
    input.ocrTextExcerpt
  ].filter(Boolean).join(" "));
  const keys: FolderKey[] = [];

  if (hasAnySignal(signal, ["vehicule", "vehicules", "vehicle", "vehicles", "renault", "captur", "controle-technique", "carte-grise", "garage"])) {
    keys.push("vehicles");
  }
  if (hasAnySignal(signal, ["avis-imposition", "declaration-revenus", "taxe-fonciere", "impot", "impots", "fiscal"])) {
    keys.push("fiscal");
  }
  if (hasAnySignal(signal, ["carnet-vaccination", "ordonnance", "resultat-labo", "sante", "medical"])) {
    keys.push("health");
  }
  if (hasAnySignal(signal, ["certificat-scolarite", "scolarite", "bulletin-scolaire", "ecole", "college", "lycee"])) {
    keys.push("school");
  }
  if (hasAnySignal(signal, ["releve-bancaire", "banque", "bnp", "compte"])) {
    keys.push("bank");
  }
  if (hasAnySignal(signal, ["facture-energie", "electricite", "gaz", "eau", "maison", "habitation"])) {
    keys.push("home");
  }
  if (hasAnySignal(signal, ["assurance", "attestation-assurance", "contrat-assurance", "sinistre"])) {
    keys.push("insurance");
  }

  return uniqueStrings(keys) as FolderKey[];
}

function hasAnySignal(signal: string, terms: string[]): boolean {
  return terms.some((term) => signal.includes(term));
}

function applyGeneratedProposedName(
  suggestion: AiClassificationSuggestion,
  extension: string
): void {
  const namingTarget = suggestion.subject?.trim() || suggestion.target?.trim() || "";
  if (!suggestion.dateToken || !namingTarget || !suggestion.documentType) {
    delete suggestion.proposedName;
    return;
  }

  const generated = generateDocumentNameV2({
    dateToken: suggestion.dateToken,
    target: namingTarget,
    documentType: suggestion.documentType,
    ...(suggestion.issuer ? { issuer: suggestion.issuer } : {}),
    ...(suggestion.detail ? { detail: suggestion.detail } : {}),
    extension
  });
  if (!generated.isValid) {
    delete suggestion.proposedName;
    suggestion.warnings.push("Nom proposé IA non généré : champs IA incomplets ou invalides.");
    return;
  }

  suggestion.proposedName = generated.filename;
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
  knownRelativeFolders: string[];
}): AiClassificationInput {
  return {
    filename: path.basename(options.documentName),
    extension: options.extension,
    extractedTextExcerpt:
      options.textContext.source === "pdf-native" ? options.textContext.excerpt : "",
    ocrTextExcerpt:
      options.textContext.source === "tesseract-cli" ? options.textContext.excerpt : "",
    knownRelativeFolders: options.knownRelativeFolders,
    availableRootFolders: rootFoldersFromRelativeFolders(options.knownRelativeFolders),
    namingConvention: "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext",
    detectedDate: "",
    detectedYear: ""
  };
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
