import { describe, expect, it } from "vitest";

import { buildRenameDraft, isRenameDraftInput, normalizeSegment } from "./renameDraft";

describe("buildRenameDraft", () => {
  it("builds a safe Windows file name from document metadata", () => {
    const draft = buildRenameDraft({
      originalName: "scan.pdf",
      documentDate: "2026-06-15",
      category: "Banque",
      title: "Releve / compte courant"
    });

    expect(draft.proposedName).toBe("2026-06-15 - Banque - Releve compte courant.pdf");
    expect(draft.changed).toBe(true);
    expect(draft.warnings).toEqual([]);
  });

  it("keeps the original base name when the title is missing", () => {
    const draft = buildRenameDraft({
      originalName: "facture-orange.pdf",
      documentDate: "2026-06-15"
    });

    expect(draft.proposedName).toBe("2026-06-15 - facture-orange.pdf");
    expect(draft.warnings).toContain("Title missing: original base name kept.");
  });

  it("ignores invalid dates instead of guessing", () => {
    const draft = buildRenameDraft({
      originalName: "doc.pdf",
      documentDate: "2026-02-31",
      title: "Assurance"
    });

    expect(draft.proposedName).toBe("Assurance.pdf");
    expect(draft.warnings).toContain("Date ignored: expected YYYY-MM-DD.");
  });

  it("does not preserve path components from the original name", () => {
    const draft = buildRenameDraft({
      originalName: "Z:\\NAS\\Perso\\scan.pdf",
      title: "Impots"
    });

    expect(draft.originalName).toBe("scan.pdf");
    expect(draft.proposedName).toBe("Impots.pdf");
  });
});

describe("normalizeSegment", () => {
  it("removes characters forbidden by Windows file names", () => {
    expect(normalizeSegment('Contrat: EDF <2026> "A"')).toBe("Contrat EDF 2026 A");
  });

  it("avoids reserved Windows device names", () => {
    expect(normalizeSegment("CON")).toBe("CON document");
  });
});

describe("isRenameDraftInput", () => {
  it("accepts the minimal valid payload", () => {
    expect(isRenameDraftInput({ originalName: "doc.pdf" })).toBe(true);
  });

  it("rejects unexpected payload types", () => {
    expect(isRenameDraftInput({ originalName: 12 })).toBe(false);
    expect(isRenameDraftInput(null)).toBe(false);
  });
});
