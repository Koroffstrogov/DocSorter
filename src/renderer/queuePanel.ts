interface QueuePanelDocument extends QueueViewDocument {}

interface QueuePanelState<TDocument extends QueuePanelDocument> {
  documents: TDocument[];
  activeDocumentPath: string | null;
  queueMessage: string;
  queueView: {
    query: string;
    filter: QueueViewFilter;
    sortKey: QueueViewSortKey;
    sortDirection: QueueViewSortDirection;
  };
  isLoading: boolean;
  duplicateFilePaths: string[];
}

interface QueuePanelOptions<TDocument extends QueuePanelDocument> {
  root?: ParentNode;
  getState: () => QueuePanelState<TDocument>;
  onSelectDocument: (documentItem: TDocument) => void;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: QueueViewFilter) => void;
  onSortChange: (sortKey: QueueViewSortKey) => void;
  onSortDirectionChange: (sortDirection: QueueViewSortDirection) => void;
  hasVisibleDuplicate: (filePath: string) => boolean;
  getStatusLabel: (documentItem: TDocument) => string;
}

interface QueuePanelApi<TDocument extends QueuePanelDocument> {
  render: () => QueueViewResult<TDocument>;
  getVisibleQueue: () => QueueViewResult<TDocument>;
  navigate: (direction: QueueViewNavigationDirection) => void;
  navigateByOffset: (offset: number) => void;
  focusSearch: () => void;
  blurSearch: () => void;
  clearSearch: () => void;
  setFilter: (filter: QueueViewFilter) => void;
}

interface QueuePanelFactoryApi {
  createQueuePanel: <TDocument extends QueuePanelDocument>(
    options: QueuePanelOptions<TDocument>
  ) => QueuePanelApi<TDocument>;
}

interface QueuePanelElements {
  count: HTMLElement | null;
  state: HTMLElement | null;
  list: HTMLOListElement | null;
  searchInput: HTMLInputElement | null;
  clearSearchButton: HTMLButtonElement | null;
  filterButtons: HTMLButtonElement[];
  sortSelect: HTMLSelectElement | null;
  sortDirectionButton: HTMLButtonElement | null;
  previousButton: HTMLButtonElement | null;
  nextButton: HTMLButtonElement | null;
}

interface Window {
  DocSorterQueuePanel: QueuePanelFactoryApi;
}

var DocSorterQueuePanel: QueuePanelFactoryApi;

(() => {
  function createQueuePanel<TDocument extends QueuePanelDocument>(
    options: QueuePanelOptions<TDocument>
  ): QueuePanelApi<TDocument> {
    const elements = getQueuePanelElements(options.root ?? document);

    elements.searchInput?.addEventListener("input", () => {
      options.onSearchChange(elements.searchInput?.value ?? "");
      render();
    });

    elements.clearSearchButton?.addEventListener("click", () => {
      clearSearch();
    });

    elements.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.queueFilter;
        if (!isQueueFilter(filter)) {
          return;
        }

        setFilter(filter);
      });
    });

    elements.sortSelect?.addEventListener("change", () => {
      const sortKey = elements.sortSelect?.value ?? "";
      if (!isQueueSortKey(sortKey)) {
        return;
      }

      options.onSortChange(sortKey);
      render();
    });

    elements.sortDirectionButton?.addEventListener("click", () => {
      const currentDirection = options.getState().queueView.sortDirection;
      options.onSortDirectionChange(currentDirection === "asc" ? "desc" : "asc");
      render();
    });

    elements.previousButton?.addEventListener("click", () => {
      navigate("previous");
    });

    elements.nextButton?.addEventListener("click", () => {
      navigate("next");
    });

    function render(): QueueViewResult<TDocument> {
      const viewState = options.getState();
      const visibleQueue = getVisibleQueue();

      elements.count?.replaceChildren(
        `${visibleQueue.visibleCount} / ${visibleQueue.totalCount} document${
          visibleQueue.totalCount > 1 ? "s" : ""
        } affiché${visibleQueue.visibleCount > 1 ? "s" : ""}`
      );
      renderDocumentList(visibleQueue.documents);
      renderQueueTools(visibleQueue, viewState);
      renderQueueState(visibleQueue, viewState);

      return visibleQueue;
    }

    function getVisibleQueue(): QueueViewResult<TDocument> {
      const viewState = options.getState();
      return DocSorterQueueView.buildVisibleQueue(viewState.documents, {
        query: viewState.queueView.query,
        filter: viewState.queueView.filter,
        sortKey: viewState.queueView.sortKey,
        sortDirection: viewState.queueView.sortDirection,
        duplicateFilePaths: viewState.duplicateFilePaths,
        activeDocumentPath: viewState.activeDocumentPath
      });
    }

    function navigate(direction: QueueViewNavigationDirection): void {
      const viewState = options.getState();
      const visibleQueue = getVisibleQueue();
      const targetPath = DocSorterQueueView.findAdjacentVisibleDocumentPath(
        visibleQueue.documents,
        viewState.activeDocumentPath,
        direction
      );
      if (!targetPath) {
        return;
      }

      selectDocumentByPath(targetPath);
    }

    function navigateByOffset(offset: number): void {
      const viewState = options.getState();
      const visibleDocuments = getVisibleQueue().documents;
      if (visibleDocuments.length === 0) {
        return;
      }

      const activeIndex = viewState.activeDocumentPath
        ? visibleDocuments.findIndex(
            (documentItem) => documentItem.filePath === viewState.activeDocumentPath
          )
        : -1;
      const targetIndex =
        activeIndex < 0
          ? 0
          : Math.min(visibleDocuments.length - 1, Math.max(0, activeIndex + offset));
      options.onSelectDocument(visibleDocuments[targetIndex]);
    }

    function focusSearch(): void {
      if (!elements.searchInput) {
        return;
      }

      elements.searchInput.focus();
      elements.searchInput.select();
    }

    function blurSearch(): void {
      elements.searchInput?.blur();
    }

    function clearSearch(): void {
      options.onSearchChange("");
      render();
    }

    function setFilter(filter: QueueViewFilter): void {
      options.onFilterChange(filter);
      render();
    }

    function selectDocumentByPath(filePath: string): void {
      const documentItem = options
        .getState()
        .documents.find((candidate) => candidate.filePath === filePath);
      if (!documentItem) {
        return;
      }

      options.onSelectDocument(documentItem);
    }

    function renderDocumentList(documents: TDocument[]): void {
      if (!elements.list) {
        return;
      }

      const scrollTop = elements.list.scrollTop;
      elements.list.replaceChildren(
        ...documents.map((documentItem) => createDocumentListItem(documentItem))
      );
      elements.list.scrollTop = scrollTop;
    }

    function createDocumentListItem(documentItem: TDocument): HTMLLIElement {
      const viewState = options.getState();
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      const icon = document.createElement("span");
      const content = document.createElement("span");
      const title = document.createElement("strong");
      const meta = document.createElement("small");
      const status = document.createElement("span");
      const statusLabel = options.getStatusLabel(documentItem);

      button.type = "button";
      button.className = "document-item";
      button.title = documentItem.name;
      button.ariaPressed = String(documentItem.filePath === viewState.activeDocumentPath);
      if (documentItem.filePath === viewState.activeDocumentPath) {
        button.classList.add("selected");
      }
      if (documentItem.status === "missing") {
        button.classList.add("missing");
      }
      if (documentItem.status !== "missing" && options.hasVisibleDuplicate(documentItem.filePath)) {
        button.classList.add("duplicate");
      }

      icon.className = "document-icon";
      icon.textContent = documentItem.extension.replace(".", "").toUpperCase();

      title.textContent = documentItem.name;
      title.title = documentItem.name;
      meta.textContent = `${documentItem.extension.toUpperCase()} · ${documentItem.sizeLabel}`;
      status.className = "status-badge";
      status.textContent = statusLabel;
      status.title = statusLabel;

      content.append(title, meta, status);
      button.append(icon, content);
      button.addEventListener("click", () => {
        options.onSelectDocument(documentItem);
      });

      listItem.append(button);
      return listItem;
    }

    function renderQueueTools(
      visibleQueue: QueueViewResult<TDocument>,
      viewState: QueuePanelState<TDocument>
    ): void {
      const toolsDisabled = viewState.documents.length === 0 || viewState.isLoading;

      if (elements.searchInput) {
        elements.searchInput.disabled = toolsDisabled;
        elements.searchInput.value = viewState.queueView.query;
      }

      if (elements.clearSearchButton) {
        elements.clearSearchButton.disabled = toolsDisabled || viewState.queueView.query.length === 0;
      }

      elements.filterButtons.forEach((button) => {
        const filter = button.dataset.queueFilter;
        const isActive = filter === viewState.queueView.filter;
        button.disabled = toolsDisabled;
        button.ariaPressed = String(isActive);
      });

      if (elements.sortSelect) {
        elements.sortSelect.disabled = toolsDisabled;
        elements.sortSelect.value = viewState.queueView.sortKey;
      }

      if (elements.sortDirectionButton) {
        elements.sortDirectionButton.disabled = toolsDisabled;
        elements.sortDirectionButton.replaceChildren(queueSortDirectionLabel(viewState));
        elements.sortDirectionButton.title =
          viewState.queueView.sortDirection === "asc" ? "Tri ascendant" : "Tri descendant";
      }

      const previousPath = DocSorterQueueView.findAdjacentVisibleDocumentPath(
        visibleQueue.documents,
        viewState.activeDocumentPath,
        "previous"
      );
      const nextPath = DocSorterQueueView.findAdjacentVisibleDocumentPath(
        visibleQueue.documents,
        viewState.activeDocumentPath,
        "next"
      );

      if (elements.previousButton) {
        elements.previousButton.disabled = toolsDisabled || !previousPath;
      }
      if (elements.nextButton) {
        elements.nextButton.disabled = toolsDisabled || !nextPath;
      }
    }

    function renderQueueState(
      visibleQueue: QueueViewResult<TDocument>,
      viewState: QueuePanelState<TDocument>
    ): void {
      if (!elements.state) {
        return;
      }

      if (viewState.isLoading) {
        elements.state.hidden = false;
        elements.state.replaceChildren(viewState.queueMessage || "Analyse du dossier source");
        return;
      }

      const messages: string[] = [];
      if (viewState.queueMessage) {
        messages.push(viewState.queueMessage);
      }

      if (viewState.documents.length > 0 && visibleQueue.visibleCount === 0) {
        messages.push("Aucun document ne correspond aux filtres.");
      } else if (viewState.activeDocumentPath && !visibleQueue.activeDocumentVisible) {
        messages.push("Le document actif est masqué par la recherche ou le filtre.");
      }

      elements.state.hidden = messages.length === 0;
      elements.state.replaceChildren(messages.join(" "));
    }

    return {
      render,
      getVisibleQueue,
      navigate,
      navigateByOffset,
      focusSearch,
      blurSearch,
      clearSearch,
      setFilter
    };
  }

  function getQueuePanelElements(root: ParentNode): QueuePanelElements {
    return {
      count: root.querySelector<HTMLElement>("#queue-count"),
      state: root.querySelector<HTMLElement>("#queue-state"),
      list: root.querySelector<HTMLOListElement>("#document-list"),
      searchInput: root.querySelector<HTMLInputElement>("#queue-search"),
      clearSearchButton: root.querySelector<HTMLButtonElement>("#clear-queue-search"),
      filterButtons: Array.from(root.querySelectorAll<HTMLButtonElement>("[data-queue-filter]")),
      sortSelect: root.querySelector<HTMLSelectElement>("#queue-sort"),
      sortDirectionButton: root.querySelector<HTMLButtonElement>("#queue-sort-direction"),
      previousButton: root.querySelector<HTMLButtonElement>("#previous-document"),
      nextButton: root.querySelector<HTMLButtonElement>("#next-document")
    };
  }

  function queueSortDirectionLabel<TDocument extends QueuePanelDocument>(
    viewState: QueuePanelState<TDocument>
  ): string {
    if (viewState.queueView.sortKey === "name") {
      return viewState.queueView.sortDirection === "asc" ? "A → Z" : "Z → A";
    }

    return viewState.queueView.sortDirection === "asc" ? "Asc" : "Desc";
  }

  function isQueueFilter(value: string | undefined): value is QueueViewFilter {
    return (
      value === "all" ||
      value === "pdf" ||
      value === "images" ||
      value === "duplicates" ||
      value === "missing" ||
      value === "pending"
    );
  }

  function isQueueSortKey(value: string): value is QueueViewSortKey {
    return (
      value === "name" ||
      value === "modifiedAt" ||
      value === "sizeBytes" ||
      value === "extension" ||
      value === "status"
    );
  }

  DocSorterQueuePanel = {
    createQueuePanel
  };
  globalThis.DocSorterQueuePanel = DocSorterQueuePanel;
})();
