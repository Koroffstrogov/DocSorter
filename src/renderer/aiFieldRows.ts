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
  knownTargets: KnownTargetsState;
  onKnownTargetSelect: (target: KnownTarget) => void;
  onKnownTargetCreate: (input: KnownTargetInput) => void;
  onKnownTargetUpdate: (id: string, input: KnownTargetInput) => void;
  onKnownTargetDeactivate: (id: string) => void;
}

interface AiFieldRowsApi {
  createSuggestionContent: (state: AiState, options: AiFieldRowsOptions) => Node[];
  getFieldCandidates: (suggestion: RendererAiDocumentSuggestion | null, key: AiCandidateFieldKey) => AiCandidateView[];
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
    const badge = document.createElement("span");
    const selected = document.createElement("p");
    const candidateLine = document.createElement("div");
    const editButton = document.createElement("button");
    const manualInput = document.createElement("input");
    const fieldCandidates = getFieldCandidates(suggestion, key);
    const selectedScore = aiFormatters.scoreForSelected(fieldCandidates, selectedValue);
    const isManual = Boolean(selection?.manualFields[key]);
    const isEditing = selection?.editingField === key;

    row.className = `ai-field-row ${key === "subject" ? "secondary" : ""} ${isManual ? "manual" : ""}`;
    title.className = "ai-field-title";
    labelElement.textContent = label;
    badge.className = "ai-field-badge manual";
    badge.textContent = "manuel";
    badge.hidden = !isManual;
    selected.textContent = selectedValue?.trim()
      ? `${selectedValue.trim()}${selectedScore === null ? "" : ` ${selectedScore}%`}`
      : emptyValueLabel(key);
    selected.title = selectedValue?.trim() || "";
    selected.className = selectedValue?.trim() ? "ai-field-selected" : "ai-field-selected empty";
    candidateLine.className = "ai-field-candidates";
    candidateLine.replaceChildren(
      selected,
      ...fieldCandidates
        .filter((candidate) => !isSelectedCandidate(candidate.value, selectedValue))
        .slice(0, 3)
        .map((candidate) =>
          createCandidateButton(candidate, selectedValue, () => {
            options.onFieldCandidateSelect(key, candidate.value);
          })
        )
    );
    if (isOptionalField(key) && suggestion) {
      candidateLine.append(createEmptyCandidateButton(selectedValue, () => {
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

    title.append(labelElement, badge);
    row.append(title, candidateLine, editButton);
    if (isEditing && key === "target") {
      row.append(createKnownTargetPicker(selectedValue, options));
    } else if (isEditing) {
      manualInput.type = "text";
      manualInput.className = "ai-field-manual-input";
      manualInput.value = selectedValue ?? "";
      manualInput.placeholder = key === "dateToken" ? "AAAA, AAAA-MM ou AAAA-MM-JJ" : key === "issuer" || key === "detail" ? "Optionnel" : "Valeur";
      manualInput.addEventListener("input", () => {
        row.classList.add("manual");
        badge.className = "ai-field-badge manual";
        badge.textContent = "manuel";
        badge.hidden = false;
        selected.textContent = manualInput.value.trim() || emptyValueLabel(key);
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

  function createKnownTargetPicker(
    selectedValue: string | undefined,
    options: AiFieldRowsOptions
  ): HTMLElement {
    const panel = document.createElement("div");
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    const status = document.createElement("span");
    const search = document.createElement("input");
    const list = document.createElement("div");
    const freeBlock = document.createElement("div");
    const freeButton = document.createElement("button");
    const freeInput = document.createElement("input");
    const manager = document.createElement("details");
    const managerSummary = document.createElement("summary");
    const managerForm = document.createElement("div");
    const displayNameInput = document.createElement("input");
    const kindSelect = document.createElement("select");
    const fileAliasInput = document.createElement("input");
    const aliasesInput = document.createElement("input");
    const saveButton = document.createElement("button");
    const resetButton = document.createElement("button");
    let editingTargetId = "";

    panel.className = "known-target-picker";
    heading.className = "known-target-picker-heading";
    title.textContent = "Choisir une cible connue";
    status.className = `known-target-status ${options.knownTargets.status}`;
    status.textContent = knownTargetsStatusLabel(options.knownTargets);
    heading.append(title, status);

    search.type = "search";
    search.className = "known-target-search";
    search.placeholder = "Rechercher une cible";
    search.autocomplete = "off";

    list.className = "known-target-list";

    freeBlock.className = "known-target-free";
    freeButton.type = "button";
    freeButton.textContent = "Saisie libre";
    freeButton.addEventListener("click", () => {
      freeInput.focus();
      freeInput.setSelectionRange(freeInput.value.length, freeInput.value.length);
    });
    freeInput.type = "text";
    freeInput.value = selectedValue ?? "";
    freeInput.placeholder = "Cible libre, ex. paul";
    freeInput.autocomplete = "off";
    freeInput.addEventListener("input", () => {
      options.onFieldManualValueChange("target", freeInput.value);
    });
    freeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        freeInput.blur();
      }
    });
    freeInput.addEventListener("blur", options.onFieldManualEditFinish);
    freeBlock.append(freeButton, freeInput);

    manager.className = "known-target-manager";
    managerSummary.textContent = "Gérer la liste";
    displayNameInput.type = "text";
    displayNameInput.placeholder = "Nom affiché, ex. Paul Martin";
    fileAliasInput.type = "text";
    fileAliasInput.placeholder = "Alias fichier, ex. paul";
    aliasesInput.type = "text";
    aliasesInput.placeholder = "Alias de détection, séparés par virgules";
    kindSelect.replaceChildren(
      ...KNOWN_TARGET_KIND_ORDER.map((kind) => {
        const option = document.createElement("option");
        option.value = kind;
        option.textContent = knownTargetKindLabel(kind);
        return option;
      })
    );
    saveButton.type = "button";
    saveButton.className = "known-target-save";
    saveButton.textContent = "Ajouter";
    saveButton.addEventListener("click", () => {
      const input = readKnownTargetForm(kindSelect, displayNameInput, fileAliasInput, aliasesInput);
      if (editingTargetId) {
        options.onKnownTargetUpdate(editingTargetId, input);
      } else {
        options.onKnownTargetCreate(input);
      }
    });
    resetButton.type = "button";
    resetButton.textContent = "Nouvelle cible";
    resetButton.addEventListener("click", () => {
      editingTargetId = "";
      saveButton.textContent = "Ajouter";
      displayNameInput.value = "";
      fileAliasInput.value = "";
      aliasesInput.value = "";
      kindSelect.value = "person";
      displayNameInput.focus();
    });

    managerForm.className = "known-target-form";
    managerForm.append(
      createKnownTargetFormLabel("Nom affiché", displayNameInput),
      createKnownTargetFormLabel("Type", kindSelect),
      createKnownTargetFormLabel("Alias nom", fileAliasInput),
      createKnownTargetFormLabel("Alias reconnus", aliasesInput),
      saveButton,
      resetButton
    );
    manager.append(managerSummary, managerForm);

    function renderTargetList(): void {
      const query = normalizeTargetSearch(search.value);
      const activeTargets = options.knownTargets.targets
        .filter((target) => target.isActive)
        .filter((target) => targetMatchesSearch(target, query));
      if (activeTargets.length === 0) {
        const empty = document.createElement("p");
        empty.className = "known-target-empty";
        empty.textContent = options.knownTargets.status === "loading"
          ? "Chargement des cibles locales..."
          : "Aucune cible active.";
        list.replaceChildren(empty);
        return;
      }

      const groups = KNOWN_TARGET_KIND_ORDER.flatMap((kind) => {
        const targets = activeTargets.filter((target) => target.kind === kind);
        if (targets.length === 0) {
          return [];
        }

        const section = document.createElement("section");
        const groupTitle = document.createElement("strong");
        groupTitle.textContent = knownTargetKindLabel(kind);
        section.append(groupTitle, ...targets.map((target) => createKnownTargetRow(target)));
        return [section];
      });
      list.replaceChildren(...groups);
    }

    function createKnownTargetRow(target: KnownTarget): HTMLElement {
      const row = document.createElement("div");
      const choose = document.createElement("button");
      const meta = document.createElement("span");
      const edit = document.createElement("button");
      const deactivate = document.createElement("button");

      row.className = "known-target-row";
      choose.type = "button";
      choose.className = "known-target-choice";
      choose.textContent = `${target.displayName} -> ${target.fileAlias}`;
      choose.title = `Utiliser ${target.fileAlias} dans le nom final`;
      choose.addEventListener("click", () => {
        options.onKnownTargetSelect(target);
      });
      meta.textContent = target.aliases.length ? target.aliases.join(", ") : "";
      edit.type = "button";
      edit.textContent = "Modifier";
      edit.addEventListener("click", () => {
        editingTargetId = target.id;
        manager.open = true;
        saveButton.textContent = "Mettre à jour";
        displayNameInput.value = target.displayName;
        fileAliasInput.value = target.fileAlias;
        aliasesInput.value = target.aliases.join(", ");
        kindSelect.value = target.kind;
        displayNameInput.focus();
      });
      deactivate.type = "button";
      deactivate.textContent = "Désactiver";
      deactivate.addEventListener("click", () => {
        const confirmed = window.confirm(`Désactiver la cible "${target.displayName}" ?`);
        if (confirmed) {
          options.onKnownTargetDeactivate(target.id);
        }
      });
      row.append(choose, meta, edit, deactivate);
      return row;
    }

    search.addEventListener("input", renderTargetList);
    renderTargetList();

    panel.append(heading, search, list, freeBlock, manager);
    window.setTimeout(() => {
      search.focus();
    }, 0);
    return panel;
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
    button.textContent = `${candidate.value} ${candidate.score}%`;
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
    button.textContent = "aucun";
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
    const candidates = normalizeCandidates(response?.fields?.[key]?.candidates ?? []);
    if (key !== "subject") {
      return candidates;
    }

    return candidates.filter((candidate) => !isRedundantSubjectCandidate(candidate.value, suggestion, response));
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

  function isSelectedCandidate(value: string, selectedValue: string | undefined): boolean {
    return Boolean(
      selectedValue?.trim() &&
      value.trim().toLowerCase() === selectedValue.trim().toLowerCase()
    );
  }

  function emptyValueLabel(key: AiCandidateFieldKey): string {
    if (key === "subject") {
      return "non utilisé";
    }

    return isOptionalField(key) ? "aucun" : "à compléter";
  }

  function isOptionalField(key: AiCandidateFieldKey): boolean {
    return key === "subject" || key === "issuer" || key === "detail";
  }

  function isRedundantSubjectCandidate(
    value: string,
    suggestion: RendererAiDocumentSuggestion | null,
    response: AiMultiCandidateResponseView | null
  ): boolean {
    const normalized = normalizeCandidateBlock(value);
    if (!normalized) {
      return true;
    }

    const blockers = [
      suggestion?.suggestion.target,
      suggestion?.suggestion.documentType,
      suggestion?.suggestion.issuer,
      suggestion?.suggestion.detail,
      response?.fields?.target?.selected,
      response?.fields?.documentType?.selected,
      response?.fields?.issuer?.selected,
      response?.fields?.detail?.selected
    ];

    return blockers.some((blocker) => areCandidateBlocksRedundant(normalized, blocker));
  }

  function areCandidateBlocksRedundant(normalizedValue: string, blocker: string | undefined): boolean {
    const normalizedBlocker = normalizeCandidateBlock(blocker ?? "");
    if (!normalizedBlocker) {
      return false;
    }

    if (normalizedValue === normalizedBlocker) {
      return true;
    }

    const valueTokens = new Set(normalizedValue.split("-").filter(Boolean));
    const blockerTokens = new Set(normalizedBlocker.split("-").filter(Boolean));
    if (valueTokens.size === 0 || blockerTokens.size === 0) {
      return false;
    }

    return isSubset(valueTokens, blockerTokens) || isSubset(blockerTokens, valueTokens);
  }

  function isSubset(left: Set<string>, right: Set<string>): boolean {
    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }

    return true;
  }

  function normalizeCandidateBlock(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const KNOWN_TARGET_KIND_ORDER: KnownTargetKind[] = [
    "person",
    "household",
    "vehicle",
    "property",
    "other"
  ];

  function knownTargetKindLabel(kind: KnownTargetKind): string {
    switch (kind) {
      case "person":
        return "Personnes";
      case "household":
        return "Foyer";
      case "vehicle":
        return "Véhicules";
      case "property":
        return "Biens";
      case "other":
        return "Autres";
    }
  }

  function knownTargetsStatusLabel(state: KnownTargetsState): string {
    if (state.status === "loading") {
      return "chargement";
    }
    if (state.status === "saving") {
      return "sauvegarde";
    }
    if (state.status === "error") {
      return state.error || "liste indisponible";
    }
    if (state.warnings.length > 0) {
      return state.warnings[0];
    }
    return `${state.targets.filter((target) => target.isActive).length} cible(s) active(s)`;
  }

  function createKnownTargetFormLabel(labelText: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement("label");
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelText;
    label.append(labelSpan, control);
    return label;
  }

  function readKnownTargetForm(
    kindSelect: HTMLSelectElement,
    displayNameInput: HTMLInputElement,
    fileAliasInput: HTMLInputElement,
    aliasesInput: HTMLInputElement
  ): KnownTargetInput {
    return {
      kind: readKnownTargetKind(kindSelect.value),
      displayName: displayNameInput.value,
      fileAlias: fileAliasInput.value,
      aliases: splitKnownTargetAliases(aliasesInput.value),
      isActive: true
    };
  }

  function splitKnownTargetAliases(value: string): string[] {
    return value
      .split(/[,;\r\n]+/)
      .map((alias) => alias.trim())
      .filter(Boolean);
  }

  function readKnownTargetKind(value: string): KnownTargetKind {
    return KNOWN_TARGET_KIND_ORDER.includes(value as KnownTargetKind)
      ? value as KnownTargetKind
      : "other";
  }

  function targetMatchesSearch(target: KnownTarget, normalizedQuery: string): boolean {
    if (!normalizedQuery) {
      return true;
    }

    return [
      target.displayName,
      target.fileAlias,
      ...target.aliases
    ].some((value) => normalizeTargetSearch(value).includes(normalizedQuery));
  }

  function normalizeTargetSearch(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  globalThis.DocSorterAiFieldRows = {
    createSuggestionContent,
    getFieldCandidates,
    getFolderCandidates
  };
})();
