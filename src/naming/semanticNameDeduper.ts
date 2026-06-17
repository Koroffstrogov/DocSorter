import {
  normalizeNameBlock,
  type NamingInputV2
} from "./documentNameV2";

export interface SemanticNameDeduplicationResult {
  input: NamingInputV2;
  changed: boolean;
  removedTerms: string[];
  reasons: string[];
}

export function dedupeNamingInputV2Semantic(
  input: NamingInputV2
): SemanticNameDeduplicationResult {
  const normalized: NamingInputV2 = {
    dateToken: input.dateToken.trim().toLowerCase(),
    target: normalizeNameBlock(input.target),
    documentType: normalizeNameBlock(input.documentType),
    issuer: normalizeNameBlock(input.issuer),
    detail: normalizeNameBlock(input.detail),
    extension: input.extension
  };
  const removedTerms: string[] = [];
  const targetTerms = tokenSet(normalized.target);
  const documentTypeTerms = tokenSet(normalized.documentType);
  const issuerBefore = normalized.issuer ?? "";
  const issuer = removeTerms(issuerBefore, targetTerms, removedTerms);
  const issuerTerms = tokenSet(issuerBefore);
  const detailForbiddenTerms = new Set([
    ...targetTerms,
    ...documentTypeTerms,
    ...issuerTerms
  ]);
  const detail = removeTerms(normalized.detail ?? "", detailForbiddenTerms, removedTerms);
  const deduped: NamingInputV2 = {
    ...normalized,
    ...(issuer ? { issuer } : { issuer: undefined }),
    ...(detail ? { detail } : { detail: undefined })
  };
  const changed = normalizeNameBlock(input.issuer) !== (deduped.issuer ?? "") ||
    normalizeNameBlock(input.detail) !== (deduped.detail ?? "");

  return {
    input: deduped,
    changed,
    removedTerms: uniqueStrings(removedTerms),
    reasons: changed ? ["Doublons sémantiques retirés des blocs émetteur/détail."] : []
  };
}

function removeTerms(
  value: string,
  termsToRemove: Set<string>,
  removedTerms: string[]
): string {
  const kept = normalizeNameBlock(value)
    .split("-")
    .filter(Boolean)
    .filter((term) => {
      if (termsToRemove.has(term)) {
        removedTerms.push(term);
        return false;
      }

      return true;
    });

  return kept.join("-");
}

function tokenSet(value: string | undefined): Set<string> {
  return new Set(
    normalizeNameBlock(value)
      .split("-")
      .filter((term) => term.length >= 2)
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
