import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("rendererAiFlow V2 application helpers", () => {
  it("replaces reference-data values when AI confidence is at least 70", async () => {
    const context = await loadAiFlow();
    const buildDraft = context.buildNamingDraftFromAiSuggestionV2 as (
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
    const buildDraft = context.buildNamingDraftFromAiSuggestionV2 as (
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
    const buildDraft = context.buildNamingDraftFromAiSuggestionV2 as (
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
    const buildDraft = context.buildNamingDraftFromAiSuggestionV2 as (
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
    const buildDraft = context.buildNamingDraftFromAiSuggestionV2 as (
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
    const buildDraft = context.buildNamingDraftFromAiSuggestionV2 as (
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

    state.targetFolder.origin = "manual";
    expect(canApplyFolder("Scolarite/Lea", 95)).toBe(false);
  });
});

async function loadAiFlow(): Promise<Record<string, unknown>> {
  const state: TestState = {
    targetPath: "Z:\\cible",
    targetFolder: {
      selectedFolder: "",
      origin: "fallback"
    }
  };
  const context: Record<string, unknown> = {
    state,
    window: {},
    globalThis: {}
  };
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
  targetFolder: {
    selectedFolder: string;
    origin: string;
  };
}
