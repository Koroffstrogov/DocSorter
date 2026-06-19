import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

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
    expect(selection.previewDestinationFolder).toBe("Z:\\cible\\Vehicules/Captur");
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
    const redundant = buildPreview({
      dateToken: "2026",
      subject: "lea",
      target: "lea",
      documentType: "carnet-vaccination",
      issuer: "lea",
      detail: "carnet-vaccination"
    }, ".pdf");

    expect(none.filename).toBe("2026-02-01_lea_carnet-vaccination.pdf");
    expect(none.messages.map((message) => message.message)).toContain(
      "Date IA au mois convertie au premier jour du mois."
    );
    expect(redundant.filename).toBe("2026_lea_carnet-vaccination.pdf");
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

    expect(updated.previewDestinationFolder).toBe("Z:\\cible\\Vehicules/Captur/Entretien");
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
});

async function loadAiFlow(): Promise<Record<string, unknown>> {
  const state: TestState = {
    targetPath: "Z:\\cible",
    targetFolder: {
      selectedFolder: "",
      origin: "fallback"
    },
    activeDocumentPath: "Z:\\source\\document.pdf",
    ai: createTestAiState(),
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
    isClassificationBusy: () => false,
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
  ai?: Record<string, unknown>;
  textExtraction: {
    byDocumentPath: Record<string, unknown>;
  };
}

interface TestAiSelection {
  fields: Record<string, string>;
  manualFields: Record<string, true>;
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
