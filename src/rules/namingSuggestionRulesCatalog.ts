(() => {
  function getDefaultNamingSuggestionRulesCatalog(): NamingSuggestionRulesCatalog {
    return cloneCatalog(globalThis.DocSorterDefaultNamingSuggestionRules);
  }

  function mergeNamingSuggestionRulesCatalogs(
    defaultCatalog: NamingSuggestionRulesCatalog,
    userCatalog: NamingSuggestionRulesCatalog
  ): NamingSuggestionRulesCatalog {
    const defaultValidation = validateNamingSuggestionRulesCatalog(defaultCatalog);
    const userValidation = validateNamingSuggestionRulesCatalog(userCatalog);
    const base = defaultValidation.catalog ?? createEmptyNamingSuggestionRulesCatalog();
    const user = userValidation.catalog ?? createEmptyNamingSuggestionRulesCatalog();

    return {
      version: 1,
      documentTypeRules: mergeRulesById(base.documentTypeRules, user.documentTypeRules),
      subjectRules: mergeRulesById(base.subjectRules, user.subjectRules),
      keywordRules: mergeKeywordRules(base.keywordRules, user.keywordRules),
      stopWords: mergeUniqueStrings(base.stopWords, user.stopWords)
    };
  }

  function validateNamingSuggestionRulesCatalog(
    catalog: unknown
  ): NamingSuggestionRulesCatalogValidation {
    const errors: string[] = [];

    if (!isRecord(catalog)) {
      return {
        isValid: false,
        errors: ["Le catalogue de règles doit être un objet."],
        catalog: null
      };
    }

    if (catalog.version !== 1) {
      errors.push("La version du catalogue doit être 1.");
    }

    const documentTypeRules = validateRuleList(catalog.documentTypeRules, "documentTypeRules", errors);
    const subjectRules = validateRuleList(catalog.subjectRules, "subjectRules", errors);
    const keywordRules = validateKeywordRuleList(catalog.keywordRules, errors);
    const stopWords = validateStringList(catalog.stopWords, "stopWords", errors);

    if (errors.length > 0) {
      return {
        isValid: false,
        errors,
        catalog: null
      };
    }

    return {
      isValid: true,
      errors: [],
      catalog: {
        version: 1,
        documentTypeRules,
        subjectRules,
        keywordRules,
        stopWords
      }
    };
  }

  function validateRuleList(
    value: unknown,
    label: string,
    errors: string[]
  ): NamingSuggestionRule[] {
    if (!Array.isArray(value)) {
      errors.push(`${label} doit être une liste.`);
      return [];
    }

    return value
      .map((rule, index) => validateRule(rule, `${label}[${index}]`, errors))
      .filter((rule): rule is NamingSuggestionRule => Boolean(rule));
  }

  function validateRule(
    value: unknown,
    label: string,
    errors: string[]
  ): NamingSuggestionRule | null {
    if (!isRecord(value)) {
      errors.push(`${label} doit être un objet.`);
      return null;
    }

    const id = validateRequiredString(value.id, `${label}.id`, errors);
    const ruleLabel = validateRequiredString(value.label, `${label}.label`, errors);
    const description = validateOptionalString(value.description, `${label}.description`, errors);
    const match = validateMatch(value.match, `${label}.match`, errors);
    const output = validateOutput(value.output, `${label}.output`, errors);
    const confidence = validateConfidence(value.confidence, `${label}.confidence`, errors);
    const source = validateRuleSource(value.source, `${label}.source`, errors);

    if (!id || !ruleLabel || !match || !output || confidence === null) {
      return null;
    }

    return {
      id,
      label: ruleLabel,
      ...(description ? { description } : {}),
      match,
      output,
      confidence,
      ...(source ? { source } : {})
    };
  }

  function validateMatch(
    value: unknown,
    label: string,
    errors: string[]
  ): SuggestionRuleMatch | null {
    if (!isRecord(value)) {
      errors.push(`${label} doit être un objet.`);
      return null;
    }

    const match: SuggestionRuleMatch = {};
    const allOf = validateOptionalStringList(value.allOf, `${label}.allOf`, errors);
    const anyOf = validateOptionalStringList(value.anyOf, `${label}.anyOf`, errors);
    const noneOf = validateOptionalStringList(value.noneOf, `${label}.noneOf`, errors);

    if (allOf) {
      match.allOf = allOf;
    }
    if (anyOf) {
      match.anyOf = anyOf;
    }
    if (noneOf) {
      match.noneOf = noneOf;
    }

    if (!match.allOf?.length && !match.anyOf?.length) {
      errors.push(`${label} doit définir allOf ou anyOf.`);
    }

    return match;
  }

  function validateOutput(
    value: unknown,
    label: string,
    errors: string[]
  ): SuggestionRuleOutput | null {
    if (!isRecord(value)) {
      errors.push(`${label} doit être un objet.`);
      return null;
    }

    const documentType = validateOptionalString(value.documentType, `${label}.documentType`, errors);
    const subject = validateOptionalString(value.subject, `${label}.subject`, errors);
    const keywords = validateOptionalStringList(value.keywords, `${label}.keywords`, errors);
    const output: SuggestionRuleOutput = {};

    if (documentType) {
      output.documentType = documentType;
    }
    if (subject) {
      output.subject = subject;
    }
    if (keywords?.length) {
      output.keywords = keywords;
    }

    if (!output.documentType && !output.subject && !output.keywords?.length) {
      errors.push(`${label} doit produire au moins un champ.`);
    }

    return output;
  }

  function validateKeywordRuleList(value: unknown, errors: string[]): KeywordAliasRule[] {
    if (!Array.isArray(value)) {
      errors.push("keywordRules doit être une liste.");
      return [];
    }

    return value
      .map((rule, index) => validateKeywordRule(rule, `keywordRules[${index}]`, errors))
      .filter((rule): rule is KeywordAliasRule => Boolean(rule));
  }

  function validateKeywordRule(
    value: unknown,
    label: string,
    errors: string[]
  ): KeywordAliasRule | null {
    if (!isRecord(value)) {
      errors.push(`${label} doit être un objet.`);
      return null;
    }

    const keywordValue = validateRequiredString(value.value, `${label}.value`, errors);
    const aliases = validateStringList(value.aliases, `${label}.aliases`, errors);
    const confidence =
      value.confidence === undefined
        ? undefined
        : validateConfidence(value.confidence, `${label}.confidence`, errors);
    const ruleLabel = validateOptionalString(value.label, `${label}.label`, errors);
    const description = validateOptionalString(value.description, `${label}.description`, errors);

    if (!keywordValue || aliases.length === 0 || confidence === null) {
      return null;
    }

    return {
      value: keywordValue,
      aliases,
      ...(confidence === undefined ? {} : { confidence }),
      ...(ruleLabel ? { label: ruleLabel } : {}),
      ...(description ? { description } : {})
    };
  }

  function validateStringList(value: unknown, label: string, errors: string[]): string[] {
    if (!Array.isArray(value)) {
      errors.push(`${label} doit être une liste.`);
      return [];
    }

    const strings: string[] = [];
    value.forEach((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        errors.push(`${label}[${index}] doit être une chaîne non vide.`);
        return;
      }

      strings.push(item.trim());
    });

    return strings;
  }

  function validateOptionalStringList(
    value: unknown,
    label: string,
    errors: string[]
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    return validateStringList(value, label, errors);
  }

  function validateRequiredString(value: unknown, label: string, errors: string[]): string | null {
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${label} doit être une chaîne non vide.`);
      return null;
    }

    return value.trim();
  }

  function validateOptionalString(
    value: unknown,
    label: string,
    errors: string[]
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      errors.push(`${label} doit être une chaîne.`);
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  function validateConfidence(value: unknown, label: string, errors: string[]): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${label} doit être un nombre.`);
      return null;
    }

    if (value < 0 || value > 100) {
      errors.push(`${label} doit être compris entre 0 et 100.`);
      return null;
    }

    return value;
  }

  function validateRuleSource(
    value: unknown,
    label: string,
    errors: string[]
  ): RuleSource | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === "filename" || value === "text" || value === "filename+text") {
      return value;
    }

    errors.push(`${label} doit valoir filename, text ou filename+text.`);
    return undefined;
  }

  function mergeRulesById(
    defaultRules: NamingSuggestionRule[],
    userRules: NamingSuggestionRule[]
  ): NamingSuggestionRule[] {
    const rulesById = new Map<string, NamingSuggestionRule>();

    [...defaultRules, ...userRules].forEach((rule) => {
      rulesById.set(rule.id, cloneRule(rule));
    });

    return Array.from(rulesById.values());
  }

  function mergeKeywordRules(
    defaultRules: KeywordAliasRule[],
    userRules: KeywordAliasRule[]
  ): KeywordAliasRule[] {
    const rulesByValue = new Map<string, KeywordAliasRule>();

    [...defaultRules, ...userRules].forEach((rule) => {
      rulesByValue.set(rule.value.toLowerCase(), cloneKeywordRule(rule));
    });

    return Array.from(rulesByValue.values());
  }

  function mergeUniqueStrings(left: string[], right: string[]): string[] {
    return Array.from(new Set([...left, ...right]));
  }

  function cloneCatalog(catalog: NamingSuggestionRulesCatalog): NamingSuggestionRulesCatalog {
    return {
      version: 1,
      documentTypeRules: catalog.documentTypeRules.map(cloneRule),
      subjectRules: catalog.subjectRules.map(cloneRule),
      keywordRules: catalog.keywordRules.map(cloneKeywordRule),
      stopWords: [...catalog.stopWords]
    };
  }

  function cloneRule(rule: NamingSuggestionRule): NamingSuggestionRule {
    return {
      id: rule.id,
      label: rule.label,
      ...(rule.description ? { description: rule.description } : {}),
      match: {
        ...(rule.match.allOf ? { allOf: [...rule.match.allOf] } : {}),
        ...(rule.match.anyOf ? { anyOf: [...rule.match.anyOf] } : {}),
        ...(rule.match.noneOf ? { noneOf: [...rule.match.noneOf] } : {})
      },
      output: {
        ...(rule.output.documentType ? { documentType: rule.output.documentType } : {}),
        ...(rule.output.subject ? { subject: rule.output.subject } : {}),
        ...(rule.output.keywords ? { keywords: [...rule.output.keywords] } : {})
      },
      confidence: rule.confidence,
      ...(rule.source ? { source: rule.source } : {})
    };
  }

  function cloneKeywordRule(rule: KeywordAliasRule): KeywordAliasRule {
    return {
      value: rule.value,
      aliases: [...rule.aliases],
      ...(rule.confidence === undefined ? {} : { confidence: rule.confidence }),
      ...(rule.label ? { label: rule.label } : {}),
      ...(rule.description ? { description: rule.description } : {})
    };
  }

  function createEmptyNamingSuggestionRulesCatalog(): NamingSuggestionRulesCatalog {
    return {
      version: 1,
      documentTypeRules: [],
      subjectRules: [],
      keywordRules: [],
      stopWords: []
    };
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  globalThis.DocSorterNamingSuggestionRulesCatalog = {
    getDefaultNamingSuggestionRulesCatalog,
    mergeNamingSuggestionRulesCatalogs,
    validateNamingSuggestionRulesCatalog
  };
})();
