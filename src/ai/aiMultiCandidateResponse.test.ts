import { describe, expect, it } from "vitest";

import {
  adaptMultiCandidateResponseToSuggestion,
  validateAiMultiCandidateResponse
} from "./aiMultiCandidateResponse";

describe("validateAiMultiCandidateResponse", () => {
  it("accepts a valid multi-candidate Ollama response", () => {
    const result = validateAiMultiCandidateResponse(createResponse());

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBe("foyer");
    expect(result.status === "valid" && result.response.folderCandidates[0]).toMatchObject({
      value: "Fiscalite/Foyer/2025",
      score: 88,
      requiresCreation: true
    });
  });

  it("adapts selected multi-candidate fields to the legacy renderer suggestion", () => {
    const validation = validateAiMultiCandidateResponse(createResponse());
    expect(validation.status).toBe("valid");
    if (validation.status !== "valid") {
      throw new Error(validation.error.message);
    }

    const adapted = adaptMultiCandidateResponseToSuggestion(validation.response);

    expect(adapted).toMatchObject({
      status: "valid",
      suggestion: {
        dateToken: "2025",
        subject: "foyer",
        target: "foyer",
        documentType: "avis-imposition",
        targetFolder: "Fiscalite/Foyer/2025",
        confidence: 84,
        source: "ollama"
      }
    });
  });

  it("rejects dangerous folder candidates", () => {
    const result = validateAiMultiCandidateResponse({
      ...createResponse(),
      folderCandidates: [{ value: "../Secret", score: 80, reason: "dangereux" }]
    });

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.code).toBe("AI_TARGET_FOLDER_INVALID");
  });

  it("keeps at most three candidates per list", () => {
    const result = validateAiMultiCandidateResponse({
      ...createResponse(),
      folderCandidates: [
        { value: "Fiscalite", score: 90, reason: "1", exists: true },
        { value: "Fiscalite/Foyer", score: 80, reason: "2", exists: false },
        { value: "Fiscalite/Foyer/2025", score: 70, reason: "3", requiresCreation: true },
        { value: "Divers/A-traiter-manuellement", score: 10, reason: "4", role: "fallback" }
      ]
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.folderCandidates).toHaveLength(3);
  });

  it("rejects a selected field missing from its candidates", () => {
    const response = createResponse();
    response.fields.target = {
      selected: "foyer",
      candidates: [{ value: "maison", score: 60, reason: "autre cible", role: "alternative" }]
    };

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.field).toBe("fields.target.selected");
  });

  it("rejects target equal to documentType", () => {
    const response = createResponse();
    response.fields.target = field("avis-imposition");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.message).toContain("target ne doit pas être égal");
  });

  it("rejects generic target values that belong in targetKind", () => {
    const response = createResponse();
    response.fields.target = field("personne");
    response.fields.targetKind = field("person");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.message).toContain("nature générique");
  });

  it("rejects invalid targetKind values", () => {
    const response = createResponse();
    response.fields.targetKind = field("adult");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.error.field).toBe("fields.targetKind.candidates");
  });
});

function createResponse() {
  return {
    fields: {
      dateToken: field("2025"),
      subject: field("foyer"),
      target: field("foyer"),
      targetKind: field("household"),
      documentType: field("avis-imposition"),
      issuer: field(""),
      detail: field("")
    },
    folderCandidates: [
      { value: "Fiscalite/Foyer/2025", score: 88, reason: "Dossier fiscal annuel.", requiresCreation: true },
      { value: "Divers/A-traiter-manuellement", score: 20, reason: "Fallback.", role: "fallback", exists: false }
    ],
    fileNameCandidates: [
      { value: "2025_foyer_avis-imposition.pdf", score: 88, reason: "Convention respectée.", role: "selected" }
    ],
    warnings: [],
    confidence: 84,
    source: "ollama"
  };
}

function field(value: string) {
  return {
    selected: value,
    candidates: value ? [{ value, score: 80, reason: "Sélectionné.", role: "selected" }] : []
  };
}
