const state: AppState = {
  sourcePath: null,
  targetPath: null,
  documents: [],
  activeDocumentPath: null,
  queueMessage: "Aucun dossier source sélectionné",
  queueView: createIdleQueueViewState(),
  isLoading: false,
  preview: createIdlePreviewState(),
  naming: createIdleNamingState(),
  targetFolder: createIdleTargetFolderState(),
  destination: createIdleDestinationCheckState(),
  classification: createIdleClassificationState(),
  lastUndoableAction: null,
  history: createIdleHistoryState(),
  duplicates: createIdleDuplicateAnalysisState(),
  textExtraction: createIdleTextExtractionState(),
  namingSuggestions: createIdleNamingSuggestionsState(),
  namingRules: createIdleNamingRulesState(),
  ocr: createIdleOcrState(),
  shortcutsHelpVisible: false
};

let previewRequestId = 0;
let namingRequestId = 0;
let destinationRequestId = 0;
let classificationRequestId = 0;
let duplicateAnalysisRequestId = 0;
let textExtractionRequestId = 0;
let targetFolderRequestId = 0;
let ocrRequestId = 0;
let destinationCheckTimer: number | null = null;

const version = document.querySelector<HTMLElement>("#app-version");
const selectSourceButton = document.querySelector<HTMLButtonElement>("#select-source");
const refreshSourceButton = document.querySelector<HTMLButtonElement>("#refresh-source");
const selectTargetButton = document.querySelector<HTMLButtonElement>("#select-target");
const shortcutHelpToggleButton = document.querySelector<HTMLButtonElement>("#shortcut-help-toggle");
const shortcutHelpPanel = document.querySelector<HTMLElement>("#shortcut-help");
const analyzeDuplicatesButton = document.querySelector<HTMLButtonElement>("#analyze-duplicates");
const sourcePath = document.querySelector<HTMLElement>("#source-path");
const targetPath = document.querySelector<HTMLElement>("#target-path");
const prepareClassificationButton = document.querySelector<HTMLButtonElement>("#prepare-classification");
const executeClassificationButton = document.querySelector<HTMLButtonElement>("#execute-classification");
const undoLastActionButton = document.querySelector<HTMLButtonElement>("#undo-last-action");
const refreshHistoryButton = document.querySelector<HTMLButtonElement>("#refresh-history");

const previewPanel = DocSorterPreviewPanel.createPreviewPanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    preview: state.preview
  }),
  statusLabel,
  onPdfPageChange: (pageNumber) => {
    if (state.preview.data?.kind !== "pdf") {
      return;
    }

    state.preview.pdfPage = pageNumber;
    render();
  },
  onZoomChange: updatePreviewZoom,
  onRotateImage: () => {
    if (state.preview.data?.kind !== "image") {
      return;
    }

    state.preview.rotation = (state.preview.rotation + 90) % 360;
    render();
  },
  onPdfRenderError: () => {
    state.preview = {
      ...createIdlePreviewState(),
      status: "error",
      errorMessage: "Aperçu PDF indisponible"
    };
    render();
  }
});

const documentDetailsPanel = DocSorterDocumentDetailsPanel.createDocumentDetailsPanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    targetPath: state.targetPath,
    targetFolder: state.targetFolder.selectedFolder
  }),
  formatDate,
  statusLabel
});

const duplicatePanel = DocSorterDuplicatePanel.createDuplicatePanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    documents: state.documents,
    duplicates: state.duplicates
  }),
  onSelectDocumentByPath: selectDocumentByPath,
  onIgnoreActiveDuplicate: ignoreActiveDuplicateForSession,
  isActionsDisabled: isClassificationBusy
});

const queuePanel = DocSorterQueuePanel.createQueuePanel<DocumentItem>({
  getState: () => ({
    documents: state.documents,
    activeDocumentPath: state.activeDocumentPath,
    queueMessage: state.queueMessage,
    queueView: state.queueView,
    isLoading: state.isLoading,
    duplicateFilePaths: getDuplicateDocumentPathList()
  }),
  onSelectDocument: selectDocument,
  onSearchChange: (query) => {
    state.queueView.query = query;
  },
  onFilterChange: (filter) => {
    state.queueView.filter = filter;
  },
  onSortChange: (sortKey) => {
    state.queueView.sortKey = sortKey;
  },
  onSortDirectionChange: (sortDirection) => {
    state.queueView.sortDirection = sortDirection;
  },
  hasVisibleDuplicate: documentHasVisibleDuplicate,
  getStatusLabel: documentQueueStatusLabel
});

const historyPanel = DocSorterHistoryPanel.createHistoryPanel({
  getState: () => ({
    history: state.history
  }),
  formatDate
});

const textExtractionPanel = DocSorterTextExtractionPanel.createTextExtractionPanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    textExtraction: state.textExtraction
  }),
  canExtract: (documentItem) => canExtractTextFromActiveDocument(documentItem ?? getActiveDocument()),
  onExtract: () => {
    void extractTextFromActiveDocument();
  },
  formatDate
});

const namingSuggestionsPanel = DocSorterNamingSuggestionsPanel.createNamingSuggestionsPanel({
  getState: () => {
    const activeDocument = getActiveDocument();
    return {
      activeDocument,
      extractionState: activeDocument ? getTextExtractionState(activeDocument.filePath) : null,
      suggestionState: activeDocument ? getNamingSuggestionState(activeDocument.filePath) : null
    };
  },
  canAnalyze: (documentItem) => canAnalyzeNamingSuggestions(documentItem ?? getActiveDocument()),
  canApplyToEmptyFields: canApplyNamingSuggestionsToEmptyFields,
  canApplyTargetFolderSuggestion: canApplyTargetFolderSuggestion,
  onAnalyze: analyzeNamingSuggestionsForActiveDocument,
  onApplyToEmptyFields: applyNamingSuggestionsToEmptyFields,
  onApplyTargetFolderSuggestion: applyTargetFolderSuggestion
});

const namingPanelView = DocSorterNamingPanel.createNamingPanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    targetPath: state.targetPath,
    targetFolder: state.targetFolder,
    naming: state.naming,
    destination: state.destination,
    effectiveFilename: getEffectiveProposedFilename()
  }),
  onDraftChange: updateNamingDraftFromInputs,
  onResetDraft: () => {
    const activeDocument = getActiveDocument();
    if (!activeDocument) {
      return;
    }

    void initializeNamingDraft(activeDocument);
  },
  onApplyDestinationAlternative: applyDestinationAlternative,
  onTargetFolderChange: updateTargetFolderFromInput,
  onCreateTargetFolder: () => {
    void createSelectedTargetFolder();
  }
});

const classificationPanel = DocSorterClassificationPanel.createClassificationPanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    classification: state.classification
  }),
  hasVisibleDuplicate: documentHasVisibleDuplicate,
  formatDate
});

const rulesPanel = DocSorterRulesPanel.createRulesPanel({
  getState: () => state.namingRules,
  onTogglePanel: () => {
    state.namingRules.panelOpen = !state.namingRules.panelOpen;
    renderRulesPanel();
  },
  onSubmitDraft: upsertUserRuleDraft,
  onDraftChange: updateUserRuleDraft,
  onResetDraft: resetUserRuleDraft,
  onSaveRules: () => {
    void saveUserRules();
  },
  onReloadRules: () => {
    void reloadNamingRules();
  },
  onEditRule: editUserRule,
  onDeleteRule: deleteUserRule
});

const ocrPanel = DocSorterOcrPanel.createOcrPanel({
  getState: () => state.ocr,
  onDraftChange: updateOcrDraft,
  onChooseTesseractExecutable: () => {
    void selectTesseractExecutableForOcr();
  },
  onChooseTessdataDirectory: () => {
    void selectTessdataDirectoryForOcr();
  },
  onSaveSettings: () => {
    void saveOcrSettingsFromPanel();
  },
  onTestEngine: () => {
    void testOcrEngineFromPanel();
  },
  onRefreshStatus: () => {
    void refreshOcrStatus();
  },
  isActionsDisabled: isClassificationBusy,
  formatDate
});

void window.docSorter.getVersion().then((value) => {
  if (version) {
    version.textContent = `v${value}`;
  }
});

void refreshLastUndoableAction();
void refreshRecentHistory();
void refreshNamingRulesStatus();
void refreshOcrStatus();

selectSourceButton?.addEventListener("click", () => {
  void selectSourceDirectory();
});

refreshSourceButton?.addEventListener("click", () => {
  void refreshDocuments({
    preserveSelection: true,
    successMessage: "Rafraîchissement réussi"
  });
});

selectTargetButton?.addEventListener("click", () => {
  void selectTargetDirectory();
});

shortcutHelpToggleButton?.addEventListener("click", () => {
  toggleShortcutHelp();
});

analyzeDuplicatesButton?.addEventListener("click", () => {
  void analyzeExactDuplicates();
});

prepareClassificationButton?.addEventListener("click", () => {
  void prepareClassificationSimulation();
});

executeClassificationButton?.addEventListener("click", () => {
  void executeClassificationAction();
});

undoLastActionButton?.addEventListener("click", () => {
  void undoLastClassificationAction();
});

refreshHistoryButton?.addEventListener("click", () => {
  void refreshRecentHistory();
});

document.addEventListener("keydown", (event) => {
  handleGlobalKeyboardShortcut(event);
});

render();








function render(): void {
  renderControls();
  renderPaths();
  renderQueue();
  renderPreview();
  renderDetails();
  renderRulesPanel();
  renderOcrPanel();
  renderHistory();
  renderShortcutHelp();
}

function renderControls(): void {
  if (selectSourceButton) {
    selectSourceButton.disabled = isClassificationBusy();
  }

  if (selectTargetButton) {
    selectTargetButton.disabled = isClassificationBusy();
  }

  if (refreshSourceButton) {
    refreshSourceButton.disabled = !state.sourcePath || state.isLoading || isClassificationBusy();
  }

  if (analyzeDuplicatesButton) {
    analyzeDuplicatesButton.disabled =
      !state.sourcePath ||
      state.documents.length === 0 ||
      state.isLoading ||
      state.duplicates.status === "analyzing" ||
      isClassificationBusy();
  }

  if (prepareClassificationButton) {
    prepareClassificationButton.disabled = !canPrepareClassificationPlan();
  }

  if (executeClassificationButton) {
    executeClassificationButton.disabled = !canExecuteClassification();
  }

  if (undoLastActionButton) {
    undoLastActionButton.disabled = !state.lastUndoableAction || isClassificationBusy();
  }

  if (refreshHistoryButton) {
    refreshHistoryButton.disabled = state.history.isLoading || isClassificationBusy();
  }
}
