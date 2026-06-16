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

function updateNamingDraftFromInputs(draft: NamingDraft): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  state.naming.draft = draft;
  state.naming.overrideFilename = null;
  state.naming.isLoading = true;
  resetClassificationState();
  resetDestinationCheck();
  renderNamingPanel(false);
  void updateNamingProposal(activeDocument.extension, ++namingRequestId);
}

function applyDestinationAlternative(): void {
  const alternativeFilename = state.destination.result?.alternativeFilename;
  if (!alternativeFilename) {
    return;
  }

  state.naming.overrideFilename = alternativeFilename;
  resetClassificationState();
  resetDestinationCheck();
  renderNamingPanel(false);
  scheduleDestinationCheck();
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
  namingPanelView.render(syncInputs);
  renderDestinationCheck();
  renderClassificationSummary();
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
  namingPanelView.renderDestinationCheck();
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

