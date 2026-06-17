export interface DateTokenParts {
  year: number;
  month?: number;
  day?: number;
  approximate?: boolean;
}

const MONTHS = new Map<string, number>([
  ["janvier", 1],
  ["fevrier", 2],
  ["mars", 3],
  ["avril", 4],
  ["mai", 5],
  ["juin", 6],
  ["juillet", 7],
  ["aout", 8],
  ["septembre", 9],
  ["octobre", 10],
  ["novembre", 11],
  ["decembre", 12]
]);

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export function formatDateToken(parts: DateTokenParts): string | null {
  if (!isPlausibleYear(parts.year)) {
    return null;
  }

  if (parts.approximate) {
    return `${parts.year}-env`;
  }

  if (parts.month !== undefined && !isValidMonth(parts.month)) {
    return null;
  }

  if (parts.day !== undefined) {
    if (parts.month === undefined || !isRealDate(parts.year, parts.month, parts.day)) {
      return null;
    }

    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }

  if (parts.month !== undefined) {
    return `${parts.year}-${pad2(parts.month)}`;
  }

  return `${parts.year}`;
}

export function parseIsoDate(value: string): string | null {
  const trimmed = value.trim();
  const fullDate = trimmed.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (fullDate) {
    return formatDateToken({
      year: Number(fullDate[1]),
      month: Number(fullDate[2]),
      day: Number(fullDate[3])
    });
  }

  const monthDate = trimmed.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/);
  if (monthDate) {
    return formatDateToken({
      year: Number(monthDate[1]),
      month: Number(monthDate[2])
    });
  }

  const year = trimmed.match(/^((?:19|20)\d{2})$/);
  return year ? formatDateToken({ year: Number(year[1]) }) : null;
}

export function parseFrenchDate(value: string): string | null {
  const normalized = normalizeDateText(value);
  const numeric = normalized.match(/^([0-3]?\d)[/-]([01]?\d)[/-]((?:19|20)\d{2})$/);
  if (numeric) {
    return formatDateToken({
      year: Number(numeric[3]),
      month: Number(numeric[2]),
      day: Number(numeric[1])
    });
  }

  const textual = normalized.match(/^([0-3]?\d)\s+([a-z]+)\s+((?:19|20)\d{2})$/);
  if (textual) {
    const month = MONTHS.get(textual[2] ?? "");
    return month
      ? formatDateToken({
          year: Number(textual[3]),
          month,
          day: Number(textual[1])
        })
      : null;
  }

  return null;
}

export function parseMonthToken(value: string): string | null {
  const normalized = normalizeDateText(value);
  const numericMonth = normalized.match(/^(0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})$/);
  if (numericMonth) {
    return formatDateToken({
      year: Number(numericMonth[2]),
      month: Number(numericMonth[1])
    });
  }

  const isoMonth = normalized.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/);
  if (isoMonth) {
    return formatDateToken({
      year: Number(isoMonth[1]),
      month: Number(isoMonth[2])
    });
  }

  const textualMonth = normalized.match(/^([a-z]+)\s+((?:19|20)\d{2})$/);
  if (textualMonth) {
    const month = MONTHS.get(textualMonth[1] ?? "");
    return month
      ? formatDateToken({
          year: Number(textualMonth[2]),
          month
        })
      : null;
  }

  return null;
}

export function normalizeDateText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isPlausibleYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
