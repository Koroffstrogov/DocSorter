import "./folderLearningSummary";

import { describe, expect, it } from "vitest";

const summary = globalThis.DocSorterFolderLearningSummary;

describe("folderLearningSummary", () => {
  it("builds a strong profile and an aligned name from homogeneous folder names", () => {
    const analysis = summary.buildAnalysis({
      entries: [
        name("2026-01_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-06_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-07_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-08_compte-joint_releve-bancaire_bnp-paribas.pdf")
      ],
      aiName: "2026-05-18_foyer_releve-bancaire_bnp_mai.pdf",
      aiFields: {
        dateToken: "2026-05-18",
        subject: "",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: "mai"
      },
      extension: ".pdf"
    });

    expect(analysis.profile).toMatchObject({
      status: "strong",
      recognizedFileCount: 8,
      dominantDatePrecision: "month",
      dominantTarget: "compte-joint",
      dominantDocumentType: "releve-bancaire",
      dominantIssuer: "bnp-paribas",
      detailUsage: "never"
    });
    expect(analysis.comparison).toMatchObject({
      recommendation: "prefer-folder-profile",
      alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    });
  });

  it("proposes an aligned name from one recognized folder name for manual validation", () => {
    const analysis = summary.buildAnalysis({
      targetFolder: "Banque/Releves",
      entries: [
        name("2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf")
      ],
      aiName: "2026-05_foyer_releve-bancaire_bnp-paribas.pdf",
      aiFields: {
        dateToken: "2026-05",
        subject: "",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas",
        detail: ""
      },
      extension: ".pdf"
    });

    expect(analysis.profile).toMatchObject({
      status: "weak",
      recognizedFileCount: 1
    });
    expect(analysis.comparison).toMatchObject({
      recommendation: "manual-review",
      alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    });
    expect(analysis.pipeline.find((step) => step.id === "aligned-name-proposal")).toMatchObject({
      status: "ready",
      output: {
        alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
      }
    });
  });

  it("detects DATE_DOCUMENT_CIBLE and exposes the pipeline", () => {
    const analysis = summary.buildAnalysis({
      targetFolder: "Banque/Releves",
      entries: [
        name("2026-01_releve-bancaire_compte-joint.pdf"),
        name("2026-02_releve-bancaire_compte-joint.pdf"),
        name("2026-03_releve-bancaire_compte-joint.pdf"),
        name("2026-04_releve-bancaire_compte-joint.pdf"),
        name("2026-05_releve-bancaire_compte-joint.pdf"),
        name("2026-06_releve-bancaire_compte-joint.pdf"),
        name("2026-07_releve-bancaire_compte-joint.pdf"),
        name("2026-08_releve-bancaire_compte-joint.pdf")
      ],
      aiName: "2026-05-01_compte-joint_releve-bancaire_bnp.pdf",
      aiFields: {
        dateToken: "2026-05-01",
        subject: "",
        target: "compte-joint",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: ""
      },
      extension: ".pdf"
    });

    expect(analysis.profile).toMatchObject({
      dominantPattern: "DATE_DOCUMENT_CIBLE",
      dominantTarget: "compte-joint",
      dominantDocumentType: "releve-bancaire"
    });
    expect(analysis.comparison).toMatchObject({
      recommendation: "prefer-folder-profile",
      detectedPattern: "DATE_DOCUMENT_CIBLE",
      alignedName: "2026-05_releve-bancaire_compte-joint.pdf"
    });
    expect(analysis.pipeline.map((step) => step.id)).toEqual([
      "content-ai-analysis",
      "folder-candidate",
      "folder-name-scan",
      "folder-schema-analysis",
      "aligned-name-proposal"
    ]);
  });

  it("uses known targets to identify a target block in the folder schema", () => {
    const analysis = summary.buildAnalysis({
      targetFolder: "Banque/Releves",
      entries: [
        name("2026-01_releve-bancaire_compte-joint.pdf"),
        name("2026-02_releve-bancaire_compte-joint.pdf"),
        name("2026-03_releve-bancaire_compte-joint.pdf"),
        name("2026-04_releve-bancaire_compte-joint.pdf")
      ],
      knownTargets: [
        {
          id: "compte-joint",
          kind: "household",
          displayName: "compte-joint",
          fileAlias: "compte-joint",
          aliases: ["Compte joint"],
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      aiName: "2026-05_foyer_releve-bancaire_bnp-paribas.pdf",
      aiFields: {
        dateToken: "2026-05",
        subject: "",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas",
        detail: ""
      },
      extension: ".pdf"
    });

    expect(analysis.profile.targetBlockRecognitions).toMatchObject([
      {
        block: "compte-joint",
        position: 1,
        field: "target"
      }
    ]);
    expect(analysis.comparison).toMatchObject({
      detectedPattern: "DATE_DOCUMENT_CIBLE",
      alignedName: "2026-05_releve-bancaire_compte-joint.pdf"
    });
    expect(analysis.pipeline.find((step) => step.id === "folder-schema-analysis")?.variables).toMatchObject({
      targetBlockRecognitions: [
        {
          block: "compte-joint",
          position: 1
        }
      ]
    });
  });

  it("uses a confirmed local preference to strengthen a medium folder convention", () => {
    const analysis = summary.buildAnalysis({
      targetFolder: "Banque/Releves",
      entries: [
        name("2026-01_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf")
      ],
      preference: {
        folderRelativePath: "Banque/Releves",
        preferredSchema: "DATE_CIBLE_DOCUMENT_EMETTEUR",
        preferredDatePrecision: "month",
        preferredTarget: "compte-joint",
        preferredDocumentType: "releve-bancaire",
        preferredIssuer: "bnp-paribas",
        detailUsage: "never",
        confirmedCount: 3,
        lastConfirmedAt: "2026-06-20T10:00:00.000Z"
      },
      aiName: "2026-05-18_foyer_releve-bancaire_bnp_mai.pdf",
      aiFields: {
        dateToken: "2026-05-18",
        subject: "",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: "mai"
      },
      extension: ".pdf"
    });

    expect(analysis.profile.localPreference).toMatchObject({ confirmedCount: 3 });
    expect(analysis.comparison).toMatchObject({
      recommendation: "prefer-folder-profile",
      alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    });
    expect(analysis.comparison?.reasons.join(" ")).toContain("Préférence locale confirmée");
  });

  it("marks contradictory local preference for manual review", () => {
    const analysis = summary.buildAnalysis({
      targetFolder: "Banque/Releves",
      entries: [
        name("2026-01_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf")
      ],
      preference: {
        folderRelativePath: "Banque/Releves",
        preferredSchema: "DATE_CIBLE_DOCUMENT",
        preferredDatePrecision: "year",
        preferredTarget: "captur",
        preferredDocumentType: "facture-entretien",
        detailUsage: "never",
        confirmedCount: 2,
        lastConfirmedAt: "2026-06-20T10:00:00.000Z"
      },
      aiName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      aiFields: {
        dateToken: "2026-05",
        subject: "",
        target: "compte-joint",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas",
        detail: ""
      },
      extension: ".pdf"
    });

    expect(analysis.comparison).toMatchObject({
      recommendation: "manual-review"
    });
    expect(analysis.comparison?.alignedName).toBeUndefined();
    expect(analysis.comparison?.warnings.join(" ")).toContain("Préférence locale contradictoire");
  });

  it("ignores directories and non-conforming names without failing", () => {
    const analysis = summary.buildAnalysis({
      entries: [
        { name: "Archives", isFile: false },
        name("notes-libres.pdf"),
        name("2026-bad.pdf")
      ],
      aiName: "2026_foyer_avis-imposition.pdf",
      aiFields: null,
      extension: ".pdf"
    });

    expect(analysis.profile.status).toBe("none");
    expect(analysis.profile.analyzedFileCount).toBe(2);
    expect(analysis.profile.recognizedFileCount).toBe(0);
    expect(analysis.comparison).toMatchObject({
      recommendation: "keep-ai"
    });
  });

  it("does not propose a misleading aligned name when the AI date is missing", () => {
    const analysis = summary.buildAnalysis({
      targetFolder: "Courriers",
      entries: [
        name("2026-01_foyer_courrier.pdf"),
        name("2026-02_foyer_courrier.pdf"),
        name("2026-03_foyer_courrier.pdf"),
        name("2026-04_foyer_courrier.pdf")
      ],
      aiName: "",
      aiFields: {
        dateToken: "",
        subject: "",
        target: "foyer",
        documentType: "courrier",
        issuer: "",
        detail: ""
      },
      extension: ".pdf"
    });

    expect(analysis.comparison).toBeNull();
    expect(analysis.pipeline.find((step) => step.id === "content-ai-analysis")).toMatchObject({
      status: "blocked",
      blockingReason: "Analyse IA absente ou incomplète."
    });
    expect(analysis.pipeline.find((step) => step.id === "aligned-name-proposal")).toMatchObject({
      status: "blocked",
      output: {
        alignedName: ""
      }
    });
  });
});

function name(value: string): FolderLearningNameEntry {
  return {
    name: value,
    isFile: true
  };
}
