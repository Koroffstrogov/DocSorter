import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("suggestionV2Panel", () => {
  it("renders Lot G signals without mutating the suggestion payload", async () => {
    const { api, details } = await createPanelHarness(createReadyState());
    const before = JSON.stringify(createReadyState().suggestionState?.result);

    api.render();

    const text = details.getText();
    expect(text).toContain("État : prêt");
    expect(text).toContain("2024-03-05_captur_facture-entretien_renault_vidange.pdf");
    expect(text).not.toContain("entretien-vidange");
    expect(text).toContain("Vehicules/Captur");
    expect(text).toContain("Source : dossier existant");
    expect(text).toContain("Nouveaux dossiers proposés");
    expect(text).toContain("Vehicules/Captur/2024 (création manuelle uniquement)");
    expect(text).toContain("Dossier existant retenu");
    expect(text).toContain("Voir détails");
    expect(text).toContain("Domaine du dossier cohérent");
    expect(text).toContain("Convention du dossier : AAAA-MM_compte-joint_releve-bancaire_bnp.pdf");
    expect(text).toContain("Divergence avec le profil du dossier");
    expect(JSON.stringify(createReadyState().suggestionState?.result)).toBe(before);
  });

  it("renders fallback and incomplete state", async () => {
    const { api, details } = await createPanelHarness(createIncompleteState());

    api.render();

    const text = details.getText();
    expect(text).toContain("Nom v2");
    expect(text).toContain("non généré");
    expect(text).toContain("État : incomplet");
    expect(text).toContain("Divers/A-traiter-manuellement");
    expect(text).toContain("fallback manuel");
    expect(text).toContain("Champs manquants");
    expect(text).toContain("Cible");
    expect(text).toContain("Type documentaire");
    expect(text).toContain("Aucun profil fiable détecté");
  });

  it("renders diagnostic mode and wires explicit diagnostic buttons", async () => {
    const state = createReadyState();
    if (state.suggestionState) {
      state.suggestionState.diagnosticStatus = "ready";
      state.suggestionState.diagnosticResult = {
        mode: "diagnosticExpurge",
        diagnosticKind: "suggestions",
        diagnosticPath: "C:\\user-data\\diagnostics\\diagnostic-suggestions_document.json",
        documentName: "document.pdf",
        message: "Diagnostic suggestions expurgé exporté."
      };
    }
    let suggestionDiagnostics = 0;
    let aiDiagnostics = 0;
    let analyses = 0;
    const { api, diagnosticResult, diagnosticMode, diagnosticButton, aiDiagnosticButton } = await createPanelHarness(state, {
      onAnalyzeDocument: () => {
        analyses += 1;
      },
      onRunDiagnostic: () => {
        suggestionDiagnostics += 1;
      },
      onRunAiDiagnostic: () => {
        aiDiagnostics += 1;
      },
      isAiDiagnosticAvailable: () => true
    });

    api.render();
    diagnosticButton.click();
    aiDiagnosticButton.click();

    expect(diagnosticMode.getText()).toContain("Mode : expurgé");
    expect(diagnosticResult.getText()).toContain("Diagnostic suggestions");
    expect(diagnosticResult.getText()).toContain("diagnostic expurgé");
    expect(diagnosticResult.getText()).toContain("C:\\user-data\\diagnostics\\diagnostic-suggestions_document.json");
    expect(diagnosticResult.getText()).toContain("À transmettre pour analyse.");
    expect(suggestionDiagnostics).toBe(1);
    expect(aiDiagnostics).toBe(1);
    expect(analyses).toBe(0);
  });

  it("shows complete diagnostic mode only for TXX documents", async () => {
    const state = createReadyState();
    state.activeDocument = {
      ...createDocumentItem(),
      name: "T01-facture-captur.pdf"
    };
    const { api, diagnosticMode } = await createPanelHarness(state);

    api.render();

    expect(diagnosticMode.getText()).toContain("Mode : complet");
  });

  it("wires the main analyze action without mutating classification fields", async () => {
    let analyzeCount = 0;
    const { api, analyzeButton } = await createPanelHarness(createReadyState(), {
      onAnalyzeDocument: () => {
        analyzeCount += 1;
      }
    });

    api.render();
    analyzeButton.click();

    expect(analyzeButton.textContent).toBe("Analyser le document");
    expect(analyzeCount).toBe(1);
  });

  it("wires the v2 apply action only when a ready suggestion can fill empty fields", async () => {
    let applyCount = 0;
    const { api, applyButton } = await createPanelHarness(createReadyState(), {
      onApplySuggestionToEmptyFields: () => {
        applyCount += 1;
      },
      canApplySuggestionToEmptyFields: () => true
    });

    api.render();
    applyButton.click();

    expect(applyButton.disabled).toBe(false);
    expect(applyCount).toBe(1);
  });

  it("keeps the v2 apply action disabled when no field can be completed", async () => {
    let applyCount = 0;
    const { api, applyButton } = await createPanelHarness(createReadyState(), {
      onApplySuggestionToEmptyFields: () => {
        applyCount += 1;
      },
      canApplySuggestionToEmptyFields: () => false
    });

    api.render();
    applyButton.click();

    expect(applyButton.disabled).toBe(true);
    expect(applyCount).toBe(0);
  });

  it("does not reference classification, OCR or AI commands", async () => {
    const source = await readFile(panelSourcePath(), "utf8");

    expect(source).not.toContain("executeClassification");
    expect(source).not.toContain("prepareClassificationPlan");
    expect(source).not.toContain("runOcr");
    expect(source).not.toContain("runAi");
    expect(source).not.toContain("classer");
  });
});

async function createPanelHarness(
  state: SuggestionV2PanelState,
  callbacks: Partial<
    Pick<
      SuggestionV2PanelOptions,
      "onRunDiagnostic" | "onRunAiDiagnostic" | "isAiDiagnosticAvailable"
      | "onAnalyzeDocument" | "isAnalyzeDisabled"
      | "onApplySuggestionToEmptyFields" | "canApplySuggestionToEmptyFields"
    >
  > = {}
) {
  const details = new FakeElement("div", "suggestion-v2-details");
  const panel = new FakeElement("section", "suggestion-v2-panel");
  const analyzeButton = new FakeElement("button", "analyze-document-v2");
  const applyButton = new FakeElement("button", "apply-suggestion-v2-empty");
  const diagnosticPanel = new FakeElement("details", "suggestion-v2-diagnostic-panel");
  const diagnosticMode = new FakeElement("p", "suggestion-v2-diagnostic-mode");
  const diagnosticResult = new FakeElement("div", "suggestion-v2-diagnostic-result");
  const diagnosticButton = new FakeElement("button", "run-suggestion-v2-diagnostic");
  const aiDiagnosticButton = new FakeElement("button", "run-suggestion-v2-ai-diagnostic");
  const document = new FakeDocument([
    panel,
    analyzeButton,
    applyButton,
    diagnosticPanel,
    diagnosticMode,
    diagnosticResult,
    diagnosticButton,
    aiDiagnosticButton,
    details
  ]);
  const context: Record<string, unknown> = {
    document,
    createIdleSuggestionV2DocumentState: () => ({
      status: "idle",
      result: null,
      error: null,
      diagnosticStatus: "idle",
      diagnosticResult: null,
      diagnosticError: null
    })
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

  const factory = context.DocSorterSuggestionV2Panel as SuggestionV2PanelFactoryApi;
  return {
    api: factory.createSuggestionV2Panel({
      root: document as unknown as ParentNode,
      getState: () => state,
      ...callbacks
    }),
    details,
    analyzeButton,
    applyButton,
    diagnosticPanel,
    diagnosticMode,
    diagnosticResult,
    diagnosticButton,
    aiDiagnosticButton
  };
}

function panelSourcePath(): string {
  return path.join(process.cwd(), "src", "renderer", "suggestionV2Panel.ts");
}

function createReadyState(): SuggestionV2PanelState {
  return {
    activeDocument: createDocumentItem(),
    suggestionState: {
      status: "ready",
      error: null,
      diagnosticStatus: "idle",
      diagnosticResult: null,
      diagnosticError: null,
      result: {
        status: "ready",
        documentName: "scan_renault_captur.pdf",
        extension: ".pdf",
        draft: {
          dateToken: "2024-03-05",
          target: "captur",
          documentType: "facture-entretien",
          issuer: "renault",
          detail: "vidange",
          proposedName: "2024-03-05_captur_facture-entretien_renault_vidange.pdf",
          confidence: 84,
          reasons: ["Doublons sémantiques retirés des blocs émetteur/détail."],
          warnings: [],
          source: {},
          namingMessages: []
        },
        targetFolderSuggestion: {
          recommended: {
            label: "equilibre",
            relativePath: "Vehicules/Captur",
            depth: 2,
            recommended: true,
            confidence: 92,
            reasons: ["Profondeur équilibrée recommandée."],
            warnings: [],
            source: "inventory"
          },
          options: [
            {
              label: "court",
              relativePath: "Vehicules",
              depth: 1,
              recommended: false,
              confidence: 60,
              reasons: [],
              warnings: [],
              source: "rules-v2"
            },
            {
              label: "equilibre",
              relativePath: "Vehicules/Captur",
              depth: 2,
              recommended: true,
              confidence: 92,
              reasons: ["Profondeur équilibrée recommandée."],
              warnings: [],
              requiresCreation: false,
              source: "inventory"
            },
            {
              label: "detaille",
              relativePath: "Vehicules/Captur/2024",
              depth: 3,
              recommended: false,
              confidence: 72,
              reasons: ["Dossier détaillé avec période."],
              warnings: [],
              requiresCreation: true,
              source: "rules-v2"
            }
          ],
          warnings: [],
          reasons: ["Dossier existant retenu : Vehicules/Captur."]
        },
        folderPlacement: {
          relativePath: "Vehicules/Captur",
          score: 95,
          confidence: 95,
          exists: true,
          source: "inventory",
          reasons: [
            "Dossier existant retenu : Vehicules/Captur.",
            "Domaine du dossier cohérent avec le type documentaire."
          ],
          warnings: []
        },
        folderPlacementCandidates: [],
        folderNamingProfile: {
          status: "detected",
          conventionExample: "AAAA-MM_compte-joint_releve-bancaire_bnp.pdf",
          confidence: 100,
          analyzedFileCount: 2,
          v2FileCount: 2,
          reasons: ["2 nom(s) v2 conforme(s) détecté(s) dans le dossier."],
          warnings: ["Divergence avec le profil du dossier : cible habituelle différente."],
          dominantDatePrecision: "month",
          dominantTarget: "compte-joint",
          dominantDocumentType: "releve-bancaire",
          dominantIssuer: "bnp"
        },
        missingFields: [],
        referenceDataWarnings: [],
        builtAt: "2026-06-17T10:00:00.000Z",
        message: "Suggestion v2 expérimentale prête."
      }
    }
  };
}

function createIncompleteState(): SuggestionV2PanelState {
  return {
    activeDocument: createDocumentItem(),
    suggestionState: {
      status: "ready",
      error: null,
      diagnosticStatus: "idle",
      diagnosticResult: null,
      diagnosticError: null,
      result: {
        status: "ready",
        documentName: "document.pdf",
        extension: ".pdf",
        draft: {
          dateToken: "date-inconnue",
          confidence: 12,
          reasons: [],
          warnings: ["Cible absente : nom v2 final non généré."],
          source: {},
          namingMessages: []
        },
        targetFolderSuggestion: {
          recommended: {
            label: "court",
            relativePath: "Divers/A-traiter-manuellement",
            depth: 2,
            recommended: true,
            confidence: 15,
            reasons: ["Fallback manuel proposé sans création automatique."],
            warnings: [],
            source: "fallback"
          },
          options: [],
          warnings: [],
          reasons: []
        },
        folderPlacement: {
          relativePath: "Divers/A-traiter-manuellement",
          score: 15,
          confidence: 15,
          exists: false,
          source: "fallback",
          reasons: ["Fallback manuel proposé sans création automatique."],
          warnings: []
        },
        folderPlacementCandidates: [],
        folderNamingProfile: null,
        missingFields: ["dateToken", "target", "documentType"],
        referenceDataWarnings: [],
        builtAt: "2026-06-17T10:00:00.000Z",
        message: "Suggestion v2 expérimentale incomplète."
      }
    }
  };
}

function createDocumentItem(): DocumentItem {
  return {
    name: "document.pdf",
    filePath: "Z:\\source\\document.pdf",
    extension: ".pdf",
    sizeBytes: 1,
    sizeLabel: "1 octet",
    modifiedAt: "2026-06-17T10:00:00.000Z",
    status: "pending"
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

  createDocumentFragment(): FakeElement {
    return new FakeElement("fragment");
  }
}

class FakeElement {
  public className = "";
  public title = "";
  public hidden = false;
  public disabled = false;
  public textContent = "";
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

  click(): void {
    if (this.disabled) {
      return;
    }

    (this.listeners.get("click") ?? []).forEach((listener) => {
      listener();
    });
  }

  getText(): string {
    return [
      this.textContent,
      ...this.children.map((child) => typeof child === "string" ? child : child.getText())
    ].filter(Boolean).join(" ");
  }
}
