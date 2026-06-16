import { mkdtemp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createTargetSubdirectory,
  listTargetSubdirectories,
  normalizeTargetFolderRelative,
  resolveTargetFolder
} from "./targetFolder";

describe("normalizeTargetFolderRelative", () => {
  it("accepts an empty folder for classification at the target root", () => {
    expect(normalizeTargetFolderRelative("")).toEqual({ ok: true, value: "" });
    expect(normalizeTargetFolderRelative("   ")).toEqual({ ok: true, value: "" });
  });

  it("normalizes separators and trims segments", () => {
    expect(normalizeTargetFolderRelative(" Vehicules\\Renault-Captur / Entretien ")).toEqual({
      ok: true,
      value: "Vehicules/Renault-Captur/Entretien"
    });
  });

  it.each([
    "..",
    "../Factures",
    "Factures/../Archives",
    "/Factures",
    "C:\\Factures",
    "Factures/2026/06/PDF",
    "Factures//PDF",
    "Factures:",
    "CON"
  ])("rejects unsafe folder %s", (folder) => {
    const result = normalizeTargetFolderRelative(folder);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_FOLDER_INVALID");
    }
  });
});

describe("resolveTargetFolder", () => {
  it("resolves a folder strictly under the target root", async () => {
    const fixture = await createFixture();

    const result = await resolveTargetFolder(fixture.root, "Vehicules/Renault-Captur");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRootPath).toBe(fixture.root);
      expect(result.value.targetFolder).toBe("Vehicules/Renault-Captur");
      expect(result.value.targetPath).toBe(path.join(fixture.root, "Vehicules", "Renault-Captur"));
      expect(result.value.exists).toBe(true);
    }
  });

  it("rejects a missing selected root", async () => {
    const result = await resolveTargetFolder(null, "");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_SELECTED");
    }
  });

  it("rejects an existing file used as target folder", async () => {
    const fixture = await createFixture();

    const result = await resolveTargetFolder(fixture.root, "not-a-folder.txt");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_FOLDER_NOT_DIRECTORY");
    }
  });

  it("rejects a missing target folder", async () => {
    const fixture = await createFixture();

    const result = await resolveTargetFolder(fixture.root, "Missing");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_FOLDER_NOT_FOUND");
    }
  });
});

describe("listTargetSubdirectories", () => {
  it("lists existing subdirectories up to depth 3", async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.root, "A", "B", "C", "D"), { recursive: true });

    const result = await listTargetSubdirectories(fixture.root);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.folders).toContain("Vehicules");
      expect(result.value.folders).toContain("Vehicules/Renault-Captur");
      expect(result.value.folders).toContain("Vehicules/Renault-Captur/Entretien");
      expect(result.value.folders).toContain("A/B/C");
      expect(result.value.folders).not.toContain("A/B/C/D");
    }
  });
});

describe("createTargetSubdirectory", () => {
  it("creates an explicit missing folder under the root", async () => {
    const fixture = await createFixture();

    const result = await createTargetSubdirectory(fixture.root, "Administratif/Impots");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.created).toBe(true);
      expect(result.value.targetFolder).toBe("Administratif/Impots");
      await expect(stat(result.value.targetPath)).resolves.toMatchObject({});
    }
  });

  it("returns success without creating when the folder already exists", async () => {
    const fixture = await createFixture();
    const makeDirectory = vi.fn(async () => undefined);

    const result = await createTargetSubdirectory(fixture.root, "Vehicules", { makeDirectory });

    expect(result.ok).toBe(true);
    expect(makeDirectory).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.created).toBe(false);
      expect(result.value.message).toBe("Le dossier cible existe déjà.");
    }
  });

  it("does not create anything when traversal is requested", async () => {
    const fixture = await createFixture();
    const before = await readdir(fixture.root);

    const result = await createTargetSubdirectory(fixture.root, "../Outside");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_FOLDER_INVALID");
    }
    await expect(readdir(fixture.root)).resolves.toEqual(before);
  });

  it("refuses creation when the target root is not writable", async () => {
    const result = await createTargetSubdirectory("C:\\target", "Dossier", {
      checkTargetDirectoryWritable: async () => ({
        ok: false,
        error: {
          code: "TARGET_NOT_WRITABLE",
          message: "Écriture refusée."
        }
      })
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_WRITABLE");
    }
  });
});

async function createFixture(): Promise<{ root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-target-folder-"));
  await mkdir(path.join(root, "Vehicules", "Renault-Captur", "Entretien"), {
    recursive: true
  });
  await writeFile(path.join(root, "not-a-folder.txt"), "file");
  return { root };
}
