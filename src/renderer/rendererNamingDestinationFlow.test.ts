import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

describe("rendererNamingDestinationFlow", () => {
  it("initializes naming fields empty when a document is opened", async () => {
    const harness = await createFlowHarness();
    const documentItem = createDocumentItem();

    await harness.context.initializeNamingDraft(documentItem);

    expect(harness.createInitialNamingDraft).not.toHaveBeenCalled();
    expect(harness.buildNamingProposal).toHaveBeenCalledWith(
      {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      ".pdf"
    );
    expect(harness.context.state.naming.draft).toEqual({
      documentDate: "",
      subject: "",
      documentType: "",
      keywords: ""
    });
    expect(harness.context.state.naming.origins).toEqual({
      documentDate: "fallback",
      subject: "fallback",
      documentType: "fallback",
      keywords: "fallback"
    });
  });

  it("uses a valid AI preview as the classification filename for destination checks", async () => {
    const harness = await createFlowHarness();
    const state = harness.context.state;
    state.targetPath = "Z:\\cible";
    state.targetFolder.selectedFolder = "Vehicules/Captur";
    state.naming.proposal = {
      proposedFilename: "legacy-name.pdf",
      isValid: true,
      normalizedDraft: createEmptyNamingDraft(),
      messages: []
    };
    harness.context.getAiNamingPreview = () => ({
      filename: "2024-03-15_captur_facture_renault.pdf",
      filenameValid: true,
      destinationFolder: "Vehicules/Captur",
      messages: []
    });

    harness.context.scheduleDestinationCheck();
    await waitForAsyncDestinationCheck();

    expect(harness.checkDestinationAvailability).toHaveBeenCalledWith(
      "2024-03-15_captur_facture_renault.pdf"
    );
    expect(state.destination.checkedFilename).toBe("2024-03-15_captur_facture_renault.pdf");
    expect(state.destination.status).toBe("available");
  });

  it("uses an explicit folder-aligned name as the canonical classification filename", async () => {
    const harness = await createFlowHarness();
    const state = harness.context.state;
    state.targetPath = "Z:\\cible";
    state.folderLearning = createReadyFolderLearningState("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    harness.context.getAiNamingPreview = () => ({
      filename: "2026-05_foyer_releve-bancaire_bnp.pdf",
      filenameValid: true,
      destinationFolder: "Finances/Banque",
      messages: []
    });

    expect(harness.context.canUseFolderLearningAlignedName()).toBe(true);

    harness.context.useFolderLearningAlignedName();

    expect(state.naming.overrideFilename).toBe("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(state.naming.overrideFilenameOrigin).toBe("folder-learning");
    expect(harness.context.getEffectiveClassificationFilename()).toBe(
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    );
    expect(harness.checkDestinationAvailability).toHaveBeenCalledWith(
      "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf"
    );
  });

  it("refuses an invalid folder-aligned name without changing the final filename", async () => {
    const harness = await createFlowHarness();
    const state = harness.context.state;
    state.folderLearning = createReadyFolderLearningState("C:\\tmp\\evil.pdf");
    harness.context.getAiNamingPreview = () => ({
      filename: "2026-05_foyer_releve-bancaire_bnp.pdf",
      filenameValid: true,
      destinationFolder: "Finances/Banque",
      messages: []
    });

    expect(harness.context.canUseFolderLearningAlignedName()).toBe(false);

    harness.context.useFolderLearningAlignedName();

    expect(state.naming.overrideFilename).toBeNull();
    expect(harness.context.getEffectiveClassificationFilename()).toBe("2026-05_foyer_releve-bancaire_bnp.pdf");
  });

  it("resets an applied folder-aligned name back to the IA preview", async () => {
    const harness = await createFlowHarness();
    const state = harness.context.state;
    state.naming.overrideFilename = "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf";
    state.naming.overrideFilenameOrigin = "folder-learning";
    harness.context.getAiNamingPreview = () => ({
      filename: "2026-05_foyer_releve-bancaire_bnp.pdf",
      filenameValid: true,
      destinationFolder: "Finances/Banque",
      messages: []
    });

    expect(harness.context.canResetSortProposalChoices()).toBe(true);

    harness.context.resetSortProposalChoices();

    expect(state.naming.overrideFilename).toBeNull();
    expect(state.naming.overrideFilenameOrigin).toBeNull();
    expect(harness.context.getEffectiveClassificationFilename()).toBe("2026-05_foyer_releve-bancaire_bnp.pdf");
  });

  it("falls back to the historical proposal when the AI preview is incomplete", async () => {
    const harness = await createFlowHarness();
    const state = harness.context.state;
    state.naming.proposal = {
      proposedFilename: "legacy-name.pdf",
      isValid: true,
      normalizedDraft: createEmptyNamingDraft(),
      messages: []
    };
    harness.context.getAiNamingPreview = () => ({
      filename: "",
      filenameValid: false,
      destinationFolder: "",
      messages: [{ level: "error", message: "Cible IA obligatoire." }]
    });

    expect(harness.context.getEffectiveClassificationFilename()).toBe("legacy-name.pdf");
    expect(harness.context.isEffectiveClassificationFilenameValid()).toBe(false);
  });

  it("marks a ready classification plan stale when the AI filename or folder changes", async () => {
    const harness = await createFlowHarness();
    const state = harness.context.state;
    state.targetFolder.selectedFolder = "Vehicules/Captur";
    state.classification.plan = {
      status: "ready",
      sourcePath: "C:\\source\\2026-06-15_facture_edf.pdf",
      currentName: "2026-06-15_facture_edf.pdf",
      targetRootPath: "Z:\\cible",
      targetFolder: "Vehicules/Captur",
      targetPath: "Z:\\cible\\Vehicules\\Captur",
      proposedFilename: "2024-03-15_captur_facture_renault.pdf",
      destinationPath: "Z:\\cible\\Vehicules\\Captur\\2024-03-15_captur_facture_renault.pdf",
      extension: ".pdf",
      sourceFileStatus: "present",
      targetDirectoryStatus: "ready",
      collisionStatus: "available",
      preparedAt: "2026-06-20T10:00:00.000Z",
      checks: [],
      message: "Plan prêt.",
      simulationOnly: true
    };
    harness.context.getAiNamingPreview = () => ({
      filename: "2024-03-15_captur_facture_renault.pdf",
      filenameValid: true,
      destinationFolder: "Vehicules/Captur",
      messages: []
    });

    expect(harness.context.isClassificationPlanCurrent()).toBe(true);

    state.targetFolder.selectedFolder = "Vehicules/Captur/Entretien";
    expect(harness.context.isClassificationPlanCurrent()).toBe(false);

    state.targetFolder.selectedFolder = "Vehicules/Captur";
    harness.context.getAiNamingPreview = () => ({
      filename: "2025_captur_facture_renault.pdf",
      filenameValid: true,
      destinationFolder: "Vehicules/Captur",
      messages: []
    });
    expect(harness.context.isClassificationPlanCurrent()).toBe(false);
  });

  it("refreshes folder convention analysis when the target folder changes", async () => {
    const harness = await createFlowHarness();
    harness.context.state.targetPath = "Z:\\cible";

    await harness.context.updateTargetFolderFromInput("Finances/Banque", "ai-v2");

    expect(harness.setTargetFolder).toHaveBeenCalledWith("Finances/Banque");
    expect(harness.refreshFolderLearningForCurrentTargetFolder).toHaveBeenCalledTimes(1);
  });
});

function waitForAsyncDestinationCheck(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createFlowHarness(): Promise<{
  context: Record<string, any>;
  buildNamingProposal: ReturnType<typeof vi.fn>;
  createInitialNamingDraft: ReturnType<typeof vi.fn>;
  checkDestinationAvailability: ReturnType<typeof vi.fn>;
  setTargetFolder: ReturnType<typeof vi.fn>;
  refreshFolderLearningForCurrentTargetFolder: ReturnType<typeof vi.fn>;
}> {
  const documentItem = createDocumentItem();
  const buildNamingProposal = vi.fn(async () => ({
    proposedFilename: "",
    isValid: false,
    normalizedDraft: createEmptyNamingDraft(),
    messages: [
      {
        level: "error",
        code: "DATE_REQUIRED",
        message: "Date documentaire requise."
      }
    ]
  }));
  const createInitialNamingDraft = vi.fn(async () => ({
    documentDate: "2026",
    subject: "source-filename",
    documentType: "",
    keywords: ""
  }));
  const checkDestinationAvailability = vi.fn(async (filename: string) => ({
    ok: true,
    value: {
      status: "available",
      targetRootPath: "Z:\\cible",
      targetFolder: "Vehicules/Captur",
      targetPath: "Z:\\cible\\Vehicules\\Captur",
      proposedFilename: filename,
      finalFilename: filename,
      finalPath: `Z:\\cible\\Vehicules\\Captur\\${filename}`,
      alternativeFilename: null,
      message: "Nom disponible."
    }
  }));
  const setTargetFolder = vi.fn(async (targetFolder: string) => ({
    ok: true,
    value: targetFolder
  }));
  const refreshFolderLearningForCurrentTargetFolder = vi.fn();
  const context: Record<string, any> = {
    namingRequestId: 0,
    destinationRequestId: 0,
    targetFolderRequestId: 0,
    destinationCheckTimer: null,
    window: {
      docSorter: {
        buildNamingProposal,
        createInitialNamingDraft,
        checkDestinationAvailability,
        setTargetFolder
      },
      clearTimeout: () => undefined,
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      }
    },
    state: {
      activeDocumentPath: documentItem.filePath,
      targetPath: null,
      naming: createIdleNamingState(),
      folderLearning: createIdleFolderLearningState(),
      destination: createIdleDestinationCheckState(),
      targetFolder: {
        selectedFolder: "",
        folders: [],
        status: "idle",
        message: "",
        origin: "fallback"
      },
      classification: {
        status: "idle",
        plan: null,
        error: null,
        journalWarning: null
      }
    },
    getActiveDocument: () => documentItem,
    getAiNamingPreview: () => null,
    resetFolderLearningState: () => undefined,
    refreshFolderLearningForCurrentTargetFolder,
    createIdleNamingState,
    createIdleDestinationCheckState,
    resetClassificationState: () => undefined,
    canResetAiSelectionChoices: () => false,
    resetAiSelectionChoices: () => false,
    recalculateFolderLearningComparison: () => undefined,
    renderControls: () => undefined,
    renderPaths: () => undefined,
    render: () => undefined,
    renderClassificationSummary: () => undefined,
    namingPanelView: {
      render: () => undefined,
      renderDestinationCheck: () => undefined
    }
  };
  context.globalThis = context;

  const source = await readFile(
    path.join(process.cwd(), "src", "renderer", "rendererNamingDestinationFlow.ts"),
    "utf8"
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  vm.runInNewContext(js, context);

  return {
    context,
    buildNamingProposal,
    createInitialNamingDraft,
    checkDestinationAvailability,
    setTargetFolder,
    refreshFolderLearningForCurrentTargetFolder
  };
}

function createDocumentItem(): DocumentItem {
  return {
    name: "2026-06-15_facture_edf.pdf",
    filePath: "C:\\source\\2026-06-15_facture_edf.pdf",
    extension: ".pdf",
    sizeBytes: 1024,
    sizeLabel: "1 Ko",
    modifiedAt: "2026-06-18T10:00:00.000Z",
    status: "pending"
  };
}

function createIdleNamingState(): NamingState {
  return {
    draft: createEmptyNamingDraft(),
    origins: {
      documentDate: "fallback",
      subject: "fallback",
      documentType: "fallback",
      keywords: "fallback"
    },
    proposal: null,
    overrideFilename: null,
    overrideFilenameOrigin: null,
    isLoading: false
  };
}

function createIdleFolderLearningState(): FolderLearningState {
  return {
    status: "idle",
    targetFolder: "",
    entries: [],
    profile: null,
    comparison: null,
    pipeline: [],
    message: "",
    error: "",
    warnings: []
  };
}

function createReadyFolderLearningState(alignedName: string): FolderLearningState {
  return {
    status: "ready",
    targetFolder: "Finances/Banque",
    entries: [],
    profile: {
      status: "strong",
      analyzedFileCount: 8,
      recognizedFileCount: 8,
      dominantDatePrecision: "month",
      dominantTarget: "compte-joint",
      dominantDocumentType: "releve-bancaire",
      dominantIssuer: "bnp-paribas",
      detailUsage: "never",
      examples: ["2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf"],
      reasons: [],
      warnings: []
    },
    comparison: {
      aiName: "2026-05_foyer_releve-bancaire_bnp.pdf",
      alignedName,
      recommendation: "prefer-folder-profile",
      confidence: 85,
      appliedChanges: ["target", "issuer"],
      reasons: [],
      warnings: []
    },
    pipeline: [],
    message: "",
    error: "",
    warnings: []
  };
}

function createEmptyNamingDraft(): NamingDraft {
  return {
    documentDate: "",
    subject: "",
    documentType: "",
    keywords: ""
  };
}

function createIdleDestinationCheckState(): DestinationCheckState {
  return {
    status: "idle",
    result: null,
    error: null,
    checkedFilename: ""
  };
}
