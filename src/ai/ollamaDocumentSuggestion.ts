import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import type {
  AiClassificationInput,
  AiClassificationValidationError,
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
import {
  buildKnownTargetHints,
  type KnownTargetHint
} from "../known-targets/buildKnownTargetHints";
import type { KnownTarget } from "../known-targets/knownTargets";
import { isFilenameLikeTarget } from "./aiSuggestionSafety";

export type AiDocumentTextSource = "pdf-native" | "pdf-ocr" | "pdf-hybrid" | "tesseract-cli";

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
  knownTargetContext?: AiKnownTargetContext;
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
  knownTargets?: KnownTarget[];
  selectedTargetFolder?: string;
  competingRelativePaths?: string[];
  fetchClient?: OllamaHttpClient;
  modelManager?: OllamaModelManagerLike;
  statFile?: (filePath: string) => Promise<Pick<Stats, "isFile">>;
  now?: () => Date;
}

export interface AiKnownTargetContext {
  activeTargetCount: number;
  hintCount: number;
  kinds: KnownTarget["kind"][];
  evidenceSources: KnownTargetHint["evidenceSources"];
}

const FULL_DATE_TOKEN_PATTERN = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const SCHOOL_YEAR_TOKEN_PATTERN = /^((?:19|20)\d{2})-((?:19|20)\d{2})$/;
const MONTH_TOKEN_PATTERN = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/;
const MONTHLY_PERIOD_DOCUMENT_TYPES = new Set([
  "releve-bancaire",
  "releve-epargne",
  "facture-energie",
  "facture-electricite",
  "facture-gaz",
  "facture-eau",
  "quittance",
  "quittance-loyer",
  "loyer"
]);
const GENERIC_PERIOD_DETAIL_TOKENS = new Set([
  "periode",
  "mois",
  "mensuel",
  "mensuelle"
]);
const GENERIC_FOLDER_TARGET_VALUES = new Set([
  "assurance",
  "assurances",
  "banque",
  "finances",
  "fiscalite",
  "identite",
  "identite-famille",
  "maison",
  "sante",
  "scolarite",
  "vehicule",
  "vehicules"
]);
const MONTH_DETAIL_TOKENS: Record<string, string[]> = {
  "01": ["janvier", "janv"],
  "02": ["fevrier", "fev"],
  "03": ["mars"],
  "04": ["avril", "avr"],
  "05": ["mai"],
  "06": ["juin"],
  "07": ["juillet", "juil"],
  "08": ["aout"],
  "09": ["septembre", "sept"],
  "10": ["octobre", "oct"],
  "11": ["novembre", "nov"],
  "12": ["decembre", "dec"]
};

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
    knownRelativeFolders: options.knownRelativeFolders ?? [],
    knownTargets: options.knownTargets ?? [],
    selectedTargetFolder: options.selectedTargetFolder ?? options.competingRelativePaths?.[0] ?? ""
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

  const multiCandidateValidation = validateAiMultiCandidateResponse(parsed.value, {
    filename: prompt.input.filename,
    text: prompt.input.extractedTextExcerpt,
    ocrText: prompt.input.ocrTextExcerpt,
    selectedFolder: options.selectedTargetFolder ?? options.competingRelativePaths?.[0] ?? "",
    knownTargetHints: prompt.input.knownTargetHints,
    knownTargets: options.knownTargets
  });
  if (multiCandidateValidation.status === "invalid") {
    return aiOutputValidationFailure(multiCandidateValidation.error);
  }

  applyTextContextCandidateHints(multiCandidateValidation.response, prompt.input);

  const adapted = adaptMultiCandidateResponseToSuggestion(multiCandidateValidation.response);
  if (adapted.status !== "valid") {
    return aiOutputValidationFailure(adapted.error);
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
      knownTargetContext: createKnownTargetContext(options.knownTargets ?? [], prompt.input.knownTargetHints),
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
      message: multiCandidateValidation.response.rejectedCandidates.length > 0
        ? "Certains candidats IA ont été ignorés. Analyse conservée."
        : "Suggestion IA autonome prête."
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
  sanitizeDatePeriodDetail(next);

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
  addDatePrecisionWarning(next);
  applyGeneratedProposedName(next, input.extension);

  next.reasons = uniqueStrings(next.reasons).slice(0, 8);
  next.warnings = uniqueStrings(next.warnings).slice(0, 8);
  return next;
}

function applyTextContextCandidateHints(
  response: AiMultiCandidateResponse,
  input: BoundedAiClassificationInput
): void {
  const documentType = normalizeNameBlock(response.fields.documentType.selected);
  if (documentType !== "releve-bancaire" || !textContainsJointAccount(input)) {
    return;
  }

  const existing = response.fields.target.candidates.find(
    (candidate) => normalizeNameBlock(candidate.value) === "compte-joint"
  );
  if (existing) {
    existing.score = Math.max(existing.score, 95);
    existing.role = existing.role || "selected";
  } else {
    response.fields.target.candidates.unshift({
      value: "compte-joint",
      score: 95,
      reason: "Mention explicite Compte joint détectée dans le texte.",
      role: "selected"
    });
    response.fields.target.candidates = response.fields.target.candidates.slice(0, 3);
  }
  response.fields.target.selected = "compte-joint";
}

function textContainsJointAccount(input: BoundedAiClassificationInput): boolean {
  const signal = normalizeNameBlock([
    input.filename,
    input.extractedTextExcerpt,
    input.ocrTextExcerpt
  ].filter(Boolean).join(" "));
  return signal.includes("compte-joint");
}

function addDatePrecisionWarning(suggestion: AiClassificationSuggestion): void {
  if (
    !suggestion.dateToken ||
    FULL_DATE_TOKEN_PATTERN.test(suggestion.dateToken) ||
    isSchoolYearToken(suggestion.dateToken)
  ) {
    return;
  }

  const documentType = normalizeNameBlock(suggestion.documentType);
  if (!expectsPreciseDate(documentType)) {
    return;
  }

  suggestion.warnings.push("Date IA à préciser : une date complète était attendue pour ce type de document.");
}

function expectsPreciseDate(documentType: string): boolean {
  return (
    documentType.includes("contrat") ||
    documentType.includes("assurance") ||
    documentType.includes("carte-identite") ||
    documentType.includes("passeport") ||
    documentType.includes("identite")
  );
}

function expectsMonthlyPeriodDate(documentType: string): boolean {
  return (
    MONTHLY_PERIOD_DOCUMENT_TYPES.has(documentType) ||
    (documentType.includes("releve") && documentType.includes("bancaire")) ||
    (documentType.includes("facture") && documentType.includes("energie"))
  );
}

function sanitizeDatePeriodDetail(suggestion: AiClassificationSuggestion): void {
  if (!suggestion.detail || !suggestion.dateToken) {
    return;
  }

  const cleaned = removeDatePeriodTerms(suggestion.detail, suggestion.dateToken);
  if (cleaned.value === normalizeNameBlock(suggestion.detail)) {
    return;
  }

  if (cleaned.value) {
    suggestion.detail = cleaned.value;
  } else {
    delete suggestion.detail;
  }

  suggestion.warnings.push("Détail IA ignoré : période déjà représentée par la date.");
}

function removeDatePeriodTerms(value: string, dateToken: string): { value: string } {
  const normalized = normalizeNameBlock(value);
  if (!normalized) {
    return { value: "" };
  }

  const redundantTokens = buildDateRedundantTokens(dateToken);
  if (redundantTokens.size === 0) {
    return { value: normalized };
  }

  const tokens = normalized.split("-").filter(Boolean);
  if (
    tokens.length > 0 &&
    tokens.every((token) => redundantTokens.has(token) || GENERIC_PERIOD_DETAIL_TOKENS.has(token))
  ) {
    return { value: "" };
  }

  const containsDateToken = tokens.some((token) => redundantTokens.has(token));
  const kept = tokens.filter((token) => {
    if (redundantTokens.has(token)) {
      return false;
    }

    return !(containsDateToken && GENERIC_PERIOD_DETAIL_TOKENS.has(token));
  });

  return { value: kept.join("-") };
}

function buildDateRedundantTokens(dateToken: string): Set<string> {
  const tokens = new Set<string>();
  const yearMatch = dateToken.match(/^((?:19|20)\d{2})$/);
  if (yearMatch) {
    tokens.add(yearMatch[1]);
    return tokens;
  }

  const schoolYearMatch = dateToken.match(SCHOOL_YEAR_TOKEN_PATTERN);
  if (schoolYearMatch) {
    tokens.add(schoolYearMatch[1]);
    tokens.add(schoolYearMatch[2]);
    tokens.add(`${schoolYearMatch[1]}-${schoolYearMatch[2]}`);
    tokens.add("annee");
    tokens.add("scolaire");
    return tokens;
  }

  const monthMatch = dateToken.match(MONTH_TOKEN_PATTERN);
  const fullDateMatch = dateToken.match(FULL_DATE_TOKEN_PATTERN);
  const year = monthMatch?.[1] ?? fullDateMatch?.[1];
  const month = monthMatch?.[2] ?? fullDateMatch?.[2];
  const day = fullDateMatch?.[3];
  if (!year || !month) {
    return tokens;
  }

  tokens.add(year);
  tokens.add(month);
  tokens.add(String(Number(month)));
  for (const monthToken of MONTH_DETAIL_TOKENS[month] ?? []) {
    tokens.add(monthToken);
  }

  if (day) {
    tokens.add(day);
    tokens.add(String(Number(day)));
  }

  return tokens;
}

function sanitizeNameBlocks(suggestion: AiClassificationSuggestion): void {
  const removed: string[] = [];
  suggestion.subject = sanitizeOptionalBlock(suggestion.subject, removed);
  suggestion.target = sanitizeOptionalBlock(suggestion.target, removed);
  suggestion.documentType = sanitizeOptionalBlock(suggestion.documentType, removed);
  suggestion.issuer = sanitizeOptionalBlock(suggestion.issuer, removed);
  suggestion.detail = sanitizeOptionalBlock(suggestion.detail, removed);

  sanitizeSubjectBlock(suggestion, removed);

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

function sanitizeSubjectBlock(suggestion: AiClassificationSuggestion, removed: string[]): void {
  if (!suggestion.subject) {
    return;
  }

  const normalizedSubject = normalizeNameBlock(suggestion.subject);
  const exactBlockedValues = [
    suggestion.target,
    suggestion.documentType,
    suggestion.issuer,
    suggestion.detail
  ].map((value) => normalizeNameBlock(value)).filter(Boolean);

  if (exactBlockedValues.includes(normalizedSubject)) {
    delete suggestion.subject;
    return;
  }

  const forbiddenTerms = new Set([
    ...tokenSet(suggestion.documentType),
    ...tokenSet(suggestion.issuer),
    ...tokenSet(suggestion.detail)
  ]);
  if (forbiddenTerms.size === 0) {
    return;
  }

  const cleaned = removeTerms(suggestion.subject, forbiddenTerms, removed);
  if (cleaned) {
    suggestion.subject = cleaned;
  } else {
    delete suggestion.subject;
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

type FolderKey =
  | "vehicles"
  | "fiscal"
  | "health"
  | "school"
  | "bank"
  | "home"
  | "insurance"
  | "identity";

const FOLDER_KEY_ALIASES: Record<FolderKey, Set<string>> = {
  vehicles: new Set(["vehicules", "vehicule", "vehicles", "vehicle"]),
  fiscal: new Set(["fiscalite", "impots", "impot"]),
  health: new Set(["sante", "sante-famille"]),
  school: new Set(["scolarite", "ecole"]),
  bank: new Set(["banque", "finances", "finance"]),
  home: new Set(["maison", "habitation"]),
  insurance: new Set(["assurances", "assurance"]),
  identity: new Set(["cni", "identite", "identite-famille", "papiers-identite"])
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

  if (hasAnySignal(signal, ["vehicule", "vehicules", "vehicle", "vehicles", "controle-technique", "carte-grise", "garage"])) {
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
  if (hasAnySignal(signal, ["releve-bancaire", "banque", "compte"])) {
    keys.push("bank");
  }
  if (hasAnySignal(signal, ["facture-energie", "electricite", "gaz", "eau", "maison", "habitation"])) {
    keys.push("home");
  }
  if (hasAnySignal(signal, ["assurance", "attestation-assurance", "contrat-assurance", "sinistre"])) {
    keys.push("insurance");
  }
  if (hasAnySignal(signal, ["carte-identite", "identite", "passeport", "cni", "delivrance"])) {
    keys.push("identity");
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
  const namingTarget = selectNamingTarget(suggestion);
  if (!suggestion.dateToken || !namingTarget || !suggestion.documentType) {
    delete suggestion.proposedName;
    return;
  }

  const generated = generateDocumentNameV2({
    dateToken: suggestion.dateToken,
    target: namingTarget,
    documentType: suggestion.documentType,
    ...(suggestion.subject ? { subject: suggestion.subject } : {}),
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

function selectNamingTarget(suggestion: AiClassificationSuggestion): string {
  const target = suggestion.target?.trim() ?? "";
  if (target && !GENERIC_FOLDER_TARGET_VALUES.has(normalizeNameBlock(target))) {
    return target;
  }

  return target;
}

function isSchoolYearToken(value: string): boolean {
  const match = value.match(SCHOOL_YEAR_TOKEN_PATTERN);
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
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
  if (
    !value ||
    (
      value.source !== "pdf-native" &&
      value.source !== "pdf-ocr" &&
      value.source !== "pdf-hybrid" &&
      value.source !== "tesseract-cli"
    )
  ) {
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
  knownTargets: KnownTarget[];
  selectedTargetFolder: string;
}): AiClassificationInput {
  const extractedTextExcerpt =
    options.textContext.source === "pdf-native" ? options.textContext.excerpt : "";
  const ocrTextExcerpt =
    options.textContext.source === "pdf-ocr" ||
    options.textContext.source === "pdf-hybrid" ||
    options.textContext.source === "tesseract-cli"
      ? options.textContext.excerpt
      : "";
  return {
    filename: path.basename(options.documentName),
    extension: options.extension,
    extractedTextExcerpt,
    ocrTextExcerpt,
    knownRelativeFolders: options.knownRelativeFolders,
    knownTargetHints: buildKnownTargetHints({
      targets: options.knownTargets,
      filename: path.basename(options.documentName),
      extractedText: extractedTextExcerpt,
      ocrText: ocrTextExcerpt,
      selectedFolder: options.selectedTargetFolder
    }),
    availableRootFolders: rootFoldersFromRelativeFolders(options.knownRelativeFolders),
    namingConvention: "DATE_CIBLE_DOCUMENT[_SUJET][_EMETTEUR][_DETAIL].ext",
    detectedDate: "",
    detectedYear: ""
  };
}

function createKnownTargetContext(
  targets: KnownTarget[],
  hints: KnownTargetHint[]
): AiKnownTargetContext {
  const activeTargets = targets.filter((target) => target.isActive);
  return {
    activeTargetCount: activeTargets.length,
    hintCount: hints.length,
    kinds: uniqueStrings(hints.map((hint) => hint.kind)) as KnownTarget["kind"][],
    evidenceSources: uniqueStrings(hints.flatMap((hint) => hint.evidenceSources)) as KnownTargetHint["evidenceSources"]
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

function aiOutputValidationFailure<T = never>(
  error: AiClassificationValidationError
): AiSettingsResult<T> {
  return {
    ok: false,
    error: {
      code: "AI_OUTPUT_INVALID",
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
      ...(error.validationErrors?.length ? { validationErrors: error.validationErrors } : {})
    }
  };
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
