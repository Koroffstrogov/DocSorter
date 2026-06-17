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

function applySuggestionV2ToEmptyFields(): void {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !canApplySuggestionV2ToEmptyFields()) {
    return;
  }

  const suggestion = getSuggestionV2State(activeDocument.filePath).result;
  if (!suggestion) {
    return;
  }

  const draftApplication = buildNamingDraftFromSuggestionV2(state.naming.draft, suggestion, activeDocument.name);
  const targetFolder = getSuggestionV2RecommendedFolder(suggestion);
  const shouldApplyTargetFolder = canApplySuggestionV2TargetFolder(targetFolder);
  const messages: string[] = [];

  if (draftApplication.appliedFields.length > 0) {
    state.naming.draft = draftApplication.draft;
    state.naming.overrideFilename = null;
    state.naming.isLoading = true;
    resetClassificationState();
    resetDestinationCheck();
    messages.push("Champs v2 appliqués aux champs vides.");
  }

  if (shouldApplyTargetFolder) {
    messages.push("Dossier v2 appliqué au sous-dossier cible.");
  }

  if (messages.length === 0) {
    messages.push("Aucun champ vide à compléter depuis la proposition v2.");
  }

  setSuggestionV2ResultMessage(activeDocument.filePath, messages.join(" "));

  if (draftApplication.appliedFields.length > 0) {
    render();
    void updateNamingProposal(activeDocument.extension, ++namingRequestId);
  } else {
    render();
  }

  if (shouldApplyTargetFolder && targetFolder) {
    void updateTargetFolderFromInput(targetFolder);
  }
}

function canApplySuggestionV2ToEmptyFields(): boolean {
  const activeDocument = getActiveDocument();
  if (
    !activeDocument ||
    state.naming.isLoading ||
    isClassificationBusy()
  ) {
    return false;
  }

  const suggestion = getSuggestionV2State(activeDocument.filePath).result;
  if (!suggestion) {
    return false;
  }

  return (
    hasEmptyNamingFieldForSuggestionV2(state.naming.draft, suggestion, activeDocument.name) ||
    canApplySuggestionV2TargetFolder(getSuggestionV2RecommendedFolder(suggestion))
  );
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

function setSuggestionV2ResultMessage(filePath: string, message: string): void {
  const current = getSuggestionV2State(filePath);
  if (!current.result) {
    return;
  }

  setSuggestionV2State(filePath, {
    ...current,
    result: {
      ...current.result,
      message
    }
  });
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

function buildNamingDraftFromSuggestionV2(
  draft: NamingDraft,
  suggestion: RendererSuggestionV2DocumentSuggestion,
  sourceDocumentName = ""
): { draft: NamingDraft; appliedFields: Array<keyof NamingDraft> } {
  const nextDraft: NamingDraft = { ...draft };
  const appliedFields: Array<keyof NamingDraft> = [];
  const dateToken = normalizeSuggestionV2DateForCurrentDraft(suggestion.draft.dateToken);
  const target = suggestion.draft.target?.trim() ?? "";

  if (!nextDraft.documentDate.trim() && dateToken) {
    nextDraft.documentDate = dateToken;
    appliedFields.push("documentDate");
  }

  if (target && shouldApplySuggestionV2Subject(nextDraft.subject, target, sourceDocumentName)) {
    nextDraft.subject = target;
    appliedFields.push("subject");
  }

  if (!nextDraft.documentType.trim() && suggestion.draft.documentType?.trim()) {
    nextDraft.documentType = suggestion.draft.documentType.trim();
    appliedFields.push("documentType");
  }

  const keywords = uniqueStrings([
    suggestion.draft.issuer?.trim() ?? "",
    suggestion.draft.detail?.trim() ?? ""
  ]).join(" ");
  if (!nextDraft.keywords.trim() && keywords) {
    nextDraft.keywords = keywords;
    appliedFields.push("keywords");
  }

  return {
    draft: nextDraft,
    appliedFields
  };
}

function hasEmptyNamingFieldForSuggestionV2(
  draft: NamingDraft,
  suggestion: RendererSuggestionV2DocumentSuggestion,
  sourceDocumentName = ""
): boolean {
  const target = suggestion.draft.target?.trim() ?? "";
  return (
    (!draft.documentDate.trim() && Boolean(normalizeSuggestionV2DateForCurrentDraft(suggestion.draft.dateToken))) ||
    (Boolean(target) && shouldApplySuggestionV2Subject(draft.subject, target, sourceDocumentName)) ||
    (!draft.documentType.trim() && Boolean(suggestion.draft.documentType?.trim())) ||
    (!draft.keywords.trim() && Boolean(suggestion.draft.issuer?.trim() || suggestion.draft.detail?.trim()))
  );
}

function normalizeSuggestionV2DateForCurrentDraft(dateToken: string | undefined): string {
  const trimmed = dateToken?.trim() ?? "";
  return /^(19|20)\d{2}$/.test(trimmed) ||
    /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(trimmed)
    ? trimmed
    : "";
}

function getSuggestionV2RecommendedFolder(
  suggestion: RendererSuggestionV2DocumentSuggestion
): string {
  return (
    suggestion.folderPlacement?.relativePath ??
    suggestion.targetFolderSuggestion.recommended?.relativePath ??
    ""
  ).trim();
}

function canApplySuggestionV2TargetFolder(targetFolder: string): boolean {
  return Boolean(
    state.targetPath &&
      !state.targetFolder.selectedFolder.trim() &&
      targetFolder.trim()
  );
}

function shouldApplySuggestionV2Subject(
  currentSubject: string,
  target: string,
  sourceDocumentName: string
): boolean {
  const trimmedSubject = currentSubject.trim();
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return false;
  }
  if (!trimmedSubject) {
    return true;
  }
  if (normalizeSuggestionV2ComparisonValue(trimmedSubject) === normalizeSuggestionV2ComparisonValue(trimmedTarget)) {
    return false;
  }

  return isSuggestionV2FilenameDerivedSubject(trimmedSubject, sourceDocumentName);
}

function isSuggestionV2FilenameDerivedSubject(currentSubject: string, sourceDocumentName: string): boolean {
  const baseName = removeSuggestionV2Extension(sourceDocumentName);
  if (!baseName) {
    return false;
  }

  const candidates = uniqueStrings([
    baseName,
    baseName.replace(/^(?:19|20)\d{2}(?:-\d{2}){0,2}[-_\s]+/, ""),
    baseName.replace(/^t\d{2}[-_\s]+/i, "")
  ]).map(normalizeSuggestionV2ComparisonValue);
  const normalizedSubject = normalizeSuggestionV2ComparisonValue(currentSubject);

  return Boolean(normalizedSubject && candidates.includes(normalizedSubject));
}

function removeSuggestionV2Extension(fileName: string): string {
  return fileName.trim().replace(/\.[^.\\/]+$/, "");
}

function normalizeSuggestionV2ComparisonValue(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
