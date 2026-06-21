async function selectSourceDirectory(): Promise<void> {
  setControlsDisabled(true);
  const selection = await DocSorterSourceDirectoryPicker.openSourceDirectoryPicker({
    initialPath: state.sourcePath,
    listDirectory: (sourcePath) => window.docSorter.listSourceDirectory(sourcePath),
    selectDirectory: (sourcePath) => window.docSorter.selectSourceDirectory(sourcePath)
  });
  setControlsDisabled(false);

  if (!selection.ok) {
    state.queueMessage = selection.error.message;
    render();
    return;
  }

  if (!selection.value) {
    return;
  }

  await applySelectedSourceDirectory(selection.value);
}

async function applySelectedSourceDirectory(selection: { path: string }): Promise<void> {
  clearPreviewResources();
  state.sourcePath = selection.path;
  state.documents = [];
  state.activeDocumentPath = null;
  state.queueView = createIdleQueueViewState();
  state.preview = createIdlePreviewState();
  resetNamingState();
  resetDuplicateAnalysisState();
  resetTextExtractionState();
  state.queueMessage = "Analyse du dossier source";
  render();

  await refreshDocuments({
    preserveSelection: false,
    successMessage: ""
  });
}

async function selectTargetDirectory(): Promise<void> {
  setControlsDisabled(true);
  const selection = await window.docSorter.selectTargetDirectory();
  setControlsDisabled(false);

  if (!selection.ok) {
    state.queueMessage = selection.error.message;
    render();
    return;
  }

  if (!selection.value) {
    return;
  }

  state.targetPath = selection.value.path;
  state.targetFolder = createIdleTargetFolderState();
  resetClassificationState();
  render();
  await loadTargetFolders();
  scheduleDestinationCheck();
}

async function refreshDocuments(options: RefreshOptions): Promise<void> {
  if (!state.sourcePath) {
    state.queueMessage = "Aucun dossier source sélectionné";
    render();
    return;
  }

  const activeDocumentPathBeforeRefresh =
    options.preferredSelectionPath ?? (options.preserveSelection ? state.activeDocumentPath : null);
  state.isLoading = true;
  state.queueMessage = options.preserveSelection
    ? "Rafraîchissement du dossier source"
    : "Analyse du dossier source";
  render();

  const result = await window.docSorter.refreshSourceDocuments();
  state.isLoading = false;

  if (!result.ok) {
    applyDiscoveryError(result.error);
    render();
    return;
  }

  clearPreviewResources();
  state.documents = result.value.documents;
  resetClassificationState();
  resetDuplicateAnalysisState();
  resetTextExtractionState();
  const activeDocumentAfterRefresh = activeDocumentPathBeforeRefresh
    ? state.documents.find((documentItem) => documentItem.filePath === activeDocumentPathBeforeRefresh) ?? null
    : null;

  if (activeDocumentAfterRefresh) {
    state.activeDocumentPath = activeDocumentAfterRefresh.filePath;
    state.preview = {
      ...createIdlePreviewState(),
      status: "loading"
    };
    state.queueMessage = options.successMessage;
    render();
    scheduleDestinationCheck();
    void loadActivePreview(activeDocumentAfterRefresh);
    return;
  }

  state.activeDocumentPath = null;
  state.preview =
    activeDocumentPathBeforeRefresh && state.documents.length > 0
      ? {
          ...createIdlePreviewState(),
          status: "error",
          errorMessage: "Le document sélectionné n'est plus disponible"
        }
      : createIdlePreviewState();
  if (!state.activeDocumentPath) {
    resetNamingState();
  }
  state.queueMessage = refreshQueueMessage(
    Boolean(activeDocumentPathBeforeRefresh),
    options.successMessage
  );
  render();
}

function applyDiscoveryError(error: AppError): void {
  clearPreviewResources();
  state.documents = [];
  state.activeDocumentPath = null;
  state.preview = createIdlePreviewState();
  resetNamingState();
  resetDuplicateAnalysisState();
  resetTextExtractionState();
  state.queueMessage = error.message;
}

function selectDocument(documentItem: DocumentItem): void {
  if (state.activeDocumentPath === documentItem.filePath) {
    return;
  }

  clearPreviewResources();
  state.activeDocumentPath = documentItem.filePath;
  state.preview = {
    ...createIdlePreviewState(),
    status: "loading"
  };
  resetNamingState();
  resetAiSuggestionState();
  render();
  void initializeNamingDraft(documentItem);
  void refreshFolderLearningForCurrentTargetFolder();
  void loadActivePreview(documentItem);
}

async function loadActivePreview(documentItem: DocumentItem): Promise<void> {
  const requestId = ++previewRequestId;
  const result = await window.docSorter.getPreviewData(documentItem.filePath);

  if (requestId !== previewRequestId || state.activeDocumentPath !== documentItem.filePath) {
    return;
  }

  if (!result.ok) {
    if (shouldMarkDocumentUnavailable(result.error)) {
      markDocumentUnavailable(documentItem.filePath);
    }

    state.preview = {
      ...createIdlePreviewState(),
      status: "error",
      errorMessage: previewErrorMessage(result.error, documentItem.extension)
    };
    render();
    return;
  }

  const previewData = result.value as RendererPreviewData;

  if (previewData.kind === "image") {
    state.preview = {
      ...createIdlePreviewState(),
      status: "ready",
      data: previewData
    };
    render();
    return;
  }

  try {
    const availableWidth = previewPanel.getAvailableWidth(800);
    const loadResult = await window.docSorterPdfPreview.load(previewData, availableWidth);

    if (requestId !== previewRequestId || state.activeDocumentPath !== documentItem.filePath) {
      return;
    }

    state.preview = {
      ...createIdlePreviewState(),
      status: "ready",
      data: previewData,
      zoom: loadResult.fitZoom,
      pdfFitZoom: loadResult.fitZoom,
      pdfPage: 1,
      pdfPageCount: loadResult.pageCount
    };
    render();
  } catch {
    if (requestId !== previewRequestId || state.activeDocumentPath !== documentItem.filePath) {
      return;
    }

    state.preview = {
      ...createIdlePreviewState(),
      status: "error",
      errorMessage: "Aperçu PDF indisponible"
    };
    render();
  }
}

function setControlsDisabled(disabled: boolean): void {
  const shouldDisable = disabled || isClassificationBusy();

  if (selectSourceButton) {
    selectSourceButton.disabled = shouldDisable;
  }

  if (refreshSourceButton) {
    refreshSourceButton.disabled = shouldDisable || !state.sourcePath;
  }

  if (selectTargetButton) {
    selectTargetButton.disabled = shouldDisable;
  }

  if (analyzeDuplicatesButton) {
    analyzeDuplicatesButton.disabled =
      shouldDisable || !state.sourcePath || state.documents.length === 0 || state.duplicates.status === "analyzing";
  }

  if (trashActiveDocumentButton) {
    trashActiveDocumentButton.disabled = shouldDisable || !getActiveDocument();
  }

  if (deleteActiveDocumentButton) {
    deleteActiveDocumentButton.disabled = shouldDisable || !getActiveDocument();
  }

  const duplicateDiscardCount = getDuplicateDiscardCandidates().length;
  if (trashDuplicateDocumentsButton) {
    trashDuplicateDocumentsButton.disabled = shouldDisable || duplicateDiscardCount === 0;
  }

  if (deleteDuplicateDocumentsButton) {
    deleteDuplicateDocumentsButton.disabled = shouldDisable || duplicateDiscardCount === 0;
  }
}

function refreshQueueMessage(activeDocumentLost: boolean, successMessage: string): string {
  if (activeDocumentLost) {
    return "Le document sélectionné n'est plus disponible";
  }

  if (state.documents.length === 0) {
    return "Aucun document PDF/JPG/PNG trouvé";
  }

  return successMessage;
}

function getActiveDocument(): DocumentItem | null {
  return state.documents.find((documentItem) => documentItem.filePath === state.activeDocumentPath) ?? null;
}

function markDocumentUnavailable(filePath: string): void {
  state.documents = state.documents.map((documentItem) =>
    documentItem.filePath === filePath
      ? {
          ...documentItem,
          status: "missing"
        }
      : documentItem
  );
}

function shouldMarkDocumentUnavailable(error: AppError): boolean {
  return (
    error.code === "FILE_NOT_FOUND" ||
    error.code === "FILE_ACCESS_DENIED" ||
    error.code === "FILE_UNAVAILABLE"
  );
}

function updatePreviewZoom(zoom: number): void {
  if (state.preview.status !== "ready" || !state.preview.data) {
    return;
  }

  state.preview.zoom = previewPanel.clampZoom(zoom);
  render();
}

function clearPreviewResources(): void {
  previewRequestId += 1;
  previewPanel.clearResources();
}

function previewErrorMessage(error: AppError, extension: SupportedDocumentExtension): string {
  if (error.code === "PREVIEW_FILE_TOO_LARGE") {
    return "Aperçu désactivé : fichier trop volumineux.";
  }

  if (extension === ".pdf" && error.code === "UNKNOWN_ERROR") {
    return "Aperçu PDF indisponible";
  }

  return error.message;
}

function statusLabel(status: DocumentItem["status"]): string {
  switch (status) {
    case "pending":
      return "À analyser";
    case "missing":
      return "Indisponible";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

