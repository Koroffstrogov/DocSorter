import "./aiPanelFormatters";
import "./aiFieldRows";
import "./aiFolderCandidates";

import { describe, expect, it } from "vitest";

const folderCandidates = globalThis.DocSorterAiFolderCandidates;

describe("ai folder candidates renderer module", () => {
  it("renders the empty state before a suggestion exists", () => {
    installTestDocument();

    const nodes = folderCandidates.createFolderCandidateContent(createAiState(), {
      onFolderCandidateSelect: () => undefined
    });

    expect(asTestElement(nodes[0]).textContent).toBe("Analyse IA requise pour proposer un dossier.");
  });

  it("renders the analyzing state", () => {
    installTestDocument();

    const nodes = folderCandidates.createFolderCandidateContent(createAiState({ panelStatus: "analyzing" }), {
      onFolderCandidateSelect: () => undefined
    });

    expect(asTestElement(nodes[0]).textContent).toBe("Analyse IA en cours. Les dossiers proposés apparaîtront ici.");
  });

  it("renders current folder, three cards, roles, selection, and callback", () => {
    installTestDocument();
    const selected: string[] = [];
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
      }
    });

    const root = asTestElement(nodes[0]);
    const cards = root.children[1];
    expect(root.className).toBe("folder-candidate-content");
    expect(root.children[0].textContent).toBe("Dossier proposé actuel : Scolarite/Lea");
    expect(cards.children).toHaveLength(3);
    expect(cards.children[0].className).toContain("existing");
    expect(cards.children[1].className).toContain("new");
    expect(cards.children[1].className).toContain("selected");
    expect(cards.children[1].getAttribute("aria-pressed")).toBe("true");
    expect(cards.children[2].className).toContain("fallback");
    expect(collectText(root)).not.toContain("Autre");

    cards.children[0].click();
    expect(selected).toEqual(["Scolarite"]);
  });
});

function installTestDocument(): void {
  (globalThis as unknown as { document: { createElement: (tagName: string) => TestElement } }).document = {
    createElement: (tagName: string) => new TestElement(tagName)
  };
}

class TestElement {
  readonly children: TestElement[] = [];
  readonly tagName: string;
  textContent = "";
  className = "";
  title = "";
  type = "";
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();

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

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      listener();
    }
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
