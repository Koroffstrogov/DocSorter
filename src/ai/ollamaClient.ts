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

export interface OllamaGeneration {
  responseText: string;
  model: string;
  generatedAt: string;
}

export interface OllamaHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type OllamaHttpClient = (
  url: string,
  options: {
    method: "GET" | "POST";
    signal: AbortSignal;
    headers?: Record<string, string>;
    body?: string;
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

interface OllamaGenerateResponse {
  response: string;
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

export async function generateOllamaCompletion(
  settings: AiSettings,
  prompt: string,
  options: TestOllamaConnectionOptions = {}
): Promise<AiSettingsResult<OllamaGeneration>> {
  if (!settings.enabled) {
    return aiFailure("AI_PROVIDER_DISABLED", "IA locale désactivée.");
  }

  const model = settings.model.trim();
  if (!model) {
    return aiFailure("AI_CONFIG_INVALID", "Modèle Ollama non renseigné.");
  }

  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const result = await fetchOllamaJson<OllamaGenerateResponse>(
    settings,
    "api/generate",
    options.fetchClient ?? defaultFetchClient,
    {
      method: "POST",
      body: {
        model,
        prompt,
        stream: false,
        format: "json"
      }
    }
  );

  if (!result.ok) {
    return result;
  }

  if (typeof result.value.response !== "string" || !result.value.response.trim()) {
    return aiFailure("AI_CONNECTION_FAILED", "Réponse Ollama locale inexploitable.");
  }

  return {
    ok: true,
    value: {
      responseText: result.value.response,
      model,
      generatedAt
    }
  };
}

async function fetchOllamaJson<TValue>(
  settings: AiSettings,
  endpoint: string,
  fetchClient: OllamaHttpClient,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
  } = {}
): Promise<AiSettingsResult<TValue>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetchClient(new URL(endpoint, settings.baseUrl).href, {
      method: options.method ?? "GET",
      signal: controller.signal,
      ...(options.body
        ? {
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify(options.body)
          }
        : {})
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
  options: {
    method: "GET" | "POST";
    signal: AbortSignal;
    headers?: Record<string, string>;
    body?: string;
  }
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
