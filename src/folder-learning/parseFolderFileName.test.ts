import { describe, expect, it } from "vitest";

import { parseFolderFileName } from "./parseFolderFileName";

describe("parseFolderFileName", () => {
  it("parses DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL names", () => {
    expect(parseFolderFileName("2026-05_compte-joint_releve-bancaire_bnp-paribas_mai.pdf")).toMatchObject({
      dateToken: "2026-05",
      datePrecision: "month",
      target: "compte-joint",
      documentType: "releve-bancaire",
      issuer: "bnp-paribas",
      detail: "mai",
      extension: ".pdf",
      pattern: "DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL"
    });
  });

  it("parses day and year date precisions", () => {
    expect(parseFolderFileName("2026-02-14_maison-principale_facture-energie_edf.pdf")).toMatchObject({
      datePrecision: "day",
      target: "maison-principale",
      documentType: "facture-energie",
      issuer: "edf"
    });

    expect(parseFolderFileName("2023_paul_carte-identite.pdf")).toMatchObject({
      datePrecision: "year",
      target: "paul",
      documentType: "carte-identite"
    });
  });

  it("ignores directories, unsupported extensions and non-conforming names", () => {
    expect(parseFolderFileName({ name: "2026_paul_carte-identite.pdf", isFile: false })).toBeNull();
    expect(parseFolderFileName("2026_paul_carte-identite.txt")).toBeNull();
    expect(parseFolderFileName("facture-libre.pdf")).toBeNull();
    expect(parseFolderFileName("2026_paul.pdf")).toBeNull();
    expect(parseFolderFileName("2026-02-31_paul_attestation.pdf")).toBeNull();
    expect(parseFolderFileName("2026_Paul_attestation.pdf")).toBeNull();
    expect(parseFolderFileName("Sante/2026_paul_attestation.pdf")).toBeNull();
  });
});
