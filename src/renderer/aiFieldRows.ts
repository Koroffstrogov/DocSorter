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

interface AiFieldRowsOptions {
  formatDate: (isoDate: string) => string;
  onFieldCandidateSelect: (field: AiSelectionFieldKey, value: string) => void;
  onFieldManualEditStart: (field: AiSelectionFieldKey) => void;
  onFieldManualValueChange: (field: AiSelectionFieldKey, value: string) => void;
  onFieldManualEditFinish: () => void;
}

interface AiFieldRowsApi {
  createSuggestionContent: (state: AiState, options: AiFieldRowsOptions) => Node[];
  getFolderCandidates: (suggestion: RendererAiDocumentSuggestion | null) => AiCandidateView[];
}

interface Window {
  DocSorterAiFieldRows: AiFieldRowsApi;
}

var DocSorterAiFieldRows: AiFieldRowsApi;

(() => {
  const aiFormatters = DocSorterAiPanelFormatters;

  function createSuggestionContent(state: AiState, options: AiFieldRowsOptions): Node[] {
    const container = document.createElement("div");
    container.className = "field-refinement-list";

    if (state.panelStatus === "analyzing") {
      const empty = document.createElement("p");
      empty.className = "compact-empty-state";
      empty.textContent = "Analyse IA en cours. Les choix par champ apparaîtront ici.";
      container.append(empty);
      return [container];
    } else if (!state.suggestion) {
      const empty = document.createElement("p");
      empty.className = "compact-empty-state";
      empty.textContent = "Analyse IA requise pour afficher les choix par champ.";
      container.append(empty);
      return [container];
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

  function createAiFieldRows(state: AiState, options: AiFieldRowsOptions): HTMLElement {
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
    options: AiFieldRowsOptions
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
    const selectedScore = aiFormatters.scoreForSelected(fieldCandidates, selectedValue);
    const isManual = Boolean(selection?.manualFields[key]);
    const isEditing = selection?.editingField === key;

    row.className = `ai-field-row ${isManual ? "manual" : ""}`;
    title.className = "ai-field-title";
    labelElement.textContent = label;
    scoreElement.textContent = selectedScore === null ? "Score non disponible" : `Score ${selectedScore}`;
    badge.className = `ai-field-badge ${isManual ? "manual" : "candidate"}`;
    badge.textContent = isManual ? "manuel" : "IA";
    selected.textContent = selectedValue?.trim()
      ? `${selectedValue.trim()}${selectedScore === null ? "" : ` ${selectedScore}%`}`
      : "à compléter";
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
    editButton.className = "ai-field-edit";
    editButton.textContent = "✎";
    editButton.disabled = !suggestion;
    editButton.setAttribute("aria-label", `Modifier ${label.toLowerCase()} localement`);
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
        selected.textContent = manualInput.value.trim() || "à compléter";
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

  globalThis.DocSorterAiFieldRows = {
    createSuggestionContent,
    getFolderCandidates
  };
})();
