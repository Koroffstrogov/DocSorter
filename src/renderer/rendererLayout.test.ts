import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("renderer right panel layout", () => {
  it("shows the IA sorting workflow in the requested right-panel order", async () => {
    const html = await readRendererHtml();

    expect(indexOf(html, 'id="sort-proposal-panel"')).toBeLessThan(
      indexOf(html, 'id="field-refinement-panel"')
    );
    expect(indexOf(html, 'id="field-refinement-panel"')).toBeLessThan(
      indexOf(html, 'id="target-folder-panel"')
    );
    expect(indexOf(html, 'id="target-folder-panel"')).toBeLessThan(
      indexOf(html, 'id="diagnostic-panel"')
    );
    expect(indexOf(html, 'id="diagnostic-panel"')).toBeLessThan(
      indexOf(html, 'id="advanced-panel"')
    );

    expect(html).toContain("<h3>Proposition de tri</h3>");
    expect(html).toContain("<h3>Affiner les champs</h3>");
    expect(html).toContain("<h3>Dossier cible</h3>");
    expect(html).toContain("<summary>Diagnostic</summary>");
    expect(html).toContain("<summary>Réglages avancés</summary>");
  });

  it("removes deterministic suggestion panels and scripts from the UI", async () => {
    const html = await readRendererHtml();

    expect(html).not.toContain('id="suggestion-v2-panel"');
    expect(html).not.toContain("Analyser le document");
    expect(html).not.toContain('id="apply-suggestion-v2-empty"');
    expect(html).not.toContain('id="suggestion-v2-diagnostic-panel"');
    expect(html).not.toContain("Diagnostic suggestions");
    expect(html).not.toContain('id="rules-panel"');
    expect(html).not.toContain("Règles de suggestion");
    expect(html).not.toContain('id="reference-data-dialog"');
    expect(html).not.toContain('id="open-reference-data"');
    expect(html).not.toContain("rendererSuggestionV2Flow.js");
    expect(html).not.toContain("rendererRulesFlow.js");
    expect(html).not.toContain("rendererReferenceDataFlow.js");
    expect(html).not.toContain("suggestionV2Panel.js");
    expect(html).not.toContain("rulesPanel.js");
    expect(html).not.toContain("referenceDataPanel.js");
    expect(html).not.toContain("../rules/namingSuggestions.js");
  });

  it("keeps the quick IA actions visible and advanced IA/OCR settings collapsed", async () => {
    const html = await readRendererHtml();

    expect(html).toContain('id="sort-proposal-panel"');
    expect(html).toContain("Nom final");
    expect(html).toContain("Dossier final");
    expect(html).toContain("Mode : <strong>IA locale seule</strong>");
    expect(html).toContain('id="ai-quality-badges"');
    expect(html).toContain('id="run-ai-suggestion"');
    expect(html).toContain('id="ai-quick-profile"');
    expect(html).toContain('id="preload-ai-model"');
    expect(html).toContain("Charger le modèle IA");
    expect(html).toContain('id="apply-ai-suggestion-empty"');
    expect(html).toContain('id="export-ai-diagnostic"');
    expect(html).toContain('id="ignore-ai-suggestion"');
    expect(html).toContain('<details id="advanced-panel"');
    expect(html).toContain('<details id="diagnostic-panel"');
    expect(html).not.toMatch(/<details id="diagnostic-panel"[^>]*\sopen[\s>]/);
    expect(html).not.toMatch(/<details id="advanced-panel"[^>]*\sopen[\s>]/);

    const sortProposalPanel = extractElementBlock(html, '<section id="sort-proposal-panel"', "</section>");
    expect(sortProposalPanel).toContain('id="run-ai-suggestion"');

    const advancedPanel = extractElementBlock(html, '<details id="advanced-panel"', "</details>");
    expect(advancedPanel).not.toContain('id="run-ai-suggestion"');
    expect(advancedPanel).toContain('id="ocr-panel"');
    expect(advancedPanel).toContain('id="ai-panel"');
    expect(advancedPanel).toContain('id="ai-profile"');
    expect(advancedPanel).toContain('value="gemma3-4b"');
    expect(advancedPanel).toContain('value="gemma4-12b-nothink"');
    expect(advancedPanel).toContain('value="gemma4-12b-thinking"');
    expect(advancedPanel).toContain("Tester Ollama");
    expect(advancedPanel).toContain("Libérer le modèle IA");
  });

  it("renders the six IA refinement fields and folder candidate area", async () => {
    const html = await readRendererHtml();
    const aiPanel = await readFile(path.join(process.cwd(), "src", "renderer", "aiPanel.ts"), "utf8");

    expect(html).toContain('id="ai-suggestion-details"');
    expect(html).toContain('id="ai-folder-candidates"');
    expect(html).toContain('id="target-folder-input"');
    expect(aiPanel).toContain('createAiFieldRow("Date"');
    expect(aiPanel).toContain('createAiFieldRow("Sujet"');
    expect(aiPanel).toContain('createAiFieldRow("Cible"');
    expect(aiPanel).toContain('createAiFieldRow("Type"');
    expect(aiPanel).toContain('createAiFieldRow("Émetteur"');
    expect(aiPanel).toContain('createAiFieldRow("Détail"');
    expect(aiPanel).toContain('textContent = "Modifier"');
    expect(aiPanel).toContain("createCandidateButton");
    expect(aiPanel).toContain("fieldCandidates.slice(0, 3)");
    expect(aiPanel).toContain("folderCandidates = getFolderCandidates(suggestion).slice(0, 3)");
    expect(aiPanel).toContain("onFolderCandidateSelect");
    expect(aiPanel).toContain("requiresCreation");
  });

  it("does not present a saved Ollama success as a live connection in the IA panel", async () => {
    const aiPanel = await readFile(path.join(process.cwd(), "src", "renderer", "aiPanel.ts"), "utf8");

    expect(aiPanel).toContain('"not-tested"');
    expect(aiPanel).toContain("Dernier test Ollama OK");
    expect(aiPanel).toContain("Test Ollama requis");
  });

  it("keeps document metadata folded in the right panel header", async () => {
    const html = await readRendererHtml();

    expect(indexOf(html, 'class="document-header-details"')).toBeLessThan(
      indexOf(html, 'class="detail-scroll"')
    );
    expect(indexOf(html, 'id="document-details"')).toBeLessThan(
      indexOf(html, 'class="detail-scroll"')
    );
    expect(html).not.toMatch(/<details class="document-header-details"[^>]*\sopen[\s>]/);
  });

  it("keeps real classification labels unchanged", async () => {
    const html = await readRendererHtml();

    expect(html).toContain("Vérifier avant classement (V)");
    expect(html).toContain("Valider et classer (Ctrl+Entrée)");
  });

  it("limits visible history items in the right panel renderer", async () => {
    const renderer = await readFile(path.join(process.cwd(), "src", "renderer", "renderer.ts"), "utf8");

    expect(renderer).toContain("maxEntries: 3");
  });
});

async function readRendererHtml(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "renderer", "index.html"), "utf8");
}

function indexOf(value: string, needle: string): number {
  const index = value.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

function extractElementBlock(value: string, startNeedle: string, endNeedle: string): string {
  const start = indexOf(value, startNeedle);
  const end = value.indexOf(endNeedle, start);
  expect(end).toBeGreaterThan(start);
  return value.slice(start, end);
}
