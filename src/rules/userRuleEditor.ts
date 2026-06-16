type UserRuleEditorCategory = "documentType" | "subject" | "keyword";

interface UserRuleEditorDraft {
  category: UserRuleEditorCategory;
  id: string;
  label: string;
  allOf: string;
  anyOf: string;
  noneOf: string;
  documentType: string;
  subject: string;
  keywords: string;
  confidence: string;
  enabled: boolean;
}

type UserRuleEditorBuildResult =
  | {
      ok: true;
      value: {
        category: UserRuleEditorCategory;
        rule: NamingSuggestionRule | KeywordAliasRule;
      };
    }
  | {
      ok: false;
      errors: string[];
    };

interface UserRuleEditorApi {
  createEmptyUserRuleDraft: () => UserRuleEditorDraft;
  buildUserRuleFromDraft: (draft: UserRuleEditorDraft) => UserRuleEditorBuildResult;
  namingRuleToDraft: (
    category: "documentType" | "subject",
    rule: NamingSuggestionRule
  ) => UserRuleEditorDraft;
  keywordRuleToDraft: (rule: KeywordAliasRule) => UserRuleEditorDraft;
}

interface Window {
  DocSorterUserRuleEditor: UserRuleEditorApi;
}

var DocSorterUserRuleEditor: UserRuleEditorApi;

(() => {
  const maxFieldLength = 240;
  const maxTerms = 12;

  function createEmptyUserRuleDraft(): UserRuleEditorDraft {
    return {
      category: "documentType",
      id: "",
      label: "",
      allOf: "",
      anyOf: "",
      noneOf: "",
      documentType: "",
      subject: "",
      keywords: "",
      confidence: "70",
      enabled: true
    };
  }

  function buildUserRuleFromDraft(draft: UserRuleEditorDraft): UserRuleEditorBuildResult {
    const errors: string[] = [];
    const id = normalizeUserRuleId(draft.id);
    const label = trimField(draft.label);
    const allOf = parseListField(draft.allOf, "Tous les mots requis", errors);
    const anyOf = parseListField(draft.anyOf, "Au moins un mot", errors);
    const noneOf = parseListField(draft.noneOf, "Mots interdits", errors);
    const keywords = parseListField(draft.keywords, "Mots-clés", errors);
    const confidence = parseConfidence(draft.confidence, errors);
    const documentType = trimField(draft.documentType);
    const subject = trimField(draft.subject);

    if (!id) {
      errors.push("Identifiant obligatoire.");
    }

    if (!label) {
      errors.push("Libellé obligatoire.");
    }

    if (allOf.length === 0 && anyOf.length === 0) {
      errors.push("Ajouter au moins une condition allOf ou anyOf.");
    }

    validateFieldLength("Identifiant", id, errors);
    validateFieldLength("Libellé", label, errors);
    validateFieldLength("Type de document", documentType, errors);
    validateFieldLength("Sujet", subject, errors);

    if (draft.category === "documentType" && !documentType) {
      errors.push("Sortie type obligatoire pour une règle de type.");
    }

    if (draft.category === "subject" && !subject) {
      errors.push("Sortie sujet obligatoire pour une règle sujet.");
    }

    if (draft.category === "keyword" && keywords.length === 0) {
      errors.push("Au moins un mot-clé de sortie est obligatoire pour une règle mot-clé.");
    }

    if (errors.length > 0 || confidence === null) {
      return {
        ok: false,
        errors
      };
    }

    const match = createMatch(allOf, anyOf, noneOf);
    if (draft.category === "keyword") {
      return {
        ok: true,
        value: {
          category: "keyword",
          rule: {
            id,
            label,
            value: keywords[0],
            aliases: [],
            match,
            confidence,
            enabled: draft.enabled
          }
        }
      };
    }

    return {
      ok: true,
      value: {
        category: draft.category,
        rule: {
          id,
          label,
          match,
          output: {
            ...(draft.category === "documentType" ? { documentType } : { subject }),
            ...(keywords.length > 0 ? { keywords } : {})
          },
          confidence,
          enabled: draft.enabled
        }
      }
    };
  }

  function namingRuleToDraft(
    category: "documentType" | "subject",
    rule: NamingSuggestionRule
  ): UserRuleEditorDraft {
    return {
      category,
      id: rule.id,
      label: rule.label,
      allOf: formatList(rule.match.allOf),
      anyOf: formatList(rule.match.anyOf),
      noneOf: formatList(rule.match.noneOf),
      documentType: rule.output.documentType ?? "",
      subject: rule.output.subject ?? "",
      keywords: formatList(rule.output.keywords),
      confidence: String(rule.confidence),
      enabled: rule.enabled !== false
    };
  }

  function keywordRuleToDraft(rule: KeywordAliasRule): UserRuleEditorDraft {
    return {
      category: "keyword",
      id: rule.id ?? "",
      label: rule.label ?? "",
      allOf: formatList(rule.match?.allOf),
      anyOf: formatList(rule.match?.anyOf ?? rule.aliases),
      noneOf: formatList(rule.match?.noneOf),
      documentType: "",
      subject: "",
      keywords: rule.value,
      confidence: String(rule.confidence ?? 60),
      enabled: rule.enabled !== false
    };
  }

  function createMatch(
    allOf: string[],
    anyOf: string[],
    noneOf: string[]
  ): SuggestionRuleMatch {
    return {
      ...(allOf.length > 0 ? { allOf } : {}),
      ...(anyOf.length > 0 ? { anyOf } : {}),
      ...(noneOf.length > 0 ? { noneOf } : {})
    };
  }

  function parseListField(value: string, label: string, errors: string[]): string[] {
    if (value.length > maxFieldLength) {
      errors.push(`${label} : contenu trop long.`);
    }

    const terms = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (terms.length > maxTerms) {
      errors.push(`${label} : limiter à ${maxTerms} termes.`);
    }

    terms.forEach((term) => validateFieldLength(label, term, errors));
    return Array.from(new Set(terms)).slice(0, maxTerms);
  }

  function parseConfidence(value: string, errors: string[]): number | null {
    const confidence = Number(value);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      errors.push("Confiance entre 0 et 100 obligatoire.");
      return null;
    }

    return Math.round(confidence);
  }

  function normalizeUserRuleId(value: string): string {
    const trimmed = trimField(value);
    if (!trimmed) {
      return "";
    }

    return trimmed.startsWith("user:") ? trimmed : `user:${trimmed}`;
  }

  function trimField(value: string): string {
    return value.trim().replace(/\s+/g, " ");
  }

  function validateFieldLength(label: string, value: string, errors: string[]): void {
    if (value.length > maxFieldLength) {
      errors.push(`${label} : contenu trop long.`);
    }
  }

  function formatList(value: string[] | undefined): string {
    return (value ?? []).join(", ");
  }

  DocSorterUserRuleEditor = {
    createEmptyUserRuleDraft,
    buildUserRuleFromDraft,
    namingRuleToDraft,
    keywordRuleToDraft
  };

  globalThis.DocSorterUserRuleEditor = DocSorterUserRuleEditor;
})();
