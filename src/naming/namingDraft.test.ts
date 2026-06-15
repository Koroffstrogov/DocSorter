import { describe, expect, it } from "vitest";

import {
  buildProposedFilename,
  createInitialNamingDraft,
  detectDocumentDateFromFilename,
  normalizeFilenameBlock,
  resolveFilenameCollision,
  sanitizeWindowsFilename,
  validateNamingDraft
} from "./namingDraft";

describe("normalizeFilenameBlock", () => {
  it("converts accents and spaces to safe hyphenated blocks", () => {
    expect(normalizeFilenameBlock("Électricité générale été")).toBe("Electricite-generale-ete");
  });

  it("removes Windows forbidden characters", () => {
    expect(normalizeFilenameBlock('Contrat: EDF <2026> "A"')).toBe("Contrat-EDF-2026-A");
  });

  it("collapses repeated separators", () => {
    expect(normalizeFilenameBlock("facture___orange -- mobile")).toBe("facture-orange-mobile");
  });
});

describe("sanitizeWindowsFilename", () => {
  it("keeps a readable string while removing invalid characters", () => {
    expect(sanitizeWindowsFilename('Facture / Orange: "Mobile"')).toBe("Facture Orange Mobile");
  });
});

describe("buildProposedFilename", () => {
  it("builds the normalized filename convention with underscores between blocks", () => {
    const proposal = buildProposedFilename(
      {
        documentDate: "2026-06-15",
        subject: "Relevé de compte",
        documentType: "Banque",
        keywords: "Compte courant"
      },
      ".PDF"
    );

    expect(proposal.proposedFilename).toBe("2026-06-15_Releve-de-compte_Banque_Compte-courant.pdf");
    expect(proposal.isValid).toBe(true);
  });

  it("accepts a year-only document date", () => {
    const proposal = buildProposedFilename(
      {
        documentDate: "2026",
        subject: "Impots",
        documentType: "Avis",
        keywords: ""
      },
      ".pdf"
    );

    expect(proposal.proposedFilename).toBe("2026_Impots_Avis.pdf");
    expect(proposal.isValid).toBe(true);
  });

  it("rejects ambiguous dates", () => {
    const validation = validateNamingDraft({
      documentDate: "15/06/2026",
      subject: "Facture",
      documentType: "Energie",
      keywords: ""
    });

    expect(validation.isValid).toBe(false);
    expect(validation.messages.map((message) => message.code)).toContain("DATE_INVALID");
  });

  it("requires a subject", () => {
    const proposal = buildProposedFilename(
      {
        documentDate: "2026",
        subject: " ",
        documentType: "Avis",
        keywords: ""
      },
      ".pdf"
    );

    expect(proposal.isValid).toBe(false);
    expect(proposal.proposedFilename).toBe("");
    expect(proposal.messages.map((message) => message.code)).toContain("SUBJECT_REQUIRED");
  });

  it("keeps keywords optional", () => {
    const proposal = buildProposedFilename(
      {
        documentDate: "2026-06-15",
        subject: "Facture",
        documentType: "Energie",
        keywords: ""
      },
      "PNG"
    );

    expect(proposal.proposedFilename).toBe("2026-06-15_Facture_Energie.png");
  });

  it("keeps the final filename under the maximum length", () => {
    const proposal = buildProposedFilename(
      {
        documentDate: "2026-06-15",
        subject: "a".repeat(220),
        documentType: "Type",
        keywords: "Mots"
      },
      ".pdf"
    );

    expect(proposal.proposedFilename.length).toBeLessThanOrEqual(180);
    expect(proposal.messages.map((message) => message.code)).toContain("TRUNCATED");
  });
});

describe("date detection", () => {
  it("detects complete dates from the existing file name", () => {
    expect(detectDocumentDateFromFilename("2026-06-15_facture.pdf")).toBe("2026-06-15");
  });

  it("detects a year from the existing file name", () => {
    expect(detectDocumentDateFromFilename("impots_2026.pdf")).toBe("2026");
  });

  it("does not accept ambiguous dates from the existing file name", () => {
    expect(detectDocumentDateFromFilename("15-06-2026_facture.pdf")).toBeNull();
  });

  it("initializes a draft from the current filename only", () => {
    expect(createInitialNamingDraft("2026-06-15_facture_edf.pdf")).toEqual({
      documentDate: "2026-06-15",
      subject: "facture-edf",
      documentType: "",
      keywords: ""
    });
  });
});

describe("resolveFilenameCollision", () => {
  it("returns the original name when no collision exists", () => {
    expect(resolveFilenameCollision("nom.pdf", ["autre.pdf"])).toBe("nom.pdf");
  });

  it("adds the next numeric suffix for collisions", () => {
    expect(resolveFilenameCollision("nom.pdf", ["nom.pdf", "nom_2.pdf"])).toBe("nom_3.pdf");
  });
});
