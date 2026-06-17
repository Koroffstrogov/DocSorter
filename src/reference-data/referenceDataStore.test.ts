import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadReferenceDataCatalog } from "./referenceDataLoader";
import {
  createMissingReferenceDataFiles,
  getReferenceDataBasePath,
  getReferenceDataOverview,
  openReferenceDataDirectory,
  saveReferenceDataFile,
  validateReferenceDataFileContent
} from "./referenceDataStore";

describe("referenceDataStore", () => {
  it("reports missing files as absent", async () => {
    const userDataPath = await createTempUserDataPath();

    const result = await getReferenceDataOverview(userDataPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.files.map((file) => file.status)).toEqual([
      "absent",
      "absent",
      "absent",
      "absent",
      "absent"
    ]);
  });

  it("creates missing JSON files as empty arrays and keeps default document types available", async () => {
    const userDataPath = await createTempUserDataPath();

    const result = await createMissingReferenceDataFiles(userDataPath);

    expect(result.ok).toBe(true);
    const people = await readFile(
      path.join(getReferenceDataBasePath(userDataPath), "entities", "people.json"),
      "utf8"
    );
    const documentTypes = await readFile(
      path.join(getReferenceDataBasePath(userDataPath), "document-types.json"),
      "utf8"
    );
    expect(people.trim()).toBe("[]");
    expect(documentTypes.trim()).toBe("[]");

    const catalog = await loadReferenceDataCatalog(getReferenceDataBasePath(userDataPath));
    expect(catalog.ok).toBe(true);
    expect(catalog.ok && catalog.catalog.documentTypes.length).toBeGreaterThan(0);
  });

  it("saves a valid person and keeps birthDate detection-only", async () => {
    const userDataPath = await createTempUserDataPath();

    const result = await saveReferenceDataFile(
      userDataPath,
      "people",
      JSON.stringify([
        {
          id: "lea",
          label: "Léa",
          fileAlias: "lea",
          folderAlias: "Famille/Lea",
          aliases: ["Léa", "Lea"],
          birthDate: "2012-06-16",
          useBirthDateForDetectionOnly: true
        }
      ])
    );

    expect(result.ok).toBe(true);
    const saved = JSON.parse(
      await readFile(
        path.join(getReferenceDataBasePath(userDataPath), "entities", "people.json"),
        "utf8"
      )
    );
    expect(saved[0].fileAlias).toBe("lea");
    expect(saved[0].folderAlias).toBe("Famille/Lea");
    expect(saved[0].birthDate).toBe("2012-06-16");
    expect(saved[0].useBirthDateForDetectionOnly).toBe(true);
  });

  it("saves a valid vehicle with aliases and folderAlias", async () => {
    const userDataPath = await createTempUserDataPath();

    const result = await saveReferenceDataFile(
      userDataPath,
      "vehicles",
      JSON.stringify([
        {
          id: "captur",
          label: "Renault Captur",
          fileAlias: "captur",
          folderAlias: "Vehicules/Captur",
          aliases: ["renault captur", "captur"]
        }
      ])
    );

    expect(result.ok && result.value.entryCount).toBe(1);
  });

  it("blocks invalid JSON and does not write it", async () => {
    const userDataPath = await createTempUserDataPath();
    await createMissingReferenceDataFiles(userDataPath);

    const result = await saveReferenceDataFile(userDataPath, "people", "{");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("REFERENCE_DATA_INVALID_JSON");
    const people = await readFile(
      path.join(getReferenceDataBasePath(userDataPath), "entities", "people.json"),
      "utf8"
    );
    expect(people.trim()).toBe("[]");
  });

  it("rejects file keys outside the reference-data allowlist", async () => {
    const result = await validateReferenceDataFileContent("../people", "[]");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("REFERENCE_DATA_FILE_NOT_ALLOWED");
  });

  it("reloads entries so the suggestion engine can use them", async () => {
    const userDataPath = await createTempUserDataPath();
    await saveReferenceDataFile(
      userDataPath,
      "vehicles",
      JSON.stringify([
        {
          id: "captur",
          label: "Renault Captur",
          fileAlias: "captur",
          folderAlias: "Vehicules/Captur",
          aliases: ["renault captur", "captur"]
        }
      ])
    );

    const catalog = await loadReferenceDataCatalog(getReferenceDataBasePath(userDataPath));

    expect(catalog.ok).toBe(true);
    expect(catalog.ok && catalog.catalog.vehicles[0]?.id).toBe("captur");
  });

  it("opens only an existing reference-data directory", async () => {
    const userDataPath = await createTempUserDataPath();
    let openedPath = "";

    const missing = await openReferenceDataDirectory(userDataPath, async (directoryPath) => {
      openedPath = directoryPath;
      return "";
    });
    expect(missing.ok).toBe(false);
    expect(openedPath).toBe("");

    await createMissingReferenceDataFiles(userDataPath);
    const opened = await openReferenceDataDirectory(userDataPath, async (directoryPath) => {
      openedPath = directoryPath;
      return "";
    });

    expect(opened.ok).toBe(true);
    expect((await stat(openedPath)).isDirectory()).toBe(true);
  });
});

async function createTempUserDataPath(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "docsorter-reference-data-store-"));
}
