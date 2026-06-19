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
        response: createAiResponse({
          dateToken: "2026-06-16",
          subject: "Renault Captur",
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
      subject: "captur",
      target: "renault-captur",
      documentType: "facture",
      issuer: "renault",
      detail: "vidange",
      proposedName: "2026-06-16_captur_facture_renault_vidange.pdf",
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

  it("uses gemma3 profile with think false", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData, { profileId: "gemma3-4b" });
    const fetchClient = createSuccessfulFetch();

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient
    });

    expect(result.ok).toBe(true);
    const body = readGenerateBody(fetchClient);
    expect(body).toMatchObject({
      model: "gemma3:4b",
      think: false,
      stream: false
    });
  });

  it("uses gemma4 no-think profile with think false", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData, { profileId: "gemma4-12b-nothink" });
    const fetchClient = createSuccessfulFetch();

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient
    });

    expect(result.ok).toBe(true);
    const body = readGenerateBody(fetchClient);
    expect(body).toMatchObject({
      model: "gemma4:12b",
      think: false,
      stream: false
    });
  });

  it("uses gemma4 thinking profile with think true and preserves thinking diagnostic data", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData, { profileId: "gemma4-12b-thinking" });
    const fetchClient = createMockFetch([
      {
        response: createAiResponse({
          dateToken: "2026",
          target: "captur",
          documentType: "facture-entretien",
          confidence: 74
        }),
        thinking: "raisonnement conservé pour diagnostic"
      }
    ]);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient
    });

    expect(result.ok).toBe(true);
    const body = readGenerateBody(fetchClient);
    expect(body).toMatchObject({
      model: "gemma4:12b",
      think: true,
      stream: false
    });
    expect(result.ok && result.value.profile).toMatchObject({
      id: "gemma4-12b-thinking",
      model: "gemma4:12b",
      think: true
    });
    expect(result.ok && result.value.thinking).toBe("raisonnement conservé pour diagnostic");
    expect(result.ok && result.value.responseJson.fields.target.selected).toBe("captur");
  });

  it("converts monthly Ollama dates before proposed name generation", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2026-05",
          target: "captur",
          documentType: "facture-entretien",
          confidence: 72,
          reasons: ["Mois détecté."],
          warnings: [],
          source: "ollama"
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2026-05-01",
      target: "captur",
      documentType: "facture-entretien",
      proposedName: "2026-05-01_captur_facture-entretien.pdf",
      source: "ollama"
    });
  });

  it("uses the AI subject for proposed name generation when no target is provided", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2026",
          subject: "Paul",
          documentType: "carnet-vaccination",
          confidence: 76,
          reasons: ["Sujet détecté dans le document."],
          warnings: [],
          source: "ollama"
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2026",
      subject: "paul",
      documentType: "carnet-vaccination",
      proposedName: "2026_paul_carnet-vaccination.pdf",
      source: "ollama"
    });
  });

  it("cleans test artifacts, repeated terms and infers a known target folder", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);
    const documentPath = path.join(workspace.sourcePath, "T01-scan_renault_captur_facture.pdf");
    await writeFile(documentPath, "contenu original", "utf8");

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt:
          "Facture entretien Renault Captur Document de test DocSorter Date de facture 05/03/2024"
      }),
      documentPath,
      queuedDocuments: [{ filePath: documentPath, name: "T01-scan_renault_captur_facture.pdf" }],
      queuedDocumentPaths: [documentPath],
      knownRelativeFolders: ["Assurances", "Véhicules", "Scolarité"],
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2024-03-15",
          subject: "renault-captur-facture",
          target: "vehicules",
          documentType: "facture",
          issuer: "docsorter-local",
          confidence: 85,
          reasons: ["court terme"],
          warnings: ["signaux faibles"],
          source: "ollama"
        })
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value.suggestion).toMatchObject({
      dateToken: "2024-03-15",
      subject: "renault-captur",
      target: "vehicules",
      documentType: "facture",
      targetFolder: "Véhicules",
      proposedName: "2024-03-15_renault-captur_facture.pdf",
      source: "ollama"
    });
    expect(result.value.suggestion.issuer).toBeUndefined();
    expect(result.value.suggestion.warnings.join(" ")).toContain("docsorter");
    expect(result.value.suggestion.warnings.join(" ")).toContain("facture");
  });

  it("sanitizes AI output without using deterministic v2 fallback", async () => {
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
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2025",
          subject: "avis-imposition",
          target: "T05-avis_imposition_foyer_2025",
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

    expect("currentSuggestionV2" in result.value.input).toBe(false);
    expect(result.value.suggestion.subject).toBeUndefined();
    expect(result.value.suggestion.target).toBeUndefined();
    expect(result.value.suggestion.documentType).toBe("avis-imposition");
    expect(result.value.suggestion.detail).toBe("foyer");
    expect(result.value.suggestion.proposedName).toBeUndefined();
    expect(result.value.suggestion.warnings.join(" ")).toContain("Cible IA ignorée");
    expect(result.value.suggestion.warnings.join(" ")).toContain("Sujet IA ignoré");
  });

  it("accepts T05 fiscal target foyer from the multi-candidate response", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);
    const documentPath = path.join(workspace.sourcePath, "T05-avis_imposition_foyer_2025.pdf");
    await writeFile(documentPath, "contenu original", "utf8");

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: "Avis d'imposition 2025 foyer"
      }),
      documentPath,
      queuedDocuments: [{ filePath: documentPath, name: "T05-avis_imposition_foyer_2025.pdf" }],
      queuedDocumentPaths: [documentPath],
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2025",
          subject: "foyer",
          target: "foyer",
          targetKind: "household",
          documentType: "avis-imposition",
          confidence: 88
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2025",
      subject: "foyer",
      target: "foyer",
      documentType: "avis-imposition",
      proposedName: "2025_foyer_avis-imposition.pdf"
    });
  });

  it("rejects basename-like AI targets", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);
    const documentPath = path.join(workspace.sourcePath, "T01-scan_renault_captur_facture.pdf");
    await writeFile(documentPath, "contenu original", "utf8");

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      documentPath,
      queuedDocuments: [{ filePath: documentPath, name: "T01-scan_renault_captur_facture.pdf" }],
      queuedDocumentPaths: [documentPath],
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2024",
          target: "T01-scan_renault_captur_facture",
          documentType: "facture",
          confidence: 80
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion.target).toBeUndefined();
    expect(result.ok && result.value.suggestion.warnings.join(" ")).toContain("Cible IA ignorée");
  });

  it("rejects AI responses where target equals documentType", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2025",
          target: "avis-imposition",
          targetKind: "household",
          documentType: "avis-imposition",
          confidence: 80
        })
      })
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("AI_OUTPUT_INVALID");
  });

  it("keeps T02 school-year date as the starting year", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: "Certificat de scolarité Léa année scolaire 2026/2027."
      }),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2026",
          subject: "lea",
          target: "lea",
          targetKind: "person",
          documentType: "certificat-scolarite",
          confidence: 82
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2026",
      subject: "lea",
      target: "lea",
      documentType: "certificat-scolarite",
      proposedName: "2026_lea_certificat-scolarite.pdf"
    });
    expect(result.ok && result.value.responseJson.fields.targetKind.selected).toBe("person");
  });

  it("keeps the effect date for an insurance contract response", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: "Contrat assurance habitation. Date de signature 15/12/2025. Date d'effet 01/01/2026."
      }),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2026-01-01",
          target: "maison-principale",
          targetKind: "property",
          documentType: "assurance-habitation",
          issuer: "maif",
          confidence: 86
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2026-01-01",
      target: "maison-principale",
      documentType: "assurance-habitation",
      issuer: "maif",
      proposedName: "2026-01-01_maison-principale_assurance-habitation_maif.pdf"
    });
    expect(result.ok && result.value.suggestion.target).not.toBe("assurance-habitation");
    expect(result.ok && result.value.responseJson.fields.targetKind.selected).toBe("property");
  });

  it("keeps T07 identity issue date, person target and known CNI folder", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt:
          "Carte nationale d'identité de Paul. Né le 04/05/2012. Date de délivrance 10/09/2021."
      }),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2023-11-02",
          subject: "paul",
          target: "paul",
          targetKind: "person",
          documentType: "carte-identite",
          detail: "identite",
          confidence: 84
        })
      }),
      knownRelativeFolders: ["CNI", "Identité"]
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion).toMatchObject({
      dateToken: "2023-11-02",
      subject: "paul",
      target: "paul",
      documentType: "carte-identite",
      targetFolder: "CNI",
      proposedName: "2023-11-02_paul_carte-identite.pdf"
    });
    expect(result.ok && result.value.suggestion.detail).toBeUndefined();
    expect(result.ok && result.value.responseJson.fields.targetKind.selected).toBe("person");
  });

  it("accepts an identity folder candidate requiring creation when no known folder exists", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: "Carte nationale d'identité de Paul. Délivrée le 02/11/2023."
      }),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2023-11-02",
          subject: "paul",
          target: "paul",
          targetKind: "person",
          documentType: "carte-identite",
          targetFolder: "Identité",
          folderCandidates: [{ value: "Identité", requiresCreation: true, score: 84 }],
          confidence: 84
        })
      }),
      knownRelativeFolders: []
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion.targetFolder).toBe("Identité");
    expect(result.ok && result.value.responseJson.folderCandidates[0]).toMatchObject({
      value: "Identité",
      requiresCreation: true
    });
  });

  it("warns when a precise identity date is expected but only a year is returned", async () => {
    const workspace = await createWorkspace();
    await enableAi(workspace.userData);

    const result = await runOllamaSuggestionForDocument({
      ...createOptions(workspace, {
        excerpt: "Carte nationale d'identité de Paul. Délivrée le 02/11/2023."
      }),
      fetchClient: createSuccessfulFetch({
        response: createAiResponse({
          dateToken: "2023",
          subject: "paul",
          target: "paul",
          targetKind: "person",
          documentType: "carte-identite",
          confidence: 72
        })
      })
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.suggestion.dateToken).toBe("2023");
    expect(result.ok && result.value.suggestion.warnings.join(" ")).toContain("Date IA à préciser");
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
        response: createAiResponse({
          folderCandidates: ["../Secret"],
          confidence: 70,
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

async function enableAi(
  userDataPath: string,
  overrides: { timeoutMs?: number; profileId?: "gemma3-4b" | "gemma4-12b-nothink" | "gemma4-12b-thinking" } = {}
) {
  const result = await saveAiSettings(userDataPath, {
    enabled: true,
    provider: "ollama",
    baseUrl: "http://localhost:11434/",
    profileId: overrides.profileId ?? "gemma3-4b",
    model: "gemma3:4b",
    think: false,
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
        createAiResponse({
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

function readGenerateBody(fetchClient: {
  calls: Array<{ url: string; options: { body?: string } }>;
}): Record<string, unknown> {
  const generateCall = fetchClient.calls.find((call) => call.url.endsWith("/api/generate"));
  return JSON.parse(generateCall?.options.body ?? "{}") as Record<string, unknown>;
}

function createAiResponse(options: {
  dateToken?: string;
  subject?: string;
  target?: string;
  targetKind?: "person" | "household" | "vehicle" | "property" | "other";
  documentType?: string;
  issuer?: string;
  detail?: string;
  targetFolder?: string;
  folderCandidates?: Array<string | {
    value: string;
    score?: number;
    reason?: string;
    exists?: boolean;
    requiresCreation?: boolean;
  }>;
  proposedName?: string;
  confidence?: number;
  reasons?: string[];
  warnings?: string[];
  source?: "ollama";
}): string {
  return JSON.stringify({
    fields: {
      dateToken: createField(options.dateToken),
      subject: createField(options.subject),
      target: createField(options.target),
      targetKind: createField(options.targetKind),
      documentType: createField(options.documentType),
      issuer: createField(options.issuer),
      detail: createField(options.detail)
    },
    folderCandidates: (options.folderCandidates ?? (options.targetFolder ? [options.targetFolder] : []))
      .map((value, index) =>
        typeof value === "string"
          ? createCandidate(value, 80 - index, "Dossier proposé.")
          : createCandidate(
              value.value,
              value.score ?? 80 - index,
              value.reason ?? "Dossier proposé.",
              undefined,
              {
                exists: value.exists,
                requiresCreation: value.requiresCreation
              }
            )
      ),
    fileNameCandidates: options.proposedName
      ? [createCandidate(options.proposedName, 80, "Nom proposé.")]
      : [],
    confidence: options.confidence ?? 70,
    warnings: options.warnings ?? [],
    source: options.source ?? "ollama"
  });
}

function createField(value: string | undefined) {
  return {
    selected: value ?? "",
    candidates: value ? [createCandidate(value, 80, "Valeur sélectionnée.", "selected")] : []
  };
}

function createCandidate(
  value: string,
  score: number,
  reason: string,
  role?: string,
  metadata: { exists?: boolean; requiresCreation?: boolean } = {}
) {
  return {
    value,
    score,
    reason,
    ...(role ? { role } : {}),
    ...(typeof metadata.exists === "boolean" ? { exists: metadata.exists } : {}),
    ...(typeof metadata.requiresCreation === "boolean"
      ? { requiresCreation: metadata.requiresCreation }
      : {})
  };
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
