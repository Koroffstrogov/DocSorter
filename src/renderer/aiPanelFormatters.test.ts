import "./aiPanelFormatters";

import { describe, expect, it } from "vitest";

const formatters = globalThis.DocSorterAiPanelFormatters;

describe("ai panel formatters", () => {
  it("maps profiles to Ollama model names", () => {
    expect(formatters.modelForProfile("gemma3-4b")).toBe("gemma3:4b");
    expect(formatters.modelForProfile("gemma4-12b-nothink")).toBe("gemma4:12b");
    expect(formatters.modelForProfile("gemma4-12b-thinking")).toBe("gemma4:12b");
  });

  it("falls back to gemma3 profile for unknown profile ids", () => {
    expect(formatters.readProfileId("unknown-model")).toBe("gemma3-4b");
  });

  it("formats simple connection and model labels", () => {
    expect(formatters.simpleConnectionLabel(createAiState({ status: { status: "ok" } }))).toBe("Ollama OK");
    expect(formatters.simpleConnectionLabel(createAiState({ status: { status: "not-tested" } }))).toBe(
      "Ollama à vérifier"
    );
    expect(formatters.simpleConnectionLabel(createAiState({ status: { status: "disabled" } }))).toBe(
      "IA désactivée"
    );
    expect(formatters.simpleModelLabel(createModelStatus("ready"))).toBe("modèle chargé");
    expect(formatters.simpleModelLabel(createModelStatus("idle"))).toBe("modèle non chargé");
    expect(formatters.simpleModelLabel(null)).toBe("modèle non chargé");
  });

  it("formats technical status labels", () => {
    expect(formatters.statusLabel(createAiState({ panelStatus: "loading" }))).toBe("Chargement IA locale...");
    expect(formatters.statusLabel(createAiState({ panelStatus: "testing" }))).toBe("Test Ollama en cours...");
    expect(formatters.statusLabel(createAiState({ panelStatus: "suggestion-ready" }))).toBe("Suggestion IA prête");
    expect(
      formatters.statusLabel(createAiState({ status: { status: "not-tested", lastStatus: "ok" } }))
    ).toBe("Dernier test Ollama OK");
  });

  it("formats pipeline labels and durations", () => {
    expect(formatters.aiPipelineStageLabel("connection")).toBe("Connexion Ollama");
    expect(formatters.aiPipelineStageLabel("model-loading")).toBe("Chargement modèle");
    expect(formatters.aiPipelineStageLabel("analysis")).toBe("Analyse IA");
    expect(formatters.aiPipelineStageLabel("idle")).toBe("Non lancé");
    expect(formatters.formatDuration(1250)).toBe("1.3 s");
    expect(formatters.formatDuration(-50)).toBe("0.0 s");
  });

  it("formats model and profile labels", () => {
    expect(formatters.aiModelStatusLabel(createModelStatus("ready"))).toBe("IA locale prête");
    expect(formatters.aiModelStatusLabel(createModelStatus("model_missing"))).toBe("Modèle IA absent");
    expect(formatters.aiModelStatusLabel(createModelStatus("unavailable"))).toBe("Ollama indisponible");
    expect(formatters.aiProfileLabel("gemma3-4b")).toBe("gemma3:4b");
    expect(formatters.aiProfileLabel("gemma4-12b-thinking")).toBe("gemma4:12b thinking");
  });

  it("formats folder roles and normalizes folder display", () => {
    expect(formatters.normalizeFolderForDisplay(" Scolarite\\Lea ")).toBe("scolarite/lea");
    expect(formatters.folderRoleClass({ value: "Scolarite", score: 90, role: "existing" })).toBe("existing");
    expect(formatters.folderRoleLabel({ value: "Scolarite", score: 90, role: "existing" })).toBe("existe");
    expect(formatters.folderRoleClass({ value: "Scolarite/Lea", score: 80, role: "newFolderProposal" })).toBe("new");
    expect(formatters.folderRoleLabel({ value: "Scolarite/Lea", score: 80, role: "newFolderProposal" })).toBe(
      "à créer"
    );
    expect(formatters.folderRoleClass({ value: "Divers", score: 10, role: "fallback" })).toBe("fallback");
    expect(formatters.folderRoleLabel({ value: "Divers", score: 10, role: "fallback" })).toBe("fallback");
    expect(formatters.folderRoleLabel({ value: "Propose", score: 40, role: "candidate", exists: false })).toBe(
      "proposé"
    );
  });

  it("returns the selected candidate score when available", () => {
    const candidates = [
      { value: "captur", score: 85, role: "candidate" },
      { value: "lea", score: 95, role: "candidate" }
    ];

    expect(formatters.scoreForSelected(candidates, "LEA")).toBe(95);
    expect(formatters.scoreForSelected(candidates, "unknown")).toBeNull();
    expect(formatters.scoreForSelected(candidates, "")).toBeNull();
  });
});

function createAiState(
  overrides: {
    panelStatus?: AiPanelStatus;
    status?: { status: AiConnectionStatus; lastStatus?: AiConnectionStatus | null };
    modelStatus?: RendererAiModelStatus | null;
  } = {}
): AiState {
  const status = overrides.status
    ? {
        settingsPath: "ai-settings.json",
        status: overrides.status.status,
        message: "status",
        error: null,
        settings: {
          enabled: true,
          provider: "ollama" as const,
          baseUrl: "http://localhost:11434/",
          profileId: "gemma3-4b" as const,
          model: "gemma3:4b",
          think: false,
          timeoutMs: 30000,
          keepAlive: "30m",
          lastTestAt: null,
          lastStatus: overrides.status.lastStatus ?? null,
          lastError: null
        }
      }
    : null;

  return {
    panelStatus: overrides.panelStatus ?? "ready",
    status,
    draft: {
      enabled: true,
      profileId: "gemma3-4b",
      baseUrl: "http://localhost:11434/",
      model: "gemma3:4b",
      timeoutMs: "30000",
      keepAlive: "30m"
    },
    message: "ready",
    error: null,
    dirty: false,
    modelStatus: overrides.modelStatus ?? null,
    suggestion: null,
    selection: null,
    timing: {
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

function createModelStatus(status: AiModelLifecycleStatus): RendererAiModelStatus {
  return {
    status,
    model: "gemma3:4b",
    message: "model",
    loadedAt: null,
    keepAliveUntil: null,
    lastCheckedAt: null,
    error: null
  };
}
