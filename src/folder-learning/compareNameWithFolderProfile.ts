import {
  generateDocumentNameV2,
  normalizeNameBlock,
  type NamingInputV2
} from "../naming/documentNameV2";
import type { FolderNamingProfile } from "./folderNamingProfile";
import { parseFolderFileName, type ParsedFolderFileName } from "./parseFolderFileName";

export type FolderProfileNameRecommendation = "keep-ai" | "prefer-folder-profile" | "manual-review";

export interface FolderProfileNameComparison {
  aiName: string;
  alignedName?: string;
  recommendation: FolderProfileNameRecommendation;
  confidence: number;
  appliedChanges: string[];
  reasons: string[];
  warnings: string[];
}

export interface FolderProfileNameFields {
  dateToken: string;
  target: string;
  documentType: string;
  issuer?: string;
  detail?: string;
}

export type CompareNameWithFolderProfileInput =
  | {
      aiName: string;
      extension?: string;
      profile: FolderNamingProfile;
    }
  | {
      aiFields: FolderProfileNameFields;
      extension: string;
      profile: FolderNamingProfile;
    };

interface ResolvedAiName {
  aiName: string;
  input: NamingInputV2 | null;
  warnings: string[];
}

export function compareNameWithFolderProfile(
  input: CompareNameWithFolderProfileInput
): FolderProfileNameComparison {
  const profile = input.profile;
  const resolved = resolveAiName(input);
  const reasons: string[] = [];
  const warnings = [...resolved.warnings];

  if (profile.status === "none") {
    return {
      aiName: resolved.aiName,
      recommendation: "keep-ai",
      confidence: 40,
      appliedChanges: [],
      reasons: ["Aucun profil de nommage exploitable dans le dossier."],
      warnings
    };
  }

  if (!resolved.input) {
    return {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 20,
      appliedChanges: [],
      reasons: ["Le nom IA final ne respecte pas la convention attendue."],
      warnings
    };
  }

  if (profile.status === "weak") {
    const notableDivergence = detectNotableDivergence(resolved.input, profile);
    return {
      aiName: resolved.aiName,
      recommendation: notableDivergence ? "manual-review" : "keep-ai",
      confidence: notableDivergence ? 35 : 45,
      appliedChanges: [],
      reasons: notableDivergence
        ? ["Profil faible et écart notable avec le nom IA : validation manuelle préférable."]
        : ["Profil faible : le nom IA est conservé."],
      warnings: notableDivergence
        ? [...warnings, "Profil trop faible pour proposer un alignement automatique."]
        : warnings
    };
  }

  if (profile.dominantDatePrecision === "mixed") {
    return {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 40,
      appliedChanges: [],
      reasons: ["Le profil contient plusieurs précisions de date."],
      warnings: [...warnings, "Convention de date hétérogène : alignement non appliqué."]
    };
  }

  const documentTypeCheck = checkDocumentTypeCompatibility(resolved.input, profile);
  if (!documentTypeCheck.compatible) {
    return {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 45,
      appliedChanges: [],
      reasons: ["Le type documentaire IA diffère du type dominant du dossier."],
      warnings: [...warnings, documentTypeCheck.warning]
    };
  }

  const alignment = buildAlignedInput(resolved.input, profile);
  warnings.push(...alignment.warnings);
  reasons.push(...alignment.reasons);

  if (alignment.appliedChanges.length === 0) {
    const needsManualReview = alignment.warnings.some((warning) => warning.includes("alignement non appliqué"));
    return {
      aiName: resolved.aiName,
      recommendation: needsManualReview ? "manual-review" : "keep-ai",
      confidence: needsManualReview ? 50 : profile.status === "strong" ? 85 : 65,
      appliedChanges: [],
      reasons: [
        needsManualReview
          ? "Le profil contient une dominante hétérogène : validation manuelle recommandée."
          : "Le nom IA est déjà compatible avec le profil du dossier.",
        ...reasons
      ],
      warnings
    };
  }

  const generated = generateDocumentNameV2(alignment.input);
  warnings.push(
    ...generated.messages
      .filter((message) => message.level !== "info")
      .map((message) => message.message)
  );

  if (!generated.isValid) {
    return {
      aiName: resolved.aiName,
      recommendation: "manual-review",
      confidence: 30,
      appliedChanges: alignment.appliedChanges,
      reasons: ["Un alignement a été tenté mais le nom généré n'est pas valide."],
      warnings
    };
  }

  return {
    aiName: resolved.aiName,
    alignedName: generated.filename,
    recommendation: profile.status === "strong" ? "prefer-folder-profile" : "manual-review",
    confidence: profile.status === "strong" ? 85 : 65,
    appliedChanges: alignment.appliedChanges,
    reasons: [
      profile.status === "strong"
        ? "Profil fort : la convention du dossier est recommandée."
        : "Profil moyen : un nom aligné est proposé pour validation.",
      ...reasons
    ],
    warnings
  };
}

function resolveAiName(input: CompareNameWithFolderProfileInput): ResolvedAiName {
  if ("aiFields" in input) {
    const generated = generateDocumentNameV2({
      ...input.aiFields,
      extension: input.extension
    });
    return {
      aiName: generated.filename,
      input: generated.isValid ? generated.normalizedInput : null,
      warnings: generated.messages
        .filter((message) => message.level !== "info")
        .map((message) => message.message)
    };
  }

  const parsed = parseFolderFileName(input.aiName);
  if (!parsed) {
    return {
      aiName: input.aiName,
      input: null,
      warnings: ["Nom IA non compatible avec la convention DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext."]
    };
  }

  return {
    aiName: input.aiName,
    input: namingInputFromParsedName(parsed, input.extension),
    warnings: []
  };
}

function namingInputFromParsedName(parsed: ParsedFolderFileName, extensionOverride: string | undefined): NamingInputV2 {
  return {
    dateToken: parsed.dateToken,
    target: parsed.target,
    documentType: parsed.documentType,
    ...(parsed.issuer ? { issuer: parsed.issuer } : {}),
    ...(parsed.detail ? { detail: parsed.detail } : {}),
    extension: extensionOverride ?? parsed.extension
  };
}

function detectNotableDivergence(input: NamingInputV2, profile: FolderNamingProfile): boolean {
  if (profile.dominantDatePrecision === "mixed") {
    return true;
  }

  if (
    profile.dominantDocumentType &&
    normalizeNameBlock(profile.dominantDocumentType) !== normalizeNameBlock(input.documentType)
  ) {
    return true;
  }

  if (profile.dominantTarget && normalizeNameBlock(profile.dominantTarget) !== normalizeNameBlock(input.target)) {
    return true;
  }

  if (
    profile.dominantIssuer &&
    normalizeNameBlock(profile.dominantIssuer) !== normalizeNameBlock(input.issuer)
  ) {
    return true;
  }

  return profile.detailUsage === "never" && Boolean(normalizeNameBlock(input.detail));
}

function checkDocumentTypeCompatibility(
  input: NamingInputV2,
  profile: FolderNamingProfile
): { compatible: true } | { compatible: false; warning: string } {
  if (!profile.dominantDocumentType) {
    return {
      compatible: false,
      warning: "Aucun type documentaire dominant : alignement non appliqué."
    };
  }

  if (normalizeNameBlock(profile.dominantDocumentType) !== normalizeNameBlock(input.documentType)) {
    return {
      compatible: false,
      warning: `Type dominant du dossier différent : ${profile.dominantDocumentType}.`
    };
  }

  return { compatible: true };
}

function buildAlignedInput(
  input: NamingInputV2,
  profile: FolderNamingProfile
): {
  input: NamingInputV2;
  appliedChanges: string[];
  reasons: string[];
  warnings: string[];
} {
  const aligned: NamingInputV2 = { ...input };
  const appliedChanges: string[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  const dateToken = alignDatePrecision(input.dateToken, profile.dominantDatePrecision);
  if (dateToken !== input.dateToken) {
    aligned.dateToken = dateToken;
    appliedChanges.push("datePrecision");
    reasons.push("Précision de date alignée sur les noms existants du dossier.");
  } else if (profile.dominantDatePrecision === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateToken)) {
    warnings.push("Impossible d'augmenter la précision de date sans inventer de jour.");
  }

  if (canApplyDominantTarget(profile) && profile.dominantTarget) {
    const target = normalizeNameBlock(profile.dominantTarget);
    if (target && target !== normalizeNameBlock(input.target)) {
      aligned.target = target;
      appliedChanges.push("target");
      reasons.push("Cible alignée sur la cible dominante du dossier.");
    }
  } else if (
    profile.dominantTarget &&
    normalizeNameBlock(profile.dominantTarget) !== normalizeNameBlock(input.target)
  ) {
    warnings.push("Cible dominante hétérogène : alignement non appliqué.");
  }

  if (canApplyDominantIssuer(profile) && profile.dominantIssuer) {
    const issuer = normalizeNameBlock(profile.dominantIssuer);
    if (issuer && issuer !== normalizeNameBlock(input.issuer)) {
      aligned.issuer = issuer;
      appliedChanges.push("issuer");
      reasons.push("Émetteur aligné sur l'émetteur dominant du dossier.");
    }
  } else if (
    profile.dominantIssuer &&
    normalizeNameBlock(profile.dominantIssuer) !== normalizeNameBlock(input.issuer)
  ) {
    warnings.push("Émetteur dominant hétérogène : alignement non appliqué.");
  }

  if (profile.detailUsage === "never" && normalizeNameBlock(input.detail)) {
    aligned.detail = undefined;
    appliedChanges.push("detail");
    reasons.push("Détail supprimé car les noms existants du dossier n'utilisent pas ce bloc.");
  }

  if (profile.detailUsage === "sometimes" && normalizeNameBlock(input.detail)) {
    warnings.push("Usage du détail irrégulier dans le dossier : validation manuelle recommandée.");
  }

  return {
    input: aligned,
    appliedChanges,
    reasons,
    warnings
  };
}

function alignDatePrecision(
  dateToken: string,
  precision: FolderNamingProfile["dominantDatePrecision"]
): string {
  if (precision === "month" && /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateToken)) {
    return dateToken.slice(0, 7);
  }

  if (precision === "year" && /^(19|20)\d{2}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(dateToken)) {
    return dateToken.slice(0, 4);
  }

  return dateToken;
}

function canApplyDominantTarget(profile: FolderNamingProfile): boolean {
  return !hasProfileWarning(profile, "cible");
}

function canApplyDominantIssuer(profile: FolderNamingProfile): boolean {
  return !hasProfileWarning(profile, "émetteur");
}

function hasProfileWarning(profile: FolderNamingProfile, signal: string): boolean {
  const normalizedSignal = normalizeNameBlock(signal);
  return profile.warnings.some((warning) => normalizeNameBlock(warning).includes(normalizedSignal));
}
