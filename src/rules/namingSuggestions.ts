type NamingSuggestionSource = "text" | "filename" | "filename+text";

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

  interface PatternRule {
    value: string;
    patterns: string[];
    confidence: number;
    reason: string;
  }

  interface DateCandidate {
    value: string;
    source: SearchSource;
    index: number;
  }

  const combiningMarks = /[\u0300-\u036f]/g;
  const forbiddenFilenameChars = /[<>:"/\\|?*\u0000-\u001F]/g;

  const documentTypeRules: PatternRule[] = [
    {
      value: "avis-imposition",
      patterns: ["avis d imposition", "avis imposition", "impot", "impots", "revenu fiscal"],
      confidence: 0.82,
      reason: "Type avis d'imposition reconnu."
    },
    {
      value: "facture",
      patterns: ["facture", "invoice", "montant ttc"],
      confidence: 0.8,
      reason: "Type facture reconnu."
    },
    {
      value: "attestation",
      patterns: ["attestation"],
      confidence: 0.76,
      reason: "Type attestation reconnu."
    },
    {
      value: "certificat",
      patterns: ["certificat"],
      confidence: 0.76,
      reason: "Type certificat reconnu."
    },
    {
      value: "contrat",
      patterns: ["contrat"],
      confidence: 0.74,
      reason: "Type contrat reconnu."
    },
    {
      value: "releve",
      patterns: ["releve de compte", "releve bancaire", "releve"],
      confidence: 0.76,
      reason: "Type releve reconnu."
    },
    {
      value: "assurance",
      patterns: ["assurance habitation", "attestation assurance", "assurance"],
      confidence: 0.74,
      reason: "Type assurance reconnu."
    },
    {
      value: "courrier",
      patterns: ["courrier", "lettre"],
      confidence: 0.66,
      reason: "Type courrier reconnu."
    },
    {
      value: "devis",
      patterns: ["devis"],
      confidence: 0.78,
      reason: "Type devis reconnu."
    },
    {
      value: "quittance",
      patterns: ["quittance"],
      confidence: 0.78,
      reason: "Type quittance reconnu."
    },
    {
      value: "bulletin",
      patterns: ["bulletin de salaire", "bulletin"],
      confidence: 0.74,
      reason: "Type bulletin reconnu."
    }
  ];

  const keywordRules: PatternRule[] = [
    {
      value: "controle-technique",
      patterns: ["controle technique", "controle-technique"],
      confidence: 0.68,
      reason: "Mot-cle controle technique detecte."
    },
    {
      value: "vidange",
      patterns: ["vidange"],
      confidence: 0.66,
      reason: "Mot-cle vidange detecte."
    },
    {
      value: "mutuelle",
      patterns: ["mutuelle", "complementaire sante"],
      confidence: 0.66,
      reason: "Mot-cle mutuelle detecte."
    },
    {
      value: "habitation",
      patterns: ["habitation", "logement"],
      confidence: 0.64,
      reason: "Mot-cle habitation detecte."
    },
    {
      value: "scolarite",
      patterns: ["scolarite", "ecole", "college", "lycee"],
      confidence: 0.64,
      reason: "Mot-cle scolarite detecte."
    },
    {
      value: "impots",
      patterns: ["impot", "impots", "fiscal"],
      confidence: 0.66,
      reason: "Mot-cle impots detecte."
    },
    {
      value: "banque",
      patterns: ["banque", "bancaire", "compte courant"],
      confidence: 0.64,
      reason: "Mot-cle banque detecte."
    },
    {
      value: "energie",
      patterns: ["energie", "electricite", "gaz", "edf", "engie"],
      confidence: 0.64,
      reason: "Mot-cle energie detecte."
    },
    {
      value: "echeancier",
      patterns: ["echeancier", "mensualite"],
      confidence: 0.64,
      reason: "Mot-cle echeancier detecte."
    },
    {
      value: "cotisation",
      patterns: ["cotisation"],
      confidence: 0.62,
      reason: "Mot-cle cotisation detecte."
    },
    {
      value: "ttc",
      patterns: ["ttc", "montant ttc"],
      confidence: 0.58,
      reason: "Mot-cle TTC detecte."
    },
    {
      value: "devis",
      patterns: ["devis"],
      confidence: 0.58,
      reason: "Mot-cle devis detecte."
    },
    {
      value: "facture",
      patterns: ["facture"],
      confidence: 0.58,
      reason: "Mot-cle facture detecte."
    }
  ];

  function buildNamingSuggestions(input: NamingSuggestionsInput): NamingSuggestions {
    const normalizedInput = createNormalizedInput(input);
    const date = detectDate(normalizedInput);
    const documentType = detectDocumentType(normalizedInput);
    const subject = detectSubject(normalizedInput);
    const keywords = detectKeywords(normalizedInput);
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
    collectDateMatches(value, source, candidates, /(^|[^0-9])((?:19|20)\d{2})-(\d{2})-(\d{2})(?=$|[^0-9])/g, (match) =>
      normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4]))
    );
    collectDateMatches(value, source, candidates, /(^|[^0-9])([0-3]?\d)[/.-]([01]?\d)[/.-]((?:19|20)\d{2})(?=$|[^0-9])/g, (match) =>
      normalizeDateParts(Number(match[4]), Number(match[3]), Number(match[2]))
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
      hasInvalidDateMatch(value, /(^|[^0-9])((?:19|20)\d{2})-(\d{2})-(\d{2})(?=$|[^0-9])/g, (match) =>
        normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[4]))
      ) ||
      hasInvalidDateMatch(value, /(^|[^0-9])([0-3]?\d)[/.-]([01]?\d)[/.-]((?:19|20)\d{2})(?=$|[^0-9])/g, (match) =>
        normalizeDateParts(Number(match[4]), Number(match[3]), Number(match[2]))
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
      (left, right) => dateGroupSourceRank(left.sources) - dateGroupSourceRank(right.sources) || left.index - right.index
    );
  }

  function dateGroupSourceRank(sources: Set<SearchSource>): number {
    return sources.has("text") ? 0 : 1;
  }

  function detectDocumentType(input: NormalizedInput): SuggestedNamingField | null {
    return detectPatternField(input, documentTypeRules);
  }

  function detectKeywords(input: NormalizedInput): SuggestedNamingField[] {
    const keywords: SuggestedNamingField[] = [];
    const seenValues = new Set<string>();

    for (const rule of keywordRules) {
      if (keywords.length >= 5 || seenValues.has(rule.value)) {
        continue;
      }

      const detected = detectPatternField(input, [rule]);
      if (!detected) {
        continue;
      }

      keywords.push(detected);
      seenValues.add(detected.value);
    }

    return keywords;
  }

  function detectSubject(input: NormalizedInput): SuggestedNamingField | null {
    const subjectRules: PatternRule[] = [
      {
        value: "Renault-Captur",
        patterns: ["renault captur"],
        confidence: 0.86,
        reason: "Sujet Renault Captur reconnu."
      },
      {
        value: "Scenic",
        patterns: ["scenic"],
        confidence: 0.78,
        reason: "Sujet Scenic reconnu."
      },
      {
        value: "Maison",
        patterns: ["assurance habitation"],
        confidence: 0.76,
        reason: "Sujet habitation reconnu."
      },
      {
        value: "Impots",
        patterns: ["avis d imposition", "avis imposition", "impot", "impots"],
        confidence: 0.74,
        reason: "Sujet impots reconnu."
      },
      {
        value: "Ecole",
        patterns: ["certificat de scolarite", "scolarite", "ecole"],
        confidence: 0.74,
        reason: "Sujet scolarite reconnu."
      }
    ];

    const directSubject = detectPatternField(input, subjectRules);
    if (directSubject) {
      return directSubject;
    }

    return detectFilenameFallbackSubject(input.filename);
  }

  function detectPatternField(
    input: NormalizedInput,
    rules: PatternRule[]
  ): SuggestedNamingField | null {
    for (const rule of rules) {
      const textMatch = rule.patterns.some((pattern) => input.textSearch.includes(pattern));
      const filenameMatch = rule.patterns.some((pattern) => input.filenameSearch.includes(pattern));

      if (!textMatch && !filenameMatch) {
        continue;
      }

      const source = sourceFromBooleans(textMatch, filenameMatch);
      return {
        value: rule.value,
        source,
        confidence: Math.min(0.95, rule.confidence + (source === "filename+text" ? 0.08 : 0)),
        reason: rule.reason
      };
    }

    return null;
  }

  function detectFilenameFallbackSubject(filename: string): SuggestedNamingField | null {
    const baseName = stripExtension(filename)
      .replace(/(?:19|20)\d{2}-\d{2}-\d{2}/g, " ")
      .replace(/[0-3]?\d[/.-][01]?\d[/.-](?:19|20)\d{2}/g, " ")
      .replace(/(?:19|20)\d{2}/g, " ");
    const genericTokens = new Set([
      "scan",
      "document",
      "doc",
      "pdf",
      "image",
      "img",
      "facture",
      "devis",
      "releve",
      "avis",
      "imposition",
      "impot",
      "impots",
      "attestation",
      "certificat",
      "contrat",
      "assurance",
      "courrier",
      "quittance",
      "bulletin"
    ]);
    const tokens = normalizeFilenameBlock(baseName)
      .split("-")
      .filter((token) => token.length > 1 && !genericTokens.has(token.toLowerCase()));
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

  function normalizeSearchText(value: string): string {
    return removeAccents(value)
      .toLowerCase()
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
