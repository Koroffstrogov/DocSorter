interface UserRuleListEntry {
  category: UserRuleEditorCategory;
  index: number;
  label: string;
  enabled: boolean;
}

interface RulesPanelOptions {
  root?: ParentNode;
  getState: () => NamingRulesState;
  onTogglePanel: () => void;
  onSubmitDraft: (draft: UserRuleEditorDraft) => void;
  onDraftChange: (draft: UserRuleEditorDraft) => void;
  onResetDraft: () => void;
  onSaveRules: () => void;
  onReloadRules: () => void;
  onEditRule: (category: UserRuleEditorCategory, index: number) => void;
  onDeleteRule: (category: UserRuleEditorCategory, index: number) => void;
}

interface RulesPanelApi {
  render: () => void;
}

interface RulesPanelElements {
  toggleButton: HTMLButtonElement | null;
  status: HTMLElement | null;
  editor: HTMLElement | null;
  userRulesList: HTMLOListElement | null;
  form: HTMLFormElement | null;
  categoryInput: HTMLSelectElement | null;
  idInput: HTMLInputElement | null;
  labelInput: HTMLInputElement | null;
  allOfInput: HTMLInputElement | null;
  anyOfInput: HTMLInputElement | null;
  noneOfInput: HTMLInputElement | null;
  documentTypeInput: HTMLInputElement | null;
  subjectInput: HTMLInputElement | null;
  keywordsInput: HTMLInputElement | null;
  confidenceInput: HTMLInputElement | null;
  enabledInput: HTMLInputElement | null;
  errors: HTMLUListElement | null;
  resetButton: HTMLButtonElement | null;
  saveDraftButton: HTMLButtonElement | null;
  saveRulesButton: HTMLButtonElement | null;
  reloadRulesButton: HTMLButtonElement | null;
}

interface RulesPanelFactoryApi {
  createRulesPanel: (options: RulesPanelOptions) => RulesPanelApi;
}

interface Window {
  DocSorterRulesPanel: RulesPanelFactoryApi;
}

var DocSorterRulesPanel: RulesPanelFactoryApi;

(() => {
  function createRulesPanel(options: RulesPanelOptions): RulesPanelApi {
    const elements = getRulesPanelElements(options.root ?? document);
    const draftInputs = [
      elements.categoryInput,
      elements.idInput,
      elements.labelInput,
      elements.allOfInput,
      elements.anyOfInput,
      elements.noneOfInput,
      elements.documentTypeInput,
      elements.subjectInput,
      elements.keywordsInput,
      elements.confidenceInput,
      elements.enabledInput
    ];

    elements.toggleButton?.addEventListener("click", () => {
      options.onTogglePanel();
    });

    elements.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      options.onSubmitDraft(readDraft(elements));
    });

    elements.resetButton?.addEventListener("click", () => {
      options.onResetDraft();
    });

    elements.saveRulesButton?.addEventListener("click", () => {
      options.onSaveRules();
    });

    elements.reloadRulesButton?.addEventListener("click", () => {
      options.onReloadRules();
    });

    draftInputs.forEach((input) => {
      input?.addEventListener("input", () => {
        options.onDraftChange(readDraft(elements));
      });
      input?.addEventListener("change", () => {
        options.onDraftChange(readDraft(elements));
      });
    });

    function render(): void {
      const state = options.getState();
      if (!elements.status || !elements.editor) {
        return;
      }

      if (elements.toggleButton) {
        elements.toggleButton.setAttribute("aria-expanded", String(state.panelOpen));
        elements.toggleButton.textContent = state.panelOpen ? "Masquer" : "Règles";
      }

      elements.editor.hidden = !state.panelOpen;
      elements.status.replaceChildren(...createStatusContent(state));
      renderUserRulesList(elements, state.userCatalog, options);
      syncForm(elements, state.draft);

      if (elements.errors) {
        elements.errors.replaceChildren(...state.draftErrors.map(createRuleErrorItem));
      }

      if (elements.saveDraftButton) {
        elements.saveDraftButton.textContent = state.editingTarget
          ? "Modifier la règle"
          : "Ajouter la règle";
        elements.saveDraftButton.disabled = state.panelStatus === "saving";
      }

      if (elements.saveRulesButton) {
        elements.saveRulesButton.disabled = state.panelStatus === "saving" || !state.dirty;
      }

      if (elements.reloadRulesButton) {
        elements.reloadRulesButton.disabled = state.panelStatus === "saving";
      }
    }

    return {
      render
    };
  }

  function getRulesPanelElements(root: ParentNode): RulesPanelElements {
    return {
      toggleButton: root.querySelector<HTMLButtonElement>("#toggle-rules-panel"),
      status: root.querySelector<HTMLElement>("#rules-status"),
      editor: root.querySelector<HTMLElement>("#rules-editor"),
      userRulesList: root.querySelector<HTMLOListElement>("#user-rules-list"),
      form: root.querySelector<HTMLFormElement>("#user-rule-form"),
      categoryInput: root.querySelector<HTMLSelectElement>("#user-rule-category"),
      idInput: root.querySelector<HTMLInputElement>("#user-rule-id"),
      labelInput: root.querySelector<HTMLInputElement>("#user-rule-label"),
      allOfInput: root.querySelector<HTMLInputElement>("#user-rule-all-of"),
      anyOfInput: root.querySelector<HTMLInputElement>("#user-rule-any-of"),
      noneOfInput: root.querySelector<HTMLInputElement>("#user-rule-none-of"),
      documentTypeInput: root.querySelector<HTMLInputElement>("#user-rule-document-type"),
      subjectInput: root.querySelector<HTMLInputElement>("#user-rule-subject"),
      keywordsInput: root.querySelector<HTMLInputElement>("#user-rule-keywords"),
      confidenceInput: root.querySelector<HTMLInputElement>("#user-rule-confidence"),
      enabledInput: root.querySelector<HTMLInputElement>("#user-rule-enabled"),
      errors: root.querySelector<HTMLUListElement>("#user-rule-errors"),
      resetButton: root.querySelector<HTMLButtonElement>("#reset-user-rule-form"),
      saveDraftButton: root.querySelector<HTMLButtonElement>("#save-user-rule-draft"),
      saveRulesButton: root.querySelector<HTMLButtonElement>("#save-user-rules"),
      reloadRulesButton: root.querySelector<HTMLButtonElement>("#reload-user-rules")
    };
  }

  function createStatusContent(state: NamingRulesState): Node[] {
    const lines: Node[] = [];
    const summary = document.createElement("strong");
    const detail = document.createElement("span");
    const pathLine = document.createElement("span");

    summary.textContent = statusLabel(state);
    detail.textContent = `${state.defaultRuleCount} règle${
      state.defaultRuleCount > 1 ? "s" : ""
    } par défaut, ${state.userRuleCount} règle${
      state.userRuleCount > 1 ? "s" : ""
    } utilisateur.`;
    pathLine.textContent = state.userRulesPath
      ? `Fichier local : ${state.userRulesPath}`
      : "Fichier local : initialisation en cours";
    pathLine.title = state.userRulesPath;
    lines.push(summary, detail, pathLine);

    if (state.warning) {
      const warning = document.createElement("span");
      warning.textContent = state.warning.message;
      lines.push(warning);
    }

    if (state.dirty) {
      const dirty = document.createElement("span");
      dirty.textContent = "Modifications non sauvegardées.";
      lines.push(dirty);
    }

    return lines;
  }

  function statusLabel(state: NamingRulesState): string {
    if (state.panelStatus === "loading") {
      return "Chargement des règles...";
    }

    if (state.panelStatus === "saving") {
      return "Sauvegarde des règles...";
    }

    if (state.panelStatus === "error") {
      return "Erreur règles utilisateur";
    }

    return state.message;
  }

  function renderUserRulesList(
    elements: RulesPanelElements,
    catalog: NamingSuggestionRulesCatalog,
    options: RulesPanelOptions
  ): void {
    if (!elements.userRulesList) {
      return;
    }

    const entries = getUserRuleEntries(catalog);
    if (entries.length === 0) {
      const item = document.createElement("li");
      const empty = document.createElement("span");
      empty.textContent = "Aucune règle utilisateur.";
      item.append(empty);
      elements.userRulesList.replaceChildren(item);
      return;
    }

    elements.userRulesList.replaceChildren(
      ...entries.map((entry) => createUserRuleListItem(entry, options))
    );
  }

  function createUserRuleListItem(
    entry: UserRuleListEntry,
    options: RulesPanelOptions
  ): HTMLLIElement {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    title.textContent = entry.label;
    title.title = entry.label;
    meta.textContent = `${categoryLabel(entry.category)} - ${entry.enabled ? "actif" : "inactif"}`;
    text.append(title, meta);

    editButton.type = "button";
    editButton.textContent = "Modifier";
    editButton.addEventListener("click", () => {
      options.onEditRule(entry.category, entry.index);
    });

    deleteButton.type = "button";
    deleteButton.textContent = "Supprimer";
    deleteButton.addEventListener("click", () => {
      options.onDeleteRule(entry.category, entry.index);
    });

    item.append(text, editButton, deleteButton);
    return item;
  }

  function getUserRuleEntries(catalog: NamingSuggestionRulesCatalog): UserRuleListEntry[] {
    return [
      ...catalog.documentTypeRules.map((rule, index) => ({
        category: "documentType" as const,
        index,
        label: rule.label,
        enabled: rule.enabled !== false
      })),
      ...catalog.subjectRules.map((rule, index) => ({
        category: "subject" as const,
        index,
        label: rule.label,
        enabled: rule.enabled !== false
      })),
      ...catalog.keywordRules.map((rule, index) => ({
        category: "keyword" as const,
        index,
        label: rule.label ?? rule.value,
        enabled: rule.enabled !== false
      }))
    ];
  }

  function readDraft(elements: RulesPanelElements): UserRuleEditorDraft {
    return {
      category: (elements.categoryInput?.value as UserRuleEditorCategory) ?? "documentType",
      id: elements.idInput?.value ?? "",
      label: elements.labelInput?.value ?? "",
      allOf: elements.allOfInput?.value ?? "",
      anyOf: elements.anyOfInput?.value ?? "",
      noneOf: elements.noneOfInput?.value ?? "",
      documentType: elements.documentTypeInput?.value ?? "",
      subject: elements.subjectInput?.value ?? "",
      keywords: elements.keywordsInput?.value ?? "",
      confidence: elements.confidenceInput?.value ?? "70",
      enabled: elements.enabledInput?.checked ?? true
    };
  }

  function syncForm(elements: RulesPanelElements, draft: UserRuleEditorDraft): void {
    if (elements.categoryInput) {
      elements.categoryInput.value = draft.category;
    }
    if (elements.idInput) {
      elements.idInput.value = draft.id;
    }
    if (elements.labelInput) {
      elements.labelInput.value = draft.label;
    }
    if (elements.allOfInput) {
      elements.allOfInput.value = draft.allOf;
    }
    if (elements.anyOfInput) {
      elements.anyOfInput.value = draft.anyOf;
    }
    if (elements.noneOfInput) {
      elements.noneOfInput.value = draft.noneOf;
    }
    if (elements.documentTypeInput) {
      elements.documentTypeInput.value = draft.documentType;
    }
    if (elements.subjectInput) {
      elements.subjectInput.value = draft.subject;
    }
    if (elements.keywordsInput) {
      elements.keywordsInput.value = draft.keywords;
    }
    if (elements.confidenceInput) {
      elements.confidenceInput.value = draft.confidence;
    }
    if (elements.enabledInput) {
      elements.enabledInput.checked = draft.enabled;
    }
  }

  function createRuleErrorItem(error: string): HTMLLIElement {
    const item = document.createElement("li");
    item.textContent = error;
    return item;
  }

  function categoryLabel(category: UserRuleEditorCategory): string {
    switch (category) {
      case "documentType":
        return "type";
      case "subject":
        return "sujet";
      case "keyword":
        return "mot-clé";
    }
  }

  DocSorterRulesPanel = {
    createRulesPanel
  };
  globalThis.DocSorterRulesPanel = DocSorterRulesPanel;
})();
