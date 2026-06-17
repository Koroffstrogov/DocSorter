function resetNamingState(): void {
  namingRequestId += 1;
  state.naming = createIdleNamingState();
  resetDestinationCheck();
  resetClassificationState();
}

function resetClassificationState(): void {
  classificationRequestId += 1;
  state.classification = createIdleClassificationState();
}

function resetDuplicateAnalysisState(): void {
  duplicateAnalysisRequestId += 1;
  state.duplicates = createIdleDuplicateAnalysisState();
}

function resetTextExtractionState(): void {
  textExtractionRequestId += 1;
  state.textExtraction = createIdleTextExtractionState();
  resetSuggestionV2State();
  resetAiSuggestionState();
}

function resetAiSuggestionState(): void {
  aiSuggestionRequestId += 1;
  state.ai = {
    ...state.ai,
    panelStatus:
      state.ai.panelStatus === "analyzing" || state.ai.panelStatus === "suggestion-ready"
        ? "ready"
        : state.ai.panelStatus,
    suggestion: null,
    suggestionDocumentPath: null
  };
}

