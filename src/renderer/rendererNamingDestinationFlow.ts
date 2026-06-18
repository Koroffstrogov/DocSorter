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
    origins: createLegacyFilenameNamingDraftOrigins(),
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

  state.naming.origins = mergeNamingDraftOriginsForManualEdit(state.naming.draft, draft, state.naming.origins);
  state.naming.draft = draft;
  state.naming.overrideFilename = null;
  state.naming.isLoading = true;
  resetClassificationState();
  resetDestinationCheck();
  renderNamingPanel(false);
  void updateNamingProposal(activeDocument.extension, ++namingRequestId);
}

function mergeNamingDraftOriginsForManualEdit(
  previousDraft: NamingDraft,
  nextDraft: NamingDraft,
  previousOrigins: NamingDraftOrigins
): NamingDraftOrigins {
  return {
    documentDate:
      previousDraft.documentDate !== nextDraft.documentDate ? "manual" : previousOrigins.documentDate,
    subject: previousDraft.subject !== nextDraft.subject ? "manual" : previousOrigins.subject,
    documentType:
      previousDraft.documentType !== nextDraft.documentType ? "manual" : previousOrigins.documentType,
    keywords: previousDraft.keywords !== nextDraft.keywords ? "manual" : previousOrigins.keywords
  };
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

async function loadTargetFolders(): Promise<void> {
  const requestId = ++targetFolderRequestId;

  if (!state.targetPath) {
    state.targetFolder = createIdleTargetFolderState();
    renderPaths();
    renderNamingPanel(false);
    return;
  }

  state.targetFolder = {
    ...state.targetFolder,
    status: "loading",
    message: "Lecture des sous-dossiers cible..."
  };
  renderPaths();
  renderNamingPanel(false);

  const result = await window.docSorter.listTargetFolders();
  if (requestId !== targetFolderRequestId) {
    return;
  }

  if (!result.ok) {
    state.targetFolder = {
      ...state.targetFolder,
      folders: [],
      status: "error",
      message: result.error.message
    };
    renderNamingPanel(false);
    return;
  }

  state.targetFolder = {
    ...state.targetFolder,
    folders: result.value.folders,
    status: "ready",
    message: state.targetFolder.selectedFolder
      ? "Sous-dossier cible prêt."
      : "Classement à la racine cible."
  };
  renderNamingPanel(false);
}

async function updateTargetFolderFromInput(
  targetFolder: string,
  origin: NamingFieldOrigin = "manual"
): Promise<void> {
  const requestId = ++targetFolderRequestId;
  state.targetFolder = {
    ...state.targetFolder,
    selectedFolder: targetFolder,
    status: state.targetPath ? "ready" : "idle",
    message: targetFolder ? "Sous-dossier cible à vérifier." : "Classement à la racine cible.",
    origin
  };
  resetClassificationState();
  resetDestinationCheck();
  renderPaths();
  renderNamingPanel(false);

  const result = await window.docSorter.setTargetFolder(targetFolder);
  if (requestId !== targetFolderRequestId) {
    return;
  }

  if (!result.ok) {
    state.targetFolder = {
      ...state.targetFolder,
      selectedFolder: targetFolder,
      status: "invalid",
      message: result.error.message,
      origin
    };
    state.destination = {
      ...createIdleDestinationCheckState(),
      status: "error",
      checkedFilename: getEffectiveProposedFilename(),
      error: result.error as DestinationAvailabilityError
    };
    renderPaths();
    renderDestinationCheck();
    return;
  }

  state.targetFolder = {
    ...state.targetFolder,
    selectedFolder: result.value,
    status: "ready",
    message: result.value ? "Sous-dossier cible à vérifier." : "Classement à la racine cible.",
    origin
  };
  renderPaths();
  scheduleDestinationCheck();
}

async function createSelectedTargetFolder(): Promise<void> {
  if (!state.targetPath || !state.targetFolder.selectedFolder || state.targetFolder.status === "creating") {
    return;
  }

  const targetFolder = state.targetFolder.selectedFolder;
  const confirmed = window.confirm(
    `Créer le sous-dossier cible "${targetFolder}" sous la racine sélectionnée ?`
  );
  if (!confirmed) {
    return;
  }

  const requestId = ++targetFolderRequestId;
  state.targetFolder = {
    ...state.targetFolder,
    status: "creating",
    message: "Création du sous-dossier cible..."
  };
  resetClassificationState();
  resetDestinationCheck();
  renderNamingPanel(false);

  const result = await window.docSorter.createTargetFolder(targetFolder);
  if (requestId !== targetFolderRequestId) {
    return;
  }

  if (!result.ok) {
    state.targetFolder = {
      ...state.targetFolder,
      status: "error",
      message: result.error.message
    };
    state.destination = {
      ...createIdleDestinationCheckState(),
      status: "error",
      checkedFilename: getEffectiveProposedFilename(),
      error: result.error as DestinationAvailabilityError
    };
    renderDestinationCheck();
    return;
  }

  state.targetFolder = {
    selectedFolder: result.value.targetFolder,
    folders: addFolderToList(state.targetFolder.folders, result.value.targetFolder),
    status: result.value.created ? "created" : "ready",
    message: result.value.message,
    origin: state.targetFolder.origin
  };
  renderPaths();
  renderNamingPanel(false);
  void loadTargetFolders();
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

function addFolderToList(folders: string[], targetFolder: string): string[] {
  if (!targetFolder || folders.includes(targetFolder)) {
    return folders;
  }

  return [...folders, targetFolder].sort((left, right) => left.localeCompare(right, "fr"));
}
