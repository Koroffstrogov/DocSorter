import { describe, expect, it } from "vitest";

import { dedupeNamingInputV2Semantic } from "./semanticNameDeduper";

describe("dedupeNamingInputV2Semantic", () => {
  it("removes document type terms already repeated in detail", () => {
    const result = dedupeNamingInputV2Semantic({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      detail: "entretien-vidange",
      extension: ".pdf"
    });

    expect(result.changed).toBe(true);
    expect(result.input.detail).toBe("vidange");
    expect(result.removedTerms).toContain("entretien");
  });

  it("removes target and issuer terms from later optional blocks", () => {
    const result = dedupeNamingInputV2Semantic({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault-captur",
      detail: "renault-captur-entretien-vidange",
      extension: ".pdf"
    });

    expect(result.input.issuer).toBe("renault");
    expect(result.input.detail).toBe("vidange");
    expect(result.removedTerms).toEqual(["captur", "renault", "entretien"]);
  });

  it("keeps useful precision when blocks do not repeat each other", () => {
    const result = dedupeNamingInputV2Semantic({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "vidange",
      extension: ".pdf"
    });

    expect(result.changed).toBe(false);
    expect(result.input).toMatchObject({
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "vidange"
    });
  });

  it("deduplicates legacy keyword-style detail without file access", () => {
    const result = dedupeNamingInputV2Semantic({
      dateToken: "2024-03-05",
      target: "renault-captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "vidange facture entretien Renault Captur",
      extension: ".pdf"
    });

    expect(result.input.detail).toBe("vidange");
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
