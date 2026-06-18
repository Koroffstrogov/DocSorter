import { describe, expect, it } from "vitest";

import { isFallbackManualFolder, isFilenameLikeTarget } from "./filenameLikeTarget";

describe("isFilenameLikeTarget", () => {
  it("rejects TXX test basenames and document-type copies", () => {
    expect(
      isFilenameLikeTarget("t05-avis-imposition-foyer", {
        fileName: "T05-avis_imposition_foyer_2025.pdf",
        documentType: "avis-imposition",
        dateToken: "2025"
      })
    ).toBe(true);
    expect(isFilenameLikeTarget("avis-imposition", { documentType: "avis-imposition" })).toBe(true);
  });

  it("keeps controlled short aliases usable", () => {
    expect(
      isFilenameLikeTarget("foyer", {
        fileName: "T05-avis_imposition_foyer_2025.pdf",
        documentType: "avis-imposition"
      })
    ).toBe(false);
    expect(isFilenameLikeTarget("captur", { fileName: "scan_renault_captur.pdf" })).toBe(false);
  });
});

describe("isFallbackManualFolder", () => {
  it("detects the manual fallback folder independently from separators", () => {
    expect(isFallbackManualFolder("Divers/A-traiter-manuellement")).toBe(true);
    expect(isFallbackManualFolder("Divers\\A traiter manuellement")).toBe(true);
    expect(isFallbackManualFolder("Fiscalite/Foyer/2025")).toBe(false);
  });
});
