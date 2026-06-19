import {
  OLLAMA_MODEL_KEEP_ALIVE,
  preloadOllamaModel,
  testOllamaConnection,
  unloadOllamaModel,
  type OllamaHttpClient
} from "./ollamaClient";
import {
  aiFailure,
  loadAiSettings,
  type AiSettings,
  type AiSettingsError,
  type AiSettingsResult
} from "./ollamaSettings";

export type OllamaModelLifecycleStatus =
  | "unavailable"
  | "model_missing"
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface OllamaModelStatus {
  status: OllamaModelLifecycleStatus;
  model: string;
  message: string;
  loadedAt: string | null;
  keepAliveUntil: string | null;
  lastCheckedAt: string | null;
  error: AiSettingsError | null;
}

export interface OllamaModelManagerLike {
  getStatus: (settings?: AiSettings | null) => OllamaModelStatus;
  ensureModelReady: (settings: AiSettings) => Promise<AiSettingsResult<OllamaModelStatus>>;
  unloadModel: (
    settings: AiSettings,
    options?: { timeoutMs?: number }
  ) => Promise<AiSettingsResult<OllamaModelStatus>>;
}

export interface OllamaModelManagerOptions {
  fetchClient?: OllamaHttpClient;
  now?: () => Date;
}

const FALLBACK_KEEP_ALIVE_MS = 30 * 60 * 1000;

export class OllamaModelManager implements OllamaModelManagerLike {
  private state: OllamaModelStatus = createIdleModelStatus("");
  private readyKey: string | null = null;
  private loadingKey: string | null = null;
  private loadingPromise: Promise<AiSettingsResult<OllamaModelStatus>> | null = null;

  constructor(private readonly options: OllamaModelManagerOptions = {}) {}

  getStatus(settings?: AiSettings | null): OllamaModelStatus {
    if (!settings?.enabled) {
      return {
        ...createUnavailableStatus(settings?.model ?? "", "IA locale désactivée."),
        lastCheckedAt: this.state.lastCheckedAt
      };
    }

    const model = settings.model.trim();
    if (!model) {
      return createErrorStatus("", "Modèle Ollama non renseigné.", {
        code: "AI_CONFIG_INVALID",
        message: "Modèle Ollama non renseigné."
      });
    }

    const key = settingsKey(settings);
    if (
      (this.readyKey && this.readyKey !== key) ||
      (this.loadingKey && this.loadingKey !== key)
    ) {
      return createIdleModelStatus(model);
    }

    return {
      ...this.state,
      model
    };
  }

  async ensureModelReady(settings: AiSettings): Promise<AiSettingsResult<OllamaModelStatus>> {
    const settingsValidation = this.validateSettingsForLoading(settings);
    if (!settingsValidation.ok) {
      return settingsValidation;
    }

    const key = settingsKey(settings);
    if (this.isReadyForKey(key)) {
      return { ok: true, value: this.getStatus(settings) };
    }

    if (this.loadingPromise && this.loadingKey === key) {
      return this.loadingPromise;
    }

    const now = this.now();
    this.loadingKey = key;
    this.state = {
      status: "loading",
      model: settings.model.trim(),
      message: "Chargement du modèle IA...",
      loadedAt: null,
      keepAliveUntil: null,
      lastCheckedAt: now.toISOString(),
      error: null
    };
    this.loadingPromise = this.loadModel(settings, key);

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
      this.loadingKey = null;
    }
  }

  async unloadModel(
    settings: AiSettings,
    options: { timeoutMs?: number } = {}
  ): Promise<AiSettingsResult<OllamaModelStatus>> {
    const model = settings.model.trim();
    if (!model) {
      this.readyKey = null;
      this.state = createIdleModelStatus("");
      return { ok: true, value: this.state };
    }

    const result = await unloadOllamaModel(settings, {
      fetchClient: this.options.fetchClient,
      now: this.options.now,
      timeoutMs: options.timeoutMs
    });

    if (!result.ok) {
      this.readyKey = null;
      this.state = createErrorStatus(model, "Erreur IA locale lors de la libération du modèle.", result.error);
      return result;
    }

    this.readyKey = null;
    this.state = {
      status: "idle",
      model,
      message: "Modèle IA libéré.",
      loadedAt: null,
      keepAliveUntil: null,
      lastCheckedAt: result.value.completedAt,
      error: null
    };

    return { ok: true, value: this.state };
  }

  private async loadModel(
    settings: AiSettings,
    key: string
  ): Promise<AiSettingsResult<OllamaModelStatus>> {
    const connection = await testOllamaConnection(settings, {
      fetchClient: this.options.fetchClient,
      now: this.options.now
    });
    if (!connection.ok) {
      this.readyKey = null;
      this.state = statusFromConnectionError(settings.model, connection.error);
      return connection;
    }

    if (connection.value.status === "model-missing") {
      const error = {
        code: "AI_MODEL_NOT_FOUND" as const,
        message: connection.value.message
      };
      this.readyKey = null;
      this.state = {
        status: "model_missing",
        model: settings.model.trim(),
        message: connection.value.message,
        loadedAt: null,
        keepAliveUntil: null,
        lastCheckedAt: connection.value.testedAt,
        error
      };
      return aiFailure("AI_MODEL_NOT_FOUND", connection.value.message);
    }

    const preload = await preloadOllamaModel(settings, {
      fetchClient: this.options.fetchClient,
      now: this.options.now
    });
    if (!preload.ok) {
      this.readyKey = null;
      this.state = statusFromConnectionError(settings.model, preload.error);
      return preload;
    }

    const loadedAt = preload.value.completedAt;
    this.readyKey = key;
    this.state = {
      status: "ready",
      model: preload.value.model,
      message: "IA locale prête.",
      loadedAt,
      keepAliveUntil: new Date(
        new Date(loadedAt).getTime() + keepAliveToMilliseconds(settings.keepAlive)
      ).toISOString(),
      lastCheckedAt: loadedAt,
      error: null
    };

    return { ok: true, value: this.state };
  }

  private validateSettingsForLoading(settings: AiSettings): AiSettingsResult<void> {
    if (!settings.enabled) {
      this.readyKey = null;
      this.state = createUnavailableStatus(settings.model, "IA locale désactivée.");
      return aiFailure("AI_PROVIDER_DISABLED", "IA locale désactivée.");
    }

    if (!settings.model.trim()) {
      const error = {
        code: "AI_CONFIG_INVALID" as const,
        message: "Modèle Ollama non renseigné."
      };
      this.readyKey = null;
      this.state = createErrorStatus("", error.message, error);
      return aiFailure(error.code, error.message);
    }

    return { ok: true, value: undefined };
  }

  private isReadyForKey(key: string): boolean {
    if (this.state.status !== "ready" || this.readyKey !== key || !this.state.keepAliveUntil) {
      return false;
    }

    return new Date(this.state.keepAliveUntil).getTime() > this.now().getTime();
  }

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }
}

export const defaultOllamaModelManager = new OllamaModelManager();

export async function getConfiguredOllamaModelStatus(
  userDataPath: string,
  manager: OllamaModelManagerLike = defaultOllamaModelManager
): Promise<AiSettingsResult<OllamaModelStatus>> {
  const settings = await loadAiSettings(userDataPath);
  if (!settings.ok) {
    return settings;
  }

  return {
    ok: true,
    value: manager.getStatus(settings.value)
  };
}

export async function preloadConfiguredOllamaModel(
  userDataPath: string,
  manager: OllamaModelManagerLike = defaultOllamaModelManager
): Promise<AiSettingsResult<OllamaModelStatus>> {
  const settings = await loadAiSettings(userDataPath);
  if (!settings.ok) {
    return settings;
  }

  return manager.ensureModelReady(settings.value);
}

export async function unloadConfiguredOllamaModel(
  userDataPath: string,
  options: {
    manager?: OllamaModelManagerLike;
    timeoutMs?: number;
  } = {}
): Promise<AiSettingsResult<OllamaModelStatus>> {
  const settings = await loadAiSettings(userDataPath);
  if (!settings.ok) {
    return settings;
  }

  return (options.manager ?? defaultOllamaModelManager).unloadModel(settings.value, {
    timeoutMs: options.timeoutMs
  });
}

function settingsKey(settings: AiSettings): string {
  return `${settings.baseUrl}|${settings.model.trim()}|${settings.keepAlive}`;
}

function keepAliveToMilliseconds(value: string): number {
  const match = value.match(/^(\d+)([smh])$/);
  if (!match) {
    return FALLBACK_KEEP_ALIVE_MS;
  }

  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) {
    return FALLBACK_KEEP_ALIVE_MS;
  }

  switch (match[2]) {
    case "s":
      return count * 1000;
    case "m":
      return count * 60 * 1000;
    case "h":
      return count * 60 * 60 * 1000;
    default:
      return FALLBACK_KEEP_ALIVE_MS;
  }
}

function createIdleModelStatus(model: string): OllamaModelStatus {
  return {
    status: "idle",
    model,
    message: "Modèle IA non chargé.",
    loadedAt: null,
    keepAliveUntil: null,
    lastCheckedAt: null,
    error: null
  };
}

function createUnavailableStatus(model: string, message: string): OllamaModelStatus {
  return {
    status: "unavailable",
    model: model.trim(),
    message,
    loadedAt: null,
    keepAliveUntil: null,
    lastCheckedAt: null,
    error: {
      code: "AI_PROVIDER_DISABLED",
      message
    }
  };
}

function createErrorStatus(
  model: string,
  message: string,
  error: AiSettingsError
): OllamaModelStatus {
  return {
    status: "error",
    model: model.trim(),
    message,
    loadedAt: null,
    keepAliveUntil: null,
    lastCheckedAt: null,
    error
  };
}

function statusFromConnectionError(model: string, error: AiSettingsError): OllamaModelStatus {
  return {
    status: error.code === "AI_CONNECTION_FAILED" || error.code === "AI_CONNECTION_TIMEOUT"
      ? "unavailable"
      : "error",
    model: model.trim(),
    message: error.code === "AI_CONNECTION_TIMEOUT" ? "Ollama indisponible." : error.message,
    loadedAt: null,
    keepAliveUntil: null,
    lastCheckedAt: null,
    error
  };
}
