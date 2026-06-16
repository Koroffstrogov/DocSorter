import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkDestinationNameAvailability,
  checkDestinationNameAvailabilityAgainstNames,
  resolveAvailableFilename,
  validateDestinationFilename
} from "./destinationNameAvailability";

describe("validateDestinationFilename", () => {
  it("accepts a simple Windows-compatible filename", () => {
    expect(validateDestinationFilename("2026-06-15_Facture_Energie.pdf")).toEqual({
      ok: true,
      value: "2026-06-15_Facture_Energie.pdf"
    });
  });

  it.each([
    "",
    " facture.pdf",
    "facture.pdf ",
    "facture/edf.pdf",
    "facture\\edf.pdf",
    "..\\facture.pdf",
    "../facture.pdf",
    "facture..pdf",
    "C:\\temp\\facture.pdf",
    "facture:edf.pdf",
    "facture.pdf.",
    "CON.pdf"
  ])("rejects unsafe filename %s", (fileName) => {
    const result = validateDestinationFilename(fileName);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_FILENAME");
    }
  });
});

describe("resolveAvailableFilename", () => {
  it("keeps the proposed name when it is not present", () => {
    expect(resolveAvailableFilename("facture.pdf", ["autre.pdf"])).toBe("facture.pdf");
  });

  it("proposes the next suffix while preserving the extension", () => {
    expect(resolveAvailableFilename("facture.pdf", ["facture.pdf", "facture_2.pdf"])).toBe(
      "facture_3.pdf"
    );
  });

  it("checks collisions case-insensitively", () => {
    expect(resolveAvailableFilename("Facture.pdf", ["facture.PDF"])).toBe("Facture_2.pdf");
  });

  it("stops after suffix 99", () => {
    const existingNames = [
      "facture.pdf",
      ...Array.from({ length: 98 }, (_value, index) => `facture_${index + 2}.pdf`)
    ];

    expect(resolveAvailableFilename("facture.pdf", existingNames)).toBeNull();
  });
});

describe("checkDestinationNameAvailabilityAgainstNames", () => {
  it("returns an available status without alternative", () => {
    const result = checkDestinationNameAvailabilityAgainstNames("C:\\ cible", "facture.pdf", [
      "autre.pdf"
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("available");
      expect(result.value.alternativeFilename).toBeNull();
      expect(result.value.finalFilename).toBe("facture.pdf");
    }
  });

  it("returns a collision status with an alternative", () => {
    const result = checkDestinationNameAvailabilityAgainstNames("C:\\ cible", "facture.pdf", [
      "facture.pdf"
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("collision");
      expect(result.value.alternativeFilename).toBe("facture_2.pdf");
      expect(result.value.finalFilename).toBe("facture_2.pdf");
    }
  });
});

describe("checkDestinationNameAvailability", () => {
  it("returns TARGET_NOT_SELECTED without a selected target", async () => {
    const result = await checkDestinationNameAvailability(null, "facture.pdf");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_SELECTED");
    }
  });

  it("returns TARGET_NOT_FOUND when the selected target disappeared", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-"));
    const missingTarget = path.join(tempRoot, "missing");

    const result = await checkDestinationNameAvailability(missingTarget, "facture.pdf");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_FOUND");
    }
  });

  it("returns TARGET_NOT_DIRECTORY for a file target", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-"));
    const fileTarget = path.join(tempRoot, "not-a-directory.txt");
    await writeFile(fileTarget, "test");

    const result = await checkDestinationNameAvailability(fileTarget, "facture.pdf");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_DIRECTORY");
    }
  });

  it("returns TARGET_NOT_WRITABLE when the target directory is not writable", async () => {
    const result = await checkDestinationNameAvailability("C:\\target", "facture.pdf", {
      checkTargetDirectoryWritable: async () => ({
        ok: false,
        error: {
          code: "TARGET_NOT_WRITABLE",
          message: "Contrôle cible indisponible : écriture refusée."
        }
      })
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_WRITABLE");
      expect(result.error.message).toBe("Contrôle cible indisponible : écriture refusée.");
    }
  });

  it("reads the target directory and reports an available name", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-"));
    const target = path.join(tempRoot, "target");
    await mkdir(target);
    await writeFile(path.join(target, "autre.pdf"), "test");

    const result = await checkDestinationNameAvailability(target, "facture.pdf");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("available");
      expect(result.value.finalPath).toBe(path.join(target, "facture.pdf"));
    }
  });

  it("checks availability inside an existing relative target folder", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-"));
    const target = path.join(tempRoot, "target");
    await mkdir(path.join(target, "Vehicules", "Renault-Captur"), { recursive: true });

    const result = await checkDestinationNameAvailability(target, "facture.pdf", {
      targetFolder: "Vehicules/Renault-Captur"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRootPath).toBe(target);
      expect(result.value.targetFolder).toBe("Vehicules/Renault-Captur");
      expect(result.value.targetPath).toBe(path.join(target, "Vehicules", "Renault-Captur"));
      expect(result.value.finalPath).toBe(
        path.join(target, "Vehicules", "Renault-Captur", "facture.pdf")
      );
    }
  });

  it("returns TARGET_FOLDER_NOT_FOUND when the selected relative folder does not exist", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-"));
    const target = path.join(tempRoot, "target");
    await mkdir(target);

    const result = await checkDestinationNameAvailability(target, "facture.pdf", {
      targetFolder: "Missing"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_FOLDER_NOT_FOUND");
    }
  });

  it("rejects traversal in the selected relative folder", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-"));
    const target = path.join(tempRoot, "target");
    await mkdir(target);

    const result = await checkDestinationNameAvailability(target, "facture.pdf", {
      targetFolder: "../outside"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_FOLDER_INVALID");
    }
  });
});
