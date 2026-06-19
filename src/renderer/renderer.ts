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
  ocr: createIdleOcrState(),
  ai: createIdleAiState(),
  shortcutsHelpVisible: false,
  uiMode: "simple"
};

let previewRequestId = 0;
let namingRequestId = 0;
let destinationRequestId = 0;
let classificationRequestId = 0;
let duplicateAnalysisRequestId = 0;
let textExtractionRequestId = 0;
let targetFolderRequestId = 0;
let ocrRequestId = 0;
let aiRequestId = 0;
let aiSuggestionRequestId = 0;
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
const simpleClassificationButton = document.querySelector<HTMLButtonElement>("#simple-classification-action");
const undoLastActionButton = document.querySelector<HTMLButtonElement>("#undo-last-action");
const refreshHistoryButton = document.querySelector<HTMLButtonElement>("#refresh-history");
const simpleModeButton = document.querySelector<HTMLButtonElement>("#simple-mode-button");
const advancedModeButton = document.querySelector<HTMLButtonElement>("#advanced-mode-button");
const diagnosticPanel = document.querySelector<HTMLDetailsElement>("#diagnostic-panel");
const advancedPanel = document.querySelector<HTMLDetailsElement>("#advanced-panel");
const aiTextStatus = document.querySelector<HTMLElement>("#ai-text-status");

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
  formatDate,
  maxEntries: 3
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
  onTextChange: updateExtractedTextForDocument,
  formatDate
});

const namingPanelView = DocSorterNamingPanel.createNamingPanel({
  getState: () => ({
    activeDocument: getActiveDocument(),
    targetPath: state.targetPath,
    targetFolder: state.targetFolder,
    naming: state.naming,
    destination: state.destination,
    effectiveFilename: getEffectiveProposedFilename(),
    aiPreview: getAiNamingPreview()
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

const aiPanel = DocSorterAiPanel.createAiPanel({
  getState: () => state.ai,
  onDraftChange: updateAiDraft,
  onSaveSettings: () => {
    void saveAiSettingsFromPanel();
  },
  onTestConnection: () => {
    void testAiConnectionFromPanel();
  },
  onRefreshStatus: () => {
    void refreshAiStatus();
  },
  onUnloadModel: () => {
    void unloadAiModelFromPanel();
  },
  onPreloadModel: () => {
    void preloadAiModelFromPanel();
  },
  onRunSuggestion: () => {
    void runAiSuggestionForActiveDocument();
  },
  onFieldCandidateSelect: selectAiFieldCandidate,
  onFieldManualEditStart: startAiFieldManualEdit,
  onFieldManualValueChange: updateAiFieldManualValue,
  onFieldManualEditFinish: finishAiFieldManualEdit,
  onFolderCandidateSelect: selectAiFolderCandidate,
  onApplySuggestionToEmptyFields: applyAiSuggestionToEmptyFields,
  onExportDiagnostic: () => {
    void exportAiDiagnosticForActiveDocument();
  },
  onIgnoreSuggestion: ignoreAiSuggestion,
  isActionsDisabled: isClassificationBusy,
  canRunSuggestion: canRunAiSuggestion,
  canPreloadModel: canPreloadAiModel,
  canUnloadModel: canUnloadAiModel,
  canApplySuggestionToEmptyFields: canApplyAiSuggestionToEmptyFields,
  canExportDiagnostic: canExportAiDiagnostic,
  formatDate
});

void window.docSorter.getVersion().then((value) => {
  if (version) {
    version.textContent = `v${value}`;
  }
});

void refreshLastUndoableAction();
void refreshRecentHistory();
void refreshOcrStatus();
void refreshAiStatus();

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

simpleClassificationButton?.addEventListener("click", () => {
  void runSimpleClassificationAction();
});

undoLastActionButton?.addEventListener("click", () => {
  void undoLastClassificationAction();
});

refreshHistoryButton?.addEventListener("click", () => {
  void refreshRecentHistory();
});

simpleModeButton?.addEventListener("click", () => {
  setUiDisplayMode("simple");
});

advancedModeButton?.addEventListener("click", () => {
  setUiDisplayMode("advanced");
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
  renderOcrPanel();
  renderAiPanel();
  renderAiTextStatus();
  renderHistory();
  renderShortcutHelp();
  renderUiDisplayMode();
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
    prepareClassificationButton.hidden = state.uiMode === "simple";
    prepareClassificationButton.disabled = !canPrepareClassificationPlan();
  }

  if (executeClassificationButton) {
    executeClassificationButton.hidden = state.uiMode === "simple";
    executeClassificationButton.disabled = !canExecuteClassification();
  }

  if (simpleClassificationButton) {
    simpleClassificationButton.hidden = state.uiMode !== "simple";
    simpleClassificationButton.disabled = !canRunSimpleClassificationAction();
  }

  if (undoLastActionButton) {
    undoLastActionButton.disabled = !state.lastUndoableAction || isClassificationBusy();
  }

  if (refreshHistoryButton) {
    refreshHistoryButton.disabled = state.history.isLoading || isClassificationBusy();
  }
}

function setUiDisplayMode(mode: UiDisplayMode): void {
  state.uiMode = mode;
  if (mode === "advanced") {
    if (diagnosticPanel) {
      diagnosticPanel.open = true;
    }
    if (advancedPanel) {
      advancedPanel.open = true;
    }
  } else {
    if (diagnosticPanel) {
      diagnosticPanel.open = false;
    }
    if (advancedPanel) {
      advancedPanel.open = false;
    }
  }
  render();
}

function renderUiDisplayMode(): void {
  if (simpleModeButton) {
    simpleModeButton.setAttribute("aria-pressed", String(state.uiMode === "simple"));
  }

  if (advancedModeButton) {
    advancedModeButton.setAttribute("aria-pressed", String(state.uiMode === "advanced"));
  }
}

function renderAiTextStatus(): void {
  if (!aiTextStatus) {
    return;
  }

  const status = aiTextStatusLabel();
  aiTextStatus.textContent = status;
  aiTextStatus.title = status;
}

function aiTextStatusLabel(): string {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return "Sélectionnez un document à trier.";
  }

  if (activeDocument.status === "missing") {
    return "Document indisponible.";
  }

  const extraction = getTextExtractionState(activeDocument.filePath);
  if (extraction.status === "extracting") {
    return activeDocument.extension === ".pdf" ? "Extraction texte..." : "OCR en cours...";
  }

  if (extraction.status === "text-found") {
    return "Texte OK.";
  }

  if (extraction.status === "empty") {
    return "Texte non disponible. OCR nécessaire.";
  }

  if (extraction.status === "error") {
    return extraction.error?.message ?? "Texte non disponible.";
  }

  if (activeDocument.extension === ".pdf") {
    return "Texte non extrait. L'analyse IA peut l'extraire.";
  }

  return "Texte non extrait. OCR nécessaire.";
}
