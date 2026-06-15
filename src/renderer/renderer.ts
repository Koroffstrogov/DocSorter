import type { AppError, DocumentItem, SupportedDocumentExtension } from "../documents/documentDiscovery";

interface AppState {
  sourcePath: string | null;
  targetPath: string | null;
  documents: DocumentItem[];
  activeDocumentPath: string | null;
  queueMessage: string;
  isLoading: boolean;
}

const state: AppState = {
  sourcePath: null,
  targetPath: null,
  documents: [],
  activeDocumentPath: null,
  queueMessage: "Aucun dossier source sélectionné",
  isLoading: false
};

const version = document.querySelector<HTMLElement>("#app-version");
const selectSourceButton = document.querySelector<HTMLButtonElement>("#select-source");
const selectTargetButton = document.querySelector<HTMLButtonElement>("#select-target");
const sourcePath = document.querySelector<HTMLElement>("#source-path");
const targetPath = document.querySelector<HTMLElement>("#target-path");
const queueCount = document.querySelector<HTMLElement>("#queue-count");
const queueState = document.querySelector<HTMLElement>("#queue-state");
const documentList = document.querySelector<HTMLOListElement>("#document-list");
const previewContent = document.querySelector<HTMLElement>("#preview-content");
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

  state.sourcePath = selection.value.path;
  state.documents = [];
  state.activeDocumentPath = null;
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

  state.documents = result.value.documents;
  state.activeDocumentPath = null;
  state.queueMessage =
    state.documents.length === 0 ? "Aucun document PDF/JPG/PNG trouvé" : "";
  render();
}

function applyDiscoveryError(error: AppError): void {
  state.documents = [];
  state.activeDocumentPath = null;
  state.queueMessage = error.message;
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
  button.ariaPressed = String(documentItem.filePath === state.activeDocumentPath);
  if (documentItem.filePath === state.activeDocumentPath) {
    button.classList.add("selected");
  }

  icon.className = "document-icon";
  icon.textContent = documentItem.extension.replace(".", "").toUpperCase();

  title.textContent = documentItem.name;
  meta.textContent = `${documentItem.extension.toUpperCase()} · ${documentItem.sizeLabel}`;
  status.className = "status-badge";
  status.textContent = statusLabel(documentItem.status);

  content.append(title, meta, status);
  button.append(icon, content);
  button.addEventListener("click", () => {
    state.activeDocumentPath = documentItem.filePath;
    render();
  });

  listItem.append(button);
  return listItem;
}

function renderPreview(): void {
  if (!previewContent) {
    return;
  }

  const activeDocument = getActiveDocument();
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-card";

  if (!activeDocument) {
    placeholder.textContent = "Sélectionnez un document";
    statusText?.replaceChildren("Lecture seule");
    previewContent.replaceChildren(placeholder);
    return;
  }

  placeholder.textContent = isImageExtension(activeDocument.extension)
    ? "Aperçu image prévu au Lot 2"
    : "Aperçu PDF prévu au Lot 2";
  statusText?.replaceChildren(statusLabel(activeDocument.status));
  previewContent.replaceChildren(placeholder);
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
  row.append(labelElement, valueElement);

  return row;
}

function getActiveDocument(): DocumentItem | null {
  return state.documents.find((documentItem) => documentItem.filePath === state.activeDocumentPath) ?? null;
}

function isImageExtension(extension: SupportedDocumentExtension): boolean {
  return extension === ".jpg" || extension === ".jpeg" || extension === ".png";
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
