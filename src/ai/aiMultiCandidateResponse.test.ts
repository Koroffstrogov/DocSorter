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
        dateToken: "2025-01-01",
        subject: "foyer",
        target: "foyer",
        documentType: "avis-imposition",
        targetFolder: "Fiscalite/Foyer/2025",
        confidence: 84,
        source: "ollama"
      }
    });
  });

  it("drops dangerous folder candidates without invalidating the response", () => {
    const result = validateAiMultiCandidateResponse({
      ...createResponse(),
      folderCandidates: [{ value: "../Secret", score: 80, reason: "dangereux" }]
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.folderCandidates).toEqual([]);
    expect(result.status === "valid" && result.response.rejectedCandidates[0]).toMatchObject({
      field: "folderCandidates",
      index: 0,
      rawValue: "../Secret",
      reason: "Candidat dossier IA invalide ou dangereux."
    });
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

  it("falls back to the best valid candidate when selected is missing from candidates", () => {
    const response = createResponse();
    response.fields.target = {
      selected: "foyer",
      candidates: [{ value: "maison", score: 60, reason: "autre cible", role: "alternative" }]
    };

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBe("maison");
  });

  it("drops target equal to documentType without invalidating the response", () => {
    const response = createResponse();
    response.fields.target = field("avis-imposition");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.rejectedCandidates[0].reason).toContain(
      "target ne doit pas être égal"
    );
  });

  it("drops generic target values that belong in targetKind", () => {
    const response = createResponse();
    response.fields.target = field("personne");
    response.fields.targetKind = field("person");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.rejectedCandidates[0].normalizedValue).toBe("personne");
  });

  it("drops invalid targetKind values", () => {
    const response = createResponse();
    response.fields.targetKind = field("adult");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.targetKind.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.rejectedCandidates[0]).toMatchObject({
      field: "fields.targetKind.candidates",
      rawValue: "adult",
      normalizedValue: "adult"
    });
  });

  it("drops partial and placeholder dates without invalidating the response", () => {
    const response = createResponse();
    response.fields.dateToken = {
      selected: "2025",
      candidates: [
        { value: "2025", score: 90, reason: "année seule" },
        { value: "2025-06", score: 80, reason: "mois seul" },
        { value: "date-inconnue", score: 70, reason: "placeholder" }
      ]
    };

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.dateToken.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.fields.dateToken.candidates).toEqual([]);
    expect(result.status === "valid" && result.response.rejectedCandidates.map((candidate) => candidate.rawValue)).toEqual([
      "2025",
      "2025-06",
      "date-inconnue",
      "2025"
    ]);
  });

  it("removes neutral positive warnings", () => {
    const result = validateAiMultiCandidateResponse({
      ...createResponse(),
      warnings: ["Pas de problème majeur détecté", "Date incertaine"]
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.warnings).toContain("Date incertaine");
    expect(result.status === "valid" && result.response.warnings).not.toContain("Pas de problème majeur détecté");
  });

  it("drops generic detail values without invalidating the response", () => {
    const response = createResponse();
    response.fields.detail = field("consommation");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.detail.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.fields.detail.candidates).toEqual([]);
    expect(result.status === "valid" && result.response.rejectedCandidates[0].reason).toContain("Détail IA ignoré");
  });

  it("prefers compte-joint target for bank statements when explicitly detected", () => {
    const response = createResponse();
    response.fields.subject = field("Compte joint");
    response.fields.target = field("foyer");
    response.fields.documentType = field("releve-bancaire");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBe("compte-joint");
    expect(result.status === "valid" && result.response.fields.documentType.selected).toBe("releve-bancaire");
  });

  it("normalizes accented issuer and spaced subject candidates", () => {
    const response = createResponse();
    response.fields.issuer = field("État");
    response.fields.subject = field("Compte joint");

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.issuer.selected).toBe("etat");
    expect(result.status === "valid" && result.response.fields.subject.selected).toBe("compte-joint");
    expect(result.status === "valid" && result.response.rejectedCandidates).toEqual([]);
  });

  it("falls back from an invalid selected value to the best valid candidate", () => {
    const response = createResponse();
    response.fields.subject = {
      selected: "C:\\secret\\document.pdf",
      candidates: [
        { value: "Compte joint", score: 80, reason: "compte detecte" },
        { value: "Foyer", score: 60, reason: "fallback" }
      ]
    };

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.subject.selected).toBe("compte-joint");
    expect(result.status === "valid" && result.response.rejectedCandidates[0]).toMatchObject({
      field: "fields.subject.selected",
      index: -1,
      rawValue: "C:\\secret\\document.pdf"
    });
  });

  it("drops empty candidates without invalidating the response", () => {
    const response = createResponse();
    response.fields.detail = {
      selected: "",
      candidates: [
        { value: "   ", score: 90, reason: "vide" },
        { value: "Carte Vitale", score: 70, reason: "detail utile" }
      ]
    };

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.detail.selected).toBe("carte-vitale");
    expect(result.status === "valid" && result.response.rejectedCandidates[0]).toMatchObject({
      field: "fields.detail.candidates",
      index: 0,
      reason: "Valeur vide après normalisation."
    });
  });

  it("keeps a field incomplete with a warning when no candidate is valid", () => {
    const response = createResponse();
    response.fields.subject = {
      selected: "../Secret",
      candidates: [{ value: "../Secret", score: 80, reason: "dangereux" }]
    };

    const result = validateAiMultiCandidateResponse(response);

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.subject.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.fields.subject.candidates).toEqual([]);
    expect(result.status === "valid" && result.response.warnings).toContain(
      "Certains candidats IA ont été ignorés. Analyse conservée."
    );
  });

  it("drops weak naming candidates without document evidence", () => {
    const response = createResponse();
    response.fields.subject = {
      selected: "captur",
      candidates: [{ value: "captur", score: 40, reason: "candidat faible" }]
    };

    const result = validateAiMultiCandidateResponse(response, {
      filename: "releve_bancaire.pdf",
      text: "Relevé bancaire compte joint mai 2026."
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.subject.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.fields.subject.candidates).toEqual([]);
    expect(result.status === "valid" && result.response.rejectedCandidates[0]).toMatchObject({
      field: "fields.subject.candidates",
      rawValue: "captur",
      normalizedValue: "captur",
      evidence: "none"
    });
  });

  it("keeps weak naming candidates when the document text proves them", () => {
    const response = createResponse();
    response.fields.target = {
      selected: "captur",
      candidates: [{ value: "captur", score: 40, reason: "véhicule dans le texte" }]
    };

    const result = validateAiMultiCandidateResponse(response, {
      filename: "facture.pdf",
      text: "Facture garage Renault Captur."
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBe("captur");
    expect(result.status === "valid" && result.response.rejectedCandidates).toEqual([]);
  });

  it("keeps weak issuer candidates when the document text proves them", () => {
    const response = createResponse();
    response.fields.issuer = {
      selected: "BNP Paribas",
      candidates: [{ value: "BNP Paribas", score: 55, reason: "organisme bancaire" }]
    };

    const result = validateAiMultiCandidateResponse(response, {
      filename: "releve.pdf",
      text: "Relevé bancaire BNP Paribas du compte joint."
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.issuer.selected).toBe("bnp-paribas");
  });

  it("accepts a known target only when a matching hint proves it", () => {
    const response = createResponse();
    response.fields.target = field("Paul");

    const result = validateAiMultiCandidateResponse(response, {
      filename: "carte-identite.pdf",
      text: "Carte d'identité de Paul Martin.",
      knownTargets: [knownTarget("paul", ["Paul Martin"])],
      knownTargetHints: [
        {
          fileAlias: "paul",
          displayName: "paul",
          kind: "person",
          matchedAliases: ["Paul Martin"],
          evidenceSources: ["text", "known-target-alias"]
        }
      ]
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBe("paul");
    expect(result.status === "valid" && result.response.rejectedCandidates).toEqual([]);
  });

  it("drops a known target candidate when no hint proves it", () => {
    const response = createResponse();
    response.fields.target = field("captur");
    response.fields.documentType = field("releve-bancaire");

    const result = validateAiMultiCandidateResponse(response, {
      filename: "releve-bancaire.pdf",
      text: "Relevé bancaire du compte joint.",
      knownTargets: [knownTarget("captur", ["Renault Captur"])],
      knownTargetHints: []
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.rejectedCandidates[0]).toMatchObject({
      rawValue: "captur",
      normalizedValue: "captur",
      evidence: "none",
      reason: "Cible connue ignorée faute de preuve."
    });
  });

  it("drops ambiguous known targets that share the same proof", () => {
    const response = createResponse();
    response.fields.target = {
      selected: "paul",
      candidates: [
        { value: "paul", score: 80, reason: "alias détecté" },
        { value: "paul-martin", score: 79, reason: "alias détecté" }
      ]
    };

    const result = validateAiMultiCandidateResponse(response, {
      text: "Document pour Paul.",
      knownTargets: [
        knownTarget("paul", ["Paul"]),
        knownTarget("paul-martin", ["Paul"])
      ],
      knownTargetHints: [
        {
          fileAlias: "paul",
          displayName: "paul",
          kind: "person",
          matchedAliases: ["Paul"],
          evidenceSources: ["text", "known-target-alias"]
        },
        {
          fileAlias: "paul-martin",
          displayName: "paul-martin",
          kind: "person",
          matchedAliases: ["Paul"],
          evidenceSources: ["text", "known-target-alias"]
        }
      ]
    });

    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.response.fields.target.selected).toBeUndefined();
    expect(result.status === "valid" && result.response.warnings).toContain(
      "Cible connue ambiguë : plusieurs cibles locales correspondent à la même preuve."
    );
  });
});

function createResponse() {
  return {
    fields: {
      dateToken: field("2025-01-01"),
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
      { value: "2025-01-01_foyer_avis-imposition.pdf", score: 88, reason: "Convention respectée.", role: "selected" }
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

function knownTarget(fileAlias: string, aliases: string[]) {
  return {
    id: fileAlias,
    kind: "person" as const,
    displayName: fileAlias,
    fileAlias,
    aliases,
    isActive: true,
    createdAt: "2026-06-21T08:00:00.000Z",
    updatedAt: "2026-06-21T08:00:00.000Z"
  };
}
