function createIdleQueueViewState(): QueueUiState {
  return {
    query: "",
    filter: "all",
    sortKey: "name",
    sortDirection: "asc"
  };
}

function createIdlePreviewState(): PreviewState {
  return {
    status: "idle",
    data: null,
    errorMessage: "",
    zoom: 1,
    rotation: 0,
    pdfPage: 1,
    pdfPageCount: 1,
    pdfFitZoom: 1
  };
}

function createIdleNamingState(): NamingState {
  return {
    draft: {
      documentDate: "",
      subject: "",
      documentType: "",
      keywords: ""
    },
    proposal: null,
    overrideFilename: null,
    isLoading: false
  };
}

function createIdleDestinationCheckState(): DestinationCheckState {
  return {
    status: "idle",
    result: null,
    error: null,
    checkedFilename: ""
  };
}

function createIdleTargetFolderState(): TargetFolderState {
  return {
    selectedFolder: "",
    folders: [],
    status: "idle",
    message: "Classement à la racine cible"
  };
}

function createIdleClassificationState(): ClassificationState {
  return {
    status: "idle",
    plan: null,
    error: null,
    journalWarning: null
  };
}

function createIdleHistoryState(): HistoryState {
  return {
    entries: [],
    isLoading: false,
    errorMessage: ""
  };
}

function createIdleDuplicateAnalysisState(): DuplicateAnalysisState {
  return {
    status: "idle",
    matches: [],
    fileErrors: [],
    ignoredFilePaths: [],
    errorMessage: "",
    analyzedAt: ""
  };
}

function createIdleTextExtractionState(): TextExtractionState {
  return {
    byDocumentPath: {}
  };
}

function createIdleNamingRulesState(): NamingRulesState {
  const defaultCatalog =
    globalThis.DocSorterNamingSuggestionRulesCatalog?.getDefaultNamingSuggestionRulesCatalog() ??
    createEmptyRulesCatalog();

  return {
    panelStatus: "loading",
    panelOpen: false,
    userRulesPath: "",
    userCatalog: createEmptyRulesCatalog(),
    mergedCatalog: defaultCatalog,
    defaultRuleCount: countRules(defaultCatalog),
    userRuleCount: 0,
    message: "Chargement des règles...",
    warning: null,
    draft: DocSorterUserRuleEditor.createEmptyUserRuleDraft(),
    editingTarget: null,
    draftErrors: [],
    dirty: false
  };
}

function createIdleNamingSuggestionsState(): NamingSuggestionsState {
  return {
    byDocumentPath: {}
  };
}

function createIdleSuggestionV2State(): SuggestionV2State {
  return {
    byDocumentPath: {}
  };
}

function createIdleSuggestionV2DocumentState(): SuggestionV2DocumentState {
  return {
    status: "idle",
    result: null,
    error: null,
    diagnosticStatus: "idle",
    diagnosticResult: null,
    diagnosticError: null
  };
}

function createIdleOcrState(): OcrState {
  return {
    panelStatus: "loading",
    status: null,
    draft: {
      tesseractPath: "",
      tessdataPath: "",
      language: "fra",
      psm: "3"
    },
    message: "Chargement de la configuration OCR locale...",
    error: null,
    dirty: false
  };
}

function createIdleAiState(): AiState {
  return {
    panelStatus: "loading",
    status: null,
    draft: {
      enabled: false,
      baseUrl: "http://localhost:11434/",
      model: "",
      timeoutMs: "30000"
    },
    message: "Chargement de la configuration IA locale...",
    error: null,
    dirty: false,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null
  };
}

function createIdleTextExtractionDocumentState(): TextExtractionDocumentState {
  return {
    status: "idle",
    result: null,
    error: null
  };
}

function createIdleNamingSuggestionDocumentState(): NamingSuggestionDocumentState {
  return {
    status: "idle",
    suggestions: null,
    message: ""
  };
}

function cloneRulesCatalog(catalog: NamingSuggestionRulesCatalog): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: catalog.documentTypeRules.map((rule) => ({
      ...rule,
      match: cloneRuleMatch(rule.match),
      output: {
        ...(rule.output.documentType ? { documentType: rule.output.documentType } : {}),
        ...(rule.output.subject ? { subject: rule.output.subject } : {}),
        ...(rule.output.keywords ? { keywords: [...rule.output.keywords] } : {}),
        ...(rule.output.targetFolder ? { targetFolder: rule.output.targetFolder } : {})
      }
    })),
    subjectRules: catalog.subjectRules.map((rule) => ({
      ...rule,
      match: cloneRuleMatch(rule.match),
      output: {
        ...(rule.output.documentType ? { documentType: rule.output.documentType } : {}),
        ...(rule.output.subject ? { subject: rule.output.subject } : {}),
        ...(rule.output.keywords ? { keywords: [...rule.output.keywords] } : {}),
        ...(rule.output.targetFolder ? { targetFolder: rule.output.targetFolder } : {})
      }
    })),
    keywordRules: catalog.keywordRules.map((rule) => ({
      ...rule,
      aliases: [...rule.aliases],
      ...(rule.match ? { match: cloneRuleMatch(rule.match) } : {})
    })),
    stopWords: [...catalog.stopWords]
  };
}

function cloneRuleMatch(match: SuggestionRuleMatch): SuggestionRuleMatch {
  return {
    ...(match.allOf ? { allOf: [...match.allOf] } : {}),
    ...(match.anyOf ? { anyOf: [...match.anyOf] } : {}),
    ...(match.noneOf ? { noneOf: [...match.noneOf] } : {})
  };
}

function countRules(catalog: NamingSuggestionRulesCatalog): number {
  return catalog.documentTypeRules.length + catalog.subjectRules.length + catalog.keywordRules.length;
}

function createEmptyRulesCatalog(): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: []
  };
}
