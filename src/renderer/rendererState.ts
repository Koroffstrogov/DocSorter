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
    origins: createFallbackNamingDraftOrigins(),
    proposal: null,
    overrideFilename: null,
    isLoading: false
  };
}

function createFallbackNamingDraftOrigins(): NamingDraftOrigins {
  return {
    documentDate: "fallback",
    subject: "fallback",
    documentType: "fallback",
    keywords: "fallback"
  };
}

function createLegacyFilenameNamingDraftOrigins(): NamingDraftOrigins {
  return {
    documentDate: "legacy-filename",
    subject: "legacy-filename",
    documentType: "legacy-filename",
    keywords: "legacy-filename"
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
    message: "Classement à la racine cible",
    origin: "fallback"
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
