async function refreshAiStatus(): Promise<void> {
  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "loading",
    message: "Chargement de la configuration IA locale...",
    error: null,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null
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
    suggestionDocumentPath: null
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
    suggestionDocumentPath: null
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
    suggestionDocumentPath: null
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

async function runAiSuggestionForActiveDocument(): Promise<void> {
  const activeDocument = getActiveDocument();
  const textContext = getActiveAiTextContext(activeDocument);
  if (!activeDocument) {
    applyAiError({
      code: "AI_DOCUMENT_NOT_SELECTED",
      message: "Aucun document sélectionné pour l'analyse IA."
    });
    return;
  }

  if (!textContext) {
    applyAiError({
      code: "AI_TEXT_NOT_AVAILABLE",
      message: "Texte extrait requis avant l'analyse IA locale."
    });
    return;
  }

  if (!canRunAiSuggestion()) {
    return;
  }

  const requestId = ++aiSuggestionRequestId;
  const message =
    state.ai.modelStatus?.status === "ready"
      ? "Analyse IA locale du document actif..."
      : "Chargement du modèle IA...";
  state.ai = {
    ...state.ai,
    panelStatus: "analyzing",
    message,
    error: null,
    modelStatus:
      state.ai.modelStatus?.status === "ready"
        ? state.ai.modelStatus
        : {
            status: "loading",
            model: state.ai.status?.settings.model ?? "",
            message: "Chargement du modèle IA...",
            loadedAt: null,
            keepAliveUntil: null,
            lastCheckedAt: null,
            error: null
          },
    suggestion: null,
    suggestionDocumentPath: null
  };
  renderAiPanel();

  const result = await window.docSorter.runAiSuggestionForActiveDocument(
    activeDocument.filePath,
    textContext
  );
  if (requestId !== aiSuggestionRequestId || state.activeDocumentPath !== activeDocument.filePath) {
    return;
  }

  if (!result.ok) {
    applyAiError(result.error as RendererAiError);
    void refreshAiModelStatus();
    return;
  }

  state.ai = {
    ...state.ai,
    panelStatus: "suggestion-ready",
    message: result.value.message,
    error: null,
    modelStatus: result.value.modelStatus as RendererAiModelStatus,
    suggestion: result.value as RendererAiDocumentSuggestion,
    suggestionDocumentPath: activeDocument.filePath
  };
  render();
}

function canRunAiSuggestion(): boolean {
  const activeDocument = getActiveDocument();
  return Boolean(
    activeDocument &&
      activeDocument.status !== "missing" &&
      state.ai.status?.settings.enabled &&
      state.ai.status.status === "ok" &&
      !state.ai.dirty &&
      !isAiBusy() &&
      getActiveAiTextContext(activeDocument)
  );
}

function canUnloadAiModel(): boolean {
  return Boolean(
    state.ai.status?.settings.enabled &&
      state.ai.modelStatus &&
      (state.ai.modelStatus.status === "ready" || state.ai.modelStatus.status === "error")
  );
}

function applyAiSuggestionToEmptyFields(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canApplyAiSuggestionToEmptyFields() || !state.ai.suggestion) {
    return;
  }

  const targetFolder = state.ai.suggestion.suggestion.targetFolder?.trim() ?? "";
  const result = buildNamingDraftFromAiSuggestionV2(
    state.naming.draft,
    state.naming.origins,
    state.ai.suggestion.suggestion
  );
  const shouldApplyTargetFolder = canApplyAiSuggestionTargetFolder(
    targetFolder,
    state.ai.suggestion.suggestion.confidence
  );

  state.ai = {
    ...state.ai,
    message: createAiApplicationMessage(result.appliedFields, shouldApplyTargetFolder)
  };

  if (result.appliedFields.length > 0) {
    state.naming.draft = result.draft;
    state.naming.origins = result.origins;
    state.naming.overrideFilename = null;
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
    suggestionDocumentPath: null
  };
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
    suggestionDocumentPath: null
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
    baseUrl: status.settings.baseUrl || "http://localhost:11434/",
    model: status.settings.model,
    timeoutMs: String(status.settings.timeoutMs || 30000)
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
    model: draft.model.trim(),
    timeoutMs,
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
    state.ai.panelStatus === "unloading" ||
    state.ai.panelStatus === "analyzing" ||
    isClassificationBusy()
  );
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

const AI_V2_PRIORITY_CONFIDENCE = 70;

function buildNamingDraftFromAiSuggestionV2(
  draft: NamingDraft,
  origins: NamingDraftOrigins,
  suggestion: RendererAiClassificationSuggestion
): { draft: NamingDraft; origins: NamingDraftOrigins; appliedFields: Array<keyof NamingDraft> } {
  const nextDraft: NamingDraft = { ...draft };
  const nextOrigins: NamingDraftOrigins = { ...origins };
  const appliedFields: Array<keyof NamingDraft> = [];
  const dateToken = normalizeAiV2DateForCurrentDraft(suggestion.dateToken);
  const subject = suggestion.subject?.trim() || suggestion.target?.trim() || "";
  const keywords = buildAiV2Keywords(suggestion);

  applyAiV2Field("documentDate", dateToken);
  applyAiV2Field("subject", subject);
  applyAiV2Field("documentType", suggestion.documentType?.trim() ?? "");
  applyAiV2Field("keywords", keywords);
  cleanCurrentAiArtifactField("subject");
  cleanCurrentAiArtifactField("documentType");
  cleanCurrentAiArtifactField("keywords");

  return {
    draft: nextDraft,
    origins: nextOrigins,
    appliedFields
  };

  function applyAiV2Field(field: keyof NamingDraft, value: string): void {
    if (!shouldApplyAiV2Value(nextDraft[field], nextOrigins[field], value, suggestion.confidence)) {
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
  const dateToken = normalizeAiV2DateForCurrentDraft(suggestion.dateToken);
  const subject = suggestion.subject?.trim() || suggestion.target?.trim() || "";
  const keywords = buildAiV2Keywords(suggestion);
  return (
    shouldApplyAiV2Value(draft.documentDate, origins.documentDate, dateToken, suggestion.confidence) ||
    shouldApplyAiV2Value(draft.subject, origins.subject, subject, suggestion.confidence) ||
    shouldApplyAiV2Value(
      draft.documentType,
      origins.documentType,
      suggestion.documentType?.trim() ?? "",
      suggestion.confidence
    ) ||
    shouldApplyAiV2Value(draft.keywords, origins.keywords, keywords, suggestion.confidence)
  );
}

function shouldApplyAiV2Value(
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
    confidence >= AI_V2_PRIORITY_CONFIDENCE &&
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

  return confidence >= AI_V2_PRIORITY_CONFIDENCE;
}

function normalizeFolderForComparison(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeAiV2DateForCurrentDraft(dateToken: string | undefined): string {
  const trimmed = dateToken?.trim() ?? "";
  return /^(19|20)\d{2}$/.test(trimmed) ||
    /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(trimmed)
    ? trimmed
    : "";
}

function buildAiV2Keywords(suggestion: RendererAiClassificationSuggestion): string {
  return uniqueAiV2Strings([
    suggestion.issuer?.trim() ?? "",
    suggestion.detail?.trim() ?? ""
  ]).join(" ");
}

function removeDocSorterArtifact(value: string): string {
  const tokens = normalizeAiV2Block(value).split("-").filter(Boolean);
  if (!tokens.includes("docsorter")) {
    return value;
  }

  return tokens
    .filter((token) => token !== "docsorter" && token !== "local")
    .join("-");
}

function normalizeAiV2Block(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueAiV2Strings(values: string[]): string[] {
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
