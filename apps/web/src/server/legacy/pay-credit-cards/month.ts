// @ts-nocheck
import type { GmailMonthContext } from "./types";

const LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const SHORT = [
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

/** For subject-line parsing (e.g. new-SOA detection). */
export const MONTH_NAMES_LONG: readonly string[] = LONG;
export const MONTH_NAMES_SHORT: readonly string[] = SHORT;

function parseMonthToken(token: string): number {
  const t = token.trim().toLowerCase();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 12) return n;
    throw new Error(`Invalid month number: ${token}`);
  }
  const idx = LONG.findIndex((m) => m.toLowerCase().startsWith(t));
  if (idx >= 0) return idx + 1;
  const sidx = SHORT.findIndex((m) => m.toLowerCase() === t);
  if (sidx >= 0) return sidx + 1;
  throw new Error(`Unrecognized month: ${token}`);
}

/** Gmail after:/before: use YYYY/M/D (month is 1-based). */
function ymd(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function buildMonthContext(monthArg: string, yearArg: string): GmailMonthContext {
  const year = Number(yearArg);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) {
    throw new Error(`Invalid year: ${yearArg}`);
  }
  const month = parseMonthToken(monthArg);
  const idx = month - 1;
  const lastDayPrevMonth = new Date(year, month - 1, 0);
  const firstDayNextMonth = new Date(year, month, 1);
  return {
    year,
    monthIndex0: idx,
    monthLong: LONG[idx]!,
    monthShort: SHORT[idx]!,
    monthNum2: String(month).padStart(2, "0"),
    afterYMD: ymd(lastDayPrevMonth),
    beforeYMD: ymd(firstDayNextMonth),
  };
}

/** Shift the calendar month used for Gmail date range and query tokens (e.g. `-1` = previous month). */
export function shiftMonthContext(
  base: GmailMonthContext,
  offsetMonths: number
): GmailMonthContext {
  if (offsetMonths === 0) return base;
  const d = new Date(base.year, base.monthIndex0 + offsetMonths, 1);
  return buildMonthContext(String(d.getMonth() + 1), String(d.getFullYear()));
}

/** First day of month as UTC-safe local date for ordering. */
function monthStartUtc(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0, 1).getTime();
}

/**
 * Inclusive list of calendar months from `from` through `to`, chronological order.
 * `from` must not be after `to`.
 */
export function enumerateMonthsInclusive(
  fromMonthArg: string,
  fromYearArg: string,
  toMonthArg: string,
  toYearArg: string
): GmailMonthContext[] {
  const from = buildMonthContext(fromMonthArg, fromYearArg);
  const to = buildMonthContext(toMonthArg, toYearArg);
  const t0 = monthStartUtc(from.year, from.monthIndex0);
  const t1 = monthStartUtc(to.year, to.monthIndex0);
  if (t0 > t1) {
    throw new Error(
      `Invalid range: start ${from.monthLong} ${from.year} is after end ${to.monthLong} ${to.year}`
    );
  }
  const out: GmailMonthContext[] = [];
  let y = from.year;
  let m0 = from.monthIndex0;
  while (monthStartUtc(y, m0) <= t1) {
    out.push(buildMonthContext(String(m0 + 1), String(y)));
    m0++;
    if (m0 > 11) {
      m0 = 0;
      y++;
    }
  }
  return out;
}

/**
 * Last `count` calendar months ending at `anchor` (inclusive), chronological order.
 * `count` must be >= 1.
 */
export function lastNMonthsEndingAt(
  anchorMonthArg: string,
  anchorYearArg: string,
  count: number
): GmailMonthContext[] {
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Invalid --months: need a positive integer, got ${count}`);
  }
  const anchor = buildMonthContext(anchorMonthArg, anchorYearArg);
  const start = new Date(anchor.year, anchor.monthIndex0 - (count - 1), 1);
  return enumerateMonthsInclusive(
    String(start.getMonth() + 1),
    String(start.getFullYear()),
    String(anchor.monthIndex0 + 1),
    String(anchor.year)
  );
}
