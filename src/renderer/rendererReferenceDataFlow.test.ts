import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("rendererReferenceDataFlow", () => {
  it("builds a valid person entry from the simple assistant draft", async () => {
    const harness = await createFlowHarness("people");

    harness.context.updateReferenceDataSimpleField("label", "Léa");
    harness.context.updateReferenceDataSimpleField("birthDate", "2012-06-16");
    harness.context.applyReferenceDataSimpleDraft();
    await Promise.resolve();

    const content = harness.context.state.referenceData.jsonDrafts.people;
    const entries = JSON.parse(content);
    expect(entries).toEqual([
      {
        id: "lea",
        label: "Léa",
        fileAlias: "lea",
        aliases: ["Léa"],
        folderAlias: "Famille/Lea",
        birthDate: "2012-06-16",
        useBirthDateForDetectionOnly: true
      }
    ]);
    expect(harness.validated).toEqual([]);

    await harness.context.validateReferenceDataFileFromPanel("people");
    expect(harness.validated[0]).toEqual({ fileKey: "people", content });
  });

  it("builds a valid vehicle entry from the simple assistant draft", async () => {
    const harness = await createFlowHarness("vehicles");

    harness.context.updateReferenceDataSimpleField("label", "Renault Captur");
    harness.context.applyReferenceDataSimpleDraft();
    await Promise.resolve();

    const entries = JSON.parse(harness.context.state.referenceData.jsonDrafts.vehicles);
    expect(entries).toEqual([
      {
        id: "renault-captur",
        label: "Renault Captur",
        fileAlias: "renault-captur",
        aliases: ["Renault Captur"],
        folderAlias: "Vehicules/Renault-Captur"
      }
    ]);
  });

  it("edits document types through the assistant while preserving advanced fields", async () => {
    const harness = await createFlowHarness("documentTypes", [
      {
        id: "avis-imposition",
        label: "Avis imposition",
        fileAlias: "avis-imposition",
        aliases: ["avis d'imposition"],
        domain: "fiscal",
        defaultTargetKind: "foyer",
        defaultDateRule: "period-year"
      }
    ]);

    harness.context.editReferenceDataSimpleEntry(0);
    harness.context.updateReferenceDataSimpleField("label", "Avis d'imposition");
    harness.context.applyReferenceDataSimpleDraft();

    const entries = JSON.parse(harness.context.state.referenceData.jsonDrafts.documentTypes);
    expect(entries).toEqual([
      {
        id: "avis-imposition",
        label: "Avis d'imposition",
        fileAlias: "avis-imposition",
        aliases: ["avis d'imposition", "Avis d'imposition"],
        domain: "fiscal",
        defaultTargetKind: "foyer",
        defaultDateRule: "period-year"
      }
    ]);
  });

  it("deletes an entry only from the JSON draft", async () => {
    const harness = await createFlowHarness("people", [
      {
        id: "paul",
        label: "Paul",
        fileAlias: "paul",
        aliases: ["Paul"]
      }
    ]);

    harness.context.deleteReferenceDataSimpleEntry(0);

    expect(JSON.parse(harness.context.state.referenceData.jsonDrafts.people)).toEqual([]);
    expect(harness.context.state.referenceData.message).toContain("Entrée supprimée du brouillon");
    expect(harness.validated).toEqual([]);
  });
});

async function createFlowHarness(
  fileKey: ReferenceDataFileKey,
  entries: Array<Record<string, unknown>> = []
) {
  const validated: Array<{ fileKey: string; content: string }> = [];
  const content = `${JSON.stringify(entries, null, 2)}\n`;
  const context: Record<string, any> = {
    referenceDataPanel: {
      render: () => undefined
    },
    window: {
      confirm: () => true,
      docSorter: {
        validateReferenceDataFile: async (key: string, content: string) => {
          validated.push({ fileKey: key, content });
          return {
            ok: true,
            value: {
              key,
              label: key,
              relativePath: `${key}.json`,
              status: "valid",
              content,
              entryCount: 1,
              errors: [],
              warnings: []
            }
          };
        }
      }
    },
    state: {
      referenceData: {
        isOpen: true,
        status: "ready",
        mode: "simple",
        selectedFileKey: fileKey,
        overview: {
          basePath: "C:\\user-data\\config\\reference-data",
          catalogStatus: "ready",
          catalogWarnings: [],
          files: [
            {
              key: fileKey,
              label: fileKey,
              relativePath: `${fileKey}.json`,
              status: "valid",
              content,
              entryCount: entries.length,
              errors: [],
              warnings: []
            }
          ]
        },
        jsonDrafts: {
          [fileKey]: content
        },
        simpleDraft: createEmptyReferenceDataSimpleDraft(),
        lastValidatedFileKey: null,
        lastValidatedContent: "",
        validation: null,
        message: "",
        error: null
      }
    },
    createEmptyReferenceDataSimpleDraft
  };
  context.globalThis = context;

  const source = await readFile(
    path.join(process.cwd(), "src", "renderer", "rendererReferenceDataFlow.ts"),
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
    context: context as Record<string, any>,
    validated
  };
}

function createEmptyReferenceDataSimpleDraft(): ReferenceDataSimpleDraft {
  return {
    editingIndex: null,
    label: "",
    fileAlias: "",
    folderAlias: "",
    aliases: "",
    birthDate: "",
    useBirthDateForDetectionOnly: true,
    domains: "",
    enabled: true
  };
}
