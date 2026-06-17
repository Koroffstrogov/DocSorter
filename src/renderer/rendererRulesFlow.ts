async function refreshNamingRulesStatus(): Promise<void> {
  state.namingRules.panelStatus = "loading";
  renderRulesPanel();

  const result = await window.docSorter.getRulesStatus();
  if (!result.ok) {
    state.namingRules = {
      ...state.namingRules,
      panelStatus: "error",
      message: result.error.message,
      warning: result.error as RendererUserRulesError
    };
    renderRulesPanel();
    return;
  }

  applyNamingRulesStatus(result.value as RendererNamingRulesStatus, false);
}

async function reloadNamingRules(): Promise<void> {
  state.namingRules.panelStatus = "loading";
  state.namingRules.dirty = false;
  renderRulesPanel();

  const result = await window.docSorter.reloadNamingRules();
  if (!result.ok) {
    state.namingRules = {
      ...state.namingRules,
      panelStatus: "error",
      message: result.error.message,
      warning: result.error as RendererUserRulesError
    };
    renderRulesPanel();
    return;
  }

  applyNamingRulesStatus(result.value as RendererNamingRulesStatus, true);
}

async function saveUserRules(): Promise<void> {
  state.namingRules.panelStatus = "saving";
  state.namingRules.message = "Sauvegarde des règles utilisateur...";
  renderRulesPanel();

  const result = await window.docSorter.saveUserRulesCatalog(state.namingRules.userCatalog);
  if (!result.ok) {
    state.namingRules = {
      ...state.namingRules,
      panelStatus: "error",
      message: result.error.message,
      warning: result.error as RendererUserRulesError
    };
    renderRulesPanel();
    return;
  }

  applyNamingRulesStatus(result.value as RendererNamingRulesStatus, true);
}

function applyNamingRulesStatus(status: RendererNamingRulesStatus, _resetSuggestions: boolean): void {
  state.namingRules = {
    ...state.namingRules,
    panelStatus: "ready",
    userRulesPath: status.userRulesPath,
    userCatalog: cloneRulesCatalog(status.userCatalog),
    mergedCatalog: cloneRulesCatalog(status.mergedCatalog),
    defaultRuleCount: status.defaultRuleCount,
    userRuleCount: status.userRuleCount,
    message: status.message,
    warning: status.warning,
    editingTarget: null,
    draft: DocSorterUserRuleEditor.createEmptyUserRuleDraft(),
    draftErrors: [],
    dirty: false
  };

  render();
}

function renderRulesPanel(): void {
  rulesPanel.render();
}

function updateUserRuleDraft(draft: UserRuleEditorDraft): void {
  state.namingRules.draft = draft;
  state.namingRules.draftErrors = [];
}

function upsertUserRuleDraft(draft: UserRuleEditorDraft): void {
  updateUserRuleDraft(draft);
  const result = DocSorterUserRuleEditor.buildUserRuleFromDraft(state.namingRules.draft);

  if (!result.ok) {
    state.namingRules.draftErrors = result.errors;
    renderRulesPanel();
    return;
  }

  const nextCatalog = cloneRulesCatalog(state.namingRules.userCatalog);
  const editingTarget = state.namingRules.editingTarget;

  if (editingTarget && editingTarget.category !== result.value.category) {
    removeRuleFromCatalog(nextCatalog, editingTarget.category, editingTarget.index);
  }

  if (result.value.category === "documentType") {
    upsertRuleInList(nextCatalog.documentTypeRules, result.value.rule as NamingSuggestionRule, editingTarget);
  } else if (result.value.category === "subject") {
    upsertRuleInList(nextCatalog.subjectRules, result.value.rule as NamingSuggestionRule, editingTarget);
  } else {
    upsertRuleInList(nextCatalog.keywordRules, result.value.rule as KeywordAliasRule, editingTarget);
  }

  state.namingRules.userCatalog = nextCatalog;
  state.namingRules.dirty = true;
  state.namingRules.draft = DocSorterUserRuleEditor.createEmptyUserRuleDraft();
  state.namingRules.editingTarget = null;
  state.namingRules.draftErrors = [];
  state.namingRules.userRuleCount = countRules(nextCatalog);
  render();
}

function upsertRuleInList<TRule>(
  list: TRule[],
  rule: TRule,
  editingTarget: UserRuleEditingTarget | null
): void {
  if (editingTarget && editingTarget.category === state.namingRules.draft.category) {
    list.splice(editingTarget.index, 1, rule);
    return;
  }

  list.push(rule);
}

function editUserRule(category: UserRuleEditorCategory, index: number): void {
  const catalog = state.namingRules.userCatalog;
  if (category === "documentType") {
    const rule = catalog.documentTypeRules[index];
    if (!rule) {
      return;
    }

    state.namingRules.draft = DocSorterUserRuleEditor.namingRuleToDraft("documentType", rule);
  } else if (category === "subject") {
    const rule = catalog.subjectRules[index];
    if (!rule) {
      return;
    }

    state.namingRules.draft = DocSorterUserRuleEditor.namingRuleToDraft("subject", rule);
  } else {
    const rule = catalog.keywordRules[index];
    if (!rule) {
      return;
    }

    state.namingRules.draft = DocSorterUserRuleEditor.keywordRuleToDraft(rule);
  }

  state.namingRules.editingTarget = { category, index };
  state.namingRules.draftErrors = [];
  state.namingRules.panelOpen = true;
  renderRulesPanel();
}

function deleteUserRule(category: UserRuleEditorCategory, index: number): void {
  const nextCatalog = cloneRulesCatalog(state.namingRules.userCatalog);
  removeRuleFromCatalog(nextCatalog, category, index);

  state.namingRules.userCatalog = nextCatalog;
  state.namingRules.userRuleCount = countRules(nextCatalog);
  state.namingRules.dirty = true;
  state.namingRules.editingTarget = null;
  state.namingRules.draft = DocSorterUserRuleEditor.createEmptyUserRuleDraft();
  state.namingRules.draftErrors = [];
  render();
}

function removeRuleFromCatalog(
  catalog: NamingSuggestionRulesCatalog,
  category: UserRuleEditorCategory,
  index: number
): void {
  if (category === "documentType") {
    catalog.documentTypeRules.splice(index, 1);
  } else if (category === "subject") {
    catalog.subjectRules.splice(index, 1);
  } else {
    catalog.keywordRules.splice(index, 1);
  }
}

function resetUserRuleDraft(): void {
  state.namingRules.draft = DocSorterUserRuleEditor.createEmptyUserRuleDraft();
  state.namingRules.editingTarget = null;
  state.namingRules.draftErrors = [];
  renderRulesPanel();
}

