import { describe, expect, it } from "vitest";

import { buildFolderNamingProfile } from "./folderNamingProfile";

describe("buildFolderNamingProfile", () => {
  it("builds a strong profile for homogeneous monthly bank statements", () => {
    const profile = buildFolderNamingProfile([
      "2026-01_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-06_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-07_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-08_compte-joint_releve-bancaire_bnp-paribas.pdf"
    ]);

    expect(profile).toMatchObject({
      status: "strong",
      analyzedFileCount: 8,
      recognizedFileCount: 8,
      dominantDatePrecision: "month",
      dominantTarget: "compte-joint",
      dominantDocumentType: "releve-bancaire",
      dominantIssuer: "bnp-paribas",
      detailUsage: "never"
    });
    expect(profile.examples).toHaveLength(3);
    expect(profile.reasons.join(" ")).toContain("Cible dominante");
  });

  it("detects homogeneous energy invoices without detail", () => {
    const profile = buildFolderNamingProfile([
      "2026-01_maison-principale_facture-energie_edf.pdf",
      "2026-02_maison-principale_facture-energie_edf.pdf",
      "2026-03_maison-principale_facture-energie_edf.pdf",
      "2026-04_maison-principale_facture-energie_edf.pdf"
    ]);

    expect(profile.status).toBe("medium");
    expect(profile.detailUsage).toBe("never");
    expect(profile.dominantDocumentType).toBe("facture-energie");
  });

  it("keeps a heterogeneous vehicle folder below strong while detecting a dominant target", () => {
    const profile = buildFolderNamingProfile([
      "2024-03-05_captur_facture-entretien_renault_vidange.pdf",
      "2024-06-02_captur_controle-technique.pdf",
      "2025-01-15_captur_attestation-assurance_maif.pdf",
      "2025-02-01_clio_facture-reparation_renault.pdf",
      "2025_captur_carte-grise.pdf"
    ]);

    expect(["weak", "medium"]).toContain(profile.status);
    expect(profile.status).not.toBe("strong");
    expect(profile.dominantTarget).toBe("captur");
    expect(profile.warnings.length).toBeGreaterThan(0);
  });

  it("ignores non-conforming names without error", () => {
    const profile = buildFolderNamingProfile([
      "note-libre.pdf",
      "2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026_compte-joint.pdf",
      "2026-13_compte-joint_releve-bancaire.pdf",
      "2026_compte-joint_releve-bancaire.txt",
      { name: "2026_compte-joint_releve-bancaire.pdf", isFile: false }
    ]);

    expect(profile.status).toBe("weak");
    expect(profile.analyzedFileCount).toBe(5);
    expect(profile.recognizedFileCount).toBe(1);
    expect(profile.warnings.join(" ")).toContain("ignoré");
  });

  it("returns none when no file is recognized", () => {
    const profile = buildFolderNamingProfile(["document.pdf", "sans-date.jpg", "2026_incomplet.pdf"]);

    expect(profile).toMatchObject({
      status: "none",
      analyzedFileCount: 3,
      recognizedFileCount: 0,
      examples: []
    });
  });

  it("returns weak for a single recognized file", () => {
    const profile = buildFolderNamingProfile(["2023-11-02_paul_carte-identite.pdf"]);

    expect(profile.status).toBe("weak");
    expect(profile.recognizedFileCount).toBe(1);
    expect(profile.warnings.join(" ")).toContain("Un seul nom reconnu");
  });

  it("reports mixed date precision for day, month and year names", () => {
    const profile = buildFolderNamingProfile([
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-02-14_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026_compte-joint_releve-bancaire_bnp-paribas.pdf"
    ]);

    expect(profile.dominantDatePrecision).toBe("mixed");
    expect(profile.status).toBe("weak");
    expect(profile.warnings.join(" ")).toContain("Précisions de date mélangées");
  });

  it("is pure over file names and performs no disk mutation", () => {
    const entries = [
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      "2026-06_compte-joint_releve-bancaire_bnp-paribas.pdf"
    ] as const;

    const before = [...entries];
    const profile = buildFolderNamingProfile(entries);

    expect(entries).toEqual(before);
    expect(profile.recognizedFileCount).toBe(2);
  });
});
