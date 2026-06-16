import type { NamingInputV2 } from "../naming/documentNameV2";
import { normalizeNameBlock } from "../naming/documentNameV2";
import type { ReferenceCandidate } from "./referenceDataTypes";

export interface ReferenceCandidateSelection {
  targetCandidate?: ReferenceCandidate | null;
  documentTypeCandidate?: ReferenceCandidate | null;
  issuerCandidate?: ReferenceCandidate | null;
  detail?: string;
}

export type NamingV2ReferenceFields = Partial<
  Pick<NamingInputV2, "target" | "documentType" | "issuer" | "detail">
>;

export function referenceCandidateToNamingV2Fields(
  selection: ReferenceCandidateSelection
): NamingV2ReferenceFields {
  const fields: NamingV2ReferenceFields = {};

  if (
    selection.targetCandidate &&
    ["person", "vehicle", "property"].includes(selection.targetCandidate.kind)
  ) {
    fields.target = selection.targetCandidate.fileAlias;
  }

  if (selection.documentTypeCandidate?.kind === "documentType") {
    fields.documentType = selection.documentTypeCandidate.fileAlias;
  }

  if (selection.issuerCandidate?.kind === "provider") {
    fields.issuer = selection.issuerCandidate.fileAlias;
  }

  const detail = normalizeNameBlock(selection.detail);
  if (detail) {
    fields.detail = detail;
  }

  return fields;
}
