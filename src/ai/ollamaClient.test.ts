import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateOllamaCompletion,
  testOllamaConnection,
  type OllamaHttpClient
} from "./ollamaClient";
import type { AiSettings } from "./ollamaSettings";

describe("testOllamaConnection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tests /api/version and /api/tags successfully", async () => {
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "llama3.2" }, { name: "mistral" }] }
    ]);

    const result = await testOllamaConnection(createSettings(), {
      fetchClient,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      status: "ok",
      version: "0.5.1",
      model: "llama3.2",
      availableModels: ["llama3.2", "mistral"],
      testedAt: "2026-06-16T10:00:00.000Z"
    });
    expect(fetchClient.calls.map((call) => call.url)).toEqual([
      "http://localhost:11434/api/version",
      "http://localhost:11434/api/tags"
    ]);
  });

  it("detects a missing configured model", async () => {
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "mistral" }] }
    ]);

    const result = await testOllamaConnection(createSettings(), { fetchClient });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe("model-missing");
    expect(result.ok && result.value.message).toContain("llama3.2");
  });

  it("returns a disabled error without HTTP call", async () => {
    const fetchClient = createMockFetch([]);

    const result = await testOllamaConnection(
      {
        ...createSettings(),
        enabled: false
      },
      { fetchClient }
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_PROVIDER_DISABLED");
    expect(fetchClient.calls).toEqual([]);
  });

  it("maps network errors to a sober connection error", async () => {
    const result = await testOllamaConnection(createSettings(), {
      fetchClient: async () => {
        throw new Error("ECONNREFUSED detailed stack");
      }
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      code: "AI_CONNECTION_FAILED",
      message: "Connexion Ollama locale impossible."
    });
  });

  it("maps timeout through AbortController", async () => {
    vi.useFakeTimers();
    const pendingFetch: OllamaHttpClient = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const promise = testOllamaConnection(
      {
        ...createSettings(),
        timeoutMs: 10
      },
      { fetchClient: pendingFetch }
    );
    await vi.advanceTimersByTimeAsync(11);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_CONNECTION_TIMEOUT");
  });
});

function createMockFetch(
  responses: unknown[]
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
    const value = responses.shift();
    return {
      ok: true,
      status: 200,
      json: async () => value
    };
  };

  return Object.assign(fetchClient, { calls });
}

describe("generateOllamaCompletion", () => {
  it("posts a non-streaming JSON generation request to /api/generate", async () => {
    const fetchClient = createMockFetch([
      {
        response:
          '{"confidence":70,"keywords":[],"reasons":["test"],"warnings":[],"source":"ollama"}'
      }
    ]);

    const result = await generateOllamaCompletion(createSettings(), "prompt borné", {
      fetchClient,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      responseText:
        '{"confidence":70,"keywords":[],"reasons":["test"],"warnings":[],"source":"ollama"}',
      model: "llama3.2",
      generatedAt: "2026-06-16T10:00:00.000Z"
    });
    expect(fetchClient.calls[0].url).toBe("http://localhost:11434/api/generate");
    expect(fetchClient.calls[0].options.method).toBe("POST");
    expect(JSON.parse(fetchClient.calls[0].options.body ?? "{}")).toEqual({
      model: "llama3.2",
      prompt: "prompt borné",
      stream: false,
      format: "json"
    });
  });

  it("refuses generation without configured model", async () => {
    const fetchClient = createMockFetch([]);

    const result = await generateOllamaCompletion(
      {
        ...createSettings(),
        model: ""
      },
      "prompt",
      { fetchClient }
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_CONFIG_INVALID");
    expect(fetchClient.calls).toEqual([]);
  });
});

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
