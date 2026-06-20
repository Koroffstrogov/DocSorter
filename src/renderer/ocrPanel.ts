interface OcrPanelOptions {
  root?: ParentNode;
  getState: () => OcrState;
  onDraftChange: (draft: OcrSettingsDraft) => void;
  onChooseTesseractExecutable: () => void;
  onChooseTessdataDirectory: () => void;
  onSaveSettings: () => void;
  onTestEngine: () => void;
  onRefreshStatus: () => void;
  isActionsDisabled: () => boolean;
  formatDate: (isoDate: string) => string;
}

interface OcrPanelApi {
  render: () => void;
}

interface OcrPanelElements {
  status: HTMLElement | null;
  form: HTMLFormElement | null;
  tesseractPathInput: HTMLInputElement | null;
  tessdataPathInput: HTMLInputElement | null;
  languageInput: HTMLInputElement | null;
  psmInput: HTMLInputElement | null;
  pdfQualitySelect: HTMLSelectElement | null;
  chooseTesseractButton: HTMLButtonElement | null;
  chooseTessdataButton: HTMLButtonElement | null;
  saveButton: HTMLButtonElement | null;
  testButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  futureButton: HTMLButtonElement | null;
}

interface OcrPanelFactoryApi {
  createOcrPanel: (options: OcrPanelOptions) => OcrPanelApi;
}

interface Window {
  DocSorterOcrPanel: OcrPanelFactoryApi;
}

var DocSorterOcrPanel: OcrPanelFactoryApi;

(() => {
  function createOcrPanel(options: OcrPanelOptions): OcrPanelApi {
    const elements = getOcrPanelElements(options.root ?? document);
    const inputs = [
      elements.tesseractPathInput,
      elements.tessdataPathInput,
      elements.languageInput,
      elements.psmInput,
      elements.pdfQualitySelect
    ];

    inputs.forEach((input) => {
      input?.addEventListener("input", () => {
        options.onDraftChange(readDraft(elements));
      });
    });

    elements.chooseTesseractButton?.addEventListener("click", () => {
      options.onChooseTesseractExecutable();
    });

    elements.chooseTessdataButton?.addEventListener("click", () => {
      options.onChooseTessdataDirectory();
    });

    elements.saveButton?.addEventListener("click", () => {
      options.onSaveSettings();
    });

    elements.testButton?.addEventListener("click", () => {
      options.onTestEngine();
    });

    elements.refreshButton?.addEventListener("click", () => {
      options.onRefreshStatus();
    });

    function render(): void {
      const state = options.getState();
      syncDraft(elements, state.draft);

      if (elements.status) {
        elements.status.replaceChildren(...createStatusContent(state, options));
      }

      const busy = state.panelStatus === "saving" || state.panelStatus === "testing";
      const disabled = options.isActionsDisabled() || busy;
      const canSave = !disabled && state.dirty && isDraftSavable(state.draft);
      const canTest = !disabled && !state.dirty && state.status?.status === "configured";

      if (elements.chooseTesseractButton) {
        elements.chooseTesseractButton.disabled = disabled;
      }

      if (elements.chooseTessdataButton) {
        elements.chooseTessdataButton.disabled = disabled;
      }

      if (elements.saveButton) {
        elements.saveButton.disabled = !canSave;
        elements.saveButton.textContent = state.panelStatus === "saving" ? "Sauvegarde..." : "Sauvegarder";
      }

      if (elements.testButton) {
        elements.testButton.disabled = !canTest;
        elements.testButton.textContent = state.panelStatus === "testing" ? "Test..." : "Tester Tesseract";
      }

      if (elements.refreshButton) {
        elements.refreshButton.disabled = disabled;
      }

      if (elements.futureButton) {
        elements.futureButton.disabled = true;
      }
    }

    return {
      render
    };
  }

  function getOcrPanelElements(root: ParentNode): OcrPanelElements {
    return {
      status: root.querySelector<HTMLElement>("#ocr-status"),
      form: root.querySelector<HTMLFormElement>("#ocr-settings-form"),
      tesseractPathInput: root.querySelector<HTMLInputElement>("#ocr-tesseract-path"),
      tessdataPathInput: root.querySelector<HTMLInputElement>("#ocr-tessdata-path"),
      languageInput: root.querySelector<HTMLInputElement>("#ocr-language"),
      psmInput: root.querySelector<HTMLInputElement>("#ocr-psm"),
      pdfQualitySelect: root.querySelector<HTMLSelectElement>("#ocr-pdf-quality"),
      chooseTesseractButton: root.querySelector<HTMLButtonElement>("#choose-tesseract"),
      chooseTessdataButton: root.querySelector<HTMLButtonElement>("#choose-tessdata"),
      saveButton: root.querySelector<HTMLButtonElement>("#save-ocr-settings"),
      testButton: root.querySelector<HTMLButtonElement>("#test-ocr-engine"),
      refreshButton: root.querySelector<HTMLButtonElement>("#refresh-ocr-status"),
      futureButton: root.querySelector<HTMLButtonElement>("#future-document-ocr")
    };
  }

  function readDraft(elements: OcrPanelElements): OcrSettingsDraft {
    return {
      tesseractPath: elements.tesseractPathInput?.value ?? "",
      tessdataPath: elements.tessdataPathInput?.value ?? "",
      language: elements.languageInput?.value ?? "fra",
      psm: elements.psmInput?.value ?? "3",
      pdfQuality: readPdfQuality(elements.pdfQualitySelect?.value)
    };
  }

  function syncDraft(elements: OcrPanelElements, draft: OcrSettingsDraft): void {
    syncInputValue(elements.tesseractPathInput, draft.tesseractPath);
    syncInputValue(elements.tessdataPathInput, draft.tessdataPath);
    syncInputValue(elements.languageInput, draft.language);
    syncInputValue(elements.psmInput, draft.psm);
    syncSelectValue(elements.pdfQualitySelect, draft.pdfQuality);
  }

  function syncInputValue(input: HTMLInputElement | null, value: string): void {
    if (input && input.value !== value) {
      input.value = value;
    }
  }

  function syncSelectValue(select: HTMLSelectElement | null, value: string): void {
    if (select && select.value !== value) {
      select.value = value;
    }
  }

  function createStatusContent(state: OcrState, options: OcrPanelOptions): Node[] {
    const lines: Node[] = [];
    const summary = document.createElement("strong");
    summary.textContent = statusLabel(state);
    lines.push(summary);

    const message = document.createElement("span");
    message.textContent = state.message;
    lines.push(message);

    if (state.status) {
      lines.push(createPathLine("Tesseract", state.status.tesseractPath || "Non configuré"));
      lines.push(createPathLine("Tessdata", state.status.tessdataPath || "Non configuré"));
      lines.push(createMetaLine(`Langue : ${state.status.language || "fra"}`));
      lines.push(createMetaLine(`PSM : ${state.status.psm}`));
      lines.push(createMetaLine(`Qualité PDF : ${pdfQualityLabel(state.status.settings.pdfQuality)}`));

      if (state.status.detectedVersion) {
        lines.push(createMetaLine(`Version : ${state.status.detectedVersion}`));
      }

      if (state.status.lastTestedAt) {
        lines.push(createMetaLine(`Dernier test : ${options.formatDate(state.status.lastTestedAt)}`));
      }

      if (state.status.availableLanguages.length > 0) {
        lines.push(
          createMetaLine(`Langues détectées : ${state.status.availableLanguages.join(", ")}`)
        );
      }
    }

    if (state.pdfStatus) {
      lines.push(createMetaLine(`OCR PDF : ${state.pdfStatus.message}`));
      if (state.pdfStatus.renderer.status !== "ready") {
        lines.push(createWarningLine(state.pdfStatus.renderer.message));
      }
    }

    if (state.dirty) {
      lines.push(createWarningLine("Configuration modifiée non sauvegardée."));
    }

    if (state.error) {
      lines.push(createWarningLine(state.error.message));
    }

    return lines;
  }

  function statusLabel(state: OcrState): string {
    if (state.panelStatus === "loading") {
      return "Chargement OCR local...";
    }

    if (state.panelStatus === "saving") {
      return "Sauvegarde OCR local...";
    }

    if (state.panelStatus === "testing") {
      return "Test Tesseract en cours...";
    }

    if (state.panelStatus === "error" || state.status?.status === "error") {
      return "OCR local en erreur";
    }

    if (state.status?.status === "configured") {
      return "OCR local configuré";
    }

    return "OCR local non configuré";
  }

  function createPathLine(label: string, value: string): HTMLElement {
    const line = document.createElement("span");
    line.textContent = `${label} : ${compactPath(value)}`;
    line.title = value;
    return line;
  }

  function createMetaLine(value: string): HTMLElement {
    const line = document.createElement("span");
    line.textContent = value;
    return line;
  }

  function createWarningLine(value: string): HTMLElement {
    const line = document.createElement("span");
    line.className = "ocr-warning";
    line.textContent = value;
    return line;
  }

  function compactPath(value: string): string {
    if (!value || value === "Non configuré") {
      return value;
    }

    return value.length > 58 ? `${value.slice(0, 24)}...${value.slice(-28)}` : value;
  }

  function isDraftSavable(draft: OcrSettingsDraft): boolean {
    const psm = Number(draft.psm);
    return (
      draft.tesseractPath.trim().length > 0 &&
      draft.tessdataPath.trim().length > 0 &&
      draft.language.trim().length > 0 &&
      isPdfQuality(draft.pdfQuality) &&
      Number.isInteger(psm) &&
      psm >= 0 &&
      psm <= 13
    );
  }

  function readPdfQuality(value: string | undefined): PdfOcrQuality {
    return isPdfQuality(value) ? value : "standard";
  }

  function isPdfQuality(value: unknown): value is PdfOcrQuality {
    return value === "fast" || value === "standard" || value === "high";
  }

  function pdfQualityLabel(value: PdfOcrQuality): string {
    switch (value) {
      case "fast":
        return "Rapide (200 DPI)";
      case "standard":
        return "Standard (300 DPI)";
      case "high":
        return "Haute qualité (400 DPI)";
    }
  }

  globalThis.DocSorterOcrPanel = {
    createOcrPanel
  };
})();
