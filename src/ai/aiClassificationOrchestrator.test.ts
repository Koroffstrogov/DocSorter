import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildAiClassificationSuggestion } from "./aiClassificationOrchestrator";
import { simulatedAiClassificationProvider } from "./simulatedAiClassificationProvider";
import type { AiClassificationInput } from "./aiClassificationTypes";

const temporaryRoots: string[] = [];

describe("buildAiClassificationSuggestion", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map(async (root) => {
        await rm(root, { recursive: true, force: true });
      })
    );
    temporaryRoots.length = 0;
  });

  it("returns a ready result for a valid provider output", async () => {
    const result = await buildAiClassificationSuggestion(createInput(), () => ({
      date: "2026",
      documentType: "facture",
      subject: "Sujet test",
      keywords: ["test"],
      targetFolder: "Maison/Assurance",
      confidence: 60,
      reasons: ["Sortie de test."],
      warnings: [],
      source: "simulated-ai"
    }));

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.suggestion.subject).toBe("Sujet-test");
  });

  it("returns an invalid result for invalid provider output", async () => {
    const result = await buildAiClassificationSuggestion(createInput(), () => "invalid-json");

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_OUTPUT_NOT_OBJECT");
  });

  it("maps provider failures to an invalid result", async () => {
    const result = await buildAiClassificationSuggestion(createInput(), () => {
      throw new Error("provider unavailable");
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_PROVIDER_FAILED");
  });

  it("passes only bounded input to the provider", async () => {
    let seenTextLength = 0;
    const result = await buildAiClassificationSuggestion(
      {
        ...createInput(),
        extractedTextExcerpt: "x".repeat(8_000)
      },
      (input) => {
        seenTextLength = input.extractedTextExcerpt.length;
        return {
          confidence: 10,
          keywords: [],
          reasons: ["Test."],
          warnings: [],
          source: "simulated-ai"
        };
      }
    );

    expect(result.status).toBe("ready");
    expect(seenTextLength).toBe(6_000);
  });

  it("does not mutate files while building a suggestion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "docsorter-ai-"));
    temporaryRoots.push(root);
    const directory = path.join(root, "docs");
    const filePath = path.join(directory, "document.txt");
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, "contenu sensible", "utf8");

    const result = await buildAiClassificationSuggestion(createInput(), simulatedAiClassificationProvider);

    expect(result.status).toBe("ready");
    expect(await readFile(filePath, "utf8")).toBe("contenu sensible");
  });
});

describe("simulatedAiClassificationProvider scenarios", () => {
  it("detects Renault Captur maintenance invoices", async () => {
    const result = await buildAiClassificationSuggestion(
      createInput({
        filename: "2026-03-10_facture_renault_captur.pdf",
        extractedTextExcerpt: "Facture garage Renault Captur entretien vidange"
      }),
      simulatedAiClassificationProvider
    );

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.suggestion).toMatchObject({
      date: "2026-03-10",
      documentType: "facture-entretien",
      subject: "Renault-Captur",
      targetFolder: "Vehicules/Renault-Captur/Entretien",
      source: "simulated-ai"
    });
  });

  it("detects avis d'imposition and uses the detected year", async () => {
    const result = await buildAiClassificationSuggestion(
      createInput({
        filename: "avis-imposition-2025.pdf",
        extractedTextExcerpt: "Avis d'imposition revenus 2025"
      }),
      simulatedAiClassificationProvider
    );

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.suggestion).toMatchObject({
      date: "2025",
      documentType: "avis-imposition",
      subject: "Impots",
      targetFolder: "Impots/2025"
    });
  });

  it("detects assurance habitation", async () => {
    const result = await buildAiClassificationSuggestion(
      createInput({
        filename: "contrat_assurance.pdf",
        extractedTextExcerpt: "Attestation assurance habitation appartement"
      }),
      simulatedAiClassificationProvider
    );

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.suggestion).toMatchObject({
      documentType: "assurance-habitation",
      subject: "Maison",
      targetFolder: "Maison/Assurance"
    });
  });

  it("detects certificat de scolarite", async () => {
    const result = await buildAiClassificationSuggestion(
      createInput({
        filename: "certificat.pdf",
        extractedTextExcerpt: "Certificat de scolarite annee scolaire"
      }),
      simulatedAiClassificationProvider
    );

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.suggestion).toMatchObject({
      documentType: "certificat-scolarite",
      subject: "Enfants-Ecole",
      targetFolder: "Enfants/Ecole"
    });
  });

  it("returns a weak suggestion for unknown documents", async () => {
    const result = await buildAiClassificationSuggestion(
      createInput({
        filename: "scan.png",
        ocrTextExcerpt: "Texte sans signal connu"
      }),
      simulatedAiClassificationProvider
    );

    expect(result.status).toBe("ready");
    expect(result.status === "ready" && result.suggestion.confidence).toBeLessThan(30);
    expect(result.status === "ready" && result.suggestion.keywords).toEqual([]);
  });
});

function createInput(overrides: Partial<AiClassificationInput> = {}): AiClassificationInput {
  return {
    filename: "document.pdf",
    extension: ".pdf",
    extractedTextExcerpt: "",
    ocrTextExcerpt: "",
    currentRuleSuggestions: null,
    availableRootFolders: ["Maison", "Vehicules", "Impots", "Enfants"],
    knownRelativeFolders: [
      "Maison/Assurance",
      "Vehicules/Renault-Captur/Entretien",
      "Impots/2025",
      "Enfants/Ecole"
    ],
    namingConvention: "AAAA-MM-JJ_Sujet_Type_MotsCles.ext",
    ...overrides
  };
}
