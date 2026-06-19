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
    expect(source).toContain("fieldCandidates.slice(0, 3)");
    expect(source).toContain('editButton.textContent = "✎"');
    expect(source).toContain('editButton.setAttribute("aria-label"');
    expect(source).toContain('badge.textContent = isManual ? "manuel" : "IA"');
    expect(source).toContain('key === "issuer" || key === "detail"');
    expect(source).toContain("createEmptyCandidateButton");
  });
});

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

async function readAiFieldRowsSource(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "renderer", "aiFieldRows.ts"), "utf8");
}
