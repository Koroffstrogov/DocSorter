import { describe, expect, it } from "vitest";

import { extractDateCandidates } from "./dateCandidateExtractor";
import { parseFrenchDate, parseIsoDate } from "./dateTokenFormatter";

describe("date token parsing", () => {
  it("parses ISO date tokens", () => {
    expect(parseIsoDate("2024-03-05")).toBe("2024-03-05");
    expect(parseIsoDate("2026-05")).toBe("2026-05");
    expect(parseIsoDate("2025")).toBe("2025");
  });

  it("parses French numeric and textual dates", () => {
    expect(parseFrenchDate("05/03/2024")).toBe("2024-03-05");
    expect(parseFrenchDate("05-03-2024")).toBe("2024-03-05");
    expect(parseFrenchDate("5 mars 2024")).toBe("2024-03-05");
  });
});

describe("extractDateCandidates", () => {
  it("extracts an ISO day candidate", () => {
    const candidates = extractDateCandidates({ extractedText: "Document du 2024-03-05." });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "2024-03-05",
          precision: "day"
        })
      ])
    );
  });

  it("extracts a French numeric day candidate", () => {
    const candidates = extractDateCandidates({ extractedText: "Facture du 05/03/2024." });

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        token: "2024-03-05",
        precision: "day",
        role: "issue"
      })
    );
  });

  it("extracts a French textual day candidate", () => {
    const candidates = extractDateCandidates({ extractedText: "Établi le 5 mars 2024." });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "2024-03-05",
          precision: "day"
        })
      ])
    );
  });

  it("extracts a monthly period candidate", () => {
    const candidates = extractDateCandidates({ extractedText: "Relevé bancaire mai 2026." });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "2026-05",
          precision: "month"
        })
      ])
    );
  });

  it("extracts a contextual year candidate", () => {
    const candidates = extractDateCandidates({ extractedText: "Avis d'imposition 2025." });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "2025",
          precision: "year",
          role: "period"
        })
      ])
    );
  });

  it("extracts a school-year candidate", () => {
    const candidates = extractDateCandidates({ extractedText: "Année scolaire 2026/2027." });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "2026-2027",
          precision: "school-year",
          role: "period"
        })
      ])
    );
  });

  it("excludes birth dates from documentary candidates", () => {
    const candidates = extractDateCandidates({ extractedText: "Né le 12/03/2014." });

    expect(candidates.some((candidate) => candidate.token === "2014-03-12")).toBe(false);
  });
});
