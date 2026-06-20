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
});

function waitForAsyncDestinationCheck(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createFlowHarness(): Promise<{
  context: Record<string, any>;
  buildNamingProposal: ReturnType<typeof vi.fn>;
  createInitialNamingDraft: ReturnType<typeof vi.fn>;
  checkDestinationAvailability: ReturnType<typeof vi.fn>;
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
  const context: Record<string, any> = {
    namingRequestId: 0,
    destinationRequestId: 0,
    targetFolderRequestId: 0,
    destinationCheckTimer: null,
    window: {
      docSorter: {
        buildNamingProposal,
        createInitialNamingDraft,
        checkDestinationAvailability
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
    createIdleNamingState,
    createIdleDestinationCheckState,
    resetClassificationState: () => undefined,
    renderControls: () => undefined,
    renderPaths: () => undefined,
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
    checkDestinationAvailability
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
    isLoading: false
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
