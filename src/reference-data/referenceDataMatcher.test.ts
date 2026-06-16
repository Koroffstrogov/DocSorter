import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultDocumentTypes } from "./defaultDocumentTypes";
import { detectReferenceCandidates, normalizeAliasForDetection } from "./referenceDataMatcher";
import type { ReferenceDataCatalog } from "./referenceDataTypes";

const temporaryDirectories: string[] = [];

describe("normalizeAliasForDetection", () => {
  it("normalizes text for controlled alias detection", () => {
    expect(normalizeAliasForDetection("Avis d’imposition 2025")).toBe("avis d imposition 2025");
  });
});

describe("detectReferenceCandidates", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("detects a person by first name or alias", () => {
    const result = detectReferenceCandidates({
      filename: "certificat.pdf",
      text: "Certificat de scolarité pour Lea Martin.",
      catalog: createCatalog()
    });

    expect(result.targetCandidates[0]).toEqual(
      expect.objectContaining({
        kind: "person",
        id: "lea",
        fileAlias: "lea",
        confidence: expect.any(Number)
      })
    );
    expect(result.targetCandidates[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("detects Renault Captur as captur", () => {
    const result = detectReferenceCandidates({
      filename: "facture.pdf",
      text: "Facture garage Renault Captur pour vidange.",
      catalog: createCatalog()
    });

    expect(result.targetCandidates[0]).toEqual(
      expect.objectContaining({
        kind: "vehicle",
        id: "captur",
        fileAlias: "captur"
      })
    );
  });

  it("detects BNP Paribas as bnp", () => {
    const result = detectReferenceCandidates({
      filename: "releve.pdf",
      text: "Relevé bancaire BNP Paribas. Contact client@bnp.fr",
      catalog: createCatalog()
    });

    expect(result.issuerCandidates[0]).toEqual(
      expect.objectContaining({
        kind: "provider",
        id: "bnp",
        fileAlias: "bnp"
      })
    );
  });

  it("detects avis d'imposition as avis-imposition", () => {
    const result = detectReferenceCandidates({
      filename: "impots.pdf",
      text: "Votre avis d’imposition est disponible.",
      catalog: createCatalog()
    });

    expect(result.documentTypeCandidates[0]).toEqual(
      expect.objectContaining({
        kind: "documentType",
        id: "avis-imposition",
        fileAlias: "avis-imposition"
      })
    );
  });

  it("detects carnet de vaccination as carnet-vaccination", () => {
    const result = detectReferenceCandidates({
      filename: "sante.pdf",
      text: "Carnet de vaccination et rappel vaccin.",
      catalog: createCatalog()
    });

    expect(result.documentTypeCandidates[0]).toEqual(
      expect.objectContaining({
        kind: "documentType",
        id: "carnet-vaccination",
        fileAlias: "carnet-vaccination"
      })
    );
  });

  it("uses birth dates only as detection hints", () => {
    const result = detectReferenceCandidates({
      filename: "document.pdf",
      text: "Document lié au 16/06/2012.",
      catalog: createCatalog()
    });

    const candidate = result.targetCandidates[0];
    expect(candidate).toEqual(
      expect.objectContaining({
        kind: "person",
        id: "lea",
        fileAlias: "lea",
        confidence: 45
      })
    );
    expect(JSON.stringify(candidate)).not.toContain("2012-06-16");
    expect(candidate?.matchedAliases).toEqual([]);
  });

  it("avoids an obvious partial false positive", () => {
    const result = detectReferenceCandidates({
      filename: "capture-ecran.pdf",
      text: "Capture écran du véhicule.",
      catalog: createCatalog()
    });

    expect(result.targetCandidates.some((candidate) => candidate.id === "captur")).toBe(false);
  });

  it("returns sorted scores and sober reasons", () => {
    const result = detectReferenceCandidates({
      filename: "renault-captur.pdf",
      text: "Facture Renault Captur pour vidange.",
      catalog: createCatalog()
    });

    expect(result.targetCandidates[0]?.confidence).toBeGreaterThanOrEqual(
      result.targetCandidates[1]?.confidence ?? 0
    );
    expect(result.targetCandidates[0]?.reasons[0]).toContain("alias");
  });

  it("does not create, rename, move or delete files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-reference-matcher-"));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, "source"));
    await writeFile(path.join(directory, "source", "document.pdf"), "test", "utf8");
    const before = await readdir(path.join(directory, "source"));

    detectReferenceCandidates({
      filename: "document.pdf",
      text: "Facture Renault Captur pour vidange.",
      catalog: createCatalog()
    });

    const after = await readdir(path.join(directory, "source"));
    expect(after).toEqual(before);
  });
});

function createCatalog(): ReferenceDataCatalog {
  return {
    version: 1,
    people: [
      {
        id: "lea",
        label: "Léa Martin",
        fileAlias: "lea",
        aliases: ["Léa", "Lea Martin"],
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
        id: "bnp",
        label: "BNP Paribas",
        fileAlias: "bnp",
        aliases: ["BNP Paribas", "bnp"],
        domains: ["bnp.fr"]
      }
    ],
    documentTypes: defaultDocumentTypes
  };
}
