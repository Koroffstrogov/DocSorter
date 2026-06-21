interface AiPanelOptions {
  root?: ParentNode;
  getState: () => AiState;
  onDraftChange: (draft: AiSettingsDraft) => void;
  onQuickProfileChange: (draft: AiSettingsDraft) => void;
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
  onKnownTargetSelect: (target: KnownTarget) => void;
  onKnownTargetCreate: (input: KnownTargetInput) => void;
  onKnownTargetUpdate: (id: string, input: KnownTargetInput) => void;
  onKnownTargetDeactivate: (id: string) => void;
  onKnownTargetDelete: (id: string) => void;
  onFolderCandidateSelect: (relativePath: string) => void;
  onFolderManualEditStart: () => void;
  onFolderManualValueChange: (relativePath: string) => void;
  onFolderManualEditFinish: () => void;
  onApplySuggestionToEmptyFields: () => void;
  onExportDiagnostic: () => void;
  onIgnoreSuggestion: () => void;
  isActionsDisabled: () => boolean;
  canRunSuggestion: () => boolean;
  canPreloadModel: () => boolean;
  canUnloadModel: () => boolean;
  canApplySuggestionToEmptyFields: () => boolean;
  canExportDiagnostic: () => boolean;
  getKnownTargetsState: () => KnownTargetsState;
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
  const aiStatusContent = DocSorterAiStatusContent;
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
      options.onQuickProfileChange(readDraft(elements));
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
        elements.status.replaceChildren(...aiStatusContent.createSimpleStatusContent(state));
      }

      if (elements.technicalStatus) {
        elements.technicalStatus.replaceChildren(...aiStatusContent.createTechnicalStatusContent(state, {
          formatDate: options.formatDate
        }));
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
          onFieldManualEditFinish: options.onFieldManualEditFinish,
          knownTargets: options.getKnownTargetsState(),
          onKnownTargetSelect: options.onKnownTargetSelect,
          onKnownTargetCreate: options.onKnownTargetCreate,
          onKnownTargetUpdate: options.onKnownTargetUpdate,
          onKnownTargetDeactivate: options.onKnownTargetDeactivate,
          onKnownTargetDelete: options.onKnownTargetDelete
        }));
      }

      if (elements.qualityBadges) {
        elements.qualityBadges.replaceChildren(...createQualityBadges(state));
      }

      if (elements.folderCandidates) {
        elements.folderCandidates.replaceChildren(...aiFolderCandidates.createFolderCandidateContent(state, {
          onFolderCandidateSelect: options.onFolderCandidateSelect,
          onFolderManualEditStart: options.onFolderManualEditStart,
          onFolderManualValueChange: options.onFolderManualValueChange,
          onFolderManualEditFinish: options.onFolderManualEditFinish
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
