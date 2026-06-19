import { describe, expect, it } from "vitest";

import { buildOllamaClassificationPrompt } from "./ollamaPromptBuilder";

describe("buildOllamaClassificationPrompt", () => {
  it("builds a strict JSON-only prompt for Ollama classification", () => {
    const result = buildOllamaClassificationPrompt({
      filename: "document.pdf",
      extension: ".pdf",
      extractedTextExcerpt: "Facture Renault Captur du 05/03/2024",
      knownRelativeFolders: ["Vehicules/Renault-Captur/Entretien"],
      namingConvention: "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext"
    });

    expect(result.prompt).toContain("Réponds uniquement avec un objet JSON valide");
    expect(result.prompt).toContain('"fields"');
    expect(result.prompt).toContain('"dateToken"');
    expect(result.prompt).toContain('"subject"');
    expect(result.prompt).toContain('"target"');
    expect(result.prompt).toContain('"targetKind"');
    expect(result.prompt).toContain('"issuer"');
    expect(result.prompt).toContain('"detail"');
    expect(result.prompt).toContain('"folderCandidates"');
    expect(result.prompt).toContain('"fileNameCandidates"');
    expect(result.prompt).toContain('"exists"');
    expect(result.prompt).toContain('"requiresCreation"');
    expect(result.prompt).toContain('"source": "ollama"');
    expect(result.prompt).toContain("jusqu'à 3 candidats par champ");
    expect(result.prompt).toContain("folderCandidates doit contenir des dossiers relatifs candidats");
    expect(result.prompt).toContain("AAAA-MM-JJ ou AAAA");
    expect(result.prompt).toContain("AAAA-MM-01");
    expect(result.prompt).toContain("n'utilise pas date-inconnue");
    expect(result.prompt).toContain("champ Sujet de Renommage proposé");
    expect(result.prompt).toContain("target est la valeur de nommage");
    expect(result.prompt).toContain("targetKind décrit seulement la nature optionnelle");
    expect(result.prompt).toContain("person, household, vehicle, property ou other");
    expect(result.prompt).toContain("knownRelativeFolders");
    expect(result.prompt).toContain("subject ne doit pas répéter le type documentaire");
    expect(result.prompt).toContain("n'utilise jamais DocSorter");
    expect(result.prompt).toContain("date d'effet est prioritaire");
    expect(result.prompt).toContain("date de prise d'effet");
    expect(result.prompt).toContain("Pour avis-imposition, target doit être foyer");
    expect(result.prompt).toContain("Pour scolarité 2026/2027, dateToken doit être 2026");
    expect(result.prompt).toContain("date d'émission/délivrance est prioritaire");
    expect(result.prompt).toContain("date de naissance est exclue");
    expect(result.prompt).toContain("CNI ou Identité");
    expect(result.format).toMatchObject({
      type: "object",
      required: ["fields", "folderCandidates", "fileNameCandidates", "warnings", "confidence", "source"]
    });
    expect(result.format).toMatchObject({
      properties: {
        folderCandidates: {
          maxItems: 3
        }
      }
    });
    expect(result.prompt).not.toContain("currentSuggestionV2");
    expect(result.prompt).not.toContain('"keywords"');
    expect(result.input.extractedTextExcerpt).toBe("Facture Renault Captur du 05/03/2024");
  });

  it("bounds document text at 6000 characters before prompt construction", () => {
    const result = buildOllamaClassificationPrompt({
      filename: "document.pdf",
      extension: ".pdf",
      extractedTextExcerpt: "x".repeat(7_000),
      ocrTextExcerpt: "y".repeat(7_000)
    });

    expect(result.input.extractedTextExcerpt).toHaveLength(6_000);
    expect(result.input.ocrTextExcerpt).toHaveLength(6_000);
    expect(result.prompt).not.toContain("x".repeat(6_001));
  });

  it("does not include full local paths from filename or text excerpts", () => {
    const result = buildOllamaClassificationPrompt({
      filename: "C:\\Users\\Seb\\Documents\\secret.pdf",
      extension: ".pdf",
      extractedTextExcerpt:
        "Document exporté depuis C:\\Users\\Seb\\Documents\\secret.pdf et file://C:/private/doc.pdf",
      ocrTextExcerpt: "\\\\nas\\partage\\secret.png"
    });

    expect(result.input.filename).toBe("secret.pdf");
    expect(result.prompt).not.toContain("C:\\Users\\Seb");
    expect(result.prompt).not.toContain("\\\\nas\\partage");
    expect(result.prompt).not.toContain("file://C:/private");
    expect(result.prompt).toContain("[chemin-local]");
  });
});
