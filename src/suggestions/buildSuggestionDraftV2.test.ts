import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultDocumentTypes } from "../reference-data/defaultDocumentTypes";
import type {
  ReferenceCandidate,
  ReferenceDataCatalog,
  ReferenceDetectionResult
} from "../reference-data/referenceDataTypes";
import {
  buildNamingInputV2FromSuggestionDraft,
  buildSuggestionDraftV2,
  generateProposedNameFromSuggestionDraft,
  selectBestReferenceCandidate
} from "./buildSuggestionDraftV2";

const temporaryDirectories: string[] = [];

describe("selectBestReferenceCandidate", () => {
  it("selects the best candidate by score", () => {
    const result = selectBestReferenceCandidate([
      createCandidate("vehicle", "clio", 70),
      createCandidate("vehicle", "captur", 90)
    ]);

    expect(result.status).toBe("selected");
    expect(result.candidate?.id).toBe("captur");
  });

  it("does not select ambiguous close candidates", () => {
    const result = selectBestReferenceCandidate([
      createCandidate("vehicle", "captur", 82),
      createCandidate("vehicle", "clio", 80)
    ]);

    expect(result.status).toBe("ambiguous");
    expect(result.candidate).toBeNull();
    expect(result.warning).toContain("ambigu");
  });

  it("does not select candidates below the confidence threshold", () => {
    const result = selectBestReferenceCandidate([createCandidate("vehicle", "captur", 45)]);

    expect(result.status).toBe("below-threshold");
    expect(result.candidate).toBeNull();
  });
});

describe("buildSuggestionDraftV2", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("builds a draft from reference-data candidates", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "scan_renault_captur.pdf",
      referenceData: createCapturReferenceData()
    });

    expect(draft).toMatchObject({
      dateToken: "date-inconnue",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      proposedName: "date-inconnue_captur_facture-entretien_renault.pdf"
    });
    expect(draft.source).toMatchObject({
      target: "reference-data",
      documentType: "reference-data",
      issuer: "reference-data",
      dateToken: "fallback"
    });
    expect(draft.confidence).toBeGreaterThan(0);
  });

  it("can detect candidates from a reference-data catalog", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "scan_renault_captur.pdf",
      extractedText: "Facture Renault Captur vidange du 05/03/2024",
      referenceData: createCatalog()
    });

    expect(draft.target).toBe("captur");
    expect(draft.documentType).toBe("facture-entretien");
    expect(draft.issuer).toBe("renault");
    expect(draft.dateToken).toBe("2024-03-05");
    expect(draft.proposedName).toBe("2024-03-05_captur_facture-entretien_renault.pdf");
  });

  it("generates a v2 name when required fields are available", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "document.pdf",
      referenceData: createCapturReferenceData()
    });

    expect(draft.proposedName).toBe("date-inconnue_captur_facture-entretien_renault.pdf");
    expect(buildNamingInputV2FromSuggestionDraft(draft, ".pdf")).toEqual({
      dateToken: "date-inconnue",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      extension: ".pdf"
    });
    expect(generateProposedNameFromSuggestionDraft(draft, ".pdf")?.filename).toBe(
      "date-inconnue_captur_facture-entretien_renault.pdf"
    );
  });

  it("does not generate a final name if target is missing", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "avis.pdf",
      referenceData: {
        targetCandidates: [],
        documentTypeCandidates: [createCandidate("documentType", "avis-imposition", 85)],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.documentType).toBe("avis-imposition");
    expect(draft.target).toBeUndefined();
    expect(draft.proposedName).toBeUndefined();
    expect(draft.warnings).toContain("Cible absente : nom v2 final non généré.");
  });

  it("does not generate a final name if document type is missing", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "captur.pdf",
      referenceData: {
        targetCandidates: [createCandidate("vehicle", "captur", 85)],
        documentTypeCandidates: [],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.target).toBe("captur");
    expect(draft.documentType).toBeUndefined();
    expect(draft.proposedName).toBeUndefined();
    expect(draft.warnings).toContain("Type documentaire absent : nom v2 final non généré.");
  });

  it("uses date-inconnue with a warning when no reliable date is available", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "document.pdf",
      referenceData: createCapturReferenceData()
    });

    expect(draft.dateToken).toBe("date-inconnue");
    expect(draft.warnings).toContain("Aucune date documentaire fiable détectée.");
  });

  it("propagates sensitive warnings from the v2 name generator", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "document.pdf",
      legacyDraft: {
        documentDate: "2024",
        subject: "lea-16/06/2012",
        documentType: "attestation",
        keywords: ""
      }
    });

    expect(draft.proposedName).toBe("2024_lea-16-06-2012_attestation.pdf");
    expect(draft.namingMessages.map((message) => message.code)).toContain("SENSITIVE_DATE");
    expect(draft.warnings).toContain("Date sensible probable détectée hors bloc date.");
  });

  it("does not expose a long legacy filename warning when reference data replaces it", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "T02-certificat.pdf",
      extractedText: "Certificat de scolarité Léa année scolaire 2026/2027",
      legacyDraft: {
        documentDate: "",
        subject: "T02-ancien-scan-abcdefghijklmnopqrstuv.pdf",
        documentType: "",
        keywords: ""
      },
      referenceData: {
        targetCandidates: [createCandidate("person", "lea", 85)],
        documentTypeCandidates: [createCandidate("documentType", "certificat-scolarite", 85)],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.proposedName).toBe("2026_lea_certificat-scolarite.pdf");
    expect(draft.warnings).not.toContain("Identifiant long probable détecté.");
    expect(draft.reasons).toContain("Ancienne valeur ignorée : ressemble à un nom de fichier.");
  });

  it("keeps a long identifier warning when the sensitive value is still used", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "document.pdf",
      legacyDraft: {
        documentDate: "2026",
        subject: "ABCD1234EFGH5678IJKL",
        documentType: "attestation",
        keywords: ""
      }
    });

    expect(draft.proposedName).toBe("2026_abcd1234efgh5678ijkl_attestation.pdf");
    expect(draft.warnings).toContain("Identifiant long probable détecté.");
  });

  it("keeps birth dates as detection hints only", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "document.pdf",
      referenceData: {
        targetCandidates: [
          {
            ...createCandidate("person", "lea", 45),
            reasons: ["indice date de naissance détecté"],
            matchedAliases: []
          }
        ],
        documentTypeCandidates: [createCandidate("documentType", "carnet-vaccination", 85)],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.target).toBeUndefined();
    expect(JSON.stringify(draft)).not.toContain("2012-06-16");
    expect(JSON.stringify(draft)).not.toContain("16/06/2012");
  });

  it("adapts from the existing NamingDraft when reference data is absent", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "ancien.pdf",
      legacyDraft: {
        documentDate: "2024-03-05",
        subject: "Renault Captur",
        documentType: "Facture Entretien",
        keywords: "Vidange"
      }
    });

    expect(draft).toMatchObject({
      dateToken: "2024-03-05",
      target: "renault-captur",
      documentType: "facture-entretien",
      detail: "vidange",
      proposedName: "2024-03-05_renault-captur_facture-entretien_vidange.pdf"
    });
    expect(draft.source).toMatchObject({
      dateToken: "legacy",
      target: "legacy",
      documentType: "legacy",
      detail: "legacy"
    });
  });

  it("handles captur + facture-entretien + renault", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "scan_renault_captur.pdf",
      extractedText: "Facture Renault Captur vidange du 05/03/2024",
      referenceData: createCapturReferenceData()
    });

    expect(draft.target).toBe("captur");
    expect(draft.documentType).toBe("facture-entretien");
    expect(draft.issuer).toBe("renault");
    expect(draft.detail).toBeUndefined();
    expect(draft.dateToken).toBe("2024-03-05");
    expect(draft.proposedName).toBe("2024-03-05_captur_facture-entretien_renault.pdf");
  });

  it("handles lea + carnet-vaccination without leaking a birth date", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "sante.pdf",
      extractedText: "Carnet de vaccination Léa",
      referenceData: {
        targetCandidates: [createCandidate("person", "lea", 85)],
        documentTypeCandidates: [createCandidate("documentType", "carnet-vaccination", 85)],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.target).toBe("lea");
    expect(draft.documentType).toBe("carnet-vaccination");
    expect(draft.issuer).toBeUndefined();
    expect(draft.detail).toBeUndefined();
    expect(draft.proposedName).toBe("date-inconnue_lea_carnet-vaccination.pdf");
    expect(JSON.stringify(draft)).not.toContain("2012-06-16");
  });

  it("handles avis-imposition without an explicit target", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "avis.pdf",
      extractedText: "Avis d'imposition 2025",
      referenceData: {
        targetCandidates: [],
        documentTypeCandidates: [createCandidate("documentType", "avis-imposition", 85)],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.documentType).toBe("avis-imposition");
    expect(draft.dateToken).toBe("2025");
    expect(draft.target).toBeUndefined();
    expect(draft.proposedName).toBeUndefined();
    expect(draft.warnings).toContain("Cible absente : nom v2 final non généré.");
  });

  it("keeps the selected date candidate for folder suggestions", () => {
    const draft = buildSuggestionDraftV2({
      fileName: "bulletin.pdf",
      extractedText: "Bulletin scolaire année scolaire 2026/2027",
      referenceData: {
        targetCandidates: [createCandidate("person", "lea", 85)],
        documentTypeCandidates: [createCandidate("documentType", "bulletin-scolaire", 85)],
        issuerCandidates: [],
        warnings: []
      }
    });

    expect(draft.dateToken).toBe("2026");
    expect(draft.dateSelection?.selected?.token).toBe("2026-2027");
    expect(draft.dateSelection?.selected?.precision).toBe("school-year");
  });

  it("does not create, rename, move or delete files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-suggestion-draft-v2-"));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, "source"));
    await writeFile(path.join(directory, "source", "document.pdf"), "test", "utf8");
    const before = await readdir(path.join(directory, "source"));

    buildSuggestionDraftV2({
      fileName: "document.pdf",
      referenceData: createCapturReferenceData()
    });

    const after = await readdir(path.join(directory, "source"));
    expect(after).toEqual(before);
  });
});

function createCapturReferenceData(): ReferenceDetectionResult {
  return {
    targetCandidates: [createCandidate("vehicle", "captur", 85)],
    documentTypeCandidates: [createCandidate("documentType", "facture-entretien", 80)],
    issuerCandidates: [createCandidate("provider", "renault", 70)],
    warnings: []
  };
}

function createCatalog(): ReferenceDataCatalog {
  return {
    version: 1,
    people: [
      {
        id: "lea",
        label: "Léa",
        fileAlias: "lea",
        aliases: ["Léa"],
        birthDate: "2012-06-16",
        useBirthDateForDetectionOnly: true
      }
    ],
    vehicles: [
      {
        id: "captur",
        label: "Renault Captur",
        fileAlias: "captur",
        aliases: ["renault captur", "captur"]
      }
    ],
    properties: [],
    providers: [
      {
        id: "renault",
        label: "Renault",
        fileAlias: "renault",
        aliases: ["renault"]
      }
    ],
    documentTypes: defaultDocumentTypes
  };
}

function createCandidate(
  kind: ReferenceCandidate["kind"],
  fileAlias: string,
  confidence: number
): ReferenceCandidate {
  return {
    kind,
    id: fileAlias,
    label: fileAlias,
    fileAlias,
    confidence,
    reasons: [`alias '${fileAlias}' détecté`],
    matchedAliases: [fileAlias]
  };
}
