type SupportedDocumentExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";
type PreviewKind = "image" | "pdf";
type PreviewStatus = "idle" | "loading" | "ready" | "error";
type NamingMessageLevel = "error" | "warning" | "info";
type ClassificationPanelStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "blocked"
  | "executing"
  | "undoing"
  | "completed-warning"
  | "undo-warning";
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

interface OperationJournalWarning {
  code: "CLASSIFIED_BUT_JOURNAL_INCOMPLETE" | "UNDO_COMPLETED_BUT_JOURNAL_INCOMPLETE";
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

type TextExtractionStatus = "idle" | "extracting" | "text-found" | "empty" | "error";
type NamingSuggestionStatus = "idle" | "ready" | "empty";

interface PdfTextExtraction {
  status: "text-found" | "empty";
  pageCount: number;
  pagesAnalyzed: number;
  characterCount: number;
  excerpt: string;
  excerptCharacterCount: number;
  truncated: boolean;
  extractedAt: string;
}

interface PdfTextExtractionError {
  code:
    | "DOCUMENT_NOT_SELECTED"
    | "DOCUMENT_NOT_IN_QUEUE"
    | "DOCUMENT_NOT_FOUND"
    | "DOCUMENT_NOT_PDF"
    | "PDF_TEXT_EMPTY"
    | "PDF_PROTECTED_OR_UNREADABLE"
    | "PDF_EXTRACTION_FAILED"
    | "UNKNOWN_ERROR";
  message: string;
}

interface TextExtractionDocumentState {
  status: TextExtractionStatus;
  result: PdfTextExtraction | null;
  error: PdfTextExtractionError | null;
}

interface TextExtractionState {
  byDocumentPath: Record<string, TextExtractionDocumentState>;
}

interface NamingSuggestionDocumentState {
  status: NamingSuggestionStatus;
  suggestions: NamingSuggestions | null;
  message: string;
}

interface NamingSuggestionsState {
  byDocumentPath: Record<string, NamingSuggestionDocumentState>;
}

type RendererUserRulesFileStatus = "loaded" | "created" | "invalid" | "read-error";
type NamingRulesPanelStatus = "loading" | "ready" | "saving" | "error";

interface RendererUserRulesError {
  code: string;
  message: string;
}

interface RendererNamingRulesStatus {
  status: RendererUserRulesFileStatus;
  message: string;
  userRulesPath: string;
  userCatalog: NamingSuggestionRulesCatalog;
  mergedCatalog: NamingSuggestionRulesCatalog;
  defaultRuleCount: number;
  userRuleCount: number;
  warning: RendererUserRulesError | null;
}

interface UserRuleEditingTarget {
  category: UserRuleEditorCategory;
  index: number;
}

interface NamingRulesState {
  panelStatus: NamingRulesPanelStatus;
  panelOpen: boolean;
  userRulesPath: string;
  userCatalog: NamingSuggestionRulesCatalog;
  mergedCatalog: NamingSuggestionRulesCatalog;
  defaultRuleCount: number;
  userRuleCount: number;
  message: string;
  warning: RendererUserRulesError | null;
  draft: UserRuleEditorDraft;
  editingTarget: UserRuleEditingTarget | null;
  draftErrors: string[];
  dirty: boolean;
}

interface ClassificationState {
  status: ClassificationPanelStatus;
  plan: ClassificationPlan | null;
  error: ClassificationPlanError | ClassificationOperationError | UndoClassificationError | null;
  journalWarning: OperationJournalWarning | null;
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
  textExtraction: TextExtractionState;
  namingSuggestions: NamingSuggestionsState;
  namingRules: NamingRulesState;
  shortcutsHelpVisible: boolean;
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
  duplicates: createIdleDuplicateAnalysisState(),
  textExtraction: createIdleTextExtractionState(),
  namingSuggestions: createIdleNamingSuggestionsState(),
  namingRules: createIdleNamingRulesState(),
  shortcutsHelpVisible: false
};

let previewRequestId = 0;
let pdfRenderRequestId = 0;
let namingRequestId = 0;
let destinationRequestId = 0;
let classificationRequestId = 0;
let duplicateAnalysisRequestId = 0;
let textExtractionRequestId = 0;
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
const textExtractionPanel = document.querySelector<HTMLElement>("#text-extraction-panel");
const extractPdfTextButton = document.querySelector<HTMLButtonElement>("#extract-pdf-text");
const textExtractionDetails = document.querySelector<HTMLElement>("#text-extraction-details");
const suggestionsPanel = document.querySelector<HTMLElement>("#suggestions-panel");
const analyzeSuggestionsButton = document.querySelector<HTMLButtonElement>("#analyze-suggestions");
const suggestionsDetails = document.querySelector<HTMLElement>("#suggestions-details");
const applySuggestionsEmptyButton =
  document.querySelector<HTMLButtonElement>("#apply-suggestions-empty");
const toggleRulesPanelButton = document.querySelector<HTMLButtonElement>("#toggle-rules-panel");
const rulesStatus = document.querySelector<HTMLElement>("#rules-status");
const rulesEditor = document.querySelector<HTMLElement>("#rules-editor");
const userRulesList = document.querySelector<HTMLOListElement>("#user-rules-list");
const userRuleForm = document.querySelector<HTMLFormElement>("#user-rule-form");
const userRuleCategoryInput = document.querySelector<HTMLSelectElement>("#user-rule-category");
const userRuleIdInput = document.querySelector<HTMLInputElement>("#user-rule-id");
const userRuleLabelInput = document.querySelector<HTMLInputElement>("#user-rule-label");
const userRuleAllOfInput = document.querySelector<HTMLInputElement>("#user-rule-all-of");
const userRuleAnyOfInput = document.querySelector<HTMLInputElement>("#user-rule-any-of");
const userRuleNoneOfInput = document.querySelector<HTMLInputElement>("#user-rule-none-of");
const userRuleDocumentTypeInput = document.querySelector<HTMLInputElement>(
  "#user-rule-document-type"
);
const userRuleSubjectInput = document.querySelector<HTMLInputElement>("#user-rule-subject");
const userRuleKeywordsInput = document.querySelector<HTMLInputElement>("#user-rule-keywords");
const userRuleConfidenceInput = document.querySelector<HTMLInputElement>("#user-rule-confidence");
const userRuleEnabledInput = document.querySelector<HTMLInputElement>("#user-rule-enabled");
const userRuleErrors = document.querySelector<HTMLUListElement>("#user-rule-errors");
const resetUserRuleFormButton = document.querySelector<HTMLButtonElement>("#reset-user-rule-form");
const saveUserRuleDraftButton = document.querySelector<HTMLButtonElement>("#save-user-rule-draft");
const saveUserRulesButton = document.querySelector<HTMLButtonElement>("#save-user-rules");
const reloadUserRulesButton = document.querySelector<HTMLButtonElement>("#reload-user-rules");
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
void refreshNamingRulesStatus();

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

queueSearchInput?.addEventListener("input", () => {
  state.queueView.query = queueSearchInput.value;
  renderQueue();
});

clearQueueSearchButton?.addEventListener("click", () => {
  clearQueueSearch();
});

queueFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.queueFilter;
    if (!isQueueFilter(filter)) {
      return;
    }

    setQueueFilter(filter);
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

extractPdfTextButton?.addEventListener("click", () => {
  void extractTextFromActivePdf();
});

analyzeSuggestionsButton?.addEventListener("click", () => {
  analyzeNamingSuggestionsForActiveDocument();
});

applySuggestionsEmptyButton?.addEventListener("click", () => {
  applyNamingSuggestionsToEmptyFields();
});

toggleRulesPanelButton?.addEventListener("click", () => {
  state.namingRules.panelOpen = !state.namingRules.panelOpen;
  renderRulesPanel();
});

userRuleForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  upsertUserRuleDraft();
});

resetUserRuleFormButton?.addEventListener("click", () => {
  resetUserRuleDraft();
});

saveUserRulesButton?.addEventListener("click", () => {
  void saveUserRules();
});

reloadUserRulesButton?.addEventListener("click", () => {
  void reloadNamingRules();
});

[
  userRuleCategoryInput,
  userRuleIdInput,
  userRuleLabelInput,
  userRuleAllOfInput,
  userRuleAnyOfInput,
  userRuleNoneOfInput,
  userRuleDocumentTypeInput,
  userRuleSubjectInput,
  userRuleKeywordsInput,
  userRuleConfidenceInput,
  userRuleEnabledInput
].forEach((input) => {
  input?.addEventListener("input", () => {
    updateUserRuleDraftFromInputs();
  });
  input?.addEventListener("change", () => {
    updateUserRuleDraftFromInputs();
  });
});

refreshHistoryButton?.addEventListener("click", () => {
  void refreshRecentHistory();
});

document.addEventListener("keydown", (event) => {
  handleGlobalKeyboardShortcut(event);
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
  renderRulesPanel();
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

  if (extractPdfTextButton) {
    extractPdfTextButton.disabled = !canExtractTextFromActivePdf();
  }

  if (analyzeSuggestionsButton) {
    analyzeSuggestionsButton.disabled = !canAnalyzeNamingSuggestions();
  }

  if (applySuggestionsEmptyButton) {
    applySuggestionsEmptyButton.disabled = !canApplyNamingSuggestionsToEmptyFields();
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

  if (saveUserRulesButton) {
    saveUserRulesButton.disabled = state.namingRules.panelStatus === "saving" || !state.namingRules.dirty;
  }

  if (reloadUserRulesButton) {
    reloadUserRulesButton.disabled = state.namingRules.panelStatus === "saving";
  }

  if (saveUserRuleDraftButton) {
    saveUserRuleDraftButton.disabled = state.namingRules.panelStatus === "saving";
  }
}

function handleGlobalKeyboardShortcut(event: KeyboardEvent): void {
  const action = DocSorterKeyboardShortcuts.resolveKeyboardShortcut(event, {
    focusKind: DocSorterKeyboardShortcuts.getShortcutFocusKind(document.activeElement),
    searchHasText: state.queueView.query.length > 0,
    sourceAvailable: canRefreshSource(),
    prepareClassificationAvailable: canPrepareClassificationPlan(),
    executeClassificationAvailable: canExecuteClassificationShortcut(),
    undoAvailable: canUndoLastAction()
  });

  if (!action) {
    return;
  }

  event.preventDefault();
  executeKeyboardShortcut(action);
}

function executeKeyboardShortcut(action: KeyboardShortcutAction): void {
  switch (action) {
    case "navigate-next":
      navigateVisibleQueue("next");
      return;
    case "navigate-previous":
      navigateVisibleQueue("previous");
      return;
    case "page-next":
      navigateVisibleQueueByOffset(8);
      return;
    case "page-previous":
      navigateVisibleQueueByOffset(-8);
      return;
    case "focus-search":
      focusQueueSearch();
      return;
    case "clear-search":
      clearQueueSearch();
      return;
    case "blur-search":
      queueSearchInput?.blur();
      return;
    case "toggle-duplicates-filter":
      setQueueFilter(state.queueView.filter === "duplicates" ? "all" : "duplicates");
      return;
    case "show-all-filter":
      setQueueFilter("all");
      return;
    case "refresh-source":
      if (canRefreshSource()) {
        void refreshDocuments({
          preserveSelection: true,
          successMessage: "Rafraîchissement réussi"
        });
      }
      return;
    case "prepare-classification":
      if (canPrepareClassificationPlan()) {
        void prepareClassificationSimulation();
      }
      return;
    case "execute-classification":
      if (canExecuteClassificationShortcut()) {
        void executeClassificationAction();
      }
      return;
    case "undo-last-action":
      if (canUndoLastAction()) {
        void undoLastClassificationAction();
      }
      return;
    case "toggle-shortcuts-help":
      toggleShortcutHelp();
      return;
  }
}

function renderShortcutHelp(): void {
  if (shortcutHelpPanel) {
    shortcutHelpPanel.hidden = !state.shortcutsHelpVisible;
  }

  if (shortcutHelpToggleButton) {
    shortcutHelpToggleButton.ariaPressed = String(state.shortcutsHelpVisible);
  }
}

function toggleShortcutHelp(): void {
  state.shortcutsHelpVisible = !state.shortcutsHelpVisible;
  renderShortcutHelp();
}

function canRefreshSource(): boolean {
  return Boolean(state.sourcePath && !state.isLoading && !isClassificationBusy());
}

function canUndoLastAction(): boolean {
  return Boolean(state.lastUndoableAction && !isClassificationBusy());
}

function canExecuteClassificationShortcut(): boolean {
  return Boolean(canExecuteClassification() && classificationSummary && !classificationSummary.hidden);
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

function navigateVisibleQueueByOffset(offset: number): void {
  const visibleDocuments = getVisibleQueue().documents;
  if (visibleDocuments.length === 0) {
    return;
  }

  const activeIndex = state.activeDocumentPath
    ? visibleDocuments.findIndex((documentItem) => documentItem.filePath === state.activeDocumentPath)
    : -1;
  const targetIndex =
    activeIndex < 0 ? 0 : Math.min(visibleDocuments.length - 1, Math.max(0, activeIndex + offset));
  selectDocument(visibleDocuments[targetIndex]);
}

function focusQueueSearch(): void {
  if (!queueSearchInput) {
    return;
  }

  queueSearchInput.focus();
  queueSearchInput.select();
}

function clearQueueSearch(): void {
  state.queueView.query = "";
  renderQueue();
}

function setQueueFilter(filter: QueueViewFilter): void {
  state.queueView.filter = filter;
  renderQueue();
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
    renderTextExtractionPanel();
    renderNamingSuggestionsPanel();
    renderNamingPanel(true);
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    documentDetails.className = "details-empty";
    documentDetails.replaceChildren("Aucun document actif");
    renderDuplicatePanel();
    renderTextExtractionPanel();
    renderNamingSuggestionsPanel();
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
  renderTextExtractionPanel();
  renderNamingSuggestionsPanel();
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
    : textExtractionQueueLabel(documentItem) ?? statusLabel(documentItem.status);
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

async function extractTextFromActivePdf(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canExtractTextFromActivePdf(activeDocument)) {
    return;
  }

  const requestId = ++textExtractionRequestId;
  clearNamingSuggestionStateForDocument(activeDocument.filePath);
  setTextExtractionState(activeDocument.filePath, {
    status: "extracting",
    result: null,
    error: null
  });
  render();

  const result = await window.docSorter.extractTextFromActivePdf(activeDocument.filePath);
  if (requestId !== textExtractionRequestId) {
    return;
  }

  if (!result.ok) {
    if (result.error.code === "DOCUMENT_NOT_FOUND") {
      markDocumentUnavailable(activeDocument.filePath);
    }

    setTextExtractionState(activeDocument.filePath, {
      status: "error",
      result: null,
      error: result.error as PdfTextExtractionError
    });
    render();
    return;
  }

  const extraction = result.value as PdfTextExtraction;
  clearNamingSuggestionStateForDocument(activeDocument.filePath);
  setTextExtractionState(activeDocument.filePath, {
    status: extraction.status,
    result: extraction,
    error: null
  });
  render();
}

function renderTextExtractionPanel(): void {
  if (!textExtractionPanel || !textExtractionDetails) {
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument || activeDocument.extension !== ".pdf") {
    textExtractionPanel.hidden = true;
    textExtractionDetails.replaceChildren();
    return;
  }

  const extractionState = getTextExtractionState(activeDocument.filePath);
  textExtractionPanel.hidden = false;

  if (extractPdfTextButton) {
    extractPdfTextButton.disabled = !canExtractTextFromActivePdf(activeDocument);
  }

  if (extractionState.status === "idle") {
    textExtractionDetails.replaceChildren("Texte non analysé");
    return;
  }

  if (extractionState.status === "extracting") {
    textExtractionDetails.replaceChildren("Extraction du texte...");
    return;
  }

  if (extractionState.status === "error") {
    textExtractionDetails.replaceChildren(
      extractionState.error?.message ?? "Extraction du texte PDF impossible."
    );
    return;
  }

  if (!extractionState.result || extractionState.status === "empty") {
    textExtractionDetails.replaceChildren(
      createTextExtractionMeta(extractionState.result),
      "Aucun texte exploitable détecté — OCR nécessaire plus tard."
    );
    return;
  }

  textExtractionDetails.replaceChildren(
    createTextExtractionMeta(extractionState.result),
    createTextExtractionExcerpt(extractionState.result)
  );
}

function createTextExtractionMeta(extraction: PdfTextExtraction | null): HTMLDivElement {
  const meta = document.createElement("div");
  meta.className = "text-extraction-meta";

  if (!extraction) {
    return meta;
  }

  const pages = document.createElement("span");
  const characters = document.createElement("span");
  const extractedAt = document.createElement("span");

  pages.textContent = `${extraction.pagesAnalyzed} / ${extraction.pageCount} page${
    extraction.pageCount > 1 ? "s" : ""
  }`;
  characters.textContent = `${extraction.characterCount} caractère${
    extraction.characterCount > 1 ? "s" : ""
  }`;
  extractedAt.textContent = formatDate(extraction.extractedAt);
  meta.append(pages, characters, extractedAt);

  return meta;
}

function createTextExtractionExcerpt(extraction: PdfTextExtraction): HTMLDivElement {
  const container = document.createElement("div");
  const heading = document.createElement("strong");
  const excerpt = document.createElement("pre");

  heading.textContent = extraction.truncated ? "Extrait limité" : "Extrait";
  excerpt.className = "text-extraction-excerpt";
  excerpt.textContent = extraction.excerpt;
  container.append(heading, excerpt);

  return container;
}

function canExtractTextFromActivePdf(documentItem = getActiveDocument()): boolean {
  if (!documentItem) {
    return false;
  }

  return (
    documentItem.extension === ".pdf" &&
    documentItem.status !== "missing" &&
    getTextExtractionState(documentItem.filePath).status !== "extracting" &&
    !isClassificationBusy()
  );
}

function getTextExtractionState(filePath: string): TextExtractionDocumentState {
  return state.textExtraction.byDocumentPath[filePath] ?? createIdleTextExtractionDocumentState();
}

function setTextExtractionState(filePath: string, value: TextExtractionDocumentState): void {
  state.textExtraction = {
    byDocumentPath: {
      ...state.textExtraction.byDocumentPath,
      [filePath]: value
    }
  };
}

function textExtractionQueueLabel(documentItem: DocumentItem): string | null {
  if (documentItem.extension !== ".pdf") {
    return null;
  }

  const extractionState = getTextExtractionState(documentItem.filePath);
  switch (extractionState.status) {
    case "text-found":
      return "Texte extrait";
    case "empty":
      return "PDF sans texte";
    case "extracting":
      return "Extraction texte";
    case "error":
      return "Texte indisponible";
    case "idle":
      return null;
  }
}

function renderNamingSuggestionsPanel(): void {
  if (!suggestionsPanel || !suggestionsDetails) {
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument || activeDocument.extension !== ".pdf") {
    suggestionsPanel.hidden = true;
    suggestionsDetails.replaceChildren();
    return;
  }

  const extractionState = getTextExtractionState(activeDocument.filePath);
  const suggestionState = getNamingSuggestionState(activeDocument.filePath);
  suggestionsPanel.hidden = false;

  if (analyzeSuggestionsButton) {
    analyzeSuggestionsButton.disabled = !canAnalyzeNamingSuggestions(activeDocument);
  }

  if (applySuggestionsEmptyButton) {
    applySuggestionsEmptyButton.disabled = !canApplyNamingSuggestionsToEmptyFields();
  }

  if (extractionState.status === "idle") {
    suggestionsDetails.replaceChildren("Extrais le texte PDF pour obtenir des suggestions locales.");
    return;
  }

  if (extractionState.status === "extracting") {
    suggestionsDetails.replaceChildren("Extraction du texte en cours...");
    return;
  }

  if (extractionState.status === "error") {
    suggestionsDetails.replaceChildren("Texte PDF indisponible pour les suggestions locales.");
    return;
  }

  if (extractionState.status === "empty" || !extractionState.result?.excerpt.trim()) {
    suggestionsDetails.replaceChildren("Aucune suggestion disponible : aucun texte exploitable détecté.");
    return;
  }

  if (suggestionState.status === "idle") {
    suggestionsDetails.replaceChildren(
      "Texte extrait disponible. Lance l'analyse locale pour préparer des suggestions."
    );
    return;
  }

  if (suggestionState.status === "empty" || !suggestionState.suggestions) {
    suggestionsDetails.replaceChildren(
      suggestionState.message || "Aucune suggestion locale exploitable détectée."
    );
    return;
  }

  suggestionsDetails.replaceChildren(
    createNamingSuggestionsSummary(suggestionState.suggestions, suggestionState.message)
  );
}

function createNamingSuggestionsSummary(
  suggestions: NamingSuggestions,
  message: string
): HTMLDivElement {
  const container = document.createElement("div");
  const confidence = document.createElement("div");
  const score = document.createElement("span");
  const source = document.createElement("span");

  container.className = "suggestion-summary";
  confidence.className = "suggestions-confidence";
  score.textContent = `Score ${formatSuggestionConfidence(suggestions.confidence)}`;
  source.textContent = "Règles locales par défaut";
  confidence.append(score, source);

  container.append(confidence, createSuggestionGrid(suggestions));

  if (message) {
    const messageElement = document.createElement("p");
    messageElement.textContent = message;
    container.append(messageElement);
  }

  if (suggestions.reasons.length > 0) {
    const reasons = document.createElement("ul");
    reasons.className = "suggestion-reasons";
    reasons.replaceChildren(
      ...suggestions.reasons.map((reason) => {
        const item = document.createElement("li");
        item.textContent = reason;
        return item;
      })
    );
    container.append(reasons);
  }

  return container;
}

function createSuggestionGrid(suggestions: NamingSuggestions): HTMLDListElement {
  const grid = document.createElement("dl");
  grid.className = "suggestion-grid";
  grid.append(
    createSuggestionRow("Date", suggestions.date),
    createSuggestionRow("Sujet", suggestions.subject),
    createSuggestionRow("Type", suggestions.documentType),
    createSuggestionRow("Mots-clés", createKeywordsSuggestion(suggestions.keywords))
  );

  return grid;
}

function createSuggestionRow(
  label: string,
  suggestion: SuggestedNamingField | null
): HTMLDivElement {
  const row = document.createElement("div");
  const labelElement = document.createElement("dt");
  const valueElement = document.createElement("dd");

  labelElement.textContent = label;

  if (!suggestion) {
    valueElement.textContent = "Aucune suggestion";
  } else {
    const value = document.createElement("strong");
    const meta = document.createElement("small");
    value.textContent = suggestion.value;
    value.title = suggestion.reason;
    meta.textContent = `${formatSuggestionConfidence(suggestion.confidence)} - ${suggestionSourceLabel(
      suggestion.source
    )}`;
    valueElement.append(value, meta);
  }

  row.append(labelElement, valueElement);
  return row;
}

function createKeywordsSuggestion(keywords: SuggestedNamingField[]): SuggestedNamingField | null {
  if (keywords.length === 0) {
    return null;
  }

  const confidence =
    keywords.reduce((total, keyword) => total + keyword.confidence, 0) / keywords.length;
  const hasText = keywords.some((keyword) => keyword.source === "text" || keyword.source === "filename+text");
  const hasFilename = keywords.some(
    (keyword) => keyword.source === "filename" || keyword.source === "filename+text"
  );

  return {
    value: keywords.map((keyword) => keyword.value).join(" "),
    confidence,
    reason: "Mots-clés détectés localement.",
    source: sourceFromSuggestionBooleans(hasText, hasFilename)
  };
}

function analyzeNamingSuggestionsForActiveDocument(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canAnalyzeNamingSuggestions(activeDocument)) {
    return;
  }

  const extraction = getTextExtractionState(activeDocument.filePath).result;
  if (!extraction) {
    return;
  }

  const suggestions = DocSorterNamingSuggestions.buildNamingSuggestions({
    filename: activeDocument.name,
    extractedText: extraction.excerpt,
    rulesCatalog: state.namingRules.mergedCatalog
  });
  const hasSuggestions = namingSuggestionsHaveContent(suggestions);

  setNamingSuggestionState(activeDocument.filePath, {
    status: hasSuggestions ? "ready" : "empty",
    suggestions: hasSuggestions ? suggestions : null,
    message: hasSuggestions
      ? "Suggestions générées localement depuis le texte extrait et le nom de fichier."
      : "Aucune suggestion locale exploitable détectée."
  });
  render();
}

function applyNamingSuggestionsToEmptyFields(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canApplyNamingSuggestionsToEmptyFields()) {
    return;
  }

  const suggestionState = getNamingSuggestionState(activeDocument.filePath);
  if (!suggestionState.suggestions) {
    return;
  }

  const result = DocSorterNamingSuggestions.applySuggestionsToEmptyFields(
    state.naming.draft,
    suggestionState.suggestions
  );
  setNamingSuggestionState(activeDocument.filePath, {
    ...suggestionState,
    message:
      result.appliedFields.length > 0
        ? "Suggestions appliquées aux champs vides. Les champs déjà remplis n'ont pas été modifiés."
        : "Aucun champ vide à compléter."
  });

  if (result.appliedFields.length === 0) {
    render();
    return;
  }

  state.naming.draft = result.draft;
  state.naming.overrideFilename = null;
  state.naming.isLoading = true;
  resetClassificationState();
  resetDestinationCheck();
  render();
  void updateNamingProposal(activeDocument.extension, ++namingRequestId);
}

function canAnalyzeNamingSuggestions(documentItem = getActiveDocument()): boolean {
  if (!documentItem) {
    return false;
  }

  const extractionState = getTextExtractionState(documentItem.filePath);
  return Boolean(
    documentItem.extension === ".pdf" &&
      documentItem.status !== "missing" &&
      extractionState.status === "text-found" &&
      extractionState.result?.excerpt.trim() &&
      !isClassificationBusy()
  );
}

function canApplyNamingSuggestionsToEmptyFields(): boolean {
  const activeDocument = getActiveDocument();
  if (!activeDocument || state.naming.isLoading || isClassificationBusy()) {
    return false;
  }

  const suggestions = getNamingSuggestionState(activeDocument.filePath).suggestions;
  return Boolean(suggestions && hasEmptyFieldForSuggestion(state.naming.draft, suggestions));
}

function hasEmptyFieldForSuggestion(draft: NamingDraft, suggestions: NamingSuggestions): boolean {
  return (
    (!draft.documentDate.trim() && Boolean(suggestions.date?.value)) ||
    (!draft.subject.trim() && Boolean(suggestions.subject?.value)) ||
    (!draft.documentType.trim() && Boolean(suggestions.documentType?.value)) ||
    (!draft.keywords.trim() && suggestions.keywords.length > 0)
  );
}

function namingSuggestionsHaveContent(suggestions: NamingSuggestions): boolean {
  return Boolean(
    suggestions.date || suggestions.subject || suggestions.documentType || suggestions.keywords.length > 0
  );
}

function getNamingSuggestionState(filePath: string): NamingSuggestionDocumentState {
  return state.namingSuggestions.byDocumentPath[filePath] ?? createIdleNamingSuggestionDocumentState();
}

function setNamingSuggestionState(filePath: string, value: NamingSuggestionDocumentState): void {
  state.namingSuggestions = {
    byDocumentPath: {
      ...state.namingSuggestions.byDocumentPath,
      [filePath]: value
    }
  };
}

function clearNamingSuggestionStateForDocument(filePath: string): void {
  if (!state.namingSuggestions.byDocumentPath[filePath]) {
    return;
  }

  const { [filePath]: _removed, ...remaining } = state.namingSuggestions.byDocumentPath;
  state.namingSuggestions = {
    byDocumentPath: remaining
  };
}

function formatSuggestionConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)} %`;
}

function suggestionSourceLabel(source: NamingSuggestionSource): string {
  switch (source) {
    case "text":
      return "texte extrait";
    case "filename":
      return "nom de fichier";
    case "filename+text":
      return "texte + nom";
  }
}

function sourceFromSuggestionBooleans(
  textMatch: boolean,
  filenameMatch: boolean
): NamingSuggestionSource {
  if (textMatch && filenameMatch) {
    return "filename+text";
  }

  return textMatch ? "text" : "filename";
}

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

function applyNamingRulesStatus(status: RendererNamingRulesStatus, resetSuggestions: boolean): void {
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

  if (resetSuggestions) {
    resetNamingSuggestionsState();
  }

  render();
}

function renderRulesPanel(): void {
  if (!rulesStatus || !rulesEditor) {
    return;
  }

  if (toggleRulesPanelButton) {
    toggleRulesPanelButton.setAttribute("aria-expanded", String(state.namingRules.panelOpen));
    toggleRulesPanelButton.textContent = state.namingRules.panelOpen ? "Masquer" : "Règles";
  }

  rulesEditor.hidden = !state.namingRules.panelOpen;
  rulesStatus.replaceChildren(...createRulesStatusContent());
  renderUserRulesList();
  syncUserRuleForm();

  if (userRuleErrors) {
    userRuleErrors.replaceChildren(...state.namingRules.draftErrors.map(createRuleErrorItem));
  }

  if (saveUserRuleDraftButton) {
    saveUserRuleDraftButton.textContent = state.namingRules.editingTarget
      ? "Modifier la règle"
      : "Ajouter la règle";
  }

  renderControls();
}

function createRulesStatusContent(): Node[] {
  const lines: Node[] = [];
  const summary = document.createElement("strong");
  const detail = document.createElement("span");
  const pathLine = document.createElement("span");

  summary.textContent = rulesStatusLabel();
  detail.textContent = `${state.namingRules.defaultRuleCount} règle${
    state.namingRules.defaultRuleCount > 1 ? "s" : ""
  } par défaut, ${state.namingRules.userRuleCount} règle${
    state.namingRules.userRuleCount > 1 ? "s" : ""
  } utilisateur.`;
  pathLine.textContent = state.namingRules.userRulesPath
    ? `Fichier local : ${state.namingRules.userRulesPath}`
    : "Fichier local : initialisation en cours";
  pathLine.title = state.namingRules.userRulesPath;
  lines.push(summary, detail, pathLine);

  if (state.namingRules.warning) {
    const warning = document.createElement("span");
    warning.textContent = state.namingRules.warning.message;
    lines.push(warning);
  }

  if (state.namingRules.dirty) {
    const dirty = document.createElement("span");
    dirty.textContent = "Modifications non sauvegardées.";
    lines.push(dirty);
  }

  return lines;
}

function rulesStatusLabel(): string {
  if (state.namingRules.panelStatus === "loading") {
    return "Chargement des règles...";
  }

  if (state.namingRules.panelStatus === "saving") {
    return "Sauvegarde des règles...";
  }

  if (state.namingRules.panelStatus === "error") {
    return "Erreur règles utilisateur";
  }

  return state.namingRules.message;
}

function renderUserRulesList(): void {
  if (!userRulesList) {
    return;
  }

  const entries = getUserRuleEntries(state.namingRules.userCatalog);
  if (entries.length === 0) {
    const item = document.createElement("li");
    const empty = document.createElement("span");
    empty.textContent = "Aucune règle utilisateur.";
    item.append(empty);
    userRulesList.replaceChildren(item);
    return;
  }

  userRulesList.replaceChildren(...entries.map(createUserRuleListItem));
}

function createUserRuleListItem(entry: UserRuleListEntry): HTMLLIElement {
  const item = document.createElement("li");
  const text = document.createElement("span");
  const title = document.createElement("strong");
  const meta = document.createElement("small");
  const editButton = document.createElement("button");
  const deleteButton = document.createElement("button");

  title.textContent = entry.label;
  title.title = entry.label;
  meta.textContent = `${userRuleCategoryLabel(entry.category)} - ${entry.enabled ? "actif" : "inactif"}`;
  text.append(title, meta);

  editButton.type = "button";
  editButton.textContent = "Modifier";
  editButton.addEventListener("click", () => {
    editUserRule(entry.category, entry.index);
  });

  deleteButton.type = "button";
  deleteButton.textContent = "Supprimer";
  deleteButton.addEventListener("click", () => {
    deleteUserRule(entry.category, entry.index);
  });

  item.append(text, editButton, deleteButton);
  return item;
}

interface UserRuleListEntry {
  category: UserRuleEditorCategory;
  index: number;
  label: string;
  enabled: boolean;
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

function syncUserRuleForm(): void {
  const draft = state.namingRules.draft;

  if (userRuleCategoryInput) {
    userRuleCategoryInput.value = draft.category;
  }
  if (userRuleIdInput) {
    userRuleIdInput.value = draft.id;
  }
  if (userRuleLabelInput) {
    userRuleLabelInput.value = draft.label;
  }
  if (userRuleAllOfInput) {
    userRuleAllOfInput.value = draft.allOf;
  }
  if (userRuleAnyOfInput) {
    userRuleAnyOfInput.value = draft.anyOf;
  }
  if (userRuleNoneOfInput) {
    userRuleNoneOfInput.value = draft.noneOf;
  }
  if (userRuleDocumentTypeInput) {
    userRuleDocumentTypeInput.value = draft.documentType;
  }
  if (userRuleSubjectInput) {
    userRuleSubjectInput.value = draft.subject;
  }
  if (userRuleKeywordsInput) {
    userRuleKeywordsInput.value = draft.keywords;
  }
  if (userRuleConfidenceInput) {
    userRuleConfidenceInput.value = draft.confidence;
  }
  if (userRuleEnabledInput) {
    userRuleEnabledInput.checked = draft.enabled;
  }
}

function updateUserRuleDraftFromInputs(): void {
  state.namingRules.draft = {
    category: (userRuleCategoryInput?.value as UserRuleEditorCategory) ?? "documentType",
    id: userRuleIdInput?.value ?? "",
    label: userRuleLabelInput?.value ?? "",
    allOf: userRuleAllOfInput?.value ?? "",
    anyOf: userRuleAnyOfInput?.value ?? "",
    noneOf: userRuleNoneOfInput?.value ?? "",
    documentType: userRuleDocumentTypeInput?.value ?? "",
    subject: userRuleSubjectInput?.value ?? "",
    keywords: userRuleKeywordsInput?.value ?? "",
    confidence: userRuleConfidenceInput?.value ?? "70",
    enabled: userRuleEnabledInput?.checked ?? true
  };
  state.namingRules.draftErrors = [];
}

function upsertUserRuleDraft(): void {
  updateUserRuleDraftFromInputs();
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

function createRuleErrorItem(error: string): HTMLLIElement {
  const item = document.createElement("li");
  item.textContent = error;
  return item;
}

function userRuleCategoryLabel(category: UserRuleEditorCategory): string {
  switch (category) {
    case "documentType":
      return "type";
    case "subject":
      return "sujet";
    case "keyword":
      return "mot-clé";
  }
}

function cloneRulesCatalog(catalog: NamingSuggestionRulesCatalog): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: catalog.documentTypeRules.map((rule) => ({
      ...rule,
      match: cloneRuleMatch(rule.match),
      output: {
        ...(rule.output.documentType ? { documentType: rule.output.documentType } : {}),
        ...(rule.output.subject ? { subject: rule.output.subject } : {}),
        ...(rule.output.keywords ? { keywords: [...rule.output.keywords] } : {})
      }
    })),
    subjectRules: catalog.subjectRules.map((rule) => ({
      ...rule,
      match: cloneRuleMatch(rule.match),
      output: {
        ...(rule.output.documentType ? { documentType: rule.output.documentType } : {}),
        ...(rule.output.subject ? { subject: rule.output.subject } : {}),
        ...(rule.output.keywords ? { keywords: [...rule.output.keywords] } : {})
      }
    })),
    keywordRules: catalog.keywordRules.map((rule) => ({
      ...rule,
      aliases: [...rule.aliases],
      ...(rule.match ? { match: cloneRuleMatch(rule.match) } : {})
    })),
    stopWords: [...catalog.stopWords]
  };
}

function cloneRuleMatch(match: SuggestionRuleMatch): SuggestionRuleMatch {
  return {
    ...(match.allOf ? { allOf: [...match.allOf] } : {}),
    ...(match.anyOf ? { anyOf: [...match.anyOf] } : {}),
    ...(match.noneOf ? { noneOf: [...match.noneOf] } : {})
  };
}

function countRules(catalog: NamingSuggestionRulesCatalog): number {
  return catalog.documentTypeRules.length + catalog.subjectRules.length + catalog.keywordRules.length;
}

function createEmptyRulesCatalog(): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: []
  };
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
  if (!classificationSummary) {
    return;
  }

  if (
    state.classification.status === "completed-warning" &&
    state.classification.journalWarning
  ) {
    classificationSummary.hidden = false;
    classificationSummary.replaceChildren(
      createClassificationHeading("Classement réel", "Journal incomplet"),
      createClassificationWarningMessage(state.classification.journalWarning.message),
      createClassificationNotice("Le fichier a bien été déplacé."),
      createClassificationNotice(
        "L'historique persistant et l'annulation après redémarrage peuvent être incomplets."
      ),
      createClassificationNotice("L'annulation immédiate reste possible si le bouton est actif."),
      ...(state.classification.plan ? [createClassificationDetails(state.classification.plan)] : [])
    );
    return;
  }

  if (state.classification.status === "undo-warning" && state.classification.journalWarning) {
    classificationSummary.hidden = false;
    classificationSummary.replaceChildren(
      createClassificationHeading("Annulation", "Journal incomplet"),
      createClassificationWarningMessage(state.classification.journalWarning.message),
      createClassificationNotice("Le fichier a bien été restauré."),
      createClassificationNotice("Le journal n'a pas pu être finalisé.")
    );
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

function createClassificationWarningMessage(messageText: string): HTMLParagraphElement {
  const message = document.createElement("p");
  message.className = "classification-message blocked";
  message.textContent = messageText;
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
    error: null,
    journalWarning: null
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

function createIdleTextExtractionState(): TextExtractionState {
  return {
    byDocumentPath: {}
  };
}

function createIdleNamingRulesState(): NamingRulesState {
  const defaultCatalog =
    globalThis.DocSorterNamingSuggestionRulesCatalog?.getDefaultNamingSuggestionRulesCatalog() ??
    createEmptyRulesCatalog();

  return {
    panelStatus: "loading",
    panelOpen: false,
    userRulesPath: "",
    userCatalog: createEmptyRulesCatalog(),
    mergedCatalog: defaultCatalog,
    defaultRuleCount: countRules(defaultCatalog),
    userRuleCount: 0,
    message: "Chargement des règles...",
    warning: null,
    draft: DocSorterUserRuleEditor.createEmptyUserRuleDraft(),
    editingTarget: null,
    draftErrors: [],
    dirty: false
  };
}

function createIdleNamingSuggestionsState(): NamingSuggestionsState {
  return {
    byDocumentPath: {}
  };
}

function createIdleTextExtractionDocumentState(): TextExtractionDocumentState {
  return {
    status: "idle",
    result: null,
    error: null
  };
}

function createIdleNamingSuggestionDocumentState(): NamingSuggestionDocumentState {
  return {
    status: "idle",
    suggestions: null,
    message: ""
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

function resetTextExtractionState(): void {
  textExtractionRequestId += 1;
  state.textExtraction = createIdleTextExtractionState();
  resetNamingSuggestionsState();
}

function resetNamingSuggestionsState(): void {
  state.namingSuggestions = createIdleNamingSuggestionsState();
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
