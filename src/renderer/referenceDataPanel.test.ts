import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("referenceDataPanel", () => {
  it("keeps focus on the edited assistant field after a re-render", async () => {
    const harness = await createPanelHarness();
    const api = harness.api;

    api.render();
    const input = harness.document.querySelector<FakeElement>('[data-reference-field="label"]');
    expect(input).not.toBeNull();

    input!.value = "L";
    input!.focus();
    input!.setSelectionRange(1, 1);
    input!.dispatch("input");

    const focused = harness.document.activeElement;
    expect(focused?.getAttribute("data-reference-field")).toBe("label");
    expect(focused?.value).toBe("L");
    expect(focused?.selectionStart).toBe(1);
    expect(focused?.selectionEnd).toBe(1);
  });
});

async function createPanelHarness(): Promise<{
  api: ReferenceDataPanelApi;
  document: FakeDocument;
}> {
  const state: ReferenceDataState = {
    isOpen: true,
    status: "ready",
    mode: "simple",
    selectedFileKey: "people",
    overview: {
      basePath: "C:\\user-data\\config\\reference-data",
      catalogStatus: "ready",
      catalogWarnings: [],
      files: [
        {
          key: "people",
          label: "Personnes",
          relativePath: "entities/people.json",
          status: "valid",
          content: "[]\n",
          entryCount: 0,
          errors: [],
          warnings: []
        }
      ]
    },
    jsonDrafts: {
      people: "[]\n"
    },
    simpleDraft: createSimpleDraft(),
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    validation: null,
    message: "Référentiels chargés.",
    error: null
  };
  const document = FakeDocument.createReferenceDataDialog();
  const context: Record<string, unknown> = {
    document,
    HTMLElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLTextAreaElement: FakeElement
  };
  context.globalThis = context;

  const source = await readFile(path.join(process.cwd(), "src", "renderer", "referenceDataPanel.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  vm.runInNewContext(js, context);

  const factory = context.DocSorterReferenceDataPanel as ReferenceDataPanelFactoryApi;
  let api: ReferenceDataPanelApi;
  api = factory.createReferenceDataPanel({
    root: document as unknown as ParentNode,
    getState: () => state,
    onClose: () => undefined,
    onOpenFolder: () => undefined,
    onCreateMissing: () => undefined,
    onReload: () => undefined,
    onSelectFile: () => undefined,
    onModeChange: () => undefined,
    onJsonDraftChange: () => undefined,
    onValidateJson: () => undefined,
    onSaveJson: () => undefined,
    onSimpleFieldChange: (field, value) => {
      state.simpleDraft = {
        ...state.simpleDraft,
        [field]: value
      };
      api.render();
    },
    onSimpleNew: () => undefined,
    onSimpleEdit: () => undefined,
    onSimpleDisable: () => undefined,
    onSimpleApply: () => undefined
  });

  return { api, document };
}

function createSimpleDraft(): ReferenceDataSimpleDraft {
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

class FakeDocument {
  public activeElement: FakeElement | null = null;

  private constructor(private readonly roots: FakeElement[]) {}

  static createReferenceDataDialog(): FakeDocument {
    const document = new FakeDocument([]);
    const ids = [
      "reference-data-dialog",
      "close-reference-data",
      "reference-data-open-folder",
      "reference-data-create-missing",
      "reference-data-reload",
      "reference-data-status",
      "reference-data-base-path",
      "reference-data-files",
      "reference-data-mode-simple",
      "reference-data-mode-json",
      "reference-data-content"
    ];
    document.roots.push(...ids.map((id) => new FakeElement("div", document, id)));
    return document;
  }

  querySelector<T>(selector: string): T | null {
    return (this.roots.map((root) => root.querySelector<T>(selector)).find(Boolean) as T | undefined) ?? null;
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createDocumentFragment(): FakeElement {
    return new FakeElement("fragment", this);
  }
}

class FakeElement {
  public className = "";
  public hidden = false;
  public disabled = false;
  public textContent = "";
  public title = "";
  public type = "";
  public value = "";
  public checked = false;
  public autocomplete = "";
  public spellcheck = true;
  public selectionStart: number | null = null;
  public selectionEnd: number | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly children: Array<FakeElement | string> = [];
  private readonly listeners = new Map<string, Array<(event?: unknown) => void>>();

  constructor(
    public readonly tagName: string,
    private readonly ownerDocument: FakeDocument,
    public readonly id = ""
  ) {}

  append(...nodes: Array<FakeElement | string>): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: Array<FakeElement | string>): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  addEventListener(eventName: string, listener: (event?: unknown) => void): void {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
  }

  dispatch(eventName: string): void {
    (this.listeners.get(eventName) ?? []).forEach((listener) => listener());
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  contains(candidate: unknown): boolean {
    if (candidate === this) {
      return true;
    }
    return this.children.some((child) => child instanceof FakeElement && child.contains(candidate));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector<T>(selector: string): T | null {
    if (matchesSelector(this, selector)) {
      return this as T;
    }

    for (const child of this.children) {
      if (!(child instanceof FakeElement)) {
        continue;
      }
      const match = child.querySelector<T>(selector);
      if (match) {
        return match;
      }
    }

    return null;
  }
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  if (selector.startsWith("#")) {
    return element.id === selector.slice(1);
  }

  const attributeMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
  if (attributeMatch) {
    return element.getAttribute(attributeMatch[1]) === attributeMatch[2];
  }

  return false;
}
