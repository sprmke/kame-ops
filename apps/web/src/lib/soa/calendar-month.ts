export type CalendarMonth = {
  month: number;
  year: number;
};

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_PREFIX_MAP: Record<string, number> = Object.fromEntries(
  MONTH_ABBR.map((m, i) => [m.toUpperCase(), i]),
);

export function calendarMonthOrdinal(value: CalendarMonth): number {
  return value.year * 12 + value.month;
}

export function isValidCalendarMonth(
  value: { month: number; year: number } | null | undefined,
): value is CalendarMonth {
  if (!value) return false;
  return (
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12 &&
    Number.isInteger(value.year) &&
    value.year >= 1990 &&
    value.year <= 2100
  );
}

export function isMonthInInclusiveRange(
  value: CalendarMonth,
  from: CalendarMonth,
  to: CalendarMonth,
): boolean {
  const n = calendarMonthOrdinal(value);
  return n >= calendarMonthOrdinal(from) && n <= calendarMonthOrdinal(to);
}

export function enumerateCalendarMonths(
  from: CalendarMonth,
  to: CalendarMonth,
): CalendarMonth[] {
  if (calendarMonthOrdinal(from) > calendarMonthOrdinal(to)) return [];
  const out: CalendarMonth[] = [];
  let year = from.year;
  let month = from.month;
  while (calendarMonthOrdinal({ month, year }) <= calendarMonthOrdinal(to)) {
    out.push({ month, year });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function dateIfValid(
  year: number,
  monthIndex0: number,
  day: number,
): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(day)) return null;
  if (monthIndex0 < 0 || monthIndex0 > 11) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, monthIndex0, day);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== monthIndex0 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/** Parse a bank/AI statement or due date. Rejects overflow dates (e.g. Feb 31). */
export function parseSoaCalendarDate(s: string): Date | null {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t || t === "—") return null;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return dateIfValid(
      Number.parseInt(iso[1]!, 10),
      Number.parseInt(iso[2]!, 10) - 1,
      Number.parseInt(iso[3]!, 10),
    );
  }

  const dayMonthYear = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dayMonthYear) {
    const mon = MONTH_PREFIX_MAP[dayMonthYear[2]!.slice(0, 3).toUpperCase()];
    if (mon !== undefined) {
      return dateIfValid(
        Number.parseInt(dayMonthYear[3]!, 10),
        mon,
        Number.parseInt(dayMonthYear[1]!, 10),
      );
    }
  }

  const monthDayYear = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})$/);
  if (monthDayYear) {
    const mon = MONTH_PREFIX_MAP[monthDayYear[1]!.slice(0, 3).toUpperCase()];
    if (mon !== undefined) {
      return dateIfValid(
        Number.parseInt(monthDayYear[3]!, 10),
        mon,
        Number.parseInt(monthDayYear[2]!, 10),
      );
    }
  }

  const numeric = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (numeric) {
    const a = Number.parseInt(numeric[1]!, 10);
    const b = Number.parseInt(numeric[2]!, 10);
    const year = Number.parseInt(numeric[3]!, 10);
    const mon = a <= 12 ? a - 1 : b - 1;
    const day = a <= 12 ? b : a;
    return dateIfValid(year, mon, day);
  }

  return null;
}

const DISPLAY_ABBR = MONTH_ABBR;

/** Normalize to `Mon DD, YYYY` so persist/due upsert can parse it. */
export function formatSoaDisplayDate(
  value: string | null | undefined,
): string | null {
  if (!value || value.trim() === "—") return null;
  const d = parseSoaCalendarDate(value);
  if (!d) return null;
  const mon = DISPLAY_ABBR[d.getMonth()]!;
  const day = String(d.getDate()).padStart(2, "0");
  return `${mon} ${day}, ${d.getFullYear()}`;
}

export function closestMonthInRange(
  detected: CalendarMonth | null,
  months: CalendarMonth[],
): CalendarMonth | null {
  if (months.length === 0) return null;
  if (!detected) return months[0]!;
  const target = calendarMonthOrdinal(detected);
  return months.reduce((best, month) => {
    const bestDelta = Math.abs(calendarMonthOrdinal(best) - target);
    const delta = Math.abs(calendarMonthOrdinal(month) - target);
    return delta < bestDelta ? month : best;
  });
}

/** Billing month from a statement/due display date (statement date preferred). */
export function calendarMonthFromSoaDate(
  date: string | null | undefined,
): CalendarMonth | null {
  if (!date) return null;
  const d = parseSoaCalendarDate(date);
  if (!d) return null;
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/**
 * Prefer statement date; fall back to due date. Due dates often land in the
 * following calendar month, so statement date is the billing-period signal.
 */
export function calendarMonthFromSoaDates(
  statementDate: string | null | undefined,
  dueDate?: string | null,
): CalendarMonth | null {
  return (
    calendarMonthFromSoaDate(statementDate) ?? calendarMonthFromSoaDate(dueDate)
  );
}

/** Coerce AI/ISO dates to `Mon DD, YYYY` when parseable. */
export function normalizeSoaDisplayDate(value: string): string {
  return formatSoaDisplayDate(value) ?? value;
}
