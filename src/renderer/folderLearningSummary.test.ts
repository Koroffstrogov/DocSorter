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
});

function name(value: string): FolderLearningNameEntry {
  return {
    name: value,
    isFile: true
  };
}
