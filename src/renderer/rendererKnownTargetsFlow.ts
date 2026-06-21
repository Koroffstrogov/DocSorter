async function refreshKnownTargets(): Promise<void> {
  state.knownTargets = {
    ...state.knownTargets,
    status: "loading",
    message: "Chargement de la liste locale des cibles...",
    error: ""
  };
  renderAiPanel();

  const result = await window.docSorter.listKnownTargets();
  applyKnownTargetsResult(result, "Liste locale des cibles chargée.");
}

async function createKnownTargetFromPanel(input: KnownTargetInput): Promise<void> {
  state.knownTargets = {
    ...state.knownTargets,
    status: "saving",
    message: "Ajout de la cible locale...",
    error: ""
  };
  renderAiPanel();

  const result = await window.docSorter.createKnownTarget(input);
  applyKnownTargetsResult(result, "Cible locale ajoutée.");
}

async function updateKnownTargetFromPanel(id: string, input: KnownTargetInput): Promise<void> {
  state.knownTargets = {
    ...state.knownTargets,
    status: "saving",
    message: "Mise à jour de la cible locale...",
    error: ""
  };
  renderAiPanel();

  const result = await window.docSorter.updateKnownTarget(id, input);
  applyKnownTargetsResult(result, "Cible locale mise à jour.");
  if (result.ok) {
    syncUpdatedKnownTargetSelection(id, result.value.targets);
  }
}

async function deactivateKnownTargetFromPanel(id: string): Promise<void> {
  state.knownTargets = {
    ...state.knownTargets,
    status: "saving",
    message: "Désactivation de la cible locale...",
    error: ""
  };
  renderAiPanel();

  const result = await window.docSorter.deactivateKnownTarget(id);
  applyKnownTargetsResult(result, "Cible locale désactivée.");
}

async function deleteKnownTargetFromPanel(id: string): Promise<void> {
  state.knownTargets = {
    ...state.knownTargets,
    status: "saving",
    message: "Suppression de la cible locale...",
    error: ""
  };
  renderAiPanel();

  const result = await window.docSorter.deleteKnownTarget(id);
  applyKnownTargetsResult(result, "Cible locale supprimée.");
  if (result.ok) {
    detachDeletedKnownTargetSelection(id);
  }
}

function selectKnownTargetForAiTarget(target: KnownTarget): void {
  if (!state.ai.selection || !state.ai.suggestion || !target.isActive) {
    return;
  }

  const activeDocument = getActiveDocument();
  state.ai.selection = updateAiSelectionField(
    state.ai.selection,
    "target",
    target.fileAlias,
    "known-target",
    activeDocument?.extension ?? ".pdf",
    state.targetPath,
    {
      id: target.id,
      displayName: target.displayName,
      fileAlias: target.fileAlias,
      source: "manual"
    }
  );
  state.ai.selection = {
    ...state.ai.selection,
    editingField: null
  };
  state.ai.message = `Cible locale sélectionnée : ${formatKnownTargetMessageValue(target)}.`;
  clearFolderLearningAlignedNameOverride();
  resetClassificationState();
  resetDestinationCheck();
  recalculateFolderLearningComparison();
  render();
  scheduleDestinationCheck();
}

function detachDeletedKnownTargetSelection(id: string): void {
  const selection = state.ai.selection;
  const selectedTarget = selection?.knownTargetSelections.target;
  if (!selection || selectedTarget?.id !== id) {
    return;
  }

  const activeDocument = getActiveDocument();
  state.ai.selection = updateAiSelectionField(
    selection,
    "target",
    selection.fields.target,
    "manual",
    activeDocument?.extension ?? ".pdf",
    state.targetPath
  );
  state.ai.message = "Cible locale supprimée. La cible courante reste une correction manuelle.";
  clearFolderLearningAlignedNameOverride();
  resetClassificationState();
  resetDestinationCheck();
  recalculateFolderLearningComparison();
  render();
  scheduleDestinationCheck();
}

function syncUpdatedKnownTargetSelection(id: string, targets: KnownTarget[]): void {
  const selection = state.ai.selection;
  const selectedTarget = selection?.knownTargetSelections.target;
  if (!selection || selectedTarget?.id !== id) {
    return;
  }

  const updatedTarget = targets.find((target) => target.id === id);
  if (!updatedTarget || !updatedTarget.isActive) {
    return;
  }

  const activeDocument = getActiveDocument();
  state.ai.selection = updateAiSelectionField(
    selection,
    "target",
    updatedTarget.fileAlias,
    "known-target",
    activeDocument?.extension ?? ".pdf",
    state.targetPath,
    {
      id: updatedTarget.id,
      displayName: updatedTarget.displayName,
      fileAlias: updatedTarget.fileAlias,
      source: "manual"
    }
  );
  state.ai.message = `Cible locale mise à jour : ${formatKnownTargetMessageValue(updatedTarget)}.`;
  clearFolderLearningAlignedNameOverride();
  resetClassificationState();
  resetDestinationCheck();
  recalculateFolderLearningComparison();
  render();
  scheduleDestinationCheck();
}

function formatKnownTargetMessageValue(target: KnownTarget): string {
  return target.displayName.trim().toLowerCase() === target.fileAlias.trim().toLowerCase()
    ? target.fileAlias
    : `${target.displayName} → ${target.fileAlias}`;
}

function applyKnownTargetsResult(
  result: KnownTargetsResult<KnownTargetsList>,
  successMessage: string
): void {
  if (!result.ok) {
    state.knownTargets = {
      ...state.knownTargets,
      status: "error",
      message: result.error.message,
      error: result.error.message
    };
    renderAiPanel();
    return;
  }

  state.knownTargets = {
    status: "ready",
    targets: result.value.targets,
    warnings: result.value.warnings,
    message: result.value.warnings[0] ?? successMessage,
    error: ""
  };
  renderAiPanel();
}
