import path from "node:path";

import {
  normalizeNameBlock,
  type NamingInputV2
} from "../naming/documentNameV2";
import type {
  FolderInventoryItem,
  FolderNamingProfile,
  NamingDatePrecision,
  NamingProfileAlignment
} from "./folderInventoryTypes";

interface ParsedV2Name {
  dateToken: string;
  datePrecision: NamingDatePrecision;
  target: string;
  documentType: string;
  issuer?: string;
}

const DOMINANT_RATIO = 0.6;

export function analyzeFolderNamingProfile(item: FolderInventoryItem): FolderNamingProfile {
  const parsed = item.sampleFileNames.map(parseV2FileName).filter(isParsedV2Name);
  if (parsed.length === 0) {
    return {
      analyzedFileCount: item.sampleFileNames.length,
      v2FileCount: 0,
      confidence: 0,
      reasons: [],
      warnings: ["Aucun nom v2 conforme détecté dans le dossier recommandé."]
    };
  }

  const dominantDatePrecision = dominantValue(parsed.map((entry) => entry.datePrecision));
  const dominantTarget = dominantValue(parsed.map((entry) => entry.target));
  const dominantDocumentType = dominantValue(parsed.map((entry) => entry.documentType));
  const dominantIssuer = dominantValue(parsed.map((entry) => entry.issuer).filter(isString));
  const confidenceParts = [
    dominantDatePrecision?.confidence,
    dominantTarget?.confidence,
    dominantDocumentType?.confidence,
    dominantIssuer?.confidence
  ].filter(isNumber);

  return {
    analyzedFileCount: item.sampleFileNames.length,
    v2FileCount: parsed.length,
    ...(dominantDatePrecision ? { dominantDatePrecision: dominantDatePrecision.value } : {}),
    ...(dominantTarget ? { dominantTarget: dominantTarget.value } : {}),
    ...(dominantDocumentType ? { dominantDocumentType: dominantDocumentType.value } : {}),
    ...(dominantIssuer ? { dominantIssuer: dominantIssuer.value } : {}),
    confidence:
      confidenceParts.length > 0
        ? Math.round(confidenceParts.reduce((total, value) => total + value, 0) / confidenceParts.length)
        : 0,
    reasons: [`${parsed.length} nom(s) v2 conforme(s) détecté(s) dans le dossier.`],
    warnings: []
  };
}

export function alignNamingInputWithFolderProfile(
  input: NamingInputV2,
  profile: FolderNamingProfile
): NamingProfileAlignment {
  const warnings: string[] = [];
  const reasons: string[] = [];
  let changed = false;
  const aligned: NamingInputV2 = { ...input };

  if (profile.dominantDatePrecision) {
    const alignedDate = alignDateTokenPrecision(input.dateToken, profile.dominantDatePrecision);
    if (alignedDate !== input.dateToken) {
      aligned.dateToken = alignedDate;
      changed = true;
      reasons.push("Précision de date alignée sur les noms existants du dossier.");
    }
  }

  addDivergenceWarning("cible habituelle différente", input.target, profile.dominantTarget, warnings);
  addDivergenceWarning(
    "type documentaire habituel différent",
    input.documentType,
    profile.dominantDocumentType,
    warnings
  );
  if (input.issuer) {
    addDivergenceWarning("émetteur habituel différent", input.issuer, profile.dominantIssuer, warnings);
  }

  return {
    input: aligned,
    changed,
    reasons,
    warnings
  };
}

function parseV2FileName(fileName: string): ParsedV2Name | null {
  const baseName = path.parse(fileName).name;
  const parts = baseName.split("_").map((part) => normalizeNameBlock(part));
  if (parts.length < 3 || parts.some((part) => !part)) {
    return null;
  }

  const [dateToken, target, documentType, issuer] = parts;
  const datePrecision = detectDatePrecision(dateToken);
  if (datePrecision === "unknown") {
    return null;
  }

  return {
    dateToken,
    datePrecision,
    target,
    documentType,
    ...(issuer ? { issuer } : {})
  };
}

function detectDatePrecision(dateToken: string): NamingDatePrecision {
  if (/^(19|20)\d{2}-[01]\d-[0-3]\d$/.test(dateToken)) {
    return "day";
  }
  if (/^(19|20)\d{2}-[01]\d$/.test(dateToken)) {
    return "month";
  }
  if (/^(19|20)\d{2}$/.test(dateToken)) {
    return "year";
  }

  return "unknown";
}

function alignDateTokenPrecision(dateToken: string, precision: NamingDatePrecision): string {
  if (precision === "month" && /^(19|20)\d{2}-[01]\d-[0-3]\d$/.test(dateToken)) {
    return dateToken.slice(0, 7);
  }

  if (precision === "year" && /^(19|20)\d{2}(-[01]\d(?:-[0-3]\d)?)?$/.test(dateToken)) {
    return dateToken.slice(0, 4);
  }

  return dateToken;
}

function addDivergenceWarning(
  label: string,
  currentValue: string | undefined,
  dominantValueText: string | undefined,
  warnings: string[]
): void {
  if (
    currentValue?.trim() &&
    dominantValueText?.trim() &&
    normalizeNameBlock(currentValue) !== normalizeNameBlock(dominantValueText)
  ) {
    warnings.push(`Divergence avec le profil du dossier : ${label}.`);
  }
}

function dominantValue<T extends string>(values: T[]): { value: T; confidence: number } | null {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0], "fr", { sensitivity: "base" });
  });
  const best = sorted[0];
  if (!best) {
    return null;
  }

  const ratio = best[1] / values.length;
  if (ratio < DOMINANT_RATIO) {
    return null;
  }

  return {
    value: best[0],
    confidence: Math.round(ratio * 100)
  };
}

function isParsedV2Name(value: ParsedV2Name | null): value is ParsedV2Name {
  return value !== null;
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}
