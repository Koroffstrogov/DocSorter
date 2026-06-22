import { describe, expect, it } from "vitest";

import { parseFolderFileName } from "./parseFolderFileName";
import { compareNameWithFolderProfile } from "./compareNameWithFolderProfile";
import { buildFolderNamingProfile, type FolderNamingProfile } from "./folderNamingProfile";

describe("compareNameWithFolderProfile", () => {
  it("keeps the IA name when the profile has no recognized files", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(["document.pdf", "note-libre.pdf"])
    });

    expect(comparison.recommendation).toBe("keep-ai");
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.aiName).toBe("2026-05_foyer_releve-bancaire_bnp-paribas.pdf");
  });

  it("proposes a manually reviewed aligned name even with one recognized file", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(["2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"])
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(comparison.appliedChanges).toContain("target");
    expect(comparison.reasons.join(" ")).toContain("Profil faible");
  });

  it("recognizes a one-file DocSorter subject schema and proposes an aligned name", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026",
        target: "lea",
        documentType: "certificat-scolarite",
        subject: "assr",
        issuer: "college-monet"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile([
        "2025_lea_certificat-scolarite_assr_college-monet.pdf"
      ])
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBe("2026_lea_certificat-scolarite_assr_college-monet.pdf");
    expect(comparison.detectedPattern).toBe("DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR");
  });

  it("keeps school-year date precision in aligned names", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-2027",
        target: "lea",
        documentType: "certificat-scolarite"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile([
        "2025-2026_lea_certificat-scolarite.pdf"
      ])
    });

    expect(comparison.alignedName).toBe("2026-2027_lea_certificat-scolarite.pdf");
  });

  it("proposes an aligned name for a medium bank statement profile", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildMonthlyBankProfile(4)
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(comparison.appliedChanges).toContain("target");
    expect(parseFolderFileName(comparison.alignedName ?? "")).toMatchObject({
      dateToken: "2026-05",
      target: "compte-joint",
      documentType: "releve-bancaire",
      issuer: "bnp-paribas"
    });
  });

  it("uses a coherent confirmed preference to strengthen a medium aligned name", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildMonthlyBankProfile(4),
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
      }
    });

    expect(comparison.recommendation).toBe("prefer-folder-profile");
    expect(comparison.confidence).toBeGreaterThanOrEqual(75);
    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(comparison.reasons.join(" ")).toContain("Préférence locale confirmée");
  });

  it("keeps a contradictory confirmed preference for manual review", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildMonthlyBankProfile(8),
      preference: {
        folderRelativePath: "Banque/Releves",
        preferredSchema: "DATE_CIBLE_DOCUMENT_EMETTEUR",
        preferredDatePrecision: "year",
        preferredTarget: "captur",
        preferredDocumentType: "facture-entretien",
        confirmedCount: 2,
        lastConfirmedAt: "2026-06-20T10:00:00.000Z"
      }
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("Préférence locale contradictoire");
  });

  it("prefers the folder profile for a strong compatible bank statement profile", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildMonthlyBankProfile(8)
    });

    expect(comparison.recommendation).toBe("prefer-folder-profile");
    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(comparison.confidence).toBeGreaterThanOrEqual(80);
  });

  it("keeps an already ready aligned name unchanged when a known target also matches", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(
        Array.from({ length: 8 }, (_, index) => {
          const month = String(index + 1).padStart(2, "0");
          return `2026-${month}_compte-joint_releve-bancaire_bnp-paribas.pdf`;
        }),
        {
          knownTargets: [
            {
              id: "compte-joint",
              kind: "household",
              displayName: "Compte joint",
              fileAlias: "compte-joint",
              aliases: ["Compte joint"],
              isActive: true
            }
          ]
        }
      )
    });

    expect(comparison.detectedPattern).toBe("DATE_CIBLE_DOCUMENT_EMETTEUR");
    expect(comparison.recommendation).toBe("prefer-folder-profile");
    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
  });

  it("detects DATE_DOCUMENT_CIBLE and proposes a monthly aligned name", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05-01",
        target: "compte-joint",
        documentType: "releve-bancaire",
        issuer: "bnp"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile([
        "2026-01_releve-bancaire_compte-joint.pdf",
        "2026-02_releve-bancaire_compte-joint.pdf",
        "2026-03_releve-bancaire_compte-joint.pdf",
        "2026-04_releve-bancaire_compte-joint.pdf",
        "2026-05_releve-bancaire_compte-joint.pdf",
        "2026-06_releve-bancaire_compte-joint.pdf",
        "2026-07_releve-bancaire_compte-joint.pdf",
        "2026-08_releve-bancaire_compte-joint.pdf"
      ])
    });

    expect(comparison.detectedPattern).toBe("DATE_DOCUMENT_CIBLE");
    expect(comparison.recommendation).toBe("prefer-folder-profile");
    expect(comparison.alignedName).toBe("2026-05_releve-bancaire_compte-joint.pdf");
    expect(comparison.appliedChanges).toEqual(expect.arrayContaining(["datePrecision", "issuer"]));
    expect(comparison.pipeline?.map((step) => step.id)).toEqual([
      "content-ai-analysis",
      "folder-candidate",
      "folder-name-scan",
      "folder-schema-analysis",
      "aligned-name-proposal"
    ]);
  });

  it("uses a known target block to identify DATE_DOCUMENT_CIBLE when the AI target differs", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(
        [
          "2026-01_releve-bancaire_compte-joint.pdf",
          "2026-02_releve-bancaire_compte-joint.pdf",
          "2026-03_releve-bancaire_compte-joint.pdf",
          "2026-04_releve-bancaire_compte-joint.pdf"
        ],
        {
          knownTargets: [
            {
              id: "compte-joint",
              kind: "household",
              displayName: "Compte joint",
              fileAlias: "compte-joint",
              aliases: ["compte joint"],
              isActive: true
            }
          ]
        }
      )
    });

    expect(comparison.detectedPattern).toBe("DATE_DOCUMENT_CIBLE");
    expect(comparison.alignedName).toBe("2026-05_releve-bancaire_compte-joint.pdf");
    expect(comparison.appliedChanges).toContain("target");
    expect(comparison.pipeline?.find((step) => step.id === "folder-schema-analysis")?.variables).toMatchObject({
      targetBlockRecognitions: [
        {
          block: "compte-joint",
          position: 1,
          field: "target"
        }
      ]
    });
  });

  it("keeps manual review when known target block recognition is ambiguous", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(
        [
          "2026-01_releve-bancaire_paul.pdf",
          "2026-02_releve-bancaire_paul.pdf",
          "2026-03_releve-bancaire_paul.pdf",
          "2026-04_releve-bancaire_paul.pdf"
        ],
        {
          knownTargets: [
            {
              id: "paul",
              kind: "person",
              displayName: "Paul",
              fileAlias: "paul",
              aliases: ["Paul"],
              isActive: true
            },
            {
              id: "paul-martin",
              kind: "person",
              displayName: "Paul Martin",
              fileAlias: "paul-martin",
              aliases: ["Paul"],
              isActive: true
            }
          ]
        }
      )
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("ambigu");
  });

  it("does not impose a known target when the document type is incompatible", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "facture-energie",
        issuer: "edf"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(
        [
          "2026-01_releve-bancaire_compte-joint.pdf",
          "2026-02_releve-bancaire_compte-joint.pdf",
          "2026-03_releve-bancaire_compte-joint.pdf",
          "2026-04_releve-bancaire_compte-joint.pdf"
        ],
        {
          knownTargets: [
            {
              id: "compte-joint",
              kind: "household",
              displayName: "Compte joint",
              fileAlias: "compte-joint",
              aliases: ["Compte joint"],
              isActive: true
            }
          ]
        }
      )
    });

    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("Type dominant du dossier différent");
  });

  it("keeps ambiguous schemas for manual review", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "compte-joint",
        documentType: "compte-joint"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile([
        "2026-01_compte-joint_compte-joint.pdf",
        "2026-02_compte-joint_compte-joint.pdf",
        "2026-03_compte-joint_compte-joint.pdf",
        "2026-04_compte-joint_compte-joint.pdf"
      ])
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("Schéma du dossier ambigu");
  });

  it("removes detail when the folder profile never uses the detail block", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-02",
        target: "maison-principale",
        documentType: "facture-energie",
        issuer: "edf",
        detail: "consommation"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile([
        "2026-01_maison-principale_facture-energie_edf.pdf",
        "2026-02_maison-principale_facture-energie_edf.pdf",
        "2026-03_maison-principale_facture-energie_edf.pdf",
        "2026-04_maison-principale_facture-energie_edf.pdf"
      ])
    });

    expect(comparison.alignedName).toBe("2026-02_maison-principale_facture-energie_edf.pdf");
    expect(comparison.appliedChanges).toContain("detail");
    expect(comparison.reasons.join(" ")).toContain("Détail supprimé");
  });

  it("does not align when the document type is different", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "maison-principale",
        documentType: "facture-energie",
        issuer: "edf"
      },
      extension: ".pdf",
      profile: buildMonthlyBankProfile(8)
    });

    expect(["keep-ai", "manual-review"]).toContain(comparison.recommendation);
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("Type dominant du dossier différent");
  });

  it("keeps a mixed profile for manual review", () => {
    const mixedProfile = buildFolderNamingProfile([
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-05-12_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-06_compte-joint_releve-bancaire_bnp-paribas.pdf"
    ]);

    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: mixedProfile
    });

    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("Convention de date hétérogène");
  });

  it("does not force a heterogeneous dominant target even on a strong profile", () => {
    const heterogeneousProfile = buildFolderNamingProfile([
      "2026-01_captur_facture-entretien_renault.pdf",
      "2026-02_captur_facture-entretien_renault.pdf",
      "2026-03_captur_facture-entretien_renault.pdf",
      "2026-04_captur_facture-entretien_renault.pdf",
      "2026-05_captur_facture-entretien_renault.pdf",
      "2026-06_captur_facture-entretien_renault.pdf",
      "2026-07_clio_facture-entretien_renault.pdf",
      "2026-08_clio_facture-entretien_renault.pdf"
    ]);

    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-09",
        target: "megane",
        documentType: "facture-entretien",
        issuer: "renault"
      },
      extension: ".pdf",
      profile: heterogeneousProfile
    });

    expect(heterogeneousProfile.status).toBe("strong");
    expect(heterogeneousProfile.warnings.join(" ")).toContain("Cible dominant mais hétérogène");
    expect(comparison.recommendation).toBe("manual-review");
    expect(comparison.alignedName).toBeUndefined();
    expect(comparison.warnings.join(" ")).toContain("Cible dominante hétérogène");
  });

  it("aligns date precision only when precision can be safely reduced", () => {
    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05-17",
        target: "compte-joint",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildMonthlyBankProfile(8)
    });

    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(comparison.appliedChanges).toContain("datePrecision");
  });

  it("can compare from an already computed IA name", () => {
    const comparison = compareNameWithFolderProfile({
      aiName: "2026-05_foyer_releve-bancaire_bnp-paribas.pdf",
      profile: buildMonthlyBankProfile(8)
    });

    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(comparison.aiName).toBe("2026-05_foyer_releve-bancaire_bnp-paribas.pdf");
  });

  it("is pure over provided names and performs no disk mutation", () => {
    const names = [
      "2026-01_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"
    ] as const;
    const before = [...names];

    const comparison = compareNameWithFolderProfile({
      aiFields: {
        dateToken: "2026-05",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp-paribas"
      },
      extension: ".pdf",
      profile: buildFolderNamingProfile(names)
    });

    expect(names).toEqual(before);
    expect(comparison.alignedName).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
  });
});

function buildMonthlyBankProfile(count: 4 | 8): FolderNamingProfile {
  return buildFolderNamingProfile(
    Array.from({ length: count }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return `2026-${month}_compte-joint_releve-bancaire_bnp-paribas.pdf`;
    })
  );
}
