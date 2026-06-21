import { readFile } from "node:fs/promises";
import path from "node:path";

import "./aiPanelFormatters";
import "./aiFieldRows";

import { describe, expect, it } from "vitest";

const fieldRows = globalThis.DocSorterAiFieldRows;

describe("ai field rows renderer module", () => {
  it("normalizes and sorts folder candidates for the parent ai panel", () => {
    const suggestion = createSuggestion({
      folderCandidates: [
        { value: "", score: 100, reason: "empty", role: "candidate" },
        { value: "Scolarite/Lea", score: 72.6, reason: "new", role: "newFolderProposal", requiresCreation: true },
        { value: "Scolarite", score: 91.2, reason: "existing", role: "existing", exists: true },
        { value: "Divers", score: "bad", reason: "fallback", role: "fallback" }
      ]
    });

    expect(fieldRows.getFolderCandidates(suggestion)).toEqual([
      { value: "Scolarite", score: 91, reason: "existing", role: "existing", exists: true },
      {
        value: "Scolarite/Lea",
        score: 73,
        reason: "new",
        role: "newFolderProposal",
        requiresCreation: true
      },
      { value: "Divers", score: 0, reason: "fallback", role: "fallback" }
    ]);
  });

  it("filters redundant subject candidates from the field rows", () => {
    const suggestion = createSuggestion({
      fields: {
        subject: {
          selected: "",
          candidates: [
            { value: "releve-bancaire", score: 95, reason: "type répété", role: "selected" },
            { value: "foyer", score: 90, reason: "cible répétée" },
            { value: "bnp-paribas", score: 80, reason: "émetteur répété" },
            { value: "mai-2026", score: 70, reason: "détail répété" },
            { value: "compte-courant", score: 60, reason: "sujet distinct" }
          ]
        },
        target: { selected: "foyer", candidates: [{ value: "foyer", score: 90, reason: "cible" }] },
        documentType: {
          selected: "releve-bancaire",
          candidates: [{ value: "releve-bancaire", score: 95, reason: "type" }]
        },
        issuer: {
          selected: "bnp-paribas",
          candidates: [{ value: "bnp-paribas", score: 80, reason: "émetteur" }]
        },
        detail: { selected: "mai-2026", candidates: [{ value: "mai-2026", score: 70, reason: "détail" }] }
      }
    }, {
      subject: "",
      target: "foyer",
      documentType: "releve-bancaire",
      issuer: "bnp-paribas",
      detail: "mai-2026"
    });

    expect(fieldRows.getFieldCandidates(suggestion, "subject")).toEqual([
      { value: "compte-courant", score: 60, reason: "sujet distinct", role: "" }
    ]);
  });

  it("keeps the field refinement rendering isolated in the extracted module", async () => {
    const source = await readAiFieldRowsSource();

    expect(source).toContain("Analyse IA requise pour afficher les choix par champ.");
    expect(source).toContain("Analyse IA en cours. Les choix par champ apparaîtront ici.");
    expect(source).toContain('createAiFieldRow("Date"');
    expect(source).toContain('createAiFieldRow("Sujet"');
    expect(source).toContain('createAiFieldRow("Cible"');
    expect(source).toContain('createAiFieldRow("Type"');
    expect(source).toContain('createAiFieldRow("Émetteur"');
    expect(source).toContain('createAiFieldRow("Détail"');
    expect(source).toContain(".slice(0, 3)");
    expect(source).toContain('editButton.textContent = "✎"');
    expect(source).toContain('editButton.setAttribute("aria-label"');
    expect(source).toContain('badge.textContent = "manuel"');
    expect(source).toContain("badge.hidden = !isManual");
    expect(source).toContain('button.textContent = `${candidate.value} ${candidate.score}%`;');
    expect(source).toContain("emptyValueLabel(key)");
    expect(source).toContain('key === "subject"');
    expect(source).toContain('"non utilisé"');
    expect(source).toContain("isOptionalField(key)");
    expect(source).toContain("createEmptyCandidateButton");
    expect(source).toContain("createKnownTargetPicker");
    expect(source).toContain('isEditing && key === "target"');
    expect(source).toContain("Choisir une cible connue");
    expect(source).toContain("Saisie libre");
    expect(source).toContain("Gérer la liste");
    expect(source).toContain("known-target-management-list");
    expect(source).toContain("createKnownTargetManagementRow");
    expect(source).toContain("options.knownTargets.targets.map");
    expect(source).toContain('"Réactiver"');
    expect(source).toContain("known-target-delete");
    expect(source).toContain("🗑");
    expect(source).toContain("onKnownTargetDelete(target.id)");
    expect(source).toContain("isActive: true");
    expect(source).toContain("Nom affiché / alias");
    expect(source).not.toContain('createKnownTargetFormLabel("Alias nom"');
    expect(source).toContain("onKnownTargetSelect(target)");
    expect(source).toContain("onKnownTargetCreate(input)");
    expect(source).toContain("onKnownTargetUpdate(editingTargetId, input)");
    expect(source).toContain("onKnownTargetDeactivate(target.id)");
    expect(source).toContain(".filter((target) => target.isActive)");
    expect(source).toContain('options.onFieldManualValueChange("target", freeInput.value)');
    expect(source).toContain("splitKnownTargetAliases(aliasesInput.value)");
    expect(source).toContain(".split(/[,;\\r\\n]+/)");
    expect(source).toContain('freeButton.textContent = "Saisie libre"');
    expect(source).not.toContain('"[x] "');
  });
});

function createSuggestion(
  responseJson: unknown,
  suggestionOverrides: Partial<RendererAiClassificationSuggestion> = {}
): RendererAiDocumentSuggestion {
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
      source: "ollama",
      ...suggestionOverrides
    },
    promptCharacterCount: 2500,
    message: "ready"
  };
}

async function readAiFieldRowsSource(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "renderer", "aiFieldRows.ts"), "utf8");
}
