async function refreshAiStatus(): Promise<void> {
  const requestId = ++aiRequestId;
  state.ai = {
    ...state.ai,
    panelStatus: "loading",
    message: "Chargement de la configuration IA locale...",
    error: null,
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
}

function updateAiDraft(draft: AiSettingsDraft): void {
  state.ai = {
    ...state.ai,
    draft,
    dirty: true,
    panelStatus: "ready",
    message: "Configuration IA modifiée. Sauvegardez avant de tester Ollama.",
    error: null,
    suggestion: null,
    suggestionDocumentPath: null
  };
  renderAiPanel();
}

function renderAiPanel(): void {
  aiPanel.render();
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
  state.ai = {
    ...state.ai,
    panelStatus: "analyzing",
    message: "Analyse IA locale du document actif...",
    error: null,
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
    return;
  }

  state.ai = {
    ...state.ai,
    panelStatus: "suggestion-ready",
    message: result.value.message,
    error: null,
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

function applyAiSuggestionToEmptyFields(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canApplyAiSuggestionToEmptyFields() || !state.ai.suggestion) {
    return;
  }

  const targetFolder = state.ai.suggestion.suggestion.targetFolder?.trim() ?? "";
  const result = DocSorterNamingSuggestions.applySuggestionsToEmptyFields(
    state.naming.draft,
    aiSuggestionToNamingSuggestions(state.ai.suggestion.suggestion)
  );

  state.ai = {
    ...state.ai,
    message:
      result.appliedFields.length > 0 || hasEmptyTargetFolderForAiSuggestion(targetFolder)
        ? "Suggestion IA appliquée aux champs vides. Les champs déjà remplis n'ont pas été modifiés."
        : "Aucun champ vide à compléter depuis la suggestion IA."
  };

  if (result.appliedFields.length > 0) {
    state.naming.draft = result.draft;
    state.naming.overrideFilename = null;
    state.naming.isLoading = true;
    resetClassificationState();
    resetDestinationCheck();
    render();
    void updateNamingProposal(activeDocument.extension, ++namingRequestId);
  } else {
    render();
  }

  if (hasEmptyTargetFolderForAiSuggestion(targetFolder)) {
    void updateTargetFolderFromInput(targetFolder);
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
    hasEmptyFieldForAiSuggestion(state.naming.draft, state.ai.suggestion.suggestion) ||
      hasEmptyTargetFolderForAiSuggestion(state.ai.suggestion.suggestion.targetFolder ?? "")
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

function aiSuggestionToNamingSuggestions(
  suggestion: RendererAiClassificationSuggestion
): NamingSuggestions {
  const confidence = Math.max(0, Math.min(1, suggestion.confidence / 100));
  return {
    date: aiSuggestionField(suggestion.date, confidence, "Date proposée par l'IA locale."),
    subject: aiSuggestionField(suggestion.subject, confidence, "Sujet proposé par l'IA locale."),
    documentType: aiSuggestionField(
      suggestion.documentType,
      confidence,
      "Type proposé par l'IA locale."
    ),
    targetFolder: aiSuggestionField(
      suggestion.targetFolder,
      confidence,
      "Dossier proposé par l'IA locale."
    ),
    keywords: suggestion.keywords.map((keyword) => ({
      value: keyword,
      confidence,
      reason: "Mot-clé proposé par l'IA locale.",
      source: "text"
    })),
    confidence,
    reasons: suggestion.reasons
  };
}

function aiSuggestionField(
  value: string | undefined,
  confidence: number,
  reason: string
): SuggestedNamingField | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return {
    value: trimmed,
    confidence,
    reason,
    source: "text"
  };
}

function hasEmptyFieldForAiSuggestion(
  draft: NamingDraft,
  suggestion: RendererAiClassificationSuggestion
): boolean {
  return (
    (!draft.documentDate.trim() && Boolean(suggestion.date?.trim())) ||
    (!draft.subject.trim() && Boolean(suggestion.subject?.trim())) ||
    (!draft.documentType.trim() && Boolean(suggestion.documentType?.trim())) ||
    (!draft.keywords.trim() && suggestion.keywords.length > 0)
  );
}

function hasEmptyTargetFolderForAiSuggestion(targetFolder: string): boolean {
  return Boolean(state.targetPath && !state.targetFolder.selectedFolder.trim() && targetFolder.trim());
}
