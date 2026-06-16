import { describe, expect, it } from "vitest";

import { referenceCandidateToNamingV2Fields } from "./referenceDataToNamingV2";
import type { ReferenceCandidate } from "./referenceDataTypes";

describe("referenceCandidateToNamingV2Fields", () => {
  it("maps explicitly selected candidates to v2 naming fields", () => {
    expect(
      referenceCandidateToNamingV2Fields({
        targetCandidate: createCandidate("vehicle", "captur"),
        documentTypeCandidate: createCandidate("documentType", "facture-entretien"),
        issuerCandidate: createCandidate("provider", "renault"),
        detail: "Vidange annuelle"
      })
    ).toEqual({
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "vidange-annuelle"
    });
  });

  it("does not expose birth dates or mismatched candidate kinds", () => {
    const fields = referenceCandidateToNamingV2Fields({
      targetCandidate: createCandidate("provider", "bnp"),
      documentTypeCandidate: createCandidate("vehicle", "captur"),
      issuerCandidate: createCandidate("person", "lea"),
      detail: "16/06/2012"
    });

    expect(fields).toEqual({
      detail: "16-06-2012"
    });
    expect(JSON.stringify(fields)).not.toContain("2012-06-16");
  });
});

function createCandidate(kind: ReferenceCandidate["kind"], fileAlias: string): ReferenceCandidate {
  return {
    kind,
    id: fileAlias,
    label: fileAlias,
    fileAlias,
    confidence: 80,
    reasons: ["test"],
    matchedAliases: [fileAlias]
  };
}
