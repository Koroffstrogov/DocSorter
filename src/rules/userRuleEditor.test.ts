import "./userRuleEditor";

import { describe, expect, it } from "vitest";

const editor = globalThis.DocSorterUserRuleEditor;

describe("user rule editor", () => {
  it("builds a document type rule from a valid draft", () => {
    const result = editor.buildUserRuleFromDraft({
      ...editor.createEmptyUserRuleDraft(),
      id: "garage-maintenance",
      label: "Facture entretien garage",
      allOf: "facture",
      anyOf: "garage, vidange",
      documentType: "facture-entretien",
      keywords: "entretien",
      confidence: "82"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe("documentType");
      expect((result.value.rule as NamingSuggestionRule).id).toBe("user:garage-maintenance");
      expect((result.value.rule as NamingSuggestionRule).output.documentType).toBe(
        "facture-entretien"
      );
    }
  });

  it("builds a disabled keyword rule", () => {
    const result = editor.buildUserRuleFromDraft({
      ...editor.createEmptyUserRuleDraft(),
      category: "keyword",
      id: "entretien",
      label: "Mot-cle entretien",
      anyOf: "vidange, revision",
      keywords: "entretien",
      confidence: "70",
      enabled: false
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe("keyword");
      expect((result.value.rule as KeywordAliasRule).enabled).toBe(false);
      expect((result.value.rule as KeywordAliasRule).match?.anyOf).toEqual(["vidange", "revision"]);
    }
  });

  it("rejects missing conditions and output", () => {
    const result = editor.buildUserRuleFromDraft({
      ...editor.createEmptyUserRuleDraft(),
      id: "invalid",
      label: "Invalid",
      confidence: "50"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Ajouter au moins une condition allOf ou anyOf.");
      expect(result.errors).toContain("Sortie type obligatoire pour une règle de type.");
    }
  });

  it("rejects huge pasted content", () => {
    const result = editor.buildUserRuleFromDraft({
      ...editor.createEmptyUserRuleDraft(),
      id: "too-long",
      label: "Long",
      allOf: "facture",
      documentType: "facture",
      anyOf: "x".repeat(241),
      confidence: "70"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("contenu trop long"))).toBe(true);
    }
  });
});
