type SupportedDocumentExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";
type PreviewKind = "image" | "pdf";
type PreviewStatus = "idle" | "loading" | "ready" | "error";

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
  status: "pending";
}

interface RendererPreviewData {
  kind: PreviewKind;
  filePath: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  bytes: ArrayBuffer;
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
  preview: createIdlePreviewState()
};

let previewRequestId = 0;
let pdfRenderRequestId = 0;

const version = document.querySelector<HTMLElement>("#app-version");
const selectSourceButton = document.querySelector<HTMLButtonElement>("#select-source");
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

void window.docSorter.getVersion().then((value) => {
  if (version) {
    version.textContent = `v${value}`;
  }
});

selectSourceButton?.addEventListener("click", () => {
  void selectSourceDirectory();
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
  state.queueMessage = "Analyse du dossier source";
  render();

  await refreshDocuments();
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
}

async function refreshDocuments(): Promise<void> {
  if (!state.sourcePath) {
    state.queueMessage = "Aucun dossier source sélectionné";
    render();
    return;
  }

  state.isLoading = true;
  render();

  const result = await window.docSorter.listDocuments(state.sourcePath);
  state.isLoading = false;

  if (!result.ok) {
    applyDiscoveryError(result.error);
    render();
    return;
  }

  clearPreviewResources();
  state.documents = result.value.documents;
  state.activeDocumentPath = null;
  state.preview = createIdlePreviewState();
  state.queueMessage =
    state.documents.length === 0 ? "Aucun document PDF/JPG/PNG trouvé" : "";
  render();
}

function applyDiscoveryError(error: AppError): void {
  clearPreviewResources();
  state.documents = [];
  state.activeDocumentPath = null;
  state.preview = createIdlePreviewState();
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
  render();
  void loadActivePreview(documentItem);
}

async function loadActivePreview(documentItem: DocumentItem): Promise<void> {
  const requestId = ++previewRequestId;
  const result = await window.docSorter.getPreviewData(documentItem.filePath);

  if (requestId !== previewRequestId || state.activeDocumentPath !== documentItem.filePath) {
    return;
  }

  if (!result.ok) {
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

  if (selectTargetButton) {
    selectTargetButton.disabled = disabled;
  }
}

function render(): void {
  renderPaths();
  renderQueue();
  renderPreview();
  renderDetails();
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
    queueState.replaceChildren("Analyse du dossier source");
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

  icon.className = "document-icon";
  icon.textContent = documentItem.extension.replace(".", "").toUpperCase();

  title.textContent = documentItem.name;
  title.title = documentItem.name;
  meta.textContent = `${documentItem.extension.toUpperCase()} · ${documentItem.sizeLabel}`;
  status.className = "status-badge";
  status.textContent = statusLabel(documentItem.status);

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
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    documentDetails.className = "details-empty";
    documentDetails.replaceChildren("Aucun document actif");
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

function getActiveDocument(): DocumentItem | null {
  return state.documents.find((documentItem) => documentItem.filePath === state.activeDocumentPath) ?? null;
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
