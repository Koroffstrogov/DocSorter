import "./nameExplanation";

import { describe, expect, it } from "vitest";

const explanation = globalThis.DocSorterNameExplanation;

describe("name explanation renderer model", () => {
  it("explains the formula and fields used for a complete AI name", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_lea_certificat-scolarite_college-monet.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        subject: "Certificat de scolarité Léa",
        target: "Léa",
        documentType: "certificat scolarité",
        issuer: "Collège Monet",
        detail: ""
      },
      manualFields: { target: true },
      destinationFolder: "Scolarite/Lea",
      folderOrigin: "ai-v2",
      messages: []
    });

    expect(model.formula).toBe("DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext");
    expect(model.result).toBe(
      "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext → 2026_lea_certificat-scolarite_college-monet.pdf"
    );
    expect(model.isComplete).toBe(true);
    expect(line(model, "Date")).toMatchObject({ value: "2026", status: "used", source: "IA locale" });
    expect(line(model, "Cible")).toMatchObject({ value: "lea", status: "used", source: "Correction manuelle" });
    expect(line(model, "Document")).toMatchObject({ value: "certificat-scolarite", status: "used" });
    expect(line(model, "Émetteur")).toMatchObject({ value: "college-monet", status: "used" });
    expect(line(model, "Sujet")).toMatchObject({
      value: "certificat-de-scolarite-lea",
      status: "ignored",
      reason: "Non utilisé dans la convention de nommage."
    });
    expect(line(model, "Dossier")).toMatchObject({
      value: "Scolarite/Lea",
      source: "IA locale"
    });
  });

  it("marks issuer and detail as ignored when empty or redundant", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_lea_carnet-vaccination.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        target: "lea",
        documentType: "carnet-vaccination",
        issuer: "lea",
        detail: "carnet vaccination"
      },
      destinationFolder: "Sante/Lea",
      folderOrigin: "manual",
      messages: []
    });

    expect(line(model, "Émetteur")).toMatchObject({
      value: "lea",
      status: "ignored",
      reason: "Ignoré car vide, générique ou redondant."
    });
    expect(line(model, "Détail")).toMatchObject({
      value: "carnet-vaccination",
      status: "ignored",
      reason: "Ignoré car vide, générique ou redondant."
    });
    expect(line(model, "Dossier")).toMatchObject({ source: "Correction manuelle" });
  });

  it("explains incomplete names and missing required fields", () => {
    const model = explanation.buildNameExplanation({
      filename: "",
      filenameValid: false,
      extension: ".pdf",
      fields: {
        dateToken: "",
        target: "foyer",
        documentType: ""
      },
      destinationFolder: "",
      messages: []
    });

    expect(model.isComplete).toBe(false);
    expect(model.result).toBe("Nom incomplet : date, cible ou type documentaire manquant.");
    expect(model.missingFields).toEqual(["date", "type documentaire"]);
    expect(line(model, "Date")).toMatchObject({ value: "manquant", status: "missing" });
    expect(line(model, "Document")).toMatchObject({ value: "manquant", status: "missing" });
    expect(line(model, "Sujet")).toMatchObject({ value: "non utilisé", status: "ignored" });
  });

  it("does not expose an absolute Windows folder path", () => {
    const model = explanation.buildNameExplanation({
      filename: "2026_foyer_avis-imposition.pdf",
      filenameValid: true,
      extension: ".pdf",
      fields: {
        dateToken: "2026",
        target: "foyer",
        documentType: "avis-imposition"
      },
      destinationFolder: "C:\\Users\\Seb\\Documents",
      messages: []
    });

    expect(line(model, "Dossier").value).toBe("aucun dossier final");
    expect(JSON.stringify(model)).not.toContain("C:\\");
  });
});

function line(model: NameExplanationModel, label: string): NameExplanationLine {
  const match = model.lines.find((item) => item.label === label);
  if (!match) {
    throw new Error(`Missing line ${label}`);
  }
  return match;
}
