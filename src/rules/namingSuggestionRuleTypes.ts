type RuleSource = "filename" | "text" | "filename+text";

type SuggestionRuleMatch = {
  allOf?: string[];
  anyOf?: string[];
  noneOf?: string[];
};

type SuggestionRuleOutput = {
  documentType?: string;
  subject?: string;
  keywords?: string[];
};

type NamingSuggestionRule = {
  id: string;
  label: string;
  description?: string;
  match: SuggestionRuleMatch;
  output: SuggestionRuleOutput;
  confidence: number;
  source?: RuleSource;
  enabled?: boolean;
};

type KeywordAliasRule = {
  id?: string;
  value: string;
  aliases: string[];
  match?: SuggestionRuleMatch;
  confidence?: number;
  label?: string;
  description?: string;
  enabled?: boolean;
};

type NamingSuggestionRulesCatalog = {
  version: 1;
  documentTypeRules: NamingSuggestionRule[];
  subjectRules: NamingSuggestionRule[];
  keywordRules: KeywordAliasRule[];
  stopWords: string[];
};

type NamingSuggestionRulesCatalogValidation = {
  isValid: boolean;
  errors: string[];
  catalog: NamingSuggestionRulesCatalog | null;
};

interface NamingSuggestionRulesCatalogApi {
  getDefaultNamingSuggestionRulesCatalog: () => NamingSuggestionRulesCatalog;
  mergeNamingSuggestionRulesCatalogs: (
    defaultCatalog: NamingSuggestionRulesCatalog,
    userCatalog: NamingSuggestionRulesCatalog
  ) => NamingSuggestionRulesCatalog;
  validateNamingSuggestionRulesCatalog: (
    catalog: unknown
  ) => NamingSuggestionRulesCatalogValidation;
}

interface Window {
  DocSorterDefaultNamingSuggestionRules: NamingSuggestionRulesCatalog;
  DocSorterNamingSuggestionRulesCatalog: NamingSuggestionRulesCatalogApi;
}

var DocSorterDefaultNamingSuggestionRules: NamingSuggestionRulesCatalog;
var DocSorterNamingSuggestionRulesCatalog: NamingSuggestionRulesCatalogApi;
