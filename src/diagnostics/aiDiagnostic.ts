import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AiDocumentSuggestion, AiDocumentTextContext } from "../ai/ollamaDocumentSuggestion";
import type { AiSettingsResult } from "../ai/ollamaSettings";

export type AiDiagnosticMode = "diagnosticComplet" | "diagnosticExpurge";

export interface AiDiagnosticWriteOptions {
  userDataPath: string;
  documentName: string;
  extension: string;
  textContext: AiDocumentTextContext | null;
  aiResult: AiSettingsResult<AiDocumentSuggestion> | null;
  now?: () => Date;
  makeDirectory?: (directoryPath: string) => Promise<void>;
  writeTextFile?: (filePath: string, content: string) => Promise<void>;
}

export type AiDiagnosticResult =
  | {
      ok: true;
      value: {
        mode: AiDiagnosticMode;
        diagnosticKind: "ai";
        diagnosticPath: string;
        documentName: string;
        message: string;
      };
    }
  | {
      ok: false;
      error: {
        code: "DIAGNOSTIC_WRITE_FAILED" | "DIAGNOSTIC_DOCUMENT_NOT_IN_QUEUE";
        message: string;
      };
    };

export async function writeAiDiagnostic(
  options: AiDiagnosticWriteOptions
): Promise<AiDiagnosticResult> {
  const mode = resolveAiDiagnosticMode(options.documentName);
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const diagnosticsDirectory = path.join(options.userDataPath, "diagnostics");
  const diagnosticPath = path.join(
    diagnosticsDirectory,
    `${createdAt.replace(/[:.]/g, "-")}_diagnostic-ia_${safeDiagnosticFileStem(options.documentName)}.json`
  );
  const content = `${JSON.stringify(createAiDiagnosticLog(options, mode, createdAt), null, 2)}\n`;

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
        message: "Écriture du diagnostic IA impossible."
      }
    };
  }

  return {
    ok: true,
    value: {
      mode,
      diagnosticKind: "ai",
      diagnosticPath,
      documentName: options.documentName,
      message: `Diagnostic IA ${mode === "diagnosticComplet" ? "complet" : "expurgé"} exporté.`
    }
  };
}

export function resolveAiDiagnosticMode(documentName: string): AiDiagnosticMode {
  return /^T[0-9][0-9]-/.test(getPortableBasename(documentName).trimStart())
    ? "diagnosticComplet"
    : "diagnosticExpurge";
}

function createAiDiagnosticLog(
  options: AiDiagnosticWriteOptions,
  mode: AiDiagnosticMode,
  createdAt: string
): unknown {
  const aiResult = mode === "diagnosticComplet"
    ? options.aiResult
    : stripRejectedCandidateValues(options.aiResult);
  const log = {
    version: 1,
    createdAt,
    mode,
    diagnosticKind: "ai",
    diagnosticTitle: "Diagnostic IA",
    document: {
      name: options.documentName,
      extension: options.extension
    },
    text: createDiagnosticText(options.textContext, mode),
    validationErrors: createDiagnosticValidationErrors(options.aiResult, mode),
    ia: aiResult
  };

  return mode === "diagnosticComplet" ? log : redactDiagnosticValue(log);
}

function createDiagnosticValidationErrors(
  value: AiSettingsResult<AiDocumentSuggestion> | null,
  mode: AiDiagnosticMode
): unknown[] {
  if (!value || value.ok) {
    return [];
  }

  const direct = Array.isArray(value.error.validationErrors)
    ? value.error.validationErrors
    : [];
  const validationErrors = direct.length > 0
    ? direct
    : [
        {
          ...(value.error.field ? { field: value.error.field } : {}),
          reason: value.error.message
        }
      ];

  return mode === "diagnosticComplet"
    ? validationErrors
    : validationErrors.map(redactValidationError);
}

function stripRejectedCandidateValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripRejectedCandidateValues);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "rejectedCandidates" && Array.isArray(entry)) {
      output[key] = entry.map((candidate) => redactRejectedCandidate(candidate));
      continue;
    }
    if (key === "validationErrors" && Array.isArray(entry)) {
      output[key] = entry.map((candidate) => redactValidationError(candidate));
      continue;
    }

    output[key] = stripRejectedCandidateValues(entry);
  }
  return output;
}

function redactRejectedCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.field === "string" ? { field: record.field } : {}),
    ...(typeof record.index === "number" ? { index: record.index } : {}),
    ...(typeof record.reason === "string" ? { reason: record.reason } : {})
  };
}

function redactValidationError(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.field === "string" ? { field: record.field } : {}),
    ...(typeof record.reason === "string" ? { reason: record.reason } : {})
  };
}

function createDiagnosticText(
  textContext: AiDocumentTextContext | null,
  mode: AiDiagnosticMode
): { source: AiDocumentTextContext["source"]; text?: string; excerpt?: string; truncated?: boolean } | null {
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

function redactDiagnosticValue(value: unknown): unknown {
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

function getPortableBasename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
}

function isPathKey(key: string): boolean {
  return /path|chemin/i.test(key);
}

function looksLikeAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || /^\\\\/.test(value);
}
