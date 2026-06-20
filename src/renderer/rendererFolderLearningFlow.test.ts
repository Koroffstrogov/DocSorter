import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

describe("rendererFolderLearningFlow", () => {
  it("reads target folder names and stores a read-only profile", async () => {
    const harness = await createHarness();

    await harness.context.refreshFolderLearningForCurrentTargetFolder();

    expect(harness.listTargetFolderNames).toHaveBeenCalledTimes(1);
    expect(harness.context.state.folderLearning).toMatchObject({
      status: "ready",
      targetFolder: "Finances/Banque"
    });
    expect(harness.context.state.folderLearning.profile).toMatchObject({
      status: "medium",
      recognizedFileCount: 4,
      dominantTarget: "compte-joint",
      dominantDocumentType: "releve-bancaire"
    });
    expect(harness.context.state.folderLearning.comparison).toMatchObject({
      alignedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    });
  });

  it("recalculates the aligned name when the AI preview changes", async () => {
    const harness = await createHarness();
    await harness.context.refreshFolderLearningForCurrentTargetFolder();

    harness.setAiPreview({
      filename: "2026-06-22_foyer_releve-bancaire_bnp_juin.pdf",
      filenameValid: true,
      destinationFolder: "Finances/Banque",
      messages: [],
      fields: {
        dateToken: "2026-06-22",
        subject: "",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: "juin"
      },
      manualFields: {}
    });

    harness.context.recalculateFolderLearningComparison();

    expect(harness.context.state.folderLearning.comparison).toMatchObject({
      alignedName: "2026-06_compte-joint_releve-bancaire_bnp-paribas.pdf"
    });
  });

  it("handles folder access errors without throwing", async () => {
    const harness = await createHarness();
    harness.listTargetFolderNames.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "TARGET_FOLDER_INVALID",
        message: "Sous-dossier cible invalide."
      }
    });

    await harness.context.refreshFolderLearningForCurrentTargetFolder();

    expect(harness.context.state.folderLearning).toMatchObject({
      status: "error",
      message: "Convention du dossier indisponible.",
      error: "Sous-dossier cible invalide."
    });
  });
});

async function createHarness(): Promise<{
  context: Record<string, any>;
  listTargetFolderNames: ReturnType<typeof vi.fn>;
  setAiPreview: (value: Record<string, any>) => void;
}> {
  const listTargetFolderNames = vi.fn(async () => ({
    ok: true,
    value: {
      targetFolder: "Finances/Banque",
      entries: [
        name("2026-01_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-02_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"),
        name("notes.txt")
      ],
      truncated: false,
      entryLimit: 500,
      warnings: []
    }
  }));
  const aiPreviewHolder = {
    value: {
      filename: "2026-05-18_foyer_releve-bancaire_bnp_mai.pdf",
      filenameValid: true,
      destinationFolder: "Finances/Banque",
      messages: [],
      fields: {
        dateToken: "2026-05-18",
        subject: "",
        target: "foyer",
        documentType: "releve-bancaire",
        issuer: "bnp",
        detail: "mai"
      },
      manualFields: {}
    }
  };
  const context: Record<string, any> = {
    folderLearningRequestId: 0,
    state: {
      targetPath: "Z:\\cible",
      targetFolder: {
        selectedFolder: "Finances/Banque"
      },
      activeDocumentPath: "Z:\\source\\document.pdf",
      folderLearning: createIdleFolderLearningState()
    },
    window: {
      docSorter: {
        listTargetFolderNames
      }
    },
    getActiveDocument: () => ({
      name: "document.pdf",
      filePath: "Z:\\source\\document.pdf",
      extension: ".pdf",
      status: "pending"
    }),
    createIdleFolderLearningState,
    renderNamingPanel: () => undefined,
    getAiNamingPreview: () => aiPreviewHolder.value,
    globalThis: {}
  };
  context.globalThis = context;
  context.DocSorterFolderLearningSummary = undefined;

  for (const fileName of ["folderLearningSummary.ts", "rendererFolderLearningFlow.ts"]) {
    const source = await readFile(path.join(process.cwd(), "src", "renderer", fileName), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    vm.runInNewContext(js, context);
  }

  return {
    context,
    listTargetFolderNames,
    setAiPreview: (value: Record<string, any>) => {
      aiPreviewHolder.value = value;
    }
  };
}

function createIdleFolderLearningState(): FolderLearningState {
  return {
    status: "idle",
    targetFolder: "",
    entries: [],
    profile: null,
    comparison: null,
    message: "",
    error: "",
    warnings: []
  };
}

function name(value: string): FolderLearningNameEntry {
  return {
    name: value,
    isFile: true
  };
}
