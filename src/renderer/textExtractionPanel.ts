interface TextExtractionPanelState {
  activeDocument: DocumentItem | null;
  textExtraction: TextExtractionState;
}

interface TextExtractionPanelOptions {
  root?: ParentNode;
  getState: () => TextExtractionPanelState;
  canExtract: (documentItem?: DocumentItem | null) => boolean;
  onExtract: () => void;
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
      if (!activeDocument || activeDocument.extension !== ".pdf") {
        elements.panel.hidden = true;
        elements.details.replaceChildren();
        return;
      }

      const extractionState = getTextExtractionState(activeDocument.filePath);
      elements.panel.hidden = false;

      if (elements.extractButton) {
        elements.extractButton.disabled = !options.canExtract(activeDocument);
      }

      if (extractionState.status === "idle") {
        elements.details.replaceChildren("Texte non analysé");
        return;
      }

      if (extractionState.status === "extracting") {
        elements.details.replaceChildren("Extraction du texte...");
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
          "Aucun texte exploitable détecté — OCR nécessaire plus tard."
        );
        return;
      }

      elements.details.replaceChildren(
        createTextExtractionMeta(extractionState.result),
        ...createTextExtractionLimitNoticeNodes(extractionState.result),
        createTextExtractionExcerpt(extractionState.result)
      );
    }

    function getQueueLabel(documentItem: DocumentItem): string | null {
      if (documentItem.extension !== ".pdf") {
        return null;
      }

      const extractionState = getTextExtractionState(documentItem.filePath);
      switch (extractionState.status) {
        case "text-found":
          return "Texte extrait";
        case "empty":
          return "PDF sans texte";
        case "extracting":
          return "Extraction texte";
        case "error":
          return "Texte indisponible";
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

      const pages = document.createElement("span");
      const characters = document.createElement("span");
      const extractedAt = document.createElement("span");
      const cacheStatus = document.createElement("span");

      pages.textContent = `${extraction.pagesAnalyzed} / ${extraction.pageCount} page${
        extraction.pageCount > 1 ? "s" : ""
      }`;
      characters.textContent = `${extraction.characterCount} caractère${
        extraction.characterCount > 1 ? "s" : ""
      }`;
      extractedAt.textContent = options.formatDate(extraction.extractedAt);
      cacheStatus.textContent = extraction.fromCache ? "issu du cache" : "analyse locale";
      meta.append(pages, characters, extractedAt, cacheStatus);

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

  function createTextExtractionExcerpt(extraction: PdfTextExtraction): HTMLDivElement {
    const container = document.createElement("div");
    const heading = document.createElement("strong");
    const excerpt = document.createElement("pre");

    heading.textContent = extraction.truncated ? "Extrait limité" : "Extrait";
    excerpt.className = "text-extraction-excerpt";
    excerpt.textContent = extraction.excerpt;
    container.append(heading, excerpt);

    return container;
  }

  function createTextExtractionLimitNoticeNodes(extraction: PdfTextExtraction | null): HTMLElement[] {
    if (!extraction || extraction.pagesAnalyzed >= extraction.pageCount) {
      return [];
    }

    const notice = document.createElement("p");
    notice.className = "text-extraction-limit";
    notice.textContent = `Analyse limitée aux ${extraction.pagesAnalyzed} premières pages.`;
    return [notice];
  }

  function createEmptyTextExtractionDocumentState(): TextExtractionDocumentState {
    return {
      status: "idle",
      result: null,
      error: null
    };
  }

  DocSorterTextExtractionPanel = {
    createTextExtractionPanel
  };
  globalThis.DocSorterTextExtractionPanel = DocSorterTextExtractionPanel;
})();
