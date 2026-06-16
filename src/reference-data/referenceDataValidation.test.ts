import { describe, expect, it } from "vitest";

import { validateReferenceDataCatalog } from "./referenceDataValidation";
import type { ReferenceDataCatalog } from "./referenceDataTypes";

describe("validateReferenceDataCatalog", () => {
  it("validates and normalizes a valid catalog", () => {
    const validation = validateReferenceDataCatalog(createValidCatalog());

    expect(validation.isValid).toBe(true);
    expect(validation.catalog?.vehicles[0]?.fileAlias).toBe("renault-captur");
    expect(validation.catalog?.providers[0]?.domains).toEqual(["bnp.fr"]);
  });

  it("rejects an invalid catalog structure", () => {
    const validation = validateReferenceDataCatalog({
      version: 1,
      people: {},
      vehicles: [],
      properties: [],
      providers: [],
      documentTypes: []
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "people",
          field: "root"
        })
      ])
    );
  });

  it("rejects duplicate ids and short aliases", () => {
    const catalog = createValidCatalog();
    catalog.vehicles.push({
      id: "captur",
      label: "Duplicate",
      fileAlias: "duplicate",
      aliases: ["du"]
    });

    const validation = validateReferenceDataCatalog(catalog);

    expect(validation.isValid).toBe(false);
    expect(validation.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(["id", "aliases"])
    );
  });

  it("rejects invalid birth dates", () => {
    const catalog = createValidCatalog();
    catalog.people[0] = {
      ...catalog.people[0]!,
      birthDate: "2012-02-31"
    };

    const validation = validateReferenceDataCatalog(catalog);

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "people",
          field: "birthDate"
        })
      ])
    );
  });
});

function createValidCatalog(): ReferenceDataCatalog {
  return {
    version: 1,
    people: [
      {
        id: "lea",
        label: "Léa",
        fileAlias: "lea",
        folderAlias: "Famille/Lea",
        aliases: ["Léa", "Lea Martin"],
        birthDate: "2012-06-16",
        useBirthDateForDetectionOnly: true
      }
    ],
    vehicles: [
      {
        id: "captur",
        label: "Renault Captur",
        fileAlias: "Renault Captur",
        folderAlias: "Vehicules/Captur",
        aliases: ["renault captur", "captur"]
      }
    ],
    properties: [
      {
        id: "foyer",
        label: "Foyer",
        fileAlias: "foyer",
        aliases: ["foyer", "famille"]
      }
    ],
    providers: [
      {
        id: "bnp",
        label: "BNP Paribas",
        fileAlias: "bnp",
        aliases: ["BNP Paribas", "bnp"],
        domains: ["bnp.fr"]
      }
    ],
    documentTypes: [
      {
        id: "avis-imposition",
        label: "Avis d'imposition",
        fileAlias: "avis-imposition",
        aliases: ["avis d'imposition", "impots"],
        domain: "fiscal",
        defaultTargetKind: "foyer",
        defaultDateRule: "period-year"
      }
    ]
  };
}
