interface PreviewPanelState {
  activeDocument: DocumentItem | null;
  preview: PreviewState;
}

interface PreviewPanelOptions {
  root?: ParentNode;
  getState: () => PreviewPanelState;
  statusLabel: (status: DocumentItem["status"]) => string;
  onPdfPageChange: (pageNumber: number) => void;
  onZoomChange: (zoom: number) => void;
  onRotateImage: () => void;
  onPdfRenderError: () => void;
}

interface PreviewPanelApi {
  render: () => void;
  clearResources: () => void;
  getAvailableWidth: (fallback: number) => number;
  clampZoom: (zoom: number) => number;
}

interface PreviewPanelElements {
  content: HTMLElement | null;
  controls: HTMLElement | null;
  pdfPageControls: HTMLElement | null;
  previousPageButton: HTMLButtonElement | null;
  nextPageButton: HTMLButtonElement | null;
  pageIndicator: HTMLElement | null;
  zoomOutButton: HTMLButtonElement | null;
  zoomResetButton: HTMLButtonElement | null;
  zoomInButton: HTMLButtonElement | null;
  rotateButton: HTMLButtonElement | null;
  statusText: HTMLElement | null;
}

interface PreviewPanelFactoryApi {
  createPreviewPanel: (options: PreviewPanelOptions) => PreviewPanelApi;
}

interface Window {
  DocSorterPreviewPanel: PreviewPanelFactoryApi;
}

var DocSorterPreviewPanel: PreviewPanelFactoryApi;

(() => {
  const minPreviewZoom = 0.5;
  const maxPreviewZoom = 3;
  const previewZoomStep = 0.25;

  function createPreviewPanel(options: PreviewPanelOptions): PreviewPanelApi {
    const elements = getPreviewPanelElements(options.root ?? document);
    let pdfRenderRequestId = 0;

    elements.previousPageButton?.addEventListener("click", () => {
      const { preview } = options.getState();
      if (preview.data?.kind !== "pdf") {
        return;
      }

      options.onPdfPageChange(Math.max(1, preview.pdfPage - 1));
    });

    elements.nextPageButton?.addEventListener("click", () => {
      const { preview } = options.getState();
      if (preview.data?.kind !== "pdf") {
        return;
      }

      options.onPdfPageChange(Math.min(preview.pdfPageCount, preview.pdfPage + 1));
    });

    elements.zoomOutButton?.addEventListener("click", () => {
      const { preview } = options.getState();
      options.onZoomChange(preview.zoom - previewZoomStep);
    });

    elements.zoomInButton?.addEventListener("click", () => {
      const { preview } = options.getState();
      options.onZoomChange(preview.zoom + previewZoomStep);
    });

    elements.zoomResetButton?.addEventListener("click", () => {
      const { preview } = options.getState();
      options.onZoomChange(preview.data?.kind === "pdf" ? preview.pdfFitZoom || 1 : 1);
    });

    elements.rotateButton?.addEventListener("click", () => {
      const { preview } = options.getState();
      if (preview.data?.kind !== "image") {
        return;
      }

      options.onRotateImage();
    });

    function render(): void {
      renderControls(elements, options.getState().preview);

      if (!elements.content) {
        return;
      }

      const { activeDocument, preview } = options.getState();

      if (!activeDocument && preview.status === "error") {
        elements.statusText?.replaceChildren("Document indisponible");
        elements.content.replaceChildren(createPlaceholder(preview.errorMessage));
        return;
      }

      if (!activeDocument) {
        elements.statusText?.replaceChildren("Lecture seule");
        elements.content.replaceChildren(createPlaceholder("Sélectionnez un document"));
        return;
      }

      if (preview.status === "loading") {
        elements.statusText?.replaceChildren("Chargement");
        elements.content.replaceChildren(createPlaceholder("Chargement de l'aperçu..."));
        return;
      }

      if (preview.status === "error") {
        elements.statusText?.replaceChildren("Erreur d'aperçu");
        elements.content.replaceChildren(createPlaceholder(preview.errorMessage));
        return;
      }

      if (preview.status !== "ready" || !preview.data) {
        elements.statusText?.replaceChildren(options.statusLabel(activeDocument.status));
        elements.content.replaceChildren(createPlaceholder("Chargement de l'aperçu..."));
        return;
      }

      if (preview.data.kind === "image") {
        elements.statusText?.replaceChildren(`${Math.round(preview.zoom * 100)}%`);
        window.docSorterPdfPreview.clear();
        window.docSorterImagePreview.render({
          container: elements.content,
          data: preview.data,
          zoom: preview.zoom,
          rotation: preview.rotation
        });
        return;
      }

      elements.statusText?.replaceChildren(`${preview.pdfPage} / ${preview.pdfPageCount}`);
      window.docSorterImagePreview.clear();
      renderPdfPage(elements.content, preview.pdfPage, preview.zoom);
    }

    function renderPdfPage(container: HTMLElement, pageNumber: number, zoom: number): void {
      const renderRequestId = ++pdfRenderRequestId;

      void window.docSorterPdfPreview.renderPage(container, pageNumber, zoom).catch(() => {
        if (renderRequestId !== pdfRenderRequestId || options.getState().preview.data?.kind !== "pdf") {
          return;
        }

        options.onPdfRenderError();
      });
    }

    function clearResources(): void {
      pdfRenderRequestId += 1;
      window.docSorterImagePreview?.clear();
      window.docSorterPdfPreview?.clear();
    }

    function getAvailableWidth(fallback: number): number {
      return elements.content?.clientWidth ?? fallback;
    }

    return {
      render,
      clearResources,
      getAvailableWidth,
      clampZoom
    };
  }

  function getPreviewPanelElements(root: ParentNode): PreviewPanelElements {
    return {
      content: root.querySelector<HTMLElement>("#preview-content"),
      controls: root.querySelector<HTMLElement>("#preview-controls"),
      pdfPageControls: root.querySelector<HTMLElement>("#pdf-page-controls"),
      previousPageButton: root.querySelector<HTMLButtonElement>("#previous-page"),
      nextPageButton: root.querySelector<HTMLButtonElement>("#next-page"),
      pageIndicator: root.querySelector<HTMLElement>("#page-indicator"),
      zoomOutButton: root.querySelector<HTMLButtonElement>("#zoom-out"),
      zoomResetButton: root.querySelector<HTMLButtonElement>("#zoom-reset"),
      zoomInButton: root.querySelector<HTMLButtonElement>("#zoom-in"),
      rotateButton: root.querySelector<HTMLButtonElement>("#rotate-preview"),
      statusText: root.querySelector<HTMLElement>("#status-text")
    };
  }

  function renderControls(elements: PreviewPanelElements, preview: PreviewState): void {
    const data = preview.status === "ready" ? preview.data : null;
    const isPdf = data?.kind === "pdf";
    const isImage = data?.kind === "image";

    if (elements.controls) {
      elements.controls.hidden = !data;
    }

    if (elements.pdfPageControls) {
      elements.pdfPageControls.hidden = !isPdf;
    }

    if (elements.rotateButton) {
      elements.rotateButton.hidden = !isImage;
    }

    if (elements.pageIndicator) {
      elements.pageIndicator.replaceChildren(`${preview.pdfPage} / ${preview.pdfPageCount}`);
    }

    if (elements.previousPageButton) {
      elements.previousPageButton.disabled = !isPdf || preview.pdfPage <= 1;
    }

    if (elements.nextPageButton) {
      elements.nextPageButton.disabled = !isPdf || preview.pdfPage >= preview.pdfPageCount;
    }

    if (elements.zoomOutButton) {
      elements.zoomOutButton.disabled = !data || preview.zoom <= minPreviewZoom;
    }

    if (elements.zoomInButton) {
      elements.zoomInButton.disabled = !data || preview.zoom >= maxPreviewZoom;
    }

    if (elements.zoomResetButton) {
      elements.zoomResetButton.disabled = !data;
      elements.zoomResetButton.replaceChildren(`${Math.round(preview.zoom * 100)}%`);
    }
  }

  function createPlaceholder(message: string): HTMLDivElement {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-card";
    placeholder.textContent = message;
    return placeholder;
  }

  function clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) {
      return 1;
    }

    return Math.min(maxPreviewZoom, Math.max(minPreviewZoom, Math.round(zoom * 100) / 100));
  }

  DocSorterPreviewPanel = {
    createPreviewPanel
  };
  globalThis.DocSorterPreviewPanel = DocSorterPreviewPanel;
})();
