interface TextExtractionPanelState {
  activeDocument: DocumentItem | null;
  textExtraction: TextExtractionState;
}

interface TextExtractionPanelOptions {
  root?: ParentNode;
  getState: () => TextExtractionPanelState;
  canExtract: (documentItem?: DocumentItem | null) => boolean;
  onExtract: () => void;
  onTextChange: (documentItem: DocumentItem, text: string) => void;
  formatDate: (value: string) => string;
}

interface TextExtractionPanelApi {
  render: () => void;
  getQueueLabel: (documentItem: DocumentItem) => string | null;
}

interface TextExtractionPanelElements {
  panel: HTMLElement | null;
  extractButton: HTMLButtonElement | null;
  details: HTMLElement | null;
}

interface TextExtractionPanelFactoryApi {
  createTextExtractionPanel: (options: TextExtractionPanelOptions) => TextExtractionPanelApi;
}

interface Window {
  DocSorterTextExtractionPanel: TextExtractionPanelFactoryApi;
}

var DocSorterTextExtractionPanel: TextExtractionPanelFactoryApi;

(() => {
  function createTextExtractionPanel(options: TextExtractionPanelOptions): TextExtractionPanelApi {
    const elements = getTextExtractionPanelElements(options.root ?? document);

    elements.extractButton?.addEventListener("click", () => {
      options.onExtract();
    });

    function render(): void {
      if (!elements.panel || !elements.details) {
        return;
      }

      const activeDocument = options.getState().activeDocument;
      if (!activeDocument || !supportsTextExtractionPanel(activeDocument)) {
        elements.panel.hidden = true;
        elements.details.replaceChildren();
        return;
      }

      const extractionState = getTextExtractionState(activeDocument.filePath);
      elements.panel.hidden = false;

      if (elements.extractButton) {
        elements.extractButton.disabled = !options.canExtract(activeDocument);
        elements.extractButton.textContent =
          activeDocument.extension === ".pdf"
            ? "Extraire le texte PDF"
            : "Lancer OCR sur cette image";
      }

      if (extractionState.status === "idle") {
        elements.details.replaceChildren(
          activeDocument.extension === ".pdf" ? "Texte non analysé" : "OCR non lancé"
        );
        return;
      }

      if (extractionState.status === "extracting") {
        elements.details.replaceChildren(
          activeDocument.extension === ".pdf" ? "Extraction du texte..." : "OCR en cours..."
        );
        return;
      }

      if (extractionState.status === "error") {
        elements.details.replaceChildren(
          extractionState.error?.message ?? "Extraction du texte PDF impossible."
        );
        return;
      }

      if (!extractionState.result || extractionState.status === "empty") {
        elements.details.replaceChildren(
          createTextExtractionMeta(extractionState.result),
          ...createTextExtractionLimitNoticeNodes(extractionState.result),
          ...createTextExtractionWarningNodes(extractionState.result),
          activeDocument.extension === ".pdf"
            ? "Aucun texte exploitable détecté — OCR nécessaire plus tard."
            : "Aucun texte exploitable détecté."
        );
        return;
      }

      elements.details.replaceChildren(
        createTextExtractionMeta(extractionState.result),
        ...createTextExtractionLimitNoticeNodes(extractionState.result),
        ...createTextExtractionWarningNodes(extractionState.result),
        createTextExtractionEditor(activeDocument, extractionState.result, options)
      );
    }

    function getQueueLabel(documentItem: DocumentItem): string | null {
      if (!supportsTextExtractionPanel(documentItem)) {
        return null;
      }

      const extractionState = getTextExtractionState(documentItem.filePath);
      switch (extractionState.status) {
        case "text-found":
          return documentItem.extension === ".pdf" ? "Texte extrait" : "Texte OCR";
        case "empty":
          return documentItem.extension === ".pdf" ? "PDF sans texte" : "OCR sans texte";
        case "extracting":
          return documentItem.extension === ".pdf" ? "Extraction texte" : "OCR en cours";
        case "error":
          return documentItem.extension === ".pdf" ? "Texte indisponible" : "OCR indisponible";
        case "idle":
          return null;
      }
    }

    function getTextExtractionState(filePath: string): TextExtractionDocumentState {
      return (
        options.getState().textExtraction.byDocumentPath[filePath] ??
        createEmptyTextExtractionDocumentState()
      );
    }

    function createTextExtractionMeta(extraction: PdfTextExtraction | null): HTMLDivElement {
      const meta = document.createElement("div");
      meta.className = "text-extraction-meta";

      if (!extraction) {
        return meta;
      }

      const characters = document.createElement("span");
      const extractedAt = document.createElement("span");
      const cacheStatus = document.createElement("span");

      if (extraction.source === "tesseract-cli") {
        const engine = document.createElement("span");
        const language = document.createElement("span");
        const duration = document.createElement("span");
        engine.textContent = "OCR Tesseract";
        language.textContent = `${extraction.language ?? "fra"} / PSM ${extraction.psm ?? 6}`;
        duration.textContent =
          typeof extraction.durationMs === "number" ? `${extraction.durationMs} ms` : "durée OCR";
        meta.append(engine, language, duration);
      } else {
        const pages = document.createElement("span");
        const pageCount = extraction.pageCount ?? 1;
        const pagesAnalyzed = extraction.pagesAnalyzed ?? pageCount;
        pages.textContent = `${pagesAnalyzed} / ${pageCount} page${pageCount > 1 ? "s" : ""}`;
        meta.append(pages);
      }

      characters.textContent = `${extraction.characterCount} caractère${
        extraction.characterCount > 1 ? "s" : ""
      }`;
      extractedAt.textContent = options.formatDate(extraction.extractedAt);
      cacheStatus.textContent = extraction.fromCache ? "issu du cache" : "analyse locale";
      meta.append(characters, extractedAt, cacheStatus);

      const qualityStatus = createPdfTextQualityStatusNode(extraction);
      if (qualityStatus) {
        meta.append(qualityStatus);
      }

      return meta;
    }

    return {
      render,
      getQueueLabel
    };
  }

  function getTextExtractionPanelElements(root: ParentNode): TextExtractionPanelElements {
    return {
      panel: root.querySelector<HTMLElement>("#text-extraction-panel"),
      extractButton: root.querySelector<HTMLButtonElement>("#extract-pdf-text"),
      details: root.querySelector<HTMLElement>("#text-extraction-details")
    };
  }

  function createTextExtractionEditor(
    documentItem: DocumentItem,
    extraction: PdfTextExtraction,
    options: TextExtractionPanelOptions
  ): HTMLDivElement {
    const container = document.createElement("div");
    const heading = document.createElement("strong");
    const helper = document.createElement("p");
    const excerpt = document.createElement("textarea");

    heading.textContent = extraction.truncated ? "Extrait limité modifiable" : "Texte exploitable modifiable";
    helper.className = "text-extraction-help";
    helper.textContent =
      "Les corrections restent en mémoire pour ce document et seront utilisées par les prochaines analyses.";
    excerpt.className = "text-extraction-excerpt";
    excerpt.value = extraction.text ?? extraction.excerpt;
    excerpt.spellcheck = false;
    excerpt.setAttribute("aria-label", "Texte extrait modifiable");
    excerpt.addEventListener("input", () => {
      options.onTextChange(documentItem, excerpt.value);
    });
    container.append(heading, helper, excerpt);

    return container;
  }

  function createTextExtractionLimitNoticeNodes(extraction: PdfTextExtraction | null): HTMLElement[] {
    if (
      !extraction ||
      extraction.source === "tesseract-cli" ||
      typeof extraction.pagesAnalyzed !== "number" ||
      typeof extraction.pageCount !== "number" ||
      extraction.pagesAnalyzed >= extraction.pageCount
    ) {
      return [];
    }

    const notice = document.createElement("p");
    notice.className = "text-extraction-limit";
    notice.textContent = `Analyse limitée aux ${extraction.pagesAnalyzed} premières pages.`;
    return [notice];
  }

  function createTextExtractionWarningNodes(extraction: PdfTextExtraction | null): HTMLElement[] {
    const warnings = [
      ...(extraction?.warnings ?? []),
      ...createPdfTextQualityWarnings(extraction)
    ];
    if (warnings.length === 0) {
      return [];
    }

    return uniqueStrings(warnings).map((warningText) => {
      const warning = document.createElement("p");
      warning.className = "text-extraction-limit";
      warning.textContent = warningText;
      return warning;
    });
  }

  function createPdfTextQualityStatusNode(extraction: PdfTextExtraction): HTMLSpanElement | null {
    const quality = extraction.pdfTextQuality;
    if (!quality || extraction.source === "tesseract-cli") {
      return null;
    }

    const status = document.createElement("span");
    const affectedPageCount = quality.pages.filter((page) =>
      page.status === "text-empty" ||
      page.status === "text-weak" ||
      page.status === "unknown"
    ).length;
    const suffix = affectedPageCount > 0
      ? ` (${affectedPageCount} page${affectedPageCount > 1 ? "s" : ""} concernée${affectedPageCount > 1 ? "s" : ""})`
      : "";
    status.textContent = `${pdfTextQualityLabel(quality.decision)}${suffix}`;
    return status;
  }

  function pdfTextQualityLabel(decision: PdfTextQualityDecision): string {
    switch (decision) {
      case "native-ok":
        return "Texte PDF : natif exploitable";
      case "ocr-recommended":
        return "Texte PDF : OCR recommandé";
      case "hybrid-ocr-recommended":
        return "Texte PDF : PDF hybride, OCR recommandé sur certaines pages";
      case "unknown":
        return "Texte PDF : qualité indéterminée";
    }
  }

  function createPdfTextQualityWarnings(extraction: PdfTextExtraction | null): string[] {
    const decision = extraction?.pdfTextQuality?.decision;
    if (decision === "ocr-recommended" || decision === "hybrid-ocr-recommended") {
      return ["Le texte extrait semble incomplet. L'analyse IA peut être moins fiable."];
    }

    return [];
  }

  function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }

  function createEmptyTextExtractionDocumentState(): TextExtractionDocumentState {
    return {
      status: "idle",
      result: null,
      error: null
    };
  }

  function supportsTextExtractionPanel(documentItem: DocumentItem): boolean {
    return (
      documentItem.extension === ".pdf" ||
      documentItem.extension === ".jpg" ||
      documentItem.extension === ".jpeg" ||
      documentItem.extension === ".png"
    );
  }

  DocSorterTextExtractionPanel = {
    createTextExtractionPanel
  };
  globalThis.DocSorterTextExtractionPanel = DocSorterTextExtractionPanel;
})();
