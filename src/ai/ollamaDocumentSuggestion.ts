import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import {
  buildAiClassificationSuggestion
} from "./aiClassificationOrchestrator";
import type {
  AiClassificationInput,
  AiClassificationSuggestion,
  AiRuleSuggestionSnapshot,
  BoundedAiClassificationInput
} from "./aiClassificationTypes";
import {
  generateOllamaCompletion,
  testOllamaConnection,
  type OllamaHttpClient
} from "./ollamaClient";
import { buildOllamaClassificationPrompt } from "./ollamaPromptBuilder";
import {
  aiFailure,
  loadAiSettings,
  type AiSettingsResult
} from "./ollamaSettings";
import "../rules/defaultNamingSuggestionRules";
import "../rules/namingSuggestionRulesCatalog";
import "../rules/namingSuggestions";

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
  input: BoundedAiClassificationInput;
  suggestion: AiClassificationSuggestion;
  promptCharacterCount: number;
  differsFromLocalRules: boolean;
  message: string;
}

export interface RunOllamaSuggestionForDocumentOptions {
  documentPath: string;
  textContext: AiDocumentTextContext | null;
  queuedDocuments: Iterable<AiQueuedDocument>;
  queuedDocumentPaths: Iterable<string>;
  userDataPath: string;
  rulesCatalog: NamingSuggestionRulesCatalog;
  knownRelativeFolders?: string[];
  fetchClient?: OllamaHttpClient;
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

  const localSuggestions = buildLocalRuleSuggestions(
    activeDocument.value.name,
    textContext.excerpt,
    options.rulesCatalog
  );
  const aiInput = buildAiInput({
    documentName: activeDocument.value.name,
    extension: path.extname(activeDocument.value.name),
    textContext,
    localSuggestions,
    knownRelativeFolders: options.knownRelativeFolders ?? []
  });
  const prompt = buildOllamaClassificationPrompt(aiInput);
  const connection = await testOllamaConnection(settings, {
    fetchClient: options.fetchClient,
    now: options.now
  });

  if (!connection.ok) {
    return connection;
  }

  if (connection.value.status === "model-missing") {
    return aiFailure("AI_MODEL_NOT_FOUND", connection.value.message);
  }

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

  const differsFromLocalRules = differsFromRuleSuggestions(
    classified.suggestion,
    prompt.input.currentRuleSuggestions
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
      input: prompt.input,
      suggestion: classified.suggestion,
      promptCharacterCount: prompt.prompt.length,
      differsFromLocalRules,
      message: differsFromLocalRules
        ? "Suggestion IA prête. Diffère des règles locales."
        : "Suggestion IA prête."
    }
  };
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

function buildLocalRuleSuggestions(
  filename: string,
  extractedText: string,
  rulesCatalog: NamingSuggestionRulesCatalog
): NamingSuggestions {
  return globalThis.DocSorterNamingSuggestions.buildNamingSuggestions({
    filename,
    extractedText,
    rulesCatalog
  });
}

function buildAiInput(options: {
  documentName: string;
  extension: string;
  textContext: AiDocumentTextContext;
  localSuggestions: NamingSuggestions;
  knownRelativeFolders: string[];
}): AiClassificationInput {
  const detectedDate = options.localSuggestions.date?.value ?? "";
  return {
    filename: path.basename(options.documentName),
    extension: options.extension,
    extractedTextExcerpt:
      options.textContext.source === "pdf-native" ? options.textContext.excerpt : "",
    ocrTextExcerpt:
      options.textContext.source === "tesseract-cli" ? options.textContext.excerpt : "",
    currentRuleSuggestions: toAiRuleSuggestionSnapshot(options.localSuggestions),
    knownRelativeFolders: options.knownRelativeFolders,
    availableRootFolders: rootFoldersFromRelativeFolders(options.knownRelativeFolders),
    namingConvention: "AAAA-MM-JJ_Sujet_Type_MotsCles.ext",
    detectedDate,
    detectedYear: /^(19|20)\d{2}$/.test(detectedDate)
      ? detectedDate
      : detectedDate.match(/^(19|20)\d{2}/)?.[0] ?? ""
  };
}

function toAiRuleSuggestionSnapshot(suggestions: NamingSuggestions): AiRuleSuggestionSnapshot | null {
  if (
    !suggestions.date &&
    !suggestions.documentType &&
    !suggestions.subject &&
    !suggestions.targetFolder &&
    suggestions.keywords.length === 0
  ) {
    return null;
  }

  return {
    date: suggestions.date?.value ?? null,
    documentType: suggestions.documentType?.value ?? null,
    subject: suggestions.subject?.value ?? null,
    targetFolder: suggestions.targetFolder?.value ?? null,
    keywords: suggestions.keywords.map((keyword) => keyword.value),
    confidence: Math.round(suggestions.confidence * 100),
    reasons: suggestions.reasons
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

function differsFromRuleSuggestions(
  suggestion: AiClassificationSuggestion,
  ruleSuggestions: AiRuleSuggestionSnapshot | null
): boolean {
  if (!ruleSuggestions) {
    return false;
  }

  return (
    differs(suggestion.date, ruleSuggestions.date) ||
    differs(suggestion.documentType, ruleSuggestions.documentType) ||
    differs(suggestion.subject, ruleSuggestions.subject) ||
    differs(suggestion.targetFolder, ruleSuggestions.targetFolder)
  );
}

function differs(left: string | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() !== right.trim().toLowerCase());
}
