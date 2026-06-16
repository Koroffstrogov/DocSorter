import "./defaultNamingSuggestionRules";
import "./namingSuggestionRulesCatalog";
import "./namingSuggestions";

import { describe, expect, it } from "vitest";

const suggestions = globalThis.DocSorterNamingSuggestions;
const catalogs = globalThis.DocSorterNamingSuggestionRulesCatalog;

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

  it("keeps working with the default external rules catalog", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "document.pdf",
      extractedText: "Facture du 05/03/2024 Renault Captur montant TTC"
    });

    expect(result.documentType?.value).toBe("facture");
    expect(result.subject?.value).toBe("Renault-Captur");
  });

  it("suggests the default Renault Captur target folder from rules", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "facture-renault-captur.pdf",
      extractedText: "Facture entretien Renault Captur"
    });

    expect(result.targetFolder?.value).toBe("Vehicules/Renault-Captur/Entretien");
    expect(result.targetFolder?.confidence).toBeGreaterThan(0.8);
    expect(result.reasons.some((reason) => reason.includes("Dossier Renault Captur"))).toBe(true);
  });

  it("suggests the default Scenic target folder from rules", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "scan.pdf",
      extractedText: "Facture garage Scenic"
    });

    expect(result.targetFolder?.value).toBe("Vehicules/Scenic/Entretien");
  });

  it("normalizes safe relative target folder rule output", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "garage.pdf",
      extractedText: "Facture garage",
      rulesCatalog: createCatalog({
        subjectRules: [
          createRule({
            id: "target-folder-garage",
            label: "Dossier garage",
            match: {
              allOf: ["facture", "garage"]
            },
            output: {
              targetFolder: " Vehicules\\Garage / Entretien "
            },
            confidence: 75
          })
        ]
      })
    });

    expect(result.targetFolder?.value).toBe("Vehicules/Garage/Entretien");
  });

  it("ignores unsafe target folder rule output", () => {
    const unsafeCatalog = createCatalog({
      subjectRules: [
        createRule({
          id: "target-folder-unsafe",
          label: "Dossier unsafe",
          match: {
            anyOf: ["facture"]
          },
          output: {
            targetFolder: "../Outside"
          },
          confidence: 95
        }),
        createRule({
          id: "target-folder-too-deep",
          label: "Dossier trop profond",
          match: {
            anyOf: ["facture"]
          },
          output: {
            targetFolder: "A/B/C/D"
          },
          confidence: 90
        })
      ]
    });

    const result = suggestions.buildNamingSuggestions({
      filename: "facture.pdf",
      extractedText: "Facture",
      rulesCatalog: unsafeCatalog
    });

    expect(result.targetFolder).toBeNull();
  });

  it("accepts an injected rules catalog", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "garage.pdf",
      extractedText: "Facture entretien garage vidange",
      rulesCatalog: createCatalog({
        documentTypeRules: [
          createRule({
            id: "type-facture-entretien",
            label: "Type facture entretien",
            match: {
              allOf: ["facture"],
              anyOf: ["entretien", "garage"]
            },
            output: {
              documentType: "facture-entretien",
              keywords: ["entretien"]
            },
            confidence: 90
          })
        ]
      })
    });

    expect(result.documentType?.value).toBe("facture-entretien");
    expect(result.keywords.map((keyword) => keyword.value)).toContain("entretien");
  });

  it("requires all allOf terms", () => {
    const catalog = createCatalog({
      documentTypeRules: [
        createRule({
          id: "type-garage-facture",
          label: "Type facture garage",
          match: {
            allOf: ["facture", "garage"]
          },
          output: {
            documentType: "facture-garage"
          },
          confidence: 80
        })
      ]
    });

    expect(
      suggestions.buildNamingSuggestions({
        filename: "document.pdf",
        extractedText: "Facture sans autre signal",
        rulesCatalog: catalog
      }).documentType
    ).toBeNull();
    expect(
      suggestions.buildNamingSuggestions({
        filename: "document.pdf",
        extractedText: "Facture garage",
        rulesCatalog: catalog
      }).documentType?.value
    ).toBe("facture-garage");
  });

  it("matches anyOf terms", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "document.pdf",
      extractedText: "Loyer mensuel",
      rulesCatalog: createCatalog({
        documentTypeRules: [
          createRule({
            id: "type-quittance-loyer",
            label: "Type quittance loyer",
            match: {
              anyOf: ["quittance", "loyer"]
            },
            output: {
              documentType: "quittance"
            },
            confidence: 80
          })
        ]
      })
    });

    expect(result.documentType?.value).toBe("quittance");
  });

  it("excludes noneOf terms", () => {
    const catalog = createCatalog({
      documentTypeRules: [
        createRule({
          id: "type-facture-sans-devis",
          label: "Type facture sans devis",
          match: {
            anyOf: ["facture"],
            noneOf: ["devis"]
          },
          output: {
            documentType: "facture"
          },
          confidence: 80
        })
      ]
    });

    expect(
      suggestions.buildNamingSuggestions({
        filename: "document.pdf",
        extractedText: "Facture et devis",
        rulesCatalog: catalog
      }).documentType
    ).toBeNull();
  });

  it("ignores accents and case while matching rules", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "document.pdf",
      extractedText: "CERTIFICAT DE SCOLARITÉ",
      rulesCatalog: createCatalog({
        subjectRules: [
          createRule({
            id: "subject-ecole-test",
            label: "Sujet ecole test",
            match: {
              anyOf: ["certificat de scolarite"]
            },
            output: {
              subject: "Ecole"
            },
            confidence: 74
          })
        ]
      })
    });

    expect(result.subject?.value).toBe("Ecole");
  });

  it("lets several rules contribute without duplicating keywords", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "document.pdf",
      extractedText: "Facture entretien garage",
      rulesCatalog: createCatalog({
        documentTypeRules: [
          createRule({
            id: "type-facture-entretien",
            label: "Type facture entretien",
            match: {
              allOf: ["facture", "entretien"]
            },
            output: {
              documentType: "facture-entretien",
              keywords: ["entretien"]
            },
            confidence: 90
          })
        ],
        subjectRules: [
          createRule({
            id: "subject-garage",
            label: "Sujet garage",
            match: {
              anyOf: ["garage"]
            },
            output: {
              subject: "Garage",
              keywords: ["entretien"]
            },
            confidence: 70
          })
        ],
        keywordRules: [
          {
            value: "entretien",
            aliases: ["entretien"],
            confidence: 60
          }
        ]
      })
    });

    expect(result.documentType?.value).toBe("facture-entretien");
    expect(result.subject?.value).toBe("Garage");
    expect(result.keywords.map((keyword) => keyword.value)).toEqual(["entretien"]);
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
    expect(result.targetFolder).toBeNull();
    expect(result.keywords).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("does not crash with an empty catalog", () => {
    const result = suggestions.buildNamingSuggestions({
      filename: "scan.pdf",
      extractedText: "",
      rulesCatalog: createCatalog()
    });

    expect(result.documentType).toBeNull();
    expect(result.keywords).toEqual([]);
  });

  it("refuses an invalid catalog through validation", () => {
    const validation = catalogs.validateNamingSuggestionRulesCatalog({
      version: 1,
      documentTypeRules: [
        {
          id: "",
          label: "Invalid",
          match: {},
          output: {},
          confidence: 120
        }
      ],
      subjectRules: [],
      keywordRules: [],
      stopWords: []
    });

    expect(validation.isValid).toBe(false);
    expect(validation.catalog).toBeNull();
  });

  it("merges default and future user catalogs without duplicating rule ids", () => {
    const base = createCatalog({
      documentTypeRules: [
        createRule({
          id: "type-facture",
          label: "Type facture",
          match: {
            anyOf: ["facture"]
          },
          output: {
            documentType: "facture"
          },
          confidence: 80
        })
      ],
      stopWords: ["scan"]
    });
    const user = createCatalog({
      documentTypeRules: [
        createRule({
          id: "type-facture",
          label: "Type facture utilisateur",
          match: {
            allOf: ["facture", "entretien"]
          },
          output: {
            documentType: "facture-entretien"
          },
          confidence: 90
        })
      ],
      stopWords: ["document"]
    });

    const merged = catalogs.mergeNamingSuggestionRulesCatalogs(base, user);

    expect(merged.documentTypeRules).toHaveLength(1);
    expect(merged.documentTypeRules[0].output.documentType).toBe("facture-entretien");
    expect(merged.stopWords).toEqual(["scan", "document"]);
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
        targetFolder: null,
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

  it("applies AI-shaped suggestions without replacing existing values", () => {
    const result = suggestions.applySuggestionsToEmptyFields(
      {
        documentDate: "2024-01-01",
        subject: "",
        documentType: "courrier",
        keywords: ""
      },
      {
        date: {
          value: "2024-03-05",
          confidence: 0.72,
          reason: "Date proposée par l'IA locale.",
          source: "text"
        },
        subject: {
          value: "Assurance-Habitation",
          confidence: 0.72,
          reason: "Sujet proposé par l'IA locale.",
          source: "text"
        },
        documentType: {
          value: "attestation",
          confidence: 0.72,
          reason: "Type proposé par l'IA locale.",
          source: "text"
        },
        keywords: [
          {
            value: "habitation",
            confidence: 0.72,
            reason: "Mot-clé proposé par l'IA locale.",
            source: "text"
          }
        ],
        targetFolder: {
          value: "Assurances/Habitation",
          confidence: 0.72,
          reason: "Dossier proposé par l'IA locale.",
          source: "text"
        },
        confidence: 0.72,
        reasons: ["Suggestion IA locale validée."]
      }
    );

    expect(result.draft).toEqual({
      documentDate: "2024-01-01",
      subject: "Assurance-Habitation",
      documentType: "courrier",
      keywords: "habitation"
    });
    expect(result.appliedFields).toEqual(["subject", "keywords"]);
    expect(result.skippedFields).toEqual(["documentDate", "documentType"]);
  });
});

function createCatalog(
  overrides: Partial<NamingSuggestionRulesCatalog> = {}
): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: ["scan", "document"],
    ...overrides
  };
}

function createRule(rule: NamingSuggestionRule): NamingSuggestionRule {
  return rule;
}
