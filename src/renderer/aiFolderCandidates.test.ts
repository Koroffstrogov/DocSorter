import "./aiPanelFormatters";
import "./aiFieldRows";
import "./aiFolderCandidates";

import { describe, expect, it } from "vitest";

const folderCandidates = globalThis.DocSorterAiFolderCandidates;

describe("ai folder candidates renderer module", () => {
  it("renders the empty state before a suggestion exists", () => {
    installTestDocument();

    const nodes = folderCandidates.createFolderCandidateContent(createAiState(), {
      onFolderCandidateSelect: () => undefined,
      onFolderManualEditStart: () => undefined,
      onFolderManualValueChange: () => undefined,
      onFolderManualEditFinish: () => undefined
    });

    expect(asTestElement(nodes[0]).textContent).toBe("Analyse IA requise pour proposer un dossier.");
  });

  it("renders the analyzing state", () => {
    installTestDocument();

    const nodes = folderCandidates.createFolderCandidateContent(createAiState({ panelStatus: "analyzing" }), {
      onFolderCandidateSelect: () => undefined,
      onFolderManualEditStart: () => undefined,
      onFolderManualValueChange: () => undefined,
      onFolderManualEditFinish: () => undefined
    });

    expect(asTestElement(nodes[0]).textContent).toBe("Analyse IA en cours. Les dossiers proposés apparaîtront ici.");
  });

  it("renders three compact cards, roles, selection, badges, and callback", () => {
    installTestDocument();
    const selected: string[] = [];
    let editStarted = false;
    const nodes = folderCandidates.createFolderCandidateContent(createAiState({
      selection: createSelectionState({ selectedFolder: "Scolarite/Lea" }),
      suggestion: createSuggestion({
        folderCandidates: [
          { value: "Scolarite", score: 92, reason: "existing", role: "existing", exists: true },
          { value: "Scolarite/Lea", score: 88, reason: "new", role: "newFolderProposal", requiresCreation: true },
          { value: "Divers/A-traiter-manuellement", score: 12, reason: "fallback", role: "fallback" },
          { value: "Autre", score: 4, reason: "extra", role: "candidate" }
        ]
      })
    }), {
      onFolderCandidateSelect: (relativePath) => {
        selected.push(relativePath);
      },
      onFolderManualEditStart: () => {
        editStarted = true;
      },
      onFolderManualValueChange: () => undefined,
      onFolderManualEditFinish: () => undefined
    });

    const root = asTestElement(nodes[0]);
    const cards = root.children[0];
    expect(root.className).toBe("folder-candidate-content");
    expect(cards.children).toHaveLength(3);
    expect(cards.children[0].className).toContain("existing");
    expect(cards.children[1].className).toContain("new");
    expect(cards.children[1].className).toContain("selected");
    expect(cards.children[1].getAttribute("aria-pressed")).toBe("true");
    expect(cards.children[1].children[0].textContent).toBe("✓");
    expect(collectText(cards.children[0])).toContain("existe");
    expect(collectText(cards.children[1])).toContain("à créer");
    expect(collectText(cards.children[2])).toContain("fallback");
    expect(collectText(root)).not.toContain("score");
    expect(cards.children[2].className).toContain("fallback");
    expect(collectText(root)).not.toContain("Autre");

    cards.children[0].click();
    expect(selected).toEqual(["Scolarite"]);
    root.children[1].children[0].click();
    expect(editStarted).toBe(true);
  });

  it("renders a manual folder input and reports typed values", () => {
    installTestDocument();
    const values: string[] = [];
    let finished = false;
    const nodes = folderCandidates.createFolderCandidateContent(createAiState({
      selection: createSelectionState({
        selectedFolder: "Scolarite/Lea",
        editingFolder: true
      }),
      suggestion: createSuggestion({
        folderCandidates: [
          { value: "Scolarite/Lea", score: 88, reason: "new", role: "newFolderProposal", requiresCreation: true }
        ]
      })
    }), {
      onFolderCandidateSelect: () => undefined,
      onFolderManualEditStart: () => undefined,
      onFolderManualValueChange: (relativePath) => {
        values.push(relativePath);
      },
      onFolderManualEditFinish: () => {
        finished = true;
      }
    });

    const root = asTestElement(nodes[0]);
    const manualControl = root.children[1];
    const input = manualControl.children[0];
    expect(manualControl.className).toContain("editing");
    expect(input.className).toBe("folder-manual-input");
    expect(input.value).toBe("Scolarite/Lea");

    input.value = "Scolarite/Lea/2026";
    input.dispatch("input");
    input.dispatch("blur");

    expect(values).toEqual(["Scolarite/Lea/2026"]);
    expect(finished).toBe(true);
  });

  it("does not display a Windows absolute path in compact cards", () => {
    installTestDocument();
    const nodes = folderCandidates.createFolderCandidateContent(createAiState({
      selection: createSelectionState({ selectedFolder: "C:\\Users\\Seb\\Documents\\CNI" }),
      suggestion: createSuggestion({
        folderCandidates: [
          { value: "C:\\Users\\Seb\\Documents\\CNI", score: 90, reason: "absolute", role: "existing", exists: true }
        ]
      })
    }), {
      onFolderCandidateSelect: () => undefined,
      onFolderManualEditStart: () => undefined,
      onFolderManualValueChange: () => undefined,
      onFolderManualEditFinish: () => undefined
    });

    expect(collectText(asTestElement(nodes[0]))).toContain("CNI");
    expect(collectText(asTestElement(nodes[0]))).not.toContain("C:\\");
  });
});

function installTestDocument(): void {
  (globalThis as unknown as { document: { createElement: (tagName: string) => TestElement } }).document = {
    createElement: (tagName: string) => new TestElement(tagName)
  };
  (globalThis as unknown as { window: { setTimeout: (callback: () => void) => number } }).window = {
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    }
  };
}

class TestElement {
  readonly children: TestElement[] = [];
  readonly tagName: string;
  textContent = "";
  className = "";
  title = "";
  type = "";
  value = "";
  placeholder = "";
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event?: TestEvent) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name: string, listener: (event?: TestEvent) => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      listener();
    }
  }

  dispatch(name: string): void {
    const event = new TestEvent();
    for (const listener of this.listeners.get(name) ?? []) {
      listener(event);
    }
  }

  focus(): void {
    return;
  }

  blur(): void {
    this.dispatch("blur");
  }

  setSelectionRange(): void {
    return;
  }
}

class TestEvent {
  key = "";

  preventDefault(): void {
    return;
  }
}

function asTestElement(value: unknown): TestElement {
  return value as TestElement;
}

function collectText(element: TestElement): string {
  return [element.textContent, ...element.children.map(collectText)].join(" ");
}

function createAiState(overrides: {
  panelStatus?: AiPanelStatus;
  suggestion?: RendererAiDocumentSuggestion | null;
  selection?: AiSelectionState | null;
} = {}): AiState {
  return {
    panelStatus: overrides.panelStatus ?? "ready",
    status: null,
    draft: {
      enabled: true,
      profileId: "gemma3-4b",
      baseUrl: "http://localhost:11434/",
      model: "gemma3:4b",
      timeoutMs: "30000",
      keepAlive: "30m"
    },
    message: "ready",
    error: null,
    dirty: false,
    modelStatus: null,
    suggestion: overrides.suggestion ?? null,
    suggestionDocumentPath: null,
    selection: overrides.selection ?? null,
    timing: {
      stage: "idle",
      startedAtMs: null,
      elapsedMs: 0,
      finalElapsedMs: null,
      lastLoadMs: null,
      lastAnalysisMs: null,
      lastGenerationMs: null,
      model: "",
      profileId: null,
      think: null
    }
  };
}

function createSelectionState(overrides: Partial<AiSelectionState> = {}): AiSelectionState {
  return {
    fields: {
      dateToken: "",
      subject: "",
      target: "",
      documentType: "",
      issuer: "",
      detail: ""
    },
    manualFields: {},
    editingField: null,
    editingFolder: false,
    selectedFolder: "",
    previewFilename: "",
    previewFilenameValid: false,
    previewMessages: [],
    previewDestinationFolder: "",
    ...overrides
  };
}

function createSuggestion(responseJson: unknown): RendererAiDocumentSuggestion {
  return {
    status: "ready",
    documentName: "document.pdf",
    extension: ".pdf",
    model: "gemma3:4b",
    suggestedAt: "2026-06-19T10:00:00.000Z",
    textSource: "pdf-native",
    modelStatus: {
      status: "ready",
      model: "gemma3:4b",
      message: "ready",
      loadedAt: null,
      keepAliveUntil: null,
      lastCheckedAt: null,
      error: null
    },
    profile: {
      id: "gemma3-4b",
      label: "gemma3:4b",
      model: "gemma3:4b",
      think: false
    },
    responseJson,
    thinking: null,
    suggestion: {
      dateToken: "2026",
      subject: "lea",
      target: "lea",
      documentType: "certificat-scolarite",
      issuer: "",
      detail: "",
      proposedName: "2026_lea_certificat-scolarite.pdf",
      targetFolder: "Scolarite/Lea",
      confidence: 82,
      reasons: [],
      warnings: [],
      source: "ollama"
    },
    promptCharacterCount: 2500,
    message: "ready"
  };
}
