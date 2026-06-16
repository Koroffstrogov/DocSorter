import type { DocSorterApi } from "../preload/preloadApiContract";

declare global {
  interface ImagePreviewRenderOptions {
    container: HTMLElement;
    data: {
      mimeType: string;
      bytes: ArrayBuffer;
    };
    zoom: number;
    rotation: number;
  }

  interface PdfLoadResult {
    pageCount: number;
    fitZoom: number;
  }

  interface Window {
    docSorter: DocSorterApi;
    docSorterImagePreview: {
      render: (options: ImagePreviewRenderOptions) => void;
      clear: () => void;
    };
    docSorterPdfPreview: {
      load: (data: { bytes: ArrayBuffer }, availableWidth: number) => Promise<PdfLoadResult>;
      renderPage: (container: HTMLElement, pageNumber: number, zoom: number) => Promise<void>;
      clear: () => void;
    };
  }
}

export {};
