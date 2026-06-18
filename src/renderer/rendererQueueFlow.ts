function renderPaths(): void {
  sourcePath?.replaceChildren(state.sourcePath ?? "Aucun dossier source sélectionné");
  targetPath?.replaceChildren(formatTargetLocation());
  if (targetPath) {
    targetPath.title = formatTargetLocation();
  }
}

function renderQueue(): void {
  queuePanel.render();
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
  queuePanel.navigate(direction);
}

function navigateVisibleQueueByOffset(offset: number): void {
  queuePanel.navigateByOffset(offset);
}

function focusQueueSearch(): void {
  queuePanel.focusSearch();
}

function clearQueueSearch(): void {
  queuePanel.clearSearch();
}

function setQueueFilter(filter: QueueViewFilter): void {
  queuePanel.setFilter(filter);
}

function selectDocumentByPath(filePath: string): void {
  const documentItem = state.documents.find((candidate) => candidate.filePath === filePath);
  if (!documentItem) {
    return;
  }

  selectDocument(documentItem);
}

function renderPreview(): void {
  previewPanel.render();
}

function renderDetails(): void {
  documentDetailsPanel.render();
  renderDuplicatePanel();
  renderTextExtractionPanel();
  renderNamingPanel(true);
}

function formatTargetLocation(): string {
  if (!state.targetPath) {
    return "Aucune racine cible sélectionnée";
  }

  if (!state.targetFolder.selectedFolder) {
    return `${state.targetPath} | Sous-dossier : racine`;
  }

  return `${state.targetPath} | Sous-dossier : ${state.targetFolder.selectedFolder}`;
}
