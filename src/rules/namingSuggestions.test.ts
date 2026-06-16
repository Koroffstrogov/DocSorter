import "./namingSuggestions";

import { describe, expect, it } from "vitest";

const suggestions = globalThis.DocSorterNamingSuggestions;

describe("naming suggestions", () => {
  it("detects and normalizes a DD/MM/YYYY date from extracted text", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "scan.pdf",
      extractedText: "Facture emise le 05/03/2024 pour Renault Captur."
    });

    expect(result.date?.value).toBe("2024-03-05");
    expect(result.date?.source).toBe("text");
  });

  it("detects YYYY-MM-DD dates", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "2024-02-29_facture.pdf",
      extractedText: ""
    });

    expect(result.date?.value).toBe("2024-02-29");
  });

  it("rejects impossible full dates instead of falling back to their year", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "facture-31-02-2024.pdf",
      extractedText: ""
    });

    expect(result.date).toBeNull();
  });

  it("uses a year alone when no full date is available", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "avis-imposition-2023.pdf",
      extractedText: "Avis d imposition sur les revenus 2023"
    });

    expect(result.date?.value).toBe("2023");
  });

  it("lowers confidence when several dates are detected", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "facture.pdf",
      extractedText: "Facture du 05/03/2024. Paiement attendu le 12/03/2024."
    });

    expect(result.date?.value).toBe("2024-03-05");
    expect(result.date?.confidence).toBeLessThan(0.7);
    expect(result.date?.reason).toContain("Plusieurs dates");
  });

  it("prefers extracted text over filename when dates differ", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "2023-01-01_facture.pdf",
      extractedText: "Facture du 05/03/2024"
    });

    expect(result.date?.value).toBe("2024-03-05");
  });

  it("detects document types from local text rules", () => {
    expect(
      suggestions.buildNamingSuggestions({
        filename: "document.pdf",
        extractedText: "Montant TTC de la facture"
      }).documentType?.value
    ).toBe("facture");

    expect(
      suggestions.buildNamingSuggestions({
        filename: "document.pdf",
        extractedText: "Avis d imposition sur les revenus"
      }).documentType?.value
    ).toBe("avis-imposition");

    expect(
      suggestions.buildNamingSuggestions({
        filename: "document.pdf",
        extractedText: "Attestation assurance habitation"
      }).documentType?.value
    ).toBe("attestation");
  });

  it("detects known subjects", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "scan.pdf",
      extractedText: "Facture garage Renault Captur vidange"
    });

    expect(result.subject?.value).toBe("Renault-Captur");
  });

  it("falls back cautiously to the filename for the subject", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "2024-01-03_Mairie_Courrier.pdf",
      extractedText: ""
    });

    expect(result.subject?.value).toBe("Mairie");
    expect(result.subject?.confidence).toBeLessThan(0.5);
  });

  it("detects normalized keywords without duplicates and caps them at five", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "facture-energie.pdf",
      extractedText:
        "Facture energie TTC echeancier cotisation mutuelle habitation scolarite banque energie"
    });

    expect(result.keywords.map((keyword) => keyword.value)).toEqual([
      "mutuelle",
      "habitation",
      "scolarite",
      "banque",
      "energie"
    ]);
  });

  it("scores converging text and filename signals higher than a filename fallback", () => {
    const fallback = suggestions.buildNamingSuggestions({
      filename: "Mairie.pdf",
      extractedText: ""
    });
    const converging = suggestions.buildNamingSuggestions({
      filename: "2024-03-05_facture_Renault_Captur.pdf",
      extractedText: "Facture du 05/03/2024 Renault Captur montant TTC"
    });

    expect(converging.confidence).toBeGreaterThan(fallback.confidence);
  });

  it("returns no field suggestion for empty unusable input", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "scan.pdf",
      extractedText: ""
    });

    expect(result.date).toBeNull();
    expect(result.subject).toBeNull();
    expect(result.documentType).toBeNull();
    expect(result.keywords).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("applies suggestions only to empty draft fields", () => {
    const result = suggestions.applySuggestionsToEmptyFields(
      {
        documentDate: "",
        subject: "Sujet-Manuel",
        documentType: "",
        keywords: ""
      },
      {
        date: {
          value: "2024-03-05",
          confidence: 0.8,
          reason: "Date",
          source: "text"
        },
        subject: {
          value: "Renault-Captur",
          confidence: 0.8,
          reason: "Sujet",
          source: "text"
        },
        documentType: {
          value: "facture",
          confidence: 0.8,
          reason: "Type",
          source: "text"
        },
        keywords: [
          {
            value: "vidange",
            confidence: 0.6,
            reason: "Mot-cle",
            source: "text"
          }
        ],
        confidence: 0.8,
        reasons: []
      }
    );

    expect(result.draft).toEqual({
      documentDate: "2024-03-05",
      subject: "Sujet-Manuel",
      documentType: "facture",
      keywords: "vidange"
    });
    expect(result.appliedFields).toEqual(["documentDate", "documentType", "keywords"]);
    expect(result.skippedFields).toEqual(["subject"]);
  });
});
