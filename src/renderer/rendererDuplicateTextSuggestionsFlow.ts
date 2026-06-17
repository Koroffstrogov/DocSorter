async function analyzeExactDuplicates(): Promise<void> {
  if (
    !state.sourcePath ||
    state.documents.length === 0 ||
    state.duplicates.status === "analyzing" ||
    isClassificationBusy()
  ) {
    return;
  }

  const requestId = ++duplicateAnalysisRequestId;
  state.duplicates = {
    ...createIdleDuplicateAnalysisState(),
    status: "analyzing"
  };
  state.queueMessage = "Analyse des doublons exacts...";
  render();

  const result = await window.docSorter.analyzeExactDuplicates();
  if (requestId !== duplicateAnalysisRequestId) {
    return;
  }

  if (!result.ok) {
    state.duplicates = {
      ...createIdleDuplicateAnalysisState(),
      status: "error",
      errorMessage: result.error.message
    };
    state.queueMessage = result.error.message;
    render();
    return;
  }

  const analysis = result.value as ExactDuplicateAnalysis;
  state.duplicates = {
    status: "ready",
    matches: analysis.matches,
    fileErrors: analysis.fileErrors,
    ignoredFilePaths: [],
    errorMessage: "",
    analyzedAt: analysis.analyzedAt
  };

  for (const fileError of analysis.fileErrors) {
    markDocumentUnavailable(fileError.filePath);
  }

  state.queueMessage = duplicateAnalysisSummary(analysis);
  render();
}

function ignoreActiveDuplicateForSession(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || state.duplicates.ignoredFilePaths.includes(activeDocument.filePath)) {
    return;
  }

  state.duplicates = {
    ...state.duplicates,
    ignoredFilePaths: [...state.duplicates.ignoredFilePaths, activeDocument.filePath]
  };
  render();
}

function renderDuplicatePanel(): void {
  duplicatePanel.render();
}

function getVisibleDuplicateMatchesForDocument(filePath: string): ExactDuplicateMatch[] {
  return duplicatePanel.getVisibleDuplicateMatchesForDocument(filePath);
}

function documentHasVisibleDuplicate(filePath: string): boolean {
  return duplicatePanel.hasVisibleDuplicate(filePath);
}

function documentQueueStatusLabel(documentItem: DocumentItem): string {
  if (documentItem.status === "missing") {
    return statusLabel(documentItem.status);
  }

  return documentHasVisibleDuplicate(documentItem.filePath)
    ? "Doublon exact"
    : textExtractionQueueLabel(documentItem) ?? statusLabel(documentItem.status);
}

function duplicateAnalysisSummary(analysis: ExactDuplicateAnalysis): string {
  const duplicateDocumentCount = countDuplicateSourceDocuments(analysis.matches);
  const parts = [
    duplicateDocumentCount > 0
      ? `Analyse terminée : ${duplicateDocumentCount} document${
          duplicateDocumentCount > 1 ? "s" : ""
        } en doublon exact.`
      : "Analyse terminée : aucun doublon exact détecté."
  ];

  if (analysis.fileErrors.length > 0) {
    parts.push(
      `${analysis.fileErrors.length} document${
        analysis.fileErrors.length > 1 ? "s" : ""
      } indisponible${analysis.fileErrors.length > 1 ? "s" : ""}.`
    );
  }

  if (analysis.ignoredHistoryCount > 0) {
    parts.push(
      `${analysis.ignoredHistoryCount} entrée${
        analysis.ignoredHistoryCount > 1 ? "s" : ""
      } d'historique ignorée${analysis.ignoredHistoryCount > 1 ? "s" : ""}.`
    );
  }

  return parts.join(" ");
}

function countDuplicateSourceDocuments(matches: ExactDuplicateMatch[]): number {
  const filePaths = new Set<string>();
  for (const match of matches) {
    if (match.type === "source-queue") {
      match.files.forEach((file) => filePaths.add(file.filePath));
    } else {
      filePaths.add(match.sourceFile.filePath);
    }
  }

  return filePaths.size;
}

async function extractTextFromActivePdf(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canExtractTextFromActivePdf(activeDocument)) {
    return;
  }

  const requestId = ++textExtractionRequestId;
  clearNamingSuggestionStateForDocument(activeDocument.filePath);
  setTextExtractionState(activeDocument.filePath, {
    status: "extracting",
    result: null,
    error: null
  });
  render();

  const result = await window.docSorter.extractTextFromActivePdf(activeDocument.filePath);
  if (requestId !== textExtractionRequestId) {
    return;
  }

  if (!result.ok) {
    if (result.error.code === "DOCUMENT_NOT_FOUND") {
      markDocumentUnavailable(activeDocument.filePath);
    }

    setTextExtractionState(activeDocument.filePath, {
      status: "error",
      result: null,
      error: result.error as PdfTextExtractionError
    });
    render();
    return;
  }

  const extraction = result.value as PdfTextExtraction;
  clearNamingSuggestionStateForDocument(activeDocument.filePath);
  setTextExtractionState(activeDocument.filePath, {
    status: extraction.status,
    result: extraction,
    error: null
  });
  render();
  refreshSuggestionV2ForActiveDocument();
}

async function runOcrForActiveImage(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canRunOcrForActiveImage(activeDocument)) {
    return;
  }

  const requestId = ++textExtractionRequestId;
  clearNamingSuggestionStateForDocument(activeDocument.filePath);
  resetAiSuggestionState();
  setTextExtractionState(activeDocument.filePath, {
    status: "extracting",
    result: null,
    error: null
  });
  render();

  const result = await window.docSorter.runOcrForActiveImage(activeDocument.filePath);
  if (requestId !== textExtractionRequestId) {
    return;
  }

  if (!result.ok) {
    if (result.error.code === "OCR_INPUT_NOT_FOUND") {
      markDocumentUnavailable(activeDocument.filePath);
    }

    setTextExtractionState(activeDocument.filePath, {
      status: "error",
      result: null,
      error: result.error as PdfTextExtractionError
    });
    render();
    return;
  }

  const extraction = result.value as PdfTextExtraction;
  clearNamingSuggestionStateForDocument(activeDocument.filePath);
  resetAiSuggestionState();
  setTextExtractionState(activeDocument.filePath, {
    status: extraction.status,
    result: extraction,
    error: null
  });
  render();
  refreshSuggestionV2ForActiveDocument();
}

function extractTextFromActiveDocument(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return Promise.resolve();
  }

  return activeDocument.extension === ".pdf" ? extractTextFromActivePdf() : runOcrForActiveImage();
}

function renderTextExtractionPanel(): void {
  textExtractionPanel.render();
}

function canExtractTextFromActivePdf(documentItem = getActiveDocument()): boolean {
  if (!documentItem) {
    return false;
  }

  return (
    documentItem.extension === ".pdf" &&
    documentItem.status !== "missing" &&
    getTextExtractionState(documentItem.filePath).status !== "extracting" &&
    !isClassificationBusy()
  );
}

function canRunOcrForActiveImage(documentItem = getActiveDocument()): boolean {
  if (!documentItem) {
    return false;
  }

  const ocrReady = Boolean(
    state.ocr.status?.status === "configured" &&
      state.ocr.status.detectedVersion &&
      !state.ocr.dirty
  );

  return (
    isImageDocument(documentItem) &&
    documentItem.status !== "missing" &&
    getTextExtractionState(documentItem.filePath).status !== "extracting" &&
    ocrReady &&
    !isClassificationBusy()
  );
}

function canExtractTextFromActiveDocument(documentItem = getActiveDocument()): boolean {
  return canExtractTextFromActivePdf(documentItem) || canRunOcrForActiveImage(documentItem);
}

function getTextExtractionState(filePath: string): TextExtractionDocumentState {
  return state.textExtraction.byDocumentPath[filePath] ?? createIdleTextExtractionDocumentState();
}

function setTextExtractionState(filePath: string, value: TextExtractionDocumentState): void {
  state.textExtraction = {
    byDocumentPath: {
      ...state.textExtraction.byDocumentPath,
      [filePath]: value
    }
  };
}

function updateExtractedTextForDocument(documentItem: DocumentItem, text: string): void {
  const extractionState = getTextExtractionState(documentItem.filePath);
  if (extractionState.status !== "text-found" || !extractionState.result) {
    return;
  }

  const editedText = text;
  setTextExtractionState(documentItem.filePath, {
    status: "text-found",
    result: {
      ...extractionState.result,
      text: editedText,
      excerpt: editedText,
      characterCount: editedText.length,
      excerptCharacterCount: editedText.length,
      truncated: false,
      fromCache: false,
      cachedSuggestions: null
    },
    error: null
  });

  clearNamingSuggestionStateForDocument(documentItem.filePath);
  clearSuggestionV2StateForDocument(documentItem.filePath);
  resetAiSuggestionState();
  renderNamingSuggestionsPanel();
  renderSuggestionV2Panel();
  renderAiPanel();
}

function textExtractionQueueLabel(documentItem: DocumentItem): string | null {
  return textExtractionPanel.getQueueLabel(documentItem);
}

function renderNamingSuggestionsPanel(): void {
  namingSuggestionsPanel.render();
}

function analyzeNamingSuggestionsForActiveDocument(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canAnalyzeNamingSuggestions(activeDocument)) {
    return;
  }

  const extraction = getTextExtractionState(activeDocument.filePath).result;
  if (!extraction) {
    return;
  }

  const suggestions =
    extraction.cachedSuggestions ??
    DocSorterNamingSuggestions.buildNamingSuggestions({
      filename: activeDocument.name,
      extractedText: extraction.excerpt,
      rulesCatalog: state.namingRules.mergedCatalog
    });
  const hasSuggestions = namingSuggestionsHaveContent(suggestions);

  setNamingSuggestionState(activeDocument.filePath, {
    status: hasSuggestions ? "ready" : "empty",
    suggestions: hasSuggestions ? suggestions : null,
    message: hasSuggestions
      ? extraction.fromCache && extraction.cachedSuggestions
        ? "Suggestions issues du cache local."
        : "Suggestions générées localement depuis le texte extrait et le nom de fichier."
      : "Aucune suggestion locale exploitable détectée."
  });
  render();
}

function applyNamingSuggestionsToEmptyFields(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canApplyNamingSuggestionsToEmptyFields()) {
    return;
  }

  const suggestionState = getNamingSuggestionState(activeDocument.filePath);
  if (!suggestionState.suggestions) {
    return;
  }

  const result = DocSorterNamingSuggestions.applySuggestionsToEmptyFields(
    state.naming.draft,
    suggestionState.suggestions
  );
  setNamingSuggestionState(activeDocument.filePath, {
    ...suggestionState,
    message:
      result.appliedFields.length > 0
        ? "Suggestions appliquées aux champs vides. Les champs déjà remplis n'ont pas été modifiés."
        : "Aucun champ vide à compléter."
  });

  if (result.appliedFields.length === 0) {
    render();
    return;
  }

  state.naming.draft = result.draft;
  state.naming.overrideFilename = null;
  state.naming.isLoading = true;
  resetClassificationState();
  resetDestinationCheck();
  render();
  void updateNamingProposal(activeDocument.extension, ++namingRequestId);
}

function applyTargetFolderSuggestion(): void {
  if (!canApplyTargetFolderSuggestion()) {
    return;
  }

  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  const targetFolder = getNamingSuggestionState(activeDocument.filePath).suggestions?.targetFolder?.value;
  if (!targetFolder) {
    return;
  }

  void updateTargetFolderFromInput(targetFolder);
}

function canAnalyzeNamingSuggestions(documentItem = getActiveDocument()): boolean {
  if (!documentItem) {
    return false;
  }

  const extractionState = getTextExtractionState(documentItem.filePath);
  return Boolean(
    (documentItem.extension === ".pdf" || isImageDocument(documentItem)) &&
      documentItem.status !== "missing" &&
      extractionState.status === "text-found" &&
      extractionState.result?.excerpt.trim() &&
      !isClassificationBusy()
  );
}

function isImageDocument(documentItem: DocumentItem): boolean {
  return (
    documentItem.extension === ".jpg" ||
    documentItem.extension === ".jpeg" ||
    documentItem.extension === ".png"
  );
}

function canApplyNamingSuggestionsToEmptyFields(): boolean {
  const activeDocument = getActiveDocument();
  if (!activeDocument || state.naming.isLoading || isClassificationBusy()) {
    return false;
  }

  const suggestions = getNamingSuggestionState(activeDocument.filePath).suggestions;
  return Boolean(suggestions && hasEmptyFieldForSuggestion(state.naming.draft, suggestions));
}

function canApplyTargetFolderSuggestion(): boolean {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !state.targetPath || isClassificationBusy()) {
    return false;
  }

  return Boolean(getNamingSuggestionState(activeDocument.filePath).suggestions?.targetFolder?.value);
}

function hasEmptyFieldForSuggestion(draft: NamingDraft, suggestions: NamingSuggestions): boolean {
  return (
    (!draft.documentDate.trim() && Boolean(suggestions.date?.value)) ||
    (!draft.subject.trim() && Boolean(suggestions.subject?.value)) ||
    (!draft.documentType.trim() && Boolean(suggestions.documentType?.value)) ||
    (!draft.keywords.trim() && suggestions.keywords.length > 0)
  );
}

function namingSuggestionsHaveContent(suggestions: NamingSuggestions): boolean {
  return Boolean(
    suggestions.date ||
      suggestions.subject ||
      suggestions.documentType ||
      suggestions.targetFolder ||
      suggestions.keywords.length > 0
  );
}

function getNamingSuggestionState(filePath: string): NamingSuggestionDocumentState {
  return state.namingSuggestions.byDocumentPath[filePath] ?? createIdleNamingSuggestionDocumentState();
}

function setNamingSuggestionState(filePath: string, value: NamingSuggestionDocumentState): void {
  state.namingSuggestions = {
    byDocumentPath: {
      ...state.namingSuggestions.byDocumentPath,
      [filePath]: value
    }
  };
}

function clearNamingSuggestionStateForDocument(filePath: string): void {
  if (!state.namingSuggestions.byDocumentPath[filePath]) {
    return;
  }

  const { [filePath]: _removed, ...remaining } = state.namingSuggestions.byDocumentPath;
  state.namingSuggestions = {
    byDocumentPath: remaining
  };
}

