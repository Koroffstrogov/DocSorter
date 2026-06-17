import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getAiSettingsPath, saveAiSettings } from "./ollamaSettings";
import { prepareOllamaProvider, testAiConnection } from "./ollamaProvider";
import type { OllamaHttpClient } from "./ollamaClient";

const temporaryRoots: string[] = [];

describe("Ollama provider preparation", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map((root) => rm(root, { recursive: true, force: true }))
    );
    temporaryRoots.length = 0;
  });

  it("tests a configured local Ollama and writes only connection metadata", async () => {
    const workspace = await createWorkspace();
    const saved = await saveAiSettings(workspace.userData, {
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      model: "llama3.2",
      timeoutMs: 30_000
    });
    expect(saved.ok).toBe(true);
    const fetchClient = createMockFetch([
      { version: "0.5.1" },
      { models: [{ name: "llama3.2" }] }
    ]);

    const result = await testAiConnection(workspace.userData, {
      fetchClient,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe("ok");
    const rawSettings = await readFile(getAiSettingsPath(workspace.userData), "utf8");
    const persisted = JSON.parse(rawSettings);
    expect(persisted).toEqual({
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      model: "llama3.2",
      timeoutMs: 30_000,
      lastTestAt: "2026-06-16T10:00:00.000Z",
      lastStatus: "ok",
      lastError: null
    });
    expect(rawSettings).not.toContain("documentPath");
    expect(rawSettings).not.toContain("prompt");
    expect(rawSettings).not.toContain("extractedTextExcerpt");
  });

  it("prepares metadata and reuses the IA-0 output validator", () => {
    const provider = prepareOllamaProvider({
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      model: "llama3.2",
      timeoutMs: 30_000,
      lastTestAt: null,
      lastStatus: null,
      lastError: null
    });

    expect(provider).toMatchObject({
      provider: "ollama",
      enabled: true,
      baseUrl: "http://localhost:11434/",
      model: "llama3.2"
    });
    expect(
      provider.validateOutput({
        source: "simulated-ai",
        target: "captur",
        documentType: "facture-entretien",
        confidence: 70,
        reasons: [],
        warnings: []
      }).status
    ).toBe("valid");
  });

  it("detects a missing configured model without failing the connection test", async () => {
    const workspace = await createWorkspace();
    await saveAiSettings(workspace.userData, {
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      model: "llama3.2",
      timeoutMs: 30_000
    });
    const fetchClient = createMockFetch([{ version: "0.5.1" }, { models: [{ name: "mistral" }] }]);

    const result = await testAiConnection(workspace.userData, {
      fetchClient,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.status).toBe("model-missing");
    const persisted = JSON.parse(await readFile(getAiSettingsPath(workspace.userData), "utf8"));
    expect(persisted.lastStatus).toBe("model-missing");
    expect(persisted.lastError).toContain("llama3.2");
  });

  it("returns disabled without HTTP call when IA locale is disabled", async () => {
    const workspace = await createWorkspace();
    await saveAiSettings(workspace.userData, {
      enabled: false,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      model: "llama3.2",
      timeoutMs: 30_000
    });
    const fetchClient = createMockFetch([]);

    const result = await testAiConnection(workspace.userData, { fetchClient });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_PROVIDER_DISABLED");
    expect(fetchClient.calls).toEqual([]);
  });

  it("persists a sober error status after a network failure", async () => {
    const workspace = await createWorkspace();
    await saveAiSettings(workspace.userData, {
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      model: "llama3.2",
      timeoutMs: 30_000
    });

    const result = await testAiConnection(workspace.userData, {
      fetchClient: async () => {
        throw new Error("ECONNREFUSED with details");
      },
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      code: "AI_CONNECTION_FAILED",
      message: "Connexion Ollama locale impossible."
    });
    const persisted = JSON.parse(await readFile(getAiSettingsPath(workspace.userData), "utf8"));
    expect(persisted.lastStatus).toBe("error");
    expect(persisted.lastError).toBe("Connexion Ollama locale impossible.");
  });
});

function createMockFetch(
  responses: unknown[]
): OllamaHttpClient & { calls: Array<{ url: string }> } {
  const calls: Array<{ url: string }> = [];
  const fetchClient: OllamaHttpClient = async (url) => {
    calls.push({ url });
    return {
      ok: true,
      status: 200,
      json: async () => responses.shift()
    };
  };

  return Object.assign(fetchClient, { calls });
}

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-ai-provider-"));
  temporaryRoots.push(root);

  return {
    root,
    userData: path.join(root, "userData")
  };
}
