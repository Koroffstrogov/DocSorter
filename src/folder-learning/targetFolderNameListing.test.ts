import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { listTargetFolderNames } from "./targetFolderNameListing";

const TARGET_ROOT = "C:\\target";

describe("listTargetFolderNames", () => {
  it("reads names for a valid relative target folder without reading file content", async () => {
    const readDirectory = vi.fn(async () => [
      file("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"),
      directory("Archives"),
      file("note-libre.txt")
    ]);

    const result = await listTargetFolderNames(TARGET_ROOT, "Finances/Banque", {
      checkTargetDirectoryWritable: async () => ({ ok: true, value: TARGET_ROOT }),
      readDirectory
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(readDirectory).toHaveBeenCalledWith(path.resolve(TARGET_ROOT, "Finances", "Banque"));
    expect(result.value).toMatchObject({
      targetFolder: "Finances/Banque",
      entries: [
        { name: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf", isFile: true },
        { name: "Archives", isFile: false },
        { name: "note-libre.txt", isFile: true }
      ],
      truncated: false
    });
  });

  it("refuses absolute and traversal folders before reading", async () => {
    const readDirectory = vi.fn(async () => [file("document.pdf")]);

    await expect(
      listTargetFolderNames(TARGET_ROOT, "C:\\outside", {
        checkTargetDirectoryWritable: async () => ({ ok: true, value: TARGET_ROOT }),
        readDirectory
      })
    ).resolves.toMatchObject({ ok: false, error: { code: "TARGET_FOLDER_INVALID" } });

    await expect(
      listTargetFolderNames(TARGET_ROOT, "../outside", {
        checkTargetDirectoryWritable: async () => ({ ok: true, value: TARGET_ROOT }),
        readDirectory
      })
    ).resolves.toMatchObject({ ok: false, error: { code: "TARGET_FOLDER_INVALID" } });

    expect(readDirectory).not.toHaveBeenCalled();
  });

  it("limits the number of entries and reports truncation", async () => {
    const result = await listTargetFolderNames(TARGET_ROOT, "Finances", {
      entryLimit: 2,
      checkTargetDirectoryWritable: async () => ({ ok: true, value: TARGET_ROOT }),
      readDirectory: async () => [file("a.pdf"), file("b.pdf"), file("c.pdf")]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value.entries.map((entry) => entry.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(result.value.truncated).toBe(true);
    expect(result.value.warnings.join(" ")).toContain("limitée");
  });

  it("returns a non-blocking warning when folder reading fails", async () => {
    const result = await listTargetFolderNames(TARGET_ROOT, "Missing", {
      checkTargetDirectoryWritable: async () => ({ ok: true, value: TARGET_ROOT }),
      readDirectory: async () => {
        throw new Error("EACCES");
      }
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        targetFolder: "Missing",
        entries: [],
        warnings: ["Convention du dossier indisponible : lecture du dossier impossible."]
      }
    });
  });
});

function file(name: string) {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false
  };
}

function directory(name: string) {
  return {
    name,
    isFile: () => false,
    isDirectory: () => true
  };
}
