import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_AI_MODEL_PROFILE_ID,
  getAiModelProfile,
  inferAiModelProfileId,
  type AiModelProfileId
} from "./aiModelProfiles";

export type AiProviderName = "ollama";
export type AiConnectionStatus =
  | "disabled"
  | "not-tested"
  | "ok"
  | "model-missing"
  | "error"
  | "timeout";

export type AiSettingsErrorCode =
  | "AI_URL_NOT_LOCAL"
  | "AI_PROVIDER_DISABLED"
  | "AI_CONFIG_INVALID"
  | "AI_CONFIG_READ_FAILED"
  | "AI_CONFIG_WRITE_FAILED"
  | "AI_CONNECTION_TIMEOUT"
  | "AI_CONNECTION_FAILED"
  | "AI_VERSION_FAILED"
  | "AI_MODEL_NOT_FOUND"
  | "AI_DOCUMENT_NOT_SELECTED"
  | "AI_DOCUMENT_NOT_IN_QUEUE"
  | "AI_DOCUMENT_NOT_FOUND"
  | "AI_TEXT_NOT_AVAILABLE"
  | "AI_OUTPUT_INVALID"
  | "UNKNOWN_ERROR";

export interface AiSettingsError {
  code: AiSettingsErrorCode;
  message: string;
  field?: string;
}

export type AiSettingsResult<T> = { ok: true; value: T } | { ok: false; error: AiSettingsError };

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderName;
  baseUrl: string;
  profileId: AiModelProfileId;
  model: string;
  think: boolean;
  timeoutMs: number;
  keepAlive: string;
  lastTestAt: string | null;
  lastStatus: AiConnectionStatus | null;
  lastError: string | null;
}

export type AiSettingsInput = Partial<AiSettings>;

export interface AiStatus {
  settingsPath: string;
  settings: AiSettings;
  status: AiConnectionStatus;
  message: string;
  error: AiSettingsError | null;
}

export const DEFAULT_AI_BASE_URL = "http://localhost:11434/";
export const DEFAULT_AI_TIMEOUT_MS = 30_000;
export const DEFAULT_AI_KEEP_ALIVE = "30m";
const MIN_AI_TIMEOUT_MS = 1_000;
const MAX_AI_TIMEOUT_MS = 120_000;
const MAX_AI_MODEL_LENGTH = 120;
const MAX_AI_KEEP_ALIVE_LENGTH = 12;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function getAiSettingsPath(userDataPath: string): string {
  return path.join(userDataPath, "config", "ai-settings.json");
}

export function createDefaultAiSettings(): AiSettings {
  const profile = getAiModelProfile(DEFAULT_AI_MODEL_PROFILE_ID);
  return {
    enabled: false,
    provider: "ollama",
    baseUrl: DEFAULT_AI_BASE_URL,
    profileId: profile.id,
    model: profile.model,
    think: profile.think,
    timeoutMs: DEFAULT_AI_TIMEOUT_MS,
    keepAlive: DEFAULT_AI_KEEP_ALIVE,
    lastTestAt: null,
    lastStatus: "disabled",
    lastError: null
  };
}

export async function loadAiSettings(userDataPath: string): Promise<AiSettingsResult<AiSettings>> {
  const settingsPath = getAiSettingsPath(userDataPath);

  let rawSettings = "";
  try {
    rawSettings = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        ok: true,
        value: createDefaultAiSettings()
      };
    }

    return aiFailure("AI_CONFIG_READ_FAILED", "Impossible de lire la configuration IA locale.");
  }

  try {
    return normalizeAiSettings(JSON.parse(rawSettings));
  } catch {
    return aiFailure("AI_CONFIG_READ_FAILED", "La configuration IA locale n'est pas un JSON valide.");
  }
}

export async function getAiStatus(userDataPath: string): Promise<AiSettingsResult<AiStatus>> {
  const settings = await loadAiSettings(userDataPath);
  if (!settings.ok) {
    return settings;
  }

  return {
    ok: true,
    value: createAiStatus(getAiSettingsPath(userDataPath), settings.value)
  };
}

export async function saveAiSettings(
  userDataPath: string,
  input: AiSettingsInput
): Promise<AiSettingsResult<AiStatus>> {
  const normalized = normalizeAiSettings(input);
  if (!normalized.ok) {
    return normalized;
  }

  const writeResult = await writeAiSettings(userDataPath, normalized.value);
  if (!writeResult.ok) {
    return writeResult;
  }

  return {
    ok: true,
    value: createAiStatus(getAiSettingsPath(userDataPath), normalized.value)
  };
}

export async function writeAiSettings(
  userDataPath: string,
  settings: AiSettings
): Promise<AiSettingsResult<void>> {
  const settingsPath = getAiSettingsPath(userDataPath);
  const temporaryPath = `${settingsPath}.tmp`;

  try {
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporaryPath, settingsPath);
    return { ok: true, value: undefined };
  } catch {
    return aiFailure("AI_CONFIG_WRITE_FAILED", "Impossible de sauvegarder la configuration IA locale.");
  }
}

export function normalizeAiSettings(value: unknown): AiSettingsResult<AiSettings> {
  if (!value || typeof value !== "object") {
    return aiFailure("AI_CONFIG_INVALID", "Configuration IA locale invalide.");
  }

  const input = value as Record<string, unknown>;
  const provider = input.provider === undefined ? "ollama" : input.provider;
  if (provider !== "ollama") {
    return aiFailure("AI_CONFIG_INVALID", "Provider IA local non supporté.");
  }

  const baseUrl = normalizeLocalOllamaUrl(readOptionalString(input.baseUrl) || DEFAULT_AI_BASE_URL);
  if (!baseUrl.ok) {
    return baseUrl;
  }

  const profile = getAiModelProfile(
    readOptionalString(input.profileId) ||
      inferAiModelProfileId(readOptionalString(input.model), Boolean(input.think))
  );

  return {
    ok: true,
    value: {
      enabled: typeof input.enabled === "boolean" ? input.enabled : false,
      provider: "ollama",
      baseUrl: baseUrl.value,
      profileId: profile.id,
      model: sanitizeModelName(profile.model),
      think: profile.think,
      timeoutMs: normalizeTimeout(input.timeoutMs),
      keepAlive: normalizeKeepAlive(input.keepAlive),
      lastTestAt: readOptionalNullableString(input.lastTestAt),
      lastStatus: readConnectionStatus(input.lastStatus),
      lastError: readOptionalNullableString(input.lastError)
    }
  };
}

export function normalizeLocalOllamaUrl(value: string): AiSettingsResult<string> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return aiFailure("AI_CONFIG_INVALID", "URL Ollama invalide.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return aiFailure("AI_CONFIG_INVALID", "URL Ollama invalide.");
  }

  if (!LOCAL_HOSTNAMES.has(url.hostname.toLowerCase())) {
    return aiFailure("AI_URL_NOT_LOCAL", "URL IA refusée : seul localhost est autorisé.");
  }

  if (url.username || url.password || url.search || url.hash) {
    return aiFailure("AI_CONFIG_INVALID", "URL Ollama invalide.");
  }

  if (url.pathname && url.pathname !== "/") {
    return aiFailure("AI_CONFIG_INVALID", "URL Ollama invalide : aucun chemin n'est autorisé.");
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return {
    ok: true,
    value: url.href
  };
}

export function createUpdatedAiSettingsAfterTest(
  settings: AiSettings,
  options: {
    status: AiConnectionStatus;
    testedAt: string;
    errorMessage?: string | null;
  }
): AiSettings {
  return {
    ...settings,
    lastTestAt: options.testedAt,
    lastStatus: options.status,
    lastError: options.errorMessage ?? null
  };
}

export function aiFailure<T = never>(
  code: AiSettingsErrorCode,
  message = aiErrorMessage(code)
): AiSettingsResult<T> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

export function aiErrorMessage(code: AiSettingsErrorCode): string {
  switch (code) {
    case "AI_URL_NOT_LOCAL":
      return "URL IA refusée : seul localhost est autorisé.";
    case "AI_PROVIDER_DISABLED":
      return "IA locale désactivée.";
    case "AI_CONFIG_INVALID":
      return "Configuration IA locale invalide.";
    case "AI_CONFIG_READ_FAILED":
      return "Configuration IA locale illisible.";
    case "AI_CONFIG_WRITE_FAILED":
      return "Impossible de sauvegarder la configuration IA locale.";
    case "AI_CONNECTION_TIMEOUT":
      return "Timeout de connexion IA locale.";
    case "AI_CONNECTION_FAILED":
      return "Connexion Ollama locale impossible.";
    case "AI_VERSION_FAILED":
      return "Version Ollama locale indisponible.";
    case "AI_MODEL_NOT_FOUND":
      return "Modèle Ollama absent.";
    case "AI_DOCUMENT_NOT_SELECTED":
      return "Aucun document sélectionné pour l'analyse IA.";
    case "AI_DOCUMENT_NOT_IN_QUEUE":
      return "Document non présent dans la dernière file scannée.";
    case "AI_DOCUMENT_NOT_FOUND":
      return "Document indisponible pour l'analyse IA.";
    case "AI_TEXT_NOT_AVAILABLE":
      return "Texte extrait requis avant l'analyse IA locale.";
    case "AI_OUTPUT_INVALID":
      return "Suggestion IA invalide.";
    case "UNKNOWN_ERROR":
      return "Erreur IA locale inconnue.";
  }
}

function createAiStatus(settingsPath: string, settings: AiSettings): AiStatus {
  const status: AiConnectionStatus = currentConnectionStatus(settings);
  const disabledMessage = "IA locale désactivée. Aucun document n'est envoyé.";
  return {
    settingsPath,
    settings,
    status,
    message: settings.enabled
      ? statusMessage(status, settings)
      : disabledMessage,
    error: settings.lastError
      ? {
          code: status === "timeout" ? "AI_CONNECTION_TIMEOUT" : "AI_CONNECTION_FAILED",
          message: settings.lastError
        }
      : null
  };
}

function statusMessage(status: AiConnectionStatus, settings: AiSettings): string {
  switch (status) {
    case "disabled":
      return "IA locale désactivée. Aucun document n'est envoyé.";
    case "not-tested":
      return settings.lastStatus === "ok" && settings.lastTestAt
        ? "Dernier test Ollama OK. Relancez Tester Ollama pour vérifier la connexion actuelle."
        : "Configuration IA sauvegardée. Test Ollama non lancé.";
    case "ok":
      return "Connexion Ollama locale OK.";
    case "model-missing":
      return settings.model
        ? `Ollama local répond, modèle absent : ${settings.model}.`
        : "Ollama local répond, aucun modèle configuré.";
    case "timeout":
      return "Timeout de connexion IA locale.";
    case "error":
      return settings.lastError ?? "Configuration IA sauvegardée. Test Ollama non lancé.";
  }
}

function currentConnectionStatus(settings: AiSettings): AiConnectionStatus {
  if (!settings.enabled) {
    return "disabled";
  }

  if (
    settings.lastStatus === "error" ||
    settings.lastStatus === "timeout" ||
    settings.lastStatus === "model-missing"
  ) {
    return settings.lastStatus;
  }

  return "not-tested";
}

function sanitizeModelName(value: string): string {
  return value
    .replace(/[\u0000-\u001F]/g, "")
    .trim()
    .slice(0, MAX_AI_MODEL_LENGTH);
}

function normalizeTimeout(value: unknown): number {
  const numericValue = typeof value === "number" ? value : DEFAULT_AI_TIMEOUT_MS;
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_AI_TIMEOUT_MS;
  }

  return Math.max(MIN_AI_TIMEOUT_MS, Math.min(MAX_AI_TIMEOUT_MS, Math.floor(numericValue)));
}

function normalizeKeepAlive(value: unknown): string {
  const rawValue = typeof value === "string" ? value.trim().toLowerCase() : DEFAULT_AI_KEEP_ALIVE;
  if (/^[1-9]\d{0,3}[smh]$/.test(rawValue)) {
    return rawValue.slice(0, MAX_AI_KEEP_ALIVE_LENGTH);
  }

  return DEFAULT_AI_KEEP_ALIVE;
}

function readConnectionStatus(value: unknown): AiConnectionStatus | null {
  return value === "disabled" ||
    value === "not-tested" ||
    value === "ok" ||
    value === "model-missing" ||
    value === "error" ||
    value === "timeout"
    ? value
    : null;
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 240) : null;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as NodeJS.ErrnoException).code === "ENOENT" ||
        (error as NodeJS.ErrnoException).code === "ENOTDIR")
  );
}
