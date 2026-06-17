import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("renderer right panel layout", () => {
  it("shows text extraction before sorting proposal and advanced panels", async () => {
    const html = await readRendererHtml();

    expect(indexOf(html, 'id="text-extraction-panel"')).toBeLessThan(
      indexOf(html, 'id="suggestion-v2-panel"')
    );
    expect(indexOf(html, 'id="suggestion-v2-panel"')).toBeLessThan(
      indexOf(html, 'id="ocr-panel"')
    );
    expect(indexOf(html, 'id="suggestion-v2-panel"')).toBeLessThan(
      indexOf(html, 'class="detail-section history-panel"')
    );
    expect(html).toContain("<h3>Texte extrait</h3>");
    expect(html).toContain("<h3>Proposition de tri</h3>");
    expect(html).toContain("Analyser le document");
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

  it("keeps diagnostic, OCR, IA and history as collapsed or compact blocks", async () => {
    const html = await readRendererHtml();

    expect(html).toContain('id="suggestion-v2-diagnostic-panel"');
    expect(html).toContain("Le diagnostic ne classe rien. Il génère un fichier JSON pour comprendre les choix.");
    expect(html).toContain("Mode : expurgé");
    expect(html).toContain("Diagnostic suggestions");
    expect(html).toContain("Diagnostic IA");
    expect(html).toContain('<details id="ocr-panel"');
    expect(html).toContain("Réglages OCR avancés");
    expect(html).toContain('<details id="ai-panel"');
    expect(html).toContain("Réglages IA avancés");
    expect(html).toContain('<details class="detail-section history-panel"');
    expect(html).not.toMatch(/<details id="ocr-panel"[^>]*\sopen[\s>]/);
    expect(html).not.toMatch(/<details id="ai-panel"[^>]*\sopen[\s>]/);
    expect(html).not.toMatch(/<details id="suggestion-v2-diagnostic-panel"[^>]*\sopen[\s>]/);
    expect(indexOf(html, 'class="detail-section history-panel"')).toBeLessThan(
      indexOf(html, 'id="suggestion-v2-diagnostic-panel"')
    );
  });

  it("keeps real classification labels unchanged", async () => {
    const html = await readRendererHtml();

    expect(html).toContain("Vérifier avant classement (V)");
    expect(html).toContain("Valider et classer (Ctrl+Entrée)");
  });

  it("does not launch OCR or IA implicitly from v2 analysis", async () => {
    const flow = await readFile(path.join(process.cwd(), "src", "renderer", "rendererSuggestionV2Flow.ts"), "utf8");

    expect(flow).not.toContain("runOcrForActiveImage");
    expect(flow).not.toContain("runImageOcr");
    expect(flow).not.toContain("runAiSuggestionForActiveDocument");
    expect(flow).toContain("Extrais le texte PDF avant l'analyse du document.");
    expect(flow).toContain("Lance l'OCR image avant l'analyse du document.");
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
