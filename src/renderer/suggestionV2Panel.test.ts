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
    expect(text).toContain("2024-03-05_captur_facture-entretien_renault_vidange.pdf");
    expect(text).not.toContain("entretien-vidange");
    expect(text).toContain("Vehicules/Captur");
    expect(text).toContain("Source : dossier existant");
    expect(text).toContain("Dossier existant retenu");
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
    expect(text).toContain("Divers/A-traiter-manuellement");
    expect(text).toContain("fallback manuel");
    expect(text).toContain("Champs manquants");
    expect(text).toContain("Cible");
    expect(text).toContain("Type documentaire");
    expect(text).toContain("Aucun profil fiable détecté");
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

async function createPanelHarness(state: SuggestionV2PanelState) {
  const details = new FakeElement("div", "suggestion-v2-details");
  const panel = new FakeElement("section", "suggestion-v2-panel");
  const document = new FakeDocument([panel, details]);
  const context: Record<string, unknown> = {
    document,
    createIdleSuggestionV2DocumentState: () => ({
      status: "idle",
      result: null,
      error: null
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
      getState: () => state
    }),
    details
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
            source: "preference"
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
              source: "preference"
            }
          ],
          warnings: [],
          reasons: ["Dossier existant retenu : Vehicules/Captur."]
        },
        folderPlacement: {
          relativePath: "Vehicules/Captur",
          confidence: 95,
          exists: true,
          source: "inventory",
          reasons: [
            "Dossier existant retenu : Vehicules/Captur.",
            "Domaine du dossier cohérent avec le type documentaire."
          ],
          warnings: []
        },
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
          confidence: 15,
          exists: false,
          source: "fallback",
          reasons: ["Fallback manuel proposé sans création automatique."],
          warnings: []
        },
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
  public textContent = "";
  private readonly children: Array<FakeElement | string> = [];

  constructor(public readonly tagName: string, public readonly id = "") {}

  append(...nodes: Array<FakeElement | string>): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: Array<FakeElement | string>): void {
    this.children.splice(0, this.children.length);
    this.textContent = "";
    this.append(...nodes);
  }

  getText(): string {
    return [
      this.textContent,
      ...this.children.map((child) => typeof child === "string" ? child : child.getText())
    ].filter(Boolean).join(" ");
  }
}
