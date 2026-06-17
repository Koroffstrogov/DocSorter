function renderSuggestionV2Panel(): void {
  suggestionV2Panel.render();
}

function refreshSuggestionV2ForActiveDocument(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  const requestId = ++suggestionV2RequestId;
  const previousState = getSuggestionV2State(activeDocument.filePath);
  setSuggestionV2State(activeDocument.filePath, {
    ...previousState,
    status: "loading",
    result: null,
    error: null
  });
  renderSuggestionV2Panel();

  void window.docSorter
    .buildSuggestionV2(
      activeDocument.filePath,
      getSuggestionV2TextContext(activeDocument),
      state.naming.draft
    )
    .then((result) => {
      if (requestId !== suggestionV2RequestId || state.activeDocumentPath !== activeDocument.filePath) {
        return;
      }

      if (!result.ok) {
        setSuggestionV2State(activeDocument.filePath, {
          ...getSuggestionV2State(activeDocument.filePath),
          status: "error",
          result: null,
          error: result.error as RendererSuggestionV2Error
        });
        renderSuggestionV2Panel();
        return;
      }

      setSuggestionV2State(activeDocument.filePath, {
        ...getSuggestionV2State(activeDocument.filePath),
        status: "ready",
        result: result.value as RendererSuggestionV2DocumentSuggestion,
        error: null
      });
      renderSuggestionV2Panel();
    })
    .catch(() => {
      if (requestId !== suggestionV2RequestId || state.activeDocumentPath !== activeDocument.filePath) {
        return;
      }

      setSuggestionV2State(activeDocument.filePath, {
        ...getSuggestionV2State(activeDocument.filePath),
        status: "error",
        result: null,
        error: {
          code: "SUGGESTION_V2_FAILED",
          message: "Suggestion v2 indisponible."
        }
      });
      renderSuggestionV2Panel();
    });
}

function runSuggestionV2AnalysisForActiveDocument(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  if (!getSuggestionV2TextContext(activeDocument)) {
    setSuggestionV2State(activeDocument.filePath, {
      ...getSuggestionV2State(activeDocument.filePath),
      status: "error",
      result: null,
      error: {
        code: "SUGGESTION_V2_TEXT_REQUIRED",
        message: activeDocument.extension === ".pdf"
          ? "Extrais le texte PDF avant l'analyse du document."
          : "Lance l'OCR image avant l'analyse du document."
      }
    });
    renderSuggestionV2Panel();
    return;
  }

  refreshSuggestionV2ForActiveDocument();
}

function runSuggestionV2DiagnosticForActiveDocument(includeAi = false): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }
  if (includeAi && !canRunAiSuggestion()) {
    return;
  }

  const requestId = ++suggestionV2RequestId;
  setSuggestionV2State(activeDocument.filePath, {
    ...getSuggestionV2State(activeDocument.filePath),
    diagnosticStatus: "running",
    diagnosticResult: null,
    diagnosticError: null
  });
  renderSuggestionV2Panel();

  void window.docSorter
    .runSuggestionV2Diagnostic(
      activeDocument.filePath,
      getSuggestionV2DiagnosticTextContext(activeDocument),
      state.naming.draft,
      includeAi
    )
    .then((result) => {
      if (requestId !== suggestionV2RequestId || state.activeDocumentPath !== activeDocument.filePath) {
        return;
      }

      if (!result.ok) {
        setSuggestionV2State(activeDocument.filePath, {
          ...getSuggestionV2State(activeDocument.filePath),
          diagnosticStatus: "error",
          diagnosticResult: null,
          diagnosticError: result.error as RendererSuggestionV2Error
        });
        renderSuggestionV2Panel();
        return;
      }

      setSuggestionV2State(activeDocument.filePath, {
        ...getSuggestionV2State(activeDocument.filePath),
        diagnosticStatus: "ready",
        diagnosticResult: result.value as RendererSuggestionV2DiagnosticResult,
        diagnosticError: null
      });
      renderSuggestionV2Panel();
    })
    .catch(() => {
      if (requestId !== suggestionV2RequestId || state.activeDocumentPath !== activeDocument.filePath) {
        return;
      }

      setSuggestionV2State(activeDocument.filePath, {
        ...getSuggestionV2State(activeDocument.filePath),
        diagnosticStatus: "error",
        diagnosticResult: null,
        diagnosticError: {
          code: "DIAGNOSTIC_WRITE_FAILED",
          message: "Diagnostic indisponible."
        }
      });
      renderSuggestionV2Panel();
    });
}

function getSuggestionV2State(filePath: string): SuggestionV2DocumentState {
  return state.suggestionV2.byDocumentPath[filePath] ?? createIdleSuggestionV2DocumentState();
}

function setSuggestionV2State(filePath: string, value: SuggestionV2DocumentState): void {
  state.suggestionV2 = {
    byDocumentPath: {
      ...state.suggestionV2.byDocumentPath,
      [filePath]: value
    }
  };
}

function resetSuggestionV2State(): void {
  suggestionV2RequestId += 1;
  state.suggestionV2 = createIdleSuggestionV2State();
}

function clearSuggestionV2StateForDocument(filePath: string): void {
  suggestionV2RequestId += 1;
  if (!state.suggestionV2.byDocumentPath[filePath]) {
    return;
  }

  const { [filePath]: _removed, ...remaining } = state.suggestionV2.byDocumentPath;
  state.suggestionV2 = {
    byDocumentPath: remaining
  };
}

function getSuggestionV2TextContext(
  documentItem: DocumentItem
): RendererSuggestionV2TextContext | null {
  const extraction = getTextExtractionState(documentItem.filePath).result;
  const excerpt = (extraction?.text ?? extraction?.excerpt ?? "").trim().slice(0, 6_000);
  if (!extraction || extraction.status !== "text-found" || !excerpt) {
    return null;
  }

  return {
    source:
      extraction.source === "tesseract-cli" || isImageDocument(documentItem)
        ? "tesseract-cli"
        : "pdf-native",
    excerpt
  };
}

function getSuggestionV2DiagnosticTextContext(
  documentItem: DocumentItem
): RendererSuggestionV2TextContext | null {
  const extraction = getTextExtractionState(documentItem.filePath).result;
  const text = (extraction?.text ?? extraction?.excerpt ?? "").trim();
  if (!extraction || extraction.status !== "text-found" || !text) {
    return null;
  }

  return {
    source:
      extraction.source === "tesseract-cli" || isImageDocument(documentItem)
        ? "tesseract-cli"
        : "pdf-native",
    excerpt: text
  };
}
