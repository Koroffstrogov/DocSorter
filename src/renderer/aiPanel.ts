interface AiPanelOptions {
  root?: ParentNode;
  getState: () => AiState;
  onDraftChange: (draft: AiSettingsDraft) => void;
  onSaveSettings: () => void;
  onTestConnection: () => void;
  onRefreshStatus: () => void;
  onUnloadModel: () => void;
  onPreloadModel: () => void;
  onRunSuggestion: () => void;
  onFieldCandidateSelect: (field: AiSelectionFieldKey, value: string) => void;
  onFieldManualEditStart: (field: AiSelectionFieldKey) => void;
  onFieldManualValueChange: (field: AiSelectionFieldKey, value: string) => void;
  onFieldManualEditFinish: () => void;
  onFolderCandidateSelect: (relativePath: string) => void;
  onApplySuggestionToEmptyFields: () => void;
  onExportDiagnostic: () => void;
  onIgnoreSuggestion: () => void;
  isActionsDisabled: () => boolean;
  canRunSuggestion: () => boolean;
  canPreloadModel: () => boolean;
  canUnloadModel: () => boolean;
  canApplySuggestionToEmptyFields: () => boolean;
  canExportDiagnostic: () => boolean;
  formatDate: (isoDate: string) => string;
}

interface AiPanelApi {
  render: () => void;
}

interface AiPanelElements {
  status: HTMLElement | null;
  technicalStatus: HTMLElement | null;
  form: HTMLFormElement | null;
  enabledInput: HTMLInputElement | null;
  quickProfileInput: HTMLSelectElement | null;
  profileInput: HTMLSelectElement | null;
  baseUrlInput: HTMLInputElement | null;
  modelInput: HTMLInputElement | null;
  timeoutInput: HTMLInputElement | null;
  saveButton: HTMLButtonElement | null;
  testButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  unloadModelButton: HTMLButtonElement | null;
  preloadModelButton: HTMLButtonElement | null;
  runSuggestionButton: HTMLButtonElement | null;
  suggestionDetails: HTMLElement | null;
  qualityBadges: HTMLElement | null;
  folderCandidates: HTMLElement | null;
  applySuggestionButton: HTMLButtonElement | null;
  exportDiagnosticButton: HTMLButtonElement | null;
  ignoreSuggestionButton: HTMLButtonElement | null;
}

interface AiPanelFactoryApi {
  createAiPanel: (options: AiPanelOptions) => AiPanelApi;
}

interface Window {
  DocSorterAiPanel: AiPanelFactoryApi;
}

var DocSorterAiPanel: AiPanelFactoryApi;

(() => {
  const aiFormatters = DocSorterAiPanelFormatters;
  const aiFieldRows = DocSorterAiFieldRows;
  const aiFolderCandidates = DocSorterAiFolderCandidates;

  function createAiPanel(options: AiPanelOptions): AiPanelApi {
    const elements = getAiPanelElements(options.root ?? document);
    const textInputs = [elements.baseUrlInput, elements.timeoutInput];

    elements.enabledInput?.addEventListener("change", () => {
      options.onDraftChange(readDraft(elements));
    });

    elements.profileInput?.addEventListener("change", () => {
      options.onDraftChange(readDraft(elements));
    });

    elements.quickProfileInput?.addEventListener("change", () => {
      options.onDraftChange(readDraft(elements));
    });

    textInputs.forEach((input) => {
      input?.addEventListener("input", () => {
        options.onDraftChange(readDraft(elements));
      });
    });

    elements.saveButton?.addEventListener("click", () => {
      options.onSaveSettings();
    });

    elements.testButton?.addEventListener("click", () => {
      options.onTestConnection();
    });

    elements.refreshButton?.addEventListener("click", () => {
      options.onRefreshStatus();
    });

    elements.unloadModelButton?.addEventListener("click", () => {
      options.onUnloadModel();
    });

    elements.preloadModelButton?.addEventListener("click", () => {
      options.onPreloadModel();
    });

    elements.runSuggestionButton?.addEventListener("click", () => {
      options.onRunSuggestion();
    });

    elements.applySuggestionButton?.addEventListener("click", () => {
      options.onApplySuggestionToEmptyFields();
    });

    elements.exportDiagnosticButton?.addEventListener("click", () => {
      options.onExportDiagnostic();
    });

    elements.ignoreSuggestionButton?.addEventListener("click", () => {
      options.onIgnoreSuggestion();
    });

    function render(): void {
      const state = options.getState();
      syncDraft(elements, state.draft);

      if (elements.status) {
        elements.status.replaceChildren(...createSimpleStatusContent(state));
      }

      if (elements.technicalStatus) {
        elements.technicalStatus.replaceChildren(...createTechnicalStatusContent(state, options));
      }

      const busy =
        state.panelStatus === "loading" ||
        state.panelStatus === "saving" ||
        state.panelStatus === "testing" ||
        state.panelStatus === "preloading" ||
        state.panelStatus === "analyzing" ||
        state.panelStatus === "unloading";
      const disabled = options.isActionsDisabled() || busy;
      const canSave = !disabled && state.dirty && isDraftSavable(state.draft);
      const canTest =
        !disabled &&
        !state.dirty &&
        Boolean(state.status?.settings.enabled) &&
        isDraftSavable(state.draft);

      if (elements.enabledInput) {
        elements.enabledInput.disabled = disabled;
      }

      if (elements.profileInput) {
        elements.profileInput.disabled = disabled;
      }

      if (elements.quickProfileInput) {
        elements.quickProfileInput.disabled = disabled;
      }

      [elements.baseUrlInput, elements.modelInput, elements.timeoutInput].forEach((input) => {
        if (input) {
          input.disabled = disabled;
        }
      });

      if (elements.saveButton) {
        elements.saveButton.disabled = !canSave;
        elements.saveButton.textContent = state.panelStatus === "saving" ? "Sauvegarde..." : "Sauvegarder";
      }

      if (elements.testButton) {
        elements.testButton.disabled = !canTest;
        elements.testButton.textContent =
          state.panelStatus === "testing" ? "Test Ollama..." : "Tester Ollama";
      }

      if (elements.refreshButton) {
        elements.refreshButton.disabled = disabled;
      }

      if (elements.unloadModelButton) {
        elements.unloadModelButton.disabled = disabled || !options.canUnloadModel();
        elements.unloadModelButton.textContent =
          state.panelStatus === "unloading" ? "Libération..." : "Libérer le modèle IA";
      }

      if (elements.preloadModelButton) {
        elements.preloadModelButton.disabled = disabled || !options.canPreloadModel();
        elements.preloadModelButton.textContent =
          state.panelStatus === "preloading" ? "Chargement modèle..." : "Charger le modèle IA";
      }

      if (elements.runSuggestionButton) {
        elements.runSuggestionButton.disabled = disabled || !options.canRunSuggestion();
        elements.runSuggestionButton.textContent =
          state.panelStatus === "analyzing" ? "Analyse IA..." : "Analyser avec IA locale";
      }

      if (elements.suggestionDetails) {
        elements.suggestionDetails.replaceChildren(...aiFieldRows.createSuggestionContent(state, {
          formatDate: options.formatDate,
          onFieldCandidateSelect: options.onFieldCandidateSelect,
          onFieldManualEditStart: options.onFieldManualEditStart,
          onFieldManualValueChange: options.onFieldManualValueChange,
          onFieldManualEditFinish: options.onFieldManualEditFinish
        }));
      }

      if (elements.qualityBadges) {
        elements.qualityBadges.replaceChildren(...createQualityBadges(state));
      }

      if (elements.folderCandidates) {
        elements.folderCandidates.replaceChildren(...aiFolderCandidates.createFolderCandidateContent(state, {
          onFolderCandidateSelect: options.onFolderCandidateSelect
        }));
      }

      if (elements.applySuggestionButton) {
        elements.applySuggestionButton.disabled = disabled || !options.canApplySuggestionToEmptyFields();
        elements.applySuggestionButton.hidden = !state.suggestion;
      }

      if (elements.ignoreSuggestionButton) {
        elements.ignoreSuggestionButton.disabled = disabled || !state.suggestion;
        elements.ignoreSuggestionButton.hidden = !state.suggestion;
      }

      if (elements.exportDiagnosticButton) {
        elements.exportDiagnosticButton.disabled = disabled || !options.canExportDiagnostic();
        elements.exportDiagnosticButton.hidden = !options.canExportDiagnostic();
      }
    }

    return {
      render
    };
  }

  function getAiPanelElements(root: ParentNode): AiPanelElements {
    return {
      status: root.querySelector<HTMLElement>("#ai-status"),
      technicalStatus: root.querySelector<HTMLElement>("#ai-technical-status"),
      form: root.querySelector<HTMLFormElement>("#ai-settings-form"),
      enabledInput: root.querySelector<HTMLInputElement>("#ai-enabled"),
      quickProfileInput: root.querySelector<HTMLSelectElement>("#ai-quick-profile"),
      profileInput: root.querySelector<HTMLSelectElement>("#ai-profile"),
      baseUrlInput: root.querySelector<HTMLInputElement>("#ai-base-url"),
      modelInput: root.querySelector<HTMLInputElement>("#ai-model"),
      timeoutInput: root.querySelector<HTMLInputElement>("#ai-timeout"),
      saveButton: root.querySelector<HTMLButtonElement>("#save-ai-settings"),
      testButton: root.querySelector<HTMLButtonElement>("#test-ai-connection"),
      refreshButton: root.querySelector<HTMLButtonElement>("#refresh-ai-status"),
      unloadModelButton: root.querySelector<HTMLButtonElement>("#unload-ai-model"),
      preloadModelButton: root.querySelector<HTMLButtonElement>("#preload-ai-model"),
      runSuggestionButton: root.querySelector<HTMLButtonElement>("#run-ai-suggestion"),
      suggestionDetails: root.querySelector<HTMLElement>("#ai-suggestion-details"),
      qualityBadges: root.querySelector<HTMLElement>("#ai-quality-badges"),
      folderCandidates: root.querySelector<HTMLElement>("#ai-folder-candidates"),
      applySuggestionButton: root.querySelector<HTMLButtonElement>("#apply-ai-suggestion-empty"),
      exportDiagnosticButton: root.querySelector<HTMLButtonElement>("#export-ai-diagnostic"),
      ignoreSuggestionButton: root.querySelector<HTMLButtonElement>("#ignore-ai-suggestion")
    };
  }

  function readDraft(elements: AiPanelElements): AiSettingsDraft {
    return {
      enabled: Boolean(elements.enabledInput?.checked),
      profileId: aiFormatters.readProfileId(elements.quickProfileInput?.value || elements.profileInput?.value || ""),
      baseUrl: elements.baseUrlInput?.value ?? "",
      model: aiFormatters.modelForProfile(aiFormatters.readProfileId(elements.quickProfileInput?.value || elements.profileInput?.value || "")),
      timeoutMs: elements.timeoutInput?.value ?? "30000",
      keepAlive: "30m"
    };
  }

  function syncDraft(elements: AiPanelElements, draft: AiSettingsDraft): void {
    if (elements.enabledInput && elements.enabledInput.checked !== draft.enabled) {
      elements.enabledInput.checked = draft.enabled;
    }
    if (elements.profileInput && elements.profileInput.value !== draft.profileId) {
      elements.profileInput.value = draft.profileId;
    }
    if (elements.quickProfileInput && elements.quickProfileInput.value !== draft.profileId) {
      elements.quickProfileInput.value = draft.profileId;
    }
    syncInputValue(elements.baseUrlInput, draft.baseUrl);
    syncInputValue(elements.modelInput, aiFormatters.modelForProfile(draft.profileId));
    syncInputValue(elements.timeoutInput, draft.timeoutMs);
  }

  function syncInputValue(input: HTMLInputElement | null, value: string): void {
    if (input && input.value !== value) {
      input.value = value;
    }
  }

  function createSimpleStatusContent(state: AiState): Node[] {
    const lines: Node[] = [];
    const summary = document.createElement("strong");
    summary.textContent = `${aiFormatters.simpleConnectionLabel(state)} · ${aiFormatters.simpleModelLabel(state.modelStatus)}`;
    lines.push(summary);

    if (state.timing.stage !== "idle" || state.timing.finalElapsedMs !== null) {
      lines.push(createMetaLine(`Chronomètre : ${aiFormatters.formatDuration(state.timing.finalElapsedMs ?? state.timing.elapsedMs)}`));
    } else if (state.timing.lastAnalysisMs !== null) {
      lines.push(createMetaLine(`Dernière analyse : ${aiFormatters.formatDuration(state.timing.lastAnalysisMs)}`));
    } else if (state.timing.lastLoadMs !== null) {
      lines.push(createMetaLine(`Dernier chargement : ${aiFormatters.formatDuration(state.timing.lastLoadMs)}`));
    }

    if (state.dirty) {
      lines.push(createWarningLine("Réglages IA modifiés."));
    }

    if (state.error) {
      lines.push(createWarningLine(state.error.message));
    }

    return lines;
  }

  function createTechnicalStatusContent(state: AiState, options: AiPanelOptions): Node[] {
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

  function createMetaLine(value: string, title?: string): HTMLElement {
    const line = document.createElement("span");
    line.textContent = value;
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

  function createQualityBadges(state: AiState): HTMLElement[] {
    const suggestion = state.suggestion?.suggestion;
    const selection = state.selection;
    if (!suggestion) {
      return [];
    }

    return [
      createQualityBadge("Date", Boolean(selection?.fields.dateToken || suggestion?.dateToken)),
      createQualityBadge("Type", Boolean(selection?.fields.documentType || suggestion?.documentType)),
      createQualityBadge("Dossier", Boolean(selection?.selectedFolder || suggestion?.targetFolder))
    ];
  }

  function createQualityBadge(label: string, ok: boolean): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `quality-badge ${ok ? "ok" : "neutral"}`;
    badge.textContent = label;
    return badge;
  }

  function compactText(value: string): string {
    return value.length > 58 ? `${value.slice(0, 26)}...${value.slice(-26)}` : value;
  }

  function isDraftSavable(draft: AiSettingsDraft): boolean {
    const timeout = Number(draft.timeoutMs);
    return (
      draft.baseUrl.trim().length > 0 &&
      Number.isInteger(timeout) &&
      timeout >= 1000 &&
      timeout <= 120000
    );
  }

  globalThis.DocSorterAiPanel = {
    createAiPanel
  };
})();
