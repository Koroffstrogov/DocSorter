import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeAiDiagnostic } from "./aiDiagnostic";

describe("AI diagnostics", () => {
  it("keeps the invalid AI output field in the exported diagnostic", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "T03-bulletin_scolaire_lea_t1.pdf",
      extension: ".pdf",
      textContext: {
        source: "pdf-native",
        excerpt: "Bulletin scolaire Lea trimestre 1."
      },
      aiResult: {
        ok: false,
        error: {
          code: "AI_OUTPUT_INVALID",
          message: "Le candidat sélectionné IA doit être présent dans la liste des candidats.",
          field: "fields.documentType.selected"
        }
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].filePath).toContain(path.join("diagnostics", "2026-06-19T15-05-04-635Z_diagnostic-ia_T03-bulletin_scolaire_lea_t1.json"));

    const log = JSON.parse(writes[0].content);
    expect(log.ia.error).toMatchObject({
      code: "AI_OUTPUT_INVALID",
      message: "Le candidat sélectionné IA doit être présent dans la liste des candidats.",
      field: "fields.documentType.selected"
    });
  });

  it("keeps rejected candidate raw values in complete diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "T07-carte-identite-paul.pdf",
      extension: ".pdf",
      textContext: null,
      aiResult: {
        ok: true,
        value: createAiDiagnosticSuggestion()
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.ia.value.responseJson.rejectedCandidates[0]).toMatchObject({
      field: "fields.issuer.candidates",
      index: 0,
      rawValue: "C:\\secret\\etat",
      normalizedValue: "c-secret-etat",
      reason: "Candidat IA invalide : les chemins locaux sont refusés."
    });
  });

  it("keeps global validation errors with raw values in complete diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "T07-carte-identite-paul.pdf",
      extension: ".pdf",
      textContext: null,
      aiResult: {
        ok: false,
        error: {
          code: "AI_OUTPUT_INVALID",
          message: "Dossier cible IA invalide ou dangereux.",
          field: "targetFolder",
          validationErrors: [
            {
              field: "targetFolder",
              rawValue: "C:\\secret\\Identite",
              normalizedValue: "c-secret-identite",
              reason: "Dossier cible IA invalide ou dangereux."
            }
          ]
        }
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.validationErrors[0]).toMatchObject({
      field: "targetFolder",
      rawValue: "C:\\secret\\Identite",
      normalizedValue: "c-secret-identite",
      reason: "Dossier cible IA invalide ou dangereux."
    });
    expect(log.ia.error.validationErrors[0]).toMatchObject({
      rawValue: "C:\\secret\\Identite"
    });
  });

  it("removes rejected candidate raw values from redacted diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "carte-identite-paul.pdf",
      extension: ".pdf",
      textContext: null,
      aiResult: {
        ok: true,
        value: createAiDiagnosticSuggestion()
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.mode).toBe("diagnosticExpurge");
    expect(log.ia.value.responseJson.rejectedCandidates[0]).toEqual({
      field: "fields.issuer.candidates",
      index: 0,
      evidence: "none",
      reason: "Candidat IA invalide : les chemins locaux sont refusés."
    });
  });

  it("removes global validation raw values from redacted diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "carte-identite-paul.pdf",
      extension: ".pdf",
      textContext: null,
      aiResult: {
        ok: false,
        error: {
          code: "AI_OUTPUT_INVALID",
          message: "Dossier cible IA invalide ou dangereux.",
          field: "targetFolder",
          validationErrors: [
            {
              field: "targetFolder",
              rawValue: "C:\\secret\\Identite",
              normalizedValue: "c-secret-identite",
              reason: "Dossier cible IA invalide ou dangereux."
            }
          ]
        }
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.validationErrors[0]).toEqual({
      field: "targetFolder",
      reason: "Dossier cible IA invalide ou dangereux."
    });
    expect(log.ia.error.validationErrors[0]).toEqual({
      field: "targetFolder",
      reason: "Dossier cible IA invalide ou dangereux."
    });
  });

  it("keeps diagnostic pipeline structure but removes raw values in redacted diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const suggestion = {
      ...createAiDiagnosticSuggestion(),
      diagnosticPipeline: [
        {
          id: "aligned-name-proposal",
          status: "ok",
          inputs: {
            aiName: "2026-05_foyer_releve-bancaire_bnp.pdf",
            detectedPattern: "DATE_DOCUMENT_CIBLE_EMETTEUR"
          },
          variables: {
            appliedChanges: ["target", "issuer"],
            confidence: 85
          },
          output: {
            alignedName: "2026-05_releve-bancaire_compte-joint_bnp-paribas.pdf"
          },
          warnings: ["Nom aligné proposé pour compte joint."]
        }
      ]
    };

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "releve-bancaire.pdf",
      extension: ".pdf",
      textContext: null,
      aiResult: {
        ok: true,
        value: suggestion
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.ia.value.diagnosticPipeline[0]).toMatchObject({
      id: "aligned-name-proposal",
      status: "ok",
      inputs: {
        aiName: "[valeur-expurgée]",
        detectedPattern: "[valeur-expurgée]"
      },
      output: {
        alignedName: "[valeur-expurgée]"
      },
      warnings: ["[avertissement-expurgé]"]
    });
    expect(JSON.stringify(log.ia.value.diagnosticPipeline)).not.toContain("compte-joint");
    expect(JSON.stringify(log.ia.value.diagnosticPipeline)).not.toContain("bnp-paribas");
  });

  it("keeps PDF text quality metrics in complete diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const suggestion = {
      ...createAiDiagnosticSuggestion(),
      pdfTextQuality: createPdfTextQuality()
    };

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "T08-document-hybride.pdf",
      extension: ".pdf",
      textContext: null,
      aiResult: {
        ok: true,
        value: suggestion
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.ia.value.pdfTextQuality).toMatchObject({
      pageCount: 2,
      decision: "hybrid-ocr-recommended",
      usefulTextChars: 220
    });
    expect(log.ia.value.pdfTextQuality.pages[1]).toMatchObject({
      page: 2,
      status: "text-empty"
    });
  });

  it("keeps only bounded PDF text quality metrics in redacted diagnostics", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const suggestion = {
      ...createAiDiagnosticSuggestion(),
      pdfTextQuality: createPdfTextQuality()
    };

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "document-hybride.pdf",
      extension: ".pdf",
      textContext: {
        source: "pdf-native",
        excerpt: "Texte sensible 12/05/2026 numero 123456789012"
      },
      aiResult: {
        ok: true,
        value: suggestion
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    const log = JSON.parse(writes[0].content);
    expect(log.ia.value.pdfTextQuality).toMatchObject({
      pageCount: 2,
      decision: "hybrid-ocr-recommended"
    });
    expect(JSON.stringify(log)).not.toContain("123456789012");
    expect(JSON.stringify(log)).not.toContain("12/05/2026");
  });
});

function createAiDiagnosticSuggestion(): any {
  return {
    status: "ready",
    documentName: "T07-carte-identite-paul.pdf",
    extension: ".pdf",
    model: "gemma3:4b",
    suggestedAt: "2026-06-19T15:05:04.635Z",
    textSource: "pdf-native",
    modelStatus: {
      status: "ready",
      model: "gemma3:4b",
      message: "Modèle prêt.",
      loadedAt: null,
      keepAliveUntil: null,
      lastCheckedAt: null,
      error: null
    },
    input: {
      filename: "T07-carte-identite-paul.pdf",
      extension: ".pdf",
      extractedTextExcerpt: "",
      ocrTextExcerpt: "",
      knownRelativeFolders: [],
      availableRootFolders: [],
      namingConvention: "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext",
      detectedDate: "",
      detectedYear: ""
    },
    profile: {
      id: "gemma3-4b",
      label: "Gemma 3 4B",
      model: "gemma3:4b",
      think: false
    },
    responseJson: {
      fields: {},
      folderCandidates: [],
      fileNameCandidates: [],
      warnings: ["Certains candidats IA ont été ignorés. Analyse conservée."],
      rejectedCandidates: [
        {
          field: "fields.issuer.candidates",
          index: 0,
          rawValue: "C:\\secret\\etat",
          normalizedValue: "c-secret-etat",
          evidence: "none",
          reason: "Candidat IA invalide : les chemins locaux sont refusés."
        }
      ],
      confidence: 80,
      source: "ollama"
    },
    thinking: null,
    suggestion: {
      dateToken: "2023-11-02",
      target: "paul",
      documentType: "carte-identite",
      confidence: 80,
      reasons: [],
      warnings: ["Certains candidats IA ont été ignorés. Analyse conservée."],
      source: "ollama"
    },
    promptCharacterCount: 120,
    message: "Certains candidats IA ont été ignorés. Analyse conservée."
  };
}

function createPdfTextQuality(): any {
  return {
    pageCount: 2,
    nativeTextChars: 240,
    usefulTextChars: 220,
    decision: "hybrid-ocr-recommended",
    reason: "Certaines pages PDF ont peu ou pas de texte natif.",
    warnings: ["PDF hybride : OCR recommandé sur certaines pages."],
    pages: [
      {
        page: 1,
        rawTextChars: 230,
        usefulTextChars: 220,
        approximateWordCount: 42,
        readableCharRatio: 0.96,
        status: "text-ok"
      },
      {
        page: 2,
        rawTextChars: 10,
        usefulTextChars: 0,
        approximateWordCount: 0,
        readableCharRatio: 0,
        status: "text-empty"
      }
    ]
  };
}
