import type {
  BuildTargetFolderSuggestionsV2Input,
  FolderDepthLabel,
  FolderDepthOption,
  FolderRuleV2,
  FolderSuggestionSource
} from "./folderSuggestionTypes";
import { isPeriodicFolderDocumentType } from "./targetFolderRulesV2";
import {
  extractYearSegment,
  segmentFromAlias,
  validateTargetFolderOptionPath
} from "./targetFolderSafety";

export interface FolderDepthBuildResult {
  options: FolderDepthOption[];
  warnings: string[];
  reasons: string[];
}

export function buildFolderDepthOptions(
  input: BuildTargetFolderSuggestionsV2Input,
  rule: FolderRuleV2
): FolderDepthBuildResult {
  const warnings: string[] = [];
  const reasons: string[] = [];
  const knownFolders = normalizeKnownFolders(input.knownRelativeFolders ?? []);
  const targetSegment = segmentFromAlias(input.draft.target);
  const periodSegment = getPeriodSegment(input);
  const rawOptions = [
    createRawOption("court", rule.domainPath, 60, "Domaine métier proposé."),
    targetSegment
      ? createRawOption(
          "equilibre",
          `${rule.domainPath}/${targetSegment}`,
          78,
          "Domaine et cible connus."
        )
      : null,
    createDetailedRawOption(rule.domainPath, targetSegment, periodSegment)
  ];

  const options: FolderDepthOption[] = [];
  for (const rawOption of rawOptions) {
    if (!rawOption) {
      continue;
    }

    const safety = validateTargetFolderOptionPath(rawOption.relativePath);
    if (!safety.ok) {
      warnings.push(safety.warning);
      continue;
    }

    const exists = knownFolders.has(safety.relativePath.toLowerCase());
    const option: FolderDepthOption = {
      label: rawOption.label,
      relativePath: safety.relativePath,
      depth: safety.depth,
      recommended: false,
      confidence: rawOption.confidence + (exists ? 8 : 0),
      reasons: [
        rawOption.reason,
        ...(exists ? ["Dossier déjà présent dans les dossiers connus."] : [])
      ],
      warnings: [...safety.warnings],
      requiresCreation: knownFolders.size > 0 ? !exists : undefined,
      source: exists ? "existing-folder" : "rules-v2"
    };

    options.push(option);
  }

  const deduplicated = deduplicateOptions(options);
  if (rule.requireTargetWarning && !targetSegment) {
    warnings.push("Cible absente : un dossier par personne ou cible est recommandé.");
  }

  if (rule.unknownFallback) {
    warnings.push("Type documentaire incomplet ou inconnu : classement manuel recommandé.");
  }

  applyRecommendation(deduplicated, input, rule, reasons, warnings);

  return {
    options: deduplicated,
    warnings: uniqueStrings(warnings),
    reasons: uniqueStrings(reasons)
  };
}

function createDetailedRawOption(
  domainPath: string,
  targetSegment: string,
  periodSegment: string
): RawFolderOption | null {
  if (!periodSegment) {
    return null;
  }

  if (targetSegment && domainPath.split("/").length <= 1) {
    return createRawOption(
      "detaille",
      `${domainPath}/${targetSegment}/${periodSegment}`,
      72,
      "Dossier détaillé avec période."
    );
  }

  return createRawOption(
    "detaille",
    `${domainPath}/${periodSegment}`,
    72,
    "Dossier détaillé avec période."
  );
}

function applyRecommendation(
  options: FolderDepthOption[],
  input: BuildTargetFolderSuggestionsV2Input,
  rule: FolderRuleV2,
  reasons: string[],
  warnings: string[]
): void {
  const preference = findPreference(input);
  const preferencePath = preference?.preferredRelativePath
    ? validateTargetFolderOptionPath(preference.preferredRelativePath)
    : null;

  if (preferencePath && preferencePath.ok) {
    const option = findOrCreatePreferenceOption(options, preferencePath.relativePath);
    markRecommended(option, "preference", "Préférence utilisateur appliquée.", reasons);
    return;
  }

  if (preference?.preferredRelativePath && preferencePath && !preferencePath.ok) {
    warnings.push("Préférence de dossier ignorée : chemin relatif invalide.");
  }

  if (preference?.preferredDepth) {
    const option = options.find((candidate) => candidate.depth === preference.preferredDepth);
    if (option) {
      markRecommended(option, "preference", "Préférence utilisateur de profondeur appliquée.", reasons);
      return;
    }
  }

  const detailed = options.find((option) => option.label === "detaille");
  const detailedReason = getDetailedRecommendationReason(input, rule, detailed);
  if (detailed && detailedReason) {
    const source: FolderSuggestionSource = detailedReason === "Dossier détaillé déjà existant."
      ? "existing-folder"
      : "rules-v2";
    markRecommended(detailed, source, detailedReason, reasons);
    return;
  }

  if (rule.unknownFallback) {
    const fallbackOption = options.find((option) => option.label === "court") ?? options[0];
    if (fallbackOption) {
      markRecommended(fallbackOption, "fallback", "Type inconnu : dossier manuel recommandé.", reasons);
      return;
    }
  }

  const balanced = options.find((option) => option.label === "equilibre");
  if (balanced) {
    markRecommended(balanced, balanced.source, "Profondeur équilibrée recommandée.", reasons);
    return;
  }

  const short = options.find((option) => option.label === "court") ?? options[0];
  if (short) {
    markRecommended(short, short.source, "Dossier court recommandé faute de cible fiable.", reasons);
  }
}

function getDetailedRecommendationReason(
  input: BuildTargetFolderSuggestionsV2Input,
  rule: FolderRuleV2,
  detailed: FolderDepthOption | undefined
): string | null {
  if (!detailed) {
    return null;
  }

  if (detailed.source === "existing-folder") {
    return "Dossier détaillé déjà existant.";
  }

  const stat = findFolderStat(input, detailed.relativePath);
  if ((stat?.similarDocumentCount ?? 0) >= 5) {
    return "Plusieurs documents similaires connus pour ce dossier.";
  }

  if (rule.preferDetailedForSeries || isPeriodicFolderDocumentType(input.draft.documentType)) {
    return "Type documentaire périodique : niveau détaillé recommandé.";
  }

  return null;
}

function findPreference(input: BuildTargetFolderSuggestionsV2Input) {
  const keys = createPreferenceKeys(input);
  return (input.userFolderPreferences ?? []).find((preference) =>
    keys.has(preference.matchKey.trim().toLowerCase())
  );
}

function createPreferenceKeys(input: BuildTargetFolderSuggestionsV2Input): Set<string> {
  const keys = new Set<string>();
  const documentType = input.draft.documentType?.trim().toLowerCase();
  const target = input.draft.target?.trim().toLowerCase();

  if (documentType) {
    keys.add(`documentType:${documentType}`.toLowerCase());
  }
  if (target) {
    keys.add(`target:${target}`.toLowerCase());
  }
  if (documentType && target) {
    keys.add(`documentType:${documentType}|target:${target}`.toLowerCase());
  }

  return keys;
}

function findOrCreatePreferenceOption(
  options: FolderDepthOption[],
  relativePath: string
): FolderDepthOption {
  const existing = options.find(
    (option) => option.relativePath.toLowerCase() === relativePath.toLowerCase()
  );
  if (existing) {
    return existing;
  }

  const option: FolderDepthOption = {
    label: inferDepthLabel(relativePath),
    relativePath,
    depth: relativePath.split("/").length,
    recommended: false,
    confidence: 92,
    reasons: ["Chemin issu d'une préférence utilisateur."],
    warnings: [],
    source: "preference"
  };
  options.push(option);
  return option;
}

function markRecommended(
  option: FolderDepthOption,
  source: FolderSuggestionSource,
  reason: string,
  reasons: string[]
): void {
  option.recommended = true;
  option.source = source;
  option.confidence = Math.min(100, option.confidence + 12);
  option.reasons = uniqueStrings([...option.reasons, reason]);
  reasons.push(reason);
}

function getPeriodSegment(input: BuildTargetFolderSuggestionsV2Input): string {
  const selectedDate = input.draft.dateSelection?.selected;
  if (selectedDate?.precision === "school-year") {
    return selectedDate.token;
  }

  return extractYearSegment(input.draft.dateToken);
}

function createRawOption(
  label: FolderDepthLabel,
  relativePath: string,
  confidence: number,
  reason: string
): RawFolderOption {
  return {
    label,
    relativePath,
    confidence,
    reason
  };
}

function deduplicateOptions(options: FolderDepthOption[]): FolderDepthOption[] {
  const byPath = new Map<string, FolderDepthOption>();
  for (const option of options) {
    const key = option.relativePath.toLowerCase();
    const existing = byPath.get(key);
    if (!existing || option.confidence > existing.confidence) {
      byPath.set(key, option);
    }
  }

  return Array.from(byPath.values()).sort((left, right) => left.depth - right.depth);
}

function normalizeKnownFolders(folders: string[]): Set<string> {
  const normalized = new Set<string>();
  for (const folder of folders) {
    const safety = validateTargetFolderOptionPath(folder);
    if (safety.ok) {
      normalized.add(safety.relativePath.toLowerCase());
    }
  }
  return normalized;
}

function findFolderStat(input: BuildTargetFolderSuggestionsV2Input, relativePath: string) {
  return (input.knownFolderStats ?? []).find(
    (stat) => stat.relativePath.trim().toLowerCase() === relativePath.toLowerCase()
  );
}

function inferDepthLabel(relativePath: string): FolderDepthLabel {
  const depth = relativePath.split("/").length;
  if (depth <= 1) {
    return "court";
  }
  if (depth === 2) {
    return "equilibre";
  }
  return "detaille";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

interface RawFolderOption {
  label: FolderDepthLabel;
  relativePath: string;
  confidence: number;
  reason: string;
}
