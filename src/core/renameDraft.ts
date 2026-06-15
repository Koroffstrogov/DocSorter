import path from "node:path";

const WINDOWS_FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

export interface RenameDraftInput {
  originalName: string;
  title?: string;
  category?: string;
  documentDate?: string;
}

export interface RenameDraft {
  originalName: string;
  proposedName: string;
  changed: boolean;
  warnings: string[];
}

export function isRenameDraftInput(value: unknown): value is RenameDraftInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.originalName === "string" &&
    isOptionalString(candidate.title) &&
    isOptionalString(candidate.category) &&
    isOptionalString(candidate.documentDate)
  );
}

export function buildRenameDraft(input: RenameDraftInput): RenameDraft {
  const originalName = path.win32.basename(input.originalName.trim());
  const parsed = path.win32.parse(originalName);
  const extension = sanitizeExtension(parsed.ext);
  const fallbackBaseName = normalizeSegment(parsed.name) || "document";
  const warnings: string[] = [];
  const segments: string[] = [];

  const date = normalizeDate(input.documentDate);
  if (input.documentDate?.trim() && !date) {
    warnings.push("Date ignored: expected YYYY-MM-DD.");
  }

  if (date) {
    segments.push(date);
  }

  const category = normalizeSegment(input.category);
  if (category) {
    segments.push(category);
  }

  const title = normalizeSegment(input.title);
  if (title) {
    segments.push(title);
  } else {
    segments.push(fallbackBaseName);
    warnings.push("Title missing: original base name kept.");
  }

  const baseName = avoidReservedWindowsName(segments.join(" - ")) || "document";
  const proposedName = `${baseName}${extension}`;

  return {
    originalName,
    proposedName,
    changed: originalName !== proposedName,
    warnings
  };
}

export function normalizeSegment(value: string | undefined): string {
  return avoidReservedWindowsName(
    (value ?? "")
      .replace(WINDOWS_FORBIDDEN_CHARS, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 120)
  );
}

function normalizeDate(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10) === trimmed ? trimmed : "";
}

function sanitizeExtension(extension: string): string {
  const normalized = extension.replace(WINDOWS_FORBIDDEN_CHARS, "").trim();
  return normalized.startsWith(".") ? normalized : "";
}

function avoidReservedWindowsName(value: string): string {
  if (!RESERVED_WINDOWS_NAMES.has(value.toUpperCase())) {
    return value;
  }

  return `${value} document`;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
