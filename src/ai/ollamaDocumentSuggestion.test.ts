import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getAiSettingsPath, saveAiSettings } from "./ollamaSettings";
import {
  runOllamaSuggestionForDocument,
  type AiDocumentTextContext
} from "./ollamaDocumentSuggestion";
import type { OllamaHttpClient } from "./ollamaClient";
import type { OllamaModelManagerLike, OllamaModelStatus } from "./ollamaModelManager";

const temporaryRoots: string[] = [];

describe("runOllamaSuggestionForDocument", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map((root) => rm(root, { recursive: true, force: true }))
    );
    temporaryRoots.length = 0;
  });

  it("refuses when local AI is disabled", async () => {
    const workspace = await createWorkspace();
    const fetchClient = createMockFetch([]);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_PROVIDER_DISABLED");
    expect(fetchClient.calls).toEqual([]);
  });

  it("keeps external URLs refused through settings validation", async () => {
    const workspace = await createWorkspace();
    await mkdir(path.dirname(getAiSettingsPath(workspace.userData)), { recursive: true });
    await writeFile(
      getAiSettingsPath(workspace.userData),
      JSON.stringify({
        enabled: true,
        provider: "ollama",
        baseUrl: "http://192.168.1.22:11434/",
        model: "llama3.2",
        timeoutMs: 30_000
      }),
      "utf8"
    );

    const result = await runOllamaSuggestionForDocument(createOptions(workspace));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_URL_NOT_LOCAL");
  });

  it("refuses a document outside the last scanned queue", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);
    const fetchClient = createMockFetch([]);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      documentPath: path.join(workspace.root, "other.pdf"),
      fetchClient
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_DOCUMENT_NOT_IN_QUEUE");
    expect(fetchClient.calls).toEqual([]);
  });

  it("sends bounded text and no full local path in the prompt", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);
    const fetchClient = createSuccessfulFetch();

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: `${"x".repeat(7_000)} C:\\Users\\Seb\\Documents\\secret.pdf`
      }),
      fetchClient
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.input.extractedTextExcerpt).toHaveLength(6_000);
    expect(result.ok && result.value.modelStatus.status).toBe("ready");
    const generateCall = fetchClient.calls.find((call) => call.url.endsWith("/api/generate"));
    const body = JSON.parse(generateCall?.options.body ?? "{}") as { prompt?: string };
    expect(body.prompt).not.toContain(workspace.documentPath);
    expect(body.prompt).not.toContain("C:\\Users\\Seb");
    expect(body.prompt).not.toContain("x".repeat(6_001));
  });

  it("accepts a valid Ollama JSON suggestion", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch({
        response: JSON.stringify({
          dateToken: "2026-06-16",
          target: "Renault Captur",
          documentType: "facture",
          issuer: "Renault",
          detail: "vidange",
          targetFolder: "Vehicules/Renault-Captur/Entretien",
          confidence: 82,
          reasons: ["Facture détectée."],
          warnings: [],
          source: "ollama"
        })
      }),
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2026-06-16",
      target: "renault-captur",
      documentType: "facture",
      issuer: "renault",
      detail: "vidange",
      targetFolder: "Vehicules/Renault-Captur/Entretien",
      source: "ollama"
    });
    expect(result.ok && result.value.suggestedAt).toBe("2026-06-16T10:00:00.000Z");
    expect(result.ok && result.value.modelStatus).toMatchObject({
      status: "ready",
      model: "llama3.2",
      keepAliveUntil: "2026-06-16T10:30:00.000Z"
    });
  });

  it("sanitizes inverted fiscal AI output without applying target equal to document type", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);
    const documentPath = path.join(workspace.sourcePath, "T05-avis_imposition_foyer_2025.pdf");
    await writeFile(documentPath, "contenu original", "utf8");

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: "Avis d'imposition 2025"
      }),
      documentPath,
      queuedDocuments: [{ filePath: documentPath, name: "T05-avis_imposition_foyer_2025.pdf" }],
      queuedDocumentPaths: [documentPath],
      legacyDraft: {
        documentDate: "2025",
        subject: "T05-avis-imposition-foyer",
        documentType: "avis-imposition",
        keywords: ""
      },
      fetchClient: createSuccessfulFetch({
        response: JSON.stringify({
          dateToken: "2025",
          target: "avis-imposition",
          documentType: "avis-imposition",
          detail: "foyer",
          confidence: 82,
          reasons: ["Avis fiscal détecté."],
          warnings: [],
          source: "ollama"
        })
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value.input.currentSuggestionV2?.target).toBe("foyer");
    expect(result.value.input.currentSuggestionV2?.documentType).toBe("avis-imposition");
    expect(result.value.suggestion.target).toBe("foyer");
    expect(result.value.suggestion.documentType).toBe("avis-imposition");
    expect(result.value.suggestion.detail).toBeUndefined();
    expect(result.value.suggestion.warnings.join(" ")).toContain("Cible IA ignorée");
  });

  it("refuses invalid JSON without crashing", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch({ response: "not-json" })
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      code: "AI_OUTPUT_INVALID",
      message: "Suggestion IA invalide."
    });
  });

  it("refuses dangerous target folders from Ollama output", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch({
        response: JSON.stringify({
          targetFolder: "../Secret",
          confidence: 70,
          reasons: ["test"],
          warnings: [],
          source: "ollama"
        })
      })
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_OUTPUT_INVALID");
  });

  it("maps Ollama timeout to a sober error", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData, { timeoutMs: 1000 });
    const pendingFetch: OllamaHttpClient = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const promise = runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: pendingFetch
    });
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_CONNECTION_TIMEOUT");
  }, 3_000);

  it("does not modify the source document", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch()
    });

    expect(result.ok).toBe(true);
    expect(await readFile(workspace.documentPath, "utf8")).toBe("contenu original");
  });
});

async function enableAi(userDataPath: string, overrides: { timeoutMs?: number } = {}) {
  const result = await saveAiSettings(userDataPath, {
    enabled: true,
    provider: "ollama",
    baseUrl: "http://localhost:11434/",
    model: "llama3.2",
    timeoutMs: overrides.timeoutMs ?? 30_000
  });
  expect(result.ok).toBe(true);
}

function createOptions(
  workspace: Awaited<ReturnType<typeof createWorkspace>>,
  textContext: Partial<AiDocumentTextContext> = {}
) {
  return {
    documentPath: workspace.documentPath,
    textContext: {
      source: "pdf-native" as const,
      excerpt: "Facture Renault Captur du 05/03/2024",
      ...textContext
    },
    legacyDraft: {
      documentDate: "",
      subject: "",
      documentType: "",
      keywords: ""
    },
    queuedDocuments: [{ filePath: workspace.documentPath, name: "document.pdf" }],
    queuedDocumentPaths: [workspace.documentPath],
    userDataPath: workspace.userData,
    targetRootPath: workspace.sourcePath,
    knownRelativeFolders: ["Vehicules/Renault-Captur/Entretien"],
    competingRelativePaths: [],
    modelManager: createReadyModelManager(),
    now: () => new Date("2026-06-16T10:00:00.000Z")
  };
}

function createSuccessfulFetch(
  options: {
    response?: string;
  } = {}
) {
  return createMockFetch([
    {
      response:
        options.response ??
        JSON.stringify({
          dateToken: "2026",
          target: "captur",
          documentType: "facture-entretien",
          issuer: "renault",
          detail: "vidange",
          confidence: 70,
          reasons: ["Analyse locale Ollama."],
          warnings: [],
          source: "ollama"
        })
    }
  ]);
}

function createReadyModelManager(): OllamaModelManagerLike {
  return {
    getStatus: () => createModelStatus(),
    ensureModelReady: async () => ({ ok: true, value: createModelStatus() }),
    unloadModel: async () => ({ ok: true, value: { ...createModelStatus(), status: "idle" } })
  };
}

function createModelStatus(): OllamaModelStatus {
  return {
    status: "ready",
    model: "llama3.2",
    message: "IA locale prête.",
    loadedAt: "2026-06-16T10:00:00.000Z",
    keepAliveUntil: "2026-06-16T10:30:00.000Z",
    lastCheckedAt: "2026-06-16T10:00:00.000Z",
    error: null
  };
}

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
    return {
      ok: true,
      status: 200,
      json: async () => responses.shift()
    };
  };

  return Object.assign(fetchClient, { calls });
}

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-ai-document-"));
  temporaryRoots.push(root);
  const sourcePath = path.join(root, "source");
  const documentPath = path.join(sourcePath, "document.pdf");
  const userData = path.join(root, "userData");
  await mkdir(sourcePath, { recursive: true });
  await writeFile(documentPath, "contenu original", "utf8");

  return {
    root,
    sourcePath,
    documentPath,
    userData
  };
}
