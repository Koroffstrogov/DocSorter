interface AiPanelOptions {
  root?: ParentNode;
  getState: () => AiState;
  onDraftChange: (draft: AiSettingsDraft) => void;
  onSaveSettings: () => void;
  onTestConnection: () => void;
  onRefreshStatus: () => void;
  onRunSuggestion: () => void;
  onApplySuggestionToEmptyFields: () => void;
  onIgnoreSuggestion: () => void;
  isActionsDisabled: () => boolean;
  canRunSuggestion: () => boolean;
  canApplySuggestionToEmptyFields: () => boolean;
  formatDate: (isoDate: string) => string;
}

interface AiPanelApi {
  render: () => void;
}

interface AiPanelElements {
  status: HTMLElement | null;
  form: HTMLFormElement | null;
  enabledInput: HTMLInputElement | null;
  baseUrlInput: HTMLInputElement | null;
  modelInput: HTMLInputElement | null;
  timeoutInput: HTMLInputElement | null;
  saveButton: HTMLButtonElement | null;
  testButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  runSuggestionButton: HTMLButtonElement | null;
  suggestionDetails: HTMLElement | null;
  applySuggestionButton: HTMLButtonElement | null;
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
  function createAiPanel(options: AiPanelOptions): AiPanelApi {
    const elements = getAiPanelElements(options.root ?? document);
    const textInputs = [elements.baseUrlInput, elements.modelInput, elements.timeoutInput];

    elements.enabledInput?.addEventListener("change", () => {
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

    elements.runSuggestionButton?.addEventListener("click", () => {
      options.onRunSuggestion();
    });

    elements.applySuggestionButton?.addEventListener("click", () => {
      options.onApplySuggestionToEmptyFields();
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
        state.panelStatus === "analyzing";
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

      if (elements.runSuggestionButton) {
        elements.runSuggestionButton.disabled = disabled || !options.canRunSuggestion();
        elements.runSuggestionButton.textContent =
          state.panelStatus === "analyzing" ? "Analyse IA..." : "Analyser avec IA locale";
      }

      if (elements.suggestionDetails) {
        elements.suggestionDetails.replaceChildren(...createSuggestionContent(state, options));
      }

      if (elements.applySuggestionButton) {
        elements.applySuggestionButton.disabled = disabled || !options.canApplySuggestionToEmptyFields();
        elements.applySuggestionButton.hidden = !state.suggestion;
      }

      if (elements.ignoreSuggestionButton) {
        elements.ignoreSuggestionButton.disabled = disabled || !state.suggestion;
        elements.ignoreSuggestionButton.hidden = !state.suggestion;
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
      baseUrlInput: root.querySelector<HTMLInputElement>("#ai-base-url"),
      modelInput: root.querySelector<HTMLInputElement>("#ai-model"),
      timeoutInput: root.querySelector<HTMLInputElement>("#ai-timeout"),
      saveButton: root.querySelector<HTMLButtonElement>("#save-ai-settings"),
      testButton: root.querySelector<HTMLButtonElement>("#test-ai-connection"),
      refreshButton: root.querySelector<HTMLButtonElement>("#refresh-ai-status"),
      runSuggestionButton: root.querySelector<HTMLButtonElement>("#run-ai-suggestion"),
      suggestionDetails: root.querySelector<HTMLElement>("#ai-suggestion-details"),
      applySuggestionButton: root.querySelector<HTMLButtonElement>("#apply-ai-suggestion-empty"),
      ignoreSuggestionButton: root.querySelector<HTMLButtonElement>("#ignore-ai-suggestion")
    };
  }

  function readDraft(elements: AiPanelElements): AiSettingsDraft {
    return {
      enabled: Boolean(elements.enabledInput?.checked),
      baseUrl: elements.baseUrlInput?.value ?? "",
      model: elements.modelInput?.value ?? "",
      timeoutMs: elements.timeoutInput?.value ?? "30000"
    };
  }

  function syncDraft(elements: AiPanelElements, draft: AiSettingsDraft): void {
    if (elements.enabledInput && elements.enabledInput.checked !== draft.enabled) {
      elements.enabledInput.checked = draft.enabled;
    }
    syncInputValue(elements.baseUrlInput, draft.baseUrl);
    syncInputValue(elements.modelInput, draft.model);
    syncInputValue(elements.timeoutInput, draft.timeoutMs);
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
      lines.push(createMetaLine(`Modèle : ${state.status.settings.model || "Non renseigné"}`));
      lines.push(createMetaLine(`Timeout : ${state.status.settings.timeoutMs} ms`));

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

    if (state.panelStatus === "analyzing") {
      return "Analyse IA locale en cours...";
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

  function createSuggestionContent(state: AiState, options: AiPanelOptions): Node[] {
    if (state.panelStatus === "analyzing") {
      return [createMetaLine("Analyse du document actif en cours...")];
    }

    if (!state.suggestion) {
      return [
        createMetaLine(
          "Extrais le texte PDF ou lance l'OCR image, puis utilise le bouton d'analyse IA locale."
        )
      ];
    }

    const suggestion = state.suggestion.suggestion;
    const container = document.createElement("div");
    const heading = document.createElement("div");
    const score = document.createElement("strong");
    const meta = document.createElement("span");

    container.className = "ai-suggestion-summary";
    heading.className = "ai-suggestion-heading";
    score.textContent = `Score ${suggestion.confidence} %`;
    meta.textContent = `${state.suggestion.model} - ${options.formatDate(state.suggestion.suggestedAt)}`;
    heading.append(score, meta);
    container.append(heading, createAiSuggestionGrid(state.suggestion));

    if (state.suggestion.differsFromLocalRules) {
      container.append(createWarningLine("Diffère des règles locales."));
    }

    if (suggestion.reasons.length > 0) {
      container.append(createList("Raisons", suggestion.reasons));
    }

    if (suggestion.warnings.length > 0) {
      container.append(createList("Avertissements", suggestion.warnings));
    }

    return [container];
  }

  function createAiSuggestionGrid(suggestion: RendererAiDocumentSuggestion): HTMLDListElement {
    const grid = document.createElement("dl");
    grid.className = "ai-suggestion-grid";
    grid.append(
      createSuggestionRow("Date", suggestion.suggestion.date),
      createSuggestionRow("Sujet", suggestion.suggestion.subject),
      createSuggestionRow("Type", suggestion.suggestion.documentType),
      createSuggestionRow("Dossier", suggestion.suggestion.targetFolder),
      createSuggestionRow("Mots-clés", suggestion.suggestion.keywords.join(" "))
    );
    return grid;
  }

  function createSuggestionRow(label: string, value: string | undefined): HTMLDivElement {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value?.trim() || "Aucune suggestion";
    row.append(term, description);
    return row;
  }

  function createList(label: string, values: string[]): HTMLElement {
    const section = document.createElement("div");
    const title = document.createElement("strong");
    const list = document.createElement("ul");
    section.className = "ai-suggestion-list";
    title.textContent = label;
    list.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement("li");
        item.textContent = value;
        return item;
      })
    );
    section.append(title, list);
    return section;
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
