import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

describe("rendererClassificationFlow", () => {
  it("prepares classification with the canonical AI filename", async () => {
    const harness = await createClassificationHarness();

    await harness.context.prepareClassificationSimulation();

    expect(harness.prepareClassificationPlan).toHaveBeenCalledWith(
      "C:\\source\\document.pdf",
      "2024-03-15_captur_facture_renault.pdf"
    );
    expect(harness.context.state.classification.status).toBe("ready");
  });

  it("executes classification with the same canonical AI filename", async () => {
    const harness = await createClassificationHarness();
    harness.context.state.classification = {
      status: "ready",
      plan: createReadyPlan("2024-03-15_captur_facture_renault.pdf"),
      error: null,
      journalWarning: null
    };

    await harness.context.executeClassificationAction();

    expect(harness.executeClassification).toHaveBeenCalledWith(
      "C:\\source\\document.pdf",
      "2024-03-15_captur_facture_renault.pdf"
    );
  });

  it("does not execute a stale ready plan", async () => {
    const harness = await createClassificationHarness();
    harness.context.isClassificationPlanCurrent = () => false;
    harness.context.state.classification = {
      status: "ready",
      plan: createReadyPlan("old-name.pdf"),
      error: null,
      journalWarning: null
    };

    await harness.context.executeClassificationAction();

    expect(harness.executeClassification).not.toHaveBeenCalled();
  });
});

async function createClassificationHarness(): Promise<{
  context: Record<string, any>;
  prepareClassificationPlan: ReturnType<typeof vi.fn>;
  executeClassification: ReturnType<typeof vi.fn>;
}> {
  const prepareClassificationPlan = vi.fn(async (_documentPath: string, filename: string) => ({
    ok: true,
    value: createReadyPlan(filename)
  }));
  const executeClassification = vi.fn(async (_documentPath: string, filename: string) => ({
    ok: false,
    plan: createReadyPlan(filename),
    error: {
      code: "TEST_STOP",
      message: "Arrêt volontaire du test avant mutation."
    }
  }));
  const context: Record<string, any> = {
    classificationRequestId: 0,
    state: {
      targetPath: "Z:\\cible",
      targetFolder: {
        selectedFolder: "Vehicules/Captur",
        folders: ["Vehicules/Captur"],
        status: "ready",
        message: "",
        origin: "ai-v2"
      },
      naming: {
        isLoading: false,
        proposal: {
          proposedFilename: "legacy-name.pdf",
          isValid: true
        }
      },
      destination: {
        status: "available",
        checkedFilename: "2024-03-15_captur_facture_renault.pdf",
        result: {
          targetFolder: "Vehicules/Captur"
        },
        error: null
      },
      duplicates: {
        status: "idle"
      },
      classification: {
        status: "idle",
        plan: null,
        error: null,
        journalWarning: null
      },
      history: {
        entries: [],
        isLoading: false,
        errorMessage: ""
      },
      queueMessage: ""
    },
    window: {
      docSorter: {
        prepareClassificationPlan,
        executeClassification,
        getRecentHistory: async () => ({
          ok: true,
          value: []
        })
      }
    },
    getActiveDocument: () => ({
      name: "document.pdf",
      filePath: "C:\\source\\document.pdf",
      extension: ".pdf",
      sizeBytes: 1,
      sizeLabel: "1 o",
      modifiedAt: "2026-06-20T10:00:00.000Z",
      status: "pending"
    }),
    getEffectiveClassificationFilename: () => "2024-03-15_captur_facture_renault.pdf",
    isEffectiveClassificationFilenameValid: () => true,
    isDestinationCheckCurrentForClassification: () => true,
    isClassificationPlanCurrent: () => true,
    isClassificationBusy: () => false,
    render: () => undefined,
    renderControls: () => undefined,
    renderClassificationSummary: () => undefined,
    renderHistory: () => undefined,
    historyPanel: {
      render: () => undefined
    },
    documentHasVisibleDuplicate: () => false,
    globalThis: {}
  };
  context.globalThis = context;

  const source = await readFile(
    path.join(process.cwd(), "src", "renderer", "rendererClassificationFlow.ts"),
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
    prepareClassificationPlan,
    executeClassification
  };
}

function createReadyPlan(filename: string): Record<string, unknown> {
  return {
    status: "ready",
    sourcePath: "C:\\source\\document.pdf",
    currentName: "document.pdf",
    targetRootPath: "Z:\\cible",
    targetFolder: "Vehicules/Captur",
    targetPath: "Z:\\cible\\Vehicules\\Captur",
    proposedFilename: filename,
    destinationPath: `Z:\\cible\\Vehicules\\Captur\\${filename}`,
    extension: ".pdf",
    sourceFileStatus: "present",
    targetDirectoryStatus: "ready",
    collisionStatus: "available",
    preparedAt: "2026-06-20T10:00:00.000Z",
    checks: [],
    message: "Plan prêt.",
    simulationOnly: true
  };
}
