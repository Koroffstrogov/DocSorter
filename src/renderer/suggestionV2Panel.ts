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
      createRecommendedFolder(suggestion),
      createFieldGrid(suggestion),
      createFolderReasons(suggestion),
      createDepthOptions(suggestion)
    );
    container.append(createNamingProfile(suggestion));

    if (suggestion.missingFields.length > 0) {
      container.append(createList("Champs manquants", suggestion.missingFields.map(missingFieldLabel)));
    }

    const warnings = uniqueStrings([
      ...suggestion.draft.warnings,
      ...suggestion.targetFolderSuggestion.warnings,
      ...(suggestion.folderPlacement?.warnings ?? []),
      ...(suggestion.folderNamingProfile?.warnings ?? []),
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
    name.textContent = suggestion.draft.proposedName ?? "non généré";
    name.title = suggestion.draft.proposedName ?? suggestion.message;
    confidence.textContent = `Confiance : ${suggestion.draft.confidence} %`;
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
    const meta = document.createElement("small");
    const recommended = suggestion.targetFolderSuggestion.recommended;
    const placement = suggestion.folderPlacement;
    const confidence = placement?.confidence ?? recommended?.confidence;

    container.className = "suggestion-v2-folder";
    label.textContent = "Dossier recommandé";
    value.textContent = placement?.relativePath ?? recommended?.relativePath ?? "Aucun dossier recommandé";
    value.title = value.textContent;
    meta.textContent = [
      placement ? `Source : ${folderPlacementSourceLabel(placement)}` : null,
      confidence !== undefined ? `Confiance : ${confidence} %` : null
    ].filter(Boolean).join(" · ");
    container.append(label, value);
    if (meta.textContent) {
      container.append(meta);
    }
    return container;
  }

  function createFolderReasons(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement | DocumentFragment {
    const reasons = uniqueStrings([
      ...(suggestion.folderPlacement?.reasons ?? []),
      ...(suggestion.targetFolderSuggestion.recommended?.reasons ?? []),
      ...suggestion.targetFolderSuggestion.reasons
    ]);

    if (reasons.length === 0) {
      return document.createDocumentFragment();
    }

    return createList("Raisons dossier", reasons);
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
        value.textContent = formatFolderOption(option);
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

  function createNamingProfile(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement {
    const container = document.createElement("div");
    const title = document.createElement("strong");
    const description = document.createElement("p");
    const profile = suggestion.folderNamingProfile;

    container.className = "suggestion-v2-profile";
    title.textContent = "Profil de nommage";

    if (profile?.status === "detected" && profile.conventionExample) {
      description.textContent = `Convention du dossier : ${profile.conventionExample}`;
      description.title = description.textContent;
      container.append(title, description, createProfileMeta(profile));
      if (profile.warnings.length > 0) {
        container.append(createInlineList(profile.warnings));
      }
      return container;
    }

    description.textContent = "Aucun profil fiable détecté";
    container.append(title, description);
    return container;
  }

  function createProfileMeta(profile: RendererSuggestionV2FolderNamingProfile): HTMLElement {
    const meta = document.createElement("small");
    meta.textContent = `${profile.v2FileCount} nom(s) v2 conforme(s) · confiance : ${profile.confidence} %`;
    return meta;
  }

  function createInlineList(values: string[]): HTMLUListElement {
    const list = document.createElement("ul");
    list.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement("li");
        item.textContent = value;
        return item;
      })
    );
    return list;
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

  function folderPlacementSourceLabel(placement: RendererSuggestionV2FolderPlacement): string {
    if (placement.source === "inventory" && placement.exists) {
      return "dossier existant";
    }

    if (placement.source === "fallback") {
      return "fallback manuel";
    }

    return "inventaire";
  }

  function folderOptionSourceLabel(source: RendererFolderDepthOption["source"]): string {
    switch (source) {
      case "existing-folder":
        return "dossier existant";
      case "preference":
        return "préférence";
      case "fallback":
        return "fallback";
      case "rules-v2":
        return "règle v2";
    }
  }

  function formatFolderOption(option: RendererFolderDepthOption): string {
    return [
      option.relativePath,
      option.recommended ? "recommandé" : "",
      folderOptionSourceLabel(option.source),
      option.requiresCreation ? "création non automatique" : ""
    ].filter(Boolean).join(" - ");
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
