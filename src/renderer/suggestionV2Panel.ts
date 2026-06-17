interface SuggestionV2PanelState {
  activeDocument: DocumentItem | null;
  suggestionState: SuggestionV2DocumentState | null;
}

interface SuggestionV2PanelOptions {
  root?: ParentNode;
  getState: () => SuggestionV2PanelState;
}

interface SuggestionV2PanelApi {
  render: () => void;
}

interface SuggestionV2PanelElements {
  panel: HTMLElement | null;
  details: HTMLElement | null;
}

interface SuggestionV2PanelFactoryApi {
  createSuggestionV2Panel: (options: SuggestionV2PanelOptions) => SuggestionV2PanelApi;
}

interface Window {
  DocSorterSuggestionV2Panel: SuggestionV2PanelFactoryApi;
}

var DocSorterSuggestionV2Panel: SuggestionV2PanelFactoryApi;

(() => {
  function createSuggestionV2Panel(options: SuggestionV2PanelOptions): SuggestionV2PanelApi {
    const elements = getSuggestionV2PanelElements(options.root ?? document);

    function render(): void {
      if (!elements.panel || !elements.details) {
        return;
      }

      const { activeDocument, suggestionState } = options.getState();
      elements.panel.hidden = !activeDocument;
      if (!activeDocument) {
        elements.details.replaceChildren();
        return;
      }

      const state = suggestionState ?? createIdleSuggestionV2DocumentState();
      if (state.status === "loading") {
        elements.details.replaceChildren("Préparation de la suggestion v2...");
        return;
      }

      if (state.status === "error") {
        elements.details.replaceChildren(state.error?.message ?? "Suggestion v2 indisponible.");
        return;
      }

      if (state.status === "idle" || !state.result) {
        elements.details.replaceChildren("Suggestion v2 en attente.");
        return;
      }

      elements.details.replaceChildren(createSuggestionSummary(state.result));
    }

    return { render };
  }

  function getSuggestionV2PanelElements(root: ParentNode): SuggestionV2PanelElements {
    return {
      panel: root.querySelector<HTMLElement>("#suggestion-v2-panel"),
      details: root.querySelector<HTMLElement>("#suggestion-v2-details")
    };
  }

  function createSuggestionSummary(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "suggestion-v2-summary";

    container.append(
      createHeader(suggestion),
      createFieldGrid(suggestion),
      createRecommendedFolder(suggestion),
      createDepthOptions(suggestion)
    );

    if (suggestion.missingFields.length > 0) {
      container.append(createList("Champs manquants", suggestion.missingFields.map(missingFieldLabel)));
    }

    const warnings = uniqueStrings([
      ...suggestion.draft.warnings,
      ...suggestion.targetFolderSuggestion.warnings,
      ...suggestion.referenceDataWarnings
    ]);
    if (warnings.length > 0) {
      container.append(createList("Alertes", warnings));
    }

    const reasons = uniqueStrings([
      ...suggestion.draft.reasons,
      ...suggestion.targetFolderSuggestion.reasons
    ]);
    if (reasons.length > 0) {
      container.append(createList("Raisons", reasons));
    }

    return container;
  }

  function createHeader(suggestion: RendererSuggestionV2DocumentSuggestion): HTMLDivElement {
    const header = document.createElement("div");
    const nameLabel = document.createElement("span");
    const name = document.createElement("strong");
    const confidence = document.createElement("small");

    header.className = "suggestion-v2-header";
    nameLabel.textContent = "Nom v2";
    name.textContent = suggestion.draft.proposedName ?? "Nom non généré";
    name.title = suggestion.draft.proposedName ?? suggestion.message;
    confidence.textContent = `Confiance ${suggestion.draft.confidence} %`;
    header.append(nameLabel, name, confidence);
    return header;
  }

  function createFieldGrid(suggestion: RendererSuggestionV2DocumentSuggestion): HTMLDListElement {
    const grid = document.createElement("dl");
    grid.className = "suggestion-v2-grid";
    grid.append(
      createFieldRow("Date", suggestion.draft.dateToken),
      createFieldRow("Cible", suggestion.draft.target),
      createFieldRow("Type", suggestion.draft.documentType),
      createFieldRow("Émetteur", suggestion.draft.issuer),
      createFieldRow("Détail", suggestion.draft.detail)
    );
    return grid;
  }

  function createFieldRow(label: string, value: string | undefined): HTMLDivElement {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value?.trim() || "Non détecté";
    description.title = description.textContent;
    row.append(term, description);
    return row;
  }

  function createRecommendedFolder(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement {
    const container = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    const recommended = suggestion.targetFolderSuggestion.recommended;

    container.className = "suggestion-v2-folder";
    label.textContent = "Dossier recommandé";
    value.textContent = recommended?.relativePath ?? "Aucun dossier recommandé";
    value.title = value.textContent;
    container.append(label, value);
    return container;
  }

  function createDepthOptions(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement {
    const container = document.createElement("div");
    const title = document.createElement("span");
    const list = document.createElement("ul");

    container.className = "suggestion-v2-depth-options";
    title.textContent = "Options";
    list.replaceChildren(
      ...suggestion.targetFolderSuggestion.options.map((option) => {
        const item = document.createElement("li");
        const label = document.createElement("strong");
        const value = document.createElement("span");

        item.className = option.recommended ? "recommended-folder-option" : "";
        label.textContent = folderDepthLabel(option.label);
        value.textContent = option.recommended
          ? `${option.relativePath} - recommandé`
          : option.relativePath;
        value.title = option.relativePath;
        item.append(label, value);
        return item;
      })
    );

    if (suggestion.targetFolderSuggestion.options.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Aucune option exploitable.";
      list.append(item);
    }

    container.append(title, list);
    return container;
  }

  function createList(label: string, values: string[]): HTMLDivElement {
    const container = document.createElement("div");
    const title = document.createElement("strong");
    const list = document.createElement("ul");

    container.className = "suggestion-v2-list";
    title.textContent = label;
    list.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement("li");
        item.textContent = value;
        return item;
      })
    );
    container.append(title, list);
    return container;
  }

  function folderDepthLabel(label: RendererFolderDepthOption["label"]): string {
    switch (label) {
      case "court":
        return "Court";
      case "equilibre":
        return "Équilibré";
      case "detaille":
        return "Détaillé";
    }
  }

  function missingFieldLabel(field: SuggestionV2MissingField): string {
    switch (field) {
      case "dateToken":
        return "Date fiable";
      case "target":
        return "Cible";
      case "documentType":
        return "Type documentaire";
    }
  }

  function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  DocSorterSuggestionV2Panel = {
    createSuggestionV2Panel
  };
  globalThis.DocSorterSuggestionV2Panel = DocSorterSuggestionV2Panel;
})();
