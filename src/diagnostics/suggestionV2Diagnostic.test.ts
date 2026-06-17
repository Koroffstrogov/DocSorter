import path from "node:path";

import { describe, expect, it } from "vitest";

import type { SuggestionV2Result } from "../suggestions/buildSuggestionV2ForDocument";
import {
  redactDiagnosticValue,
  resolveDiagnosticMode,
  writeSuggestionV2Diagnostic
} from "./suggestionV2Diagnostic";

describe("suggestion v2 diagnostics", () => {
  it("allows complete diagnostics only for TXX documents", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const result = await writeSuggestionV2Diagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "T01-facture-captur.pdf",
      extension: ".pdf",
      textContext: {
        source: "pdf-native",
        excerpt: "Texte complet autorisé pour test T01."
      },
      legacyDraft: { keywords: "entretien" },
      suggestionResult: createSuggestionResult(),
      now: () => new Date("2026-06-17T10:00:00.000Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.mode).toBe("diagnosticComplet");
    expect(writes).toHaveLength(1);
    const log = JSON.parse(writes[0].content);
    expect(log.mode).toBe("diagnosticComplet");
    expect(log.text.text).toBe("Texte complet autorisé pour test T01.");
    expect(log.document.name).toBe("T01-facture-captur.pdf");
    expect(log.dossiers.candidats[0].score).toBe(95);
  });

  it("forces redacted diagnostics for normal documents", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const sensitiveText = [
      "Chemin C:\\Users\\Seb\\Documents\\secret.pdf",
      "Naissance 16/06/2012",
      "NIR 1 84 12 75 123 456 78",
      "x".repeat(800)
    ].join(" ");

    const result = await writeSuggestionV2Diagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "facture-captur.pdf",
      extension: ".pdf",
      textContext: {
        source: "pdf-native",
        excerpt: sensitiveText
      },
      legacyDraft: {
        documentDate: "16/06/2012",
        subject: "C:\\Users\\Seb\\Documents\\secret.pdf",
        documentType: "facture",
        keywords: "184127512345678"
      },
      suggestionResult: createSuggestionResult(),
      now: () => new Date("2026-06-17T10:00:00.000Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.mode).toBe("diagnosticExpurge");
    const log = JSON.parse(writes[0].content);
    const serialized = JSON.stringify(log);
    expect(log.text.excerpt.length).toBeLessThanOrEqual(500);
    expect(serialized).not.toContain("C:\\Users\\Seb");
    expect(serialized).not.toContain("16/06/2012");
    expect(serialized).not.toContain("184127512345678");
    expect(serialized).toContain("[chemin-expurgé]");
    expect(serialized).toContain("[date-expurgée]");
    expect(serialized).toContain("[numero-expurgé]");
  });

  it("uses only diagnostics directory creation and log writing", async () => {
    const directories: string[] = [];
    const writes: string[] = [];

    await writeSuggestionV2Diagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "document.pdf",
      extension: ".pdf",
      textContext: null,
      legacyDraft: null,
      suggestionResult: createSuggestionResult(),
      makeDirectory: async (directoryPath) => {
        directories.push(directoryPath);
      },
      writeTextFile: async (filePath) => {
        writes.push(filePath);
      }
    });

    expect(directories).toEqual([path.join("C:\\tmp\\docsorter-user-data", "diagnostics")]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(path.join("C:\\tmp\\docsorter-user-data", "diagnostics"));
  });

  it("resolves mode from document name only", () => {
    expect(resolveDiagnosticMode("T01-facture.pdf")).toBe("diagnosticComplet");
    expect(resolveDiagnosticMode("C:\\tmp\\T02-facture.pdf")).toBe("diagnosticComplet");
    expect(resolveDiagnosticMode("t01-facture.pdf")).toBe("diagnosticExpurge");
    expect(resolveDiagnosticMode("facture-T01.pdf")).toBe("diagnosticExpurge");
  });

  it("redacts absolute paths recursively", () => {
    expect(redactDiagnosticValue({ nested: { path: "C:\\secret\\file.pdf" } })).toEqual({
      nested: {
        path: "[chemin-expurgé]"
      }
    });
  });
});

function createSuggestionResult(): SuggestionV2Result {
  return {
    ok: true,
    value: {
      status: "ready",
      documentName: "facture-captur.pdf",
      extension: ".pdf",
      draft: {
        dateToken: "2024-03-05",
        target: "captur",
        documentType: "facture-entretien",
        detail: "vidange",
        proposedName: "2024-03-05_captur_facture-entretien_vidange.pdf",
        semanticDeduplication: {
          changed: true,
          removedTerms: ["entretien"],
          before: { detail: "entretien-vidange" },
          after: { detail: "vidange" },
          reasons: ["Doublons sémantiques retirés des blocs émetteur/détail."]
        },
        confidence: 80,
        reasons: [],
        warnings: [],
        source: {},
        namingMessages: []
      },
      targetFolderSuggestion: {
        recommended: {
          label: "equilibre",
          relativePath: "Véhicules/Captur",
          depth: 2,
          recommended: true,
          confidence: 95,
          reasons: ["Dossier existant correspondant à Captur."],
          warnings: [],
          source: "preference"
        },
        options: [],
        warnings: [],
        reasons: []
      },
      folderPlacement: {
        relativePath: "Véhicules/Captur",
        score: 95,
        confidence: 95,
        exists: true,
        source: "inventory",
        reasons: ["Dossier existant correspondant à Captur."],
        warnings: []
      },
      folderPlacementCandidates: [
        {
          relativePath: "Véhicules/Captur",
          score: 95,
          confidence: 95,
          exists: true,
          source: "inventory",
          reasons: ["Dossier existant correspondant à Captur."],
          warnings: []
        }
      ],
      folderNamingProfile: null,
      missingFields: [],
      referenceDataWarnings: [],
      builtAt: "2026-06-17T10:00:00.000Z",
      message: "Suggestion v2 expérimentale prête."
    }
  };
}
