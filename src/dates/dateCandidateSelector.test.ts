import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DateCandidate } from "./dateCandidateTypes";
import { buildSelectedDateToken, selectDateToken } from "./dateCandidateSelector";

const temporaryDirectories: string[] = [];

describe("buildSelectedDateToken", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("selects the tax reference year for avis-imposition", () => {
    const result = buildSelectedDateToken({
      extractedText: "Avis d'imposition 2025",
      documentType: "avis-imposition"
    });

    expect(result.dateToken).toBe("2025");
    expect(result.selected?.precision).toBe("year");
  });

  it("selects the covered month for bank statements", () => {
    const result = buildSelectedDateToken({
      extractedText: "Relevé bancaire mai 2026",
      documentType: "releve-bancaire"
    });

    expect(result.dateToken).toBe("2026-05");
    expect(result.selected?.precision).toBe("month");
  });

  it("selects a monthly range for bank statements", () => {
    const result = buildSelectedDateToken({
      extractedText: "Période du 01/05/2026 au 31/05/2026",
      documentType: "releve-bancaire"
    });

    expect(result.dateToken).toBe("2026-05");
  });

  it("selects the invoice issue date", () => {
    const result = buildSelectedDateToken({
      extractedText: "Facture du 05/03/2024",
      documentType: "facture-entretien"
    });

    expect(result.dateToken).toBe("2024-03-05");
    expect(result.selected?.role).toBe("issue");
  });

  it("selects the effective date for contracts", () => {
    const result = buildSelectedDateToken({
      extractedText: "Contrat habitation avec prise d'effet au 01/01/2026",
      documentType: "contrat-assurance-habitation"
    });

    expect(result.dateToken).toBe("2026-01-01");
    expect(result.selected?.role).toBe("effective");
  });

  it("uses the first school-year vintage for school documents", () => {
    const result = buildSelectedDateToken({
      extractedText: "Attestation scolarité année scolaire 2026/2027",
      documentType: "attestation-scolarite"
    });

    expect(result.dateToken).toBe("2026");
    expect(result.selected?.token).toBe("2026-2027");
    expect(result.reasons.join(" ").toLowerCase()).toContain("année scolaire");
  });

  it("uses scanDate for living health documents with an explicit warning", () => {
    const result = buildSelectedDateToken({
      documentType: "carnet-vaccination",
      scanDate: "2026-06-16"
    });

    expect(result.dateToken).toBe("2026-06-16");
    expect(result.warnings.join(" ")).toContain("scan");
  });

  it("does not use a birth date as carnet-vaccination documentary date", () => {
    const result = buildSelectedDateToken({
      extractedText: "Carnet de vaccination. Né le 12/03/2014.",
      documentType: "carnet-vaccination"
    });

    expect(result.dateToken).toBe("date-inconnue");
    expect(result.candidates.some((candidate) => candidate.token === "2014-03-12")).toBe(false);
  });

  it("selects identity issue date over birth date", () => {
    const result = buildSelectedDateToken({
      extractedText: "Né le 12/03/2014. Carte délivrée le 04/05/2024.",
      documentType: "carte-identite"
    });

    expect(result.dateToken).toBe("2024-05-04");
    expect(result.selected?.role).toBe("issue");
  });

  it("falls back for undated mail", () => {
    const result = buildSelectedDateToken({
      extractedText: "Courrier sans date exploitable.",
      documentType: "courrier"
    });

    expect(result.dateToken).toBe("date-inconnue");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("does not treat a lone file date as a strong documentary date", () => {
    const result = buildSelectedDateToken({
      documentType: "courrier",
      fileModifiedAt: "2026-06-16T10:00:00.000Z"
    });

    expect(result.dateToken).toBe("date-inconnue");
    expect(result.confidence).toBeLessThan(20);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        token: "2026-06-16",
        role: "file"
      })
    );
  });

  it("keeps ambiguity visible when two strong dates compete", () => {
    const result = selectDateToken(
      [
        createCandidate("2024-03-05", "issue", 90),
        createCandidate("2024-04-05", "issue", 88)
      ],
      { documentType: "facture-entretien" }
    );

    expect(result.dateToken).toBe("2024-03-05");
    expect(result.warnings.join(" ")).toContain("Plusieurs dates fortes");
  });

  it("does not create, rename, move or delete files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-date-candidates-"));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, "source"));
    await writeFile(path.join(directory, "source", "document.pdf"), "test", "utf8");
    const before = await readdir(path.join(directory, "source"));

    buildSelectedDateToken({
      extractedText: "Facture du 05/03/2024",
      documentType: "facture"
    });

    const after = await readdir(path.join(directory, "source"));
    expect(after).toEqual(before);
  });
});

function createCandidate(token: string, role: DateCandidate["role"], confidence: number): DateCandidate {
  return {
    token,
    precision: "day",
    role,
    source: "text",
    confidence,
    reasons: ["Date explicite détectée."],
    warnings: []
  };
}
