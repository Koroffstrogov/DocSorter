import "./documentQueueView";

import { describe, expect, it } from "vitest";

const queueView = globalThis.DocSorterQueueView;

describe("document queue view", () => {
  it("searches by file name", () => {
    const result = buildQueue({ query: "taxe" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual(["Taxe fonciere.pdf"]);
  });

  it("searches case-insensitively", () => {
    const result = buildQueue({ query: "FACTURE" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual(["facture EDF.pdf"]);
  });

  it("searches without accents", () => {
    const result = buildQueue({ query: "releve" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual(["Releve banque.png"]);
  });

  it("filters PDF documents", () => {
    const result = buildQueue({ filter: "pdf" });

    expect(result.documents.map((documentItem) => documentItem.extension)).toEqual([".pdf", ".pdf"]);
  });

  it("filters image documents", () => {
    const result = buildQueue({ filter: "images" });

    expect(result.documents.map((documentItem) => documentItem.extension).sort()).toEqual([
      ".jpg",
      ".png"
    ]);
  });

  it("filters exact duplicates", () => {
    const result = buildQueue({
      filter: "duplicates",
      duplicateFilePaths: ["C:\\source\\facture EDF.pdf", "C:\\source\\photo.jpg"]
    });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual([
      "facture EDF.pdf",
      "photo.jpg"
    ]);
  });

  it("filters unavailable documents", () => {
    const result = buildQueue({ filter: "missing" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual(["photo.jpg"]);
  });

  it("filters pending documents", () => {
    const result = buildQueue({ filter: "pending" });

    expect(result.documents.map((documentItem) => documentItem.status)).toEqual([
      "pending",
      "pending",
      "pending"
    ]);
  });

  it("combines search and filter", () => {
    const result = buildQueue({
      query: "banque",
      filter: "images"
    });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual(["Releve banque.png"]);
  });

  it("sorts by name", () => {
    const result = buildQueue({ sortKey: "name", sortDirection: "asc" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual([
      "facture EDF.pdf",
      "photo.jpg",
      "Releve banque.png",
      "Taxe fonciere.pdf"
    ]);
  });

  it("sorts by modification date", () => {
    const result = buildQueue({ sortKey: "modifiedAt", sortDirection: "desc" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual([
      "photo.jpg",
      "Taxe fonciere.pdf",
      "Releve banque.png",
      "facture EDF.pdf"
    ]);
  });

  it("sorts by size", () => {
    const result = buildQueue({ sortKey: "sizeBytes", sortDirection: "asc" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual([
      "photo.jpg",
      "Releve banque.png",
      "facture EDF.pdf",
      "Taxe fonciere.pdf"
    ]);
  });

  it("sorts by extension", () => {
    const result = buildQueue({ sortKey: "extension", sortDirection: "asc" });

    expect(result.documents.map((documentItem) => documentItem.extension)).toEqual([
      ".jpg",
      ".pdf",
      ".pdf",
      ".png"
    ]);
  });

  it("sorts by status and keeps stable order inside equal groups", () => {
    const result = buildQueue({ sortKey: "status", sortDirection: "asc" });

    expect(result.documents.map((documentItem) => documentItem.name)).toEqual([
      "photo.jpg",
      "facture EDF.pdf",
      "Taxe fonciere.pdf",
      "Releve banque.png"
    ]);
  });

  it("reports when the active document remains visible", () => {
    const result = buildQueue({
      filter: "pdf",
      activeDocumentPath: "C:\\source\\Taxe fonciere.pdf"
    });

    expect(result.activeDocumentVisible).toBe(true);
    expect(result.firstVisibleDocumentPath).toBe("C:\\source\\facture EDF.pdf");
  });

  it("reports when the active document is hidden by the visible queue", () => {
    const result = buildQueue({
      filter: "pdf",
      activeDocumentPath: "C:\\source\\Releve banque.png"
    });

    expect(result.activeDocumentVisible).toBe(false);
    expect(result.firstVisibleDocumentPath).toBe("C:\\source\\facture EDF.pdf");
  });

  it("navigates to previous and next documents in the visible list", () => {
    const result = buildQueue({ sortKey: "name", sortDirection: "asc" });

    expect(
      queueView.findAdjacentVisibleDocumentPath(
        result.documents,
        "C:\\source\\photo.jpg",
        "previous"
      )
    ).toBe("C:\\source\\facture EDF.pdf");
    expect(
      queueView.findAdjacentVisibleDocumentPath(result.documents, "C:\\source\\photo.jpg", "next")
    ).toBe("C:\\source\\Releve banque.png");
  });

  it("navigates to the first visible document when the active document is hidden", () => {
    const result = buildQueue({ filter: "pdf" });

    expect(
      queueView.findAdjacentVisibleDocumentPath(
        result.documents,
        "C:\\source\\Releve banque.png",
        "next"
      )
    ).toBe("C:\\source\\facture EDF.pdf");
  });
});

function buildQueue(
  overrides: Partial<QueueViewOptions> = {}
): QueueViewResult<TestDocument> {
  return queueView.buildVisibleQueue(testDocuments, {
    query: "",
    filter: "all",
    sortKey: "name",
    sortDirection: "asc",
    duplicateFilePaths: [],
    activeDocumentPath: null,
    ...overrides
  });
}

interface TestDocument extends QueueViewDocument {}

const testDocuments: TestDocument[] = [
  {
    name: "facture EDF.pdf",
    filePath: "C:\\source\\facture EDF.pdf",
    extension: ".pdf",
    sizeBytes: 3000,
    sizeLabel: "3 Ko",
    modifiedAt: "2026-01-01T10:00:00.000Z",
    status: "pending"
  },
  {
    name: "Taxe fonciere.pdf",
    filePath: "C:\\source\\Taxe fonciere.pdf",
    extension: ".pdf",
    sizeBytes: 5000,
    sizeLabel: "5 Ko",
    modifiedAt: "2026-01-03T10:00:00.000Z",
    status: "pending"
  },
  {
    name: "Releve banque.png",
    filePath: "C:\\source\\Releve banque.png",
    extension: ".png",
    sizeBytes: 2000,
    sizeLabel: "2 Ko",
    modifiedAt: "2026-01-02T10:00:00.000Z",
    status: "pending"
  },
  {
    name: "photo.jpg",
    filePath: "C:\\source\\photo.jpg",
    extension: ".jpg",
    sizeBytes: 1000,
    sizeLabel: "1 Ko",
    modifiedAt: "2026-01-04T10:00:00.000Z",
    status: "missing"
  }
];
