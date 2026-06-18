import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("renderer right panel layout", () => {
  it("keeps text extraction before IA and naming controls", async () => {
    const html = await readRendererHtml();

    expect(indexOf(html, 'id="text-extraction-panel"')).toBeLessThan(
      indexOf(html, 'id="ai-suggestion-panel"')
    );
    expect(indexOf(html, 'id="ai-suggestion-panel"')).toBeLessThan(
      indexOf(html, 'id="naming-panel"')
    );
    expect(html).toContain("<h3>Texte extrait</h3>");
    expect(html).toContain("<h3>IA locale</h3>");
    expect(html).toContain("Analyser avec IA locale");
  });

  it("removes deterministic suggestion panels and scripts from the UI", async () => {
    const html = await readRendererHtml();

    expect(html).not.toContain('id="suggestion-v2-panel"');
    expect(html).not.toContain("Proposition de tri");
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

  it("keeps IA actions visible and advanced IA settings collapsed", async () => {
    const html = await readRendererHtml();

    expect(html).toContain('id="ai-suggestion-panel"');
    expect(html).toContain('id="run-ai-suggestion"');
    expect(html).toContain('id="apply-ai-suggestion-empty"');
    expect(html).toContain('id="export-ai-diagnostic"');
    expect(html).toContain('id="ignore-ai-suggestion"');
    expect(html).toContain('<details id="ai-panel"');
    expect(html).toContain("Réglages IA avancés");
    expect(html).not.toMatch(/<details id="ai-panel"[^>]*\sopen[\s>]/);

    const advancedAiPanel = extractElementBlock(html, '<details id="ai-panel"', "</details>");
    expect(advancedAiPanel).not.toContain('id="run-ai-suggestion"');
    expect(advancedAiPanel).toContain("Tester Ollama");
    expect(advancedAiPanel).toContain("Libérer le modèle IA");
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
