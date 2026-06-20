function resetFolderLearningState(): void {
  folderLearningRequestId += 1;
  state.folderLearning = createIdleFolderLearningState();
}

async function refreshFolderLearningForCurrentTargetFolder(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !state.targetPath) {
    resetFolderLearningState();
    renderNamingPanel(false);
    return;
  }

  const requestedFolder = state.targetFolder.selectedFolder;
  const requestId = ++folderLearningRequestId;
  state.folderLearning = {
    ...createIdleFolderLearningState(),
    status: "loading",
    targetFolder: requestedFolder,
    message: "Lecture passive des noms du dossier cible..."
  };
  renderNamingPanel(false);

  const result = await window.docSorter.listTargetFolderNames();
  if (
    requestId !== folderLearningRequestId ||
    state.targetFolder.selectedFolder !== requestedFolder ||
    state.activeDocumentPath !== activeDocument.filePath
  ) {
    return;
  }

  if (!result.ok) {
    state.folderLearning = {
      ...createIdleFolderLearningState(),
      status: "error",
      targetFolder: requestedFolder,
      message: "Convention du dossier indisponible.",
      error: result.error.message
    };
    renderNamingPanel(false);
    return;
  }

  applyFolderLearningNameList(result.value as FolderLearningNameList);
}

function applyFolderLearningNameList(nameList: FolderLearningNameList): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    resetFolderLearningState();
    renderNamingPanel(false);
    return;
  }

  const analysis = buildFolderLearningAnalysis(nameList, activeDocument);
  state.folderLearning = {
    status: "ready",
    targetFolder: nameList.targetFolder,
    entries: nameList.entries,
    profile: analysis.profile,
    comparison: analysis.comparison,
    pipeline: analysis.pipeline,
    message: folderLearningMessage(analysis),
    error: "",
    warnings: [...nameList.warnings, ...analysis.profile.warnings, ...(analysis.comparison?.warnings ?? [])]
  };
  renderNamingPanel(false);
}

function recalculateFolderLearningComparison(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || state.folderLearning.status !== "ready") {
    return;
  }

  const nameList: FolderLearningNameList = {
    targetFolder: state.folderLearning.targetFolder,
    entries: state.folderLearning.entries,
    truncated: false,
    entryLimit: state.folderLearning.entries.length,
    warnings: []
  };
  const analysis = buildFolderLearningAnalysis(nameList, activeDocument);
  state.folderLearning = {
    ...state.folderLearning,
    profile: analysis.profile,
    comparison: analysis.comparison,
    pipeline: analysis.pipeline,
    message: folderLearningMessage(analysis),
    warnings: [...analysis.profile.warnings, ...(analysis.comparison?.warnings ?? [])]
  };
}

function buildFolderLearningAnalysis(
  nameList: FolderLearningNameList,
  activeDocument: DocumentItem
): FolderLearningAnalysis {
  const aiPreview = getAiNamingPreview();
  return DocSorterFolderLearningSummary.buildAnalysis({
    entries: nameList.entries,
    targetFolder: nameList.targetFolder,
    aiName: aiPreview?.filename ?? "",
    aiFields: aiPreview?.fields ?? null,
    extension: activeDocument.extension,
    warnings: nameList.warnings
  });
}

function folderLearningMessage(analysis: FolderLearningAnalysis): string {
  const profile = analysis.profile;
  if (profile.status === "none") {
    return "Aucune convention de nommage détectée dans le dossier.";
  }

  const target = profile.dominantTarget ? ` avec ${profile.dominantTarget}` : "";
  const aligned = analysis.comparison?.alignedName
    ? ` Nom aligné proposé : ${analysis.comparison.alignedName}.`
    : "";
  return `Convention du dossier détectée : ${profile.recognizedFileCount} nom(s) compatible(s)${target}.${aligned}`;
}
