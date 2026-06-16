async function prepareClassificationSimulation(): Promise<void> {
  const activeDocument = getActiveDocument();
  const filename = getEffectiveProposedFilename();
  if (!activeDocument || !filename) {
    return;
  }

  const requestId = ++classificationRequestId;
  state.classification = {
    status: "preparing",
    plan: null,
    error: null,
    journalWarning: null
  };
  render();

  const result = await window.docSorter.prepareClassificationPlan(activeDocument.filePath, filename);
  if (requestId !== classificationRequestId) {
    return;
  }

  if (result.ok) {
    state.classification = {
      status: "ready",
      plan: result.value as ClassificationPlan,
      error: null,
      journalWarning: null
    };
    render();
    return;
  }

  state.classification = {
    status: "blocked",
    plan: result.value as ClassificationPlan,
    error: result.error as ClassificationPlanError,
    journalWarning: null
  };
  render();
}

async function executeClassificationAction(): Promise<void> {
  const activeDocument = getActiveDocument();
  const filename = getEffectiveProposedFilename();
  if (!activeDocument || !filename || !canExecuteClassification()) {
    return;
  }

  const requestId = ++classificationRequestId;
  state.classification = {
    status: "executing",
    plan: state.classification.plan,
    error: null,
    journalWarning: null
  };
  state.queueMessage = "Classement en cours...";
  render();

  const result = await window.docSorter.executeClassification(activeDocument.filePath, filename);
  if (requestId !== classificationRequestId) {
    return;
  }

  if (!result.ok) {
    state.classification = {
      status: "blocked",
      plan: (result.plan as ClassificationPlan | undefined) ?? state.classification.plan,
      error: result.error as ClassificationOperationError,
      journalWarning: null
    };
    state.queueMessage = result.error.message;
    render();
    void refreshRecentHistory();
    return;
  }

  state.lastUndoableAction = result.value.undoableAction as UndoableClassificationAction;
  state.queueMessage = result.value.message;
  const classificationJournalWarning = result.value.journalWarning as OperationJournalWarning | undefined;
  void refreshRecentHistory();
  applySuccessfulClassification(activeDocument.filePath);
  if (classificationJournalWarning) {
    state.classification = {
      status: "completed-warning",
      plan: result.value.plan as ClassificationPlan,
      error: null,
      journalWarning: classificationJournalWarning
    };
    state.queueMessage = journalWarningQueueMessage(classificationJournalWarning);
    render();
  }
}

async function undoLastClassificationAction(): Promise<void> {
  if (!state.lastUndoableAction || isClassificationBusy()) {
    return;
  }

  const requestId = ++classificationRequestId;
  state.classification = {
    status: "undoing",
    plan: null,
    error: null,
    journalWarning: null
  };
  state.queueMessage = "Annulation en cours...";
  render();

  const result = await window.docSorter.undoLastClassification();
  if (requestId !== classificationRequestId) {
    return;
  }

  if (!result.ok) {
    state.classification = {
      status: "idle",
      plan: null,
      error: result.error as UndoClassificationError,
      journalWarning: null
    };
    state.queueMessage = result.error.message;
    render();
    void refreshRecentHistory();
    return;
  }

  state.lastUndoableAction = null;
  state.queueMessage = result.value.message;
  const undoJournalWarning = result.value.journalWarning as OperationJournalWarning | undefined;
  resetClassificationState();
  await refreshLastUndoableAction();
  await refreshRecentHistory();

  if (!state.sourcePath) {
    if (undoJournalWarning) {
      showUndoJournalWarning(undoJournalWarning);
      return;
    }
    render();
    return;
  }

  await refreshDocuments({
    preserveSelection: false,
    preferredSelectionPath: result.value.restoredPath,
    successMessage: result.value.message
  });
  if (undoJournalWarning) {
    showUndoJournalWarning(undoJournalWarning);
  }
}

async function refreshLastUndoableAction(): Promise<void> {
  state.lastUndoableAction = (await window.docSorter.getLastUndoableAction()) as
    | UndoableClassificationAction
    | null;
  renderControls();
}

async function refreshRecentHistory(): Promise<void> {
  state.history = {
    ...state.history,
    isLoading: true,
    errorMessage: ""
  };
  renderHistory();
  renderControls();

  const result = await window.docSorter.getRecentHistory(8);
  if (result.ok) {
    state.history = {
      entries: result.value as ActionJournalEntry[],
      isLoading: false,
      errorMessage: ""
    };
  } else {
    state.history = {
      entries: [],
      isLoading: false,
      errorMessage: result.error.message
    };
  }

  renderHistory();
  renderControls();
}

function applySuccessfulClassification(classifiedDocumentPath: string): void {
  const classifiedIndex = state.documents.findIndex(
    (documentItem) => documentItem.filePath === classifiedDocumentPath
  );
  const documentsAfterClassification = state.documents.filter(
    (documentItem) => documentItem.filePath !== classifiedDocumentPath
  );
  const nextDocument =
    documentsAfterClassification[classifiedIndex] ??
    documentsAfterClassification[classifiedIndex - 1] ??
    null;

  clearPreviewResources();
  state.documents = documentsAfterClassification;
  state.activeDocumentPath = nextDocument?.filePath ?? null;
  state.preview = nextDocument
    ? {
        ...createIdlePreviewState(),
        status: "loading"
      }
    : createIdlePreviewState();
  resetNamingState();
  resetClassificationState();
  resetDuplicateAnalysisState();
  resetTextExtractionState();
  render();

  if (!nextDocument) {
    return;
  }

  void initializeNamingDraft(nextDocument);
  void loadActivePreview(nextDocument);
}

function showUndoJournalWarning(warning: OperationJournalWarning): void {
  state.classification = {
    status: "undo-warning",
    plan: null,
    error: null,
    journalWarning: warning
  };
  state.queueMessage = journalWarningQueueMessage(warning);
  render();
}

function renderClassificationSummary(): void {
  classificationPanel.render();
}

function renderHistory(): void {
  historyPanel.render();
}

function journalWarningQueueMessage(warning: OperationJournalWarning): string {
  if (warning.code === "CLASSIFIED_BUT_JOURNAL_INCOMPLETE") {
    return [
      warning.message,
      "Le fichier a bien été déplacé.",
      "L'annulation immédiate peut rester disponible dans cette session.",
      "Après redémarrage, l'historique ou l'annulation peuvent être incomplets."
    ].join(" ");
  }

  return [
    warning.message,
    "Le fichier a bien été restauré.",
    "L'historique peut rester incomplet."
  ].join(" ");
}

function canPrepareClassificationPlan(): boolean {
  const activeDocument = getActiveDocument();
  return Boolean(
    activeDocument &&
      activeDocument.status !== "missing" &&
      state.targetPath &&
      !state.naming.isLoading &&
      state.naming.proposal?.isValid &&
      getEffectiveProposedFilename() &&
      state.destination.status === "available" &&
      state.duplicates.status !== "analyzing" &&
      !isClassificationBusy()
  );
}

function canExecuteClassification(): boolean {
  return Boolean(
    state.classification.status === "ready" &&
      state.classification.plan?.status === "ready" &&
      getActiveDocument() &&
      !isClassificationBusy()
  );
}

function isClassificationBusy(): boolean {
  return (
    state.classification.status === "preparing" ||
    state.classification.status === "executing" ||
    state.classification.status === "undoing"
  );
}

