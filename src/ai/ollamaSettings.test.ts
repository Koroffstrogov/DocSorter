import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getAiSettingsPath,
  loadAiSettings,
  normalizeLocalOllamaUrl,
  saveAiSettings
} from "./ollamaSettings";

const temporaryRoots: string[] = [];

describe("Ollama AI settings", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map((root) => rm(root, { recursive: true, force: true }))
    );
    temporaryRoots.length = 0;
  });

  it("returns disabled defaults when config is absent", async () => {
    const workspace = await createWorkspace();

    const settings = await loadAiSettings(workspace.userData);

    expect(settings).toEqual({
      ok: true,
      value: {
        enabled: false,
        provider: "ollama",
        baseUrl: "http://localhost:11434/",
        profileId: "gemma3-4b",
        model: "gemma3:4b",
        think: false,
        timeoutMs: 30_000,
        lastTestAt: null,
        lastStatus: "disabled",
        lastError: null
      }
    });
  });

  it("returns a clean error for invalid JSON", async () => {
    const workspace = await createWorkspace();
    await mkdir(path.dirname(getAiSettingsPath(workspace.userData)), { recursive: true });
    await writeFile(getAiSettingsPath(workspace.userData), "{invalid-json", "utf8");

    const settings = await loadAiSettings(workspace.userData);

    expect(settings.ok).toBe(false);
    expect(!settings.ok && settings.error.code).toBe("AI_CONFIG_READ_FAILED");
  });

  it("saves valid config and strips document-like extra fields", async () => {
    const workspace = await createWorkspace();

    const result = await saveAiSettings(workspace.userData, {
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      profileId: "gemma4-12b-thinking",
      model: "gemma4:12b",
      think: true,
      timeoutMs: 30_000,
      lastTestAt: "2026-06-16T10:00:00.000Z",
      lastStatus: "ok",
      lastError: null,
      extractedTextExcerpt: "document text must not be stored",
      documentPath: "C:\\source\\secret.pdf",
      prompt: "prompt must not be stored"
    } as unknown as Parameters<typeof saveAiSettings>[1]);

    expect(result.ok).toBe(true);
    const saved = JSON.parse(await readFile(getAiSettingsPath(workspace.userData), "utf8"));
    expect(saved).toEqual({
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      profileId: "gemma4-12b-thinking",
      model: "gemma4:12b",
      think: true,
      timeoutMs: 30_000,
      lastTestAt: "2026-06-16T10:00:00.000Z",
      lastStatus: "ok",
      lastError: null
    });
  });

  it("accepts only local Ollama URLs", () => {
    expect(normalizeLocalOllamaUrl("http://localhost:11434/")).toEqual({
      ok: true,
      value: "http://localhost:11434/"
    });
    expect(normalizeLocalOllamaUrl("http://127.0.0.1:11434")).toEqual({
      ok: true,
      value: "http://127.0.0.1:11434/"
    });
    expect(normalizeLocalOllamaUrl("http://[::1]:11434/")).toEqual({
      ok: true,
      value: "http://[::1]:11434/"
    });
  });

  it("rejects external, LAN and suspicious URLs", () => {
    expect(normalizeLocalOllamaUrl("https://example.com")).toMatchObject({
      ok: false,
      error: { code: "AI_URL_NOT_LOCAL" }
    });
    expect(normalizeLocalOllamaUrl("http://192.168.1.22:11434")).toMatchObject({
      ok: false,
      error: { code: "AI_URL_NOT_LOCAL" }
    });
    expect(normalizeLocalOllamaUrl("http://localhost:11434/api/generate")).toMatchObject({
      ok: false,
      error: { code: "AI_CONFIG_INVALID" }
    });
  });
});

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-ai-settings-"));
  temporaryRoots.push(root);

  return {
    root,
    userData: path.join(root, "userData")
  };
}
