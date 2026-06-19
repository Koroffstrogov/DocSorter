interface AiStatusContentOptions {
  formatDate: (isoDate: string) => string;
}

interface AiStatusContentApi {
  createSimpleStatusContent: (state: AiState) => Node[];
  createTechnicalStatusContent: (
    state: AiState,
    options: AiStatusContentOptions
  ) => Node[];
}

interface Window {
  DocSorterAiStatusContent: AiStatusContentApi;
}

var DocSorterAiStatusContent: AiStatusContentApi;

(() => {
  const aiFormatters = DocSorterAiPanelFormatters;

  function createSimpleStatusContent(state: AiState): Node[] {
    const lines: Node[] = [];
    const summary = document.createElement("strong");
    summary.className = "ai-simple-status-line";
    summary.textContent = `${aiFormatters.simpleConnectionLabel(state)} · ${aiFormatters.simpleModelLabel(state.modelStatus)}`;
    lines.push(summary);

    const timingLine = createSimpleTimingLine(state.timing);
    if (timingLine) {
      lines.push(timingLine);
    }

    if (state.dirty) {
      lines.push(createWarningLine("Réglages IA modifiés."));
    }

    if (state.error) {
      lines.push(createWarningLine(state.error.message));
    }

    return lines;
  }

  function createSimpleTimingLine(timing: AiPipelineTimingState): HTMLElement | null {
    if (timing.stage !== "idle" && timing.stage !== "completed" && timing.stage !== "error") {
      return createMetaLine(
        `${aiFormatters.aiPipelineStageLabel(timing.stage)}... ${aiFormatters.formatDuration(timing.elapsedMs)}`,
        undefined,
        "ai-simple-timing-line"
      );
    }

    if (timing.lastAnalysisMs !== null) {
      return createMetaLine(
        `Dernière analyse : ${aiFormatters.formatDuration(timing.lastAnalysisMs)}`,
        undefined,
        "ai-simple-timing-line"
      );
    }

    if (timing.lastLoadMs !== null) {
      return createMetaLine(
        `Dernier chargement : ${aiFormatters.formatDuration(timing.lastLoadMs)}`,
        undefined,
        "ai-simple-timing-line"
      );
    }

    if (timing.finalElapsedMs !== null) {
      return createMetaLine(
        `Dernier essai : ${aiFormatters.formatDuration(timing.finalElapsedMs)}`,
        undefined,
        "ai-simple-timing-line"
      );
    }

    return null;
  }

  function createTechnicalStatusContent(state: AiState, options: AiStatusContentOptions): Node[] {
    const lines: Node[] = [];
    const summary = document.createElement("strong");
    summary.textContent = aiFormatters.statusLabel(state);
    lines.push(summary);

    const message = document.createElement("span");
    message.textContent = state.message;
    lines.push(message);

    if (state.status) {
      lines.push(createMetaLine(`URL : ${compactText(state.status.settings.baseUrl)}`, state.status.settings.baseUrl));
      lines.push(createMetaLine(`Profil : ${aiFormatters.aiProfileLabel(state.status.settings.profileId)}`));
      lines.push(createMetaLine(`Modèle : ${state.status.settings.model || "Non renseigné"}`));
      lines.push(createMetaLine(`Thinking : ${state.status.settings.think ? "activé" : "désactivé"}`));
      lines.push(createMetaLine(`Timeout : ${state.status.settings.timeoutMs} ms`));
      lines.push(createMetaLine(`Keep alive : ${state.status.settings.keepAlive || "30m"}`));
      lines.push(createAiModelStatusLine(state.modelStatus));
      lines.push(...createAiTimingLines(state.timing));

      if (state.status.settingsPath) {
        lines.push(createMetaLine(`Config : ${compactText(state.status.settingsPath)}`, state.status.settingsPath));
      }

      if (state.status.settings.lastTestAt) {
        lines.push(createMetaLine(`Dernier test : ${options.formatDate(state.status.settings.lastTestAt)}`));
      }
    }

    if (state.dirty) {
      lines.push(createWarningLine("Configuration modifiée non sauvegardée."));
    }

    if (state.error) {
      lines.push(createWarningLine(state.error.message));
    }

    return lines;
  }

  function createMetaLine(value: string, title?: string, className?: string): HTMLElement {
    const line = document.createElement("span");
    line.textContent = value;
    if (className) {
      line.className = className;
    }
    if (title) {
      line.title = title;
    }
    return line;
  }

  function createWarningLine(value: string): HTMLElement {
    const line = document.createElement("span");
    line.className = "ai-warning";
    line.textContent = value;
    return line;
  }

  function createAiTimingLines(timing: AiPipelineTimingState): HTMLElement[] {
    const lines: HTMLElement[] = [];
    if (timing.stage !== "idle" || timing.finalElapsedMs !== null) {
      lines.push(createMetaLine(`Étape IA : ${aiFormatters.aiPipelineStageLabel(timing.stage)}`));
      lines.push(createMetaLine(`Chronomètre : ${aiFormatters.formatDuration(timing.finalElapsedMs ?? timing.elapsedMs)}`));
    }
    if (timing.lastLoadMs !== null) {
      lines.push(createMetaLine(`Dernier chargement modèle : ${aiFormatters.formatDuration(timing.lastLoadMs)}`));
    }
    if (timing.lastAnalysisMs !== null) {
      lines.push(createMetaLine(`Dernière analyse totale : ${aiFormatters.formatDuration(timing.lastAnalysisMs)}`));
    }
    if (timing.lastGenerationMs !== null) {
      lines.push(createMetaLine(`Dernière génération IA : ${aiFormatters.formatDuration(timing.lastGenerationMs)}`));
    }
    if (timing.model) {
      lines.push(createMetaLine(`Dernier profil : ${aiFormatters.aiProfileLabel(timing.profileId ?? "gemma3-4b")} · ${timing.think ? "thinking actif" : "thinking inactif"}`));
    }
    return lines;
  }

  function createAiModelStatusLine(status: RendererAiModelStatus | null): HTMLElement {
    if (!status) {
      return createMetaLine("Modèle IA : état non chargé");
    }

    const line = createMetaLine(`Modèle IA : ${aiFormatters.aiModelStatusLabel(status)}`);
    if (status.keepAliveUntil) {
      line.title = `Conservé jusqu'à ${status.keepAliveUntil}`;
    }
    return line;
  }

  function compactText(value: string): string {
    return value.length > 58 ? `${value.slice(0, 26)}...${value.slice(-26)}` : value;
  }

  globalThis.DocSorterAiStatusContent = {
    createSimpleStatusContent,
    createTechnicalStatusContent
  };
})();
