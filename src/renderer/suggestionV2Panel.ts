interface SuggestionV2PanelState {
  activeDocument: DocumentItem | null;
  suggestionState: SuggestionV2DocumentState | null;
}

interface SuggestionV2PanelOptions {
  root?: ParentNode;
  getState: () => SuggestionV2PanelState;
  onAnalyzeDocument?: () => void;
  onRunDiagnostic?: () => void;
  onRunAiDiagnostic?: () => void;
  isAiDiagnosticAvailable?: () => boolean;
  isAnalyzeDisabled?: () => boolean;
}

interface SuggestionV2PanelApi {
  render: () => void;
}

interface SuggestionV2PanelElements {
  panel: HTMLElement | null;
  details: HTMLElement | null;
  analyzeButton: HTMLButtonElement | null;
  diagnosticPanel: HTMLDetailsElement | null;
  diagnosticMode: HTMLElement | null;
  diagnosticResult: HTMLElement | null;
  diagnosticButton: HTMLButtonElement | null;
  aiDiagnosticButton: HTMLButtonElement | null;
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

    elements.analyzeButton?.addEventListener("click", () => {
      options.onAnalyzeDocument?.();
    });

    elements.diagnosticButton?.addEventListener("click", () => {
      options.onRunDiagnostic?.();
    });

    elements.aiDiagnosticButton?.addEventListener("click", () => {
      options.onRunAiDiagnostic?.();
    });

    function render(): void {
      if (!elements.panel || !elements.details) {
        return;
      }

      const { activeDocument, suggestionState } = options.getState();
      elements.panel.hidden = !activeDocument;
      const state = suggestionState ?? createIdleSuggestionV2DocumentState();
      const busy = state.status === "loading" || state.diagnosticStatus === "running";
      const diagnosticBusy = state.diagnosticStatus === "running";
      if (elements.analyzeButton) {
        elements.analyzeButton.disabled = !activeDocument || busy || Boolean(options.isAnalyzeDisabled?.());
        elements.analyzeButton.textContent = state.status === "loading"
          ? "Analyse..."
          : "Analyser le document";
      }
      if (elements.diagnosticButton) {
        elements.diagnosticButton.disabled = !activeDocument || diagnosticBusy;
        elements.diagnosticButton.textContent = diagnosticBusy
          ? "Diagnostic..."
          : "Diagnostic suggestions";
      }
      if (elements.aiDiagnosticButton) {
        const aiAvailable = options.isAiDiagnosticAvailable?.() ?? false;
        elements.aiDiagnosticButton.disabled = !activeDocument || diagnosticBusy || !aiAvailable;
        elements.aiDiagnosticButton.textContent = diagnosticBusy
          ? "Diagnostic IA..."
          : "Diagnostic IA";
      }
      renderDiagnosticBlock(elements, activeDocument, state);
      if (!activeDocument) {
        elements.details.replaceChildren();
        return;
      }

      if (state.status === "loading") {
        elements.details.replaceChildren(
          createProposalPlaceholder("analyse", "Analyse locale du document en cours.")
        );
        return;
      }

      if (state.status === "error") {
        elements.details.replaceChildren(
          createProposalPlaceholder("erreur", state.error?.message ?? "Proposition de tri indisponible.")
        );
        return;
      }

      if (state.status === "idle" || !state.result) {
        elements.details.replaceChildren(
          createProposalPlaceholder("en attente", "Cliquez sur Analyser le document.")
        );
        return;
      }

      elements.details.replaceChildren(createSuggestionSummary(state.result));
    }

    return { render };
  }

  function getSuggestionV2PanelElements(root: ParentNode): SuggestionV2PanelElements {
    return {
      panel: root.querySelector<HTMLElement>("#suggestion-v2-panel"),
      details: root.querySelector<HTMLElement>("#suggestion-v2-details"),
      analyzeButton: root.querySelector<HTMLButtonElement>("#analyze-document-v2"),
      diagnosticPanel: root.querySelector<HTMLDetailsElement>("#suggestion-v2-diagnostic-panel"),
      diagnosticMode: root.querySelector<HTMLElement>("#suggestion-v2-diagnostic-mode"),
      diagnosticResult: root.querySelector<HTMLElement>("#suggestion-v2-diagnostic-result"),
      diagnosticButton: root.querySelector<HTMLButtonElement>("#run-suggestion-v2-diagnostic"),
      aiDiagnosticButton: root.querySelector<HTMLButtonElement>("#run-suggestion-v2-ai-diagnostic")
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
      createShortReasons(suggestion),
      createShortAlerts(suggestion),
      createLongDetails(suggestion)
    );

    return container;
  }

  function renderDiagnosticBlock(
    elements: SuggestionV2PanelElements,
    activeDocument: DocumentItem | null,
    state: SuggestionV2DocumentState
  ): void {
    if (elements.diagnosticMode) {
      elements.diagnosticMode.textContent = `Mode : ${activeDocument ? diagnosticModeForDocument(activeDocument) : "expurgé"}`;
    }

    if (!elements.diagnosticResult) {
      return;
    }

    if (!activeDocument || state.diagnosticStatus === "idle") {
      elements.diagnosticResult.replaceChildren();
      return;
    }

    if (state.diagnosticStatus === "running") {
      elements.diagnosticResult.replaceChildren("Diagnostic en cours...");
      return;
    } else if (state.diagnosticStatus === "error") {
      elements.diagnosticResult.replaceChildren(
        state.diagnosticError?.message ?? "Diagnostic indisponible."
      );
      return;
    }

    const result = state.diagnosticResult;
    if (!result) {
      elements.diagnosticResult.replaceChildren("Diagnostic exporté.");
      return;
    }

    const pathLine = document.createElement("p");
    const copyButton = document.createElement("button");
    const handoff = document.createElement("p");
    pathLine.textContent = `${diagnosticKindLabel(result.diagnosticKind)} - ${diagnosticModeLabel(result.mode)} : ${result.diagnosticPath}`;
    pathLine.title = result.diagnosticPath;
    copyButton.type = "button";
    copyButton.textContent = "Copier le chemin";
    copyButton.disabled = !canCopyToClipboard();
    copyButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(result.diagnosticPath);
    });
    handoff.textContent = "À transmettre pour analyse.";
    elements.diagnosticResult.replaceChildren(pathLine, copyButton, handoff);
  }

  function createHeader(suggestion: RendererSuggestionV2DocumentSuggestion): HTMLDivElement {
    const header = document.createElement("div");
    const nameLabel = document.createElement("span");
    const name = document.createElement("strong");
    const confidence = document.createElement("small");
    const status = document.createElement("small");

    header.className = "suggestion-v2-header";
    nameLabel.textContent = "Nom v2";
    name.textContent = suggestion.draft.proposedName ?? "non généré";
    name.title = suggestion.draft.proposedName ?? suggestion.message;
    confidence.textContent = `Confiance : ${suggestion.draft.confidence} %`;
    status.textContent = `État : ${suggestion.missingFields.length > 0 ? "incomplet" : "prêt"}`;
    header.append(nameLabel, name, status, confidence);
    return header;
  }

  function createProposalPlaceholder(status: string, messageText: string): HTMLDivElement {
    const container = document.createElement("div");
    const statusLine = document.createElement("span");
    const name = document.createElement("strong");
    const message = document.createElement("p");
    container.className = "suggestion-v2-placeholder";
    statusLine.textContent = `État : ${status}`;
    name.textContent = "Nom proposé : non généré";
    message.textContent = messageText;
    container.append(statusLine, name, message);
    return container;
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

  function createShortReasons(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement | DocumentFragment {
    const reasons = uniqueStrings([
      ...(suggestion.folderPlacement?.reasons ?? []),
      ...(suggestion.targetFolderSuggestion.recommended?.reasons ?? []),
      ...suggestion.targetFolderSuggestion.reasons,
      ...suggestion.draft.reasons
    ]).slice(0, 3);

    return reasons.length > 0 ? createList("Raisons courtes", reasons) : document.createDocumentFragment();
  }

  function createShortAlerts(
    suggestion: RendererSuggestionV2DocumentSuggestion
  ): HTMLDivElement | DocumentFragment {
    const alerts = uniqueStrings([
      ...suggestion.draft.warnings,
      ...suggestion.targetFolderSuggestion.warnings,
      ...(suggestion.folderPlacement?.warnings ?? []),
      ...(suggestion.folderNamingProfile?.warnings ?? []),
      ...suggestion.referenceDataWarnings,
      ...suggestion.missingFields.map(missingFieldLabel)
    ]).slice(0, 4);

    return alerts.length > 0 ? createList("Alertes importantes", alerts) : document.createDocumentFragment();
  }

  function createLongDetails(suggestion: RendererSuggestionV2DocumentSuggestion): HTMLDetailsElement {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const content = document.createElement("div");
    details.className = "suggestion-v2-long-details";
    summary.textContent = "Voir détails";
    content.className = "suggestion-v2-long-details-content";
    content.append(
      createFieldGrid(suggestion),
      createFolderReasons(suggestion),
      createDepthOptions(suggestion),
      createNamingProfile(suggestion)
    );

    if (suggestion.missingFields.length > 0) {
      content.append(createList("Champs manquants", suggestion.missingFields.map(missingFieldLabel)));
    }

    const warnings = uniqueStrings([
      ...suggestion.draft.warnings,
      ...suggestion.targetFolderSuggestion.warnings,
      ...(suggestion.folderPlacement?.warnings ?? []),
      ...(suggestion.folderNamingProfile?.warnings ?? []),
      ...suggestion.referenceDataWarnings
    ]);
    if (warnings.length > 0) {
      content.append(createList("Toutes les alertes", warnings));
    }

    const reasons = uniqueStrings([
      ...suggestion.draft.reasons,
      ...suggestion.targetFolderSuggestion.reasons
    ]);
    if (reasons.length > 0) {
      content.append(createList("Toutes les raisons", reasons));
    }

    details.append(summary, content);
    return details;
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

  function diagnosticModeLabel(mode: RendererSuggestionV2DiagnosticResult["mode"]): string {
    return mode === "diagnosticComplet" ? "diagnostic complet" : "diagnostic expurgé";
  }

  function diagnosticKindLabel(kind: RendererSuggestionV2DiagnosticResult["diagnosticKind"]): string {
    return kind === "ai" ? "Diagnostic IA" : "Diagnostic suggestions";
  }

  function diagnosticModeForDocument(documentItem: DocumentItem): string {
    return isTxxDiagnosticDocumentName(documentItem.name) ? "complet" : "expurgé";
  }

  function isTxxDiagnosticDocumentName(documentName: string): boolean {
    const basename = documentName.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? documentName;
    return /^T[0-9][0-9]-/.test(basename.trimStart());
  }

  function canCopyToClipboard(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText);
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
