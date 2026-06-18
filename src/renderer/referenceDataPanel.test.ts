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

  it("selects an entry by clicking its card and shows saved values", async () => {
    const harness = await createPanelHarness({
      entries: [
        {
          id: "paul",
          label: "Paul Martin",
          fileAlias: "paul",
          folderAlias: "Sante/Paul",
          aliases: ["Paul", "Paul Martin"],
          birthDate: "2014-03-12"
        }
      ],
      editingIndex: 0
    });

    harness.api.render();
    const card = harness.document.querySelector<FakeElement>(".reference-data-entry");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("aria-current")).toBe("true");
    card!.dispatch("click");
    expect(harness.calls.simpleEdit).toEqual([0]);

    const details = harness.document.querySelector<FakeElement>(".reference-data-selected-entry");
    expect(details?.text()).toContain("Valeurs sauvegardées");
    expect(details?.text()).toContain("Sante/Paul");
    expect(details?.text()).toContain("2014-03-12");
  });

  it("shows creation/editing headings and field help", async () => {
    const harness = await createPanelHarness();

    harness.api.render();
    expect(harness.document.querySelector<FakeElement>(".reference-data-form-heading")?.text()).toContain(
      "Nouvelle entrée"
    );
    expect(harness.document.querySelector<FakeElement>(".reference-data-field-help")?.text()).toContain(
      "Obligatoire"
    );

    harness.state.simpleDraft = {
      ...harness.state.simpleDraft,
      editingIndex: 0,
      label: "Paul Martin",
      fileAlias: "paul"
    };
    harness.api.render();
    expect(harness.document.querySelector<FakeElement>(".reference-data-form-heading")?.text()).toContain(
      "Modification de Paul Martin"
    );
  });

  it("keeps assistant save disabled until the current content is validated", async () => {
    const harness = await createPanelHarness({
      entries: [
        {
          id: "paul",
          label: "Paul Martin",
          fileAlias: "paul",
          aliases: ["Paul"]
        }
      ]
    });

    harness.api.render();
    expect(harness.document.querySelector<FakeElement>(".reference-data-save-action")?.disabled).toBe(true);

    const content = harness.state.jsonDrafts.people ?? "";
    harness.state.validation = {
      ok: true,
      value: harness.state.overview!.files[0]
    };
    harness.state.lastValidatedFileKey = "people";
    harness.state.lastValidatedContent = content;
    harness.api.render();

    expect(harness.document.querySelector<FakeElement>(".reference-data-save-action")?.disabled).toBe(false);
  });

  it("shows only fields relevant to the selected reference type", async () => {
    const people = await createPanelHarness({ selectedFileKey: "people" });
    people.api.render();
    expect(people.document.querySelector<FakeElement>('[data-reference-field="birthDate"]')).not.toBeNull();
    expect(people.document.querySelector<FakeElement>('[data-reference-field="domains"]')).toBeNull();

    const providers = await createPanelHarness({ selectedFileKey: "providers" });
    providers.api.render();
    expect(providers.document.querySelector<FakeElement>('[data-reference-field="domains"]')).not.toBeNull();
    expect(providers.document.querySelector<FakeElement>('[data-reference-field="birthDate"]')).toBeNull();
    expect(providers.document.querySelector<FakeElement>('[data-reference-field="folderAlias"]')).toBeNull();
  });

  it("renders document types in assistant mode instead of forcing raw JSON", async () => {
    const harness = await createPanelHarness({
      selectedFileKey: "documentTypes",
      entries: [
        {
          id: "avis-imposition",
          label: "Avis d'imposition",
          fileAlias: "avis-imposition",
          aliases: ["avis d'imposition"]
        }
      ]
    });

    harness.api.render();
    expect(harness.document.querySelector<FakeElement>(".reference-data-form")).not.toBeNull();
    expect(harness.document.querySelector<FakeElement>(".reference-data-json")).toBeNull();
    expect(harness.document.querySelector<FakeElement>('[data-reference-field="folderAlias"]')).toBeNull();
  });

  it("exposes delete only on the selected entry", async () => {
    const harness = await createPanelHarness({
      entries: [
        {
          id: "paul",
          label: "Paul Martin",
          fileAlias: "paul",
          aliases: ["Paul"]
        }
      ],
      editingIndex: 0
    });

    harness.api.render();
    const deleteButton = harness.document.querySelector<FakeElement>(".reference-data-delete-action");
    expect(deleteButton).not.toBeNull();

    deleteButton!.dispatch("click");
    expect(harness.calls.simpleDelete).toEqual([0]);
  });
});

async function createPanelHarness(options: {
  entries?: Array<Record<string, unknown>>;
  editingIndex?: number | null;
  selectedFileKey?: ReferenceDataFileKey;
} = {}): Promise<{
  api: ReferenceDataPanelApi;
  document: FakeDocument;
  state: ReferenceDataState;
  calls: { simpleEdit: number[]; simpleDelete: number[]; cancelChanges: ReferenceDataFileKey[] };
}> {
  const content = `${JSON.stringify(options.entries ?? [], null, 2)}\n`;
  const selectedFileKey = options.selectedFileKey ?? "people";
  const state: ReferenceDataState = {
    isOpen: true,
    status: "ready",
    mode: "simple",
    selectedFileKey,
    overview: {
      basePath: "C:\\user-data\\config\\reference-data",
      catalogStatus: "ready",
      catalogWarnings: [],
      files: [
        {
          key: selectedFileKey,
          label: referenceDataFileLabel(selectedFileKey),
          relativePath: referenceDataFilePath(selectedFileKey),
          status: "valid",
          content,
          entryCount: options.entries?.length ?? 0,
          errors: [],
          warnings: []
        }
      ]
    },
    jsonDrafts: {
      [selectedFileKey]: content
    },
    simpleDraft: {
      ...createSimpleDraft(),
      editingIndex: options.editingIndex ?? null,
      ...(typeof options.editingIndex === "number" && options.entries?.[options.editingIndex]
        ? {
            label: String(options.entries[options.editingIndex].label ?? ""),
            fileAlias: String(options.entries[options.editingIndex].fileAlias ?? ""),
            folderAlias: String(options.entries[options.editingIndex].folderAlias ?? ""),
            aliases: Array.isArray(options.entries[options.editingIndex].aliases)
              ? (options.entries[options.editingIndex].aliases as string[]).join(", ")
              : "",
            birthDate: String(options.entries[options.editingIndex].birthDate ?? "")
          }
        : {})
    },
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    validation: null,
    message: "Référentiels chargés.",
    error: null
  };
  const calls = {
    simpleEdit: [] as number[],
    simpleDelete: [] as number[],
    cancelChanges: [] as ReferenceDataFileKey[]
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
    onCancelChanges: (fileKey) => {
      calls.cancelChanges.push(fileKey);
    },
    onSimpleFieldChange: (field, value) => {
      state.simpleDraft = {
        ...state.simpleDraft,
        [field]: value
      };
      api.render();
    },
    onSimpleNew: () => undefined,
    onSimpleEdit: (index) => {
      calls.simpleEdit.push(index);
    },
    onSimpleDisable: () => undefined,
    onSimpleDelete: (index) => {
      calls.simpleDelete.push(index);
    },
    onSimpleApply: () => undefined
  });

  return { api, document, state, calls };
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

function referenceDataFileLabel(fileKey: ReferenceDataFileKey): string {
  switch (fileKey) {
    case "people":
      return "Personnes";
    case "vehicles":
      return "Véhicules";
    case "properties":
      return "Biens";
    case "providers":
      return "Fournisseurs";
    case "documentTypes":
      return "Types documentaires";
  }
}

function referenceDataFilePath(fileKey: ReferenceDataFileKey): string {
  switch (fileKey) {
    case "people":
      return "entities/people.json";
    case "vehicles":
      return "entities/vehicles.json";
    case "properties":
      return "entities/properties.json";
    case "providers":
      return "entities/providers.json";
    case "documentTypes":
      return "document-types.json";
  }
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
  public placeholder = "";
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
    const event = {
      key: eventName === "keydown" ? "Enter" : "",
      stopPropagation: () => undefined,
      preventDefault: () => undefined
    };
    (this.listeners.get(eventName) ?? []).forEach((listener) => listener(event));
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

  text(): string {
    return [
      this.textContent,
      ...this.children.map((child) => child instanceof FakeElement ? child.text() : child)
    ].join("");
  }
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  if (selector.startsWith("#")) {
    return element.id === selector.slice(1);
  }

  if (selector.startsWith(".")) {
    const requiredClasses = selector.slice(1).split(".");
    const classes = new Set(element.className.split(/\s+/).filter(Boolean));
    return requiredClasses.every((className) => classes.has(className));
  }

  const attributeMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
  if (attributeMatch) {
    return element.getAttribute(attributeMatch[1]) === attributeMatch[2];
  }

  return false;
}
