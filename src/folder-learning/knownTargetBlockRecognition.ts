import { normalizeNameBlock } from "../naming/documentNameV2";

export interface FolderLearningKnownTargetReference {
  id: string;
  kind?: string;
  displayName: string;
  fileAlias: string;
  aliases: string[];
  isActive?: boolean;
}

export type FolderLearningKnownTargetMatchType =
  | "exact-alias"
  | "exact-display-name"
  | "controlled-prefix";

export interface FolderLearningTargetBlockRecognition {
  block: string;
  position: number;
  field: "target";
  target: {
    id: string;
    displayName: string;
    fileAlias: string;
    kind?: string;
  };
  matchType: FolderLearningKnownTargetMatchType;
  confidence: number;
  reason: string;
}

export interface FolderLearningTargetBlockAmbiguity {
  block: string;
  position: number;
  matchingFileAliases: string[];
  reason: string;
}

export interface FolderLearningTargetBlockRecognitionResult {
  recognitions: FolderLearningTargetBlockRecognition[];
  ambiguities: FolderLearningTargetBlockAmbiguity[];
}

interface KnownTargetToken {
  value: string;
  normalized: string;
  matchType: "exact-alias" | "exact-display-name";
  target: FolderLearningKnownTargetReference;
}

interface CandidateMatch {
  token: KnownTargetToken;
  matchType: FolderLearningKnownTargetMatchType;
  confidence: number;
}

const MIN_PREFIX_LENGTH = 3;
const GENERIC_PREFIX_TOKENS = new Set([
  "doc",
  "pdf",
  "scan",
  "test",
  "file",
  "fichier",
  "document"
]);

export function normalizeKnownTargetToken(value: string): string {
  return normalizeNameBlock(value);
}

export function recognizeKnownTargetBlocks(
  blocks: readonly string[],
  targets: readonly FolderLearningKnownTargetReference[] = []
): FolderLearningTargetBlockRecognitionResult {
  const tokens = buildKnownTargetTokens(targets);
  const recognitions: FolderLearningTargetBlockRecognition[] = [];
  const ambiguities: FolderLearningTargetBlockAmbiguity[] = [];

  blocks.forEach((block, index) => {
    const normalizedBlock = normalizeKnownTargetToken(block);
    if (!normalizedBlock) {
      return;
    }

    const matches = tokens
      .map((token) => matchBlockWithToken(normalizedBlock, token))
      .filter((match): match is CandidateMatch => match !== null)
      .sort((left, right) =>
        right.confidence - left.confidence ||
        left.token.target.fileAlias.localeCompare(right.token.target.fileAlias, "fr", { sensitivity: "base" })
      );

    if (matches.length === 0) {
      return;
    }

    const bestConfidence = matches[0]?.confidence ?? 0;
    const bestMatches = matches.filter((match) => match.confidence === bestConfidence);
    const distinctTargets = new Map(bestMatches.map((match) => [match.token.target.id, match]));
    if (distinctTargets.size > 1) {
      ambiguities.push({
        block,
        position: index,
        matchingFileAliases: Array.from(distinctTargets.values())
          .map((match) => match.token.target.fileAlias)
          .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" })),
        reason: `Bloc "${block}" ambigu : plusieurs cibles locales correspondent.`
      });
      return;
    }

    const best = bestMatches[0];
    if (!best) {
      return;
    }

    recognitions.push({
      block,
      position: index,
      field: "target",
      target: {
        id: best.token.target.id,
        displayName: best.token.target.displayName,
        fileAlias: best.token.target.fileAlias,
        ...(best.token.target.kind ? { kind: best.token.target.kind } : {})
      },
      matchType: best.matchType,
      confidence: best.confidence,
      reason: `Bloc "${block}" reconnu comme cible via ${labelForMatchType(best.matchType)} du référentiel.`
    });
  });

  return {
    recognitions,
    ambiguities
  };
}

function buildKnownTargetTokens(targets: readonly FolderLearningKnownTargetReference[]): KnownTargetToken[] {
  const tokens: KnownTargetToken[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    if (target.isActive === false) {
      continue;
    }

    const displayName = normalizeKnownTargetToken(target.displayName);
    if (displayName && !seen.has(`${target.id}:display:${displayName}`)) {
      seen.add(`${target.id}:display:${displayName}`);
      tokens.push({
        value: target.displayName,
        normalized: displayName,
        matchType: "exact-display-name",
        target
      });
    }

    for (const value of [target.fileAlias, ...target.aliases]) {
      const normalized = normalizeKnownTargetToken(value);
      if (!normalized || seen.has(`${target.id}:alias:${normalized}`)) {
        continue;
      }

      seen.add(`${target.id}:alias:${normalized}`);
      tokens.push({
        value,
        normalized,
        matchType: "exact-alias",
        target
      });
    }
  }

  return tokens.sort((left, right) => right.normalized.length - left.normalized.length);
}

function matchBlockWithToken(normalizedBlock: string, token: KnownTargetToken): CandidateMatch | null {
  if (!token.normalized) {
    return null;
  }

  if (normalizedBlock === token.normalized) {
    return {
      token,
      matchType: token.matchType,
      confidence: token.matchType === "exact-alias" ? 95 : 92
    };
  }

  if (isControlledPrefixMatch(normalizedBlock, token.normalized)) {
    return {
      token,
      matchType: "controlled-prefix",
      confidence: 75
    };
  }

  return null;
}

function isControlledPrefixMatch(left: string, right: string): boolean {
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (
    shorter.length < MIN_PREFIX_LENGTH ||
    GENERIC_PREFIX_TOKENS.has(shorter) ||
    longer.length <= shorter.length
  ) {
    return false;
  }

  return longer.startsWith(`${shorter}-`);
}

function labelForMatchType(matchType: FolderLearningKnownTargetMatchType): string {
  if (matchType === "exact-display-name") {
    return "nom affiché";
  }

  if (matchType === "controlled-prefix") {
    return "préfixe contrôlé";
  }

  return "alias";
}
