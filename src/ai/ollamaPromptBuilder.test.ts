import { describe, expect, it } from "vitest";

import { buildOllamaClassificationPrompt } from "./ollamaPromptBuilder";

describe("buildOllamaClassificationPrompt", () => {
  it("builds a strict JSON-only prompt for Ollama classification", () => {
    const result = buildOllamaClassificationPrompt({
      filename: "document.pdf",
      extension: ".pdf",
      extractedTextExcerpt: "Facture Renault Captur du 05/03/2024",
      currentSuggestionV2: {
        documentType: "facture-entretien",
        target: "captur",
        issuer: "renault",
        detail: "vidange",
        targetFolder: "Vehicules/Renault-Captur/Entretien"
      },
      knownRelativeFolders: ["Vehicules/Renault-Captur/Entretien"],
      namingConvention: "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext"
    });

    expect(result.prompt).toContain("Réponds uniquement avec un objet JSON valide");
    expect(result.prompt).toContain('"dateToken"');
    expect(result.prompt).toContain('"target"');
    expect(result.prompt).toContain('"issuer"');
    expect(result.prompt).toContain('"detail"');
    expect(result.prompt).toContain('"source": "ollama"');
    expect(result.prompt).toContain("targetFolder doit être relatif");
    expect(result.prompt).not.toContain('"subject"');
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
