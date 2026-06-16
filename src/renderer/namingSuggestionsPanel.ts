interface NamingSuggestionsPanelState {
  activeDocument: DocumentItem | null;
  extractionState: TextExtractionDocumentState | null;
  suggestionState: NamingSuggestionDocumentState | null;
}

interface NamingSuggestionsPanelOptions {
  root?: ParentNode;
  getState: () => NamingSuggestionsPanelState;
  canAnalyze: (documentItem?: DocumentItem | null) => boolean;
  canApplyToEmptyFields: () => boolean;
  canApplyTargetFolderSuggestion: () => boolean;
  onAnalyze: () => void;
  onApplyToEmptyFields: () => void;
  onApplyTargetFolderSuggestion: () => void;
}

interface NamingSuggestionsPanelApi {
  render: () => void;
}

interface NamingSuggestionsPanelElements {
  panel: HTMLElement | null;
  analyzeButton: HTMLButtonElement | null;
  details: HTMLElement | null;
  applyTargetFolderButton: HTMLButtonElement | null;
  applyEmptyButton: HTMLButtonElement | null;
}

interface NamingSuggestionsPanelFactoryApi {
  createNamingSuggestionsPanel: (
    options: NamingSuggestionsPanelOptions
  ) => NamingSuggestionsPanelApi;
}

interface Window {
  DocSorterNamingSuggestionsPanel: NamingSuggestionsPanelFactoryApi;
}

var DocSorterNamingSuggestionsPanel: NamingSuggestionsPanelFactoryApi;

(() => {
  function createNamingSuggestionsPanel(
    options: NamingSuggestionsPanelOptions
  ): NamingSuggestionsPanelApi {
    const elements = getNamingSuggestionsPanelElements(options.root ?? document);

    elements.analyzeButton?.addEventListener("click", () => {
      options.onAnalyze();
    });

    elements.applyEmptyButton?.addEventListener("click", () => {
      options.onApplyToEmptyFields();
    });

    elements.applyTargetFolderButton?.addEventListener("click", () => {
      options.onApplyTargetFolderSuggestion();
    });

    function render(): void {
      if (!elements.panel || !elements.details) {
        return;
      }

      const { activeDocument, extractionState, suggestionState } = options.getState();
      if (!activeDocument || activeDocument.extension !== ".pdf") {
        elements.panel.hidden = true;
        elements.details.replaceChildren();
        return;
      }

      elements.panel.hidden = false;
      if (elements.analyzeButton) {
        elements.analyzeButton.disabled = !options.canAnalyze(activeDocument);
      }

      if (elements.applyEmptyButton) {
        elements.applyEmptyButton.disabled = !options.canApplyToEmptyFields();
      }

      if (elements.applyTargetFolderButton) {
        const hasTargetFolder = Boolean(suggestionState?.suggestions?.targetFolder);
        elements.applyTargetFolderButton.hidden = !hasTargetFolder;
        elements.applyTargetFolderButton.disabled =
          !hasTargetFolder || !options.canApplyTargetFolderSuggestion();
      }

      if (!extractionState || extractionState.status === "idle") {
        elements.details.replaceChildren("Extrais le texte PDF pour obtenir des suggestions locales.");
        return;
      }

      if (extractionState.status === "extracting") {
        elements.details.replaceChildren("Extraction du texte en cours...");
        return;
      }

      if (extractionState.status === "error") {
        elements.details.replaceChildren("Texte PDF indisponible pour les suggestions locales.");
        return;
      }

      if (extractionState.status === "empty" || !extractionState.result?.excerpt.trim()) {
        elements.details.replaceChildren("Aucune suggestion disponible : aucun texte exploitable détecté.");
        return;
      }

      if (!suggestionState || suggestionState.status === "idle") {
        elements.details.replaceChildren(
          "Texte extrait disponible. Lance l'analyse locale pour préparer des suggestions."
        );
        return;
      }

      if (suggestionState.status === "empty" || !suggestionState.suggestions) {
        elements.details.replaceChildren(
          suggestionState.message || "Aucune suggestion locale exploitable détectée."
        );
        return;
      }

      elements.details.replaceChildren(
        createNamingSuggestionsSummary(suggestionState.suggestions, suggestionState.message)
      );
    }

    return {
      render
    };
  }

  function getNamingSuggestionsPanelElements(root: ParentNode): NamingSuggestionsPanelElements {
    return {
      panel: root.querySelector<HTMLElement>("#suggestions-panel"),
      analyzeButton: root.querySelector<HTMLButtonElement>("#analyze-suggestions"),
      details: root.querySelector<HTMLElement>("#suggestions-details"),
      applyTargetFolderButton: root.querySelector<HTMLButtonElement>(
        "#apply-target-folder-suggestion"
      ),
      applyEmptyButton: root.querySelector<HTMLButtonElement>("#apply-suggestions-empty")
    };
  }

  function createNamingSuggestionsSummary(
    suggestions: NamingSuggestions,
    message: string
  ): HTMLDivElement {
    const container = document.createElement("div");
    const confidence = document.createElement("div");
    const score = document.createElement("span");
    const source = document.createElement("span");

    container.className = "suggestion-summary";
    confidence.className = "suggestions-confidence";
    score.textContent = `Score ${formatSuggestionConfidence(suggestions.confidence)}`;
    source.textContent = "Règles locales par défaut";
    confidence.append(score, source);

    container.append(confidence, createSuggestionGrid(suggestions));

    if (message) {
      const messageElement = document.createElement("p");
      messageElement.textContent = message;
      container.append(messageElement);
    }

    if (suggestions.reasons.length > 0) {
      const reasons = document.createElement("ul");
      reasons.className = "suggestion-reasons";
      reasons.replaceChildren(
        ...suggestions.reasons.map((reason) => {
          const item = document.createElement("li");
          item.textContent = reason;
          return item;
        })
      );
      container.append(reasons);
    }

    return container;
  }

  function createSuggestionGrid(suggestions: NamingSuggestions): HTMLDListElement {
    const grid = document.createElement("dl");
    grid.className = "suggestion-grid";
    grid.append(
      createSuggestionRow("Date", suggestions.date),
      createSuggestionRow("Sujet", suggestions.subject),
      createSuggestionRow("Type", suggestions.documentType),
      createSuggestionRow("Dossier", suggestions.targetFolder),
      createSuggestionRow("Mots-clés", createKeywordsSuggestion(suggestions.keywords))
    );

    return grid;
  }

  function createSuggestionRow(
    label: string,
    suggestion: SuggestedNamingField | null
  ): HTMLDivElement {
    const row = document.createElement("div");
    const labelElement = document.createElement("dt");
    const valueElement = document.createElement("dd");

    labelElement.textContent = label;

    if (!suggestion) {
      valueElement.textContent = "Aucune suggestion";
    } else {
      const value = document.createElement("strong");
      const meta = document.createElement("small");
      value.textContent = suggestion.value;
      value.title = suggestion.reason;
      meta.textContent = `${formatSuggestionConfidence(suggestion.confidence)} - ${suggestionSourceLabel(
        suggestion.source
      )}`;
      valueElement.append(value, meta);
    }

    row.append(labelElement, valueElement);
    return row;
  }

  function createKeywordsSuggestion(keywords: SuggestedNamingField[]): SuggestedNamingField | null {
    if (keywords.length === 0) {
      return null;
    }

    const confidence =
      keywords.reduce((total, keyword) => total + keyword.confidence, 0) / keywords.length;
    const hasText = keywords.some(
      (keyword) => keyword.source === "text" || keyword.source === "filename+text"
    );
    const hasFilename = keywords.some(
      (keyword) => keyword.source === "filename" || keyword.source === "filename+text"
    );

    return {
      value: keywords.map((keyword) => keyword.value).join(" "),
      confidence,
      reason: "Mots-clés détectés localement.",
      source: sourceFromSuggestionBooleans(hasText, hasFilename)
    };
  }

  function formatSuggestionConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)} %`;
  }

  function suggestionSourceLabel(source: NamingSuggestionSource): string {
    switch (source) {
      case "text":
        return "texte extrait";
      case "filename":
        return "nom de fichier";
      case "filename+text":
        return "texte + nom";
    }
  }

  function sourceFromSuggestionBooleans(
    textMatch: boolean,
    filenameMatch: boolean
  ): NamingSuggestionSource {
    if (textMatch && filenameMatch) {
      return "filename+text";
    }

    return textMatch ? "text" : "filename";
  }

  DocSorterNamingSuggestionsPanel = {
    createNamingSuggestionsPanel
  };
  globalThis.DocSorterNamingSuggestionsPanel = DocSorterNamingSuggestionsPanel;
})();
