import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadReferenceDataCatalog } from "./referenceDataLoader";

const temporaryDirectories: string[] = [];

describe("loadReferenceDataCatalog", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("loads a valid split reference catalog", async () => {
    const basePath = await createTemporaryBasePath();
    await writeValidCatalogFiles(basePath);

    const result = await loadReferenceDataCatalog(basePath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.catalog.people[0]?.id).toBe("lea");
    expect(result.catalog.vehicles[0]?.fileAlias).toBe("captur");
    expect(result.catalog.providers[0]?.id).toBe("bnp");
    expect(result.catalog.documentTypes.some((entry) => entry.id === "avis-imposition")).toBe(true);
  });

  it("uses empty entity lists and default document types when files are absent", async () => {
    const basePath = await createTemporaryBasePath();

    const result = await loadReferenceDataCatalog(basePath);
    const entries = await readdir(basePath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.catalog.people).toEqual([]);
    expect(result.catalog.documentTypes.length).toBeGreaterThan(0);
    expect(entries).toEqual([]);
  });

  it("blocks invalid JSON without creating files", async () => {
    const basePath = await createTemporaryBasePath();
    await mkdir(path.join(basePath, "entities"), { recursive: true });
    await writeFile(path.join(basePath, "entities", "people.json"), "{", "utf8");

    const result = await loadReferenceDataCatalog(basePath);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("REFERENCE_DATA_INVALID_JSON");
  });

  it("blocks invalid schemas", async () => {
    const basePath = await createTemporaryBasePath();
    await mkdir(path.join(basePath, "entities"), { recursive: true });
    await writeFile(path.join(basePath, "entities", "vehicles.json"), "{}", "utf8");

    const result = await loadReferenceDataCatalog(basePath);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("REFERENCE_DATA_INVALID_SCHEMA");
  });
});

async function createTemporaryBasePath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-reference-data-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeValidCatalogFiles(basePath: string): Promise<void> {
  await mkdir(path.join(basePath, "entities"), { recursive: true });
  await writeJson(path.join(basePath, "entities", "people.json"), [
    {
      id: "lea",
      label: "Léa",
      fileAlias: "lea",
      aliases: ["Léa", "Lea Martin"],
      birthDate: "2012-06-16",
      useBirthDateForDetectionOnly: true
    }
  ]);
  await writeJson(path.join(basePath, "entities", "vehicles.json"), [
    {
      id: "captur",
      label: "Renault Captur",
      fileAlias: "captur",
      aliases: ["renault captur", "captur"]
    }
  ]);
  await writeJson(path.join(basePath, "entities", "properties.json"), []);
  await writeJson(path.join(basePath, "entities", "providers.json"), [
    {
      id: "bnp",
      label: "BNP Paribas",
      fileAlias: "bnp",
      aliases: ["BNP Paribas"],
      domains: ["bnp.fr"]
    }
  ]);
  await writeJson(path.join(basePath, "document-types.json"), [
    {
      id: "avis-imposition",
      label: "Avis d'imposition",
      fileAlias: "avis-imposition",
      aliases: ["avis d'imposition"],
      defaultTargetKind: "foyer",
      defaultDateRule: "period-year"
    }
  ]);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
