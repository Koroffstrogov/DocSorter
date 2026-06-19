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

type AiCandidateFieldKey = AiSelectionFieldKey;

interface AiCandidateView {
  value: string;
  score: number;
  reason: string;
  role: string;
  exists?: boolean;
  requiresCreation?: boolean;
}

interface AiMultiCandidateResponseView {
  fields?: Partial<Record<AiCandidateFieldKey, {
    selected?: string;
    candidates?: AiCandidateView[];
  }>>;
  folderCandidates?: AiCandidateView[];
  fileNameCandidates?: AiCandidateView[];
}

interface AiPanelFactoryApi {
  createAiPanel: (options: AiPanelOptions) => AiPanelApi;
}

interface Window {
  DocSorterAiPanel: AiPanelFactoryApi;
}

var DocSorterAiPanel: AiPanelFactoryApi;

(() => {
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
        elements.status.replaceChildren(...createStatusContent(state, options));
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
        elements.suggestionDetails.replaceChildren(...createSuggestionContent(state, options));
      }

      if (elements.qualityBadges) {
        elements.qualityBadges.replaceChildren(...createQualityBadges(state));
      }

      if (elements.folderCandidates) {
        elements.folderCandidates.replaceChildren(...createFolderCandidateContent(state, options));
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
      profileId: readProfileId(elements.quickProfileInput?.value || elements.profileInput?.value || ""),
      baseUrl: elements.baseUrlInput?.value ?? "",
      model: modelForProfile(readProfileId(elements.quickProfileInput?.value || elements.profileInput?.value || "")),
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
    syncInputValue(elements.modelInput, modelForProfile(draft.profileId));
    syncInputValue(elements.timeoutInput, draft.timeoutMs);
  }

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

  function syncInputValue(input: HTMLInputElement | null, value: string): void {
    if (input && input.value !== value) {
      input.value = value;
    }
  }

  function createStatusContent(state: AiState, options: AiPanelOptions): Node[] {
    const lines: Node[] = [];
    const summary = document.createElement("strong");
    summary.textContent = statusLabel(state);
    lines.push(summary);

    const message = document.createElement("span");
    message.textContent = state.message;
    lines.push(message);

    if (state.status) {
      lines.push(createMetaLine(`URL : ${compactText(state.status.settings.baseUrl)}`, state.status.settings.baseUrl));
      lines.push(createMetaLine(`Profil : ${aiProfileLabel(state.status.settings.profileId)}`));
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
      lines.push(createMetaLine(`Étape IA : ${aiPipelineStageLabel(timing.stage)}`));
      lines.push(createMetaLine(`Chronomètre : ${formatDuration(timing.finalElapsedMs ?? timing.elapsedMs)}`));
    }
    if (timing.lastLoadMs !== null) {
      lines.push(createMetaLine(`Dernier chargement modèle : ${formatDuration(timing.lastLoadMs)}`));
    }
    if (timing.lastAnalysisMs !== null) {
      lines.push(createMetaLine(`Dernière analyse totale : ${formatDuration(timing.lastAnalysisMs)}`));
    }
    if (timing.lastGenerationMs !== null) {
      lines.push(createMetaLine(`Dernière génération IA : ${formatDuration(timing.lastGenerationMs)}`));
    }
    if (timing.model) {
      lines.push(createMetaLine(`Dernier profil : ${aiProfileLabel(timing.profileId ?? "gemma3-4b")} · ${timing.think ? "thinking actif" : "thinking inactif"}`));
    }
    return lines;
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

  function createAiModelStatusLine(status: RendererAiModelStatus | null): HTMLElement {
    if (!status) {
      return createMetaLine("Modèle IA : état non chargé");
    }

    const line = createMetaLine(`Modèle IA : ${aiModelStatusLabel(status)}`);
    if (status.keepAliveUntil) {
      line.title = `Conservé jusqu'à ${status.keepAliveUntil}`;
    }
    return line;
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

  function createSuggestionContent(state: AiState, options: AiPanelOptions): Node[] {
    const container = document.createElement("div");
    container.className = "field-refinement-list";

    if (state.panelStatus === "analyzing") {
      container.append(createMetaLine("Analyse du document actif en cours..."));
    } else if (!state.suggestion) {
      container.append(
        createMetaLine("Aucune proposition IA prête. Lance l'analyse après extraction PDF ou OCR image.")
      );
    } else {
      const heading = document.createElement("div");
      const score = document.createElement("strong");
      const meta = document.createElement("span");
      heading.className = "ai-suggestion-heading";
      score.textContent = `Score global ${state.suggestion.suggestion.confidence} %`;
      meta.textContent = `${state.suggestion.profile.label} - ${options.formatDate(state.suggestion.suggestedAt)}`;
      heading.append(score, meta);
      container.append(heading);
    }

    container.append(createAiFieldRows(state, options));

    return [container];
  }

  function createAiFieldRows(state: AiState, options: AiPanelOptions): HTMLElement {
    const suggestion = state.suggestion;
    const selection = state.selection;
    const list = document.createElement("div");
    list.className = "ai-field-list";
    list.replaceChildren(
      createAiFieldRow("Date", "dateToken", selection?.fields.dateToken, suggestion, selection, options),
      createAiFieldRow("Sujet", "subject", selection?.fields.subject, suggestion, selection, options),
      createAiFieldRow("Cible", "target", selection?.fields.target, suggestion, selection, options),
      createAiFieldRow("Type", "documentType", selection?.fields.documentType, suggestion, selection, options),
      createAiFieldRow("Émetteur", "issuer", selection?.fields.issuer, suggestion, selection, options),
      createAiFieldRow("Détail", "detail", selection?.fields.detail, suggestion, selection, options)
    );
    return list;
  }

  function createAiFieldRow(
    label: string,
    key: AiCandidateFieldKey,
    selectedValue: string | undefined,
    suggestion: RendererAiDocumentSuggestion | null,
    selection: AiSelectionState | null,
    options: AiPanelOptions
  ): HTMLElement {
    const row = document.createElement("div");
    const title = document.createElement("div");
    const labelElement = document.createElement("strong");
    const scoreElement = document.createElement("span");
    const badge = document.createElement("span");
    const selected = document.createElement("p");
    const candidates = document.createElement("div");
    const editButton = document.createElement("button");
    const manualInput = document.createElement("input");
    const fieldCandidates = getFieldCandidates(suggestion, key);
    const selectedScore = scoreForSelected(fieldCandidates, selectedValue);
    const isManual = Boolean(selection?.manualFields[key]);
    const isEditing = selection?.editingField === key;

    row.className = `ai-field-row ${isManual ? "manual" : ""}`;
    title.className = "ai-field-title";
    labelElement.textContent = label;
    scoreElement.textContent = selectedScore === null ? "Score non disponible" : `Score ${selectedScore}`;
    badge.className = `ai-field-badge ${isManual ? "manual" : "candidate"}`;
    badge.textContent = isManual ? "manuel" : "IA";
    selected.textContent = selectedValue?.trim() || "Aucune suggestion";
    selected.title = selectedValue?.trim() || "";
    selected.className = selectedValue?.trim() ? "ai-field-selected" : "ai-field-selected empty";
    candidates.className = "ai-field-candidates";
    candidates.replaceChildren(
      ...fieldCandidates.slice(0, 3).map((candidate) =>
        createCandidateButton(candidate, selectedValue, () => {
          options.onFieldCandidateSelect(key, candidate.value);
        })
      )
    );
    if ((key === "issuer" || key === "detail") && suggestion) {
      candidates.append(createEmptyCandidateButton(selectedValue, () => {
        options.onFieldCandidateSelect(key, "");
      }));
    }
    editButton.type = "button";
    editButton.textContent = "Modifier";
    editButton.disabled = !suggestion;
    editButton.title = `Modifier ${label.toLowerCase()} localement`;
    editButton.addEventListener("click", () => {
      options.onFieldManualEditStart(key);
    });

    title.append(labelElement, scoreElement, badge);
    row.append(title, selected, candidates, editButton);
    if (isEditing) {
      manualInput.type = "text";
      manualInput.className = "ai-field-manual-input";
      manualInput.value = selectedValue ?? "";
      manualInput.placeholder = key === "dateToken" ? "AAAA ou AAAA-MM-JJ" : key === "issuer" || key === "detail" ? "Optionnel" : "Valeur";
      manualInput.addEventListener("input", () => {
        row.classList.add("manual");
        badge.className = "ai-field-badge manual";
        badge.textContent = "manuel";
        selected.textContent = manualInput.value.trim() || "Aucune suggestion";
        selected.title = manualInput.value.trim();
        selected.className = manualInput.value.trim() ? "ai-field-selected" : "ai-field-selected empty";
        options.onFieldManualValueChange(key, manualInput.value);
      });
      manualInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          manualInput.blur();
        }
      });
      manualInput.addEventListener("blur", () => {
        options.onFieldManualEditFinish();
      });
      row.append(manualInput);
      window.setTimeout(() => {
        manualInput.focus();
        manualInput.setSelectionRange(manualInput.value.length, manualInput.value.length);
      }, 0);
    }
    return row;
  }

  function createCandidateButton(
    candidate: AiCandidateView,
    selectedValue: string | undefined,
    onSelect: () => void
  ): HTMLButtonElement {
    const button = document.createElement("button");
    const isSelected = selectedValue?.trim().toLowerCase() === candidate.value.trim().toLowerCase();
    button.type = "button";
    button.className = `ai-candidate-chip ${isSelected ? "selected" : ""}`;
    button.textContent = `${isSelected ? "[x] " : ""}${candidate.value} (${candidate.score})`;
    button.title = candidate.reason;
    button.setAttribute("aria-pressed", String(isSelected));
    button.addEventListener("click", onSelect);
    return button;
  }

  function createEmptyCandidateButton(
    selectedValue: string | undefined,
    onSelect: () => void
  ): HTMLButtonElement {
    const button = document.createElement("button");
    const isSelected = !selectedValue?.trim();
    button.type = "button";
    button.className = `ai-candidate-chip empty ${isSelected ? "selected" : ""}`;
    button.textContent = `${isSelected ? "[x] " : ""}aucun`;
    button.title = "Ne pas utiliser ce champ optionnel dans le nom.";
    button.setAttribute("aria-pressed", String(isSelected));
    button.addEventListener("click", onSelect);
    return button;
  }

  function createQualityBadges(state: AiState): HTMLElement[] {
    const suggestion = state.suggestion?.suggestion;
    const selection = state.selection;
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

  function createFolderCandidateContent(state: AiState, options: AiPanelOptions): Node[] {
    const suggestion = state.suggestion;
    const container = document.createElement("div");
    const current = document.createElement("p");
    const cards = document.createElement("div");
    const folderCandidates = getFolderCandidates(suggestion).slice(0, 3);
    const selectedFolder = state.selection?.selectedFolder ?? suggestion?.suggestion.targetFolder ?? "";

    container.className = "folder-candidate-content";
    current.className = "folder-current";
    current.textContent = `Dossier proposé actuel : ${selectedFolder.trim() || "Aucun"}`;
    cards.className = "folder-candidate-cards";
    cards.replaceChildren(
      ...folderCandidates.map((candidate) =>
        createFolderCandidateCard(candidate, selectedFolder, () => {
          options.onFolderCandidateSelect(candidate.value);
        })
      )
    );

    if (folderCandidates.length === 0) {
      const empty = document.createElement("span");
      empty.className = "folder-candidate-empty";
      empty.textContent = "Aucune carte de dossier disponible.";
      cards.append(empty);
    }

    container.append(current, cards);
    return [container];
  }

  function createFolderCandidateCard(
    candidate: AiCandidateView,
    selectedFolder: string,
    onSelect: () => void
  ): HTMLElement {
    const card = document.createElement("button");
    const value = document.createElement("strong");
    const meta = document.createElement("span");
    const reason = document.createElement("p");
    const selected = normalizeFolderForDisplay(candidate.value) === normalizeFolderForDisplay(selectedFolder);
    card.type = "button";
    card.className = `folder-candidate-card ${folderRoleClass(candidate)} ${selected ? "selected" : ""}`;
    card.setAttribute("aria-pressed", String(selected));
    value.textContent = candidate.value;
    value.title = candidate.value;
    meta.textContent = `${selected ? "sélectionné · " : ""}${folderRoleLabel(candidate)} · score ${candidate.score}`;
    reason.textContent = candidate.reason;
    card.addEventListener("click", onSelect);
    card.append(value, meta, reason);
    return card;
  }

  function normalizeFolderForDisplay(value: string): string {
    return value.trim().replace(/\\/g, "/").toLowerCase();
  }

  function folderRoleClass(candidate: AiCandidateView): string {
    if (candidate.role === "fallback") {
      return "fallback";
    }
    if (candidate.requiresCreation || candidate.role === "newFolderProposal") {
      return "new";
    }
    return "existing";
  }

  function folderRoleLabel(candidate: AiCandidateView): string {
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

  function getFieldCandidates(
    suggestion: RendererAiDocumentSuggestion | null,
    key: AiCandidateFieldKey
  ): AiCandidateView[] {
    const response = readResponseJson(suggestion);
    return normalizeCandidates(response?.fields?.[key]?.candidates ?? []);
  }

  function getFolderCandidates(suggestion: RendererAiDocumentSuggestion | null): AiCandidateView[] {
    const response = readResponseJson(suggestion);
    return normalizeCandidates(response?.folderCandidates ?? []);
  }

  function scoreForSelected(candidates: AiCandidateView[], selectedValue: string | undefined): number | null {
    const selected = selectedValue?.trim().toLowerCase();
    if (!selected) {
      return null;
    }

    const match = candidates.find((candidate) => candidate.value.trim().toLowerCase() === selected);
    return match?.score ?? null;
  }

  function readResponseJson(
    suggestion: RendererAiDocumentSuggestion | null
  ): AiMultiCandidateResponseView | null {
    const value = suggestion?.responseJson;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as AiMultiCandidateResponseView
      : null;
  }

  function normalizeCandidates(values: unknown[]): AiCandidateView[] {
    return values
      .filter((value): value is Partial<AiCandidateView> => Boolean(value && typeof value === "object"))
      .map((value) => ({
        value: typeof value.value === "string" ? value.value : "",
        score: typeof value.score === "number" && Number.isFinite(value.score) ? Math.round(value.score) : 0,
        reason: typeof value.reason === "string" ? value.reason : "",
        role: typeof value.role === "string" ? value.role : "",
        ...(typeof value.exists === "boolean" ? { exists: value.exists } : {}),
        ...(typeof value.requiresCreation === "boolean"
          ? { requiresCreation: value.requiresCreation }
          : {})
      }))
      .filter((value) => value.value.trim())
      .sort((left, right) =>
        right.score - left.score || left.value.localeCompare(right.value, "fr", { sensitivity: "base" })
      );
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
