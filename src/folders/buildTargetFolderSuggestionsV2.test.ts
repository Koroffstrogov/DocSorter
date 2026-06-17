import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SelectedDateToken } from "../dates/dateCandidateTypes";
import type { SuggestionDraftV2 } from "../suggestions/suggestionDraftV2";
import { buildTargetFolderSuggestionsV2 } from "./buildTargetFolderSuggestionsV2";

const temporaryDirectories: string[] = [];

describe("buildTargetFolderSuggestionsV2", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("generates several depth options", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({
        documentType: "certificat-scolarite",
        target: "lea",
        dateToken: "2026",
        dateSelection: schoolYearSelection()
      })
    });

    expect(result.options.map((option) => option.relativePath)).toEqual([
      "Scolarite",
      "Scolarite/Lea",
      "Scolarite/Lea/2026-2027"
    ]);
  });

  it("recommends level 2 by default when target is known", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-entretien", target: "captur" })
    });

    expect(result.recommended?.relativePath).toBe("Vehicules/Captur");
    expect(result.recommended?.label).toBe("equilibre");
  });

  it("does not recommend level 3 for an isolated school certificate", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({
        documentType: "certificat-scolarite",
        target: "lea",
        dateToken: "2026",
        dateSelection: schoolYearSelection()
      })
    });

    expect(result.recommended?.relativePath).toBe("Scolarite/Lea");
    expect(result.options.find((option) => option.label === "detaille")?.recommended).toBe(false);
  });

  it("recommends level 3 for a school certificate when the annual folder already exists", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({
        documentType: "certificat-scolarite",
        target: "lea",
        dateToken: "2026",
        dateSelection: schoolYearSelection()
      }),
      knownRelativeFolders: ["Scolarite/Lea/2026-2027"]
    });

    expect(result.recommended?.relativePath).toBe("Scolarite/Lea/2026-2027");
    expect(result.recommended?.source).toBe("inventory");
  });

  it("recommends level 3 for school report cards", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({
        documentType: "bulletin-scolaire",
        target: "lea",
        dateToken: "2026",
        dateSelection: schoolYearSelection()
      })
    });

    expect(result.recommended?.relativePath).toBe("Scolarite/Lea/2026-2027");
  });

  it("recommends Fiscalite/Foyer/2025 for tax notice", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "avis-imposition", target: "foyer", dateToken: "2025" })
    });

    expect(result.recommended?.relativePath).toBe("Fiscalite/Foyer/2025");
  });

  it("recommends Vehicules/Captur for Captur maintenance invoice", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-entretien", target: "captur", dateToken: "2024" })
    });

    expect(result.recommended?.relativePath).toBe("Vehicules/Captur");
  });

  it("recommends Sante/Paul for vaccination record", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "carnet-vaccination", target: "paul", dateToken: "2026" })
    });

    expect(result.recommended?.relativePath).toBe("Sante/Paul");
  });

  it("recommends Identite-famille/Paul for identity card", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "carte-identite", target: "paul", dateToken: "2026" })
    });

    expect(result.recommended?.relativePath).toBe("Identite-famille/Paul");
  });

  it("recommends Maison/Energie/2026 for energy invoice", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-energie", target: "maison-principale", dateToken: "2026-02" })
    });

    expect(result.recommended?.relativePath).toBe("Maison/Energie/2026");
  });

  it("falls back to Divers/A-traiter-manuellement for unknown documents", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "type-inconnu", target: "foyer", dateToken: "2026" })
    });

    expect(result.recommended?.relativePath).toBe("Divers/A-traiter-manuellement");
    expect(result.warnings.join(" ")).toContain("Type documentaire");
  });

  it("warns when target is missing for health, school or identity documents", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "carnet-vaccination", dateToken: "2026" })
    });

    expect(result.warnings.join(" ")).toContain("Cible absente");
  });

  it("uses existing folders to increase detailed priority", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-entretien", target: "captur", dateToken: "2026" }),
      knownRelativeFolders: ["Vehicules/Captur/2026"]
    });

    expect(result.recommended?.relativePath).toBe("Vehicules/Captur/2026");
    expect(result.recommended?.source).toBe("inventory");
  });

  it("uses an inventory recommended folder without presenting it as a user preference", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({
        documentType: "certificat-scolarite",
        target: "lea",
        dateToken: "2026",
        dateSelection: schoolYearSelection()
      }),
      knownRelativeFolders: ["Scolarite"],
      inventoryRecommendedRelativePath: "Scolarite"
    });

    expect(result.recommended?.relativePath).toBe("Scolarite");
    expect(result.recommended?.source).toBe("inventory");
    expect(result.recommended?.reasons.join(" ")).toContain("arborescence cible");
    expect(result.recommended?.reasons.join(" ")).not.toContain("Préférence");
  });

  it("uses similar document stats to increase detailed priority", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-entretien", target: "captur", dateToken: "2026" }),
      knownFolderStats: [{ relativePath: "Vehicules/Captur/2026", similarDocumentCount: 5 }]
    });

    expect(result.recommended?.relativePath).toBe("Vehicules/Captur/2026");
  });

  it("uses user folder preferences", () => {
    const result = buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-entretien", target: "captur", dateToken: "2026" }),
      userFolderPreferences: [
        {
          matchKey: "documentType:facture-entretien|target:captur",
          preferredRelativePath: "Vehicules/Captur/Entretien"
        }
      ]
    });

    expect(result.recommended?.relativePath).toBe("Vehicules/Captur/Entretien");
    expect(result.recommended?.source).toBe("preference");
  });

  it("does not create, rename, move or delete files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-folder-suggestions-"));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, "source"));
    await writeFile(path.join(directory, "source", "document.pdf"), "test", "utf8");
    const before = await readdir(path.join(directory, "source"));

    buildTargetFolderSuggestionsV2({
      draft: createDraft({ documentType: "facture-entretien", target: "captur", dateToken: "2026" })
    });

    const after = await readdir(path.join(directory, "source"));
    expect(after).toEqual(before);
  });
});

function createDraft(fields: Partial<SuggestionDraftV2>): SuggestionDraftV2 {
  return {
    confidence: 80,
    reasons: [],
    warnings: [],
    source: {},
    namingMessages: [],
    ...fields
  };
}

function schoolYearSelection(): SelectedDateToken {
  return {
    dateToken: "2026",
    selected: {
      token: "2026-2027",
      precision: "school-year",
      role: "period",
      source: "text",
      confidence: 95,
      reasons: ["Année scolaire détectée."],
      warnings: []
    },
    candidates: [],
    confidence: 95,
    reasons: [],
    warnings: []
  };
}
