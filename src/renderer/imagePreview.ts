interface ImagePreviewData {
  mimeType: string;
  bytes: ArrayBuffer;
}

interface ImagePreviewRenderOptions {
  container: HTMLElement;
  data: ImagePreviewData;
  zoom: number;
  rotation: number;
}

interface ImagePreviewApi {
  render: (options: ImagePreviewRenderOptions) => void;
  clear: () => void;
}

(() => {
  let objectUrl: string | null = null;

  function clear(): void {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function render(options: ImagePreviewRenderOptions): void {
    clear();

    const shell = document.createElement("div");
    const image = document.createElement("img");
    const blob = new Blob([options.data.bytes], { type: options.data.mimeType });

    objectUrl = URL.createObjectURL(blob);
    shell.className = "preview-media-shell";
    image.className = "preview-image";
    image.alt = "Aperçu du document";
    image.src = objectUrl;
    image.style.transform = `scale(${options.zoom}) rotate(${options.rotation}deg)`;

    shell.append(image);
    options.container.replaceChildren(shell);
  }

  window.docSorterImagePreview = {
    render,
    clear
  };
})();
