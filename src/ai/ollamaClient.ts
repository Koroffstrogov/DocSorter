import {
  aiFailure,
  type AiConnectionStatus,
  type AiSettings,
  type AiSettingsResult
} from "./ollamaSettings";

export interface OllamaConnectionTest {
  status: AiConnectionStatus;
  version: string | null;
  model: string;
  availableModels: string[];
  testedAt: string;
  message: string;
}

export interface OllamaHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type OllamaHttpClient = (
  url: string,
  options: {
    method: "GET";
    signal: AbortSignal;
  }
) => Promise<OllamaHttpResponse>;

export interface TestOllamaConnectionOptions {
  fetchClient?: OllamaHttpClient;
  now?: () => Date;
}

interface OllamaVersionResponse {
  version: string;
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

export async function testOllamaConnection(
  settings: AiSettings,
  options: TestOllamaConnectionOptions = {}
): Promise<AiSettingsResult<OllamaConnectionTest>> {
  if (!settings.enabled) {
    return aiFailure("AI_PROVIDER_DISABLED", "IA locale désactivée.");
  }

  const testedAt = (options.now ?? (() => new Date()))().toISOString();
  const fetchClient = options.fetchClient ?? defaultFetchClient;
  const versionResult = await fetchOllamaJson<OllamaVersionResponse>(
    settings,
    "api/version",
    fetchClient
  );
  if (!versionResult.ok) {
    return versionResult;
  }

  const version = typeof versionResult.value.version === "string"
    ? versionResult.value.version.slice(0, 80)
    : "";
  if (!version) {
    return aiFailure("AI_VERSION_FAILED", "Version Ollama locale indisponible.");
  }

  const tagsResult = await fetchOllamaJson<OllamaTagsResponse>(
    settings,
    "api/tags",
    fetchClient
  );
  if (!tagsResult.ok) {
    return tagsResult;
  }

  const availableModels = normalizeModels(tagsResult.value);
  const requestedModel = settings.model.trim();
  const modelFound = !requestedModel || availableModels.includes(requestedModel);
  const status: AiConnectionStatus = modelFound ? "ok" : "model-missing";

  return {
    ok: true,
    value: {
      status,
      version,
      model: requestedModel,
      availableModels,
      testedAt,
      message: status === "ok"
        ? "Connexion Ollama locale OK."
        : `Ollama local répond, modèle absent : ${requestedModel}.`
    }
  };
}

async function fetchOllamaJson<TValue>(
  settings: AiSettings,
  endpoint: string,
  fetchClient: OllamaHttpClient
): Promise<AiSettingsResult<TValue>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetchClient(new URL(endpoint, settings.baseUrl).href, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return aiFailure("AI_CONNECTION_FAILED", `Ollama local a répondu HTTP ${response.status}.`);
    }

    return {
      ok: true,
      value: (await response.json()) as TValue
    };
  } catch (error) {
    if (isAbortError(error)) {
      return aiFailure("AI_CONNECTION_TIMEOUT", "Timeout de connexion IA locale.");
    }

    return aiFailure("AI_CONNECTION_FAILED", "Connexion Ollama locale impossible.");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeModels(value: OllamaTagsResponse): string[] {
  if (!value || typeof value !== "object" || !Array.isArray(value.models)) {
    return [];
  }

  return value.models
    .map((model) => model.name)
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
}

function defaultFetchClient(
  url: string,
  options: { method: "GET"; signal: AbortSignal }
): Promise<OllamaHttpResponse> {
  return fetch(url, options);
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("name" in error && (error as { name?: unknown }).name === "AbortError")
  );
}
