type QueueViewDocumentStatus = "pending" | "missing";
type QueueViewExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";
type QueueViewFilter = "all" | "pdf" | "images" | "duplicates" | "missing" | "pending";
type QueueViewSortKey = "name" | "modifiedAt" | "sizeBytes" | "extension" | "status";
type QueueViewSortDirection = "asc" | "desc";
type QueueViewNavigationDirection = "previous" | "next";

interface QueueViewDocument {
  name: string;
  filePath: string;
  extension: QueueViewExtension;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  status: QueueViewDocumentStatus;
}

interface QueueViewOptions {
  query: string;
  filter: QueueViewFilter;
  sortKey: QueueViewSortKey;
  sortDirection: QueueViewSortDirection;
  duplicateFilePaths: string[];
  activeDocumentPath: string | null;
}

interface QueueViewResult<TDocument extends QueueViewDocument = QueueViewDocument> {
  documents: TDocument[];
  totalCount: number;
  visibleCount: number;
  activeDocumentVisible: boolean;
  firstVisibleDocumentPath: string | null;
}

interface QueueViewApi {
  buildVisibleQueue: <TDocument extends QueueViewDocument>(
    documents: TDocument[],
    options: QueueViewOptions
  ) => QueueViewResult<TDocument>;
  findAdjacentVisibleDocumentPath: <TDocument extends QueueViewDocument>(
    documents: TDocument[],
    activeDocumentPath: string | null,
    direction: QueueViewNavigationDirection
  ) => string | null;
  isDocumentVisible: <TDocument extends QueueViewDocument>(
    documentItem: TDocument,
    options: QueueViewOptions
  ) => boolean;
  normalizeQueueSearchText: (value: string) => string;
}

interface Window {
  DocSorterQueueView: QueueViewApi;
}

var DocSorterQueueView: QueueViewApi;

(() => {
  const imageExtensions = new Set<QueueViewExtension>([".jpg", ".jpeg", ".png"]);

  function buildVisibleQueue<TDocument extends QueueViewDocument>(
    documents: TDocument[],
    options: QueueViewOptions
  ): QueueViewResult<TDocument> {
    const visibleDocuments = documents
      .filter((documentItem) => isDocumentVisible(documentItem, options))
      .map((documentItem, index) => ({
        documentItem,
        index
      }))
      .sort((left, right) => compareVisibleDocuments(left, right, options.sortKey, options.sortDirection))
      .map(({ documentItem }) => documentItem);

    return {
      documents: visibleDocuments,
      totalCount: documents.length,
      visibleCount: visibleDocuments.length,
      activeDocumentVisible: Boolean(
        options.activeDocumentPath &&
          visibleDocuments.some((documentItem) => documentItem.filePath === options.activeDocumentPath)
      ),
      firstVisibleDocumentPath: visibleDocuments[0]?.filePath ?? null
    };
  }

  function findAdjacentVisibleDocumentPath<TDocument extends QueueViewDocument>(
    documents: TDocument[],
    activeDocumentPath: string | null,
    direction: QueueViewNavigationDirection
  ): string | null {
    if (documents.length === 0) {
      return null;
    }

    const activeIndex = activeDocumentPath
      ? documents.findIndex((documentItem) => documentItem.filePath === activeDocumentPath)
      : -1;
    if (activeIndex < 0) {
      return documents[0].filePath;
    }

    const nextIndex = activeIndex + (direction === "next" ? 1 : -1);
    return documents[nextIndex]?.filePath ?? null;
  }

  function isDocumentVisible<TDocument extends QueueViewDocument>(
    documentItem: TDocument,
    options: QueueViewOptions
  ): boolean {
    return matchesFilter(documentItem, options.filter, options.duplicateFilePaths) && matchesQuery(documentItem, options.query);
  }

  function compareVisibleDocuments<TDocument extends QueueViewDocument>(
    left: { documentItem: TDocument; index: number },
    right: { documentItem: TDocument; index: number },
    sortKey: QueueViewSortKey,
    sortDirection: QueueViewSortDirection
  ): number {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;
    const result = compareDocuments(left.documentItem, right.documentItem, sortKey);
    if (result !== 0) {
      return result * directionMultiplier;
    }

    return left.index - right.index;
  }

  function compareDocuments(
    left: QueueViewDocument,
    right: QueueViewDocument,
    sortKey: QueueViewSortKey
  ): number {
    switch (sortKey) {
      case "name":
        return compareText(left.name, right.name);
      case "modifiedAt":
        return compareDate(left.modifiedAt, right.modifiedAt);
      case "sizeBytes":
        return left.sizeBytes - right.sizeBytes;
      case "extension":
        return compareText(left.extension, right.extension);
      case "status":
        return compareText(left.status, right.status);
    }
  }

  function matchesFilter(
    documentItem: QueueViewDocument,
    filter: QueueViewFilter,
    duplicateFilePaths: string[]
  ): boolean {
    switch (filter) {
      case "all":
        return true;
      case "pdf":
        return documentItem.extension === ".pdf";
      case "images":
        return imageExtensions.has(documentItem.extension);
      case "duplicates":
        return duplicateFilePaths.includes(documentItem.filePath);
      case "missing":
        return documentItem.status === "missing";
      case "pending":
        return documentItem.status === "pending";
    }
  }

  function matchesQuery(documentItem: QueueViewDocument, query: string): boolean {
    const normalizedQuery = normalizeQueueSearchText(query);
    if (!normalizedQuery) {
      return true;
    }

    return [
      documentItem.name,
      documentItem.extension,
      documentItem.status,
      documentItem.sizeLabel,
      documentItem.filePath
    ]
      .map(normalizeQueueSearchText)
      .some((value) => value.includes(normalizedQuery));
  }

  function normalizeQueueSearchText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .trim();
  }

  function compareText(left: string, right: string): number {
    return normalizeQueueSearchText(left).localeCompare(normalizeQueueSearchText(right), "fr-FR");
  }

  function compareDate(left: string, right: string): number {
    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);

    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
      return 0;
    }

    if (Number.isNaN(leftTime)) {
      return 1;
    }

    if (Number.isNaN(rightTime)) {
      return -1;
    }

    return leftTime - rightTime;
  }

  DocSorterQueueView = {
    buildVisibleQueue,
    findAdjacentVisibleDocumentPath,
    isDocumentVisible,
    normalizeQueueSearchText
  };
  globalThis.DocSorterQueueView = DocSorterQueueView;
})();
