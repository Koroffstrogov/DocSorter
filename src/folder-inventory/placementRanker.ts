import { normalizeNameBlock } from "../naming/documentNameV2";
import { getTargetFolderRuleV2 } from "../folders/targetFolderRulesV2";
import { extractYearSegment } from "../folders/targetFolderSafety";
import type {
  FolderInventoryItem,
  FolderPlacementCandidate,
  FolderPlacementRanking,
  RankFolderPlacementInput
} from "./folderInventoryTypes";
import { normalizeInventoryRelativePath } from "./folderInventorySafety";

const DEFAULT_FALLBACK_PATH = "Divers/A-traiter-manuellement";
const RECOMMENDATION_THRESHOLD = 35;
const STRONG_EXISTING_FOLDER_MATCH = 80;

export function rankFolderPlacementCandidates(
  input: RankFolderPlacementInput
): FolderPlacementRanking {
  const fallbackPath = input.fallbackPath ?? DEFAULT_FALLBACK_PATH;
  const warnings = [...input.inventory.warnings];
  const reasons: string[] = [];
  const candidates = input.inventory.items
    .map((item) => scoreInventoryItem(item, input))
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates);

  const best = candidates[0];
  if (best && best.score >= RECOMMENDATION_THRESHOLD) {
    reasons.push(`Dossier existant retenu : ${best.relativePath}.`);
    warnings.push(...createCompetingPathWarnings(best.relativePath, input.competingRelativePaths ?? []));
    return {
      recommended: best,
      candidates,
      warnings: uniqueStrings(warnings),
      reasons: uniqueStrings(reasons)
    };
  }

  const fallbackItem = input.inventory.items.find(
    (item) => item.relativePath.toLowerCase() === fallbackPath.toLowerCase()
  );
  const fallback = createFallbackCandidate(fallbackPath, fallbackItem);
  reasons.push("Aucun dossier existant suffisamment pertinent : dossier manuel recommandé.");

  return {
    recommended: fallback,
    candidates: uniqueCandidates([fallback, ...candidates]),
    warnings: uniqueStrings(warnings),
    reasons: uniqueStrings(reasons)
  };
}

function scoreInventoryItem(
  item: FolderInventoryItem,
  input: RankFolderPlacementInput
): FolderPlacementCandidate {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const normalizedPath = normalizeNameBlock(item.relativePath);
  const pathTokens = tokenize(normalizedPath);
  const evidenceTokens = tokenize(normalizeNameBlock(input.evidenceText));
  const sampleText = normalizeNameBlock(item.sampleFileNames.join(" "));
  const sampleTokens = tokenize(sampleText);
  const terminalSegment = getTerminalSegment(item.relativePath);
  const terminalTokens = tokenize(terminalSegment);
  const targetTokens = tokenize(input.draft.target);
  const documentTypeTokens = tokenize(input.draft.documentType);
  const issuerTokens = tokenize(input.draft.issuer);
  const rule = getTargetFolderRuleV2(input.draft.documentType);
  const domain = normalizeNameBlock(rule.domainPath);
  const domainTokens = tokenize(domain);

  let score = 0;

  if (domainTokens.length > 0 && startsWithTokens(pathTokens, domainTokens)) {
    score += 40;
    reasons.push("Domaine du dossier cohérent avec le type documentaire.");
  }

  const terminalTargetOverlap = countOverlap(terminalTokens, targetTokens);
  if (terminalTargetOverlap > 0) {
    score += STRONG_EXISTING_FOLDER_MATCH + terminalTargetOverlap * 8;
    reasons.push(`Dossier existant correspondant à ${terminalSegment}.`);
  }

  const targetOverlap = countOverlap(pathTokens, targetTokens);
  if (targetOverlap > 0) {
    score += 30 + targetOverlap * 5;
    reasons.push("Dossier existant aligné avec la cible.");
  }

  for (const folderAlias of input.folderAliases ?? []) {
    const alias = normalizeNameBlock(folderAlias);
    if (alias && normalizedPath.includes(alias)) {
      score += 35;
      reasons.push("Alias de dossier référentiel retrouvé dans l'arborescence.");
      break;
    }

    const aliasOverlap = countOverlap(terminalTokens, tokenize(alias));
    if (aliasOverlap > 0) {
      score += 55 + aliasOverlap * 5;
      reasons.push(`Dossier existant correspondant à ${terminalSegment}.`);
      break;
    }
  }

  const evidenceOverlap = countOverlap(pathTokens, evidenceTokens);
  if (evidenceOverlap > 0) {
    score += Math.min(25, evidenceOverlap * 10);
    reasons.push("Dossier existant retrouvé dans le nom ou le texte disponible.");
  }

  const terminalEvidenceOverlap = countOverlap(terminalTokens, evidenceTokens);
  if (terminalEvidenceOverlap > 0) {
    score += 60 + terminalEvidenceOverlap * 5;
    reasons.push(`Dossier existant correspondant à ${terminalSegment}.`);
  }

  if (countOverlap(sampleTokens, documentTypeTokens) > 0) {
    score += 18;
    reasons.push("Fichiers similaires du dossier utilisent le même type documentaire.");
  }

  if (targetTokens.length > 0 && countOverlap(sampleTokens, targetTokens) > 0) {
    score += 12;
    reasons.push("Fichiers similaires du dossier utilisent la même cible.");
  }

  if (issuerTokens.length > 0 && countOverlap(sampleTokens, issuerTokens) > 0) {
    score += 8;
    reasons.push("Fichiers similaires du dossier utilisent le même émetteur.");
  }

  const year = extractYearSegment(input.draft.dateToken);
  if (year && pathTokens.includes(year)) {
    score += 10;
    reasons.push("Dossier détaillé existant pour la période détectée.");
  }

  if (item.fileCount > 0) {
    score += Math.min(10, item.fileCount);
  }

  return {
    relativePath: item.relativePath,
    score,
    confidence: Math.max(0, Math.min(100, Math.round(score))),
    exists: true,
    reasons: uniqueStrings(reasons),
    warnings,
    item,
    source: "inventory"
  };
}

function createFallbackCandidate(
  fallbackPath: string,
  fallbackItem: FolderInventoryItem | undefined
): FolderPlacementCandidate {
  const safety = normalizeInventoryRelativePath(fallbackPath);
  const relativePath = safety.ok ? safety.relativePath : DEFAULT_FALLBACK_PATH;

  return {
    relativePath,
    score: fallbackItem ? 45 : 15,
    confidence: fallbackItem ? 45 : 15,
    exists: Boolean(fallbackItem),
    reasons: [
      fallbackItem
        ? "Dossier manuel existant disponible."
        : "Fallback manuel proposé sans création automatique."
    ],
    warnings: fallbackItem ? [] : ["Dossier fallback non confirmé dans l'inventaire."],
    ...(fallbackItem ? { item: fallbackItem } : {}),
    source: fallbackItem ? "inventory" : "fallback"
  };
}

function createCompetingPathWarnings(
  recommendedPath: string,
  competingPaths: string[]
): string[] {
  const normalizedRecommended = normalizeNameBlock(recommendedPath);
  return uniqueStrings(
    competingPaths
      .filter((candidate) => {
        const normalizedCandidate = normalizeNameBlock(candidate);
        return normalizedCandidate && normalizedCandidate !== normalizedRecommended;
      })
      .map(() => "Chemin historique ou théorique différent : dossier existant préféré.")
  );
}

function getTerminalSegment(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? relativePath;
}

function tokenize(value: string | undefined): string[] {
  return Array.from(
    new Set(
      normalizeNameBlock(value)
        .split("-")
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function startsWithTokens(pathTokens: string[], domainTokens: string[]): boolean {
  if (domainTokens.length === 0 || pathTokens.length < domainTokens.length) {
    return false;
  }

  return domainTokens.every((token, index) => pathTokens[index] === token);
}

function countOverlap(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function compareCandidates(left: FolderPlacementCandidate, right: FolderPlacementCandidate): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.exists !== left.exists) {
    return right.exists ? 1 : -1;
  }

  return left.relativePath.localeCompare(right.relativePath, "fr", { sensitivity: "base" });
}

function uniqueCandidates(candidates: FolderPlacementCandidate[]): FolderPlacementCandidate[] {
  const byPath = new Map<string, FolderPlacementCandidate>();
  for (const candidate of candidates) {
    const key = candidate.relativePath.toLowerCase();
    const existing = byPath.get(key);
    if (!existing || candidate.score > existing.score) {
      byPath.set(key, candidate);
    }
  }

  return Array.from(byPath.values()).sort(compareCandidates);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
