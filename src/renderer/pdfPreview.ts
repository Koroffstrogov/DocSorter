interface PdfPreviewData {
  bytes: ArrayBuffer;
}

interface PdfLoadResult {
  pageCount: number;
  fitZoom: number;
}

interface PdfPreviewApi {
  load: (data: PdfPreviewData, availableWidth: number) => Promise<PdfLoadResult>;
  renderPage: (container: HTMLElement, pageNumber: number, zoom: number) => Promise<void>;
  clear: () => void;
}

interface PdfJsModule {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  VerbosityLevel: {
    ERRORS: number;
  };
  getDocument: (options: { data: Uint8Array; verbosity?: number }) => PdfDocumentLoadingTask;
}

interface PdfDocumentLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  destroy: () => Promise<void>;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  cleanup: () => Promise<unknown>;
}

interface PdfPageProxy {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
}

interface PdfRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

interface PdfViewport {
  width: number;
  height: number;
}

(() => {
  const minZoom = 0.5;
  const maxZoom = 3;
  let pdfJsPromise: Promise<PdfJsModule> | null = null;
  let loadingTask: PdfDocumentLoadingTask | null = null;
  let documentProxy: PdfDocumentProxy | null = null;
  let renderTask: PdfRenderTask | null = null;

  async function load(data: PdfPreviewData, availableWidth: number): Promise<PdfLoadResult> {
    clear();

    const pdfJs = await loadPdfJs();
    const bytes = new Uint8Array(data.bytes.slice(0));
    loadingTask = pdfJs.getDocument({
      data: bytes,
      verbosity: pdfJs.VerbosityLevel.ERRORS
    });
    documentProxy = await loadingTask.promise;

    const firstPage = await documentProxy.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const fitZoom = clampZoom((availableWidth - 56) / viewport.width);

    return {
      pageCount: documentProxy.numPages,
      fitZoom
    };
  }

  async function renderPage(container: HTMLElement, pageNumber: number, zoom: number): Promise<void> {
    if (!documentProxy) {
      throw new Error("PDF document is not loaded.");
    }

    const shell = document.createElement("div");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context unavailable.");
    }

    renderTask?.cancel();
    renderTask = null;

    const page = await documentProxy.getPage(pageNumber);
    const viewport = page.getViewport({ scale: zoom });
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    shell.className = "preview-media-shell";
    canvas.className = "pdf-canvas";
    shell.append(canvas);
    container.replaceChildren(shell);

    const currentRenderTask = page.render({
      canvasContext: context,
      viewport
    });

    renderTask = currentRenderTask;
    try {
      await currentRenderTask.promise;
    } finally {
      if (renderTask === currentRenderTask) {
        renderTask = null;
      }
    }
  }

  function clear(): void {
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }

    if (documentProxy) {
      void documentProxy.cleanup().catch(() => undefined);
      documentProxy = null;
    }

    if (loadingTask) {
      void loadingTask.destroy().catch(() => undefined);
      loadingTask = null;
    }
  }

  async function loadPdfJs(): Promise<PdfJsModule> {
    if (!pdfJsPromise) {
      // PDF.js is copied to dist/renderer/vendor/pdfjs during the build.
      // @ts-expect-error The runtime vendor module does not exist under src.
      pdfJsPromise = import("./vendor/pdfjs/pdf.mjs") as Promise<PdfJsModule>;
      const pdfJs = await pdfJsPromise;
      pdfJs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.mjs";
    }

    return pdfJsPromise;
  }

  function clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) {
      return 1;
    }

    return Math.min(maxZoom, Math.max(minZoom, Math.round(zoom * 100) / 100));
  }

  window.docSorterPdfPreview = {
    load,
    renderPage,
    clear
  };
})();
