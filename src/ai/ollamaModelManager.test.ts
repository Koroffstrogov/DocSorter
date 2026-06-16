import { describe, expect, it } from "vitest";

import { OllamaModelManager } from "./ollamaModelManager";
import type { OllamaHttpClient } from "./ollamaClient";
import type { AiSettings } from "./ollamaSettings";

describe("OllamaModelManager", () => {
  it("loads the configured model once and then reuses it", async () => {
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "llama3.2" }] },
      { done: true }
    ]);
    const manager = new OllamaModelManager({
      fetchClient,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    const first = await manager.ensureModelReady(createSettings());
    const second = await manager.ensureModelReady(createSettings());

    expect(first.ok && first.value.status).toBe("ready");
    expect(second.ok && second.value.status).toBe("ready");
    expect(fetchClient.calls.map((call) => call.url)).toEqual([
      "http://localhost:11434/api/version",
      "http://localhost:11434/api/tags",
      "http://localhost:11434/api/chat"
    ]);
    expect(JSON.parse(fetchClient.calls[2].options.body ?? "{}")).toMatchObject({
      model: "llama3.2",
      messages: [],
      stream: false,
      keep_alive: "30m"
    });
  });

  it("shares a single preload request between concurrent calls", async () => {
    let releasePreload: (() => void) | null = null;
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "llama3.2" }] },
      () =>
        new Promise((resolve) => {
          releasePreload = () => resolve({ done: true });
        })
    ]);
    const manager = new OllamaModelManager({ fetchClient });

    const first = manager.ensureModelReady(createSettings());
    const second = manager.ensureModelReady(createSettings());

    expect(manager.getStatus(createSettings()).status).toBe("loading");
    await waitFor(() => Boolean(releasePreload));
    releasePreload?.();
    const results = await Promise.all([first, second]);

    expect(results.every((result) => result.ok && result.value.status === "ready")).toBe(true);
    expect(fetchClient.calls.filter((call) => call.url.endsWith("/api/chat"))).toHaveLength(1);
  });

  it("returns a clean error when Ollama is unavailable", async () => {
    const manager = new OllamaModelManager({
      fetchClient: async () => {
        throw new Error("ECONNREFUSED");
      }
    });

    const result = await manager.ensureModelReady(createSettings());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_CONNECTION_FAILED");
    expect(manager.getStatus(createSettings()).status).toBe("unavailable");
  });

  it("returns a clean error when the configured model is missing", async () => {
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "mistral" }] }
    ]);
    const manager = new OllamaModelManager({ fetchClient });

    const result = await manager.ensureModelReady(createSettings());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_MODEL_NOT_FOUND");
    expect(manager.getStatus(createSettings()).status).toBe("model_missing");
  });

  it("unloads the model and can reload it later", async () => {
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "llama3.2" }] },
      { done: true },
      { done: true },
      { version: "0.5.1" },
      { models: [{ name: "llama3.2" }] },
      { done: true }
    ]);
    const manager = new OllamaModelManager({
      fetchClient,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    await manager.ensureModelReady(createSettings());
    const unload = await manager.unloadModel(createSettings(), { timeoutMs: 2000 });
    const reload = await manager.ensureModelReady(createSettings());

    expect(unload.ok && unload.value.status).toBe("idle");
    expect(reload.ok && reload.value.status).toBe("ready");
    const lifecycleBodies = fetchClient.calls
      .filter((call) => call.url.endsWith("/api/chat"))
      .map((call) => JSON.parse(call.options.body ?? "{}"));
    expect(lifecycleBodies.map((body) => body.keep_alive)).toEqual(["30m", 0, "30m"]);
  });
});

type MockResponse = unknown | (() => Promise<unknown>);

function createMockFetch(
  responses: MockResponse[]
): OllamaHttpClient & {
  calls: Array<{
    url: string;
    options: { method: "GET" | "POST"; body?: string; headers?: Record<string, string> };
  }>;
} {
  const calls: Array<{
    url: string;
    options: { method: "GET" | "POST"; body?: string; headers?: Record<string, string> };
  }> = [];
  const fetchClient: OllamaHttpClient = async (url, options) => {
    calls.push({
      url,
      options: {
        method: options.method,
        ...(options.body ? { body: options.body } : {}),
        ...(options.headers ? { headers: options.headers } : {})
      }
    });
    const next = responses.shift();
    const value = typeof next === "function" ? await next() : next;
    return {
      ok: true,
      status: 200,
      json: async () => value
    };
  };

  return Object.assign(fetchClient, { calls });
}

function createSettings(): AiSettings {
  return {
    enabled: true,
    provider: "ollama",
    baseUrl: "http://localhost:11434/",
    model: "llama3.2",
    timeoutMs: 30_000,
    lastTestAt: null,
    lastStatus: null,
    lastError: null
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) {
      return;
    }

    await Promise.resolve();
  }
}
