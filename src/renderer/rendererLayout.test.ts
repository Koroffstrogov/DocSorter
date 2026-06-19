import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("renderer right panel layout", () => {
  it("shows the IA sorting workflow in the requested right-panel order", async () => {
    const html = await readRendererHtml();

    expect(indexOf(html, 'id="ai-control-panel"')).toBeLessThan(
      indexOf(html, 'id="sort-proposal-panel"')
    );
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

    expect(html).toContain("<h3>Assistant IA</h3>");
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

    expect(html).toContain('class="simple-mode-toolbar"');
    expect(html).toContain('id="simple-mode-button"');
    expect(html).toContain('aria-pressed="true">Simple</button>');
    expect(html).toContain('id="advanced-mode-button"');
    expect(html).toContain('aria-pressed="false">Avancé / diagnostic</button>');
    expect(html).toContain('id="ai-control-panel"');
    expect(html).toContain('id="ai-text-status"');
    expect(html).toContain("Sélectionnez un document à trier.");
    expect(html).toContain('id="sort-proposal-panel"');
    expect(html).toContain("Nom final");
    expect(html).toContain("Dossier final");
    expect(html).toContain('id="simple-classification-action"');
    expect(html).toContain("Vérifier et classer");
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

    const aiControlPanel = extractElementBlock(html, '<section id="ai-control-panel"', "</section>");
    expect(aiControlPanel).toContain('class="detail-section ai-control-panel ds-card"');
    expect(aiControlPanel).toContain('class="section-heading assistant-header ds-section-header"');
    expect(aiControlPanel).toContain('id="ai-quick-profile"');
    expect(aiControlPanel).toContain('id="ai-status"');
    expect(aiControlPanel).toContain('class="ai-status ai-simple-status"');
    expect(aiControlPanel).toContain('id="preload-ai-model"');
    expect(aiControlPanel).toContain('id="run-ai-suggestion"');
    expect(aiControlPanel).toContain('class="ds-button ds-button-secondary"');
    expect(aiControlPanel).toContain('class="ds-button ds-button-primary"');
    expect(aiControlPanel.match(/<button /g)?.length).toBe(2);
    expect(aiControlPanel).not.toContain("URL Ollama");
    expect(aiControlPanel).not.toContain("Timeout");
    expect(aiControlPanel).not.toContain("Keep alive");
    expect(aiControlPanel).not.toContain("Config");
    expect(aiControlPanel).not.toContain("Tester Ollama");

    const sortProposalPanel = extractElementBlock(html, '<section id="sort-proposal-panel"', "</section>");
    expect(sortProposalPanel).toContain('class="sort-proposal-card ds-card"');
    expect(sortProposalPanel).toContain('id="proposed-filename"');
    expect(sortProposalPanel).toContain("Nom final non généré");
    expect(sortProposalPanel).toContain('id="destination-final-path"');
    expect(sortProposalPanel).toContain("Aucun dossier final");
    expect(sortProposalPanel).toContain('id="destination-folder-badge"');
    expect(sortProposalPanel).toContain('id="proposal-state"');
    expect(sortProposalPanel).toContain("Analyse IA requise pour générer une proposition.");
    expect(sortProposalPanel).toContain(
      'id="ai-quality-badges" class="quality-badges" aria-label="Qualité de la proposition"></div>'
    );
    expect(sortProposalPanel).not.toContain("Mode :");
    expect(sortProposalPanel).not.toContain("quality-badge neutral");
    expect(sortProposalPanel).not.toMatch(/[A-Z]:\\/);
    expect(sortProposalPanel).not.toContain('id="run-ai-suggestion"');
    expect(sortProposalPanel).toContain('id="simple-classification-action"');
    expect(sortProposalPanel).toContain('id="execute-classification"');
    expect(sortProposalPanel).toContain('id="prepare-classification"');

    const advancedPanel = extractElementBlock(html, '<details id="advanced-panel"', "</details>");
    expect(advancedPanel).not.toContain('id="run-ai-suggestion"');
    expect(advancedPanel).toContain('id="ocr-panel"');
    expect(advancedPanel).toContain('id="ai-panel"');
    expect(advancedPanel).toContain('id="ai-technical-status"');
    expect(advancedPanel).toContain('id="ai-profile"');
    expect(advancedPanel).toContain('value="gemma3-4b"');
    expect(advancedPanel).toContain('value="gemma4-12b-nothink"');
    expect(advancedPanel).toContain('value="gemma4-12b-thinking"');
    expect(advancedPanel).toContain("Tester Ollama");
    expect(advancedPanel).toContain("Libérer le modèle IA");
  });

  it("keeps UX-1A critical right-panel IDs and design-system CSS available", async () => {
    const html = await readRendererHtml();
    const css = await readFile(path.join(process.cwd(), "src", "renderer", "styles.css"), "utf8");

    for (const id of [
      "ai-status",
      "ai-quick-profile",
      "preload-ai-model",
      "run-ai-suggestion",
      "proposed-filename",
      "proposal-state",
      "destination-final-path",
      "destination-folder-badge",
      "simple-classification-action",
      "execute-classification",
      "prepare-classification",
      "target-folder-input",
      "diagnostic-panel",
      "advanced-panel"
    ]) {
      expect(html).toContain(`id="${id}"`);
    }

    expect(html).toContain('aria-pressed="true">Simple</button>');
    expect(html).toContain("<summary>Diagnostic</summary>");
    expect(html).toContain("<summary>Réglages avancés</summary>");
    expect(html).toContain("Valider et classer (Ctrl+Entrée)");
    expect(html).not.toMatch(/<details id="diagnostic-panel"[^>]*\sopen[\s>]/);
    expect(html).not.toMatch(/<details id="advanced-panel"[^>]*\sopen[\s>]/);

    for (const token of [
      "--space-xs",
      "--space-sm",
      "--space-md",
      "--space-lg",
      "--radius-sm",
      "--radius-md",
      "--surface-panel",
      "--surface-card",
      "--surface-muted",
      "--border-subtle",
      "--border-strong",
      "--text-main",
      "--text-muted",
      "--button-primary-bg",
      "--button-secondary-bg",
      "--badge-success-bg",
      "--badge-warning-bg",
      "--badge-fallback-bg",
      "--candidate-pill-bg",
      "--candidate-pill-selected-bg",
      "--section-header-height"
    ]) {
      expect(css).toContain(token);
    }

    for (const className of [
      ".ds-card",
      ".ds-button",
      ".ds-button-primary",
      ".ds-button-secondary",
      ".ds-badge",
      ".ds-badge-success",
      ".ds-badge-warning",
      ".ds-badge-fallback",
      ".ds-pill",
      ".ds-pill-selected",
      ".ds-section-header",
      ".ds-compact-row"
    ]) {
      expect(css).toContain(className);
    }

    expect(css).toContain(".simple-mode-toolbar,");
    expect(css).toContain(".sort-proposal-card,");
    expect(css).toContain(".proposal-final-name");
    expect(css).toContain(".folder-status-badge");
    expect(css).toContain("border: 1px solid var(--border-subtle)");
    expect(css).toContain("background: var(--surface-card)");
    expect(css).toContain("background: var(--candidate-pill-selected-bg)");
  });

  it("loads ai panel field helpers before the ai panel script", async () => {
    const html = await readRendererHtml();

    expect(indexOf(html, "aiPanelFormatters.js")).toBeLessThan(indexOf(html, "aiPanel.js"));
    expect(indexOf(html, "aiPanelFormatters.js")).toBeLessThan(indexOf(html, "aiStatusContent.js"));
    expect(indexOf(html, "aiStatusContent.js")).toBeLessThan(indexOf(html, "aiFieldRows.js"));
    expect(indexOf(html, "aiFieldRows.js")).toBeLessThan(indexOf(html, "aiFolderCandidates.js"));
    expect(indexOf(html, "aiFolderCandidates.js")).toBeLessThan(indexOf(html, "aiPanel.js"));
  });

  it("renders the six IA refinement fields and folder candidate area", async () => {
    const html = await readRendererHtml();
    const aiPanel = await readFile(path.join(process.cwd(), "src", "renderer", "aiPanel.ts"), "utf8");
    const aiFieldRows = await readFile(path.join(process.cwd(), "src", "renderer", "aiFieldRows.ts"), "utf8");
    const aiFolderCandidates = await readFile(
      path.join(process.cwd(), "src", "renderer", "aiFolderCandidates.ts"),
      "utf8"
    );
    const aiPanelFormatters = await readFile(
      path.join(process.cwd(), "src", "renderer", "aiPanelFormatters.ts"),
      "utf8"
    );

    expect(html).toContain('id="ai-suggestion-details"');
    expect(html).toContain('id="ai-folder-candidates"');
    expect(html).toContain('id="target-folder-input"');
    expect(html).toContain('id="apply-ai-suggestion-empty"');
    expect(aiPanel).toContain("aiFieldRows.createSuggestionContent");
    expect(aiFieldRows).toContain('createAiFieldRow("Date"');
    expect(aiFieldRows).toContain('createAiFieldRow("Sujet"');
    expect(aiFieldRows).toContain('createAiFieldRow("Cible"');
    expect(aiFieldRows).toContain('createAiFieldRow("Type"');
    expect(aiFieldRows).toContain('createAiFieldRow("Émetteur"');
    expect(aiFieldRows).toContain('createAiFieldRow("Détail"');
    expect(aiFieldRows).toContain('className = "ai-field-edit"');
    expect(aiFieldRows).toContain('textContent = "✎"');
    expect(aiFieldRows).toContain("aria-label");
    expect(aiFieldRows).toContain("Analyse IA requise pour afficher les choix par champ.");
    expect(aiPanel).toContain("aiFolderCandidates.createFolderCandidateContent");
    expect(aiFolderCandidates).toContain("Analyse IA requise pour proposer un dossier.");
    expect(aiFolderCandidates).toContain("return [container];");
    expect(aiFieldRows).toContain("createCandidateButton");
    expect(aiFieldRows).toContain("fieldCandidates.slice(0, 3)");
    expect(aiFolderCandidates).toContain("folderCandidates = aiFieldRows.getFolderCandidates(suggestion).slice(0, 3)");
    expect(aiFolderCandidates).toContain("onFolderCandidateSelect");
    expect(aiFolderCandidates).toContain("folder-candidate-badge");
    expect(aiFieldRows).toContain("requiresCreation");
    expect(aiPanelFormatters).toContain("return \"à créer\"");
    expect(aiPanelFormatters).toContain("return \"existe\"");
    expect(aiPanelFormatters).toContain("return \"fallback\"");
  });

  it("keeps technical Ollama details out of the simple IA status", async () => {
    const aiPanel = await readFile(path.join(process.cwd(), "src", "renderer", "aiPanel.ts"), "utf8");
    const aiStatusContent = await readFile(
      path.join(process.cwd(), "src", "renderer", "aiStatusContent.ts"),
      "utf8"
    );
    const aiPanelFormatters = await readFile(
      path.join(process.cwd(), "src", "renderer", "aiPanelFormatters.ts"),
      "utf8"
    );

    expect(aiPanel).toContain("aiStatusContent.createSimpleStatusContent");
    expect(aiPanel).toContain("aiStatusContent.createTechnicalStatusContent");

    const simpleStatus = extractFunctionBlock(aiStatusContent, "function createSimpleStatusContent");
    expect(simpleStatus).toContain("aiFormatters.simpleConnectionLabel");
    expect(simpleStatus).toContain("aiFormatters.simpleModelLabel");
    expect(simpleStatus).not.toContain("URL :");
    expect(simpleStatus).not.toContain("Timeout :");
    expect(simpleStatus).not.toContain("Keep alive :");
    expect(simpleStatus).not.toContain("Config :");
    expect(aiPanelFormatters).toContain("function simpleConnectionLabel");
    expect(aiPanelFormatters).toContain("function simpleModelLabel");

    const technicalStatus = extractFunctionBlock(aiStatusContent, "function createTechnicalStatusContent");
    expect(technicalStatus).toContain("URL :");
    expect(technicalStatus).toContain("Timeout :");
    expect(technicalStatus).toContain("Keep alive :");
    expect(technicalStatus).toContain("Config :");
  });

  it("uses compact field rows and a discrete edit control", async () => {
    const css = await readFile(path.join(process.cwd(), "src", "renderer", "styles.css"), "utf8");

    expect(css).toContain(".ai-field-row");
    expect(css).toContain("grid-template-columns: 68px minmax(0, 1fr) 30px");
    expect(css).toContain(".ai-field-edit");
    expect(css).toContain("width: 28px");
    expect(css).toContain(".ai-candidate-chip");
    expect(css).toContain("min-height: 22px !important");
    expect(css).toContain(".folder-candidate-badge");
  });

  it("keeps the simple right panel visible without an active document", async () => {
    const namingPanel = await readFile(path.join(process.cwd(), "src", "renderer", "namingPanel.ts"), "utf8");

    expect(namingPanel).toContain("elements.panel.hidden = false");
    expect(namingPanel).toContain("Nom final non généré");
    expect(namingPanel).toContain("Sélectionnez un document à trier.");
  });

  it("keeps the simple sort proposal relative and state-driven", async () => {
    const html = await readRendererHtml();
    const namingPanel = await readFile(path.join(process.cwd(), "src", "renderer", "namingPanel.ts"), "utf8");
    const aiFlow = await readFile(path.join(process.cwd(), "src", "renderer", "rendererAiFlow.ts"), "utf8");
    const sortProposalPanel = extractElementBlock(html, '<section id="sort-proposal-panel"', "</section>");
    const destinationFormatter = extractFunctionBlock(aiFlow, "function formatAiPreviewDestinationFolder");

    expect(sortProposalPanel).toContain('id="proposed-filename"');
    expect(sortProposalPanel).toContain('id="destination-final-path"');
    expect(sortProposalPanel).toContain('id="destination-folder-badge"');
    expect(sortProposalPanel).toContain('id="ai-quality-badges"');
    expect(sortProposalPanel).not.toMatch(/[A-Z]:\\/);
    expect(namingPanel).toContain("formatRelativeDestinationFolder");
    expect(namingPanel).toContain("folderBadgeFor");
    expect(namingPanel).toContain("proposalStateLabel");
    expect(namingPanel).toContain("Proposition prête.");
    expect(namingPanel).toContain("Proposition incomplète :");
    expect(namingPanel).toContain('label: "existe"');
    expect(namingPanel).toContain('label: "à créer"');
    expect(namingPanel).toContain('label: "fallback"');
    expect(destinationFormatter).toContain('replace(/\\\\/g, "/")');
    expect(destinationFormatter).toContain('return folder || "Aucun dossier final";');
    expect(destinationFormatter).not.toContain("targetRootPath.replace");
  });

  it("does not present a saved Ollama success as a live connection in the IA panel", async () => {
    const aiPanelFormatters = await readFile(
      path.join(process.cwd(), "src", "renderer", "aiPanelFormatters.ts"),
      "utf8"
    );

    expect(aiPanelFormatters).toContain('"not-tested"');
    expect(aiPanelFormatters).toContain("Dernier test Ollama OK");
    expect(aiPanelFormatters).toContain("Test Ollama requis");
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

  it("adds a simple-mode classification action that reuses prepare then execute", async () => {
    const renderer = await readFile(path.join(process.cwd(), "src", "renderer", "renderer.ts"), "utf8");
    const classificationFlow = await readFile(
      path.join(process.cwd(), "src", "renderer", "rendererClassificationFlow.ts"),
      "utf8"
    );
    const simpleAction = extractFunctionBlock(classificationFlow, "async function runSimpleClassificationAction");

    expect(renderer).toContain('querySelector<HTMLButtonElement>("#simple-classification-action")');
    expect(renderer).toContain("simpleClassificationButton.hidden = state.uiMode !== \"simple\"");
    expect(renderer).toContain("prepareClassificationButton.hidden = state.uiMode === \"simple\"");
    expect(renderer).toContain("executeClassificationButton.hidden = state.uiMode === \"simple\"");
    expect(simpleAction).toContain("await prepareClassificationSimulation();");
    expect(simpleAction).toContain("if (canExecuteClassification())");
    expect(simpleAction).toContain("await executeClassificationAction();");
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

function extractFunctionBlock(value: string, startNeedle: string): string {
  const start = indexOf(value, startNeedle);
  const nextFunction = [
    value.indexOf("\n  function ", start + startNeedle.length),
    value.indexOf("\nfunction ", start + startNeedle.length),
    value.indexOf("\nasync function ", start + startNeedle.length)
  ]
    .filter((index) => index > start)
    .sort((left, right) => left - right)[0];
  return value.slice(start, nextFunction ?? value.length);
}
