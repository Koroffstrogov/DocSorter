import { describe, expect, it } from "vitest";

import { buildKnownTargetHints } from "./buildKnownTargetHints";
import type { KnownTarget } from "./knownTargets";

describe("buildKnownTargetHints", () => {
  it("returns a bounded hint when a known alias appears in text", () => {
    const hints = buildKnownTargetHints({
      targets: [
        knownTarget({
          displayName: "paul",
          fileAlias: "paul",
          aliases: ["Paul Martin", "P. Martin"]
        })
      ],
      extractedText: "Carte d'identité de Paul Martin."
    });

    expect(hints).toEqual([
      {
        fileAlias: "paul",
        displayName: "paul",
        kind: "person",
        matchedAliases: ["Paul Martin"],
        evidenceSources: ["known-target-alias", "text"]
      }
    ]);
  });

  it("does not return inactive targets or targets without evidence", () => {
    const hints = buildKnownTargetHints({
      targets: [
        knownTarget({ fileAlias: "captur", kind: "vehicle", aliases: ["Renault Captur"] }),
        knownTarget({ fileAlias: "lea", aliases: ["Léa"], isActive: false })
      ],
      extractedText: "Relevé bancaire du compte joint."
    });

    expect(hints).toEqual([]);
  });

  it("keeps free targets possible by not manufacturing a hint for unknown content", () => {
    const hints = buildKnownTargetHints({
      targets: [knownTarget({ fileAlias: "captur", kind: "vehicle", aliases: ["Renault Captur"] })],
      extractedText: "Relevé bancaire du compte joint pour mai 2026."
    });

    expect(hints).toEqual([]);
  });

  it("uses filename, OCR, selected folder and folder profile as evidence sources", () => {
    const hints = buildKnownTargetHints({
      targets: [
        knownTarget({
          fileAlias: "captur",
          kind: "vehicle",
          aliases: ["Renault Captur", "captur"]
        })
      ],
      filename: "facture_captur.pdf",
      ocrText: "Garage Renault Captur",
      selectedFolder: "Vehicules/Captur",
      folderProfileTerms: ["captur"]
    });

    expect(hints[0]).toMatchObject({
      fileAlias: "captur",
      evidenceSources: ["filename", "folder-profile", "known-target-alias", "ocr", "selected-folder"]
    });
  });

  it("limits hints, aliases and string lengths", () => {
    const targets = Array.from({ length: 25 }, (_, index) =>
      knownTarget({
        fileAlias: `target-${index.toString().padStart(2, "0")}`,
        aliases: [
          `Alias ${index} a`,
          `Alias ${index} b`,
          `Alias ${index} c`,
          `Alias ${index} d`,
          `Alias ${index} e`,
          `Alias ${index} f`
        ]
      })
    );

    const hints = buildKnownTargetHints({
      targets,
      extractedText: targets.flatMap((target) => target.aliases).join(" ")
    });

    expect(hints).toHaveLength(20);
    expect(hints[0]?.matchedAliases).toHaveLength(5);
    expect(hints.every((hint) =>
      hint.fileAlias.length <= 80 &&
      hint.displayName.length <= 80 &&
      hint.matchedAliases.every((alias) => alias.length <= 80)
    )).toBe(true);
  });

  it("removes path-like fragments from hint strings", () => {
    const hints = buildKnownTargetHints({
      targets: [
        knownTarget({
          fileAlias: "paul",
          aliases: ["Paul", "C:\\Users\\Seb\\Secret\\Paul.pdf"]
        })
      ],
      extractedText: "Paul"
    });

    expect(JSON.stringify(hints)).not.toContain("C:\\");
  });
});

function knownTarget(overrides: Partial<KnownTarget>): KnownTarget {
  const fileAlias = overrides.fileAlias ?? "paul";
  return {
    id: fileAlias,
    kind: overrides.kind ?? "person",
    displayName: overrides.displayName ?? fileAlias,
    fileAlias,
    aliases: overrides.aliases ?? [fileAlias],
    isActive: overrides.isActive ?? true,
    createdAt: "2026-06-21T08:00:00.000Z",
    updatedAt: "2026-06-21T08:00:00.000Z"
  };
}
