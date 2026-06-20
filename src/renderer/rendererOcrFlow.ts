async function refreshOcrStatus(): Promise<void> {
  const requestId = ++ocrRequestId;
  state.ocr = {
    ...state.ocr,
    panelStatus: "loading",
    message: "Chargement de la configuration OCR locale...",
    error: null
  };
  renderOcrPanel();

  const result = await window.docSorter.getOcrStatus();
  if (requestId !== ocrRequestId) {
    return;
  }

  if (!result.ok) {
    applyOcrError(result.error as RendererOcrError);
    return;
  }

  applyOcrStatus(result.value as RendererOcrStatus);
  await refreshPdfOcrStatus();
}

async function selectTesseractExecutableForOcr(): Promise<void> {
  if (isOcrBusy()) {
    return;
  }

  const result = await window.docSorter.selectTesseractExecutable();
  if (!result.ok) {
    applyOcrError(result.error as RendererOcrError);
    return;
  }

  if (!result.value) {
    return;
  }

  updateOcrDraft({
    ...state.ocr.draft,
    tesseractPath: result.value.path
  });
}

async function selectTessdataDirectoryForOcr(): Promise<void> {
  if (isOcrBusy()) {
    return;
  }

  const result = await window.docSorter.selectTessdataDirectory();
  if (!result.ok) {
    applyOcrError(result.error as RendererOcrError);
    return;
  }

  if (!result.value) {
    return;
  }

  updateOcrDraft({
    ...state.ocr.draft,
    tessdataPath: result.value.path
  });
}

async function saveOcrSettingsFromPanel(): Promise<void> {
  if (isOcrBusy()) {
    return;
  }

  const settings = ocrDraftToSettings(state.ocr.draft);
  if (!settings) {
    applyOcrError({
      code: "OCR_CONFIG_WRITE_FAILED",
      message: "Configuration OCR incomplète ou invalide."
    });
    return;
  }

  const requestId = ++ocrRequestId;
  state.ocr = {
    ...state.ocr,
    panelStatus: "saving",
    message: "Sauvegarde de la configuration OCR locale...",
    error: null
  };
  renderOcrPanel();

  const result = await window.docSorter.saveOcrSettings(settings);
  if (requestId !== ocrRequestId) {
    return;
  }

  if (!result.ok) {
    applyOcrError(result.error as RendererOcrError);
    return;
  }

  applyOcrStatus(result.value as RendererOcrStatus);
  await refreshPdfOcrStatus();
}

async function testOcrEngineFromPanel(): Promise<void> {
  if (isOcrBusy() || state.ocr.dirty) {
    return;
  }

  const requestId = ++ocrRequestId;
  state.ocr = {
    ...state.ocr,
    panelStatus: "testing",
    message: "Test local de Tesseract sans analyse de document...",
    error: null
  };
  renderOcrPanel();

  const result = await window.docSorter.testOcrEngine();
  if (requestId !== ocrRequestId) {
    return;
  }

  if (!result.ok) {
    applyOcrError(result.error as RendererOcrError);
    return;
  }

  applyOcrStatus(result.value as RendererOcrStatus);
  await refreshPdfOcrStatus();
}

function updateOcrDraft(draft: OcrSettingsDraft): void {
  state.ocr = {
    ...state.ocr,
    draft,
    dirty: true,
    panelStatus: "ready",
    message: "Configuration modifiée. Sauvegardez avant de tester Tesseract.",
    error: null
  };
  renderOcrPanel();
}

function renderOcrPanel(): void {
  ocrPanel.render();
}

function applyOcrStatus(status: RendererOcrStatus): void {
  state.ocr = {
    panelStatus: "ready",
    status,
    pdfStatus: state.ocr.pdfStatus,
    draft: ocrStatusToDraft(status),
    message: status.message,
    error: status.error,
    dirty: false
  };
  render();
}

function applyOcrError(error: RendererOcrError): void {
  state.ocr = {
    ...state.ocr,
    panelStatus: "error",
    message: error.message,
    error
  };
  render();
}

async function refreshPdfOcrStatus(): Promise<void> {
  const result = await window.docSorter.getPdfOcrStatus();
  if (!result.ok) {
    state.ocr = {
      ...state.ocr,
      pdfStatus: {
        status: "error",
        message: result.error.message,
        tesseract: {
          status: "error",
          path: "",
          message: result.error.message
        },
        renderer: {
          status: "error",
          path: "",
          message: result.error.message
        },
        error: result.error as RendererOcrError
      }
    };
    render();
    return;
  }

  state.ocr = {
    ...state.ocr,
    pdfStatus: result.value as RendererPdfOcrStatus
  };
  render();
}

function ocrStatusToDraft(status: RendererOcrStatus): OcrSettingsDraft {
  return {
    tesseractPath: status.settings.tesseractPath || status.tesseractPath,
    tessdataPath: status.settings.tessdataPath || status.tessdataPath,
    language: status.settings.language || "fra",
    psm: String(status.settings.psm || 3)
  };
}

function ocrDraftToSettings(draft: OcrSettingsDraft): RendererOcrSettings | null {
  const psm = Number(draft.psm);
  if (!Number.isInteger(psm) || psm < 0 || psm > 13) {
    return null;
  }

  return {
    tesseractPath: draft.tesseractPath.trim(),
    tessdataPath: draft.tessdataPath.trim(),
    language: draft.language.trim() || "fra",
    psm,
    lastTestedAt: state.ocr.status?.lastTestedAt ?? null,
    detectedVersion: state.ocr.status?.detectedVersion ?? null
  };
}

function isOcrBusy(): boolean {
  return (
    state.ocr.panelStatus === "loading" ||
    state.ocr.panelStatus === "saving" ||
    state.ocr.panelStatus === "testing" ||
    isClassificationBusy()
  );
}
