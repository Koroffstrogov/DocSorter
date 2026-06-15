type SupportedDocumentExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";
type PreviewKind = "image" | "pdf";
type PreviewStatus = "idle" | "loading" | "ready" | "error";
type NamingMessageLevel = "error" | "warning" | "info";
type DestinationCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "collision"
  | "target-not-selected"
  | "invalid"
  | "error";

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

interface AppState {
  sourcePath: string | null;
  targetPath: string | null;
  documents: DocumentItem[];
  activeDocumentPath: string | null;
  queueMessage: string;
  isLoading: boolean;
  preview: PreviewState;
  naming: NamingState;
  destination: DestinationCheckState;
}

interface RefreshOptions {
  preserveSelection: boolean;
  successMessage: string;
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
  isLoading: false,
  preview: createIdlePreviewState(),
  naming: createIdleNamingState(),
  destination: createIdleDestinationCheckState()
};

let previewRequestId = 0;
let pdfRenderRequestId = 0;
let namingRequestId = 0;
let destinationRequestId = 0;
let destinationCheckTimer: number | null = null;

const version = document.querySelector<HTMLElement>("#app-version");
const selectSourceButton = document.querySelector<HTMLButtonElement>("#select-source");
const refreshSourceButton = document.querySelector<HTMLButtonElement>("#refresh-source");
const selectTargetButton = document.querySelector<HTMLButtonElement>("#select-target");
const sourcePath = document.querySelector<HTMLElement>("#source-path");
const targetPath = document.querySelector<HTMLElement>("#target-path");
const queueCount = document.querySelector<HTMLElement>("#queue-count");
const queueState = document.querySelector<HTMLElement>("#queue-state");
const documentList = document.querySelector<HTMLOListElement>("#document-list");
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

void window.docSorter.getVersion().then((value) => {
  if (version) {
    version.textContent = `v${value}`;
  }
});

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
  resetDestinationCheck();
  renderNamingPanel(false);
  scheduleDestinationCheck();
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
  state.preview = createIdlePreviewState();
  resetNamingState();
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
  render();
  scheduleDestinationCheck();
}

async function refreshDocuments(options: RefreshOptions): Promise<void> {
  if (!state.sourcePath) {
    state.queueMessage = "Aucun dossier source sélectionné";
    render();
    return;
  }

  const activeDocumentPathBeforeRefresh = options.preserveSelection ? state.activeDocumentPath : null;
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
  if (selectSourceButton) {
    selectSourceButton.disabled = disabled;
  }

  if (refreshSourceButton) {
    refreshSourceButton.disabled = disabled || !state.sourcePath;
  }

  if (selectTargetButton) {
    selectTargetButton.disabled = disabled;
  }
}

function render(): void {
  renderControls();
  renderPaths();
  renderQueue();
  renderPreview();
  renderDetails();
}

function renderControls(): void {
  if (refreshSourceButton) {
    refreshSourceButton.disabled = !state.sourcePath || state.isLoading;
  }
}

function renderPaths(): void {
  sourcePath?.replaceChildren(state.sourcePath ?? "Aucun dossier source sélectionné");
  targetPath?.replaceChildren(state.targetPath ?? "Aucun dossier cible sélectionné");
}

function renderQueue(): void {
  const documentCount = state.documents.length;
  queueCount?.replaceChildren(`${documentCount} document${documentCount > 1 ? "s" : ""}`);
  documentList?.replaceChildren(...state.documents.map(createDocumentListItem));

  if (!queueState) {
    return;
  }

  if (state.isLoading) {
    queueState.hidden = false;
    queueState.replaceChildren(state.queueMessage || "Analyse du dossier source");
    return;
  }

  queueState.hidden = state.queueMessage.length === 0;
  queueState.replaceChildren(state.queueMessage);
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

  icon.className = "document-icon";
  icon.textContent = documentItem.extension.replace(".", "").toUpperCase();

  title.textContent = documentItem.name;
  title.title = documentItem.name;
  meta.textContent = `${documentItem.extension.toUpperCase()} · ${documentItem.sizeLabel}`;
  status.className = "status-badge";
  status.textContent = statusLabel(documentItem.status);
  status.title = statusLabel(documentItem.status);

  content.append(title, meta, status);
  button.append(icon, content);
  button.addEventListener("click", () => {
    selectDocument(documentItem);
  });

  listItem.append(button);
  return listItem;
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
    renderNamingPanel(true);
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    documentDetails.className = "details-empty";
    documentDetails.replaceChildren("Aucun document actif");
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

function resetNamingState(): void {
  namingRequestId += 1;
  state.naming = createIdleNamingState();
  resetDestinationCheck();
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
