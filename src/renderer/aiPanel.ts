interface AiPanelOptions {
  root?: ParentNode;
  getState: () => AiState;
  onDraftChange: (draft: AiSettingsDraft) => void;
  onSaveSettings: () => void;
  onTestConnection: () => void;
  onRefreshStatus: () => void;
  onUnloadModel: () => void;
  onRunSuggestion: () => void;
  onApplySuggestionToEmptyFields: () => void;
  onExportDiagnostic: () => void;
  onIgnoreSuggestion: () => void;
  isActionsDisabled: () => boolean;
  canRunSuggestion: () => boolean;
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
  profileInput: HTMLSelectElement | null;
  baseUrlInput: HTMLInputElement | null;
  modelInput: HTMLInputElement | null;
  timeoutInput: HTMLInputElement | null;
  saveButton: HTMLButtonElement | null;
  testButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  unloadModelButton: HTMLButtonElement | null;
  runSuggestionButton: HTMLButtonElement | null;
  suggestionDetails: HTMLElement | null;
  qualityBadges: HTMLElement | null;
  folderCandidates: HTMLElement | null;
  applySuggestionButton: HTMLButtonElement | null;
  exportDiagnosticButton: HTMLButtonElement | null;
  ignoreSuggestionButton: HTMLButtonElement | null;
}

type AiCandidateFieldKey = "dateToken" | "subject" | "target" | "documentType" | "issuer" | "detail";

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
        elements.folderCandidates.replaceChildren(...createFolderCandidateContent(state));
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
      profileInput: root.querySelector<HTMLSelectElement>("#ai-profile"),
      baseUrlInput: root.querySelector<HTMLInputElement>("#ai-base-url"),
      modelInput: root.querySelector<HTMLInputElement>("#ai-model"),
      timeoutInput: root.querySelector<HTMLInputElement>("#ai-timeout"),
      saveButton: root.querySelector<HTMLButtonElement>("#save-ai-settings"),
      testButton: root.querySelector<HTMLButtonElement>("#test-ai-connection"),
      refreshButton: root.querySelector<HTMLButtonElement>("#refresh-ai-status"),
      unloadModelButton: root.querySelector<HTMLButtonElement>("#unload-ai-model"),
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
      profileId: readProfileId(elements.profileInput?.value ?? ""),
      baseUrl: elements.baseUrlInput?.value ?? "",
      model: modelForProfile(readProfileId(elements.profileInput?.value ?? "")),
      timeoutMs: elements.timeoutInput?.value ?? "30000"
    };
  }

  function syncDraft(elements: AiPanelElements, draft: AiSettingsDraft): void {
    if (elements.enabledInput && elements.enabledInput.checked !== draft.enabled) {
      elements.enabledInput.checked = draft.enabled;
    }
    if (elements.profileInput && elements.profileInput.value !== draft.profileId) {
      elements.profileInput.value = draft.profileId;
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
      lines.push(createAiModelStatusLine(state.modelStatus));

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

    container.append(createAiFieldRows(state.suggestion));

    return [container];
  }

  function createAiFieldRows(suggestion: RendererAiDocumentSuggestion | null): HTMLElement {
    const list = document.createElement("div");
    list.className = "ai-field-list";
    list.replaceChildren(
      createAiFieldRow("Date", "dateToken", suggestion?.suggestion.dateToken, suggestion),
      createAiFieldRow("Sujet", "subject", suggestion?.suggestion.subject, suggestion),
      createAiFieldRow("Cible", "target", suggestion?.suggestion.target, suggestion),
      createAiFieldRow("Type", "documentType", suggestion?.suggestion.documentType, suggestion),
      createAiFieldRow("Émetteur", "issuer", suggestion?.suggestion.issuer, suggestion),
      createAiFieldRow("Détail", "detail", suggestion?.suggestion.detail, suggestion)
    );
    return list;
  }

  function createAiFieldRow(
    label: string,
    key: AiCandidateFieldKey,
    selectedValue: string | undefined,
    suggestion: RendererAiDocumentSuggestion | null
  ): HTMLElement {
    const row = document.createElement("div");
    const title = document.createElement("div");
    const labelElement = document.createElement("strong");
    const scoreElement = document.createElement("span");
    const selected = document.createElement("p");
    const candidates = document.createElement("div");
    const editButton = document.createElement("button");
    const fieldCandidates = getFieldCandidates(suggestion, key);
    const selectedScore = scoreForSelected(fieldCandidates, selectedValue);

    row.className = "ai-field-row";
    title.className = "ai-field-title";
    labelElement.textContent = label;
    scoreElement.textContent = selectedScore === null ? "Score non disponible" : `Score ${selectedScore}`;
    selected.textContent = selectedValue?.trim() || "Aucune suggestion";
    selected.title = selectedValue?.trim() || "";
    selected.className = selectedValue?.trim() ? "ai-field-selected" : "ai-field-selected empty";
    candidates.className = "ai-field-candidates";
    candidates.replaceChildren(...fieldCandidates.slice(0, 3).map(createCandidateChip));
    editButton.type = "button";
    editButton.textContent = "Modifier";
    editButton.disabled = true;
    editButton.title = "Choix manuel par champ prévu dans un lot ultérieur";

    title.append(labelElement, scoreElement);
    row.append(title, selected, candidates, editButton);
    return row;
  }

  function createCandidateChip(candidate: AiCandidateView): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "ai-candidate-chip";
    chip.textContent = `${candidate.value} (${candidate.score})`;
    chip.title = candidate.reason;
    return chip;
  }

  function createQualityBadges(state: AiState): HTMLElement[] {
    const suggestion = state.suggestion?.suggestion;
    return [
      createQualityBadge("Date", Boolean(suggestion?.dateToken)),
      createQualityBadge("Type", Boolean(suggestion?.documentType)),
      createQualityBadge("Dossier", Boolean(suggestion?.targetFolder))
    ];
  }

  function createQualityBadge(label: string, ok: boolean): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `quality-badge ${ok ? "ok" : "neutral"}`;
    badge.textContent = label;
    return badge;
  }

  function createFolderCandidateContent(state: AiState): Node[] {
    const suggestion = state.suggestion;
    const container = document.createElement("div");
    const current = document.createElement("p");
    const cards = document.createElement("div");
    const folderCandidates = getFolderCandidates(suggestion).slice(0, 3);

    container.className = "folder-candidate-content";
    current.className = "folder-current";
    current.textContent = `Dossier proposé actuel : ${suggestion?.suggestion.targetFolder?.trim() || "Aucun"}`;
    cards.className = "folder-candidate-cards";
    cards.replaceChildren(...folderCandidates.map(createFolderCandidateCard));

    if (folderCandidates.length === 0) {
      const empty = document.createElement("span");
      empty.className = "folder-candidate-empty";
      empty.textContent = "Aucune carte de dossier disponible.";
      cards.append(empty);
    }

    container.append(current, cards);
    return [container];
  }

  function createFolderCandidateCard(candidate: AiCandidateView): HTMLElement {
    const card = document.createElement("article");
    const value = document.createElement("strong");
    const meta = document.createElement("span");
    const reason = document.createElement("p");
    card.className = `folder-candidate-card ${folderRoleClass(candidate)}`;
    value.textContent = candidate.value;
    value.title = candidate.value;
    meta.textContent = `${folderRoleLabel(candidate)} · score ${candidate.score}`;
    reason.textContent = candidate.reason;
    card.append(value, meta, reason);
    return card;
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
