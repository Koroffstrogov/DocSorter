import { describe, expect, it } from "vitest";

import {
  boundAiClassificationInput,
  validateAiClassificationSuggestion
} from "./aiClassificationValidator";

describe("validateAiClassificationSuggestion", () => {
  it("accepts and normalizes a valid V2 AI output", () => {
    const result = validateAiClassificationSuggestion({
      dateToken: "2026-06-16",
      subject: "Renault Captur",
      target: "Renault Captur",
      documentType: "Facture entretien",
      issuer: "Renault",
      detail: "contrôle technique",
      proposedName: "2026-06-16_renault-captur_facture-entretien_renault_controle-technique.pdf",
      targetFolder: "Vehicules\\Renault-Captur / Entretien",
      confidence: 82,
      reasons: ["Facture detectee."],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result).toEqual({
      status: "valid",
      suggestion: {
        dateToken: "2026-06-16",
        subject: "renault-captur",
        target: "renault-captur",
        documentType: "facture-entretien",
        issuer: "renault",
        detail: "controle-technique",
        proposedName: "2026-06-16_renault-captur_facture-entretien_renault_controle-technique.pdf",
        targetFolder: "Vehicules/Renault-Captur/Entretien",
        confidence: 82,
        reasons: ["Facture detectee."],
        warnings: [],
        source: "simulated-ai"
      }
    });
  });

  it("rejects non-object JSON outputs", () => {
    const result = validateAiClassificationSuggestion(["not", "object"]);

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_OUTPUT_NOT_OBJECT");
  });

  it("accepts controlled Ollama outputs", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 70,
      reasons: ["Analyse locale Ollama."],
      warnings: [],
      source: "ollama"
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.suggestion.source).toBe("ollama");
  });

  it("rejects old output fields", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 50,
      keywords: [],
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_OUTPUT_UNKNOWN_FIELD");
  });

  it("rejects confidence outside 0..100", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 150,
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_CONFIDENCE_INVALID");
  });

  it("rejects invalid date tokens", () => {
    const result = validateAiClassificationSuggestion({
      dateToken: "2026-02-31",
      confidence: 50,
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_DATE_INVALID");
  });

  it("accepts monthly AI date tokens without first day conversion", () => {
    const result = validateAiClassificationSuggestion({
      dateToken: "2026-05",
      confidence: 50,
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result).toMatchObject({
      status: "valid",
      suggestion: {
        dateToken: "2026-05"
      }
    });
  });

  it("accepts school-year AI date tokens", () => {
    const result = validateAiClassificationSuggestion({
      dateToken: "2026/2027",
      confidence: 50,
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result).toMatchObject({
      status: "valid",
      suggestion: {
        dateToken: "2026-2027"
      }
    });
  });

  it("rejects legacy V2 fallback date tokens from AI output", () => {
    for (const dateToken of ["date-inconnue", "2026-env"]) {
      const result = validateAiClassificationSuggestion({
        dateToken,
        confidence: 50,
        reasons: [],
        warnings: [],
        source: "simulated-ai"
      });

      expect(result.status).toBe("invalid");
      expect(result.status === "invalid" && result.error.code).toBe("AI_DATE_INVALID");
    }
  });

  it("rejects absolute or traversal target folders", () => {
    expect(
      validateAiClassificationSuggestion({
        targetFolder: "C:\\Users\\Seb",
        confidence: 50,
        reasons: [],
        warnings: [],
        source: "simulated-ai"
      })
    ).toMatchObject({
      status: "invalid",
      error: {
        code: "AI_TARGET_FOLDER_INVALID"
      }
    });

    expect(
      validateAiClassificationSuggestion({
        targetFolder: "Maison/../Secret",
        confidence: 50,
        reasons: [],
        warnings: [],
        source: "simulated-ai"
      })
    ).toMatchObject({
      status: "invalid",
      error: {
        code: "AI_TARGET_FOLDER_INVALID"
      }
    });
  });

  it("bounds reasons and warnings", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 50,
      reasons: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"],
      warnings: ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8", "w9"],
      source: "simulated-ai"
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.suggestion.reasons).toHaveLength(8);
    expect(result.status === "valid" && result.suggestion.warnings).toHaveLength(8);
  });
});

describe("boundAiClassificationInput", () => {
  it("bounds text input and filters dangerous folders", () => {
    const bounded = boundAiClassificationInput({
      filename: "x".repeat(220),
      extension: "PDF",
      extractedTextExcerpt: "a".repeat(6_000),
      ocrTextExcerpt: "b".repeat(6_000),
      knownRelativeFolders: ["Maison/Assurance", "C:\\Secret", "A/B/C/D", "Vehicules/../X"],
      availableRootFolders: ["Maison", "Vehicules/Renault", "C:\\Secret"],
      knownTargetHints: [
        {
          fileAlias: "paul",
          displayName: "C:\\Users\\Seb\\Paul",
          kind: "person",
          matchedAliases: Array.from({ length: 6 }, (_, index) => `Alias ${index}`),
          evidenceSources: ["text", "unknown" as never]
        }
      ],
      namingConvention: "n".repeat(600)
    });

    expect(bounded.filename).toHaveLength(180);
    expect(bounded.extension).toBe(".pdf");
    expect(bounded.extractedTextExcerpt).toHaveLength(6_000);
    expect(bounded.ocrTextExcerpt).toHaveLength(6_000);
    expect(bounded.knownRelativeFolders).toEqual(["Maison/Assurance"]);
    expect(bounded.availableRootFolders).toEqual(["Maison"]);
    expect(bounded.knownTargetHints).toEqual([
      {
        fileAlias: "paul",
        displayName: "[chemin-local]",
        kind: "person",
        matchedAliases: ["Alias 0", "Alias 1", "Alias 2", "Alias 3", "Alias 4"],
        evidenceSources: ["text"]
      }
    ]);
    expect(bounded.namingConvention).toHaveLength(500);
  });
});
