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
      score: 88
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
});

function createResponse() {
  return {
    fields: {
      dateToken: field("2025"),
      subject: field("foyer"),
      target: field("foyer"),
      documentType: field("avis-imposition"),
      issuer: field(""),
      detail: field("")
    },
    folderCandidates: [
      { value: "Fiscalite/Foyer/2025", score: 88, reason: "Dossier fiscal annuel.", role: "newFolderProposal" },
      { value: "Divers/A-traiter-manuellement", score: 20, reason: "Fallback.", role: "fallback" }
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
