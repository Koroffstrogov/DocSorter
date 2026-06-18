import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("rendererSuggestionV2Flow apply to empty fields", () => {
  it("applies target, document type, issuer/detail and compatible dates only to empty fields", async () => {
    const context = await loadSuggestionV2Flow();
    const buildDraft = context.buildNamingDraftFromSuggestionV2 as (
      draft: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(createEmptyNamingDraft(), createSuggestion({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "vidange"
    }));

    expect(result.draft).toEqual({
      documentDate: "2024-03-05",
      subject: "captur",
      documentType: "facture-entretien",
      keywords: "renault vidange"
    });
    expect(result.appliedFields).toEqual(["documentDate", "subject", "documentType", "keywords"]);
  });

  it("does not overwrite existing naming fields", async () => {
    const context = await loadSuggestionV2Flow();
    const buildDraft = context.buildNamingDraftFromSuggestionV2 as (
      draft: Record<string, string>,
      suggestion: Record<string, unknown>
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "2023",
        subject: "deja-saisi",
        documentType: "ancien-type",
        keywords: "mot-cle"
      },
      createSuggestion({
        dateToken: "2024-03-05",
        target: "captur",
        documentType: "facture-entretien",
        issuer: "renault",
        detail: "vidange"
      })
    );

    expect(result.draft).toEqual({
      documentDate: "2023",
      subject: "deja-saisi",
      documentType: "ancien-type",
      keywords: "mot-cle"
    });
    expect(result.appliedFields).toEqual([]);
  });

  it("replaces a filename-derived subject with the v2 target", async () => {
    const context = await loadSuggestionV2Flow();
    const buildDraft = context.buildNamingDraftFromSuggestionV2 as (
      draft: Record<string, string>,
      suggestion: Record<string, unknown>,
      sourceDocumentName?: string
    ) => { draft: Record<string, string>; appliedFields: string[] };

    const result = buildDraft(
      {
        documentDate: "2026",
        subject: "T02-certificat-scolarite",
        documentType: "certificat-scolarite",
        keywords: ""
      },
      createSuggestion({
        dateToken: "2026",
        target: "lea",
        documentType: "certificat-scolarite"
      }),
      "T02-certificat-scolarite.pdf"
    );

    expect(result.draft).toEqual({
      documentDate: "2026",
      subject: "lea",
      documentType: "certificat-scolarite",
      keywords: ""
    });
    expect(result.appliedFields).toEqual(["subject"]);
  });

  it("accepts YYYY and YYYY-MM-DD dates but ignores date-inconnue and YYYY-MM", async () => {
    const context = await loadSuggestionV2Flow();
    const normalizeDate = context.normalizeSuggestionV2DateForCurrentDraft as (dateToken?: string) => string;

    expect(normalizeDate("2026")).toBe("2026");
    expect(normalizeDate("2026-06-17")).toBe("2026-06-17");
    expect(normalizeDate("date-inconnue")).toBe("");
    expect(normalizeDate("2026-06")).toBe("");
    expect(normalizeDate("2026-00-17")).toBe("");
    expect(normalizeDate("2026-06-00")).toBe("");
  });

  it("applies the recommended v2 folder only when a target root exists and the folder field is empty", async () => {
    const context = await loadSuggestionV2Flow();
    const canApplyFolder = context.canApplySuggestionV2TargetFolder as (targetFolder: string) => boolean;
    const state = context.state as {
      targetPath: string | null;
      targetFolder: { selectedFolder: string };
    };

    state.targetPath = "Z:\\cible";
    state.targetFolder.selectedFolder = "";
    expect(canApplyFolder("Scolarite/Lea")).toBe(true);

    state.targetFolder.selectedFolder = "Deja/Choisi";
    expect(canApplyFolder("Scolarite/Lea")).toBe(false);

    state.targetFolder.selectedFolder = "";
    state.targetPath = null;
    expect(canApplyFolder("Scolarite/Lea")).toBe(false);
  });

  it("updates existing naming, collision and folder checks without creating a folder", async () => {
    const context = await loadSuggestionV2Flow();
    const apply = context.applySuggestionV2ToEmptyFields as () => void;
    const state = context.state as TestRendererState;
    const calls = context.calls as TestCalls;
    const document = createDocument();

    state.activeDocumentPath = document.filePath;
    state.targetPath = "Z:\\cible";
    state.targetFolder.selectedFolder = "";
    state.naming.draft = createEmptyNamingDraft();
    state.naming.origins = createOrigins("fallback");
    state.suggestionV2.byDocumentPath[document.filePath] = {
      status: "ready",
      result: createSuggestion({
        dateToken: "2026",
        target: "lea",
        documentType: "certificat-scolarite",
        issuer: "college-monet",
        detail: "",
        recommendedFolder: "Scolarite/Lea"
      }),
      error: null,
      diagnosticStatus: "idle",
      diagnosticResult: null,
      diagnosticError: null
    };

    apply();

    expect(state.naming.draft).toEqual({
      documentDate: "2026",
      subject: "lea",
      documentType: "certificat-scolarite",
      keywords: "college-monet"
    });
    expect(state.naming.origins).toEqual({
      documentDate: "date-engine",
      subject: "reference-data",
      documentType: "reference-data",
      keywords: "reference-data"
    });
    expect(state.naming.isLoading).toBe(true);
    expect(calls.resetClassification).toBe(1);
    expect(calls.resetDestination).toBe(1);
    expect(calls.updateNamingProposal).toEqual([{ extension: ".pdf", requestId: 1 }]);
    expect(calls.updateTargetFolderFromInput).toEqual([
      { targetFolder: "Scolarite/Lea", origin: "reference-data" }
    ]);
    expect(calls.createFolder).toBe(0);
    expect(state.suggestionV2.byDocumentPath[document.filePath].result?.message).toContain("Champs v2 appliqués");
  });

  it("fixes the T02 flow by replacing the initial filename subject before recomputing the proposal", async () => {
    const context = await loadSuggestionV2Flow({
      name: "T02-certificat-scolarite.pdf",
      filePath: "Z:\\source\\T02-certificat-scolarite.pdf"
    });
    const apply = context.applySuggestionV2ToEmptyFields as () => void;
    const state = context.state as TestRendererState;
    const calls = context.calls as TestCalls;
    const document = context.documentItem as TestDocument;

    state.activeDocumentPath = document.filePath;
    state.targetPath = "Z:\\cible";
    state.targetFolder.selectedFolder = "";
    state.naming.draft = {
      documentDate: "2026",
      subject: "T02-certificat-scolarite",
      documentType: "certificat-scolarite",
      keywords: ""
    };
    state.naming.origins = createOrigins("legacy-filename");
    state.suggestionV2.byDocumentPath[document.filePath] = {
      status: "ready",
      result: createSuggestion({
        dateToken: "2026",
        target: "lea",
        documentType: "certificat-scolarite",
        recommendedFolder: "Scolarite"
      }),
      error: null,
      diagnosticStatus: "idle",
      diagnosticResult: null,
      diagnosticError: null
    };

    apply();

    expect(state.naming.draft).toEqual({
      documentDate: "2026",
      subject: "lea",
      documentType: "certificat-scolarite",
      keywords: ""
    });
    expect(state.naming.isLoading).toBe(true);
    expect(calls.updateNamingProposal).toEqual([{ extension: ".pdf", requestId: 1 }]);
    expect(calls.updateTargetFolderFromInput).toEqual([
      { targetFolder: "Scolarite", origin: "reference-data" }
    ]);
  });
});

async function loadSuggestionV2Flow(
  documentOverrides: Partial<TestDocument> = {}
): Promise<Record<string, unknown>> {
  const calls: TestCalls = {
    resetClassification: 0,
    resetDestination: 0,
    render: 0,
    updateNamingProposal: [],
    updateTargetFolderFromInput: [],
    createFolder: 0
  };
  const document = {
    ...createDocument(),
    ...documentOverrides
  };
  const state: TestRendererState = {
    activeDocumentPath: document.filePath,
    naming: {
      draft: createEmptyNamingDraft(),
      origins: createOrigins("fallback"),
      overrideFilename: "ancien.pdf",
      proposal: null,
      isLoading: false
    },
    suggestionV2: {
      byDocumentPath: {}
    },
    targetPath: "Z:\\cible",
    targetFolder: {
      selectedFolder: "",
      folders: [],
      status: "idle",
      message: ""
    }
  };
  const context: Record<string, unknown> = {
    state,
    calls,
    documentItem: document,
    namingRequestId: 0,
    getActiveDocument: () => document,
    isClassificationBusy: () => false,
    resetClassificationState: () => {
      calls.resetClassification += 1;
    },
    resetDestinationCheck: () => {
      calls.resetDestination += 1;
    },
    render: () => {
      calls.render += 1;
    },
    updateNamingProposal: (extension: string, requestId: number) => {
      calls.updateNamingProposal.push({ extension, requestId });
      return Promise.resolve();
    },
    updateTargetFolderFromInput: (targetFolder: string, origin: string) => {
      calls.updateTargetFolderFromInput.push({ targetFolder, origin });
      return Promise.resolve();
    },
    createIdleSuggestionV2DocumentState: () => ({
      status: "idle",
      result: null,
      error: null,
      diagnosticStatus: "idle",
      diagnosticResult: null,
      diagnosticError: null
    })
  };
  context.globalThis = context;

  const source = await readFile(path.join(process.cwd(), "src", "renderer", "rendererSuggestionV2Flow.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  vm.runInNewContext(js, context as vm.Context);
  return context;
}

function createEmptyNamingDraft(): Record<string, string> {
  return {
    documentDate: "",
    subject: "",
    documentType: "",
    keywords: ""
  };
}

function createOrigins(origin: string): Record<string, string> {
  return {
    documentDate: origin,
    subject: origin,
    documentType: origin,
    keywords: origin
  };
}

function createDocument(): TestDocument {
  return {
    name: "document.pdf",
    filePath: "Z:\\source\\document.pdf",
    extension: ".pdf",
    sizeBytes: 1,
    sizeLabel: "1 octet",
    modifiedAt: "2026-06-17T10:00:00.000Z",
    status: "pending"
  };
}

function createSuggestion(options: {
  dateToken?: string;
  target?: string;
  documentType?: string;
  issuer?: string;
  detail?: string;
  recommendedFolder?: string;
}): Record<string, unknown> {
  return {
    status: "ready",
    documentName: "document.pdf",
    extension: ".pdf",
    draft: {
      dateToken: options.dateToken,
      target: options.target,
      documentType: options.documentType,
      issuer: options.issuer,
      detail: options.detail,
      confidence: 90,
      reasons: [],
      warnings: [],
      source: {
        dateToken: options.dateToken ? "date-engine" : undefined,
        target: options.target ? "reference-data" : undefined,
        documentType: options.documentType ? "reference-data" : undefined,
        issuer: options.issuer ? "reference-data" : undefined,
        detail: options.detail ? "reference-data" : undefined
      },
      namingMessages: []
    },
    targetFolderSuggestion: {
      recommended: options.recommendedFolder
        ? {
            label: "equilibre",
            relativePath: options.recommendedFolder,
            depth: 2,
            recommended: true,
            confidence: 90,
            reasons: [],
            warnings: [],
            source: "rules-v2"
          }
        : undefined,
      options: [],
      warnings: [],
      reasons: []
    },
    folderPlacement: null,
    folderPlacementCandidates: [],
    folderNamingProfile: null,
    missingFields: [],
    referenceDataWarnings: [],
    builtAt: "2026-06-17T10:00:00.000Z",
    message: "Suggestion v2 prête."
  };
}

interface TestCalls {
  resetClassification: number;
  resetDestination: number;
  render: number;
  updateNamingProposal: Array<{ extension: string; requestId: number }>;
  updateTargetFolderFromInput: Array<{ targetFolder: string; origin: string }>;
  createFolder: number;
}

interface TestDocument {
  name: string;
  filePath: string;
  extension: string;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  status: string;
}

interface TestRendererState {
  activeDocumentPath: string;
  naming: {
    draft: Record<string, string>;
    origins: Record<string, string>;
    overrideFilename: string | null;
    proposal: unknown;
    isLoading: boolean;
  };
  suggestionV2: {
    byDocumentPath: Record<string, {
      status: string;
      result: (Record<string, unknown> & { message?: string }) | null;
      error: unknown;
      diagnosticStatus: string;
      diagnosticResult: unknown;
      diagnosticError: unknown;
    }>;
  };
  targetPath: string | null;
  targetFolder: {
    selectedFolder: string;
    folders: string[];
    status: string;
    message: string;
  };
}
