import "./aiPanelFormatters";
import "./aiStatusContent";

import { describe, expect, it } from "vitest";

const statusContent = globalThis.DocSorterAiStatusContent;

describe("ai status content renderer module", () => {
  it("renders simple status without technical details", () => {
    installTestDocument();

    const nodes = statusContent.createSimpleStatusContent(createAiState({
      status: createRendererAiStatus("ok"),
      modelStatus: createModelStatus("ready")
    }));
    const text = collectNodeText(nodes);

    expect(text).toContain("Ollama OK · modèle chargé");
    expect(nodes[0]?.className).toBe("ai-simple-status-line");
    expect(text).not.toContain("URL :");
    expect(text).not.toContain("Timeout :");
    expect(text).not.toContain("Keep alive :");
    expect(text).not.toContain("Config :");
  });

  it("renders technical status with settings and model details", () => {
    installTestDocument();

    const nodes = statusContent.createTechnicalStatusContent(createAiState({
      status: createRendererAiStatus("ok", {
        lastTestAt: "2026-06-19T10:00:00.000Z"
      }),
      modelStatus: createModelStatus("ready", {
        keepAliveUntil: "2026-06-19T10:30:00.000Z"
      })
    }), {
      formatDate: (isoDate) => `DATE:${isoDate}`
    });
    const text = collectNodeText(nodes);
    const modelLine = findNodeByText(nodes, "Modèle IA : IA locale prête");

    expect(text).toContain("Connexion Ollama OK");
    expect(text).toContain("ready");
    expect(text).toContain("URL : http://localhost:11434/");
    expect(text).toContain("Profil : gemma3:4b");
    expect(text).toContain("Modèle : gemma3:4b");
    expect(text).toContain("Thinking : désactivé");
    expect(text).toContain("Timeout : 30000 ms");
    expect(text).toContain("Keep alive : 30m");
    expect(text).toContain("Config : ai-settings.json");
    expect(text).toContain("Dernier test : DATE:2026-06-19T10:00:00.000Z");
    expect(modelLine?.title).toBe("Conservé jusqu'à 2026-06-19T10:30:00.000Z");
  });

  it("renders dirty and error warnings in both simple and technical statuses", () => {
    installTestDocument();
    const state = createAiState({
      status: createRendererAiStatus("ok"),
      dirty: true,
      error: {
        code: "AI_CONNECTION_FAILED",
        message: "Ollama indisponible"
      }
    });

    const simpleText = collectNodeText(statusContent.createSimpleStatusContent(state));
    const technicalText = collectNodeText(statusContent.createTechnicalStatusContent(state, {
      formatDate: (isoDate) => isoDate
    }));

    expect(simpleText).toContain("Réglages IA modifiés.");
    expect(simpleText).toContain("Ollama indisponible");
    expect(technicalText).toContain("Configuration modifiée non sauvegardée.");
    expect(technicalText).toContain("Ollama indisponible");
  });

  it("renders the latest completed analysis duration in simple status", () => {
    installTestDocument();

    const text = collectNodeText(statusContent.createSimpleStatusContent(createAiState({
      status: createRendererAiStatus("ok"),
      modelStatus: createModelStatus("ready"),
      timing: {
        stage: "completed",
        startedAtMs: null,
        elapsedMs: 4200,
        finalElapsedMs: 4200,
        lastLoadMs: 1300,
        lastAnalysisMs: 4200,
        lastGenerationMs: 2300,
        model: "gemma3:4b",
        profileId: "gemma3-4b",
        think: false
      }
    })));

    expect(text).toContain("Dernière analyse : 4.2 s");
    expect(text).not.toContain("Dernier chargement");
  });

  it("renders pipeline timing details", () => {
    installTestDocument();

    const state = createAiState({
      status: createRendererAiStatus("ok"),
      timing: {
        stage: "analysis",
        startedAtMs: 100,
        elapsedMs: 1234,
        finalElapsedMs: 2345,
        lastLoadMs: 3456,
        lastAnalysisMs: 4567,
        lastGenerationMs: 5678,
        model: "gemma3:4b",
        profileId: "gemma3-4b",
        think: false
      }
    });

    const simpleText = collectNodeText(statusContent.createSimpleStatusContent(state));
    const technicalText = collectNodeText(statusContent.createTechnicalStatusContent(state, {
      formatDate: (isoDate) => isoDate
    }));

    expect(simpleText).toContain("Analyse IA... 1.2 s");
    expect(technicalText).toContain("Étape IA : Analyse IA");
    expect(technicalText).toContain("Chronomètre : 2.3 s");
    expect(technicalText).toContain("Dernier chargement modèle : 3.5 s");
    expect(technicalText).toContain("Dernière analyse totale : 4.6 s");
    expect(technicalText).toContain("Dernière génération IA : 5.7 s");
    expect(technicalText).toContain("Dernier profil : gemma3:4b · thinking inactif");
  });
});

function installTestDocument(): void {
  (globalThis as unknown as { document: { createElement: (tagName: string) => TestElement } }).document = {
    createElement: (tagName: string) => new TestElement(tagName)
  };
}

class TestElement {
  readonly children: TestElement[] = [];
  readonly tagName: string;
  textContent = "";
  className = "";
  title = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }
}

function collectNodeText(nodes: unknown[]): string {
  return nodes.map((node) => collectText(node as TestElement)).join(" ");
}

function collectText(element: TestElement): string {
  return [element.textContent, ...element.children.map(collectText)].join(" ");
}

function findNodeByText(nodes: unknown[], text: string): TestElement | null {
  return nodes.map((node) => node as TestElement).find((node) => node.textContent === text) ?? null;
}

function createAiState(overrides: {
  panelStatus?: AiPanelStatus;
  status?: RendererAiStatus | null;
  modelStatus?: RendererAiModelStatus | null;
  dirty?: boolean;
  error?: RendererAiError | null;
  timing?: AiPipelineTimingState;
} = {}): AiState {
  return {
    panelStatus: overrides.panelStatus ?? "ready",
    status: overrides.status ?? null,
    draft: {
      enabled: true,
      profileId: "gemma3-4b",
      baseUrl: "http://localhost:11434/",
      model: "gemma3:4b",
      timeoutMs: "30000",
      keepAlive: "30m"
    },
    message: "ready",
    error: overrides.error ?? null,
    dirty: overrides.dirty ?? false,
    modelStatus: overrides.modelStatus ?? null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null,
    timing: overrides.timing ?? {
      stage: "idle",
      startedAtMs: null,
      elapsedMs: 0,
      finalElapsedMs: null,
      lastLoadMs: null,
      lastAnalysisMs: null,
      lastGenerationMs: null,
      model: "",
      profileId: null,
      think: null
    }
  };
}

function createRendererAiStatus(
  status: AiConnectionStatus,
  overrides: Partial<RendererAiSettings> = {}
): RendererAiStatus {
  return {
    settingsPath: "ai-settings.json",
    settings: {
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/",
      profileId: "gemma3-4b",
      model: "gemma3:4b",
      think: false,
      timeoutMs: 30000,
      keepAlive: "30m",
      lastTestAt: null,
      lastStatus: null,
      lastError: null,
      ...overrides
    },
    status,
    message: "status",
    error: null
  };
}

function createModelStatus(
  status: AiModelLifecycleStatus,
  overrides: Partial<RendererAiModelStatus> = {}
): RendererAiModelStatus {
  return {
    status,
    model: "gemma3:4b",
    message: "model",
    loadedAt: null,
    keepAliveUntil: null,
    lastCheckedAt: null,
    error: null,
    ...overrides
  };
}
