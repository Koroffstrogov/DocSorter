import type {
  BuildTargetFolderSuggestionsV2Input,
  TargetFolderSuggestionV2
} from "./folderSuggestionTypes";
import { buildFolderDepthOptions } from "./folderDepthOptions";
import { getTargetFolderRuleV2 } from "./targetFolderRulesV2";

export function buildTargetFolderSuggestionsV2(
  input: BuildTargetFolderSuggestionsV2Input
): TargetFolderSuggestionV2 {
  const rule = getTargetFolderRuleV2(input.draft.documentType);
  const result = buildFolderDepthOptions(input, rule);
  const recommended = result.options.find((option) => option.recommended);

  return {
    ...(recommended ? { recommended } : {}),
    options: result.options,
    warnings: result.warnings,
    reasons: result.reasons
  };
}
