async function refreshAiStatus(): Promise<void> {
  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "loading",
    message: "Chargement de la configuration IA locale...",
    error: null,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  renderAiPanel();

  const result = await window.docSorter.getAiStatus();
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    return;
  }

  applyAiStatus(result.value as RendererAiStatus);
  void refreshAiModelStatus();
}

let aiPipelineTimer: number | null = null;

async function saveAiSettingsFromPanel(): Promise<void> {
  if (isAiBusy()) {
    return;
  }

  const settings = aiDraftToSettings(state.ai.draft);
  if (!settings) {
    applyAiError({
      code: "AI_CONFIG_INVALID",
      message: "Configuration IA locale incomplète ou invalide."
    });
    return;
  }

  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "saving",
    message: "Sauvegarde de la configuration IA locale...",
    error: null,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  renderAiPanel();

  const result = await window.docSorter.saveAiSettings(settings);
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    return;
  }

  applyAiStatus(result.value as RendererAiStatus);
  void refreshAiModelStatus();
}

async function testAiConnectionFromPanel(): Promise<void> {
  if (isAiBusy() || state.ai.dirty) {
    return;
  }

  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "testing",
    message: "Test local d'Ollama sans envoi de document...",
    error: null,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  renderAiPanel();

  const result = await window.docSorter.testAiConnection();
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    void refreshAiStatus();
    return;
  }

  applyAiStatus(result.value as RendererAiStatus);
  void refreshAiModelStatus();
}

function updateAiDraft(draft: AiSettingsDraft): void {
  state.ai = {
    ...state.ai,
    draft,
    dirty: true,
    panelStatus: "ready",
    message: "Configuration IA modifiée. Sauvegardez avant de tester Ollama.",
    error: null,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  renderAiPanel();
}

function renderAiPanel(): void {
  aiPanel.render();
}

async function refreshAiModelStatus(): Promise<void> {
  const result = await window.docSorter.getAiModelStatus();
  if (!result.ok) {
    state.ai = {
      ...state.ai,
      modelStatus: null
    };
    renderAiPanel();
    return;
  }

  state.ai = {
    ...state.ai,
    modelStatus: result.value as RendererAiModelStatus
  };
  renderAiPanel();
}

async function unloadAiModelFromPanel(): Promise<void> {
  if (isAiBusy() || !canUnloadAiModel()) {
    return;
  }

  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "unloading",
    message: "Libération du modèle IA local...",
    error: null
  };
  renderAiPanel();

  const result = await window.docSorter.unloadAiModel();
  if (requestId !== aiRequestId) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    return;
  }

  state.ai = {
    ...state.ai,
    panelStatus: "ready",
    message: result.value.message,
    error: null,
    modelStatus: result.value as RendererAiModelStatus
  };
  render();
}

async function preloadAiModelFromPanel(): Promise<void> {
  if (isAiBusy() || !canPreloadAiModel()) {
    return;
  }

  const requestId = ++aiRequestId;
  const startedAt = nowMs();
  startAiPipelineTimer("connection");
  state.ai = {
    ...state.ai,
    panelStatus: "preloading",
    message: "Connexion Ollama...",
    error: null,
    modelStatus: {
      status: "loading",
      model: state.ai.status?.settings.model ?? state.ai.draft.model,
      message: "Connexion Ollama...",
      loadedAt: null,
      keepAliveUntil: null,
      lastCheckedAt: null,
      error: null
    },
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  renderAiPanel();

  const connection = await window.docSorter.testAiConnection();
  if (requestId !== aiRequestId) {
    return;
  }
  if (!connection.ok) {
    finishAiPipelineTimer("error", { finalElapsedMs: nowMs() - startedAt });
    applyAiError(connection.error as RendererAiError);
    return;
  }

  state.ai.status = connection.value as RendererAiStatus;
  state.ai.draft = aiStatusToDraft(connection.value as RendererAiStatus);
  if (connection.value.status !== "ok") {
    finishAiPipelineTimer("error", { finalElapsedMs: nowMs() - startedAt });
    state.ai = {
      ...state.ai,
      panelStatus: "error",
      message: connection.value.message,
      error: connection.value.error
    };
    renderAiPanel();
    return;
  }

  const loadStartedAt = nowMs();
  updateAiPipelineStage("model-loading");
  state.ai = {
    ...state.ai,
    message: "Chargement anticipé du modèle IA...",
    modelStatus: {
      status: "loading",
      model: connection.value.settings.model,
      message: "Chargement du modèle IA...",
      loadedAt: null,
      keepAliveUntil: null,
      lastCheckedAt: null,
      error: null
    }
  };
  renderAiPanel();

  const preload = await window.docSorter.preloadAiModel();
  if (requestId !== aiRequestId) {
    return;
  }

  const loadMs = nowMs() - loadStartedAt;
  const totalMs = nowMs() - startedAt;
  if (!preload.ok) {
    finishAiPipelineTimer("error", { finalElapsedMs: totalMs, lastLoadMs: loadMs });
    applyAiError(preload.error as RendererAiError);
    return;
  }

  state.ai = {
    ...state.ai,
    panelStatus: "ready",
    message: preload.value.message,
    error: null,
    modelStatus: preload.value as RendererAiModelStatus
  };
  finishAiPipelineTimer("completed", { finalElapsedMs: totalMs, lastLoadMs: loadMs });
  render();
}

async function runAiSuggestionForActiveDocument(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    applyAiError({
      code: "AI_DOCUMENT_NOT_SELECTED",
      message: "Aucun document sélectionné pour l'analyse IA."
    });
    return;
  }

  if (!canRunAiSuggestion()) {
    return;
  }

  const requestId = ++aiSuggestionRequestId;
  const startedAt = nowMs();
  let loadMs: number | null = null;
  let generationMs: number | null = null;
  startAiPipelineTimer("connection");
  state.ai = {
    ...state.ai,
    panelStatus: "analyzing",
    message: "Connexion Ollama...",
    error: null,
    modelStatus: state.ai.modelStatus?.status === "ready"
      ? state.ai.modelStatus
      : {
          status: "loading",
          model: state.ai.status?.settings.model ?? state.ai.draft.model,
          message: "Connexion Ollama...",
          loadedAt: null,
          keepAliveUntil: null,
          lastCheckedAt: null,
          error: null
        },
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  renderAiPanel();

  const connection = await window.docSorter.testAiConnection();
  if (requestId !== aiSuggestionRequestId || state.activeDocumentPath !== activeDocument.filePath) {
    return;
  }
  if (!connection.ok) {
    finishAiPipelineTimer("error", { finalElapsedMs: nowMs() - startedAt });
    applyAiError(connection.error as RendererAiError);
    return;
  }

  state.ai.status = connection.value as RendererAiStatus;
  state.ai.draft = aiStatusToDraft(connection.value as RendererAiStatus);
  if (connection.value.status !== "ok") {
    finishAiPipelineTimer("error", { finalElapsedMs: nowMs() - startedAt });
    state.ai = {
      ...state.ai,
      panelStatus: "error",
      message: connection.value.message,
      error: connection.value.error
    };
    renderAiPanel();
    return;
  }

  if (!isAiModelReadyForCurrentSettings()) {
    const loadStartedAt = nowMs();
    updateAiPipelineStage("model-loading");
    state.ai = {
      ...state.ai,
      message: "Chargement du modèle IA...",
      modelStatus: {
        status: "loading",
        model: connection.value.settings.model,
        message: "Chargement du modèle IA...",
        loadedAt: null,
        keepAliveUntil: null,
        lastCheckedAt: null,
        error: null
      }
    };
    renderAiPanel();

    const preload = await window.docSorter.preloadAiModel();
    if (requestId !== aiSuggestionRequestId || state.activeDocumentPath !== activeDocument.filePath) {
      return;
    }
    loadMs = nowMs() - loadStartedAt;
    if (!preload.ok) {
      finishAiPipelineTimer("error", { finalElapsedMs: nowMs() - startedAt, lastLoadMs: loadMs });
      applyAiError(preload.error as RendererAiError);
      return;
    }

    state.ai = {
      ...state.ai,
      modelStatus: preload.value as RendererAiModelStatus
    };
  }

  let textContext = getActiveAiTextContext(activeDocument);
  if (!textContext && activeDocument.extension === ".pdf") {
    updateAiPipelineStage("text-extraction");
    state.ai = {
      ...state.ai,
      message: "Extraction texte PDF avant analyse IA..."
    };
    renderAiPanel();

    await extractTextFromActivePdf();
    if (requestId !== aiSuggestionRequestId || state.activeDocumentPath !== activeDocument.filePath) {
      return;
    }
    textContext = getActiveAiTextContext(activeDocument);
  }

  if (!textContext) {
    const message = activeDocument.extension === ".pdf"
      ? "OCR nécessaire ou texte PDF inexploitable."
      : "OCR nécessaire avant l'analyse IA locale.";
    finishAiPipelineTimer("error", {
      finalElapsedMs: nowMs() - startedAt,
      lastLoadMs: loadMs
    });
    applyAiError({
      code: "AI_TEXT_NOT_AVAILABLE",
      message
    });
    return;
  }

  updateAiPipelineStage("analysis");
  state.ai = {
    ...state.ai,
    message: "Analyse IA locale du document actif..."
  };
  renderAiPanel();

  const generationStartedAt = nowMs();
  const result = await window.docSorter.runAiSuggestionForActiveDocument(
    activeDocument.filePath,
    textContext
  );
  generationMs = nowMs() - generationStartedAt;
  if (requestId !== aiSuggestionRequestId || state.activeDocumentPath !== activeDocument.filePath) {
    return;
  }

  if (!result.ok) {
    finishAiPipelineTimer("error", {
      finalElapsedMs: nowMs() - startedAt,
      lastLoadMs: loadMs,
      lastGenerationMs: generationMs
    });
    applyAiError(result.error as RendererAiError);
    void refreshAiModelStatus();
    return;
  }

  const aiSelection = buildAiSelectionFromSuggestion(
    result.value as RendererAiDocumentSuggestion,
    activeDocument.extension,
    state.targetPath
  );
  state.ai = {
    ...state.ai,
    panelStatus: "suggestion-ready",
    message: result.value.message,
    error: null,
    modelStatus: result.value.modelStatus as RendererAiModelStatus,
    suggestion: result.value as RendererAiDocumentSuggestion,
    suggestionDocumentPath: activeDocument.filePath,
    selection: aiSelection
  };
  finishAiPipelineTimer("completed", {
    finalElapsedMs: nowMs() - startedAt,
    lastLoadMs: loadMs,
    lastAnalysisMs: nowMs() - startedAt,
    lastGenerationMs: generationMs
  });
  syncAiSelectedFolderToTargetFolder(aiSelection.selectedFolder);
  render();
}

async function exportAiDiagnosticForActiveDocument(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canExportAiDiagnostic()) {
    return;
  }

  const textContext = getActiveAiTextContext(activeDocument);
  const aiResult = state.ai.suggestion
    ? { ok: true as const, value: state.ai.suggestion }
    : state.ai.error
      ? { ok: false as const, error: state.ai.error }
      : null;

  state.ai = {
    ...state.ai,
    message: "Export du diagnostic IA..."
  };
  renderAiPanel();

  const result = await window.docSorter.exportAiDiagnostic(
    activeDocument.filePath,
    textContext,
    aiResult
  );

  if (!result.ok) {
    applyAiError({
      code: "UNKNOWN_ERROR",
      message: result.error.message
    });
    return;
  }

  state.ai = {
    ...state.ai,
    message: result.value.message,
    error: null
  };
  renderAiPanel();
}

function canRunAiSuggestion(): boolean {
  const activeDocument = getActiveDocument();
  return Boolean(
    activeDocument &&
      activeDocument.status !== "missing" &&
      state.ai.status?.settings.enabled &&
      state.ai.status.status !== "disabled" &&
      state.ai.status.status !== "model-missing" &&
      !state.ai.dirty &&
      !isAiBusy()
  );
}

function canPreloadAiModel(): boolean {
  return Boolean(
    state.ai.status?.settings.enabled &&
      state.ai.status.status !== "disabled" &&
      !state.ai.dirty &&
      !isAiBusy()
  );
}

function canExportAiDiagnostic(): boolean {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !getActiveAiTextContext(activeDocument) || isAiBusy()) {
    return false;
  }

  return Boolean(
    (state.ai.suggestion && state.ai.suggestionDocumentPath === activeDocument.filePath) ||
      state.ai.error
  );
}

function canUnloadAiModel(): boolean {
  return Boolean(
    state.ai.status?.settings.enabled &&
      state.ai.modelStatus &&
      (state.ai.modelStatus.status === "ready" || state.ai.modelStatus.status === "error")
  );
}

function selectAiFieldCandidate(field: AiSelectionFieldKey, value: string): void {
  if (!state.ai.selection || !state.ai.suggestion) {
    return;
  }

  const activeDocument = getActiveDocument();
  state.ai.selection = updateAiSelectionField(
    state.ai.selection,
    field,
    value,
    "candidate",
    activeDocument?.extension ?? ".pdf",
    state.targetPath
  );
  state.ai.message = "Candidat IA sélectionné. Prévisualisation recalculée.";
  clearFolderLearningAlignedNameOverride();
  resetClassificationState();
  resetDestinationCheck();
  recalculateFolderLearningComparison();
  render();
  scheduleDestinationCheck();
}

function startAiFieldManualEdit(field: AiSelectionFieldKey): void {
  if (!state.ai.selection) {
    return;
  }

  state.ai.selection = {
    ...state.ai.selection,
    editingField: state.ai.selection.editingField === field ? null : field,
    editingFolder: false
  };
  renderAiPanel();
}

function updateAiFieldManualValue(field: AiSelectionFieldKey, value: string): void {
  if (!state.ai.selection) {
    return;
  }

  const activeDocument = getActiveDocument();
  state.ai.selection = updateAiSelectionField(
    state.ai.selection,
    field,
    value,
    "manual",
    activeDocument?.extension ?? ".pdf",
    state.targetPath
  );
  state.ai.message = "Champ IA manuel modifié. Prévisualisation recalculée.";
  clearFolderLearningAlignedNameOverride();
  resetClassificationState();
  resetDestinationCheck();
  recalculateFolderLearningComparison();
  renderNamingPanel(false);
  scheduleDestinationCheck();
}

function finishAiFieldManualEdit(): void {
  if (!state.ai.selection) {
    return;
  }

  state.ai.selection = {
    ...state.ai.selection,
    editingField: null
  };
  render();
}

function selectAiFolderCandidate(relativePath: string): void {
  if (!state.ai.selection) {
    return;
  }

  updateAiSelectedFolder(relativePath, "Dossier IA sélectionné. Prévisualisation recalculée.", false);
  render();
}

function startAiFolderManualEdit(): void {
  if (!state.ai.selection) {
    return;
  }

  state.ai.selection = {
    ...state.ai.selection,
    editingField: null,
    editingFolder: !state.ai.selection.editingFolder
  };
  renderAiPanel();
}

function updateAiFolderManualValue(relativePath: string): void {
  if (!state.ai.selection) {
    return;
  }

  updateAiSelectedFolder(relativePath, "Dossier IA manuel modifié. Prévisualisation recalculée.", true);
  renderNamingPanel(false);
}

function finishAiFolderManualEdit(): void {
  if (!state.ai.selection) {
    return;
  }

  state.ai.selection = {
    ...state.ai.selection,
    editingFolder: false
  };
  render();
}

function updateAiSelectedFolder(relativePath: string, message: string, keepEditing: boolean): void {
  if (!state.ai.selection) {
    return;
  }

  const selectedFolder = relativePath.trim();
  state.ai.selection = recalculateAiSelection({
    ...state.ai.selection,
    editingFolder: keepEditing,
    selectedFolder
  }, getActiveDocument()?.extension ?? ".pdf", state.targetPath);
  state.ai.message = message;
  clearFolderLearningAlignedNameOverride();
  recalculateFolderLearningComparison();
  syncAiSelectedFolderToTargetFolder(selectedFolder);
}

function syncAiSelectedFolderToTargetFolder(selectedFolder: string): void {
  if (state.targetPath) {
    void updateTargetFolderFromInput(selectedFolder, "ai-v2");
    return;
  }

  state.targetFolder = {
    ...state.targetFolder,
    selectedFolder,
    status: "idle",
    message: selectedFolder ? "Sous-dossier cible à vérifier." : "Classement à la racine cible.",
    origin: "ai-v2"
  };
  resetClassificationState();
  resetDestinationCheck();
  renderPaths();
}

function applyAiSuggestionToEmptyFields(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canApplyAiSuggestionToEmptyFields() || !state.ai.suggestion) {
    return;
  }

  const targetFolder = state.ai.suggestion.suggestion.targetFolder?.trim() ?? "";
  const result = buildNamingDraftFromAiSuggestion(
    state.naming.draft,
    state.naming.origins,
    state.ai.suggestion.suggestion
  );
  const shouldApplyTargetFolder = canApplyAiSuggestionTargetFolder(
    targetFolder,
    state.ai.suggestion.suggestion.confidence
  );
  clearFolderLearningAlignedNameOverride();

  state.ai = {
    ...state.ai,
    message: createAiApplicationMessage(result.appliedFields, shouldApplyTargetFolder)
  };

  if (result.appliedFields.length > 0) {
    state.naming.draft = result.draft;
    state.naming.origins = result.origins;
    state.naming.overrideFilename = null;
    state.naming.overrideFilenameOrigin = null;
    state.naming.isLoading = true;
    resetClassificationState();
    resetDestinationCheck();
    render();
    void updateNamingProposal(activeDocument.extension, ++namingRequestId);
  } else {
    render();
  }

  if (shouldApplyTargetFolder && targetFolder) {
    void updateTargetFolderFromInput(targetFolder, "ai-v2");
  }
}

function canApplyAiSuggestionToEmptyFields(): boolean {
  const activeDocument = getActiveDocument();
  if (
    !activeDocument ||
    !state.ai.suggestion ||
    state.ai.suggestionDocumentPath !== activeDocument.filePath ||
    state.naming.isLoading ||
    isClassificationBusy()
  ) {
    return false;
  }

  return Boolean(
    hasApplicableAiSuggestionField(
      state.naming.draft,
      state.naming.origins,
      state.ai.suggestion.suggestion
    ) ||
      canApplyAiSuggestionTargetFolder(
        state.ai.suggestion.suggestion.targetFolder ?? "",
        state.ai.suggestion.suggestion.confidence
      )
  );
}

function ignoreAiSuggestion(): void {
  if (!state.ai.suggestion) {
    return;
  }

  state.ai = {
    ...state.ai,
    panelStatus: "ready",
    message: "Suggestion IA ignorée. Aucun champ n'a été modifié.",
    error: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null
  };
  clearFolderLearningAlignedNameOverride();
  recalculateFolderLearningComparison();
  render();
}

function applyAiStatus(status: RendererAiStatus): void {
  state.ai = {
    panelStatus: "ready",
    status,
    draft: aiStatusToDraft(status),
    message: status.message,
    error: status.error,
    dirty: false,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null,
    timing: state.ai.timing
  };
  render();
}

function applyAiError(error: RendererAiError): void {
  state.ai = {
    ...state.ai,
    panelStatus: "error",
    message: error.message,
    error
  };
  render();
}

function aiStatusToDraft(status: RendererAiStatus): AiSettingsDraft {
  return {
    enabled: status.settings.enabled,
    profileId: status.settings.profileId,
    baseUrl: status.settings.baseUrl || "http://localhost:11434/",
    model: status.settings.model,
    timeoutMs: String(status.settings.timeoutMs || 30000),
    keepAlive: status.settings.keepAlive || "30m"
  };
}

function aiDraftToSettings(draft: AiSettingsDraft): RendererAiSettings | null {
  const timeoutMs = Number(draft.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    return null;
  }

  return {
    enabled: draft.enabled,
    provider: "ollama",
    baseUrl: draft.baseUrl.trim(),
    profileId: draft.profileId,
    model: draft.model.trim(),
    think: draft.profileId === "gemma4-12b-thinking",
    timeoutMs,
    keepAlive: draft.keepAlive || "30m",
    lastTestAt: null,
    lastStatus: draft.enabled ? null : "disabled",
    lastError: null
  };
}

function isAiBusy(): boolean {
  return (
    state.ai.panelStatus === "loading" ||
    state.ai.panelStatus === "saving" ||
    state.ai.panelStatus === "testing" ||
    state.ai.panelStatus === "preloading" ||
    state.ai.panelStatus === "unloading" ||
    state.ai.panelStatus === "analyzing" ||
    isClassificationBusy()
  );
}

function isAiModelReadyForCurrentSettings(): boolean {
  const model = state.ai.status?.settings.model ?? state.ai.draft.model;
  return Boolean(
    state.ai.modelStatus?.status === "ready" &&
      state.ai.modelStatus.model === model
  );
}

function startAiPipelineTimer(stage: AiPipelineStage): void {
  stopAiPipelineTimer();
  const startedAtMs = nowMs();
  state.ai.timing = {
    ...state.ai.timing,
    stage,
    startedAtMs,
    elapsedMs: 0,
    finalElapsedMs: null,
    model: state.ai.status?.settings.model ?? state.ai.draft.model,
    profileId: state.ai.status?.settings.profileId ?? state.ai.draft.profileId,
    think: state.ai.status?.settings.think ?? state.ai.draft.profileId === "gemma4-12b-thinking"
  };
  aiPipelineTimer = window.setInterval(() => {
    if (!state.ai.timing.startedAtMs) {
      return;
    }
    state.ai.timing = {
      ...state.ai.timing,
      elapsedMs: nowMs() - state.ai.timing.startedAtMs
    };
    renderAiPanel();
  }, 100);
}

function updateAiPipelineStage(stage: AiPipelineStage): void {
  state.ai.timing = {
    ...state.ai.timing,
    stage,
    elapsedMs: state.ai.timing.startedAtMs ? nowMs() - state.ai.timing.startedAtMs : state.ai.timing.elapsedMs
  };
  renderAiPanel();
}

function finishAiPipelineTimer(
  stage: "completed" | "error",
  metrics: {
    finalElapsedMs: number;
    lastLoadMs?: number | null;
    lastAnalysisMs?: number | null;
    lastGenerationMs?: number | null;
  }
): void {
  stopAiPipelineTimer();
  state.ai.timing = {
    ...state.ai.timing,
    stage,
    startedAtMs: null,
    elapsedMs: metrics.finalElapsedMs,
    finalElapsedMs: metrics.finalElapsedMs,
    lastLoadMs: metrics.lastLoadMs ?? state.ai.timing.lastLoadMs,
    lastAnalysisMs: metrics.lastAnalysisMs ?? state.ai.timing.lastAnalysisMs,
    lastGenerationMs: metrics.lastGenerationMs ?? state.ai.timing.lastGenerationMs,
    model: state.ai.status?.settings.model ?? state.ai.timing.model,
    profileId: state.ai.status?.settings.profileId ?? state.ai.timing.profileId,
    think: state.ai.status?.settings.think ?? state.ai.timing.think
  };
}

function stopAiPipelineTimer(): void {
  if (aiPipelineTimer !== null) {
    window.clearInterval(aiPipelineTimer);
    aiPipelineTimer = null;
  }
}

function nowMs(): number {
  return Date.now();
}

function getActiveAiTextContext(
  documentItem: DocumentItem | null
): RendererAiDocumentTextContext | null {
  if (!documentItem) {
    return null;
  }

  const extraction = getTextExtractionState(documentItem.filePath).result;
  const excerpt = (extraction?.text ?? extraction?.excerpt ?? "").trim().slice(0, 6_000);
  if (!extraction || !excerpt || extraction.status !== "text-found") {
    return null;
  }

  return {
    source: extraction.source ?? (documentItem.extension === ".pdf" ? "pdf-native" : "tesseract-cli"),
    excerpt
  };
}

const AI_PRIORITY_CONFIDENCE = 70;

function buildNamingDraftFromAiSuggestion(
  draft: NamingDraft,
  origins: NamingDraftOrigins,
  suggestion: RendererAiClassificationSuggestion
): { draft: NamingDraft; origins: NamingDraftOrigins; appliedFields: Array<keyof NamingDraft> } {
  const nextDraft: NamingDraft = { ...draft };
  const nextOrigins: NamingDraftOrigins = { ...origins };
  const appliedFields: Array<keyof NamingDraft> = [];
  const dateToken = normalizeAiDateForCurrentDraft(suggestion.dateToken);
  const subject = suggestion.subject?.trim() || suggestion.target?.trim() || "";
  const keywords = buildAiKeywords(suggestion);

  applyAiField("documentDate", dateToken);
  applyAiField("subject", subject);
  applyAiField("documentType", suggestion.documentType?.trim() ?? "");
  applyAiField("keywords", keywords);
  cleanCurrentAiArtifactField("subject");
  cleanCurrentAiArtifactField("documentType");
  cleanCurrentAiArtifactField("keywords");

  return {
    draft: nextDraft,
    origins: nextOrigins,
    appliedFields
  };

  function applyAiField(field: keyof NamingDraft, value: string): void {
    if (!shouldApplyAiValue(nextDraft[field], nextOrigins[field], value, suggestion.confidence)) {
      return;
    }

    nextDraft[field] = value;
    nextOrigins[field] = "ai-v2";
    appliedFields.push(field);
  }

  function cleanCurrentAiArtifactField(field: keyof NamingDraft): void {
    if (nextOrigins[field] === "manual") {
      return;
    }

    const cleaned = removeDocSorterArtifact(nextDraft[field]);
    if (cleaned === nextDraft[field]) {
      return;
    }

    nextDraft[field] = cleaned;
    nextOrigins[field] = "ai-v2";
    if (!appliedFields.includes(field)) {
      appliedFields.push(field);
    }
  }
}

function hasApplicableAiSuggestionField(
  draft: NamingDraft,
  origins: NamingDraftOrigins,
  suggestion: RendererAiClassificationSuggestion
): boolean {
  const dateToken = normalizeAiDateForCurrentDraft(suggestion.dateToken);
  const subject = suggestion.subject?.trim() || suggestion.target?.trim() || "";
  const keywords = buildAiKeywords(suggestion);
  return (
    shouldApplyAiValue(draft.documentDate, origins.documentDate, dateToken, suggestion.confidence) ||
    shouldApplyAiValue(draft.subject, origins.subject, subject, suggestion.confidence) ||
    shouldApplyAiValue(
      draft.documentType,
      origins.documentType,
      suggestion.documentType?.trim() ?? "",
      suggestion.confidence
    ) ||
    shouldApplyAiValue(draft.keywords, origins.keywords, keywords, suggestion.confidence)
  );
}

function shouldApplyAiValue(
  currentValue: string,
  currentOrigin: NamingFieldOrigin,
  nextValue: string,
  confidence: number
): boolean {
  const trimmedNext = nextValue.trim();
  if (!trimmedNext) {
    return false;
  }

  const trimmedCurrent = currentValue.trim();
  if (!trimmedCurrent) {
    return true;
  }

  return (
    confidence >= AI_PRIORITY_CONFIDENCE &&
    currentOrigin !== "manual" &&
    trimmedCurrent.toLowerCase() !== trimmedNext.toLowerCase()
  );
}

function canApplyAiSuggestionTargetFolder(targetFolder: string, confidence: number): boolean {
  const trimmedFolder = targetFolder.trim();
  if (!state.targetPath || !trimmedFolder) {
    return false;
  }

  const currentFolder = state.targetFolder.selectedFolder.trim();
  if (!currentFolder) {
    return true;
  }

  if (normalizeFolderForComparison(currentFolder) === normalizeFolderForComparison(trimmedFolder)) {
    return false;
  }

  if (state.targetFolder.origin === "manual") {
    return false;
  }

  if (state.targetFolder.origin === "ai-v2") {
    return true;
  }

  return confidence >= AI_PRIORITY_CONFIDENCE;
}

function normalizeFolderForComparison(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeAiDateForCurrentDraft(dateToken: string | undefined): string {
  const trimmed = dateToken?.trim() ?? "";
  return /^(19|20)\d{2}$/.test(trimmed) ||
    /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(trimmed)
    ? trimmed
    : "";
}

function buildAiKeywords(suggestion: RendererAiClassificationSuggestion): string {
  return uniqueAiStrings([
    suggestion.issuer?.trim() ?? "",
    suggestion.detail?.trim() ?? ""
  ]).join(" ");
}

function removeDocSorterArtifact(value: string): string {
  const tokens = normalizeAiBlock(value).split("-").filter(Boolean);
  if (!tokens.includes("docsorter")) {
    return value;
  }

  return tokens
    .filter((token) => token !== "docsorter" && token !== "local")
    .join("-");
}

function normalizeAiBlock(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueAiStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function createAiApplicationMessage(
  appliedFields: Array<keyof NamingDraft>,
  targetFolderApplied: boolean
): string {
  if (appliedFields.length === 0 && !targetFolderApplied) {
    return "Aucun champ modifiable à compléter depuis la suggestion IA.";
  }

  return "Suggestion IA appliquée. Les champs manuels n'ont pas été modifiés.";
}

function buildAiSelectionFromSuggestion(
  suggestion: RendererAiDocumentSuggestion,
  extension: SupportedDocumentExtension,
  targetRootPath: string | null
): AiSelectionState {
  const response = readAiMultiCandidateResponse(suggestion);
  const fields: AiSelectionFields = {
    dateToken: readAiSelectedField(response, suggestion, "dateToken"),
    subject: readAiSelectedField(response, suggestion, "subject"),
    target: readAiSelectedField(response, suggestion, "target"),
    documentType: readAiSelectedField(response, suggestion, "documentType"),
    issuer: readAiSelectedField(response, suggestion, "issuer"),
    detail: readAiSelectedField(response, suggestion, "detail")
  };
  const selectedFolder =
    suggestion.suggestion.targetFolder?.trim() ||
    selectBestAiCandidate(response?.folderCandidates ?? [])?.value.trim() ||
    "";

  return recalculateAiSelection({
    fields,
    manualFields: {},
    editingField: null,
    editingFolder: false,
    selectedFolder,
    previewFilename: "",
    previewFilenameValid: false,
    previewMessages: [],
    previewDestinationFolder: ""
  }, extension, targetRootPath);
}

function canResetAiSelectionChoices(): boolean {
  const activeDocument = getActiveDocument();
  if (
    !activeDocument ||
    !state.ai.selection ||
    !state.ai.suggestion ||
    state.ai.suggestionDocumentPath !== activeDocument.filePath
  ) {
    return false;
  }

  const initial = buildAiSelectionFromSuggestion(
    state.ai.suggestion,
    activeDocument.extension,
    state.targetPath
  );
  return !aiSelectionMatchesInitial(state.ai.selection, initial);
}

function resetAiSelectionChoices(): boolean {
  const activeDocument = getActiveDocument();
  if (
    !activeDocument ||
    !state.ai.suggestion ||
    state.ai.suggestionDocumentPath !== activeDocument.filePath ||
    !canResetAiSelectionChoices()
  ) {
    return false;
  }

  state.ai.selection = buildAiSelectionFromSuggestion(
    state.ai.suggestion,
    activeDocument.extension,
    state.targetPath
  );
  state.ai.message = "Choix IA réinitialisés. Prévisualisation recalculée.";
  clearFolderLearningAlignedNameOverride();
  recalculateFolderLearningComparison();
  syncAiSelectedFolderToTargetFolder(state.ai.selection.selectedFolder);
  render();
  return true;
}

function aiSelectionMatchesInitial(current: AiSelectionState, initial: AiSelectionState): boolean {
  return (
    current.editingField === null &&
    !current.editingFolder &&
    Object.keys(current.manualFields).length === 0 &&
    normalizeAiFolderForComparison(current.selectedFolder) === normalizeAiFolderForComparison(initial.selectedFolder) &&
    current.fields.dateToken === initial.fields.dateToken &&
    current.fields.subject === initial.fields.subject &&
    current.fields.target === initial.fields.target &&
    current.fields.documentType === initial.fields.documentType &&
    current.fields.issuer === initial.fields.issuer &&
    current.fields.detail === initial.fields.detail
  );
}

function normalizeAiFolderForComparison(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

function updateAiSelectionField(
  selection: AiSelectionState,
  field: AiSelectionFieldKey,
  value: string,
  source: AiSelectionFieldSource,
  extension: SupportedDocumentExtension,
  targetRootPath: string | null
): AiSelectionState {
  const nextManualFields: AiSelectionManualFields = { ...selection.manualFields };
  if (source === "manual") {
    nextManualFields[field] = true;
  } else {
    delete nextManualFields[field];
  }

  return recalculateAiSelection({
    ...selection,
    fields: {
      ...selection.fields,
      [field]: value
    },
    manualFields: nextManualFields
  }, extension, targetRootPath);
}

function recalculateAiSelection(
  selection: AiSelectionState,
  extension: SupportedDocumentExtension,
  targetRootPath: string | null
): AiSelectionState {
  const preview = buildAiSelectionPreview(selection.fields, extension);
  return {
    ...selection,
    previewFilename: preview.filename,
    previewFilenameValid: preview.isValid,
    previewMessages: preview.messages,
    previewDestinationFolder: formatAiPreviewDestinationFolder(targetRootPath, selection.selectedFolder)
  };
}

function buildAiSelectionPreview(
  fields: AiSelectionFields,
  extension: SupportedDocumentExtension
): { filename: string; isValid: boolean; messages: AiSelectionPreviewMessage[] } {
  const messages: AiSelectionPreviewMessage[] = [];
  const dateResult = normalizeAiPreviewDate(fields.dateToken);
  const target = normalizeAiPreviewBlock(fields.target);
  const documentType = normalizeAiPreviewBlock(fields.documentType);
  const issuer = normalizeOptionalAiPreviewBlock(fields.issuer);
  const detail = normalizeOptionalAiPreviewBlock(fields.detail);

  if (dateResult.warning) {
    messages.push({ level: "warning", message: dateResult.warning });
  }
  if (!dateResult.value) {
    messages.push({ level: "error", message: "Date IA obligatoire : AAAA, AAAA-MM ou AAAA-MM-JJ." });
  }
  if (!target) {
    messages.push({ level: "error", message: "Cible IA obligatoire pour générer le nom." });
  }
  if (!documentType) {
    messages.push({ level: "error", message: "Type IA obligatoire pour générer le nom." });
  }

  const optionalParts = removeRedundantAiNameParts({
    dateToken: dateResult.value,
    target,
    documentType,
    issuer,
    detail
  });
  if (issuer && !optionalParts.issuer) {
    messages.push({ level: "info", message: "Émetteur redondant ignoré dans le nom IA." });
  }
  if (detail && !optionalParts.detail) {
    messages.push({ level: "info", message: "Détail redondant ignoré dans le nom IA." });
  }

  const isValid = Boolean(dateResult.value && target && documentType);
  if (!isValid) {
    return {
      filename: "",
      isValid: false,
      messages
    };
  }

  const parts = [
    dateResult.value,
    target,
    documentType,
    optionalParts.issuer,
    optionalParts.detail
  ].filter(Boolean);
  const normalizedExtension = extension.toLowerCase();
  const filename = `${parts.join("_")}${normalizedExtension}`.slice(0, 180 + normalizedExtension.length);

  return {
    filename,
    isValid: true,
    messages
  };
}

function getAiNamingPreview(): {
  filename: string;
  filenameValid: boolean;
  destinationFolder: string;
  messages: AiSelectionPreviewMessage[];
  fields: AiSelectionFields;
  manualFields: AiSelectionManualFields;
} | null {
  const activeDocument = getActiveDocument();
  if (
    !activeDocument ||
    !state.ai.selection ||
    !state.ai.suggestion ||
    state.ai.suggestionDocumentPath !== activeDocument.filePath
  ) {
    return null;
  }

  if (state.ai.selection.previewDestinationFolder !== formatAiPreviewDestinationFolder(
    state.targetPath,
    state.ai.selection.selectedFolder
  )) {
    state.ai.selection = recalculateAiSelection(
      state.ai.selection,
      activeDocument.extension,
      state.targetPath
    );
  }

  return {
    filename: state.ai.selection.previewFilename,
    filenameValid: state.ai.selection.previewFilenameValid,
    destinationFolder: state.ai.selection.previewDestinationFolder,
    messages: state.ai.selection.previewMessages,
    fields: state.ai.selection.fields,
    manualFields: state.ai.selection.manualFields
  };
}

function readAiSelectedField(
  response: AiMultiCandidateResponseView | null,
  suggestion: RendererAiDocumentSuggestion,
  field: AiSelectionFieldKey
): string {
  void response;
  const value = suggestion.suggestion[field];
  return typeof value === "string" ? value.trim() : "";
}

function readAiMultiCandidateResponse(
  suggestion: RendererAiDocumentSuggestion | null
): AiMultiCandidateResponseView | null {
  const value = suggestion?.responseJson;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AiMultiCandidateResponseView
    : null;
}

function selectBestAiCandidate(candidates: AiCandidateView[]): AiCandidateView | null {
  return [...candidates].sort((left, right) =>
    right.score - left.score || left.value.localeCompare(right.value, "fr", { sensitivity: "base" })
  )[0] ?? null;
}

function normalizeAiPreviewDate(value: string): { value: string; warning: string } {
  const trimmed = value.trim();
  if (/^(19|20)\d{2}$/.test(trimmed)) {
    return { value: trimmed, warning: "" };
  }
  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return { value: trimmed, warning: "" };
  }
  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(trimmed)) {
    return { value: trimmed, warning: "" };
  }

  return { value: "", warning: "" };
}

function normalizeAiPreviewBlock(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeOptionalAiPreviewBlock(value: string): string {
  const normalized = normalizeAiPreviewBlock(value);
  return normalized === "aucun" ||
    normalized === "none" ||
    normalized === "neant" ||
    normalized === "n-a" ||
    normalized === "sans"
    ? ""
    : normalized;
}

function removeRedundantAiNameParts(input: {
  dateToken: string;
  target: string;
  documentType: string;
  issuer: string;
  detail: string;
}): { issuer: string; detail: string } {
  const blocked = new Set([input.target, input.documentType].filter(Boolean));
  const issuer = blocked.has(input.issuer) ? "" : input.issuer;
  if (issuer) {
    blocked.add(issuer);
  }

  return {
    issuer,
    detail: blocked.has(input.detail) || isAiDetailRedundantWithDate(input.detail, input.dateToken)
      ? ""
      : input.detail
  };
}

function isAiDetailRedundantWithDate(detail: string, dateToken: string): boolean {
  const tokens = detail.split("-").filter(Boolean);
  if (tokens.length === 0 || !dateToken) {
    return false;
  }

  const redundantTokens = buildAiDateRedundantTokens(dateToken);
  return redundantTokens.size > 0 && tokens.every((token) => redundantTokens.has(token));
}

function buildAiDateRedundantTokens(dateToken: string): Set<string> {
  const tokens = new Set<string>();
  const yearMatch = dateToken.match(/^((?:19|20)\d{2})$/);
  if (yearMatch) {
    tokens.add(yearMatch[1]);
    return tokens;
  }

  const match = dateToken.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12][0-9]|3[01]))?$/);
  if (!match) {
    return tokens;
  }

  const monthNames: Record<string, string[]> = {
    "01": ["janvier", "janv"],
    "02": ["fevrier", "fev"],
    "03": ["mars"],
    "04": ["avril", "avr"],
    "05": ["mai"],
    "06": ["juin"],
    "07": ["juillet", "juil"],
    "08": ["aout"],
    "09": ["septembre", "sept"],
    "10": ["octobre", "oct"],
    "11": ["novembre", "nov"],
    "12": ["decembre", "dec"]
  };

  tokens.add(match[1]);
  tokens.add(match[2]);
  tokens.add(String(Number(match[2])));
  tokens.add("periode");
  tokens.add("mois");
  tokens.add("mensuel");
  tokens.add("mensuelle");
  for (const monthName of monthNames[match[2]] ?? []) {
    tokens.add(monthName);
  }
  if (match[3]) {
    tokens.add(match[3]);
    tokens.add(String(Number(match[3])));
  }

  return tokens;
}

function formatAiPreviewDestinationFolder(targetRootPath: string | null, relativeFolder: string): string {
  void targetRootPath;
  const folder = relativeFolder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return folder || "Aucun dossier final";
}
