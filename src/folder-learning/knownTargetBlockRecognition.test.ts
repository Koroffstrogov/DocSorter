import { describe, expect, it } from "vitest";

import {
  recognizeKnownTargetBlocks,
  type FolderLearningKnownTargetReference
} from "./knownTargetBlockRecognition";

describe("recognizeKnownTargetBlocks", () => {
  it("recognizes a target block by exact alias", () => {
    const result = recognizeKnownTargetBlocks(
      ["compte-joint", "releve-bancaire"],
      [target({ fileAlias: "compte-joint", aliases: ["compte joint"] })]
    );

    expect(result.ambiguities).toEqual([]);
    expect(result.recognitions).toMatchObject([
      {
        block: "compte-joint",
        position: 0,
        field: "target",
        matchType: "exact-alias",
        confidence: 95,
        target: {
          fileAlias: "compte-joint"
        }
      }
    ]);
  });

  it("recognizes a target block by normalized display name", () => {
    const result = recognizeKnownTargetBlocks(
      ["compte-joint"],
      [target({ displayName: "Compte joint", fileAlias: "foyer-banque", aliases: [] })]
    );

    expect(result.recognitions).toMatchObject([
      {
        block: "compte-joint",
        matchType: "exact-display-name",
        confidence: 92,
        target: {
          displayName: "Compte joint",
          fileAlias: "foyer-banque"
        }
      }
    ]);
  });

  it("allows controlled prefix matching for specific targets", () => {
    const result = recognizeKnownTargetBlocks(
      ["maison-principale"],
      [target({ displayName: "Maison", fileAlias: "maison", aliases: ["maison"] })]
    );

    expect(result.recognitions).toMatchObject([
      {
        block: "maison-principale",
        matchType: "controlled-prefix",
        confidence: 75,
        target: {
          fileAlias: "maison"
        }
      }
    ]);
  });

  it("keeps ambiguity when two targets can match the same block", () => {
    const result = recognizeKnownTargetBlocks(
      ["paul"],
      [
        target({ id: "paul-1", displayName: "Paul", fileAlias: "paul", aliases: ["Paul"] }),
        target({ id: "paul-2", displayName: "Paul Martin", fileAlias: "paul-martin", aliases: ["Paul"] })
      ]
    );

    expect(result.recognitions).toEqual([]);
    expect(result.ambiguities).toMatchObject([
      {
        block: "paul",
        position: 0,
        matchingFileAliases: ["paul", "paul-martin"]
      }
    ]);
  });

  it("does not use short aliases as prefix matches", () => {
    const result = recognizeKnownTargetBlocks(
      ["am-permis"],
      [target({ displayName: "AM", fileAlias: "am", aliases: ["AM"] })]
    );

    expect(result.recognitions).toEqual([]);
    expect(result.ambiguities).toEqual([]);
  });

  it("keeps exact short target matches explicit", () => {
    const result = recognizeKnownTargetBlocks(
      ["am"],
      [target({ displayName: "AM", fileAlias: "am", aliases: ["AM"] })]
    );

    expect(result.recognitions).toMatchObject([
      {
        block: "am",
        matchType: "exact-alias"
      }
    ]);
  });
});

function target(overrides: Partial<FolderLearningKnownTargetReference>): FolderLearningKnownTargetReference {
  const fileAlias = overrides.fileAlias ?? "compte-joint";
  return {
    id: overrides.id ?? fileAlias,
    kind: overrides.kind ?? "household",
    displayName: overrides.displayName ?? fileAlias,
    fileAlias,
    aliases: overrides.aliases ?? [fileAlias],
    isActive: overrides.isActive ?? true
  };
}
