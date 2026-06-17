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
});

async function createFlowHarness(fileKey: ReferenceDataFileKey) {
  const validated: Array<{ fileKey: string; content: string }> = [];
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
              content: "[]\n",
              entryCount: 0,
              errors: [],
              warnings: []
            }
          ]
        },
        jsonDrafts: {
          [fileKey]: "[]\n"
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
