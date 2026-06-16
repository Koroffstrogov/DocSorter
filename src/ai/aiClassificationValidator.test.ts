import { describe, expect, it } from "vitest";

import {
  boundAiClassificationInput,
  validateAiClassificationSuggestion
} from "./aiClassificationValidator";

describe("validateAiClassificationSuggestion", () => {
  it("accepts and normalizes a valid simulated AI output", () => {
    const result = validateAiClassificationSuggestion({
      date: "2026-06-16",
      documentType: "Facture entretien",
      subject: "Renault Captur",
      keywords: ["vidange", "contrôle"],
      targetFolder: "Vehicules\\Renault-Captur / Entretien",
      confidence: 82,
      reasons: ["Facture detectee."],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result).toEqual({
      status: "valid",
      suggestion: {
        date: "2026-06-16",
        documentType: "Facture-entretien",
        subject: "Renault-Captur",
        keywords: ["vidange", "controle"],
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

  it("rejects unknown output fields", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 50,
      keywords: [],
      reasons: [],
      warnings: [],
      source: "simulated-ai",
      windowsPath: "C:\\Users\\Seb\\Documents"
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_OUTPUT_UNKNOWN_FIELD");
  });

  it("rejects confidence outside 0..100", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 150,
      keywords: [],
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_CONFIDENCE_INVALID");
  });

  it("rejects invalid dates", () => {
    const result = validateAiClassificationSuggestion({
      date: "2026-02-31",
      confidence: 50,
      keywords: [],
      reasons: [],
      warnings: [],
      source: "simulated-ai"
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_DATE_INVALID");
  });

  it("rejects absolute or traversal target folders", () => {
    expect(
      validateAiClassificationSuggestion({
        targetFolder: "C:\\Users\\Seb",
        confidence: 50,
        keywords: [],
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
        keywords: [],
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

  it("bounds keywords, reasons and warnings", () => {
    const result = validateAiClassificationSuggestion({
      confidence: 50,
      keywords: ["a", "b", "c", "d", "e", "f"],
      reasons: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"],
      warnings: ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8", "w9"],
      source: "simulated-ai"
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.suggestion.keywords).toHaveLength(5);
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
      namingConvention: "n".repeat(600)
    });

    expect(bounded.filename).toHaveLength(180);
    expect(bounded.extension).toBe(".pdf");
    expect(bounded.extractedTextExcerpt).toHaveLength(5_000);
    expect(bounded.ocrTextExcerpt).toHaveLength(5_000);
    expect(bounded.knownRelativeFolders).toEqual(["Maison/Assurance"]);
    expect(bounded.availableRootFolders).toEqual(["Maison"]);
    expect(bounded.namingConvention).toHaveLength(500);
  });
});
