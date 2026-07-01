// @ts-nocheck
import type { SoaRow } from "./types";

/** Collapse whitespace so labels and values split across PDF lines still match. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

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

/** Map any 3-letter prefix (case-insensitive) → 0-based month index. */
const MONTH_PREFIX_MAP: Record<string, number> = Object.fromEntries(
  MONTH_ABBR.map((m, i) => [m.toUpperCase(), i]),
);

/**
 * Attempt to parse a raw date string from any bank's PDF into a JS Date.
 * Returns null if no known format matches.
 *
 * Supported inputs (examples):
 *   "12 January 2026"      – Metrobank (D MonthFull YYYY)
 *   "4 March 2026"         – Metrobank
 *   "JAN 04 2026"          – RCBC (MMM DD YYYY)
 *   "JANUARY 07,2026"      – BPI OCR (MonthFull D,YYYY)
 *   "FEBRUARY 08,2026"     – BPI OCR
 *   "Jan 23, 2026"         – Unionbank (MMM D, YYYY) — already target format
 *   "JANUARY 27,2026"      – BPI OCR
 *   "Feb 09, 2026"         – Unionbank
 *   "02/09/2026"           – numeric MM/DD/YYYY or DD/MM/YYYY fallback
 */
function parseDateRaw(s: string): Date | null {
  const t = s.trim().replace(/\s+/g, " ");

  // "D MonthFull YYYY" or "D MonthAbbr YYYY"  e.g. "12 January 2026" / "4 Mar 2026"
  const dayMonthYear = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dayMonthYear) {
    const day = Number.parseInt(dayMonthYear[1]!, 10);
    const mon = MONTH_PREFIX_MAP[dayMonthYear[2]!.slice(0, 3).toUpperCase()];
    const year = Number.parseInt(dayMonthYear[3]!, 10);
    if (mon !== undefined) {
      const d = new Date(year, mon, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  // "MonthFull DD,YYYY" or "MonthAbbr DD, YYYY"  e.g. "JANUARY 07,2026" / "Jan 23, 2026"
  const monthDayYear = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})$/);
  if (monthDayYear) {
    const mon = MONTH_PREFIX_MAP[monthDayYear[1]!.slice(0, 3).toUpperCase()];
    const day = Number.parseInt(monthDayYear[2]!, 10);
    const year = Number.parseInt(monthDayYear[3]!, 10);
    if (mon !== undefined) {
      const d = new Date(year, mon, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  // "MM/DD/YYYY" or "DD/MM/YYYY" — try as MM/DD first; if month > 12, swap
  const numeric = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (numeric) {
    const a = Number.parseInt(numeric[1]!, 10);
    const b = Number.parseInt(numeric[2]!, 10);
    const year = Number.parseInt(numeric[3]!, 10);
    const mon = a <= 12 ? a - 1 : b - 1;
    const day = a <= 12 ? b : a;
    const d = new Date(year, mon, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Normalizes any bank date string to "Mon DD, YYYY" (e.g. "Jan 03, 2026").
 * Returns the original string unchanged if it cannot be parsed.
 */
function normalizeDisplayDate(s: string): string {
  if (!s || s === "—") return s;
  const d = parseDateRaw(s);
  if (!d) return s;
  const mon = MONTH_ABBR[d.getMonth()];
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${mon} ${day}, ${year}`;
}

/** Title-case ALL CAPS due labels (e.g. PLS PAY IMMEDIATELY → Pls Pay Immediately). */
function formatRawDueLabel(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || t === "—") return t;
  if (parseDateRaw(t)) return normalizeDisplayDate(t);
  if (t === t.toUpperCase() && /[A-Z]{2,}/.test(t)) {
    return t.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
  }
  return t;
}

/**
 * When Payment Due Date is prose (e.g. "PLS PAY IMMEDIATELY") instead of a calendar date.
 */
function extractRawPaymentDueValue(flat: string): string {
  const patterns = [
    /Payment\s+Due\s+Date\s*:\s*([^:]+?)(?=\s+Statement\s+Balance|\s+Minimum\s+Amount|\s+Total\s+Amount|\s+Points\s+Earned|\s+Credit\s+Limit|\s+Overlimit|$)/i,
    /PAYMENT\s+DUE\s+DATE\s+TOTAL\s+AMOUNT\s+DUE\s+MINIMUM\s+AMOUNT\s+DUE\s+([A-Za-z0-9][^₱]*?)(?=₱|\bP\s*[\d,.]|\s+PHP|\s+PAYMENT\s+INSTRUCTIONS|$)/i,
  ];
  for (const re of patterns) {
    const m = flat.match(re);
    if (!m?.[1]) continue;
    const raw = m[1].replace(/\s+/g, " ").trim();
    if (raw && !parseDateRaw(raw)) return raw;
  }
  return "";
}

function pickFirst(regexes: RegExp[], text: string): string {
  const flat = flatten(text);
  for (const re of regexes) {
    const m = flat.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

/** Peso amounts: avoid matching a lone "1" from "1 day after" etc. */
const PESO = "(?:PHP|Php|₱|\\bP\\b)";
const AMOUNT = "([\\d]{1,3}(?:,[\\d]{3})*(?:\\.[\\d]{2})?|[\\d]+\\.[\\d]{2})";

/** Non-capturing: avoids breaking outer capture groups in compound RegExps. */
const RCBC_MMM = "(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";

const RCBC_MONTH_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function parseRcbcMmmDate(s: string): Date | null {
  const m = s.match(
    /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2})\s+(\d{4})$/i,
  );
  if (!m) return null;
  const mon = RCBC_MONTH_INDEX[m[1]!.toUpperCase()];
  if (mon === undefined) return null;
  const day = Number.parseInt(m[2]!, 10);
  const year = Number.parseInt(m[3]!, 10);
  const d = new Date(year, mon, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Earlier date → statement, later → payment due (typical monthly SOA). */
function orderRcbcStmtDue(
  a: string,
  b: string,
): { statement: string; due: string } {
  const da = parseRcbcMmmDate(a.trim());
  const db = parseRcbcMmmDate(b.trim());
  if (!da || !db) return { statement: a.trim(), due: b.trim() };
  if (da.getTime() <= db.getTime())
    return { statement: a.trim(), due: b.trim() };
  return { statement: b.trim(), due: a.trim() };
}

/**
 * RCBC prints "STATEMENT DATE" and "PAYMENT DUE DATE" on one line; values on the next.
 * PDF order may be stmt then due or swapped — use chronological order when both parse.
 */
function rcbcPairedStatementDueDates(flat: string): {
  statement?: string;
  due?: string;
} {
  const pair = flat.match(
    new RegExp(
      `STATEMENT\\s+DATE\\s+PAYMENT\\s+DUE\\s+DATE\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})`,
      "i",
    ),
  );
  if (pair?.[1] && pair[2]) {
    const o = orderRcbcStmtDue(pair[1], pair[2]);
    return { statement: o.statement, due: o.due };
  }

  const pairRev = flat.match(
    new RegExp(
      `PAYMENT\\s+DUE\\s+DATE\\s+STATEMENT\\s+DATE\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})`,
      "i",
    ),
  );
  if (pairRev?.[1] && pairRev[2]) {
    const o = orderRcbcStmtDue(pairRev[1], pairRev[2]);
    return { statement: o.statement, due: o.due };
  }

  const stmtOnly = flat.match(
    new RegExp(`STATEMENT\\s+DATE\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})`, "i"),
  );
  const dueOnly = flat.match(
    new RegExp(
      `PAYMENT\\s+DUE\\s+DATE\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})`,
      "i",
    ),
  );
  const out: { statement?: string; due?: string } = {};
  if (stmtOnly?.[1]) out.statement = stmtOnly[1].trim();
  if (dueOnly?.[1]) out.due = dueOnly[1].trim();
  if (out.statement && out.due) return out;

  /** Last resort: first two MMM dates in doc (fragile). */
  const re =
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2})\s+(\d{4})\b/gi;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    found.push(`${m[1]} ${m[2]} ${m[3]}`);
    if (found.length >= 2) break;
  }
  if (found.length >= 2) {
    const o = orderRcbcStmtDue(found[0]!, found[1]!);
    return { statement: o.statement, due: o.due };
  }
  if (found.length === 1 && !out.statement) out.statement = found[0];
  return out;
}

/** Metrobank: "4 March 2026" style (full or abbreviated month). */
const METRO_DAY_MONTH_YEAR = "(\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4})";

const METRO_MONTH_PREFIX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function parseMetrobankDayMonthYear(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/i);
  if (!m) return null;
  const day = Number.parseInt(m[1]!, 10);
  const year = Number.parseInt(m[3]!, 10);
  const mon = METRO_MONTH_PREFIX[m[2]!.slice(0, 3).toUpperCase()];
  if (mon === undefined) return null;
  const d = new Date(year, mon, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Statement date is always on or before payment due for a billing cycle. */
function orderMetroStatementDue(
  a: string,
  b: string,
): { statement: string; due: string } {
  const da = parseMetrobankDayMonthYear(a);
  const db = parseMetrobankDayMonthYear(b);
  if (!da || !db) return { statement: a.trim(), due: b.trim() };
  if (da.getTime() <= db.getTime())
    return { statement: a.trim(), due: b.trim() };
  return { statement: b.trim(), due: a.trim() };
}

/**
 * Metrobank: PDF text is often "Statement Date Payment Due Date 4 March 2026 25 March 2026"
 * (both labels, then both values). A plain `payment due date (\\d...)` then wrongly captures
 * the statement date because it is the first date after the label run.
 */
function metrobankPairedStatementDue(flat: string): {
  statement?: string;
  due?: string;
} {
  const d = METRO_DAY_MONTH_YEAR;

  const gridStmtPay = flat.match(
    new RegExp(
      `statement\\s+date\\s+payment\\s+due\\s+date\\s+${d}\\s+${d}`,
      "i",
    ),
  );
  if (gridStmtPay?.[1] && gridStmtPay[2]) {
    const o = orderMetroStatementDue(gridStmtPay[1], gridStmtPay[2]);
    return { statement: o.statement, due: o.due };
  }

  const gridPayStmt = flat.match(
    new RegExp(
      `payment\\s+due\\s+date\\s+statement\\s+date\\s+${d}\\s+${d}`,
      "i",
    ),
  );
  if (gridPayStmt?.[1] && gridPayStmt[2]) {
    const o = orderMetroStatementDue(gridPayStmt[1], gridPayStmt[2]);
    return { statement: o.statement, due: o.due };
  }

  // Two dates immediately after "Payment Due Date" (values stacked wrong for generic regex).
  const payTwo = flat.match(
    new RegExp(`payment\\s+due\\s+date\\s+${d}\\s+${d}`, "i"),
  );
  if (payTwo?.[1] && payTwo[2]) {
    const o = orderMetroStatementDue(payTwo[1], payTwo[2]);
    return { statement: o.statement, due: o.due };
  }

  const stmtDue = flat.match(
    new RegExp(
      `statement\\s+date\\s*[:\\s]+${d}.{1,420}?(?:payment\\s+)?due\\s+date\\s*[:\\s]+${d}`,
      "i",
    ),
  );
  if (stmtDue?.[1] && stmtDue[2]) {
    return { statement: stmtDue[1].trim(), due: stmtDue[2].trim() };
  }
  const dueStmt = flat.match(
    new RegExp(
      `(?:payment\\s+)?due\\s+date\\s*[:\\s]+${d}.{1,420}?statement\\s+date\\s*[:\\s]+${d}`,
      "i",
    ),
  );
  if (dueStmt?.[1] && dueStmt[2]) {
    return { statement: dueStmt[2].trim(), due: dueStmt[1].trim() };
  }
  return {};
}

/** Unionbank often uses "Statement Date:" / "Payment Due Date:" on one screen. */
function unionbankPairedStatementDue(flat: string): {
  statement?: string;
  due?: string;
} {
  const d = "([A-Za-z]{3}\\s+\\d{1,2},?\\s+\\d{4})";
  const sd = flat.match(
    new RegExp(
      `Statement\\s+Date\\s*:\\s*${d}.{1,360}?Payment\\s+Due\\s+Date\\s*:\\s*${d}`,
      "i",
    ),
  );
  if (sd?.[1] && sd[2]) {
    return { statement: sd[1].trim(), due: sd[2].trim() };
  }
  const ds = flat.match(
    new RegExp(
      `Payment\\s+Due\\s+Date\\s*:\\s*${d}.{1,360}?Statement\\s+Date\\s*:\\s*${d}`,
      "i",
    ),
  );
  if (ds?.[1] && ds[2]) {
    return { statement: ds[2].trim(), due: ds[1].trim() };
  }
  const rawPair = flat.match(
    new RegExp(
      `Statement\\s+Date\\s*:\\s*${d}.{0,200}?Payment\\s+Due\\s+Date\\s*:\\s*([^:]+?)(?=\\s+Statement\\s+Balance|\\s+Minimum\\s+Amount|\\s+Total\\s+Amount|$)`,
      "i",
    ),
  );
  if (rawPair?.[1] && rawPair[2]) {
    const due = rawPair[2].trim();
    if (due && !parseDateRaw(due)) {
      return { statement: rawPair[1].trim(), due };
    }
  }
  return {};
}

/** After OCR, normalize punctuation and spaced-out `PHP` before regexes. */
function preprocessBpiOcrText(text: string): string {
  return text
    .replace(/\uFF1A/g, ":")
    .replace(/P\s+H\s+P/gi, "PHP")
    .replace(/(\d),\s+(\d{3})/g, "$1,$2");
}

/** BPI statement line amounts (with or without PHP). */
const BPI_LINE_AMOUNT_CORE = "([\\d]{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+\\.\\d{2})";

function bpiMoneySoonAfter(
  flat: string,
  fromIdx: number,
  window: number,
  opts?: { titleCaseProse?: boolean },
): string {
  const tail = flat.slice(fromIdx, fromIdx + window);
  const withCur =
    tail.match(/(?:PHP|Php|₱)\s*([\d]{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\b/i) ??
    tail.match(/\bP\s*([\d]{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\b/i);
  if (withCur?.[1]) return withCur[1]!.trim();
  if (opts?.titleCaseProse) {
    const commaOnly = tail.match(/\b([\d]{1,3}(?:,\d{3})+\.\d{2})\b/);
    return commaOnly?.[1]?.trim() ?? "";
  }
  const bare = tail.match(new RegExp(`\\b${BPI_LINE_AMOUNT_CORE}\\b`));
  return bare?.[1]?.trim() ?? "";
}

/**
 * BPI OCR often starts with rates/fees prose where "Total Amount Due, applicable…" appears
 * before the real summary. Prefer ALL CAPS labels; then Title Case only when not prose.
 */
function bpiBestMoneyAfterLabel(
  flat: string,
  kind: "total" | "minimum",
): string {
  const caps =
    kind === "total"
      ? /\bTOTAL\s+AMOUNT\s+DUE\b/g
      : /\bMINIMUM\s+AMOUNT\s+DUE\b/g;
  let m: RegExpExecArray | null;
  while ((m = caps.exec(flat)) !== null) {
    const amt = bpiMoneySoonAfter(flat, m.index + m[0].length, 160);
    if (amt) return amt;
  }
  const title =
    kind === "total"
      ? /\bTotal\s+Amount\s+Due\b/gi
      : /\bMinimum\s+Amount\s+Due\b/gi;
  while ((m = title.exec(flat)) !== null) {
    const after = flat.slice(m.index + m[0].length);
    if (/^\s*[,;]\s*[A-Za-z]/.test(after)) continue;
    const amt = bpiMoneySoonAfter(flat, m.index + m[0].length, 120, {
      titleCaseProse: true,
    });
    if (amt) return amt;
  }
  return "";
}

/**
 * BPI / OCR: `FEBRUARY 08,2026`, `MARCH 2,2026` — comma often has no space before year (`08,2026`).
 */
const BPI_DATE_ALT =
  "[A-Za-z]{3,9}\\s+\\d{1,2},?\\s*\\d{4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}";
const BPI_DATE_CAP = `(${BPI_DATE_ALT})`;

/** BPI e-statements / OCR: Title Case labels; `PHP` often reads as `P H P`. */
function bpiPairedStatementDue(flat: string): {
  statement?: string;
  due?: string;
} {
  const d = BPI_DATE_CAP;
  const sd = flat.match(
    new RegExp(
      `Statement\\s+Date\\s*[:\\s]+${d}.{1,400}?(?:Payment\\s+)?Due\\s+Date\\s*[:\\s]+${d}`,
      "i",
    ),
  );
  if (sd?.[1] && sd[2]) {
    return { statement: sd[1].trim(), due: sd[2].trim() };
  }
  const ds = flat.match(
    new RegExp(
      `(?:Payment\\s+)?Due\\s+Date\\s*[:\\s]+${d}.{1,400}?Statement\\s+Date\\s*[:\\s]+${d}`,
      "i",
    ),
  );
  if (ds?.[1] && ds[2]) {
    return { statement: ds[2].trim(), due: ds[1].trim() };
  }
  return {};
}

/** Pesos with thousands separators (RCBC-style). */
const RCBC_AMOUNT = "(\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+\\.\\d{2})";

/**
 * RCBC tables sometimes extract as: both labels, then "P" cells, then both amounts.
 * Total row is above minimum row, so the first amount pair is (total, minimum).
 */
function rcbcTotalFromColumnMajorLabels(flat: string): string {
  const row = new RegExp(
    `TOTAL\\s+BALANCE\\s+DUE\\s+MINIMUM\\s+PAYMENT\\s+DUE\\s+(?:P\\s*){2,}${RCBC_AMOUNT}\\s+${RCBC_AMOUNT}`,
    "i",
  );
  const interleaved = new RegExp(
    `TOTAL\\s+BALANCE\\s+DUE\\s+MINIMUM\\s+PAYMENT\\s+DUE\\s+P\\s*${RCBC_AMOUNT}\\s+P\\s*${RCBC_AMOUNT}`,
    "i",
  );
  const m = flat.match(row) ?? flat.match(interleaved);
  return m?.[1]?.trim() ?? "";
}

/** Amounts in a slice: word-bounded tokens plus P/PHP-prefixed (handles `P1,956,246.60` where `\b` before `1` fails). */
function rcbcMoneyTokensInSlice(slice: string): string[] {
  const out: string[] = [];
  const pesoLed = slice.matchAll(
    /(?:PHP|Php|₱|(?<![A-Za-z])P(?=[\d]))\s*([\d]{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\b/gi,
  );
  for (const m of pesoLed) out.push(m[1]!.trim());
  for (const m of slice.matchAll(new RegExp(`\\b${RCBC_AMOUNT}\\b`, "g"))) {
    out.push(m[1]!.trim());
  }
  return out;
}

/**
 * For every "TOTAL BALANCE DUE" occurrence, take text until the next "MINIMUM PAYMENT DUE"
 * (or a limited span) and return the **largest** money token. The true total is never smaller
 * than the minimum payment on the same summary, and PDF text order sometimes puts the wrong
 * amount first or lets pickFirst capture the minimum as "total".
 */
function rcbcTotalDueSlicesToMin(flat: string): string {
  const totalRe = /\bTOTAL\s+BALANCE\s+DUE\b/gi;
  let bestN = -1;
  let bestStr = "";
  let tm: RegExpExecArray | null;
  while ((tm = totalRe.exec(flat)) !== null) {
    const start = tm.index + tm[0].length;
    const rest = flat.slice(start, start + 600);
    const minPos = rest.search(/\bMINIMUM\s+PAYMENT\s+DUE\b/i);
    const slice = minPos >= 0 ? rest.slice(0, minPos) : rest;
    for (const raw of rcbcMoneyTokensInSlice(slice)) {
      const n = Number.parseFloat(raw.replace(/,/g, ""));
      if (Number.isFinite(n) && n > bestN) {
        bestN = n;
        bestStr = raw;
      }
    }
  }
  return bestStr;
}

/**
 * Merge regex pick + layout-specific captures; choose the **maximum** numeric candidate.
 * Fixes cases where pickFirst matched MINIMUM as TOTAL or the first amount in a slice was wrong.
 */
function rcbcPickBestTotalDue(flat: string, pickFallback: string): string {
  const candidates = [
    pickFallback.trim(),
    rcbcTotalFromColumnMajorLabels(flat),
    rcbcTotalDueSlicesToMin(flat),
  ];
  let bestN = -1;
  let bestStr = "";
  for (const s of candidates) {
    if (!s || s === "—") continue;
    const n = Number.parseFloat(s.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (n > bestN) {
      bestN = n;
      bestStr = s;
    }
  }
  return bestStr;
}

/** When both labels appear before both amounts, generic MINIMUM…P regex can capture the total. */
function rcbcResolveMinimumDue(text: string, existing: string): string {
  const flat = flatten(text);
  const row = new RegExp(
    `TOTAL\\s+BALANCE\\s+DUE\\s+MINIMUM\\s+PAYMENT\\s+DUE\\s+(?:P\\s*){2,}${RCBC_AMOUNT}\\s+${RCBC_AMOUNT}`,
    "i",
  ).exec(flat);
  if (row?.[2]) return row[2].trim();

  const interleaved = new RegExp(
    `TOTAL\\s+BALANCE\\s+DUE\\s+MINIMUM\\s+PAYMENT\\s+DUE\\s+P\\s*${RCBC_AMOUNT}\\s+P\\s*${RCBC_AMOUNT}`,
    "i",
  ).exec(flat);
  if (interleaved?.[2]) return interleaved[2].trim();

  return existing;
}

function minimumPatterns(issuerId: string): RegExp[] {
  const id = issuerId.toLowerCase();
  const specific: RegExp[] = [];
  if (id === "rcbc") {
    specific.push(
      new RegExp(`MINIMUM\\s+PAYMENT\\s+DUE\\s+${PESO}\\s*${AMOUNT}`, "i"),
      /MINIMUM\s+PAYMENT\s+DUE\s+P\s*([\d,]+\.?\d*)/i,
    );
  }
  if (id === "metrobank") {
    specific.push(
      new RegExp(`Minimum\\s+Amount\\s+Due\\s+${PESO}\\s*${AMOUNT}`, "i"),
    );
  }
  if (id === "unionbank") {
    specific.push(
      /Minimum\s+Amount\s+Due\s*:\s*PHP\s*([\d,]+\.?\d*)/i,
      /MINIMUM\s+AMOUNT\s+DUE\s+([\d,]+\.?\d*)/i,
    );
  }
  if (id === "bpi") {
    specific.push(
      new RegExp(`MINIMUM\\s+AMOUNT\\s+DUE\\s+${BPI_LINE_AMOUNT_CORE}`),
      /Minimum\s+Amount\s+Due\s*:\s*PHP\s*([\d,]+\.?\d*)/i,
      /Minimum\s+Amount\s+Due\s*:\s*P\s*H\s*P\s*([\d,]+\.?\d*)/i,
      /Minimum\s+Amount\s+Due\s+PHP\s*([\d,]+\.?\d*)/i,
    );
  }
  const generic: RegExp[] = [
    new RegExp(`minimum\\s+payment\\s+due\\s+${PESO}\\s*${AMOUNT}`, "i"),
    new RegExp(`minimum\\s+amount\\s+due\\s+${PESO}\\s*${AMOUNT}`, "i"),
    new RegExp(`min\\.?\\s+due\\s+${PESO}\\s*${AMOUNT}`, "i"),
  ];
  return [...specific, ...generic];
}

function totalPatterns(issuerId: string): RegExp[] {
  const id = issuerId.toLowerCase();
  const specific: RegExp[] = [];
  if (id === "rcbc") {
    // Avoid \bP\b: some extractions yield "P" immediately before digits (no space).
    specific.push(
      new RegExp(
        `TOTAL\\s+BALANCE\\s+DUE\\s+(?:PHP|Php|₱|\\sP|P)\\s*${AMOUNT}`,
        "i",
      ),
      new RegExp(`TOTAL\\s+BALANCE\\s+DUE\\s+P\\s*${AMOUNT}`, "i"),
    );
  }
  if (id === "metrobank") {
    specific.push(
      new RegExp(`Total\\s+Amount\\s+Due\\s+${PESO}\\s*${AMOUNT}`, "i"),
    );
  }
  if (id === "unionbank") {
    specific.push(
      /Statement\s+Balance\s*:\s*PHP\s*([\d,]+\.?\d*)/i,
      /TOTAL\s+AMOUNT\s+DUE\s+([\d,]+\.?\d*)/i,
    );
  }
  if (id === "bpi") {
    specific.push(
      new RegExp(`TOTAL\\s+AMOUNT\\s+DUE\\s+${BPI_LINE_AMOUNT_CORE}`),
      /Total\s+Amount\s+Due\s*:\s*PHP\s*([\d,]+\.?\d*)/i,
      /Total\s+Amount\s+Due\s*:\s*P\s*H\s*P\s*([\d,]+\.?\d*)/i,
      /Total\s+Amount\s+Due\s+PHP\s*([\d,]+\.?\d*)/i,
    );
  }
  /**
   * Generic: require currency right after label so we never capture "1" from
   * "total amount due 1 day after the statement date".
   */
  const safeGeneric: RegExp[] = [
    new RegExp(`total\\s+amount\\s+due\\s+${PESO}\\s*${AMOUNT}`, "i"),
    new RegExp(`current\\s+balance\\s+${PESO}\\s*${AMOUNT}`, "i"),
    new RegExp(`outstanding\\s+balance\\s+${PESO}\\s*${AMOUNT}`, "i"),
  ];
  return [...specific, ...safeGeneric];
}

function statementDatePatterns(issuerId: string): RegExp[] {
  const id = issuerId.toLowerCase();
  const specific: RegExp[] = [];
  if (id === "rcbc") {
    specific.push(
      new RegExp(`STATEMENT\\s+DATE\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})`, "i"),
    );
  }
  if (id === "unionbank") {
    specific.push(/Statement\s+Date\s*:\s*([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i);
  }
  if (id === "bpi") {
    specific.push(
      new RegExp(`Statement\\s+Date\\s*[:]?\s*${BPI_DATE_CAP}`, "i"),
      new RegExp(`STATEMENT\\s+DATE\\s+${BPI_DATE_CAP}`, "i"),
    );
  }
  const metroMessy =
    /statement\s+date\s+(?:\S+\s+){0,6}?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i;
  const generic: RegExp[] = [
    /statement\s+date\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    metroMessy,
    /statement\s*(?:date|period)\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    new RegExp(`statement\\s*date\\s*[:\\s]*${BPI_DATE_CAP}`, "i"),
    /billing\s*date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  ];
  return [...specific, ...generic];
}

function dueDatePatterns(issuerId: string): RegExp[] {
  const id = issuerId.toLowerCase();
  const specific: RegExp[] = [];
  if (id === "rcbc") {
    specific.push(
      new RegExp(
        `PAYMENT\\s+DUE\\s+DATE\\s+(${RCBC_MMM}\\s+\\d{2}\\s+\\d{4})`,
        "i",
      ),
    );
  }
  if (id === "unionbank") {
    specific.push(
      /Payment\s+Due\s+Date\s*:\s*([A-Za-z]{3}\s+\d{1,2},?\s*\d{4})/i,
      /PAYMENT\s+DUE\s+DATE\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i,
      /([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\b/,
    );
  }
  if (id === "bpi") {
    specific.push(
      new RegExp(`Payment\\s+Due\\s+Date\\s*[:]?\s*${BPI_DATE_CAP}`, "i"),
      new RegExp(`PAYMENT\\s+DUE\\s+DATE\\s+${BPI_DATE_CAP}`, "i"),
      new RegExp(`Due\\s+Date\\s*[:]?\s*${BPI_DATE_CAP}`, "i"),
    );
  }
  const generic: RegExp[] = [
    /payment\s+due\s+date\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    /payment\s*due\s*date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /payment\s*due\s*date\s*[:\s]*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    /due\s*date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /due\s*date\s*[:\s]*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    new RegExp(`due\\s*date\\s*[:\\s]*${BPI_DATE_CAP}`, "i"),
    /please\s*pay\s*by\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  ];
  return [...specific, ...generic];
}

/**
 * Bank SOA PDFs differ; patterns are ordered issuer-specific first.
 * BPI often ships SOAs where extractable “text” is empty or gibberish (image pages,
 * vector outlines, or custom/subset fonts — glyphs on screen ≠ Unicode strings we can regex).
 */
export type ParseSoaTextOptions = {
  /** Set when BPI text came from Tesseract OCR (affects parse note wording). */
  bpiFromOcr?: boolean;
};

export function parseSoaText(
  bankLabel: string,
  issuerId: string,
  cardLast4: string,
  subject: string,
  messageId: string,
  pdfFileName: string,
  text: string,
  options?: ParseSoaTextOptions,
): SoaRow {
  if (issuerId.toLowerCase() === "bpi" && options?.bpiFromOcr) {
    text = preprocessBpiOcrText(text);
  }
  let minimumDue = pickFirst(minimumPatterns(issuerId), text);
  let totalDue = pickFirst(totalPatterns(issuerId), text);
  let statementDate: string;
  let dueDate: string;

  if (issuerId.toLowerCase() === "metrobank") {
    const flat = flatten(text);
    const combined = flat.match(
      /Total\s+Amount\s+Due\s+Minimum\s+Amount\s+Due\s+PHP\s*([\d,]+\.?\d*)\s+PHP\s*([\d,]+\.?\d*)/i,
    );
    if (combined) {
      totalDue = combined[1]!;
      minimumDue = combined[2]!;
    }
    const md = metrobankPairedStatementDue(flat);
    statementDate =
      md.statement || pickFirst(statementDatePatterns(issuerId), text);
    dueDate = md.due || pickFirst(dueDatePatterns(issuerId), text);
  } else {
    statementDate = pickFirst(statementDatePatterns(issuerId), text);
    dueDate = pickFirst(dueDatePatterns(issuerId), text);
  }

  if (issuerId.toLowerCase() === "rcbc") {
    const flat = flatten(text);
    totalDue = rcbcPickBestTotalDue(flat, totalDue);
    minimumDue = rcbcResolveMinimumDue(text, minimumDue);
    const rcbcDates = rcbcPairedStatementDueDates(flat);
    if (rcbcDates.statement) statementDate = rcbcDates.statement;
    if (rcbcDates.due) dueDate = rcbcDates.due;
  }

  if (issuerId.toLowerCase() === "unionbank") {
    const ub = unionbankPairedStatementDue(flatten(text));
    if (ub.statement) statementDate = ub.statement;
    if (ub.due) dueDate = ub.due;
  }

  if (!dueDate) {
    const rawDue = extractRawPaymentDueValue(flatten(text));
    if (rawDue) dueDate = rawDue;
  }

  if (issuerId.toLowerCase() === "bpi") {
    const flat = flatten(text);
    const bp = bpiPairedStatementDue(flat);
    if (!statementDate && bp.statement) statementDate = bp.statement;
    if (!dueDate && bp.due) dueDate = bp.due;
    if (!totalDue) {
      const m = flat.match(
        /Total\s+Amount\s+Due\s*:?\s*(?:PHP|P\s*H\s*P|Php)\s*([\d,]+\.\d{2}|\d+\.\d{2})/i,
      );
      if (m?.[1]) totalDue = m[1].trim();
    }
    if (!minimumDue) {
      const m = flat.match(
        /Minimum\s+Amount\s+Due\s*:?\s*(?:PHP|P\s*H\s*P|Php)\s*([\d,]+\.\d{2}|\d+\.\d{2})/i,
      );
      if (m?.[1]) minimumDue = m[1].trim();
    }
    if (!totalDue) totalDue = bpiBestMoneyAfterLabel(flat, "total");
    if (!minimumDue) minimumDue = bpiBestMoneyAfterLabel(flat, "minimum");
  }

  const missing: string[] = [];
  if (!minimumDue) missing.push("minimum due");
  if (!totalDue) missing.push("total due");
  if (!statementDate) missing.push("statement date");
  if (!dueDate) missing.push("due date");

  const bpiManyMissing =
    issuerId.toLowerCase() === "bpi" &&
    flatten(text).length > 0 &&
    missing.length >= 3;

  return {
    bankLabel,
    issuerId,
    cardLast4,
    sourceEmailSubject: subject,
    sourceMessageId: messageId,
    pdfFileName,
    minimumDue: minimumDue || "—",
    totalDue: totalDue || "—",
    statementDate: normalizeDisplayDate(statementDate || "—"),
    dueDate: formatRawDueLabel(dueDate || "—"),
    parseNotes:
      bpiManyMissing && options?.bpiFromOcr
        ? "BPI: OCR text did not match parsers. BPI_OCR_DEBUG=1 saves raw OCR under data/output/YYYY-MM/. Try BPI_OCR_DUAL=1 or BPI_OCR_PSM=4|6|11; see docs/SETUP.md for Preview/ocrmypdf."
        : bpiManyMissing
          ? "BPI: PDF has no usable text layer (custom fonts / images). Set BPI_OCR=1 in .env, or enter totals manually."
          : missing.length > 0
            ? `Could not detect: ${missing.join(", ")}.`
            : undefined,
  };
}
