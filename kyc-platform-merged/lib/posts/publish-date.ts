const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

function formatDateOnly(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toStoredPublishedAtIso(dateOnly: string) {
  return `${dateOnly}T12:00:00.000Z`;
}

function buildParsedDate(year: number, month: number, day: number) {
  if (!isValidDateParts(year, month, day)) return null;
  const dateOnly = formatDateOnly(year, month, day);
  return {
    dateOnly,
    iso: toStoredPublishedAtIso(dateOnly),
  };
}

export function parseNaturalDateInput(input: string) {
  const value = input.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}T/i.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return buildParsedDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
    }
  }

  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return buildParsedDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return buildParsedDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  const normalized = value
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  match = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2]];
    if (!month) return null;
    return buildParsedDate(Number(match[3]), month, Number(match[1]));
  }

  match = normalized.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[1]];
    if (!month) return null;
    return buildParsedDate(Number(match[3]), month, Number(match[2]));
  }

  return null;
}

export function normalizePublishedAtInput(input: string | null | undefined) {
  const value = input?.trim() ?? '';
  if (!value) return null;

  const parsed = parseNaturalDateInput(value);
  return parsed?.iso ?? null;
}

export function toDateInputValue(input: string | null | undefined) {
  if (!input) return '';
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}
