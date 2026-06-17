import { describe, expect, it } from "vitest";

import { segmentFromAlias, validateTargetFolderOptionPath } from "./targetFolderSafety";

describe("targetFolderSafety", () => {
  it("accepts a safe relative path", () => {
    expect(validateTargetFolderOptionPath("Vehicules/Captur")).toEqual({
      ok: true,
      relativePath: "Vehicules/Captur",
      depth: 2,
      warnings: []
    });
  });

  it("rejects absolute paths", () => {
    expect(validateTargetFolderOptionPath("C:\\Users\\Seb")).toEqual(
      expect.objectContaining({
        ok: false
      })
    );
  });

  it("rejects path traversal", () => {
    expect(validateTargetFolderOptionPath("../Secret")).toEqual(
      expect.objectContaining({
        ok: false
      })
    );
  });

  it("rejects reserved Windows segments", () => {
    expect(validateTargetFolderOptionPath("Vehicules/CON")).toEqual(
      expect.objectContaining({
        ok: false
      })
    );
  });

  it("rejects empty segments", () => {
    expect(validateTargetFolderOptionPath("Vehicules//Captur")).toEqual(
      expect.objectContaining({
        ok: false
      })
    );
  });

  it("rejects depth greater than three", () => {
    expect(validateTargetFolderOptionPath("A/B/C/D")).toEqual(
      expect.objectContaining({
        ok: false
      })
    );
  });

  it("converts aliases to readable segments", () => {
    expect(segmentFromAlias("renault-captur")).toBe("Renault-Captur");
  });
});
