import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

describe("rendererAiFlow V2 application helpers", () => {
  it("replaces reference-data values when AI confidence is at least 70", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestion as (
      draft: Record<string, string>,
      origins: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; origins: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "2026",
        subject: "captur",
        documentType: "facture-entretien",
        keywords: "renault"
      },
      {
        documentDate: "date-engine",
        subject: "reference-data",
        documentType: "reference-data",
        keywords: "reference-data"
      },
      {
        dateToken: "2026-06-17",
        target: "lea",
        documentType: "certificat-scolarite",
        issuer: "college-monet",
        detail: "inscription",
        confidence: 70
      }
    );

    expect(result.draft).toEqual({
      documentDate: "2026-06-17",
      subject: "lea",
      documentType: "certificat-scolarite",
      keywords: "college-monet inscription"
    });
    expect(result.origins).toEqual({
      documentDate: "ai-v2",
      subject: "ai-v2",
      documentType: "ai-v2",
      keywords: "ai-v2"
    });
  });

  it("does not replace non-empty values below confidence 70", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestion as (
      draft: Record<string, string>,
      origins: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "2026",
        subject: "captur",
        documentType: "facture-entretien",
        keywords: "renault"
      },
      createAutoOrigins("reference-data"),
      {
        dateToken: "2026-06-17",
        target: "lea",
        documentType: "certificat-scolarite",
        issuer: "college-monet",
        detail: "inscription",
        confidence: 69
      }
    );

    expect(result.draft).toEqual({
      documentDate: "2026",
      subject: "captur",
      documentType: "facture-entretien",
      keywords: "renault"
    });
    expect(result.appliedFields).toEqual([]);
  });

  it("uses AI subject before target for the rename subject field", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestion as (
      draft: Record<string, string>,
      origins: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      createAutoOrigins("fallback"),
      {
        dateToken: "2026",
        subject: "paul",
        target: "famille",
        documentType: "carnet-vaccination",
        confidence: 80
      }
    );

    expect(result.draft.subject).toBe("paul");
    expect(result.appliedFields).toContain("subject");
  });

  it("removes DocSorter artifacts from non-manual fields when applying AI", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestion as (
      draft: Record<string, string>,
      origins: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "2024-03-15",
        subject: "renault-captur-facture",
        documentType: "facture",
        keywords: "docsorter-local"
      },
      {
        documentDate: "ai-v2",
        subject: "ai-v2",
        documentType: "ai-v2",
        keywords: "ai-v2"
      },
      {
        dateToken: "2024-03-15",
        subject: "renault-captur",
        documentType: "facture",
        confidence: 85
      }
    );

    expect(result.draft).toEqual({
      documentDate: "2024-03-15",
      subject: "renault-captur",
      documentType: "facture",
      keywords: ""
    });
    expect(result.appliedFields).toContain("keywords");
  });

  it("never replaces manual fields", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestion as (
      draft: Record<string, string>,
      origins: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "2026",
        subject: "saisi",
        documentType: "type-saisi",
        keywords: "mot-cle"
      },
      createAutoOrigins("manual"),
      {
        dateToken: "2026-06-17",
        target: "lea",
        documentType: "certificat-scolarite",
        issuer: "college-monet",
        detail: "inscription",
        confidence: 95
      }
    );

    expect(result.draft.subject).toBe("saisi");
    expect(result.draft.keywords).toBe("mot-cle");
    expect(result.appliedFields).toEqual([]);
  });

  it("fills empty fields even below priority confidence", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestion as (
      draft: Record<string, string>,
      origins: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      createAutoOrigins("manual"),
      {
        dateToken: "2026",
        target: "lea",
        documentType: "certificat-scolarite",
        issuer: "college-monet",
        detail: "",
        confidence: 69
      }
    );

    expect(result.draft).toEqual({
      documentDate: "2026",
      subject: "lea",
      documentType: "certificat-scolarite",
      keywords: "college-monet"
    });
    expect(result.appliedFields).toEqual(["documentDate", "subject", "documentType", "keywords"]);
  });

  it("applies AI folder only with target root and non-manual replaceable folder", async () => {
    const context = await loadAiFlow();
    const canApplyFolder = context.canApplyAiSuggestionTargetFolder as (
      targetFolder: string,
      confidence: number
    ) => boolean;
    const state = context.state as TestState;

    state.targetPath = null;
    state.targetFolder.selectedFolder = "";
    expect(canApplyFolder("Scolarite/Lea", 95)).toBe(false);

    state.targetPath = "Z:\\cible";
    expect(canApplyFolder("Scolarite/Lea", 69)).toBe(true);

    state.targetFolder.selectedFolder = "Scolarite";
    state.targetFolder.origin = "folder-inventory";
    expect(canApplyFolder("Scolarite/Lea", 70)).toBe(true);
    expect(canApplyFolder("Scolarite/Lea", 69)).toBe(false);
    expect(canApplyFolder("Scolarité", 95)).toBe(false);

    state.targetFolder.selectedFolder = "Véhicules";
    state.targetFolder.origin = "ai-v2";
    expect(canApplyFolder("Sante/Paul", 40)).toBe(true);
    expect(canApplyFolder("Vehicules", 95)).toBe(false);

    state.targetFolder.origin = "manual";
    expect(canApplyFolder("Scolarite/Lea", 95)).toBe(false);
  });

  it("builds an interactive AI selection from selected multi-candidates", async () => {
    const context = await loadAiFlow();
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => Record<string, unknown>;

    const selection = buildSelection(createAiSuggestion(), ".pdf", "Z:\\cible") as TestAiSelection;

    expect(selection.fields).toMatchObject({
      dateToken: "2024-03-15",
      subject: "renault-captur",
      target: "captur",
      documentType: "facture",
      issuer: "renault",
      detail: "vidange"
    });
    expect(selection.selectedFolder).toBe("Vehicules/Captur");
    expect(selection.previewFilename).toBe("2024-03-15_captur_facture_renault_vidange.pdf");
    expect(selection.previewDestinationFolder).toBe("Vehicules/Captur");
  });

  it("recalculates the AI filename when Date or Cible candidates change", async () => {
    const context = await loadAiFlow();
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const updateField = context.updateAiSelectionField as (
      selection: TestAiSelection,
      field: string,
      value: string,
      source: string,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;

    const initial = buildSelection(createAiSuggestion(), ".pdf", "Z:\\cible");
    const withDate = updateField(initial, "dateToken", "2025", "candidate", ".pdf", "Z:\\cible");
    const withTarget = updateField(withDate, "target", "zoe", "candidate", ".pdf", "Z:\\cible");

    expect(withDate.previewFilename).toBe("2025_captur_facture_renault_vidange.pdf");
    expect(withTarget.previewFilename).toBe("2025_zoe_facture_renault_vidange.pdf");
    expect(withTarget.manualFields).not.toHaveProperty("target");
  });

  it("recalculates the AI filename from manual field edits without using fileNameCandidates", async () => {
    const context = await loadAiFlow();
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const updateField = context.updateAiSelectionField as (
      selection: TestAiSelection,
      field: string,
      value: string,
      source: string,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;

    const initial = buildSelection(createAiSuggestion(), ".pdf", "Z:\\cible");
    const updated = updateField(initial, "documentType", "facture entretien", "manual", ".pdf", "Z:\\cible");

    expect(updated.previewFilename).toBe("2024-03-15_captur_facture-entretien_renault_vidange.pdf");
    expect(updated.previewFilename).not.toBe("ne-pas-utiliser.pdf");
    expect(updated.manualFields).toMatchObject({ documentType: true });
  });

  it("handles optional none and redundant detail values in the AI preview name", async () => {
    const context = await loadAiFlow();
    const buildPreview = context.buildAiSelectionPreview as (
      fields: Record<string, string>,
      extension: string
    ) => { filename: string; isValid: boolean; messages: Array<{ message: string }> };

    const none = buildPreview({
      dateToken: "2026-02",
      subject: "lea",
      target: "lea",
      documentType: "carnet-vaccination",
      issuer: "aucun",
      detail: "aucun"
    }, ".pdf");
    const monthlyDetail = buildPreview({
      dateToken: "2026-02",
      subject: "foyer",
      target: "foyer",
      documentType: "releve-bancaire",
      issuer: "bnp-paribas",
      detail: "fevrier-2026"
    }, ".pdf");
    const redundant = buildPreview({
      dateToken: "2026",
      subject: "lea",
      target: "lea",
      documentType: "carnet-vaccination",
      issuer: "lea",
      detail: "carnet-vaccination"
    }, ".pdf");

    expect(none.filename).toBe("2026-02_lea_carnet-vaccination.pdf");
    expect(none.messages.map((message) => message.message)).not.toContain(
      "Date IA au mois convertie au premier jour du mois."
    );
    expect(monthlyDetail.filename).toBe("2026-02_foyer_releve-bancaire_bnp-paribas.pdf");
    expect(redundant.filename).toBe("2026_lea_carnet-vaccination.pdf");
  });

  it("keeps a document without date incomplete instead of inventing a year", async () => {
    const context = await loadAiFlow();
    const buildPreview = context.buildAiSelectionPreview as (
      fields: Record<string, string>,
      extension: string
    ) => { filename: string; isValid: boolean; messages: Array<{ level: string; message: string }> };

    const preview = buildPreview({
      dateToken: "",
      subject: "",
      target: "foyer",
      documentType: "courrier",
      issuer: "",
      detail: ""
    }, ".pdf");

    expect(preview).toMatchObject({
      filename: "",
      isValid: false
    });
    expect(preview.messages).toContainEqual({
      level: "error",
      message: "Date IA obligatoire : AAAA, AAAA-MM ou AAAA-MM-JJ."
    });
  });

  it("recalculates the AI destination folder when a folder candidate is selected", async () => {
    const context = await loadAiFlow();
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const recalculate = context.recalculateAiSelection as (
      selection: TestAiSelection,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;

    const initial = buildSelection(createAiSuggestion(), ".pdf", "Z:\\cible");
    const updated = recalculate(
      {
        ...initial,
        selectedFolder: "Vehicules/Captur/Entretien"
      },
      ".pdf",
      "Z:\\cible"
    );

    expect(updated.previewDestinationFolder).toBe("Vehicules/Captur/Entretien");
  });

  it("selects an AI folder candidate and syncs the existing target-folder state", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const selectFolder = context.selectAiFolderCandidate as (relativePath: string) => void;

    state.ai = {
      ...state.ai,
      suggestion: createAiSuggestion(),
      suggestionDocumentPath: "Z:\\source\\document.pdf",
      selection: buildSelection(createAiSuggestion(), ".pdf", "Z:\\cible")
    };

    selectFolder("Vehicules/Captur/Entretien");

    expect((state.ai.selection as TestAiSelection).selectedFolder).toBe("Vehicules/Captur/Entretien");
    expect((state.ai.selection as TestAiSelection).previewDestinationFolder).toBe("Vehicules/Captur/Entretien");
    expect(state.targetFolder.selectedFolder).toBe("Vehicules/Captur/Entretien");
    expect(state.targetFolder.origin).toBe("ai-v2");
    expect(context.targetFolderUpdates).toEqual([
      { folder: "Vehicules/Captur/Entretien", origin: "ai-v2" }
    ]);
  });

  it("applies the currently selected AI folder instead of the initial suggestion folder", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const applySuggestion = context.applyAiSuggestionToEmptyFields as () => void;
    const suggestion = createAiSuggestion();

    state.ai = {
      ...state.ai,
      suggestion,
      suggestionDocumentPath: "Z:\\source\\document.pdf",
      selection: {
        ...buildSelection(suggestion, ".pdf", "Z:\\cible"),
        selectedFolder: "Vehicules/Captur/Entretien"
      }
    };
    state.naming = {
      draft: {
        documentDate: "2024-03-15",
        subject: "captur",
        documentType: "facture",
        keywords: "renault vidange"
      },
      origins: createAutoOrigins("manual"),
      isLoading: false,
      overrideFilename: null,
      overrideFilenameOrigin: null
    };

    applySuggestion();

    expect(context.targetFolderUpdates).toContainEqual({
      folder: "Vehicules/Captur/Entretien",
      origin: "ai-v2"
    });
    expect(context.targetFolderUpdates).not.toContainEqual({
      folder: "Vehicules/Captur",
      origin: "ai-v2"
    });
    expect(state.targetFolder.selectedFolder).toBe("Vehicules/Captur/Entretien");
  });

  it("resets modified AI choices to the initial suggestion values", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const buildSelection = context.buildAiSelectionFromSuggestion as (
      suggestion: Record<string, unknown>,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const updateField = context.updateAiSelectionField as (
      selection: TestAiSelection,
      field: string,
      value: string,
      source: string,
      extension: string,
      targetRootPath: string | null
    ) => TestAiSelection;
    const canReset = context.canResetAiSelectionChoices as () => boolean;
    const reset = context.resetAiSelectionChoices as () => boolean;
    const suggestion = createAiSuggestion();

    state.ai = {
      ...state.ai,
      suggestion,
      suggestionDocumentPath: "Z:\\source\\document.pdf",
      selection: buildSelection(suggestion, ".pdf", "Z:\\cible")
    };
    expect(canReset()).toBe(false);

    state.ai.selection = {
      ...updateField(state.ai.selection as TestAiSelection, "documentType", "facture-entretien", "manual", ".pdf", "Z:\\cible"),
      selectedFolder: "Vehicules/Captur/Entretien",
      editingFolder: true
    };

    expect(canReset()).toBe(true);
    expect(reset()).toBe(true);
    expect(canReset()).toBe(false);
    expect(state.ai.selection).toMatchObject({
      fields: {
        documentType: "facture"
      },
      manualFields: {},
      editingField: null,
      editingFolder: false,
      selectedFolder: "Vehicules/Captur"
    });
    expect(state.targetFolder.selectedFolder).toBe("Vehicules/Captur");
  });

  it("preloads the IA model through test Ollama then preload", async () => {
    const context = await loadAiFlow();
    const calls: string[] = [];
    const state = context.state as TestState;
    const preload = context.preloadAiModelFromPanel as () => Promise<void>;
    (context.window as { docSorter: Record<string, unknown> }).docSorter = {
      testAiConnection: async () => {
        calls.push("test");
        return { ok: true, value: state.ai?.status };
      },
      preloadAiModel: async () => {
        calls.push("preload");
        return { ok: true, value: createReadyModelStatus() };
      }
    };

    await preload();

    expect(calls).toEqual(["test", "preload"]);
    expect(state.ai?.modelStatus).toMatchObject({ status: "ready", model: "gemma3:4b" });
    expect(state.ai?.timing).toMatchObject({ stage: "completed" });
  });

  it("orchestrates analysis by loading the model and extracting PDF text when missing", async () => {
    const context = await loadAiFlow();
    const calls: string[] = [];
    const state = context.state as TestState;
    const run = context.runAiSuggestionForActiveDocument as () => Promise<void>;
    context.extractTextFromActivePdf = async () => {
      calls.push("extract-pdf");
      state.textExtraction.byDocumentPath["Z:\\source\\document.pdf"] = {
        status: "text-found",
        result: {
          status: "text-found",
          source: "pdf-native",
          text: "texte extrait",
          excerpt: "texte extrait",
          characterCount: 12,
          excerptCharacterCount: 12
        },
        error: null
      };
    };
    (context.window as { docSorter: Record<string, unknown> }).docSorter = {
      testAiConnection: async () => {
        calls.push("test");
        return { ok: true, value: state.ai?.status };
      },
      preloadAiModel: async () => {
        calls.push("preload");
        return { ok: true, value: createReadyModelStatus() };
      },
      runAiSuggestionForActiveDocument: async () => {
        calls.push("analyze");
        return { ok: true, value: createAiSuggestion() };
      }
    };

    await run();

    expect(calls).toEqual(["test", "preload", "extract-pdf", "analyze"]);
    expect(state.ai?.panelStatus).toBe("suggestion-ready");
    expect(state.ai?.timing).toMatchObject({ stage: "completed" });
  });

  it("keeps AI analysis available with a warning when PDF text quality is incomplete", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const run = context.runAiSuggestionForActiveDocument as () => Promise<void>;
    state.textExtraction.byDocumentPath["Z:\\source\\document.pdf"] = {
      status: "text-found",
      result: {
        status: "text-found",
        source: "pdf-native",
        text: "Texte partiel exploitable",
        excerpt: "Texte partiel exploitable",
        characterCount: 24,
        excerptCharacterCount: 24,
        pdfTextQuality: createHybridPdfTextQuality()
      },
      error: null
    };
    (context.window as { docSorter: Record<string, unknown> }).docSorter = {
      testAiConnection: async () => ({ ok: true, value: state.ai?.status }),
      preloadAiModel: async () => ({ ok: true, value: createReadyModelStatus() }),
      runAiSuggestionForActiveDocument: async () => ({ ok: true, value: createAiSuggestion() })
    };

    await run();

    expect(state.ai?.panelStatus).toBe("suggestion-ready");
    const suggestion = state.ai?.suggestion as RendererAiDocumentSuggestion;
    expect(suggestion.pdfTextQuality).toMatchObject({ decision: "hybrid-ocr-recommended" });
    expect(suggestion.suggestion.warnings).toContain(
      "Le texte extrait semble incomplet. L'analyse IA peut être moins fiable."
    );
  });

  it("uses fused PDF OCR text as the next IA context", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const run = context.runAiSuggestionForActiveDocument as () => Promise<void>;
    let capturedTextContext: RendererAiDocumentTextContext | null = null;
    state.textExtraction.byDocumentPath["Z:\\source\\document.pdf"] = {
      status: "text-found",
      result: {
        status: "text-found",
        source: "pdf-hybrid",
        finalTextSource: "pdf-hybrid",
        text: "Texte natif conservé\nTexte OCR page deux",
        excerpt: "Texte natif conservé\nTexte OCR page deux",
        characterCount: 39,
        excerptCharacterCount: 39,
        pdfTextQuality: createHybridPdfTextQuality(),
        pdfOcr: {
          requestedPages: [2],
          succeededPages: [2],
          failedPages: [],
          durationMs: 120,
          ocrCharacterCount: 19,
          renderer: "pdftoppm",
          dpi: 200,
          pages: [
            {
              page: 2,
              status: "success",
              usefulTextChars: 16
            }
          ],
          warnings: []
        }
      },
      error: null
    };
    (context.window as { docSorter: Record<string, unknown> }).docSorter = {
      testAiConnection: async () => ({ ok: true, value: state.ai?.status }),
      preloadAiModel: async () => ({ ok: true, value: createReadyModelStatus() }),
      runAiSuggestionForActiveDocument: async (_documentPath: string, textContext: RendererAiDocumentTextContext) => {
        capturedTextContext = textContext;
        return { ok: true, value: createAiSuggestion() };
      }
    };

    await run();

    expect(capturedTextContext).toEqual({
      source: "pdf-hybrid",
      excerpt: "Texte natif conservé\nTexte OCR page deux"
    });
    expect(state.ai?.suggestion).toMatchObject({
      finalTextSource: "pdf-hybrid",
      pdfOcr: {
        requestedPages: [2],
        succeededPages: [2],
        failedPages: []
      }
    });
  });

  it("does not launch OCR automatically when image text is missing", async () => {
    const context = await loadAiFlow();
    const calls: string[] = [];
    const state = context.state as TestState;
    const run = context.runAiSuggestionForActiveDocument as () => Promise<void>;
    context.getActiveDocument = () => ({
      name: "image.png",
      filePath: "Z:\\source\\image.png",
      extension: ".png",
      status: "pending"
    });
    state.activeDocumentPath = "Z:\\source\\image.png";
    (context.window as { docSorter: Record<string, unknown> }).docSorter = {
      testAiConnection: async () => {
        calls.push("test");
        return { ok: true, value: state.ai?.status };
      },
      preloadAiModel: async () => {
        calls.push("preload");
        return { ok: true, value: createReadyModelStatus() };
      },
      runOcrForActiveImage: async () => {
        calls.push("ocr");
      }
    };

    await run();

    expect(calls).toEqual(["test", "preload"]);
    expect(state.ai?.error).toMatchObject({ code: "AI_TEXT_NOT_AVAILABLE" });
  });

  it("maps model profiles to top-level think settings", async () => {
    const context = await loadAiFlow();
    const toSettings = context.aiDraftToSettings as (draft: Record<string, unknown>) => Record<string, unknown>;

    expect(toSettings({
      enabled: true,
      profileId: "gemma4-12b-thinking",
      baseUrl: "http://localhost:11434/",
      model: "gemma4:12b",
      timeoutMs: "30000",
      keepAlive: "30m"
    })).toMatchObject({ think: true });
    expect(toSettings({
      enabled: true,
      profileId: "gemma4-12b-nothink",
      baseUrl: "http://localhost:11434/",
      model: "gemma4:12b",
      timeoutMs: "30000",
      keepAlive: "30m"
    })).toMatchObject({ think: false });
  });

  it("auto-saves the quick AI model profile selection", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const saveQuickProfile = context.saveAiSettingsFromQuickProfile as (
      draft: Record<string, unknown>
    ) => Promise<void>;
    const savedSettings: Record<string, unknown>[] = [];
    (context.window as { docSorter: Record<string, unknown> }).docSorter = {
      saveAiSettings: async (settings: Record<string, unknown>) => {
        savedSettings.push(settings);
        return {
          ok: true,
          value: {
            ...(state.ai.status as Record<string, unknown>),
            settings
          }
        };
      },
      getAiModelStatus: async () => ({ ok: true, value: createReadyModelStatus() })
    };

    await saveQuickProfile({
      ...(state.ai.draft as Record<string, unknown>),
      profileId: "gemma4-12b-thinking",
      model: "gemma4:12b"
    });

    expect(savedSettings).toHaveLength(1);
    expect(savedSettings[0]).toMatchObject({
      profileId: "gemma4-12b-thinking",
      model: "gemma4:12b",
      think: true
    });
    expect(state.ai.dirty).toBe(false);
    expect(state.ai.draft).toMatchObject({
      profileId: "gemma4-12b-thinking",
      model: "gemma4:12b"
    });
  });

  it("adds the folder-learning pipeline to the exported AI diagnostic", async () => {
    const context = await loadAiFlow();
    const state = context.state as TestState;
    const exportAiDiagnostic = vi.fn(async () => ({
      ok: true,
      value: {
        message: "Diagnostic IA complet exporté."
      }
    }));
    ((context.window as Record<string, any>).docSorter as Record<string, unknown>).exportAiDiagnostic = exportAiDiagnostic;
    state.textExtraction.byDocumentPath["Z:\\source\\document.pdf"] = {
      result: {
        status: "text-found",
        source: "pdf-native",
        text: "Relevé bancaire compte joint mai 2026"
      }
    };
    state.ai.suggestion = createAiSuggestion();
    (state.ai.suggestion as RendererAiDocumentSuggestion).pdfTextQuality = createHybridPdfTextQuality();
    state.ai.suggestionDocumentPath = "Z:\\source\\document.pdf";
    state.folderLearning.pipeline = [
      pipelineStep("content-ai-analysis"),
      pipelineStep("folder-candidate"),
      pipelineStep("folder-name-scan"),
      pipelineStep("folder-schema-analysis"),
      pipelineStep("aligned-name-proposal")
    ];

    await (context.exportAiDiagnosticForActiveDocument as () => Promise<void>)();

    expect(exportAiDiagnostic).toHaveBeenCalledTimes(1);
    const aiResult = exportAiDiagnostic.mock.calls[0]?.[2] as Record<string, any>;
    expect(aiResult.value.folderLearningPipeline.map((step: FolderLearningPipelineStep) => step.id)).toEqual([
      "content-ai-analysis",
      "folder-candidate",
      "folder-name-scan",
      "folder-schema-analysis",
      "aligned-name-proposal"
    ]);
    expect(aiResult.value.diagnosticPipeline.map((step: AiDiagnosticPipelineStep) => step.id)).toEqual([
      "content-ai-analysis",
      "candidate-validation",
      "folder-candidate",
      "folder-name-scan",
      "folder-schema-analysis",
      "aligned-name-proposal",
      "user-name-choice",
      "classification-readiness"
    ]);
    expect(aiResult.value.diagnosticPipeline.map((step: AiDiagnosticPipelineStep) => step.status)).not.toContain("ready");
    expect(aiResult.value.diagnosticPipeline[0]).toMatchObject({
      id: "content-ai-analysis",
      status: "warning",
      inputs: {
        pdfTextQualityDecision: "hybrid-ocr-recommended"
      },
      variables: {
        pdfAffectedPageCount: 1
      },
      output: {
        pdfTextQuality: {
          decision: "hybrid-ocr-recommended",
          pages: [
            { page: 1, status: "text-ok" },
            { page: 2, status: "text-empty" }
          ]
        }
      }
    });
    expect(aiResult.value.diagnosticPipeline[1]).toMatchObject({
      id: "candidate-validation",
      status: "ok"
    });
  });
});

async function loadAiFlow(): Promise<Record<string, unknown>> {
  const targetFolderUpdates: Array<{ folder: string; origin: string }> = [];
  const state: TestState = {
    targetPath: "Z:\\cible",
    targetFolder: {
      selectedFolder: "",
      origin: "fallback"
    },
    activeDocumentPath: "Z:\\source\\document.pdf",
    ai: createTestAiState(),
    naming: {
      draft: {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      origins: createAutoOrigins("fallback"),
      isLoading: false,
      overrideFilename: null,
      overrideFilenameOrigin: null
    },
    folderLearning: {
      pipeline: []
    },
    textExtraction: {
      byDocumentPath: {}
    }
  };
  const context: Record<string, unknown> = {
    state,
    window: {
      setInterval: () => 1,
      clearInterval: () => undefined
    },
    aiPanel: {
      render: () => undefined
    },
    render: () => undefined,
    renderAiPanel: () => undefined,
    renderNamingPanel: () => undefined,
    renderPaths: () => undefined,
    resetClassificationState: () => undefined,
    resetDestinationCheck: () => undefined,
    recalculateFolderLearningComparison: () => undefined,
    clearFolderLearningAlignedNameOverride: () => false,
    isClassificationBusy: () => false,
    updateTargetFolderFromInput: async (folder: string, origin: string) => {
      targetFolderUpdates.push({ folder, origin });
      state.targetFolder.selectedFolder = folder;
      state.targetFolder.origin = origin;
    },
    targetFolderUpdates,
    aiRequestId: 0,
    aiSuggestionRequestId: 0,
    getActiveDocument: () => ({
      name: "document.pdf",
      filePath: "Z:\\source\\document.pdf",
      extension: ".pdf",
      status: "pending"
    }),
    extractTextFromActivePdf: async () => undefined,
    getTextExtractionState: (filePath: string) =>
      state.textExtraction.byDocumentPath[filePath] ?? {
        status: "idle",
        result: null,
        error: null
      },
    globalThis: {}
  };
  (context.window as Record<string, unknown>).docSorter = {};
  context.globalThis = context;

  const source = await readFile(path.join(process.cwd(), "src", "renderer", "rendererAiFlow.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  vm.runInNewContext(js, context as vm.Context);
  return context;
}

function createAutoOrigins(origin: string): Record<string, string> {
  return {
    documentDate: origin,
    subject: origin,
    documentType: origin,
    keywords: origin
  };
}

interface TestState {
  targetPath: string | null;
  activeDocumentPath?: string | null;
  targetFolder: {
    selectedFolder: string;
    origin: string;
  };
  ai: Record<string, unknown>;
  naming: {
    draft: Record<string, string>;
    origins: Record<string, string>;
    isLoading: boolean;
    overrideFilename: string | null;
    overrideFilenameOrigin: string | null;
  };
  folderLearning: {
    pipeline: FolderLearningPipelineStep[];
  };
  textExtraction: {
    byDocumentPath: Record<string, unknown>;
  };
}

interface TestAiSelection {
  fields: Record<string, string>;
  manualFields: Record<string, true>;
  editingField?: string | null;
  editingFolder?: boolean;
  selectedFolder: string;
  previewFilename: string;
  previewDestinationFolder: string;
}

function createAiSuggestion(): Record<string, unknown> {
  return {
    suggestion: {
      dateToken: "2024-03-15",
      subject: "renault-captur",
      target: "captur",
      documentType: "facture",
      issuer: "renault",
      detail: "vidange",
      targetFolder: "Vehicules/Captur",
      confidence: 90,
      reasons: [],
      warnings: [],
      source: "ollama"
    },
    responseJson: {
      fields: {
        dateToken: {
          selected: "2024-03-15",
          candidates: [
            { value: "2024-03-15", score: 92, reason: "date facture" },
            { value: "2025", score: 70, reason: "annee secondaire" }
          ]
        },
        subject: {
          selected: "renault-captur",
          candidates: [{ value: "renault-captur", score: 88, reason: "sujet document" }]
        },
        target: {
          selected: "captur",
          candidates: [
            { value: "captur", score: 90, reason: "vehicule detecte" },
            { value: "zoe", score: 55, reason: "vehicule alternatif" }
          ]
        },
        documentType: {
          selected: "facture",
          candidates: [{ value: "facture", score: 80, reason: "type detecte" }]
        },
        issuer: {
          selected: "renault",
          candidates: [{ value: "renault", score: 76, reason: "emetteur detecte" }]
        },
        detail: {
          selected: "vidange",
          candidates: [{ value: "vidange", score: 74, reason: "detail detecte" }]
        }
      },
      folderCandidates: [
        { value: "Vehicules/Captur", score: 90, reason: "existe", role: "existing", exists: true },
        {
          value: "Vehicules/Captur/Entretien",
          score: 82,
          reason: "plus precis",
          role: "newFolderProposal",
          requiresCreation: true
        }
      ],
      fileNameCandidates: [
        { value: "ne-pas-utiliser.pdf", score: 100, reason: "candidate ignored" }
      ]
    }
  };
}

function createHybridPdfTextQuality(): PdfTextQuality {
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
        usefulTextChars: 4,
        approximateWordCount: 1,
        readableCharRatio: 0.4,
        status: "text-empty"
      }
    ]
  };
}

function pipelineStep(id: FolderLearningPipelineStepId): FolderLearningPipelineStep {
  return {
    id,
    status: "ready",
    inputs: {},
    variables: {},
    output: {},
    warnings: []
  };
}

function createReadyModelStatus(): Record<string, unknown> {
  return {
    status: "ready",
    model: "gemma3:4b",
    message: "IA locale prête.",
    loadedAt: "2026-06-19T10:00:00.000Z",
    keepAliveUntil: "2026-06-19T10:30:00.000Z",
    lastCheckedAt: "2026-06-19T10:00:00.000Z",
    error: null
  };
}

function createTestAiState(): Record<string, unknown> {
  return {
    panelStatus: "ready",
    status: {
      status: "ok",
      settingsPath: "C:\\userData\\config\\ai-settings.json",
      settings: {
        enabled: true,
        provider: "ollama",
        baseUrl: "http://localhost:11434/",
        profileId: "gemma3-4b",
        model: "gemma3:4b",
        think: false,
        timeoutMs: 30000,
        keepAlive: "30m",
        lastTestAt: null,
        lastStatus: null,
        lastError: null
      },
      message: "IA locale prête.",
      error: null
    },
    draft: {
      enabled: true,
      profileId: "gemma3-4b",
      baseUrl: "http://localhost:11434/",
      model: "gemma3:4b",
      timeoutMs: "30000",
      keepAlive: "30m"
    },
    message: "",
    error: null,
    dirty: false,
    modelStatus: null,
    suggestion: null,
    suggestionDocumentPath: null,
    selection: null,
    timing: {
      stage: "idle",
      startedAtMs: null,
      elapsedMs: 0,
      finalElapsedMs: null,
      lastLoadMs: null,
      lastAnalysisMs: null,
      lastGenerationMs: null,
      model: "",
      profileId: null,
      think: null
    }
  };
}
