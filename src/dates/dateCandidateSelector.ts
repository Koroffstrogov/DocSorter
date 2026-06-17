import type {
  BuildDateCandidatesInput,
  DateCandidate,
  DateSelectionContext,
  SelectedDateToken
} from "./dateCandidateTypes";
import { extractDateCandidates } from "./dateCandidateExtractor";
import { getDocumentDateRule, scoreCandidateForRule } from "./documentDateRules";

const FALLBACK_TOKEN = "date-inconnue";
const MIN_SELECTION_SCORE = 45;
const STRONG_AMBIGUITY_THRESHOLD = 75;
const AMBIGUITY_DELTA = 5;

export function buildSelectedDateToken(input: BuildDateCandidatesInput): SelectedDateToken {
  const candidates = extractDateCandidates(input);
  return selectDateToken(candidates, {
    documentType: input.documentType
  });
}

export function selectDateToken(
  candidates: DateCandidate[],
  context: DateSelectionContext = {}
): SelectedDateToken {
  const rule = getDocumentDateRule(context.documentType);
  const warnings: string[] = [];

  if (candidates.length === 0) {
    return fallback(candidates, ["Aucune date documentaire fiable détectée."]);
  }

  const viableCandidates = candidates.filter((candidate) => {
    if (candidate.role === "file") {
      return false;
    }

    if (candidate.role === "scan" && !rule.allowTechnicalFallback) {
      return false;
    }

    return true;
  });

  if (viableCandidates.length === 0) {
    return fallback(candidates, [
      "Seules des dates techniques faibles sont disponibles : date-inconnue utilisée."
    ]);
  }

  const scored = viableCandidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidateForRule(candidate, rule)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.candidate.confidence - left.candidate.confidence;
    });

  const best = scored[0];
  if (!best || best.score < MIN_SELECTION_SCORE) {
    return fallback(candidates, ["Aucune date candidate ne dépasse le seuil de confiance."]);
  }

  const competing = scored[1];
  if (
    competing &&
    best.candidate.confidence >= STRONG_AMBIGUITY_THRESHOLD &&
    competing.candidate.confidence >= STRONG_AMBIGUITY_THRESHOLD &&
    best.score - competing.score <= AMBIGUITY_DELTA
  ) {
    warnings.push("Plusieurs dates fortes sont proches : vérifier la date retenue.");
  }

  if (best.candidate.role === "scan") {
    warnings.push("Date de scan/EXIF utilisée faute de date documentaire plus fiable.");
  }

  const dateToken = toSelectedToken(best.candidate);
  return {
    dateToken,
    selected: best.candidate,
    candidates,
    confidence: Math.min(100, Math.round(best.score)),
    reasons: [
      ...best.candidate.reasons,
      ...(best.candidate.precision === "school-year"
        ? [`Année scolaire ${best.candidate.token} ramenée au millésime ${dateToken}.`]
        : [])
    ],
    warnings: uniqueStrings([...best.candidate.warnings, ...warnings])
  };
}

function toSelectedToken(candidate: DateCandidate): string {
  if (candidate.precision === "school-year") {
    return candidate.token.slice(0, 4);
  }

  return candidate.token;
}

function fallback(candidates: DateCandidate[], warnings: string[]): SelectedDateToken {
  return {
    dateToken: FALLBACK_TOKEN,
    candidates,
    confidence: 5,
    reasons: [],
    warnings
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
