import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AiSettingsResult } from "../ai/ollamaSettings";
import type { AiDocumentSuggestion } from "../ai/ollamaDocumentSuggestion";
import type { NamingDraft } from "../naming/namingDraft";
import type {
  SuggestionV2Result,
  SuggestionV2TextContext
} from "../suggestions/buildSuggestionV2ForDocument";

export type SuggestionDiagnosticMode = "diagnosticComplet" | "diagnosticExpurge";
export type SuggestionDiagnosticKind = "suggestions" | "ai";

export interface SuggestionV2DiagnosticWriteOptions {
  userDataPath: string;
  documentName: string;
  extension: string;
  diagnosticKind?: SuggestionDiagnosticKind;
  textContext: SuggestionV2TextContext | null;
  legacyDraft: unknown;
  suggestionResult: SuggestionV2Result;
  aiResult?: AiSettingsResult<AiDocumentSuggestion> | null;
  now?: () => Date;
  makeDirectory?: (directoryPath: string) => Promise<void>;
  writeTextFile?: (filePath: string, content: string) => Promise<void>;
}

export type SuggestionV2DiagnosticResult =
  | {
      ok: true;
      value: {
        mode: SuggestionDiagnosticMode;
        diagnosticKind: SuggestionDiagnosticKind;
        diagnosticPath: string;
        documentName: string;
        message: string;
      };
    }
  | {
      ok: false;
      error: {
        code: "DIAGNOSTIC_WRITE_FAILED";
        message: string;
      };
    };

interface DiagnosticDocumentText {
  source: SuggestionV2TextContext["source"];
  text?: string;
  excerpt?: string;
  truncated?: boolean;
}

export async function writeSuggestionV2Diagnostic(
  options: SuggestionV2DiagnosticWriteOptions
): Promise<SuggestionV2DiagnosticResult> {
  const mode = resolveDiagnosticMode(options.documentName);
  const diagnosticKind = options.diagnosticKind ?? "suggestions";
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const diagnosticsDirectory = path.join(options.userDataPath, "diagnostics");
  const diagnosticPath = path.join(
    diagnosticsDirectory,
    `${createdAt.replace(/[:.]/g, "-")}_${diagnosticKindFileToken(diagnosticKind)}_${safeDiagnosticFileStem(options.documentName)}.json`
  );
  const log = createDiagnosticLog(options, mode, diagnosticKind, createdAt);
  const content = `${JSON.stringify(log, null, 2)}\n`;

  try {
    if (options.makeDirectory) {
      await options.makeDirectory(diagnosticsDirectory);
    } else {
      await mkdir(diagnosticsDirectory, { recursive: true });
    }

    if (options.writeTextFile) {
      await options.writeTextFile(diagnosticPath, content);
    } else {
      await writeFile(diagnosticPath, content, "utf8");
    }
  } catch {
    return {
      ok: false,
      error: {
        code: "DIAGNOSTIC_WRITE_FAILED",
        message: "Écriture du diagnostic impossible."
      }
    };
  }

  return {
    ok: true,
    value: {
      mode,
      diagnosticKind,
      diagnosticPath,
      documentName: options.documentName,
      message: `${diagnosticKindLabel(diagnosticKind)} ${mode === "diagnosticComplet" ? "complet" : "expurgé"} exporté.`
    }
  };
}

export function resolveDiagnosticMode(documentName: string): SuggestionDiagnosticMode {
  return isTxxDiagnosticDocumentName(documentName) ? "diagnosticComplet" : "diagnosticExpurge";
}

export function isTxxDiagnosticDocumentName(documentName: string): boolean {
  const basename = getPortableBasename(documentName).trimStart();
  return /^T[0-9][0-9]-/.test(basename);
}

export function redactDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactDiagnosticValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isPathKey(key) && typeof entry === "string" && looksLikeAbsolutePath(entry)) {
      output[key] = "[chemin-expurgé]";
      continue;
    }

    output[key] = redactDiagnosticValue(entry);
  }
  return output;
}

function createDiagnosticLog(
  options: SuggestionV2DiagnosticWriteOptions,
  mode: SuggestionDiagnosticMode,
  diagnosticKind: SuggestionDiagnosticKind,
  createdAt: string
): unknown {
  const suggestion = options.suggestionResult.ok ? options.suggestionResult.value : null;
  const common = {
    version: 1,
    createdAt,
    mode,
    diagnosticKind,
    diagnosticTitle: diagnosticKindLabel(diagnosticKind),
    document: {
      name: options.documentName,
      extension: options.extension
    },
    text: createDiagnosticText(options.textContext, mode),
    suggestionsHistoriques: options.legacyDraft,
    referenceDataWarnings: suggestion?.referenceDataWarnings ?? [],
    dateSelection: suggestion?.draft.dateSelection ?? null,
    nomV2: {
      avantAntiDoublons: suggestion?.draft.semanticDeduplication?.before ?? null,
      apresAntiDoublons: suggestion?.draft.semanticDeduplication?.after ?? null,
      proposedName: suggestion?.draft.proposedName ?? null,
      semanticDeduplication: suggestion?.draft.semanticDeduplication ?? null
    },
    dossiers: {
      candidats: suggestion?.folderPlacementCandidates ?? [],
      recommande: suggestion?.folderPlacement ?? null,
      options: suggestion?.targetFolderSuggestion.options ?? [],
      optionsRejetees: suggestion?.targetFolderSuggestion.warnings ?? []
    },
    profilNommage: suggestion?.folderNamingProfile ?? null,
    warnings: collectWarnings(options.suggestionResult),
    erreurs: options.suggestionResult.ok ? [] : [options.suggestionResult.error],
    ia: options.aiResult ?? null
  };

  return mode === "diagnosticComplet" ? common : redactDiagnosticValue(common);
}

function createDiagnosticText(
  textContext: SuggestionV2TextContext | null,
  mode: SuggestionDiagnosticMode
): DiagnosticDocumentText | null {
  if (!textContext) {
    return null;
  }

  if (mode === "diagnosticComplet") {
    return {
      source: textContext.source,
      text: textContext.excerpt
    };
  }

  const redacted = redactSensitiveText(textContext.excerpt).slice(0, 500);
  return {
    source: textContext.source,
    excerpt: redacted,
    truncated: textContext.excerpt.length > 500
  };
}

function collectWarnings(result: SuggestionV2Result): string[] {
  if (!result.ok) {
    return [];
  }

  return uniqueStrings([
    ...result.value.draft.warnings,
    ...result.value.targetFolderSuggestion.warnings,
    ...(result.value.folderPlacement?.warnings ?? []),
    ...(result.value.folderNamingProfile?.warnings ?? []),
    ...result.value.referenceDataWarnings
  ]);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/[a-zA-Z]:\\[^\s"',;]+/g, "[chemin-expurgé]")
    .replace(/\\\\[^\s"',;]+/g, "[chemin-expurgé]")
    .replace(/\b(?:[0-2]?\d|3[01])[/-](?:0?\d|1[0-2])[/-](?:19|20)\d{2}\b/g, "[date-expurgée]")
    .replace(/\b(?:19|20)\d{2}-(?:0\d|1[0-2])-(?:[0-2]\d|3[01])\b/g, "[date-expurgée]")
    .replace(/\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g, "[numero-expurgé]")
    .replace(/\b\d{11,}\b/g, "[numero-expurgé]");
}

function safeDiagnosticFileStem(documentName: string): string {
  const parsed = path.parse(getPortableBasename(documentName)).name || "document";
  return parsed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "document";
}

function diagnosticKindFileToken(kind: SuggestionDiagnosticKind): string {
  return kind === "ai" ? "diagnostic-ia" : "diagnostic-suggestions";
}

function diagnosticKindLabel(kind: SuggestionDiagnosticKind): string {
  return kind === "ai" ? "Diagnostic IA" : "Diagnostic suggestions";
}

function getPortableBasename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
}

function isPathKey(key: string): boolean {
  return /path|chemin/i.test(key);
}

function looksLikeAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || /^\\\\/.test(value);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
