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
  resetNamingSuggestionsState();
}

function resetNamingSuggestionsState(): void {
  state.namingSuggestions = createIdleNamingSuggestionsState();
}

