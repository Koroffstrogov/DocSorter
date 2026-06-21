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
  drives: SourcePickerShortcut[];
  truncated: boolean;
  warnings: string[];
}

interface SourcePickerDirectorySelection {
  path: string;
}

interface SourceDirectoryPickerOptions {
  initialPath: string | null;
  recentDirectories?: string[];
  onClearRecentDirectories?: () => void;
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
      let previousPaths: string[] = [];
      let recentDirectories = [...(options.recentDirectories ?? [])];

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

      elements.previousButton.addEventListener("click", () => {
        const previousPath = previousPaths.pop();
        if (previousPath) {
          void loadDirectory(previousPath, { preserveHistory: true });
        }
      });

      elements.parentButton.addEventListener("click", () => {
        if (listing?.parentPath) {
          void loadDirectory(listing.parentPath);
        }
      });

      elements.pathInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void loadDirectory(elements.pathInput.value);
        }
      });

      function clearRecentDirectories(): void {
        recentDirectories = [];
        options.onClearRecentDirectories?.();
        render();
      }

      async function loadDirectory(
        sourcePath?: string | null,
        loadOptions: { preserveHistory?: boolean } = {}
      ): Promise<void> {
        const previousPath = listing?.currentPath ?? null;
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
        if (
          previousPath &&
          !loadOptions.preserveHistory &&
          previousPath.toLowerCase() !== listing.currentPath.toLowerCase()
        ) {
          previousPaths = [
            ...previousPaths.filter((historyPath) => historyPath.toLowerCase() !== previousPath.toLowerCase()),
            previousPath
          ].slice(-20);
        }
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
        elements.previousButton.disabled = loading || previousPaths.length === 0;
        elements.parentButton.disabled = loading || !listing?.parentPath;
        elements.status.textContent = message;
        elements.status.className = listing ? "source-picker-status" : "source-picker-status warning";
        renderDrives(elements.drives, listing, loading, loadDirectory);
        renderShortcuts(elements.shortcuts, listing, loading, loadDirectory, recentDirectories, clearRecentDirectories);
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
    const previousButton = document.createElement("button");
    const parentButton = document.createElement("button");
    const openPathButton = document.createElement("button");
    const drives = document.createElement("div");
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
    previousButton.type = "button";
    previousButton.className = "source-picker-nav-button";
    previousButton.textContent = "Précédent";
    previousButton.title = "Revenir au dossier ouvert précédemment";
    previousButton.disabled = true;
    parentButton.type = "button";
    parentButton.className = "source-picker-nav-button";
    parentButton.textContent = "Dossier parent";
    parentButton.title = "Ouvrir le dossier parent";
    parentButton.disabled = true;
    openPathButton.type = "button";
    openPathButton.textContent = "Ouvrir";
    drives.className = "source-picker-drives";
    drives.setAttribute("aria-label", "Lecteurs actifs");
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
    pathRow.append(previousButton, parentButton, pathLabel, openPathButton);
    content.append(shortcuts, entries);
    footer.append(status, summary, chooseButton);
    dialog.append(header, pathRow, drives, content, footer);
    backdrop.append(dialog);

    return {
      backdrop,
      drives,
      shortcuts,
      entries,
      status,
      summary,
      chooseButton,
      cancelButton,
      pathInput,
      previousButton,
      parentButton,
      openPathButton
    };
  }

  function renderShortcuts(
    container: HTMLElement,
    listing: SourcePickerListing | null,
    loading: boolean,
    onOpen: (sourcePath: string) => void,
    recentDirectories: string[],
    onClearRecentDirectories: () => void
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

    const recentTitle = document.createElement("strong");
    recentTitle.textContent = "Sources récentes";
    const recentButtons = recentDirectories.map((sourcePath) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sourcePath;
      button.title = sourcePath;
      button.disabled = loading;
      button.addEventListener("click", () => {
        onOpen(sourcePath);
      });
      return button;
    });
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "source-picker-clear-history";
    clearButton.textContent = "Effacer l'historique";
    clearButton.disabled = loading || recentDirectories.length === 0;
    clearButton.addEventListener("click", onClearRecentDirectories);

    container.replaceChildren(title, ...buttons, recentTitle, ...recentButtons, clearButton);
  }

  function renderDrives(
    container: HTMLElement,
    listing: SourcePickerListing | null,
    loading: boolean,
    onOpen: (sourcePath: string) => void
  ): void {
    const label = document.createElement("strong");
    label.textContent = "Lecteurs";
    const drives = listing?.drives ?? [];
    if (drives.length === 0) {
      const empty = document.createElement("span");
      empty.className = "source-picker-drives-empty";
      empty.textContent = "Aucun lecteur détecté";
      container.replaceChildren(label, empty);
      return;
    }

    const buttons = drives.map((drive) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = drive.label;
      button.title = drive.path;
      button.disabled = loading || !drive.available;
      button.addEventListener("click", () => {
        onOpen(drive.path);
      });
      return button;
    });
    container.replaceChildren(label, ...buttons);
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

    const rows: HTMLElement[] = listing.entries.map((entry) =>
      entry.kind === "directory"
        ? createDirectoryRow(entry.name, entry.path, loading, onOpen)
        : createFileRow(entry)
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
