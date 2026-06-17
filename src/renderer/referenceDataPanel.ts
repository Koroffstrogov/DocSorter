interface ReferenceDataPanelOptions {
  root?: ParentNode;
  getState: () => ReferenceDataState;
  onClose: () => void;
  onOpenFolder: () => void;
  onCreateMissing: () => void;
  onReload: () => void;
  onSelectFile: (fileKey: ReferenceDataFileKey) => void;
  onModeChange: (mode: ReferenceDataPanelMode) => void;
  onJsonDraftChange: (fileKey: ReferenceDataFileKey, content: string) => void;
  onValidateJson: (fileKey: ReferenceDataFileKey) => void;
  onSaveJson: (fileKey: ReferenceDataFileKey) => void;
  onSimpleFieldChange: (field: keyof ReferenceDataSimpleDraft, value: string | boolean) => void;
  onSimpleNew: () => void;
  onSimpleEdit: (index: number) => void;
  onSimpleDisable: (index: number) => void;
  onSimpleApply: () => void;
}

interface ReferenceDataPanelElements {
  dialog: HTMLElement | null;
  closeButton: HTMLButtonElement | null;
  openFolderButton: HTMLButtonElement | null;
  createMissingButton: HTMLButtonElement | null;
  reloadButton: HTMLButtonElement | null;
  status: HTMLElement | null;
  basePath: HTMLElement | null;
  files: HTMLElement | null;
  modeSimpleButton: HTMLButtonElement | null;
  modeJsonButton: HTMLButtonElement | null;
  content: HTMLElement | null;
}

interface ReferenceDataPanelApi {
  render: () => void;
}

interface ReferenceDataFocusState {
  selector: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

interface ReferenceDataPanelFactoryApi {
  createReferenceDataPanel: (options: ReferenceDataPanelOptions) => ReferenceDataPanelApi;
}

interface Window {
  DocSorterReferenceDataPanel: ReferenceDataPanelFactoryApi;
}

var DocSorterReferenceDataPanel: ReferenceDataPanelFactoryApi;

(() => {
  function createReferenceDataPanel(options: ReferenceDataPanelOptions): ReferenceDataPanelApi {
    const elements = getReferenceDataPanelElements(options.root ?? document);

    elements.closeButton?.addEventListener("click", options.onClose);
    elements.openFolderButton?.addEventListener("click", options.onOpenFolder);
    elements.createMissingButton?.addEventListener("click", options.onCreateMissing);
    elements.reloadButton?.addEventListener("click", options.onReload);
    elements.modeSimpleButton?.addEventListener("click", () => options.onModeChange("simple"));
    elements.modeJsonButton?.addEventListener("click", () => options.onModeChange("json"));

    function render(): void {
      const state = options.getState();
      if (!elements.dialog || !elements.content) {
        return;
      }

      elements.dialog.hidden = !state.isOpen;
      if (!state.isOpen) {
        return;
      }

      const busy = state.status === "loading" || state.status === "saving" || state.status === "validating";
      renderStaticElements(elements, state, busy, options);
      const selectedFile = getSelectedFile(state);
      if (!selectedFile) {
        elements.content.replaceChildren("Référentiel non chargé.");
        return;
      }

      const focusState = captureReferenceDataFocus(elements.content);
      if (state.mode === "json" || selectedFile.key === "documentTypes") {
        elements.content.replaceChildren(createJsonView(state, selectedFile, busy, options));
        restoreReferenceDataFocus(elements.content, focusState);
        return;
      }

      elements.content.replaceChildren(createSimpleView(state, selectedFile, busy, options));
      restoreReferenceDataFocus(elements.content, focusState);
    }

    return { render };
  }

  function getReferenceDataPanelElements(root: ParentNode): ReferenceDataPanelElements {
    return {
      dialog: root.querySelector<HTMLElement>("#reference-data-dialog"),
      closeButton: root.querySelector<HTMLButtonElement>("#close-reference-data"),
      openFolderButton: root.querySelector<HTMLButtonElement>("#reference-data-open-folder"),
      createMissingButton: root.querySelector<HTMLButtonElement>("#reference-data-create-missing"),
      reloadButton: root.querySelector<HTMLButtonElement>("#reference-data-reload"),
      status: root.querySelector<HTMLElement>("#reference-data-status"),
      basePath: root.querySelector<HTMLElement>("#reference-data-base-path"),
      files: root.querySelector<HTMLElement>("#reference-data-files"),
      modeSimpleButton: root.querySelector<HTMLButtonElement>("#reference-data-mode-simple"),
      modeJsonButton: root.querySelector<HTMLButtonElement>("#reference-data-mode-json"),
      content: root.querySelector<HTMLElement>("#reference-data-content")
    };
  }

  function renderStaticElements(
    elements: ReferenceDataPanelElements,
    state: ReferenceDataState,
    busy: boolean,
    options: ReferenceDataPanelOptions
  ): void {
    if (elements.basePath) {
      elements.basePath.textContent = state.overview?.basePath ?? "Configuration locale";
      elements.basePath.title = elements.basePath.textContent;
    }

    if (elements.status) {
      elements.status.className = `reference-data-status${state.error ? " error" : ""}`;
      elements.status.textContent = referenceDataStatusText(state);
    }

    if (elements.openFolderButton) {
      elements.openFolderButton.disabled = busy;
    }
    if (elements.createMissingButton) {
      elements.createMissingButton.disabled = busy;
    }
    if (elements.reloadButton) {
      elements.reloadButton.disabled = busy;
    }

    if (elements.modeSimpleButton) {
      elements.modeSimpleButton.disabled = busy;
      elements.modeSimpleButton.setAttribute("aria-pressed", String(state.mode === "simple"));
    }
    if (elements.modeJsonButton) {
      elements.modeJsonButton.disabled = busy;
      elements.modeJsonButton.setAttribute("aria-pressed", String(state.mode === "json"));
    }

    if (elements.files) {
      elements.files.replaceChildren(
        ...(state.overview?.files ?? []).map((file) => createFileTab(file, state, busy, options))
      );
    }
  }

  function createFileTab(
    file: ReferenceDataFileInfo,
    state: ReferenceDataState,
    busy: boolean,
    options: ReferenceDataPanelOptions
  ): HTMLButtonElement {
    const button = document.createElement("button");
    const label = document.createElement("span");
    const status = document.createElement("small");
    button.type = "button";
    button.className = `reference-data-file-tab${file.key === state.selectedFileKey ? " active" : ""}`;
    button.disabled = busy;
    label.textContent = file.label;
    status.textContent = `${referenceDataFileStatusLabel(file.status)} · ${file.entryCount} entrée${file.entryCount > 1 ? "s" : ""}`;
    button.append(label, status);
    button.addEventListener("click", () => options.onSelectFile(file.key));
    return button;
  }

  function createJsonView(
    state: ReferenceDataState,
    file: ReferenceDataFileInfo,
    busy: boolean,
    options: ReferenceDataPanelOptions
  ): HTMLDivElement {
    const container = document.createElement("div");
    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const textarea = document.createElement("textarea");
    const actions = document.createElement("div");
    const validateButton = document.createElement("button");
    const saveButton = document.createElement("button");
    const content = currentDraftContent(state, file);
    const canSave = Boolean(
      state.validation?.ok &&
        state.lastValidatedFileKey === file.key &&
        state.lastValidatedContent === content
    );

    container.className = "reference-data-json";
    labelText.textContent = `${file.relativePath} (${referenceDataFileStatusLabel(file.status)})`;
    textarea.setAttribute("data-reference-json", file.key);
    textarea.value = content;
    textarea.spellcheck = false;
    textarea.addEventListener("input", () => options.onJsonDraftChange(file.key, textarea.value));
    label.append(labelText, textarea);

    actions.className = "reference-data-json-actions";
    validateButton.type = "button";
    validateButton.textContent = "Valider";
    validateButton.disabled = busy;
    validateButton.addEventListener("click", () => options.onValidateJson(file.key));
    saveButton.type = "button";
    saveButton.textContent = "Sauvegarder";
    saveButton.disabled = busy || !canSave;
    saveButton.addEventListener("click", () => options.onSaveJson(file.key));
    actions.append(validateButton, saveButton);

    container.append(label, actions, createValidationBlock(state, file));
    return container;
  }

  function createSimpleView(
    state: ReferenceDataState,
    file: ReferenceDataFileInfo,
    busy: boolean,
    options: ReferenceDataPanelOptions
  ): HTMLDivElement {
    const container = document.createElement("div");
    const entries = parseReferenceEntries(currentDraftContent(state, file));
    const list = document.createElement("div");
    const form = createSimpleForm(state, file, busy, options);

    container.className = "reference-data-simple-layout";
    list.className = "reference-data-list";
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Aucune entrée dans ce référentiel.";
      list.append(empty);
    } else {
      list.replaceChildren(...entries.map((entry, index) => createEntryCard(entry, index, busy, options)));
    }

    container.append(list, form);
    return container;
  }

  function createSimpleForm(
    state: ReferenceDataState,
    file: ReferenceDataFileInfo,
    busy: boolean,
    options: ReferenceDataPanelOptions
  ): HTMLFormElement {
    const form = document.createElement("form");
    const grid = document.createElement("div");
    const actions = document.createElement("div");
    const newButton = document.createElement("button");
    const applyButton = document.createElement("button");
    const saveButton = document.createElement("button");
    const draft = state.simpleDraft;

    form.className = "reference-data-form";
    grid.className = "reference-data-form-grid";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      options.onSimpleApply();
    });

    grid.append(
      createTextField("Nom lisible", "label", draft.label, options),
      createTextField("Alias fichier", "fileAlias", draft.fileAlias, options),
      createTextField("Alias dossier", "folderAlias", draft.folderAlias, options, file.key === "providers"),
      createTextAreaField("Alias de détection", "aliases", draft.aliases, options),
      createTextField("Date de naissance", "birthDate", draft.birthDate, options, file.key !== "people"),
      createTextAreaField("Domaines", "domains", draft.domains, options, file.key !== "providers"),
      createCheckboxField(
        "Date de naissance utilisée seulement pour détecter",
        "useBirthDateForDetectionOnly",
        draft.useBirthDateForDetectionOnly,
        options,
        file.key !== "people"
      ),
      createCheckboxField("Actif", "enabled", draft.enabled, options)
    );

    actions.className = "reference-data-form-actions";
    newButton.type = "button";
    newButton.textContent = "Nouvelle entrée";
    newButton.disabled = busy;
    newButton.addEventListener("click", options.onSimpleNew);
    applyButton.type = "submit";
    applyButton.textContent = draft.editingIndex === null ? "Ajouter" : "Mettre à jour";
    applyButton.disabled = busy;
    saveButton.type = "button";
    saveButton.textContent = "Sauvegarder";
    saveButton.disabled = busy;
    saveButton.addEventListener("click", () => options.onSaveJson(file.key));
    actions.append(newButton, applyButton, saveButton);

    form.append(grid, actions, createValidationBlock(state, file));
    return form;
  }

  function createTextField(
    labelText: string,
    field: keyof ReferenceDataSimpleDraft,
    value: string,
    options: ReferenceDataPanelOptions,
    hidden = false
  ): HTMLLabelElement {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const input = document.createElement("input");
    label.hidden = hidden;
    span.textContent = labelText;
    input.setAttribute("data-reference-field", field);
    input.value = value;
    input.autocomplete = "off";
    input.addEventListener("input", () => options.onSimpleFieldChange(field, input.value));
    label.append(span, input);
    return label;
  }

  function createTextAreaField(
    labelText: string,
    field: keyof ReferenceDataSimpleDraft,
    value: string,
    options: ReferenceDataPanelOptions,
    hidden = false
  ): HTMLLabelElement {
    const label = document.createElement("label");
    const span = document.createElement("span");
    const textarea = document.createElement("textarea");
    label.hidden = hidden;
    span.textContent = labelText;
    textarea.setAttribute("data-reference-field", field);
    textarea.value = value;
    textarea.addEventListener("input", () => options.onSimpleFieldChange(field, textarea.value));
    label.append(span, textarea);
    return label;
  }

  function createCheckboxField(
    labelText: string,
    field: keyof ReferenceDataSimpleDraft,
    value: boolean,
    options: ReferenceDataPanelOptions,
    hidden = false
  ): HTMLLabelElement {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const span = document.createElement("span");
    label.className = "reference-data-checkbox";
    label.hidden = hidden;
    input.type = "checkbox";
    input.setAttribute("data-reference-field", field);
    input.checked = value;
    input.addEventListener("change", () => options.onSimpleFieldChange(field, input.checked));
    span.textContent = labelText;
    label.append(input, span);
    return label;
  }

  function createEntryCard(
    entry: Record<string, unknown>,
    index: number,
    busy: boolean,
    options: ReferenceDataPanelOptions
  ): HTMLDivElement {
    const card = document.createElement("div");
    const label = document.createElement("strong");
    const alias = document.createElement("span");
    const actions = document.createElement("div");
    const edit = document.createElement("button");
    const disable = document.createElement("button");
    const enabled = entry.enabled !== false;

    card.className = `reference-data-entry${enabled ? "" : " disabled"}`;
    label.textContent = stringValue(entry.label) || stringValue(entry.id) || `Entrée ${index + 1}`;
    alias.textContent = [
      stringValue(entry.fileAlias),
      Array.isArray(entry.aliases) ? `${entry.aliases.length} alias` : null,
      enabled ? "active" : "désactivée"
    ].filter(Boolean).join(" · ");
    actions.className = "reference-data-entry-actions";
    edit.type = "button";
    edit.textContent = "Modifier";
    edit.disabled = busy;
    edit.addEventListener("click", () => options.onSimpleEdit(index));
    disable.type = "button";
    disable.textContent = enabled ? "Désactiver" : "Réactiver";
    disable.disabled = busy;
    disable.addEventListener("click", () => options.onSimpleDisable(index));
    actions.append(edit, disable);
    card.append(label, alias, actions);
    return card;
  }

  function createValidationBlock(
    state: ReferenceDataState,
    file: ReferenceDataFileInfo
  ): HTMLUListElement | DocumentFragment {
    const errors = getVisibleErrors(state, file);
    if (errors.length === 0) {
      return document.createDocumentFragment();
    }

    const list = document.createElement("ul");
    list.className = "reference-data-errors";
    list.replaceChildren(
      ...errors.map((error) => {
        const item = document.createElement("li");
        item.textContent = formatReferenceDataError(error);
        return item;
      })
    );
    return list;
  }

  function getVisibleErrors(
    state: ReferenceDataState,
    file: ReferenceDataFileInfo
  ): ReferenceDataValidationError[] {
    if (!state.validation?.ok && state.validation?.error.fileKey === file.key) {
      return state.validation.error.details ?? [
        {
          category: file.key,
          field: "root",
          message: state.validation.error.message
        }
      ];
    }

    return file.errors;
  }

  function currentDraftContent(state: ReferenceDataState, file: ReferenceDataFileInfo): string {
    return state.jsonDrafts[file.key] ?? file.content;
  }

  function captureReferenceDataFocus(content: HTMLElement): ReferenceDataFocusState | null {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement) || !content.contains(activeElement)) {
      return null;
    }

    const field = activeElement.getAttribute("data-reference-field");
    const jsonFile = activeElement.getAttribute("data-reference-json");
    const selector = field
      ? `[data-reference-field="${field}"]`
      : jsonFile
        ? `[data-reference-json="${jsonFile}"]`
        : "";
    if (!selector) {
      return null;
    }

    return {
      selector,
      ...getReferenceDataSelection(activeElement)
    };
  }

  function restoreReferenceDataFocus(
    content: HTMLElement,
    focusState: ReferenceDataFocusState | null
  ): void {
    if (!focusState) {
      return;
    }

    const nextElement = content.querySelector<HTMLElement>(focusState.selector);
    if (!nextElement) {
      return;
    }

    nextElement.focus({ preventScroll: true });
    if (
      focusState.selectionStart !== null &&
      focusState.selectionEnd !== null &&
      isReferenceDataTextControl(nextElement)
    ) {
      const nextLength = nextElement.value.length;
      nextElement.setSelectionRange(
        Math.min(focusState.selectionStart, nextLength),
        Math.min(focusState.selectionEnd, nextLength)
      );
    }
  }

  function getReferenceDataSelection(element: HTMLElement): {
    selectionStart: number | null;
    selectionEnd: number | null;
  } {
    if (!isReferenceDataTextControl(element)) {
      return {
        selectionStart: null,
        selectionEnd: null
      };
    }

    return {
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd
    };
  }

  function isReferenceDataTextControl(
    element: HTMLElement
  ): element is HTMLInputElement | HTMLTextAreaElement {
    return (
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && element.type !== "checkbox")
    );
  }

  function getSelectedFile(state: ReferenceDataState): ReferenceDataFileInfo | null {
    return state.overview?.files.find((file) => file.key === state.selectedFileKey) ?? null;
  }

  function parseReferenceEntries(content: string): Array<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(content) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is Record<string, unknown> =>
            Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
          )
        : [];
    } catch {
      return [];
    }
  }

  function stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  function referenceDataStatusText(state: ReferenceDataState): string {
    if (state.error) {
      return state.error.message;
    }

    if (state.status === "loading") {
      return "Chargement des référentiels...";
    }
    if (state.status === "saving") {
      return "Sauvegarde du référentiel...";
    }
    if (state.status === "validating") {
      return "Validation du référentiel...";
    }

    const files = state.overview?.files ?? [];
    const invalidCount = files.filter((file) => file.status === "invalid" || file.status === "read-error").length;
    const missingCount = files.filter((file) => file.status === "absent").length;
    const catalog = state.overview?.catalogStatus === "blocked" ? " Catalogue bloqué." : "";
    return `${state.message}${missingCount > 0 ? ` ${missingCount} fichier(s) absent(s).` : ""}${invalidCount > 0 ? ` ${invalidCount} fichier(s) invalide(s).` : ""}${catalog}`;
  }

  function referenceDataFileStatusLabel(status: ReferenceDataFileStatus): string {
    switch (status) {
      case "absent":
        return "absent";
      case "valid":
        return "valide";
      case "invalid":
        return "invalide";
      case "read-error":
        return "lecture impossible";
    }
  }

  function formatReferenceDataError(error: ReferenceDataValidationError): string {
    return [
      error.category,
      typeof error.index === "number" ? `entrée ${error.index + 1}` : null,
      error.id ? `id ${error.id}` : null,
      error.field,
      error.message
    ].filter(Boolean).join(" · ");
  }

  DocSorterReferenceDataPanel = {
    createReferenceDataPanel
  };
  globalThis.DocSorterReferenceDataPanel = DocSorterReferenceDataPanel;
})();
