import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("textExtractionPanel", () => {
  it("renders extracted text as an editable in-memory field", async () => {
    const changes: Array<{ filePath: string; text: string }> = [];
    const { api, details } = await createPanelHarness(createReadyState(), {
      onTextChange: (documentItem, text) => {
        changes.push({ filePath: documentItem.filePath, text });
      }
    });

    api.render();

    const textarea = details.findByTag("textarea");
    expect(textarea?.value).toContain("ARTÉFACT OCR");
    expect(details.getText()).toContain(
      "Les corrections restent en mémoire pour ce document"
    );

    textarea!.value = "Facture Renault Captur vidange du 05/03/2024";
    textarea!.input();

    expect(changes).toEqual([
      {
        filePath: "Z:\\source\\document.pdf",
        text: "Facture Renault Captur vidange du 05/03/2024"
      }
    ]);
  });

  it("keeps extraction explicit and does not trigger analysis from text edits", async () => {
    const source = await readFile(panelSourcePath(), "utf8");

    expect(source).toContain("onTextChange");
    expect(source).not.toContain("analyzeNamingSuggestions");
    expect(source).not.toContain("runSuggestionV2");
    expect(source).not.toContain("runAiSuggestion");
  });
});

async function createPanelHarness(
  state: TextExtractionPanelState,
  callbacks: Partial<Pick<TextExtractionPanelOptions, "onTextChange" | "onExtract">> = {}
) {
  const panel = new FakeElement("section", "text-extraction-panel");
  const extractButton = new FakeElement("button", "extract-pdf-text");
  const details = new FakeElement("div", "text-extraction-details");
  const document = new FakeDocument([panel, extractButton, details]);
  const context: Record<string, unknown> = {
    document
  };
  context.globalThis = context;

  const source = await readFile(panelSourcePath(), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  vm.runInNewContext(js, context);

  const factory = context.DocSorterTextExtractionPanel as TextExtractionPanelFactoryApi;
  return {
    api: factory.createTextExtractionPanel({
      root: document as unknown as ParentNode,
      getState: () => state,
      canExtract: () => true,
      onExtract: callbacks.onExtract ?? (() => undefined),
      onTextChange: callbacks.onTextChange ?? (() => undefined),
      formatDate: (value) => value
    }),
    details,
    extractButton,
    panel
  };
}

function panelSourcePath(): string {
  return path.join(process.cwd(), "src", "renderer", "textExtractionPanel.ts");
}

function createReadyState(): TextExtractionPanelState {
  return {
    activeDocument: {
      name: "document.pdf",
      filePath: "Z:\\source\\document.pdf",
      extension: ".pdf",
      sizeBytes: 1,
      sizeLabel: "1 octet",
      modifiedAt: "2026-06-17T10:00:00.000Z",
      status: "pending"
    },
    textExtraction: {
      byDocumentPath: {
        "Z:\\source\\document.pdf": {
          status: "text-found",
          error: null,
          result: {
            status: "text-found",
            source: "pdf-native",
            pageCount: 1,
            pagesAnalyzed: 1,
            text: "Facture Renault Captur ARTÉFACT OCR vidange",
            characterCount: 42,
            excerpt: "Facture Renault Captur ARTÉFACT OCR vidange",
            excerptCharacterCount: 42,
            truncated: false,
            extractedAt: "2026-06-17T10:00:00.000Z",
            fromCache: false
          }
        }
      }
    }
  };
}

class FakeDocument {
  private readonly children: FakeElement[];

  constructor(children: FakeElement[]) {
    this.children = children;
  }

  querySelector<T>(_selector: string): T | null {
    const selector = _selector.trim();
    if (!selector.startsWith("#")) {
      return null;
    }

    const id = selector.slice(1);
    return (this.children.find((child) => child.id === id) as T | undefined) ?? null;
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

class FakeElement {
  public className = "";
  public hidden = false;
  public disabled = false;
  public textContent = "";
  public value = "";
  public spellcheck = true;
  private readonly children: Array<FakeElement | string> = [];
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(public readonly tagName: string, public readonly id = "") {}

  append(...nodes: Array<FakeElement | string>): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: Array<FakeElement | string>): void {
    this.children.splice(0, this.children.length);
    this.textContent = "";
    this.append(...nodes);
  }

  addEventListener(eventName: string, listener: () => void): void {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
  }

  setAttribute(): void {
    return undefined;
  }

  input(): void {
    (this.listeners.get("input") ?? []).forEach((listener) => {
      listener();
    });
  }

  findByTag(tagName: string): FakeElement | null {
    if (this.tagName === tagName) {
      return this;
    }

    for (const child of this.children) {
      if (typeof child !== "string") {
        const match = child.findByTag(tagName);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }

  getText(): string {
    return [
      this.textContent,
      this.value,
      ...this.children.map((child) => typeof child === "string" ? child : child.getText())
    ].filter(Boolean).join(" ");
  }
}
