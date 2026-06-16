import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type AiProviderName = "ollama";
export type AiConnectionStatus = "disabled" | "ok" | "model-missing" | "error" | "timeout";

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
  | "UNKNOWN_ERROR";

export interface AiSettingsError {
  code: AiSettingsErrorCode;
  message: string;
}

export type AiSettingsResult<T> = { ok: true; value: T } | { ok: false; error: AiSettingsError };

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderName;
  baseUrl: string;
  model: string;
  timeoutMs: number;
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
const MIN_AI_TIMEOUT_MS = 1_000;
const MAX_AI_TIMEOUT_MS = 120_000;
const MAX_AI_MODEL_LENGTH = 120;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function getAiSettingsPath(userDataPath: string): string {
  return path.join(userDataPath, "config", "ai-settings.json");
}

export function createDefaultAiSettings(): AiSettings {
  return {
    enabled: false,
    provider: "ollama",
    baseUrl: DEFAULT_AI_BASE_URL,
    model: "",
    timeoutMs: DEFAULT_AI_TIMEOUT_MS,
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

  return {
    ok: true,
    value: {
      enabled: typeof input.enabled === "boolean" ? input.enabled : false,
      provider: "ollama",
      baseUrl: baseUrl.value,
      model: sanitizeModelName(readOptionalString(input.model)),
      timeoutMs: normalizeTimeout(input.timeoutMs),
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
    case "UNKNOWN_ERROR":
      return "Erreur IA locale inconnue.";
  }
}

function createAiStatus(settingsPath: string, settings: AiSettings): AiStatus {
  const status: AiConnectionStatus = settings.enabled
    ? settings.lastStatus ?? "error"
    : "disabled";
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

function readConnectionStatus(value: unknown): AiConnectionStatus | null {
  return value === "disabled" ||
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
