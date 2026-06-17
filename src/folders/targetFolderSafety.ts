import { normalizeTargetFolderRelative } from "../naming/targetFolder";

export type TargetFolderSafetyResult =
  | {
      ok: true;
      relativePath: string;
      depth: number;
      warnings: string[];
    }
  | {
      ok: false;
      warning: string;
    };

export function validateTargetFolderOptionPath(relativePath: string): TargetFolderSafetyResult {
  const normalized = normalizeTargetFolderRelative(relativePath);
  if (!normalized.ok || !normalized.value) {
    return {
      ok: false,
      warning: "Option de dossier cible invalide."
    };
  }

  const segments = normalized.value.split("/");
  if (segments.some(hasSensitiveSegment)) {
    return {
      ok: false,
      warning: "Option de dossier cible rejetée : segment sensible probable."
    };
  }

  return {
    ok: true,
    relativePath: normalized.value,
    depth: segments.length,
    warnings: []
  };
}

export function segmentFromAlias(value: string | undefined): string {
  return (value ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export function extractYearSegment(dateToken: string | undefined): string {
  const match = (dateToken ?? "").match(/^(19|20)\d{2}/);
  return match ? match[0] : "";
}

function hasSensitiveSegment(segment: string): boolean {
  const compact = segment.replace(/\D/g, "");
  return (
    /\b(19|20)\d{2}[-/.](0?[1-9]|1[0-2])[-/.]([0-3]?\d)\b/.test(segment) ||
    /[12]\d{12}(?:\d{2})?/.test(compact) ||
    /^(?=.*\d)[A-Za-z0-9]{18,}$/.test(segment.replace(/[-_\s]/g, ""))
  );
}
