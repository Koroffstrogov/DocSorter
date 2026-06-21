import "./nameExplanation";

import { describe, expect, it } from "vitest";

const explanation = globalThis.DocSorterNameExplanation;

describe("name explanation renderer model", () => {
  it("explains the formula and fields used for a complete AI name", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_lea_certificat-scolarite_college-monet.pdf",
      filenameValid: true,
      filenameSource: "ai",
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        subject: "Certificat de scolarité Léa",
        target: "Léa",
        documentType: "certificat scolarité",
        issuer: "Collège Monet",
        detail: ""
      },
      manualFields: { target: true },
      destinationFolder: "Scolarite/Lea",
      folderOrigin: "ai-v2",
      messages: []
    });

    expect(model.formula).toBe("DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext");
    expect(model.result).toBe(
      "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext → 2026_lea_certificat-scolarite_college-monet.pdf"
    );
    expect(model.isComplete).toBe(true);
    expect(line(model, "Nom final")).toMatchObject({ source: "IA locale" });
    expect(line(model, "Date")).toMatchObject({ value: "2026", status: "used", source: "IA locale" });
    expect(line(model, "Cible")).toMatchObject({ value: "lea", status: "used", source: "Correction manuelle" });
    expect(line(model, "Document")).toMatchObject({ value: "certificat-scolarite", status: "used" });
    expect(line(model, "Émetteur")).toMatchObject({ value: "college-monet", status: "used" });
    expect(line(model, "Sujet")).toMatchObject({
      value: "certificat-de-scolarite-lea",
      status: "ignored",
      reason: "Non utilisé dans la convention de nommage."
    });
    expect(line(model, "Dossier")).toMatchObject({
      value: "Scolarite/Lea",
      source: "IA locale"
    });
  });

  it("marks issuer and detail as ignored when empty or redundant", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_lea_carnet-vaccination.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        target: "lea",
        documentType: "carnet-vaccination",
        issuer: "lea",
        detail: "carnet vaccination"
      },
      destinationFolder: "Sante/Lea",
      folderOrigin: "manual",
      messages: []
    });

    expect(line(model, "Émetteur")).toMatchObject({
      value: "lea",
      status: "ignored",
      reason: "Ignoré car vide, générique ou redondant."
    });
    expect(line(model, "Détail")).toMatchObject({
      value: "carnet-vaccination",
      status: "ignored",
      reason: "Ignoré car vide, générique ou redondant."
    });
    expect(line(model, "Dossier")).toMatchObject({ source: "Correction manuelle" });
  });

  it("explains a target chosen from the local known-target list", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_paul_carte-identite.pdf",
      filenameValid: true,
      filenameSource: "ai",
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        target: "paul",
        documentType: "carte-identite"
      },
      manualFields: { target: true },
      knownTargetSelections: {
        target: {
          displayName: "Paul Martin",
          fileAlias: "paul"
        }
      },
      destinationFolder: "Identite-famille/Paul",
      messages: []
    });

    expect(line(model, "Cible")).toMatchObject({
      value: "Paul Martin → paul",
      status: "used",
      source: "Liste locale des cibles"
    });
  });

  it("explains incomplete names and missing required fields", () => {
    const model = explanation.buildNameExplanation({
      filename: "",
      filenameValid: false,
      extension: ".pdf",
      fields: {
        dateToken: "",
        target: "foyer",
        documentType: ""
      },
      destinationFolder: "",
      messages: []
    });

    expect(model.isComplete).toBe(false);
    expect(model.result).toBe("Nom incomplet : date, cible ou type documentaire manquant.");
    expect(model.missingFields).toEqual(["date", "type documentaire"]);
    expect(line(model, "Date")).toMatchObject({ value: "manquant", status: "missing" });
    expect(line(model, "Document")).toMatchObject({ value: "manquant", status: "missing" });
    expect(line(model, "Sujet")).toMatchObject({ value: "non utilisé", status: "ignored" });
  });

  it("does not expose an absolute Windows folder path", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_foyer_avis-imposition.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        target: "foyer",
        documentType: "avis-imposition"
      },
      destinationFolder: "C:\\Users\\Seb\\Documents",
      messages: []
    });

    expect(line(model, "Dossier").value).toBe("aucun dossier final");
    expect(JSON.stringify(model)).not.toContain("C:\\");
  });

  it("adds folder convention context without applying the aligned name", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026-05_foyer_releve-bancaire_bnp.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: ""
      },
      destinationFolder: "Finances/Banque",
      messages: [],
      folderLearning: {
        status: "ready",
        targetFolder: "Finances/Banque",
        entries: [],
        profile: {
          status: "strong",
          analyzedFileCount: 8,
          recognizedFileCount: 8,
          dominantDatePrecision: "month",
          dominantTarget: "compte-joint",
          dominantDocumentType: "releve-bancaire",
          dominantIssuer: "bnp-paribas",
          detailUsage: "never",
          examples: ["2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"],
          reasons: [],
          warnings: []
        },
        comparison: {
          aiName: "2026-05_foyer_releve-bancaire_bnp.pdf",
          alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
          recommendation: "prefer-folder-profile",
          confidence: 85,
          appliedChanges: ["target", "issuer"],
          reasons: [],
          warnings: []
        },
        pipeline: [],
        message: "",
        error: "",
        warnings: []
      }
    });

    expect(line(model, "Convention du dossier")).toMatchObject({
      value: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      status: "ignored",
      reason: "Nom aligné proposé : 2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf."
    });
    expect(model.result).toContain("2026-05_foyer_releve-bancaire_bnp.pdf");
  });

  it("mentions confirmed local preference in folder convention source", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026-05_foyer_releve-bancaire_bnp.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: ""
      },
      destinationFolder: "Finances/Banque",
      messages: [],
      folderLearning: {
        status: "ready",
        targetFolder: "Finances/Banque",
        entries: [],
        profile: {
          status: "medium",
          analyzedFileCount: 4,
          recognizedFileCount: 4,
          dominantDatePrecision: "month",
          dominantTarget: "compte-joint",
          dominantDocumentType: "releve-bancaire",
          dominantIssuer: "bnp-paribas",
          detailUsage: "never",
          localPreference: {
            folderRelativePath: "Finances/Banque",
            preferredSchema: "DATE_CIBLE_DOCUMENT_EMETTEUR",
            preferredDatePrecision: "month",
            preferredTarget: "compte-joint",
            preferredDocumentType: "releve-bancaire",
            preferredIssuer: "bnp-paribas",
            detailUsage: "never",
            confirmedCount: 3,
            lastConfirmedAt: "2026-06-20T10:00:00.000Z"
          },
          examples: ["2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"],
          reasons: [],
          warnings: []
        },
        comparison: {
          aiName: "2026-05_foyer_releve-bancaire_bnp.pdf",
          alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
          recommendation: "prefer-folder-profile",
          confidence: 75,
          appliedChanges: ["target", "issuer"],
          reasons: ["Préférence locale confirmée 3 fois."],
          warnings: []
        },
        pipeline: [],
        message: "",
        error: "",
        warnings: []
      }
    });

    expect(line(model, "Convention du dossier")).toMatchObject({
      source: "Convention du dossier + confirmations utilisateur"
    });
  });

  it("explains when the final name is explicitly replaced by folder convention", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      filenameValid: true,
      filenameSource: "folder-learning",
      extension: ".pdf",
      fields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: ""
      },
      destinationFolder: "Finances/Banque",
      messages: [],
      folderLearning: {
        status: "ready",
        targetFolder: "Finances/Banque",
        entries: [],
        profile: {
          status: "strong",
          analyzedFileCount: 8,
          recognizedFileCount: 8,
          dominantDatePrecision: "month",
          dominantTarget: "compte-joint",
          dominantDocumentType: "releve-bancaire",
          dominantIssuer: "bnp-paribas",
          detailUsage: "never",
          examples: ["2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"],
          reasons: [],
          warnings: []
        },
        comparison: {
          aiName: "2026-05_foyer_releve-bancaire_bnp.pdf",
          alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
          recommendation: "prefer-folder-profile",
          confidence: 85,
          appliedChanges: ["target", "issuer"],
          reasons: [],
          warnings: []
        },
        pipeline: [],
        message: "",
        error: "",
        warnings: []
      }
    });

    expect(line(model, "Nom final")).toMatchObject({
      value: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      source: "Convention du dossier",
      reason: "Remplacé explicitement par la convention du dossier."
    });
    expect(line(model, "Convention du dossier")).toMatchObject({
      status: "used",
      reason: "Nom aligné appliqué : cible modifiée, émetteur modifié."
    });
  });
});

function line(model: NameExplanationModel, label: string): NameExplanationLine {
  const match = model.lines.find((item) => item.label === label);
  if (!match) {
    throw new Error(`Missing line ${label}`);
  }
  return match;
}
