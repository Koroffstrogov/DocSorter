type SupportedDocumentExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";
type PreviewKind = "image" | "pdf";
type PreviewStatus = "idle" | "loading" | "ready" | "error";
type NamingMessageLevel = "error" | "warning" | "info";
type ClassificationPanelStatus = "idle" | "preparing" | "ready" | "blocked" | "executing" | "undoing";
type DestinationCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "collision"
  | "target-not-selected"
  | "invalid"
  | "error";
type ClassificationPlanCheckStatus = "ok" | "blocking" | "not-run";
type DuplicateAnalysisStatus = "idle" | "analyzing" | "ready" | "error";

interface AppError {
  code:
    | "SOURCE_NOT_SELECTED"
    | "DIRECTORY_NOT_FOUND"
    | "DIRECTORY_ACCESS_DENIED"
    | "DIRECTORY_UNAVAILABLE"
    | "FILE_NOT_FOUND"
    | "FILE_ACCESS_DENIED"
    | "FILE_UNAVAILABLE"
    | "UNSUPPORTED_FILE_TYPE"
    | "PREVIEW_NOT_ALLOWED"
    | "UNKNOWN_ERROR";
  message: string;
}

interface DocumentItem {
  name: string;
  filePath: string;
  extension: SupportedDocumentExtension;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  status: "pending" | "missing";
}

interface RendererPreviewData {
  kind: PreviewKind;
  filePath: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  bytes: ArrayBuffer;
}

interface NamingDraft {
  documentDate: string;
  subject: string;
  documentType: string;
  keywords: string;
}

interface NamingMessage {
  level: NamingMessageLevel;
  code: string;
  message: string;
}

interface ProposedFilename {
  proposedFilename: string;
  isValid: boolean;
  messages: NamingMessage[];
  normalizedDraft: NamingDraft;
}

interface NamingState {
  draft: NamingDraft;
  proposal: ProposedFilename | null;
  overrideFilename: string | null;
  isLoading: boolean;
}

interface DestinationAvailabilityError {
  code:
    | "TARGET_NOT_SELECTED"
    | "TARGET_NOT_FOUND"
    | "TARGET_NOT_DIRECTORY"
    | "TARGET_ACCESS_DENIED"
    | "INVALID_FILENAME"
    | "TOO_MANY_COLLISIONS"
    | "UNKNOWN_ERROR";
  message: string;
}

interface DestinationAvailability {
  status: "available" | "collision";
  targetPath: string;
  proposedFilename: string;
  finalFilename: string;
  finalPath: string;
  alternativeFilename: string | null;
  message: string;
}

interface DestinationCheckState {
  status: DestinationCheckStatus;
  result: DestinationAvailability | null;
  error: DestinationAvailabilityError | null;
  checkedFilename: string;
}

interface ClassificationPlanCheck {
  code: string;
  label: string;
  status: ClassificationPlanCheckStatus;
  message: string;
}

interface ClassificationPlan {
  status: "ready" | "blocked";
  sourcePath: string;
  currentName: string;
  targetPath: string;
  proposedFilename: string;
  destinationPath: string;
  extension: string;
  sourceFileStatus: string;
  targetDirectoryStatus: string;
  collisionStatus: string;
  preparedAt: string;
  checks: ClassificationPlanCheck[];
  message: string;
  simulationOnly: true;
}

interface ClassificationPlanError {
  code: string;
  message: string;
}

interface UndoableClassificationAction {
  id: string;
  completedAt: string;
  originalPath: string;
  classifiedPath: string;
  originalName: string;
  classifiedName: string;
  sourceHashSha256: string;
}

interface ClassificationOperationError {
  code: string;
  message: string;
}

interface UndoClassificationError {
  code: string;
  message: string;
}

interface ActionJournalEntry {
  id: string;
  timestamp: string;
  action: "classify" | "undo-classify";
  status: "started" | "completed" | "failed";
  originalActionId?: string;
  oldPath?: string;
  newPath?: string;
  oldName?: string;
  newName?: string;
  restoredPath?: string;
  classifiedPath?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface DuplicateFileReference {
  filePath: string;
  name: string;
}

interface SourceQueueDuplicateMatch {
  type: "source-queue";
  hash: string;
  files: DuplicateFileReference[];
  reliable: true;
}

interface HistoryDuplicateMatch {
  type: "history";
  hash: string;
  sourceFile: DuplicateFileReference;
  historyFile: DuplicateFileReference & {
    originalName: string;
    classifiedName: string;
    actionId: string;
  };
  reliable: true;
}

type ExactDuplicateMatch = SourceQueueDuplicateMatch | HistoryDuplicateMatch;

interface ExactDuplicateFileError {
  filePath: string;
  name: string;
  code: "FILE_NOT_FOUND" | "FILE_HASH_FAILED";
  message: string;
}

interface ExactDuplicateAnalysis {
  analyzedAt: string;
  sourceFileCount: number;
  hashedSourceFileCount: number;
  matches: ExactDuplicateMatch[];
  fileErrors: ExactDuplicateFileError[];
  ignoredHistoryCount: number;
}

interface DuplicateAnalysisState {
  status: DuplicateAnalysisStatus;
  matches: ExactDuplicateMatch[];
  fileErrors: ExactDuplicateFileError[];
  ignoredFilePaths: string[];
  errorMessage: string;
  analyzedAt: string;
}

interface ClassificationState {
  status: ClassificationPanelStatus;
  plan: ClassificationPlan | null;
  error: ClassificationPlanError | ClassificationOperationError | UndoClassificationError | null;
}

interface HistoryState {
  entries: ActionJournalEntry[];
  isLoading: boolean;
  errorMessage: string;
}

interface PreviewState {
  status: PreviewStatus;
  data: RendererPreviewData | null;
  errorMessage: string;
  zoom: number;
  rotation: number;
  pdfPage: number;
  pdfPageCount: number;
  pdfFitZoom: number;
}

interface QueueUiState {
  query: string;
  filter: QueueViewFilter;
  sortKey: QueueViewSortKey;
  sortDirection: QueueViewSortDirection;
}

interface AppState {
  sourcePath: string | null;
  targetPath: string | null;
  documents: DocumentItem[];
  activeDocumentPath: string | null;
  queueMessage: string;
  queueView: QueueUiState;
  isLoading: boolean;
  preview: PreviewState;
  naming: NamingState;
  destination: DestinationCheckState;
  classification: ClassificationState;
  lastUndoableAction: UndoableClassificationAction | null;
  history: HistoryState;
  duplicates: DuplicateAnalysisState;
}

interface RefreshOptions {
  preserveSelection: boolean;
  successMessage: string;
  preferredSelectionPath?: string;
}

const minPreviewZoom = 0.5;
const maxPreviewZoom = 3;
const previewZoomStep = 0.25;

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
  destination: createIdleDestinationCheckState(),
  classification: createIdleClassificationState(),
  lastUndoableAction: null,
  history: createIdleHistoryState(),
  duplicates: createIdleDuplicateAnalysisState()
};

let previewRequestId = 0;
let pdfRenderRequestId = 0;
let namingRequestId = 0;
let destinationRequestId = 0;
let classificationRequestId = 0;
let duplicateAnalysisRequestId = 0;
let destinationCheckTimer: number | null = null;

const version = document.querySelector<HTMLElement>("#app-version");
const selectSourceButton = document.querySelector<HTMLButtonElement>("#select-source");
const refreshSourceButton = document.querySelector<HTMLButtonElement>("#refresh-source");
const selectTargetButton = document.querySelector<HTMLButtonElement>("#select-target");
const analyzeDuplicatesButton = document.querySelector<HTMLButtonElement>("#analyze-duplicates");
const sourcePath = document.querySelector<HTMLElement>("#source-path");
const targetPath = document.querySelector<HTMLElement>("#target-path");
const queueCount = document.querySelector<HTMLElement>("#queue-count");
const queueState = document.querySelector<HTMLElement>("#queue-state");
const documentList = document.querySelector<HTMLOListElement>("#document-list");
const queueSearchInput = document.querySelector<HTMLInputElement>("#queue-search");
const clearQueueSearchButton = document.querySelector<HTMLButtonElement>("#clear-queue-search");
const queueFilterButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-queue-filter]")
);
const queueSortSelect = document.querySelector<HTMLSelectElement>("#queue-sort");
const queueSortDirectionButton = document.querySelector<HTMLButtonElement>("#queue-sort-direction");
const previousDocumentButton = document.querySelector<HTMLButtonElement>("#previous-document");
const nextDocumentButton = document.querySelector<HTMLButtonElement>("#next-document");
const previewContent = document.querySelector<HTMLElement>("#preview-content");
const previewControls = document.querySelector<HTMLElement>("#preview-controls");
const pdfPageControls = document.querySelector<HTMLElement>("#pdf-page-controls");
const previousPageButton = document.querySelector<HTMLButtonElement>("#previous-page");
const nextPageButton = document.querySelector<HTMLButtonElement>("#next-page");
const pageIndicator = document.querySelector<HTMLElement>("#page-indicator");
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
const zoomResetButton = document.querySelector<HTMLButtonElement>("#zoom-reset");
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
const rotatePreviewButton = document.querySelector<HTMLButtonElement>("#rotate-preview");
const statusText = document.querySelector<HTMLElement>("#status-text");
const documentDetails = document.querySelector<HTMLElement>("#document-details");
const duplicatePanel = document.querySelector<HTMLElement>("#duplicate-panel");
const duplicateDetails = document.querySelector<HTMLElement>("#duplicate-details");
const ignoreDuplicateButton = document.querySelector<HTMLButtonElement>("#ignore-duplicate");
const keepDuplicateButton = document.querySelector<HTMLButtonElement>("#keep-duplicate");
const namingPanel = document.querySelector<HTMLElement>("#naming-panel");
const namingDateInput = document.querySelector<HTMLInputElement>("#naming-date");
const namingSubjectInput = document.querySelector<HTMLInputElement>("#naming-subject");
const namingTypeInput = document.querySelector<HTMLInputElement>("#naming-type");
const namingKeywordsInput = document.querySelector<HTMLInputElement>("#naming-keywords");
const resetNamingButton = document.querySelector<HTMLButtonElement>("#reset-naming");
const proposedFilename = document.querySelector<HTMLElement>("#proposed-filename");
const namingMessages = document.querySelector<HTMLUListElement>("#naming-messages");
const destinationStatus = document.querySelector<HTMLElement>("#destination-status");
const destinationTarget = document.querySelector<HTMLElement>("#destination-target");
const destinationFinalPath = document.querySelector<HTMLElement>("#destination-final-path");
const destinationAlternative = document.querySelector<HTMLElement>("#destination-alternative");
const applyDestinationAlternativeButton = document.querySelector<HTMLButtonElement>(
  "#apply-destination-alternative"
);
const prepareClassificationButton = document.querySelector<HTMLButtonElement>("#prepare-classification");
const executeClassificationButton = document.querySelector<HTMLButtonElement>("#execute-classification");
const undoLastActionButton = document.querySelector<HTMLButtonElement>("#undo-last-action");
const classificationSummary = document.querySelector<HTMLElement>("#classification-summary");
const refreshHistoryButton = document.querySelector<HTMLButtonElement>("#refresh-history");
const historyState = document.querySelector<HTMLElement>("#history-state");
const historyList = document.querySelector<HTMLOListElement>("#history-list");

void window.docSorter.getVersion().then((value) => {
  if (version) {
    version.textContent = `v${value}`;
  }
});

void refreshLastUndoableAction();
void refreshRecentHistory();

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

analyzeDuplicatesButton?.addEventListener("click", () => {
  void analyzeExactDuplicates();
});

queueSearchInput?.addEventListener("input", () => {
  state.queueView.query = queueSearchInput.value;
  renderQueue();
});

clearQueueSearchButton?.addEventListener("click", () => {
  state.queueView.query = "";
  renderQueue();
});

queueFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.queueFilter;
    if (!isQueueFilter(filter)) {
      return;
    }

    state.queueView.filter = filter;
    renderQueue();
  });
});

queueSortSelect?.addEventListener("change", () => {
  const sortKey = queueSortSelect.value;
  if (!isQueueSortKey(sortKey)) {
    return;
  }

  state.queueView.sortKey = sortKey;
  renderQueue();
});

queueSortDirectionButton?.addEventListener("click", () => {
  state.queueView.sortDirection = state.queueView.sortDirection === "asc" ? "desc" : "asc";
  renderQueue();
});

previousDocumentButton?.addEventListener("click", () => {
  navigateVisibleQueue("previous");
});

nextDocumentButton?.addEventListener("click", () => {
  navigateVisibleQueue("next");
});

previousPageButton?.addEventListener("click", () => {
  if (state.preview.data?.kind !== "pdf") {
    return;
  }

  state.preview.pdfPage = Math.max(1, state.preview.pdfPage - 1);
  render();
});

nextPageButton?.addEventListener("click", () => {
  if (state.preview.data?.kind !== "pdf") {
    return;
  }

  state.preview.pdfPage = Math.min(state.preview.pdfPageCount, state.preview.pdfPage + 1);
  render();
});

zoomOutButton?.addEventListener("click", () => {
  updatePreviewZoom(state.preview.zoom - previewZoomStep);
});

zoomInButton?.addEventListener("click", () => {
  updatePreviewZoom(state.preview.zoom + previewZoomStep);
});

zoomResetButton?.addEventListener("click", () => {
  if (state.preview.data?.kind === "pdf") {
    updatePreviewZoom(state.preview.pdfFitZoom || 1);
    return;
  }

  updatePreviewZoom(1);
});

rotatePreviewButton?.addEventListener("click", () => {
  if (state.preview.data?.kind !== "image") {
    return;
  }

  state.preview.rotation = (state.preview.rotation + 90) % 360;
  render();
});

[namingDateInput, namingSubjectInput, namingTypeInput, namingKeywordsInput].forEach((input) => {
  input?.addEventListener("input", () => {
    updateNamingDraftFromInputs();
  });
});

resetNamingButton?.addEventListener("click", () => {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  void initializeNamingDraft(activeDocument);
});

applyDestinationAlternativeButton?.addEventListener("click", () => {
  const alternativeFilename = state.destination.result?.alternativeFilename;
  if (!alternativeFilename) {
    return;
  }

  state.naming.overrideFilename = alternativeFilename;
  resetClassificationState();
  resetDestinationCheck();
  renderNamingPanel(false);
  scheduleDestinationCheck();
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

ignoreDuplicateButton?.addEventListener("click", () => {
  ignoreActiveDuplicateForSession();
});

keepDuplicateButton?.addEventListener("click", () => {
  ignoreActiveDuplicateForSession();
});

refreshHistoryButton?.addEventListener("click", () => {
  void refreshRecentHistory();
});

render();

async function selectSourceDirectory(): Promise<void> {
  setControlsDisabled(true);
  const selection = await window.docSorter.selectSourceDirectory();
  setControlsDisabled(false);

  if (!selection.ok) {
    state.queueMessage = selection.error.message;
    render();
    return;
  }

  if (!selection.value) {
    return;
  }

  clearPreviewResources();
  state.sourcePath = selection.value.path;
  state.documents = [];
  state.activeDocumentPath = null;
  state.queueView = createIdleQueueViewState();
  state.preview = createIdlePreviewState();
  resetNamingState();
  resetDuplicateAnalysisState();
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
  resetClassificationState();
  render();
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
  render();
  void initializeNamingDraft(documentItem);
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
    const availableWidth = previewContent?.clientWidth ?? 800;
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
}

function render(): void {
  renderControls();
  renderPaths();
  renderQueue();
  renderPreview();
  renderDetails();
  renderHistory();
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

function renderPaths(): void {
  sourcePath?.replaceChildren(state.sourcePath ?? "Aucun dossier source sélectionné");
  targetPath?.replaceChildren(state.targetPath ?? "Aucun dossier cible sélectionné");
}

function renderQueue(): void {
  const visibleQueue = getVisibleQueue();
  queueCount?.replaceChildren(
    `${visibleQueue.visibleCount} / ${visibleQueue.totalCount} document${
      visibleQueue.totalCount > 1 ? "s" : ""
    } affiché${visibleQueue.visibleCount > 1 ? "s" : ""}`
  );
  documentList?.replaceChildren(...visibleQueue.documents.map(createDocumentListItem));
  renderQueueTools(visibleQueue);

  if (!queueState) {
    return;
  }

  if (state.isLoading) {
    queueState.hidden = false;
    queueState.replaceChildren(state.queueMessage || "Analyse du dossier source");
    return;
  }

  const messages: string[] = [];
  if (state.queueMessage) {
    messages.push(state.queueMessage);
  }

  if (state.documents.length > 0 && visibleQueue.visibleCount === 0) {
    messages.push("Aucun document ne correspond aux filtres.");
  } else if (state.activeDocumentPath && !visibleQueue.activeDocumentVisible) {
    messages.push("Le document actif est masqué par la recherche ou le filtre.");
  }

  queueState.hidden = messages.length === 0;
  queueState.replaceChildren(messages.join(" "));
}

function createDocumentListItem(documentItem: DocumentItem): HTMLLIElement {
  const listItem = document.createElement("li");
  const button = document.createElement("button");
  const icon = document.createElement("span");
  const content = document.createElement("span");
  const title = document.createElement("strong");
  const meta = document.createElement("small");
  const status = document.createElement("span");

  button.type = "button";
  button.className = "document-item";
  button.title = documentItem.name;
  button.ariaPressed = String(documentItem.filePath === state.activeDocumentPath);
  if (documentItem.filePath === state.activeDocumentPath) {
    button.classList.add("selected");
  }
  if (documentItem.status === "missing") {
    button.classList.add("missing");
  }
  if (documentItem.status !== "missing" && documentHasVisibleDuplicate(documentItem.filePath)) {
    button.classList.add("duplicate");
  }

  icon.className = "document-icon";
  icon.textContent = documentItem.extension.replace(".", "").toUpperCase();

  title.textContent = documentItem.name;
  title.title = documentItem.name;
  meta.textContent = `${documentItem.extension.toUpperCase()} · ${documentItem.sizeLabel}`;
  status.className = "status-badge";
  status.textContent = documentQueueStatusLabel(documentItem);
  status.title = documentQueueStatusLabel(documentItem);

  content.append(title, meta, status);
  button.append(icon, content);
  button.addEventListener("click", () => {
    selectDocument(documentItem);
  });

  listItem.append(button);
  return listItem;
}

function renderQueueTools(visibleQueue: QueueViewResult<DocumentItem>): void {
  const toolsDisabled = state.documents.length === 0 || state.isLoading;

  if (queueSearchInput) {
    queueSearchInput.disabled = toolsDisabled;
    queueSearchInput.value = state.queueView.query;
  }

  if (clearQueueSearchButton) {
    clearQueueSearchButton.disabled = toolsDisabled || state.queueView.query.length === 0;
  }

  queueFilterButtons.forEach((button) => {
    const filter = button.dataset.queueFilter;
    const isActive = filter === state.queueView.filter;
    button.disabled = toolsDisabled;
    button.ariaPressed = String(isActive);
  });

  if (queueSortSelect) {
    queueSortSelect.disabled = toolsDisabled;
    queueSortSelect.value = state.queueView.sortKey;
  }

  if (queueSortDirectionButton) {
    queueSortDirectionButton.disabled = toolsDisabled;
    queueSortDirectionButton.replaceChildren(queueSortDirectionLabel());
    queueSortDirectionButton.title =
      state.queueView.sortDirection === "asc" ? "Tri ascendant" : "Tri descendant";
  }

  const previousPath = DocSorterQueueView.findAdjacentVisibleDocumentPath(
    visibleQueue.documents,
    state.activeDocumentPath,
    "previous"
  );
  const nextPath = DocSorterQueueView.findAdjacentVisibleDocumentPath(
    visibleQueue.documents,
    state.activeDocumentPath,
    "next"
  );

  if (previousDocumentButton) {
    previousDocumentButton.disabled = toolsDisabled || !previousPath;
  }
  if (nextDocumentButton) {
    nextDocumentButton.disabled = toolsDisabled || !nextPath;
  }
}

function getVisibleQueue(): QueueViewResult<DocumentItem> {
  return DocSorterQueueView.buildVisibleQueue(state.documents, {
    query: state.queueView.query,
    filter: state.queueView.filter,
    sortKey: state.queueView.sortKey,
    sortDirection: state.queueView.sortDirection,
    duplicateFilePaths: getDuplicateDocumentPathList(),
    activeDocumentPath: state.activeDocumentPath
  });
}

function getDuplicateDocumentPathList(): string[] {
  if (state.duplicates.status !== "ready") {
    return [];
  }

  const ignoredFilePaths = new Set(state.duplicates.ignoredFilePaths);
  const duplicateFilePaths = new Set<string>();

  for (const match of state.duplicates.matches) {
    if (match.type === "source-queue") {
      match.files.forEach((file) => duplicateFilePaths.add(file.filePath));
    } else {
      duplicateFilePaths.add(match.sourceFile.filePath);
    }
  }

  return Array.from(duplicateFilePaths).filter((filePath) => !ignoredFilePaths.has(filePath));
}

function navigateVisibleQueue(direction: QueueViewNavigationDirection): void {
  const visibleQueue = getVisibleQueue();
  const targetPath = DocSorterQueueView.findAdjacentVisibleDocumentPath(
    visibleQueue.documents,
    state.activeDocumentPath,
    direction
  );
  if (!targetPath) {
    return;
  }

  selectDocumentByPath(targetPath);
}

function selectDocumentByPath(filePath: string): void {
  const documentItem = state.documents.find((candidate) => candidate.filePath === filePath);
  if (!documentItem) {
    return;
  }

  selectDocument(documentItem);
}

function queueSortDirectionLabel(): string {
  if (state.queueView.sortKey === "name") {
    return state.queueView.sortDirection === "asc" ? "A → Z" : "Z → A";
  }

  return state.queueView.sortDirection === "asc" ? "Asc" : "Desc";
}

function isQueueFilter(value: string | undefined): value is QueueViewFilter {
  return (
    value === "all" ||
    value === "pdf" ||
    value === "images" ||
    value === "duplicates" ||
    value === "missing" ||
    value === "pending"
  );
}

function isQueueSortKey(value: string): value is QueueViewSortKey {
  return (
    value === "name" ||
    value === "modifiedAt" ||
    value === "sizeBytes" ||
    value === "extension" ||
    value === "status"
  );
}

function renderPreview(): void {
  renderPreviewControls();

  if (!previewContent) {
    return;
  }

  const activeDocument = getActiveDocument();

  if (!activeDocument && state.preview.status === "error") {
    statusText?.replaceChildren("Document indisponible");
    previewContent.replaceChildren(createPlaceholder(state.preview.errorMessage));
    return;
  }

  if (!activeDocument) {
    statusText?.replaceChildren("Lecture seule");
    previewContent.replaceChildren(createPlaceholder("Sélectionnez un document"));
    return;
  }

  if (state.preview.status === "loading") {
    statusText?.replaceChildren("Chargement");
    previewContent.replaceChildren(createPlaceholder("Chargement de l'aperçu..."));
    return;
  }

  if (state.preview.status === "error") {
    statusText?.replaceChildren("Erreur d'aperçu");
    previewContent.replaceChildren(createPlaceholder(state.preview.errorMessage));
    return;
  }

  if (state.preview.status !== "ready" || !state.preview.data) {
    statusText?.replaceChildren(statusLabel(activeDocument.status));
    previewContent.replaceChildren(createPlaceholder("Chargement de l'aperçu..."));
    return;
  }

  if (state.preview.data.kind === "image") {
    statusText?.replaceChildren(`${Math.round(state.preview.zoom * 100)}%`);
    window.docSorterPdfPreview.clear();
    window.docSorterImagePreview.render({
      container: previewContent,
      data: state.preview.data,
      zoom: state.preview.zoom,
      rotation: state.preview.rotation
    });
    return;
  }

  statusText?.replaceChildren(`${state.preview.pdfPage} / ${state.preview.pdfPageCount}`);
  window.docSorterImagePreview.clear();
  renderPdfPage(previewContent, state.preview.pdfPage, state.preview.zoom);
}

function renderPreviewControls(): void {
  const data = state.preview.status === "ready" ? state.preview.data : null;
  const isPdf = data?.kind === "pdf";
  const isImage = data?.kind === "image";

  if (previewControls) {
    previewControls.hidden = !data;
  }

  if (pdfPageControls) {
    pdfPageControls.hidden = !isPdf;
  }

  if (rotatePreviewButton) {
    rotatePreviewButton.hidden = !isImage;
  }

  if (pageIndicator) {
    pageIndicator.replaceChildren(`${state.preview.pdfPage} / ${state.preview.pdfPageCount}`);
  }

  if (previousPageButton) {
    previousPageButton.disabled = !isPdf || state.preview.pdfPage <= 1;
  }

  if (nextPageButton) {
    nextPageButton.disabled = !isPdf || state.preview.pdfPage >= state.preview.pdfPageCount;
  }

  if (zoomOutButton) {
    zoomOutButton.disabled = !data || state.preview.zoom <= minPreviewZoom;
  }

  if (zoomInButton) {
    zoomInButton.disabled = !data || state.preview.zoom >= maxPreviewZoom;
  }

  if (zoomResetButton) {
    zoomResetButton.disabled = !data;
    zoomResetButton.replaceChildren(`${Math.round(state.preview.zoom * 100)}%`);
  }
}

function renderPdfPage(container: HTMLElement, pageNumber: number, zoom: number): void {
  const renderRequestId = ++pdfRenderRequestId;

  void window.docSorterPdfPreview.renderPage(container, pageNumber, zoom).catch(() => {
    if (renderRequestId !== pdfRenderRequestId || state.preview.data?.kind !== "pdf") {
      return;
    }

    state.preview = {
      ...createIdlePreviewState(),
      status: "error",
      errorMessage: "Aperçu PDF indisponible"
    };
    render();
  });
}

function renderDetails(): void {
  if (!documentDetails) {
    renderDuplicatePanel();
    renderNamingPanel(true);
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    documentDetails.className = "details-empty";
    documentDetails.replaceChildren("Aucun document actif");
    renderDuplicatePanel();
    renderNamingPanel(true);
    return;
  }

  documentDetails.className = "details-list";
  documentDetails.replaceChildren(
    createDetailRow("Nom", activeDocument.name),
    createDetailRow("Chemin complet", activeDocument.filePath),
    createDetailRow("Extension", activeDocument.extension.toUpperCase()),
    createDetailRow("Taille", activeDocument.sizeLabel),
    createDetailRow("Date de modification", formatDate(activeDocument.modifiedAt)),
    createDetailRow("Statut", statusLabel(activeDocument.status)),
    createDetailRow("Dossier cible", state.targetPath ?? "Aucun dossier cible sélectionné")
  );
  renderDuplicatePanel();
  renderNamingPanel(true);
}

function createDetailRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("strong");

  labelElement.textContent = label;
  valueElement.textContent = value;
  valueElement.title = value;
  row.append(labelElement, valueElement);

  return row;
}

async function analyzeExactDuplicates(): Promise<void> {
  if (
    !state.sourcePath ||
    state.documents.length === 0 ||
    state.duplicates.status === "analyzing" ||
    isClassificationBusy()
  ) {
    return;
  }

  const requestId = ++duplicateAnalysisRequestId;
  state.duplicates = {
    ...createIdleDuplicateAnalysisState(),
    status: "analyzing"
  };
  state.queueMessage = "Analyse des doublons exacts...";
  render();

  const result = await window.docSorter.analyzeExactDuplicates();
  if (requestId !== duplicateAnalysisRequestId) {
    return;
  }

  if (!result.ok) {
    state.duplicates = {
      ...createIdleDuplicateAnalysisState(),
      status: "error",
      errorMessage: result.error.message
    };
    state.queueMessage = result.error.message;
    render();
    return;
  }

  const analysis = result.value as ExactDuplicateAnalysis;
  state.duplicates = {
    status: "ready",
    matches: analysis.matches,
    fileErrors: analysis.fileErrors,
    ignoredFilePaths: [],
    errorMessage: "",
    analyzedAt: analysis.analyzedAt
  };

  for (const fileError of analysis.fileErrors) {
    markDocumentUnavailable(fileError.filePath);
  }

  state.queueMessage = duplicateAnalysisSummary(analysis);
  render();
}

function ignoreActiveDuplicateForSession(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || state.duplicates.ignoredFilePaths.includes(activeDocument.filePath)) {
    return;
  }

  state.duplicates = {
    ...state.duplicates,
    ignoredFilePaths: [...state.duplicates.ignoredFilePaths, activeDocument.filePath]
  };
  render();
}

function renderDuplicatePanel(): void {
  if (!duplicatePanel || !duplicateDetails) {
    return;
  }

  const activeDocument = getActiveDocument();
  const matches = activeDocument ? getVisibleDuplicateMatchesForDocument(activeDocument.filePath) : [];
  if (!activeDocument || matches.length === 0) {
    duplicatePanel.hidden = true;
    duplicateDetails.replaceChildren();
    return;
  }

  duplicatePanel.hidden = false;
  duplicateDetails.replaceChildren(
    createDuplicateSummary(matches),
    ...matches.map((match) => createDuplicateMatchItem(match, activeDocument.filePath))
  );

  const actionsDisabled = isClassificationBusy();
  if (ignoreDuplicateButton) {
    ignoreDuplicateButton.disabled = actionsDisabled;
  }
  if (keepDuplicateButton) {
    keepDuplicateButton.disabled = actionsDisabled;
  }
}

function createDuplicateSummary(matches: ExactDuplicateMatch[]): HTMLParagraphElement {
  const summary = document.createElement("p");
  summary.className = "duplicate-summary";
  summary.textContent = `${matches.length} correspondance${
    matches.length > 1 ? "s" : ""
  } exacte${matches.length > 1 ? "s" : ""} par hash SHA-256. Aucune suppression automatique.`;
  return summary;
}

function createDuplicateMatchItem(match: ExactDuplicateMatch, activeFilePath: string): HTMLDivElement {
  const item = document.createElement("div");
  const title = document.createElement("strong");
  const description = document.createElement("p");
  const hash = document.createElement("small");

  item.className = "duplicate-match";
  hash.textContent = `SHA-256 ${shortHash(match.hash)}`;

  if (match.type === "source-queue") {
    const otherFiles = match.files.filter((file) => file.filePath !== activeFilePath);
    title.textContent = "Doublon dans la file source";
    description.textContent = `Aussi présent : ${formatDuplicateNames(otherFiles)}`;
    item.title = otherFiles.map((file) => file.filePath).join("\n");
    item.append(title, description);
    const sourceLinks = createDuplicateSourceLinks(otherFiles);
    if (sourceLinks) {
      item.append(sourceLinks);
    }
    item.append(hash);
    return item;
  }

  title.textContent = "Doublon déjà classé";
  description.textContent = `${match.historyFile.classifiedName} depuis ${match.historyFile.originalName}`;
  item.title = match.historyFile.filePath;
  item.append(title, description, hash);
  return item;
}

function createDuplicateSourceLinks(files: DuplicateFileReference[]): HTMLDivElement | null {
  const availableFiles = files.filter((file) =>
    state.documents.some((documentItem) => documentItem.filePath === file.filePath)
  );
  if (availableFiles.length === 0) {
    return null;
  }

  const links = document.createElement("div");
  links.className = "duplicate-source-links";

  availableFiles.forEach((file) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.name;
    button.title = file.filePath;
    button.addEventListener("click", () => {
      selectDocumentByPath(file.filePath);
    });
    links.append(button);
  });

  return links;
}

function getVisibleDuplicateMatchesForDocument(filePath: string): ExactDuplicateMatch[] {
  if (state.duplicates.ignoredFilePaths.includes(filePath)) {
    return [];
  }

  return getDuplicateMatchesForDocument(filePath);
}

function getDuplicateMatchesForDocument(filePath: string): ExactDuplicateMatch[] {
  if (state.duplicates.status !== "ready") {
    return [];
  }

  return state.duplicates.matches.filter((match) =>
    match.type === "source-queue"
      ? match.files.some((file) => file.filePath === filePath)
      : match.sourceFile.filePath === filePath
  );
}

function documentHasVisibleDuplicate(filePath: string): boolean {
  return getVisibleDuplicateMatchesForDocument(filePath).length > 0;
}

function documentQueueStatusLabel(documentItem: DocumentItem): string {
  if (documentItem.status === "missing") {
    return statusLabel(documentItem.status);
  }

  return documentHasVisibleDuplicate(documentItem.filePath)
    ? "Doublon exact"
    : statusLabel(documentItem.status);
}

function duplicateAnalysisSummary(analysis: ExactDuplicateAnalysis): string {
  const duplicateDocumentCount = countDuplicateSourceDocuments(analysis.matches);
  const parts = [
    duplicateDocumentCount > 0
      ? `Analyse terminée : ${duplicateDocumentCount} document${
          duplicateDocumentCount > 1 ? "s" : ""
        } en doublon exact.`
      : "Analyse terminée : aucun doublon exact détecté."
  ];

  if (analysis.fileErrors.length > 0) {
    parts.push(
      `${analysis.fileErrors.length} document${
        analysis.fileErrors.length > 1 ? "s" : ""
      } indisponible${analysis.fileErrors.length > 1 ? "s" : ""}.`
    );
  }

  if (analysis.ignoredHistoryCount > 0) {
    parts.push(
      `${analysis.ignoredHistoryCount} entrée${
        analysis.ignoredHistoryCount > 1 ? "s" : ""
      } d'historique ignorée${analysis.ignoredHistoryCount > 1 ? "s" : ""}.`
    );
  }

  return parts.join(" ");
}

function countDuplicateSourceDocuments(matches: ExactDuplicateMatch[]): number {
  const filePaths = new Set<string>();
  for (const match of matches) {
    if (match.type === "source-queue") {
      match.files.forEach((file) => filePaths.add(file.filePath));
    } else {
      filePaths.add(match.sourceFile.filePath);
    }
  }

  return filePaths.size;
}

function formatDuplicateNames(files: DuplicateFileReference[]): string {
  if (files.length === 0) {
    return "aucun autre document visible";
  }

  return files.map((file) => file.name).join(", ");
}

function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 16)}...` : hash;
}

function createPlaceholder(message: string): HTMLDivElement {
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-card";
  placeholder.textContent = message;
  return placeholder;
}

async function initializeNamingDraft(documentItem: DocumentItem): Promise<void> {
  const requestId = ++namingRequestId;
  state.naming = {
    ...createIdleNamingState(),
    isLoading: true
  };
  renderNamingPanel(true);

  const draft = await window.docSorter.createInitialNamingDraft(documentItem.name);
  if (requestId !== namingRequestId || state.activeDocumentPath !== documentItem.filePath) {
    return;
  }

  state.naming = {
    draft,
    proposal: null,
    overrideFilename: null,
    isLoading: true
  };
  renderNamingPanel(true);
  await updateNamingProposal(documentItem.extension, requestId);
}

function updateNamingDraftFromInputs(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  state.naming.draft = {
    documentDate: namingDateInput?.value ?? "",
    subject: namingSubjectInput?.value ?? "",
    documentType: namingTypeInput?.value ?? "",
    keywords: namingKeywordsInput?.value ?? ""
  };
  state.naming.overrideFilename = null;
  state.naming.isLoading = true;
  resetClassificationState();
  resetDestinationCheck();
  renderNamingPanel(false);
  void updateNamingProposal(activeDocument.extension, ++namingRequestId);
}

async function updateNamingProposal(
  originalExtension: SupportedDocumentExtension,
  requestId: number
): Promise<void> {
  const proposal = await window.docSorter.buildNamingProposal(state.naming.draft, originalExtension);
  if (requestId !== namingRequestId) {
    return;
  }

  state.naming.proposal = proposal as ProposedFilename;
  state.naming.isLoading = false;
  renderNamingPanel(false);
  scheduleDestinationCheck();
}

function renderNamingPanel(syncInputs: boolean): void {
  const activeDocument = getActiveDocument();

  if (!namingPanel) {
    return;
  }

  namingPanel.hidden = !activeDocument;
  if (!activeDocument) {
    renderDestinationCheck();
    renderClassificationSummary();
    return;
  }

  if (syncInputs) {
    syncNamingInputs();
  }

  if (proposedFilename) {
    const effectiveFilename = getEffectiveProposedFilename();
    proposedFilename.className = state.naming.proposal?.isValid ? "valid" : "invalid";
    proposedFilename.replaceChildren(
      state.naming.isLoading
        ? "Calcul de la proposition..."
        : effectiveFilename || "Nom impossible à générer"
    );
    proposedFilename.title = effectiveFilename;
  }

  if (namingMessages) {
    const messages = state.naming.proposal?.messages ?? [
      {
        level: "warning",
        code: "DATE_REQUIRED",
        message: "Date documentaire à confirmer."
      }
    ];
    namingMessages.replaceChildren(...messages.map(createNamingMessageItem));
  }

  renderDestinationCheck();
  renderClassificationSummary();
}

function syncNamingInputs(): void {
  if (namingDateInput) {
    namingDateInput.value = state.naming.draft.documentDate;
  }
  if (namingSubjectInput) {
    namingSubjectInput.value = state.naming.draft.subject;
  }
  if (namingTypeInput) {
    namingTypeInput.value = state.naming.draft.documentType;
  }
  if (namingKeywordsInput) {
    namingKeywordsInput.value = state.naming.draft.keywords;
  }
}

function createNamingMessageItem(message: NamingMessage): HTMLLIElement {
  const item = document.createElement("li");
  item.className = message.level;
  item.textContent = message.message;
  return item;
}

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
    error: null
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
      error: null
    };
    render();
    return;
  }

  state.classification = {
    status: "blocked",
    plan: result.value as ClassificationPlan,
    error: result.error as ClassificationPlanError
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
    error: null
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
      error: result.error as ClassificationOperationError
    };
    state.queueMessage = result.error.message;
    render();
    void refreshRecentHistory();
    return;
  }

  state.lastUndoableAction = result.value.undoableAction as UndoableClassificationAction;
  state.queueMessage = result.value.message;
  void refreshRecentHistory();
  applySuccessfulClassification(activeDocument.filePath);
}

async function undoLastClassificationAction(): Promise<void> {
  if (!state.lastUndoableAction || isClassificationBusy()) {
    return;
  }

  const requestId = ++classificationRequestId;
  state.classification = {
    status: "undoing",
    plan: null,
    error: null
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
      error: result.error as UndoClassificationError
    };
    state.queueMessage = result.error.message;
    render();
    void refreshRecentHistory();
    return;
  }

  state.lastUndoableAction = null;
  state.queueMessage = result.value.message;
  resetClassificationState();
  await refreshLastUndoableAction();
  await refreshRecentHistory();

  if (!state.sourcePath) {
    render();
    return;
  }

  await refreshDocuments({
    preserveSelection: false,
    preferredSelectionPath: result.value.restoredPath,
    successMessage: result.value.message
  });
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
  render();

  if (!nextDocument) {
    return;
  }

  void initializeNamingDraft(nextDocument);
  void loadActivePreview(nextDocument);
}

function renderClassificationSummary(): void {
  if (!classificationSummary) {
    return;
  }

  const activeDocument = getActiveDocument();
  if (state.classification.status === "undoing") {
    classificationSummary.hidden = false;
    classificationSummary.replaceChildren(
      createClassificationHeading("Annulation", "En cours"),
      createClassificationNotice("Annulation de la dernière action en cours...")
    );
    return;
  }

  if (!activeDocument || state.classification.status === "idle") {
    classificationSummary.hidden = true;
    classificationSummary.replaceChildren();
    return;
  }

  classificationSummary.hidden = false;

  if (state.classification.status === "preparing") {
    classificationSummary.replaceChildren(
      createClassificationHeading("Simulation de classement", "Préparation en cours"),
      createClassificationNotice("Simulation uniquement — aucun fichier n'a été modifié")
    );
    return;
  }

  if (state.classification.status === "executing") {
    classificationSummary.replaceChildren(
      createClassificationHeading("Classement réel", "En cours"),
      createClassificationNotice("Action réelle : le fichier est en cours de renommage et déplacement.")
    );
    return;
  }

  const plan = state.classification.plan;
  if (!plan) {
    classificationSummary.hidden = true;
    classificationSummary.replaceChildren();
    return;
  }

  classificationSummary.replaceChildren(
    createClassificationHeading(
      "Simulation de classement",
      state.classification.status === "ready" ? "Plan prêt" : "Plan bloqué"
    ),
    createClassificationNotice("Simulation uniquement — aucun fichier n'a été modifié"),
    ...(plan.status === "ready" && documentHasVisibleDuplicate(activeDocument.filePath)
      ? [
          createClassificationNotice(
            "Attention : doublon exact détecté. Le classement réel conservera un fichier séparé, sans suppression ni remplacement."
          )
        ]
      : []),
    ...(plan.status === "ready"
      ? [createClassificationNotice("Action réelle : le fichier sera renommé et déplacé.")]
      : []),
    createClassificationMessage(plan, state.classification.error),
    createClassificationDetails(plan),
    createClassificationChecks(plan.checks)
  );
}

function renderHistory(): void {
  if (!historyState || !historyList) {
    return;
  }

  if (state.history.isLoading) {
    historyState.hidden = false;
    historyState.replaceChildren("Lecture du journal...");
    historyList.replaceChildren();
    return;
  }

  if (state.history.errorMessage) {
    historyState.hidden = false;
    historyState.replaceChildren(state.history.errorMessage);
    historyList.replaceChildren();
    return;
  }

  if (state.history.entries.length === 0) {
    historyState.hidden = false;
    historyState.replaceChildren("Aucune action récente");
    historyList.replaceChildren();
    return;
  }

  historyState.hidden = true;
  historyState.replaceChildren();
  historyList.replaceChildren(...state.history.entries.map(createHistoryItem));
}

function createHistoryItem(entry: ActionJournalEntry): HTMLLIElement {
  const item = document.createElement("li");
  const header = document.createElement("div");
  const action = document.createElement("strong");
  const status = document.createElement("span");
  const names = document.createElement("p");
  const date = document.createElement("small");

  item.className = `history-item history-${entry.status}`;
  item.title = historyEntryTitle(entry);
  action.textContent = historyActionLabel(entry.action);
  status.textContent = historyStatusLabel(entry.status);
  header.append(action, status);
  names.textContent = historyNamesLabel(entry);
  date.textContent = formatDate(entry.timestamp);
  item.append(header, names, date);

  return item;
}

function historyEntryTitle(entry: ActionJournalEntry): string {
  const paths = [entry.oldPath, entry.newPath, entry.restoredPath, entry.classifiedPath].filter(Boolean);
  return paths.join("\n");
}

function historyNamesLabel(entry: ActionJournalEntry): string {
  const left = entry.oldName ?? "Nom source inconnu";
  const right = entry.newName ?? "Nom cible inconnu";
  return `${left} -> ${right}`;
}

function historyActionLabel(action: ActionJournalEntry["action"]): string {
  switch (action) {
    case "classify":
      return "Classement";
    case "undo-classify":
      return "Annulation";
  }
}

function historyStatusLabel(status: ActionJournalEntry["status"]): string {
  switch (status) {
    case "started":
      return "Démarré";
    case "completed":
      return "Terminé";
    case "failed":
      return "Échec";
  }
}

function createClassificationHeading(title: string, status: string): HTMLDivElement {
  const heading = document.createElement("div");
  const titleElement = document.createElement("h4");
  const statusElement = document.createElement("strong");

  heading.className = "classification-heading";
  titleElement.textContent = title;
  statusElement.textContent = status;
  statusElement.className = state.classification.status === "ready" ? "status-valid" : "status-warning";
  heading.append(titleElement, statusElement);

  return heading;
}

function createClassificationNotice(message: string): HTMLParagraphElement {
  const notice = document.createElement("p");
  notice.className = "classification-notice";
  notice.textContent = message;
  return notice;
}

function createClassificationMessage(
  plan: ClassificationPlan,
  error: ClassificationPlanError | null
): HTMLParagraphElement {
  const message = document.createElement("p");
  message.className = plan.status === "ready" ? "classification-message ready" : "classification-message blocked";
  message.textContent = error?.message ?? plan.message;
  return message;
}

function createClassificationDetails(plan: ClassificationPlan): HTMLDListElement {
  const details = document.createElement("dl");
  details.className = "classification-details";
  details.append(
    createClassificationDetail("Source", plan.sourcePath),
    createClassificationDetail("Nom actuel", plan.currentName),
    createClassificationDetail("Cible", plan.targetPath),
    createClassificationDetail("Nom proposé", plan.proposedFilename),
    createClassificationDetail("Chemin final prévu", plan.destinationPath || "Non déterminé"),
    createClassificationDetail("Préparé le", formatDate(plan.preparedAt))
  );

  return details;
}

function createClassificationDetail(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  const labelElement = document.createElement("dt");
  const valueElement = document.createElement("dd");

  labelElement.textContent = label;
  valueElement.textContent = value;
  valueElement.title = value;
  row.append(labelElement, valueElement);

  return row;
}

function createClassificationChecks(checks: ClassificationPlanCheck[]): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "classification-checks";
  list.replaceChildren(...checks.map(createClassificationCheckItem));
  return list;
}

function createClassificationCheckItem(check: ClassificationPlanCheck): HTMLLIElement {
  const item = document.createElement("li");
  const status = document.createElement("span");
  const text = document.createElement("strong");
  const message = document.createElement("small");

  item.className = `check-${check.status}`;
  status.textContent = classificationCheckStatusLabel(check.status);
  text.textContent = check.label;
  message.textContent = check.message;
  item.append(status, text, message);

  return item;
}

function classificationCheckStatusLabel(status: ClassificationPlanCheckStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "blocking":
      return "Bloquant";
    case "not-run":
      return "Non contrôlé";
  }
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

function scheduleDestinationCheck(): void {
  clearDestinationCheckTimer();

  const activeDocument = getActiveDocument();
  const filename = getEffectiveProposedFilename();

  if (!activeDocument) {
    resetDestinationCheck();
    renderDestinationCheck();
    return;
  }

  if (state.naming.isLoading) {
    state.destination = createIdleDestinationCheckState();
    renderDestinationCheck();
    return;
  }

  if (!state.naming.proposal?.isValid || !filename) {
    state.destination = {
      ...createIdleDestinationCheckState(),
      status: "invalid",
      checkedFilename: filename
    };
    renderDestinationCheck();
    return;
  }

  if (!state.targetPath) {
    state.destination = {
      ...createIdleDestinationCheckState(),
      status: "target-not-selected",
      checkedFilename: filename,
      error: {
        code: "TARGET_NOT_SELECTED",
        message: "Aucun dossier cible sélectionné pour contrôler le nom final."
      }
    };
    renderDestinationCheck();
    return;
  }

  const requestId = ++destinationRequestId;
  state.destination = {
    ...createIdleDestinationCheckState(),
    status: "checking",
    checkedFilename: filename
  };
  renderDestinationCheck();

  destinationCheckTimer = window.setTimeout(() => {
    void checkDestinationAvailability(filename, requestId);
  }, 250);
}

async function checkDestinationAvailability(filename: string, requestId: number): Promise<void> {
  const result = await window.docSorter.checkDestinationAvailability(filename);

  if (requestId !== destinationRequestId || filename !== getEffectiveProposedFilename()) {
    return;
  }

  if (result.ok) {
    state.destination = {
      status: result.value.status,
      result: result.value as DestinationAvailability,
      error: null,
      checkedFilename: filename
    };
    renderDestinationCheck();
    return;
  }

  state.destination = {
    status: mapDestinationErrorStatus(result.error.code),
    result: null,
    error: result.error as DestinationAvailabilityError,
    checkedFilename: filename
  };
  renderDestinationCheck();
}

function renderDestinationCheck(): void {
  renderControls();

  if (!destinationStatus || !destinationTarget || !destinationFinalPath || !destinationAlternative) {
    return;
  }

  const activeDocument = getActiveDocument();
  const targetLabel = state.targetPath ?? "Aucun dossier cible sélectionné";
  destinationTarget.replaceChildren(targetLabel);
  destinationTarget.title = targetLabel;

  if (!activeDocument) {
    destinationStatus.className = "status-neutral";
    destinationStatus.replaceChildren("Aucun document actif");
    destinationFinalPath.replaceChildren("Aucun contrôle cible en cours");
    destinationFinalPath.title = "";
    destinationAlternative.replaceChildren("");
    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = true;
    }
    return;
  }

  if (state.naming.isLoading) {
    destinationStatus.className = "status-neutral";
    destinationStatus.replaceChildren("En attente de la proposition");
    destinationFinalPath.replaceChildren("Le nom final sera contrôlé après calcul");
    destinationFinalPath.title = "";
    destinationAlternative.replaceChildren("");
    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = true;
    }
    return;
  }

  if (state.destination.status === "invalid") {
    destinationStatus.className = "status-warning";
    destinationStatus.replaceChildren("Nom proposé invalide");
    destinationFinalPath.replaceChildren("Corriger la proposition avant contrôle cible");
    destinationFinalPath.title = "";
    destinationAlternative.replaceChildren("");
    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = true;
    }
    return;
  }

  if (state.destination.status === "target-not-selected") {
    destinationStatus.className = "status-warning";
    destinationStatus.replaceChildren("Aucune cible sélectionnée");
    destinationFinalPath.replaceChildren("Choisir une cible pour vérifier la disponibilité");
    destinationFinalPath.title = "";
    destinationAlternative.replaceChildren("");
    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = true;
    }
    return;
  }

  if (state.destination.status === "checking") {
    destinationStatus.className = "status-neutral";
    destinationStatus.replaceChildren("Contrôle en cours");
    destinationFinalPath.replaceChildren(state.destination.checkedFilename);
    destinationFinalPath.title = state.destination.checkedFilename;
    destinationAlternative.replaceChildren("");
    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = true;
    }
    return;
  }

  if (state.destination.result) {
    const isCollision = state.destination.status === "collision";
    destinationStatus.className = isCollision ? "status-warning" : "status-valid";
    destinationStatus.replaceChildren(isCollision ? "Nom déjà utilisé" : "Nom disponible");
    destinationFinalPath.replaceChildren(state.destination.result.finalPath);
    destinationFinalPath.title = state.destination.result.finalPath;
    destinationAlternative.replaceChildren(
      state.destination.result.alternativeFilename
        ? `Alternative proposée : ${state.destination.result.alternativeFilename}`
        : "Aucune alternative nécessaire"
    );

    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = !state.destination.result.alternativeFilename;
    }
    return;
  }

  if (state.destination.error) {
    destinationStatus.className = "status-error";
    destinationStatus.replaceChildren(destinationErrorLabel(state.destination.error));
    destinationFinalPath.replaceChildren(state.destination.error.message);
    destinationFinalPath.title = state.destination.error.message;
    destinationAlternative.replaceChildren("");
    if (applyDestinationAlternativeButton) {
      applyDestinationAlternativeButton.hidden = true;
    }
    return;
  }

  destinationStatus.className = "status-neutral";
  destinationStatus.replaceChildren("Contrôle cible non lancé");
  destinationFinalPath.replaceChildren("Le nom final sera vérifié avant validation future");
  destinationFinalPath.title = "";
  destinationAlternative.replaceChildren("");
  if (applyDestinationAlternativeButton) {
    applyDestinationAlternativeButton.hidden = true;
  }
}

function getEffectiveProposedFilename(): string {
  return state.naming.overrideFilename ?? state.naming.proposal?.proposedFilename ?? "";
}

function mapDestinationErrorStatus(code: DestinationAvailabilityError["code"]): DestinationCheckStatus {
  if (code === "TARGET_NOT_SELECTED") {
    return "target-not-selected";
  }

  if (code === "INVALID_FILENAME") {
    return "invalid";
  }

  return "error";
}

function destinationErrorLabel(error: DestinationAvailabilityError): string {
  switch (error.code) {
    case "TARGET_NOT_FOUND":
      return "Cible introuvable";
    case "TARGET_NOT_DIRECTORY":
      return "Cible invalide";
    case "TARGET_ACCESS_DENIED":
      return "Accès cible refusé";
    case "TOO_MANY_COLLISIONS":
      return "Trop de collisions";
    case "UNKNOWN_ERROR":
      return "Contrôle cible impossible";
    case "TARGET_NOT_SELECTED":
      return "Aucune cible sélectionnée";
    case "INVALID_FILENAME":
      return "Nom proposé invalide";
  }
}

function resetDestinationCheck(): void {
  destinationRequestId += 1;
  clearDestinationCheckTimer();
  state.destination = createIdleDestinationCheckState();
}

function clearDestinationCheckTimer(): void {
  if (!destinationCheckTimer) {
    return;
  }

  window.clearTimeout(destinationCheckTimer);
  destinationCheckTimer = null;
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

  state.preview.zoom = clampPreviewZoom(zoom);
  render();
}

function clearPreviewResources(): void {
  previewRequestId += 1;
  pdfRenderRequestId += 1;
  window.docSorterImagePreview?.clear();
  window.docSorterPdfPreview?.clear();
}

function createIdleQueueViewState(): QueueUiState {
  return {
    query: "",
    filter: "all",
    sortKey: "name",
    sortDirection: "asc"
  };
}

function createIdlePreviewState(): PreviewState {
  return {
    status: "idle",
    data: null,
    errorMessage: "",
    zoom: 1,
    rotation: 0,
    pdfPage: 1,
    pdfPageCount: 1,
    pdfFitZoom: 1
  };
}

function createIdleNamingState(): NamingState {
  return {
    draft: {
      documentDate: "",
      subject: "",
      documentType: "",
      keywords: ""
    },
    proposal: null,
    overrideFilename: null,
    isLoading: false
  };
}

function createIdleDestinationCheckState(): DestinationCheckState {
  return {
    status: "idle",
    result: null,
    error: null,
    checkedFilename: ""
  };
}

function createIdleClassificationState(): ClassificationState {
  return {
    status: "idle",
    plan: null,
    error: null
  };
}

function createIdleHistoryState(): HistoryState {
  return {
    entries: [],
    isLoading: false,
    errorMessage: ""
  };
}

function createIdleDuplicateAnalysisState(): DuplicateAnalysisState {
  return {
    status: "idle",
    matches: [],
    fileErrors: [],
    ignoredFilePaths: [],
    errorMessage: "",
    analyzedAt: ""
  };
}

function resetNamingState(): void {
  namingRequestId += 1;
  state.naming = createIdleNamingState();
  resetDestinationCheck();
  resetClassificationState();
}

function resetClassificationState(): void {
  classificationRequestId += 1;
  state.classification = createIdleClassificationState();
}

function resetDuplicateAnalysisState(): void {
  duplicateAnalysisRequestId += 1;
  state.duplicates = createIdleDuplicateAnalysisState();
}

function clampPreviewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }

  return Math.min(maxPreviewZoom, Math.max(minPreviewZoom, Math.round(zoom * 100) / 100));
}

function previewErrorMessage(error: AppError, extension: SupportedDocumentExtension): string {
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
