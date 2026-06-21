type SourcePickerEntryKind = "directory" | "file";

type SourcePickerResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

interface SourcePickerEntry {
  name: string;
  path: string;
  kind: SourcePickerEntryKind;
  extension?: string;
  supportedDocument: boolean;
  sizeLabel?: string;
  modifiedAt?: string;
}

interface SourcePickerShortcut {
  label: string;
  path: string;
  available: boolean;
}

interface SourcePickerListing {
  currentPath: string;
  parentPath: string | null;
  entries: SourcePickerEntry[];
  directoryCount: number;
  fileCount: number;
  supportedDocumentCount: number;
  shortcuts: SourcePickerShortcut[];
  truncated: boolean;
  warnings: string[];
}

interface SourcePickerDirectorySelection {
  path: string;
}

interface SourceDirectoryPickerOptions {
  initialPath: string | null;
  listDirectory: (sourcePath?: string | null) => Promise<SourcePickerResult<SourcePickerListing>>;
  selectDirectory: (sourcePath: string) => Promise<SourcePickerResult<SourcePickerDirectorySelection | null>>;
}

interface SourceDirectoryPickerApi {
  openSourceDirectoryPicker: (
    options: SourceDirectoryPickerOptions
  ) => Promise<SourcePickerResult<SourcePickerDirectorySelection | null>>;
}

interface Window {
  DocSorterSourceDirectoryPicker: SourceDirectoryPickerApi;
}

var DocSorterSourceDirectoryPicker: SourceDirectoryPickerApi;

(() => {
  function openSourceDirectoryPicker(
    options: SourceDirectoryPickerOptions
  ): Promise<SourcePickerResult<SourcePickerDirectorySelection | null>> {
    return new Promise((resolve) => {
      const elements = createPickerElements();
      let listing: SourcePickerListing | null = null;
      let loading = false;
      let message = "Chargement du dossier...";
      let closed = false;

      document.body.append(elements.backdrop);
      document.addEventListener("keydown", handleGlobalKeydown);
      window.setTimeout(() => {
        elements.pathInput.focus();
        elements.pathInput.select();
      }, 0);
      void loadDirectory(options.initialPath);

      elements.cancelButton.addEventListener("click", () => {
        close({ ok: true, value: null });
      });

      elements.chooseButton.addEventListener("click", () => {
        void chooseCurrentDirectory();
      });

      elements.openPathButton.addEventListener("click", () => {
        void loadDirectory(elements.pathInput.value);
      });

      elements.pathInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void loadDirectory(elements.pathInput.value);
        }
      });

      async function loadDirectory(sourcePath?: string | null): Promise<void> {
        loading = true;
        message = "Chargement du dossier...";
        render();
        const result = await options.listDirectory(sourcePath);
        if (closed) {
          return;
        }
        loading = false;

        if (!result.ok) {
          listing = null;
          message = result.error.message;
          render();
          return;
        }

        listing = result.value;
        elements.pathInput.value = listing.currentPath;
        message = `${listing.supportedDocumentCount} document${
          listing.supportedDocumentCount > 1 ? "s" : ""
        } pris en charge dans ce dossier.`;
        render();
      }

      async function chooseCurrentDirectory(): Promise<void> {
        if (!listing || loading) {
          return;
        }

        elements.chooseButton.disabled = true;
        const result = await options.selectDirectory(listing.currentPath);
        close(result);
      }

      function render(): void {
        elements.chooseButton.disabled = loading || !listing;
        elements.openPathButton.disabled = loading;
        elements.status.textContent = message;
        elements.status.className = listing ? "source-picker-status" : "source-picker-status warning";
        renderShortcuts(elements.shortcuts, listing, loading, loadDirectory);
        renderEntries(elements.entries, listing, loading, loadDirectory);
        renderSummary(elements.summary, listing);
      }

      function close(result: SourcePickerResult<SourcePickerDirectorySelection | null>): void {
        if (closed) {
          return;
        }
        closed = true;
        document.removeEventListener("keydown", handleGlobalKeydown);
        elements.backdrop.remove();
        resolve(result);
      }

      function handleGlobalKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
          event.preventDefault();
          close({ ok: true, value: null });
        }
      }
    });
  }

  function createPickerElements() {
    const backdrop = document.createElement("div");
    const dialog = document.createElement("section");
    const header = document.createElement("div");
    const titleBlock = document.createElement("div");
    const title = document.createElement("h2");
    const description = document.createElement("p");
    const cancelButton = document.createElement("button");
    const pathRow = document.createElement("div");
    const pathLabel = document.createElement("label");
    const pathLabelText = document.createElement("span");
    const pathInput = document.createElement("input");
    const openPathButton = document.createElement("button");
    const content = document.createElement("div");
    const shortcuts = document.createElement("div");
    const entries = document.createElement("div");
    const footer = document.createElement("div");
    const status = document.createElement("p");
    const summary = document.createElement("p");
    const chooseButton = document.createElement("button");

    backdrop.className = "source-picker-backdrop";
    dialog.className = "source-picker-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "source-picker-title");
    header.className = "source-picker-header";
    titleBlock.className = "source-picker-title";
    title.id = "source-picker-title";
    title.textContent = "Choisir le dossier source";
    description.textContent = "Les fichiers sont visibles pour vérifier le contenu. Seul le dossier courant est sélectionné.";
    cancelButton.type = "button";
    cancelButton.className = "source-picker-close";
    cancelButton.textContent = "Fermer";
    pathRow.className = "source-picker-path-row";
    pathLabel.className = "source-picker-path-label";
    pathLabelText.textContent = "Chemin";
    pathInput.type = "text";
    pathInput.autocomplete = "off";
    pathInput.placeholder = "Chemin du dossier source";
    openPathButton.type = "button";
    openPathButton.textContent = "Ouvrir";
    content.className = "source-picker-content";
    shortcuts.className = "source-picker-shortcuts";
    shortcuts.setAttribute("aria-label", "Raccourcis");
    entries.className = "source-picker-entries";
    entries.setAttribute("aria-label", "Contenu du dossier");
    footer.className = "source-picker-footer";
    status.className = "source-picker-status";
    summary.className = "source-picker-summary";
    chooseButton.type = "button";
    chooseButton.className = "source-picker-choose";
    chooseButton.textContent = "Choisir ce dossier";
    chooseButton.disabled = true;

    titleBlock.append(title, description);
    header.append(titleBlock, cancelButton);
    pathLabel.append(pathLabelText, pathInput);
    pathRow.append(pathLabel, openPathButton);
    content.append(shortcuts, entries);
    footer.append(status, summary, chooseButton);
    dialog.append(header, pathRow, content, footer);
    backdrop.append(dialog);

    return {
      backdrop,
      shortcuts,
      entries,
      status,
      summary,
      chooseButton,
      cancelButton,
      pathInput,
      openPathButton
    };
  }

  function renderShortcuts(
    container: HTMLElement,
    listing: SourcePickerListing | null,
    loading: boolean,
    onOpen: (sourcePath: string) => void
  ): void {
    const title = document.createElement("strong");
    title.textContent = "Accès rapides";

    if (!listing) {
      container.replaceChildren(title);
      return;
    }

    const buttons = listing.shortcuts.map((shortcut) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = shortcut.label;
      button.title = shortcut.path;
      button.disabled = loading || !shortcut.available;
      button.addEventListener("click", () => {
        onOpen(shortcut.path);
      });
      return button;
    });

    container.replaceChildren(title, ...buttons);
  }

  function renderEntries(
    container: HTMLElement,
    listing: SourcePickerListing | null,
    loading: boolean,
    onOpen: (sourcePath: string) => void
  ): void {
    if (!listing) {
      const empty = document.createElement("p");
      empty.className = "source-picker-empty";
      empty.textContent = "Aucun dossier chargé.";
      container.replaceChildren(empty);
      return;
    }

    const rows: HTMLElement[] = [];
    if (listing.parentPath) {
      rows.push(createDirectoryRow("..", listing.parentPath, loading, onOpen));
    }

    rows.push(
      ...listing.entries.map((entry) =>
        entry.kind === "directory"
          ? createDirectoryRow(entry.name, entry.path, loading, onOpen)
          : createFileRow(entry)
      )
    );

    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "source-picker-empty";
      empty.textContent = "Dossier vide.";
      container.replaceChildren(empty);
      return;
    }

    container.replaceChildren(...rows);
  }

  function createDirectoryRow(
    label: string,
    sourcePath: string,
    loading: boolean,
    onOpen: (sourcePath: string) => void
  ): HTMLElement {
    const button = document.createElement("button");
    const name = document.createElement("strong");
    const meta = document.createElement("span");

    button.type = "button";
    button.className = "source-picker-row directory";
    button.disabled = loading;
    name.textContent = label;
    meta.textContent = "Dossier";
    button.append(name, meta);
    button.addEventListener("click", () => {
      onOpen(sourcePath);
    });
    return button;
  }

  function createFileRow(entry: SourcePickerEntry): HTMLElement {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const badge = document.createElement("span");

    row.className = `source-picker-row file ${entry.supportedDocument ? "supported" : "unsupported"}`;
    name.textContent = entry.name;
    meta.textContent = [entry.extension || "fichier", entry.sizeLabel ?? ""].filter(Boolean).join(" · ");
    badge.className = "source-picker-file-badge";
    badge.textContent = entry.supportedDocument ? "pris en charge" : "visible";
    row.append(name, meta, badge);
    return row;
  }

  function renderSummary(container: HTMLElement, listing: SourcePickerListing | null): void {
    if (!listing) {
      container.textContent = "";
      return;
    }

    const parts = [
      `${listing.directoryCount} dossier${listing.directoryCount > 1 ? "s" : ""}`,
      `${listing.fileCount} fichier${listing.fileCount > 1 ? "s" : ""}`,
      `${listing.supportedDocumentCount} compatible${listing.supportedDocumentCount > 1 ? "s" : ""}`
    ];

    container.textContent = [
      parts.join(" · "),
      ...listing.warnings
    ].join(" · ");
  }

  DocSorterSourceDirectoryPicker = {
    openSourceDirectoryPicker
  };
})();
