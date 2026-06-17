function renderSuggestionV2Panel(): void {
  suggestionV2Panel.render();
}

function refreshSuggestionV2ForActiveDocument(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  const requestId = ++suggestionV2RequestId;
  setSuggestionV2State(activeDocument.filePath, {
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
          status: "error",
          result: null,
          error: result.error as RendererSuggestionV2Error
        });
        renderSuggestionV2Panel();
        return;
      }

      setSuggestionV2State(activeDocument.filePath, {
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
