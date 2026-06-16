type NamingSuggestionSource = RuleSource;

interface SuggestedNamingField {
  value: string;
  confidence: number;
  reason: string;
  source: NamingSuggestionSource;
}

interface NamingSuggestions {
  date: SuggestedNamingField | null;
  subject: SuggestedNamingField | null;
  documentType: SuggestedNamingField | null;
  keywords: SuggestedNamingField[];
  confidence: number;
  reasons: string[];
}

interface NamingSuggestionsInput {
  filename: string;
  extractedText: string;
  rulesCatalog?: NamingSuggestionRulesCatalog;
}

interface NamingSuggestionDraft {
  documentDate: string;
  subject: string;
  documentType: string;
  keywords: string;
}

interface ApplyNamingSuggestionsResult {
  draft: NamingSuggestionDraft;
  appliedFields: string[];
  skippedFields: string[];
}

interface NamingSuggestionsApi {
  buildNamingSuggestions: (input: NamingSuggestionsInput) => NamingSuggestions;
  applySuggestionsToEmptyFields: (
    draft: NamingSuggestionDraft,
    suggestions: NamingSuggestions
  ) => ApplyNamingSuggestionsResult;
  normalizeSuggestionToken: (value: string) => string;
}

interface Window {
  DocSorterNamingSuggestions: NamingSuggestionsApi;
}

var DocSorterNamingSuggestions: NamingSuggestionsApi;

(() => {
  type SearchSource = "text" | "filename";

  interface NormalizedInput {
    filename: string;
    extractedText: string;
    filenameSearch: string;
    textSearch: string;
    combinedSearch: string;
  }

  interface DateCandidate {
    value: string;
    source: SearchSource;
    index: number;
  }

  interface MatchedSuggestionRule {
    rule: NamingSuggestionRule;
    source: NamingSuggestionSource;
    confidence: number;
  }

  const combiningMarks = /[\u0300-\u036f]/g;
  const forbiddenFilenameChars = /[<>:"/\\|?*\u0000-\u001F]/g;
  const maxKeywords = 5;

  function buildNamingSuggestions(input: NamingSuggestionsInput): NamingSuggestions {
    const rulesCatalog = resolveRulesCatalog(input.rulesCatalog);
    const normalizedInput = createNormalizedInput(input);
    const documentTypeRuleMatches = findMatchingSuggestionRules(
      normalizedInput,
      rulesCatalog.documentTypeRules
    );
    const subjectRuleMatches = findMatchingSuggestionRules(normalizedInput, rulesCatalog.subjectRules);
    const date = detectDate(normalizedInput);
    const documentType = selectRuleOutputField(documentTypeRuleMatches, "documentType");
    const subject =
      selectRuleOutputField(subjectRuleMatches, "subject") ??
      detectFilenameFallbackSubject(normalizedInput.filename, rulesCatalog.stopWords);
    const keywords = detectKeywords(
      normalizedInput,
      rulesCatalog,
      documentTypeRuleMatches,
      subjectRuleMatches
    );
    const reasons = collectReasons(date, subject, documentType, keywords);

    return {
      date,
      subject,
      documentType,
      keywords,
      confidence: computeOverallConfidence(date, subject, documentType, keywords),
      reasons
    };
  }

  function applySuggestionsToEmptyFields(
    draft: NamingSuggestionDraft,
    suggestions: NamingSuggestions
  ): ApplyNamingSuggestionsResult {
    const nextDraft: NamingSuggestionDraft = { ...draft };
    const appliedFields: string[] = [];
    const skippedFields: string[] = [];

    applyField(nextDraft, "documentDate", suggestions.date?.value ?? "", appliedFields, skippedFields);
    applyField(nextDraft, "subject", suggestions.subject?.value ?? "", appliedFields, skippedFields);
    applyField(
      nextDraft,
      "documentType",
      suggestions.documentType?.value ?? "",
      appliedFields,
      skippedFields
    );
    applyField(
      nextDraft,
      "keywords",
      suggestions.keywords.map((keyword) => keyword.value).join(" "),
      appliedFields,
      skippedFields
    );

    return {
      draft: nextDraft,
      appliedFields,
      skippedFields
    };
  }

  function applyField(
    draft: NamingSuggestionDraft,
    field: keyof NamingSuggestionDraft,
    suggestedValue: string,
    appliedFields: string[],
    skippedFields: string[]
  ): void {
    if (!suggestedValue) {
      return;
    }

    if (draft[field].trim()) {
      skippedFields.push(field);
      return;
    }

    draft[field] = suggestedValue;
    appliedFields.push(field);
  }

  function detectDate(input: NormalizedInput): SuggestedNamingField | null {
    const validCandidates = [
      ...findFullDateCandidates(input.extractedText, "text"),
      ...findFullDateCandidates(input.filename, "filename")
    ];

    if (validCandidates.length > 0) {
      const grouped = groupDateCandidates(validCandidates);
      const first = grouped[0];
      const source = mergeSources(first.sources);
      const hasSeveralDates = grouped.length > 1;

      return {
        value: first.value,
        source,
        confidence: hasSeveralDates ? 0.58 : sourceConfidence(source, 0.84, 0.68, 0.9),
        reason: hasSeveralDates
          ? "Plusieurs dates completes detectees, validation necessaire."
          : `Date complete detectee dans ${sourceReasonLabel(source)}.`
      };
    }

    if (containsInvalidDateLike(input.extractedText) || containsInvalidDateLike(input.filename)) {
      return null;
    }

    const yearCandidates = [
      ...findYearCandidates(input.extractedText, "text"),
      ...findYearCandidates(input.filename, "filename")
    ];
    if (yearCandidates.length === 0) {
      return null;
    }

    const grouped = groupDateCandidates(yearCandidates);
    const first = grouped[0];
    const source = mergeSources(first.sources);

    return {
      value: first.value,
      source,
      confidence: grouped.length > 1 ? 0.38 : sourceConfidence(source, 0.46, 0.36, 0.5),
      reason:
        grouped.length > 1
          ? "Plusieurs annees detectees, validation necessaire."
          : `Annee detectee dans ${sourceReasonLabel(source)}.`
    };
  }

  function findFullDateCandidates(value: string, source: SearchSource): DateCandidate[] {
    const candidates: DateCandidate[] = [];
    collectDateMatches(
      value,
      source,
      candidates,
      /(^|[^0-9])((?:19|20)\d{2})-(\d{2})-(\d{2})(?=$|[^0-9])/g,
      (match) => normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4]))
    );
    collectDateMatches(
      value,
      source,
      candidates,
      /(^|[^0-9])([0-3]?\d)[/.-]([01]?\d)[/.-]((?:19|20)\d{2})(?=$|[^0-9])/g,
      (match) => normalizeDateParts(Number(match[4]), Number(match[3]), Number(match[2]))
    );

    return candidates;
  }

  function collectDateMatches(
    value: string,
    source: SearchSource,
    candidates: DateCandidate[],
    expression: RegExp,
    normalize: (match: RegExpExecArray) => string | null
  ): void {
    let match: RegExpExecArray | null;
    while ((match = expression.exec(value)) !== null) {
      const normalizedDate = normalize(match);
      if (normalizedDate) {
        candidates.push({
          value: normalizedDate,
          source,
          index: match.index
        });
      }
    }
  }

  function containsInvalidDateLike(value: string): boolean {
    return (
      hasInvalidDateMatch(
        value,
        /(^|[^0-9])((?:19|20)\d{2})-(\d{2})-(\d{2})(?=$|[^0-9])/g,
        (match) => normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4]))
      ) ||
      hasInvalidDateMatch(
        value,
        /(^|[^0-9])([0-3]?\d)[/.-]([01]?\d)[/.-]((?:19|20)\d{2})(?=$|[^0-9])/g,
        (match) => normalizeDateParts(Number(match[4]), Number(match[3]), Number(match[2]))
      )
    );
  }

  function hasInvalidDateMatch(
    value: string,
    expression: RegExp,
    normalize: (match: RegExpExecArray) => string | null
  ): boolean {
    let match: RegExpExecArray | null;
    while ((match = expression.exec(value)) !== null) {
      if (!normalize(match)) {
        return true;
      }
    }

    return false;
  }

  function findYearCandidates(value: string, source: SearchSource): DateCandidate[] {
    const candidates: DateCandidate[] = [];
    const expression = /(^|[^0-9])((?:19|20)\d{2})(?=$|[^0-9])/g;
    let match: RegExpExecArray | null;

    while ((match = expression.exec(value)) !== null) {
      candidates.push({
        value: match[2],
        source,
        index: match.index
      });
    }

    return candidates;
  }

  function normalizeDateParts(year: number, month: number, day: number): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");
  }

  function groupDateCandidates(
    candidates: DateCandidate[]
  ): Array<{ value: string; sources: Set<SearchSource>; index: number }> {
    const grouped = new Map<string, { value: string; sources: Set<SearchSource>; index: number }>();

    for (const candidate of candidates) {
      const existing = grouped.get(candidate.value);
      if (existing) {
        existing.sources.add(candidate.source);
        existing.index = Math.min(existing.index, candidate.index);
      } else {
        grouped.set(candidate.value, {
          value: candidate.value,
          sources: new Set([candidate.source]),
          index: candidate.index
        });
      }
    }

    return Array.from(grouped.values()).sort(
      (left, right) =>
        dateGroupSourceRank(left.sources) - dateGroupSourceRank(right.sources) ||
        left.index - right.index
    );
  }

  function dateGroupSourceRank(sources: Set<SearchSource>): number {
    return sources.has("text") ? 0 : 1;
  }

  function selectRuleOutputField(
    matches: MatchedSuggestionRule[],
    field: "documentType" | "subject"
  ): SuggestedNamingField | null {
    const sortedMatches = [...matches]
      .filter((match) => Boolean(match.rule.output[field]))
      .sort((left, right) => right.confidence - left.confidence);
    const selected = sortedMatches[0];

    if (!selected) {
      return null;
    }

    return {
      value: selected.rule.output[field] ?? "",
      source: selected.source,
      confidence: selected.confidence,
      reason: createRuleReason(selected.rule)
    };
  }

  function detectKeywords(
    input: NormalizedInput,
    rulesCatalog: NamingSuggestionRulesCatalog,
    documentTypeRuleMatches: MatchedSuggestionRule[],
    subjectRuleMatches: MatchedSuggestionRule[]
  ): SuggestedNamingField[] {
    const keywords: SuggestedNamingField[] = [];
    const seenValues = new Set<string>();

    for (const match of [...documentTypeRuleMatches, ...subjectRuleMatches]) {
      for (const keyword of match.rule.output.keywords ?? []) {
        addKeywordSuggestion(keywords, seenValues, {
          value: normalizeFilenameBlock(keyword),
          confidence: match.confidence,
          reason: createRuleReason(match.rule),
          source: match.source
        });
      }
    }

    for (const rule of rulesCatalog.keywordRules) {
      if (keywords.length >= maxKeywords) {
        break;
      }

      const match = matchKeywordAliasRule(input, rule);
      if (!match) {
        continue;
      }

      addKeywordSuggestion(keywords, seenValues, match);
    }

    return keywords;
  }

  function addKeywordSuggestion(
    keywords: SuggestedNamingField[],
    seenValues: Set<string>,
    suggestion: SuggestedNamingField
  ): void {
    const value = normalizeFilenameBlock(suggestion.value);
    if (!value || keywords.length >= maxKeywords || seenValues.has(value.toLowerCase())) {
      return;
    }

    keywords.push({
      ...suggestion,
      value
    });
    seenValues.add(value.toLowerCase());
  }

  function findMatchingSuggestionRules(
    input: NormalizedInput,
    rules: NamingSuggestionRule[]
  ): MatchedSuggestionRule[] {
    const matches: MatchedSuggestionRule[] = [];

    for (const rule of rules) {
      if (rule.enabled === false) {
        continue;
      }

      const match = matchSuggestionRule(input, rule);
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  function matchSuggestionRule(
    input: NormalizedInput,
    rule: NamingSuggestionRule
  ): MatchedSuggestionRule | null {
    const textMatch = matchTerms(input.textSearch, rule.match);
    const filenameMatch = matchTerms(input.filenameSearch, rule.match);
    const combinedMatch = matchTerms(input.combinedSearch, rule.match);

    if (rule.source === "text" && !textMatch) {
      return null;
    }

    if (rule.source === "filename" && !filenameMatch) {
      return null;
    }

    if (rule.source === "filename+text" && (!combinedMatch || !hasAnyRuleTerm(input.textSearch, rule.match) || !hasAnyRuleTerm(input.filenameSearch, rule.match))) {
      return null;
    }

    if (!rule.source && !combinedMatch) {
      return null;
    }

    const source =
      rule.source ??
      sourceFromBooleans(
        textMatch || hasAnyRuleTerm(input.textSearch, rule.match),
        filenameMatch || hasAnyRuleTerm(input.filenameSearch, rule.match)
      );

    return {
      rule,
      source,
      confidence: applySourceBoost(normalizeRuleConfidence(rule.confidence), source)
    };
  }

  function matchKeywordAliasRule(
    input: NormalizedInput,
    rule: KeywordAliasRule
  ): SuggestedNamingField | null {
    if (rule.enabled === false) {
      return null;
    }

    if (rule.match) {
      const textMatch = matchTerms(input.textSearch, rule.match);
      const filenameMatch = matchTerms(input.filenameSearch, rule.match);
      const combinedMatch = matchTerms(input.combinedSearch, rule.match);

      if (!combinedMatch) {
        return null;
      }

      const source = sourceFromBooleans(
        textMatch || hasAnyRuleTerm(input.textSearch, rule.match),
        filenameMatch || hasAnyRuleTerm(input.filenameSearch, rule.match)
      );

      return {
        value: rule.value,
        source,
        confidence: applySourceBoost(normalizeRuleConfidence(rule.confidence ?? 60), source),
        reason: `Regle locale : ${rule.label ?? normalizeFilenameBlock(rule.value)}.`
      };
    }

    const aliases = rule.aliases.map(normalizeSearchText).filter(Boolean);
    const textMatch = aliases.some((alias) => input.textSearch.includes(alias));
    const filenameMatch = aliases.some((alias) => input.filenameSearch.includes(alias));

    if (!textMatch && !filenameMatch) {
      return null;
    }

    const source = sourceFromBooleans(textMatch, filenameMatch);
    return {
      value: rule.value,
      source,
      confidence: applySourceBoost(normalizeRuleConfidence(rule.confidence ?? 60), source),
      reason: `Mot-cle ${normalizeFilenameBlock(rule.value)} detecte.`
    };
  }

  function matchTerms(haystack: string, match: SuggestionRuleMatch): boolean {
    const allOf = normalizeRuleTerms(match.allOf);
    const anyOf = normalizeRuleTerms(match.anyOf);
    const noneOf = normalizeRuleTerms(match.noneOf);

    if (allOf.length > 0 && !allOf.every((term) => haystack.includes(term))) {
      return false;
    }

    if (anyOf.length > 0 && !anyOf.some((term) => haystack.includes(term))) {
      return false;
    }

    if (noneOf.length > 0 && noneOf.some((term) => haystack.includes(term))) {
      return false;
    }

    return allOf.length > 0 || anyOf.length > 0;
  }

  function hasAnyRuleTerm(haystack: string, match: SuggestionRuleMatch): boolean {
    return [...normalizeRuleTerms(match.allOf), ...normalizeRuleTerms(match.anyOf)].some((term) =>
      haystack.includes(term)
    );
  }

  function normalizeRuleTerms(value: string[] | undefined): string[] {
    return (value ?? []).map(normalizeSearchText).filter(Boolean);
  }

  function detectFilenameFallbackSubject(
    filename: string,
    stopWords: string[]
  ): SuggestedNamingField | null {
    const baseName = stripExtension(filename)
      .replace(/(?:19|20)\d{2}-\d{2}-\d{2}/g, " ")
      .replace(/[0-3]?\d[/.-][01]?\d[/.-](?:19|20)\d{2}/g, " ")
      .replace(/(?:19|20)\d{2}/g, " ");
    const normalizedStopWords = new Set(stopWords.map((word) => normalizeFilenameBlock(word).toLowerCase()));
    const tokens = normalizeFilenameBlock(baseName)
      .split("-")
      .filter((token) => token.length > 1 && !normalizedStopWords.has(token.toLowerCase()));
    const fallbackValue = tokens.slice(0, 4).join("-");

    if (!fallbackValue) {
      return null;
    }

    return {
      value: fallbackValue,
      source: "filename",
      confidence: 0.32,
      reason: "Sujet propose prudemment depuis le nom de fichier."
    };
  }

  function collectReasons(
    date: SuggestedNamingField | null,
    subject: SuggestedNamingField | null,
    documentType: SuggestedNamingField | null,
    keywords: SuggestedNamingField[]
  ): string[] {
    return [date, subject, documentType, ...keywords]
      .filter((suggestion): suggestion is SuggestedNamingField => Boolean(suggestion))
      .map((suggestion) => suggestion.reason)
      .filter((reason, index, reasons) => reasons.indexOf(reason) === index)
      .slice(0, 8);
  }

  function computeOverallConfidence(
    date: SuggestedNamingField | null,
    subject: SuggestedNamingField | null,
    documentType: SuggestedNamingField | null,
    keywords: SuggestedNamingField[]
  ): number {
    const weighted: Array<{ confidence: number; weight: number }> = [];
    if (date) {
      weighted.push({ confidence: date.confidence, weight: 1 });
    }
    if (subject) {
      weighted.push({ confidence: subject.confidence, weight: 1 });
    }
    if (documentType) {
      weighted.push({ confidence: documentType.confidence, weight: 0.9 });
    }
    for (const keyword of keywords.slice(0, 3)) {
      weighted.push({ confidence: keyword.confidence, weight: 0.25 });
    }

    if (weighted.length === 0) {
      return 0;
    }

    const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
    const weightedAverage =
      weighted.reduce((total, item) => total + item.confidence * item.weight, 0) / totalWeight;
    const coreSignalCount = [date, subject, documentType].filter(Boolean).length;
    const convergentSource = [date, subject, documentType, ...keywords].some(
      (suggestion) => suggestion?.source === "filename+text"
    );
    const boost = (coreSignalCount >= 2 ? 0.06 : 0) + (convergentSource ? 0.04 : 0);

    return Math.round(Math.min(0.95, weightedAverage + boost) * 100) / 100;
  }

  function createNormalizedInput(input: NamingSuggestionsInput): NormalizedInput {
    const filename = input.filename ?? "";
    const extractedText = input.extractedText ?? "";
    const filenameSearch = normalizeSearchText(stripExtension(filename));
    const textSearch = normalizeSearchText(extractedText);

    return {
      filename,
      extractedText,
      filenameSearch,
      textSearch,
      combinedSearch: `${textSearch} ${filenameSearch}`.trim()
    };
  }

  function resolveRulesCatalog(
    rulesCatalog: NamingSuggestionRulesCatalog | undefined
  ): NamingSuggestionRulesCatalog {
    if (!rulesCatalog) {
      return getDefaultRulesCatalog();
    }

    const validation =
      globalThis.DocSorterNamingSuggestionRulesCatalog.validateNamingSuggestionRulesCatalog(rulesCatalog);
    return validation.catalog ?? createEmptyRulesCatalog();
  }

  function getDefaultRulesCatalog(): NamingSuggestionRulesCatalog {
    if (globalThis.DocSorterNamingSuggestionRulesCatalog) {
      return globalThis.DocSorterNamingSuggestionRulesCatalog.getDefaultNamingSuggestionRulesCatalog();
    }

    if (globalThis.DocSorterDefaultNamingSuggestionRules) {
      return cloneRulesCatalog(globalThis.DocSorterDefaultNamingSuggestionRules);
    }

    return createEmptyRulesCatalog();
  }

  function createEmptyRulesCatalog(): NamingSuggestionRulesCatalog {
    return {
      version: 1,
      documentTypeRules: [],
      subjectRules: [],
      keywordRules: [],
      stopWords: []
    };
  }

  function cloneRulesCatalog(catalog: NamingSuggestionRulesCatalog): NamingSuggestionRulesCatalog {
    return {
      version: 1,
      documentTypeRules: catalog.documentTypeRules.map((rule) => ({
        ...rule,
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
        ...(rule.enabled === undefined ? {} : { enabled: rule.enabled })
      })),
      subjectRules: catalog.subjectRules.map((rule) => ({
        ...rule,
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
        ...(rule.enabled === undefined ? {} : { enabled: rule.enabled })
      })),
      keywordRules: catalog.keywordRules.map((rule) => ({
        ...rule,
        aliases: [...rule.aliases],
        ...(rule.match
          ? {
              match: {
                ...(rule.match.allOf ? { allOf: [...rule.match.allOf] } : {}),
                ...(rule.match.anyOf ? { anyOf: [...rule.match.anyOf] } : {}),
                ...(rule.match.noneOf ? { noneOf: [...rule.match.noneOf] } : {})
              }
            }
          : {}),
        ...(rule.enabled === undefined ? {} : { enabled: rule.enabled })
      })),
      stopWords: [...catalog.stopWords]
    };
  }

  function normalizeSearchText(value: string): string {
    return removeAccents(value)
      .toLowerCase()
      .replace(/['’`-]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeFilenameBlock(value: string | undefined): string {
    return sanitizeWindowsFilename(value)
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
  }

  function sanitizeWindowsFilename(value: string | undefined): string {
    return removeAccents(value ?? "")
      .replace(forbiddenFilenameChars, " ")
      .replace(/[_-]{2,}/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "");
  }

  function removeAccents(value: string): string {
    return value.normalize("NFD").replace(combiningMarks, "");
  }

  function stripExtension(fileName: string): string {
    const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
    const lastDotIndex = baseName.lastIndexOf(".");
    if (lastDotIndex <= 0 || lastDotIndex === baseName.length - 1) {
      return baseName;
    }

    return baseName.slice(0, lastDotIndex);
  }

  function normalizeRuleConfidence(confidence: number): number {
    const normalized = confidence > 1 ? confidence / 100 : confidence;
    return Math.max(0, Math.min(1, normalized));
  }

  function applySourceBoost(confidence: number, source: NamingSuggestionSource): number {
    return Math.min(0.95, confidence + (source === "filename+text" ? 0.08 : 0));
  }

  function createRuleReason(rule: NamingSuggestionRule): string {
    return `Regle locale : ${rule.label}.`;
  }

  function sourceFromBooleans(textMatch: boolean, filenameMatch: boolean): NamingSuggestionSource {
    if (textMatch && filenameMatch) {
      return "filename+text";
    }

    return textMatch ? "text" : "filename";
  }

  function mergeSources(sources: Set<SearchSource>): NamingSuggestionSource {
    return sourceFromBooleans(sources.has("text"), sources.has("filename"));
  }

  function sourceConfidence(
    source: NamingSuggestionSource,
    textConfidence: number,
    filenameConfidence: number,
    combinedConfidence: number
  ): number {
    switch (source) {
      case "text":
        return textConfidence;
      case "filename":
        return filenameConfidence;
      case "filename+text":
        return combinedConfidence;
    }
  }

  function sourceReasonLabel(source: NamingSuggestionSource): string {
    switch (source) {
      case "text":
        return "le texte extrait";
      case "filename":
        return "le nom de fichier";
      case "filename+text":
        return "le texte extrait et le nom de fichier";
    }
  }

  DocSorterNamingSuggestions = {
    buildNamingSuggestions,
    applySuggestionsToEmptyFields,
    normalizeSuggestionToken: normalizeFilenameBlock
  };

  globalThis.DocSorterNamingSuggestions = DocSorterNamingSuggestions;
})();
