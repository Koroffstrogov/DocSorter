import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SuggestionDraftV2 } from "../suggestions/suggestionDraftV2";
import { buildFolderInventory } from "./folderInventory";
import { normalizeInventoryRelativePath } from "./folderInventorySafety";
import { analyzeFolderNamingProfile, alignNamingInputWithFolderProfile } from "./namingProfile";
import { rankFolderPlacementCandidates } from "./placementRanker";

const temporaryDirectories: string[] = [];

describe("folder inventory", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("returns relative paths and folder statistics without reading document content", async () => {
    const root = await createTemporaryRoot();
    await mkdir(path.join(root, "Vehicules", "Captur"), { recursive: true });
    await writeFile(
      path.join(root, "Vehicules", "Captur", "2024-03_captur_facture-entretien_renault.pdf"),
      "contenu sensible",
      "utf8"
    );

    const result = await buildFolderInventory({ rootPath: root });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.inventory.items).toContainEqual({
      relativePath: "Vehicules/Captur",
      depth: 2,
      childFolderCount: 0,
      fileCount: 1,
      sampleFileNames: ["2024-03_captur_facture-entretien_renault.pdf"]
    });
    expect(result.inventory.items.every((item) => !path.isAbsolute(item.relativePath))).toBe(true);
  });

  it("rejects absolute, traversal and too deep relative paths", () => {
    expect(normalizeInventoryRelativePath("C:\\Documents")).toMatchObject({ ok: false });
    expect(normalizeInventoryRelativePath("../Secret")).toMatchObject({ ok: false });
    expect(normalizeInventoryRelativePath("A/B/C/D")).toMatchObject({ ok: false });
  });

  it("ignores folders deeper than the configured limit", async () => {
    const root = await createTemporaryRoot();
    await mkdir(path.join(root, "A", "B", "C", "D"), { recursive: true });

    const result = await buildFolderInventory({ rootPath: root, maxDepth: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.inventory.items.map((item) => item.relativePath)).toEqual(["A", "A/B", "A/B/C"]);
    expect(result.inventory.warnings.length).toBeGreaterThan(0);
  });

  it("does not create, rename, move or delete files", async () => {
    const root = await createTemporaryRoot();
    await mkdir(path.join(root, "Maison"), { recursive: true });
    await writeFile(path.join(root, "Maison", "document.pdf"), "test", "utf8");
    const before = await readdir(path.join(root, "Maison"));

    await buildFolderInventory({ rootPath: root });

    const after = await readdir(path.join(root, "Maison"));
    expect(after).toEqual(before);
  });
});

describe("folder placement ranking", () => {
  it("boosts an existing Vehicules/Captur folder from available evidence", () => {
    const ranking = rankFolderPlacementCandidates({
      draft: createDraft({ documentType: "facture-entretien" }),
      evidenceText: "Facture Renault Captur vidange",
      inventory: {
        warnings: [],
        items: [
          {
            relativePath: "Vehicules/Captur",
            depth: 2,
            childFolderCount: 0,
            fileCount: 2,
            sampleFileNames: ["2024-03_captur_facture-entretien_renault.pdf"]
          }
        ]
      }
    });

    expect(ranking.recommended.relativePath).toBe("Vehicules/Captur");
    expect(ranking.recommended.reasons.join(" ")).toContain("Domaine");
  });

  it("prefers the real accented Captur folder over a theoretical deeper path", () => {
    const ranking = rankFolderPlacementCandidates({
      draft: createDraft({
        target: "renault-captur",
        documentType: "facture-entretien",
        detail: "entretien"
      }),
      evidenceText: "T01-Facture Renault Captur vidange",
      competingRelativePaths: ["Vehicules/Renault-Captur/Entretien"],
      inventory: {
        warnings: [],
        items: [
          {
            relativePath: "Véhicules/Captur",
            depth: 2,
            childFolderCount: 0,
            fileCount: 3,
            sampleFileNames: ["2024-03-05_captur_facture-entretien_renault_vidange.pdf"]
          }
        ]
      }
    });

    expect(ranking.recommended.relativePath).toBe("Véhicules/Captur");
    expect(ranking.recommended.reasons.join(" ")).toContain("Dossier existant correspondant à Captur");
    expect(ranking.warnings.join(" ")).toContain("dossier existant préféré");
  });

  it("falls back to Divers/A-traiter-manuellement when no folder is relevant", () => {
    const ranking = rankFolderPlacementCandidates({
      draft: createDraft({ documentType: "facture-entretien" }),
      evidenceText: "Facture Renault Captur",
      inventory: {
        warnings: [],
        items: [
          {
            relativePath: "Sante/Paul",
            depth: 2,
            childFolderCount: 0,
            fileCount: 0,
            sampleFileNames: []
          }
        ]
      }
    });

    expect(ranking.recommended.relativePath).toBe("Divers/A-traiter-manuellement");
    expect(ranking.recommended.exists).toBe(false);
  });
});

describe("folder naming profile", () => {
  it("detects a monthly bank statement naming pattern", () => {
    const profile = analyzeFolderNamingProfile({
      relativePath: "Finances/Banque/2026",
      depth: 3,
      childFolderCount: 0,
      fileCount: 2,
      sampleFileNames: [
        "2026-03_compte-joint_releve-bancaire_bnp.pdf",
        "2026-04_compte-joint_releve-bancaire_bnp.pdf"
      ]
    });

    expect(profile).toMatchObject({
      dominantDatePrecision: "month",
      dominantTarget: "compte-joint",
      dominantDocumentType: "releve-bancaire",
      dominantIssuer: "bnp"
    });
  });

  it("aligns a proposed name with existing monthly files", () => {
    const profile = analyzeFolderNamingProfile({
      relativePath: "Finances/Banque/2026",
      depth: 3,
      childFolderCount: 0,
      fileCount: 2,
      sampleFileNames: [
        "2026-03_compte-joint_releve-bancaire_bnp.pdf",
        "2026-04_compte-joint_releve-bancaire_bnp.pdf"
      ]
    });

    const alignment = alignNamingInputWithFolderProfile(
      {
        dateToken: "2026-06-15",
        target: "compte-joint",
        documentType: "releve-bancaire",
        issuer: "bnp",
        extension: ".pdf"
      },
      profile
    );

    expect(alignment.input.dateToken).toBe("2026-06");
    expect(alignment.reasons.join(" ")).toContain("Précision de date");
  });

  it("warns on naming profile divergence without changing uncertain fields", () => {
    const profile = analyzeFolderNamingProfile({
      relativePath: "Finances/Banque/2026",
      depth: 3,
      childFolderCount: 0,
      fileCount: 2,
      sampleFileNames: [
        "2026-03_compte-joint_releve-bancaire_bnp.pdf",
        "2026-04_compte-joint_releve-bancaire_bnp.pdf"
      ]
    });

    const alignment = alignNamingInputWithFolderProfile(
      {
        dateToken: "2026-06",
        target: "compte-perso",
        documentType: "releve-bancaire",
        issuer: "bnp",
        extension: ".pdf"
      },
      profile
    );

    expect(alignment.input.target).toBe("compte-perso");
    expect(alignment.warnings.join(" ")).toContain("cible habituelle différente");
  });
});

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-folder-inventory-"));
  temporaryDirectories.push(root);
  return root;
}

function createDraft(fields: Partial<SuggestionDraftV2>): SuggestionDraftV2 {
  return {
    confidence: 75,
    reasons: [],
    warnings: [],
    source: {},
    namingMessages: [],
    ...fields
  };
}
