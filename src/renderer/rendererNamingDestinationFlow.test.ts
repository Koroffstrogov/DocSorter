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
});

async function createFlowHarness(): Promise<{
  context: Record<string, any>;
  buildNamingProposal: ReturnType<typeof vi.fn>;
  createInitialNamingDraft: ReturnType<typeof vi.fn>;
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
  const context: Record<string, any> = {
    namingRequestId: 0,
    destinationRequestId: 0,
    targetFolderRequestId: 0,
    destinationCheckTimer: null,
    window: {
      docSorter: {
        buildNamingProposal,
        createInitialNamingDraft
      },
      clearTimeout: () => undefined,
      setTimeout: () => 1
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
    createInitialNamingDraft
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
