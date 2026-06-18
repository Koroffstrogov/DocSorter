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
  setTextExtractionState(activeDocument.filePath, {
    status: extraction.status,
    result: extraction,
    error: null
  });
  render();
}

async function runOcrForActiveImage(): Promise<void> {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canRunOcrForActiveImage(activeDocument)) {
    return;
  }

  const requestId = ++textExtractionRequestId;
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
  resetAiSuggestionState();
  setTextExtractionState(activeDocument.filePath, {
    status: extraction.status,
    result: extraction,
    error: null
  });
  render();
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
      fromCache: false
    },
    error: null
  });

  resetAiSuggestionState();
  renderAiPanel();
}

function textExtractionQueueLabel(documentItem: DocumentItem): string | null {
  return textExtractionPanel.getQueueLabel(documentItem);
}

function isImageDocument(documentItem: DocumentItem): boolean {
  return (
    documentItem.extension === ".jpg" ||
    documentItem.extension === ".jpeg" ||
    documentItem.extension === ".png"
  );
}

