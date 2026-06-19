interface AiPanelFormatterCandidate {
  value: string;
  score: number;
  role: string;
  exists?: boolean;
  requiresCreation?: boolean;
}

interface AiPanelFormattersApi {
  readProfileId: (value: string) => AiModelProfileId;
  modelForProfile: (profileId: AiModelProfileId) => string;
  simpleConnectionLabel: (state: AiState) => string;
  simpleModelLabel: (status: RendererAiModelStatus | null) => string;
  statusLabel: (state: AiState) => string;
  aiPipelineStageLabel: (stage: AiPipelineStage) => string;
  formatDuration: (milliseconds: number) => string;
  aiModelStatusLabel: (status: RendererAiModelStatus) => string;
  aiProfileLabel: (profileId: AiModelProfileId) => string;
  normalizeFolderForDisplay: (value: string) => string;
  folderRoleClass: (candidate: AiPanelFormatterCandidate) => string;
  folderRoleLabel: (candidate: AiPanelFormatterCandidate) => string;
  scoreForSelected: (
    candidates: AiPanelFormatterCandidate[],
    selectedValue: string | undefined
  ) => number | null;
}

interface Window {
  DocSorterAiPanelFormatters: AiPanelFormattersApi;
}

var DocSorterAiPanelFormatters: AiPanelFormattersApi;

(() => {
  function readProfileId(value: string): AiModelProfileId {
    return value === "gemma4-12b-nothink" || value === "gemma4-12b-thinking"
      ? value
      : "gemma3-4b";
  }

  function modelForProfile(profileId: AiModelProfileId): string {
    switch (profileId) {
      case "gemma4-12b-nothink":
      case "gemma4-12b-thinking":
        return "gemma4:12b";
      case "gemma3-4b":
        return "gemma3:4b";
    }
  }

  function simpleConnectionLabel(state: AiState): string {
    if (state.panelStatus === "loading") {
      return "IA locale";
    }

    if (state.panelStatus === "testing") {
      return "Test Ollama";
    }

    if (state.status?.status === "disabled") {
      return "IA désactivée";
    }

    if (state.status?.status === "ok") {
      return "Ollama OK";
    }

    if (state.status?.status === "not-tested") {
      return "Ollama à vérifier";
    }

    if (state.status?.status === "timeout") {
      return "Ollama timeout";
    }

    if (state.status?.status === "model-missing") {
      return "Ollama OK";
    }

    return "Ollama indisponible";
  }

  function simpleModelLabel(status: RendererAiModelStatus | null): string {
    if (!status) {
      return "modèle non chargé";
    }

    switch (status.status) {
      case "ready":
        return "modèle chargé";
      case "loading":
        return "chargement modèle";
      case "model_missing":
        return "modèle absent";
      case "unavailable":
        return "modèle indisponible";
      case "error":
        return "erreur modèle";
      case "idle":
        return "modèle non chargé";
    }
  }

  function statusLabel(state: AiState): string {
    if (state.panelStatus === "loading") {
      return "Chargement IA locale...";
    }

    if (state.panelStatus === "saving") {
      return "Sauvegarde IA locale...";
    }

    if (state.panelStatus === "testing") {
      return "Test Ollama en cours...";
    }

    if (state.panelStatus === "preloading") {
      return "Chargement modèle IA...";
    }

    if (state.panelStatus === "unloading") {
      return "Libération modèle IA...";
    }

    if (state.panelStatus === "analyzing") {
      return state.modelStatus?.status === "ready"
        ? "Analyse IA locale en cours..."
        : "Chargement du modèle IA...";
    }

    if (state.panelStatus === "suggestion-ready") {
      return "Suggestion IA prête";
    }

    if (state.status?.status === "disabled") {
      return "IA locale désactivée";
    }

    if (state.status?.status === "not-tested") {
      return state.status.settings.lastStatus === "ok"
        ? "Dernier test Ollama OK"
        : "Test Ollama requis";
    }

    if (state.status?.status === "ok") {
      return "Connexion Ollama OK";
    }

    if (state.status?.status === "model-missing") {
      return "Modèle Ollama absent";
    }

    if (state.status?.status === "timeout") {
      return "Timeout Ollama";
    }

    return "IA locale en erreur";
  }

  function aiPipelineStageLabel(stage: AiPipelineStage): string {
    switch (stage) {
      case "connection":
        return "Connexion Ollama";
      case "model-loading":
        return "Chargement modèle";
      case "text-extraction":
        return "Extraction texte";
      case "analysis":
        return "Analyse IA";
      case "completed":
        return "Terminé";
      case "error":
        return "Erreur";
      case "idle":
        return "Non lancé";
    }
  }

  function formatDuration(milliseconds: number): string {
    return `${(Math.max(0, milliseconds) / 1000).toFixed(1)} s`;
  }

  function aiModelStatusLabel(status: RendererAiModelStatus): string {
    switch (status.status) {
      case "ready":
        return "IA locale prête";
      case "loading":
        return "Chargement du modèle IA...";
      case "model_missing":
        return "Modèle IA absent";
      case "unavailable":
        return status.error?.code === "AI_PROVIDER_DISABLED" ? "désactivé" : "Ollama indisponible";
      case "error":
        return "Erreur IA locale";
      case "idle":
        return "modèle non chargé";
    }
  }

  function aiProfileLabel(profileId: AiModelProfileId): string {
    switch (profileId) {
      case "gemma4-12b-nothink":
        return "gemma4:12b no-think";
      case "gemma4-12b-thinking":
        return "gemma4:12b thinking";
      case "gemma3-4b":
        return "gemma3:4b";
    }
  }

  function normalizeFolderForDisplay(value: string): string {
    return value.trim().replace(/\\/g, "/").toLowerCase();
  }

  function folderRoleClass(candidate: AiPanelFormatterCandidate): string {
    if (candidate.role === "fallback") {
      return "fallback";
    }
    if (candidate.requiresCreation || candidate.role === "newFolderProposal") {
      return "new";
    }
    return "existing";
  }

  function folderRoleLabel(candidate: AiPanelFormatterCandidate): string {
    if (candidate.role === "fallback") {
      return "fallback";
    }
    if (candidate.requiresCreation || candidate.role === "newFolderProposal") {
      return "à créer";
    }
    if (candidate.exists === false) {
      return "proposé";
    }
    return "existe";
  }

  function scoreForSelected(
    candidates: AiPanelFormatterCandidate[],
    selectedValue: string | undefined
  ): number | null {
    const selected = selectedValue?.trim().toLowerCase();
    if (!selected) {
      return null;
    }

    const match = candidates.find((candidate) => candidate.value.trim().toLowerCase() === selected);
    return match?.score ?? null;
  }

  globalThis.DocSorterAiPanelFormatters = {
    readProfileId,
    modelForProfile,
    simpleConnectionLabel,
    simpleModelLabel,
    statusLabel,
    aiPipelineStageLabel,
    formatDuration,
    aiModelStatusLabel,
    aiProfileLabel,
    normalizeFolderForDisplay,
    folderRoleClass,
    folderRoleLabel,
    scoreForSelected
  };
})();
