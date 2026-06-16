interface DuplicatePanelState {
  activeDocument: DocumentItem | null;
  documents: DocumentItem[];
  duplicates: DuplicateAnalysisState;
}

interface DuplicatePanelOptions {
  root?: ParentNode;
  getState: () => DuplicatePanelState;
  onSelectDocumentByPath: (filePath: string) => void;
  onIgnoreActiveDuplicate: () => void;
  isActionsDisabled: () => boolean;
}

interface DuplicatePanelApi {
  render: () => void;
  getVisibleDuplicateMatchesForDocument: (filePath: string) => ExactDuplicateMatch[];
  hasVisibleDuplicate: (filePath: string) => boolean;
}

interface DuplicatePanelElements {
  panel: HTMLElement | null;
  details: HTMLElement | null;
  ignoreButton: HTMLButtonElement | null;
  keepButton: HTMLButtonElement | null;
}

interface DuplicatePanelFactoryApi {
  createDuplicatePanel: (options: DuplicatePanelOptions) => DuplicatePanelApi;
}

interface Window {
  DocSorterDuplicatePanel: DuplicatePanelFactoryApi;
}

var DocSorterDuplicatePanel: DuplicatePanelFactoryApi;

(() => {
  function createDuplicatePanel(options: DuplicatePanelOptions): DuplicatePanelApi {
    const elements = getDuplicatePanelElements(options.root ?? document);

    elements.ignoreButton?.addEventListener("click", () => {
      options.onIgnoreActiveDuplicate();
    });

    elements.keepButton?.addEventListener("click", () => {
      options.onIgnoreActiveDuplicate();
    });

    function render(): void {
      if (!elements.panel || !elements.details) {
        return;
      }

      const { activeDocument } = options.getState();
      const matches = activeDocument
        ? getVisibleDuplicateMatchesForDocument(activeDocument.filePath)
        : [];
      if (!activeDocument || matches.length === 0) {
        elements.panel.hidden = true;
        elements.details.replaceChildren();
        return;
      }

      elements.panel.hidden = false;
      elements.details.replaceChildren(
        createDuplicateSummary(matches),
        ...matches.map((match) => createDuplicateMatchItem(match, activeDocument.filePath))
      );

      const actionsDisabled = options.isActionsDisabled();
      if (elements.ignoreButton) {
        elements.ignoreButton.disabled = actionsDisabled;
      }
      if (elements.keepButton) {
        elements.keepButton.disabled = actionsDisabled;
      }
    }

    function getVisibleDuplicateMatchesForDocument(filePath: string): ExactDuplicateMatch[] {
      if (options.getState().duplicates.ignoredFilePaths.includes(filePath)) {
        return [];
      }

      return getDuplicateMatchesForDocument(filePath);
    }

    function getDuplicateMatchesForDocument(filePath: string): ExactDuplicateMatch[] {
      const { duplicates } = options.getState();
      if (duplicates.status !== "ready") {
        return [];
      }

      return duplicates.matches.filter((match) =>
        match.type === "source-queue"
          ? match.files.some((file) => file.filePath === filePath)
          : match.sourceFile.filePath === filePath
      );
    }

    function hasVisibleDuplicate(filePath: string): boolean {
      return getVisibleDuplicateMatchesForDocument(filePath).length > 0;
    }

    function createDuplicateMatchItem(
      match: ExactDuplicateMatch,
      activeFilePath: string
    ): HTMLDivElement {
      const item = document.createElement("div");
      const title = document.createElement("strong");
      const description = document.createElement("p");
      const hash = document.createElement("small");

      item.className = "duplicate-match";
      hash.textContent = `SHA-256 ${shortHash(match.hash)}`;

      if (match.type === "source-queue") {
        const otherFiles = match.files.filter((file) => file.filePath !== activeFilePath);
        title.textContent = "Doublon dans la file source";
        description.textContent = `Aussi présent : ${formatDuplicateNames(otherFiles)}`;
        item.title = otherFiles.map((file) => file.filePath).join("\n");
        item.append(title, description);
        const sourceLinks = createDuplicateSourceLinks(otherFiles);
        if (sourceLinks) {
          item.append(sourceLinks);
        }
        item.append(hash);
        return item;
      }

      title.textContent = "Doublon déjà classé";
      description.textContent = `${match.historyFile.classifiedName} depuis ${match.historyFile.originalName}`;
      item.title = match.historyFile.filePath;
      item.append(title, description, hash);
      return item;
    }

    function createDuplicateSourceLinks(files: DuplicateFileReference[]): HTMLDivElement | null {
      const { documents } = options.getState();
      const availableFiles = files.filter((file) =>
        documents.some((documentItem) => documentItem.filePath === file.filePath)
      );
      if (availableFiles.length === 0) {
        return null;
      }

      const links = document.createElement("div");
      links.className = "duplicate-source-links";

      availableFiles.forEach((file) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = file.name;
        button.title = file.filePath;
        button.addEventListener("click", () => {
          options.onSelectDocumentByPath(file.filePath);
        });
        links.append(button);
      });

      return links;
    }

    return {
      render,
      getVisibleDuplicateMatchesForDocument,
      hasVisibleDuplicate
    };
  }

  function getDuplicatePanelElements(root: ParentNode): DuplicatePanelElements {
    return {
      panel: root.querySelector<HTMLElement>("#duplicate-panel"),
      details: root.querySelector<HTMLElement>("#duplicate-details"),
      ignoreButton: root.querySelector<HTMLButtonElement>("#ignore-duplicate"),
      keepButton: root.querySelector<HTMLButtonElement>("#keep-duplicate")
    };
  }

  function createDuplicateSummary(matches: ExactDuplicateMatch[]): HTMLParagraphElement {
    const summary = document.createElement("p");
    summary.className = "duplicate-summary";
    summary.textContent = `${matches.length} correspondance${
      matches.length > 1 ? "s" : ""
    } exacte${matches.length > 1 ? "s" : ""} par hash SHA-256. Aucune suppression automatique.`;
    return summary;
  }

  function formatDuplicateNames(files: DuplicateFileReference[]): string {
    if (files.length === 0) {
      return "aucun autre document visible";
    }

    return files.map((file) => file.name).join(", ");
  }

  function shortHash(hash: string): string {
    return hash.length > 16 ? `${hash.slice(0, 16)}...` : hash;
  }

  DocSorterDuplicatePanel = {
    createDuplicatePanel
  };
  globalThis.DocSorterDuplicatePanel = DocSorterDuplicatePanel;
})();
