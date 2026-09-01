// @ts-nocheck
import { looksGarbled } from "./text-quality";
import type { TransactionLine } from "./types";

const MAX_EXTRACT = 150;
const SKIP_DESC =
  /^(post|tran|date|description|amount|page\s+\d|sale\s+date|important|payment\s+instructions|previous|subtotal|total\b|balance\s+end|\*{3,}|transaction|remarks|months|remaining)/i;

/** RCBC glues "INTEREST CHARGES" + "BALANCE END" + "*** END OF STATEMENT ***" + ending balance on one line. */
function isRcbcFooterOrSummaryDescription(desc: string): boolean {
  const d = desc.trim();
  if (!d) return true;
  if (/\bbalance\s+end\b/i.test(d)) return true;
  if (/\bend\s+of\s+statement\b/i.test(d)) return true;
  if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(d)) return true;
  if (/\bstatement\s+ending\s+balance\b/i.test(d)) return true;
  if (/\bclosing\s+balance\b/i.test(d)) return true;
  return false;
}

const BPI_SUMMARY_ROW =
  /^(previous\s+balance|finance\s+charge|past\s+due|ending\s+balance|unbilled\s+installment)/i;

function cleanLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Metrobank: MM/DD MM/DD ... amount [C] */
function tryMetroLine(line: string): TransactionLine | null {
  const m = line.match(
    /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})C?\s*$/,
  );
  if (!m) return null;
  const desc = m[3]!.trim();
  if (SKIP_DESC.test(desc) || desc.length < 3) return null;
  const credit = line.includes(`${m[4]}C`) || /\dC\s*$/.test(line);
  return {
    date: `${m[1]} / ${m[2]}`,
    description: desc.slice(0, 220),
    amount: credit ? `${m[4]} (CR)` : m[4]!,
  };
}

/** True when the line ends with a peso-style amount (same line as description). */
function lineHasRcbcTrailingAmount(line: string): boolean {
  return /[\d,]+\.\d{2}-?\s*$/.test(line.trim());
}

/** RCBC: DD/MM/YY DD/MM/YY description amount[-] */
function tryRcbcLine(line: string): TransactionLine | null {
  const m = line.match(
    /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})-?\s*$/,
  );
  if (!m) return null;
  const desc = m[3]!.trim();
  if (
    SKIP_DESC.test(desc) ||
    desc.length < 3 ||
    isRcbcFooterOrSummaryDescription(desc)
  ) {
    return null;
  }
  const credit = line.trim().endsWith("-");
  return {
    date: `${m[1]} / ${m[2]}`,
    description: desc.slice(0, 220),
    amount: credit ? `${m[4]} (CR)` : m[4]!,
  };
}

/**
 * RCBC e-statements often extract as two columns: all (post, tran, description) lines,
 * then all amounts in order. Zipping by index fixes off-by-one when text is flattened.
 */
function parseRcbcColumnZip(bodyLines: string[]): TransactionLine[] {
  const full: TransactionLine[] = [];
  const descs: { d1: string; d2: string; desc: string }[] = [];
  const amts: { raw: string; credit: boolean }[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    const fullRow = tryRcbcLine(trimmed);
    if (fullRow) {
      full.push(fullRow);
      continue;
    }

    const descM = trimmed.match(
      /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/i,
    );
    if (descM && !lineHasRcbcTrailingAmount(trimmed)) {
      const desc = descM[3]!.trim();
      if (
        SKIP_DESC.test(desc) ||
        desc.length < 3 ||
        isRcbcFooterOrSummaryDescription(desc)
      ) {
        continue;
      }
      descs.push({ d1: descM[1]!, d2: descM[2]!, desc });
      continue;
    }

    const amtM = trimmed.match(/^([\d,]+\.\d{2})(-?)\s*$/);
    if (amtM) {
      amts.push({ raw: amtM[1]!, credit: amtM[2] === "-" });
    }
  }

  if (full.length > 0) return [];
  if (descs.length === 0 || descs.length !== amts.length) return [];

  return descs.map((d, i) => ({
    date: `${d.d1} / ${d.d2}`,
    description: d.desc.slice(0, 220),
    amount: amts[i]!.credit ? `${amts[i]!.raw} (CR)` : amts[i]!.raw,
  }));
}

/**
 * When newlines are lost, descriptions are still separated by the next DD/MM/YY pair;
 * amounts run after the last description.
 */
function parseRcbcFlatColumnMajor(flat: string): TransactionLine[] {
  const normalized = flat.replace(/\s+/g, " ").trim();
  const pair = /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+/g;
  const hits: { d1: string; d2: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pair.exec(normalized)) !== null) {
    hits.push({
      d1: m[1]!,
      d2: m[2]!,
      start: m.index,
      end: pair.lastIndex,
    });
  }
  if (hits.length === 0) return [];

  const descs: string[] = [];
  for (let i = 0; i < hits.length - 1; i++) {
    descs.push(normalized.slice(hits[i]!.end, hits[i + 1]!.start).trim());
  }
  const tail = normalized.slice(hits[hits.length - 1]!.end).trim();
  const tailM = tail.match(/^(.+?)\s+((?:[\d,]+\.\d{2}-?\s*)+)$/);
  if (!tailM) return [];
  descs.push(tailM[1]!.trim());

  const amts: { raw: string; credit: boolean }[] = [];
  const amtStr = tailM[2]!.trim();
  for (const am of amtStr.matchAll(/([\d,]+\.\d{2})(-?)(?=\s|$)/g)) {
    amts.push({ raw: am[1]!, credit: am[2] === "-" });
  }

  if (descs.length !== amts.length) return [];

  const out: TransactionLine[] = [];
  for (let i = 0; i < descs.length; i++) {
    const desc = descs[i]!.trim();
    if (
      SKIP_DESC.test(desc) ||
      desc.length < 3 ||
      isRcbcFooterOrSummaryDescription(desc)
    ) {
      return [];
    }
    const { d1, d2 } = hits[i]!;
    const amt = amts[i]!;
    out.push({
      date: `${d1} / ${d2}`,
      description: desc.slice(0, 220),
      amount: amt.credit ? `${amt.raw} (CR)` : amt.raw,
    });
  }
  return out;
}

/** Unionbank: DD/MM/YY DD/MM/YY description [PHP] amount */
function tryUnionLine(line: string): TransactionLine | null {
  const m = line.match(
    /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(?:PHP\s*)?(-?[\d,]+\.\d{2})\s*$/,
  );
  if (!m) return null;
  const desc = m[3]!.trim();
  if (SKIP_DESC.test(desc) || desc.length < 3) return null;
  if (/^SUBTOTAL|^TOTAL\b/i.test(desc)) return null;
  const raw = m[4]!;
  return {
    date: `${m[1]} / ${m[2]}`,
    description: desc.slice(0, 220),
    amount: raw.startsWith("-") ? `${raw.slice(1)} (CR)` : raw,
  };
}

/** First 3 letters of English month (OCR uses full names: January, February, …). */
function isBpiMonthWord(w: string): boolean {
  const t = w.toLowerCase().replace(/[^a-z]/g, "");
  if (t.length < 3) return false;
  const p3 = t.slice(0, 3);
  const prefixes = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  return prefixes.includes(p3);
}

/**
 * BPI OCR: `January 25  January 26  Payment - Thank You  -33,919.02` or merchant lines with `: 06/24` in description.
 */
function tryBpiLine(line: string): TransactionLine | null {
  const m = line.match(
    /^([A-Za-z]{3,12})\s+(\d{1,2})\s+([A-Za-z]{3,12})\s+(\d{1,2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*$/i,
  );
  if (!m) return null;
  if (!isBpiMonthWord(m[1]!) || !isBpiMonthWord(m[3]!)) return null;
  const desc = m[5]!.trim();
  if (SKIP_DESC.test(desc) || desc.length < 3) return null;
  if (BPI_SUMMARY_ROW.test(desc)) return null;
  const raw = m[6]!;
  const credit = raw.startsWith("-");
  const amt = credit ? raw.slice(1) : raw;
  return {
    date: `${m[1]} ${m[2]} / ${m[3]} ${m[4]}`,
    description: desc.slice(0, 220),
    amount: credit ? `${amt} (CR)` : amt,
  };
}

function extractBpi(lines: string[]): TransactionLine[] {
  const out: TransactionLine[] = [];
  let inTable = false;
  for (const line of lines) {
    if (
      /transaction\s+.{0,24}post\s+date/i.test(line) &&
      /description/i.test(line)
    ) {
      inTable = true;
      continue;
    }
    if (inTable && /installment\s+balance\s+summar/i.test(line)) {
      inTable = false;
      continue;
    }
    if (inTable) {
      const row = tryBpiLine(line);
      if (row && out.length < MAX_EXTRACT) out.push(row);
    }
  }
  if (out.length > 0) return dedupeTransactions(out);
  for (const line of lines) {
    const row = tryBpiLine(line);
    if (row && out.length < MAX_EXTRACT) out.push(row);
  }
  return dedupeTransactions(out);
}

function dedupeTransactions(rows: TransactionLine[]): TransactionLine[] {
  const seen = new Set<string>();
  const out: TransactionLine[] = [];
  for (const r of rows) {
    const key = `${r.date}|${r.description}|${r.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function extractMetrobank(lines: string[]): TransactionLine[] {
  const out: TransactionLine[] = [];
  let inTable = false;
  for (const line of lines) {
    if (
      /post\s+date|transaction\s+details|tran\s+date.*description/i.test(line)
    ) {
      inTable = true;
      continue;
    }
    if (
      inTable &&
      /^(total\s+amount\s+due\s*(?:PHP\s*)?[\d,]|summary\s+of\s+outstanding|end\s+of\s+statement|\*{4,}end|months\s+remaining)/i.test(
        line,
      )
    ) {
      inTable = false;
      continue;
    }
    if (inTable) {
      const row = tryMetroLine(line);
      if (row && out.length < MAX_EXTRACT) out.push(row);
    }
  }
  if (out.length > 0) return dedupeTransactions(out);
  for (const line of lines) {
    const row = tryMetroLine(line);
    if (row && out.length < MAX_EXTRACT) out.push(row);
  }
  return dedupeTransactions(out);
}

/** Amount on same line as description (older / alternate RCBC text layout). */
function extractRcbcSingleLineMode(lines: string[]): TransactionLine[] {
  const out: TransactionLine[] = [];
  let inTable = false;
  for (const line of lines) {
    if (
      /sale\s+date|post\s+date.*description|previous\s+statement\s+balance/i.test(
        line,
      )
    ) {
      inTable = true;
      continue;
    }
    if (inTable) {
      if (
        /^(balance\s+end|total\s+balance|account\s+summary|\*{3,}\s*end)/i.test(
          line,
        )
      ) {
        inTable = false;
        continue;
      }
      const datedRest = line.match(
        /^\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/\d{2}\s+(.+)/i,
      );
      if (datedRest?.[1] && isRcbcFooterOrSummaryDescription(datedRest[1])) {
        inTable = false;
        continue;
      }
      const row = tryRcbcLine(line);
      if (row && out.length < MAX_EXTRACT) out.push(row);
    }
  }
  if (out.length > 0) return dedupeTransactions(out);
  for (const line of lines) {
    const row = tryRcbcLine(line);
    if (row && out.length < MAX_EXTRACT) out.push(row);
  }
  return dedupeTransactions(out);
}

function extractRcbc(lines: string[]): TransactionLine[] {
  const body: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (
      /sale\s+date|post\s+date.*description|previous\s+statement\s+balance/i.test(
        line,
      )
    ) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (
      /^(balance\s+end|total\s+balance|account\s+summary|\*{3,}\s*end)/i.test(
        line,
      )
    ) {
      inTable = false;
      continue;
    }
    const datedRest = line.match(
      /^\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/\d{2}\s+(.+)/i,
    );
    if (datedRest?.[1] && isRcbcFooterOrSummaryDescription(datedRest[1])) {
      inTable = false;
      continue;
    }
    body.push(line);
  }

  const zipped = parseRcbcColumnZip(body);
  if (zipped.length > 0) return dedupeTransactions(zipped);

  return extractRcbcSingleLineMode(lines);
}

function extractUnionbank(lines: string[]): TransactionLine[] {
  const out: TransactionLine[] = [];
  let inTable = false;
  for (const line of lines) {
    if (/transaction\s+date.*amount|previous\s+balance\s+P/i.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /\*{10,}\s*end\s+of\s+statement/i.test(line)) {
      inTable = false;
      continue;
    }
    if (inTable) {
      const row = tryUnionLine(line);
      if (row && out.length < MAX_EXTRACT) out.push(row);
    }
  }
  if (out.length > 0) return dedupeTransactions(out);
  for (const line of lines) {
    const row = tryUnionLine(line);
    if (row && out.length < MAX_EXTRACT) out.push(row);
  }
  return dedupeTransactions(out);
}

function fallbackFromFlat(id: string, text: string): TransactionLine[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const out: TransactionLine[] = [];
  if (id === "metrobank") {
    const re =
      /(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(.{10,180}?)\s+(-?[\d,]+\.\d{2})C?\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null && out.length < MAX_EXTRACT) {
      const desc = m[3]!.trim();
      if (SKIP_DESC.test(desc)) continue;
      const credit = m[0]!.includes(`${m[4]}C`);
      out.push({
        date: `${m[1]} / ${m[2]}`,
        description: desc.slice(0, 220),
        amount: credit ? `${m[4]} (CR)` : m[4]!,
      });
    }
  } else if (id === "rcbc") {
    const col = parseRcbcFlatColumnMajor(flat);
    if (col.length > 0) return dedupeTransactions(col);
    const re =
      /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.{10,180}?)\s+([\d,]+\.\d{2})-?\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null && out.length < MAX_EXTRACT) {
      const desc = m[3]!.trim();
      if (SKIP_DESC.test(desc) || isRcbcFooterOrSummaryDescription(desc))
        continue;
      const credit = m[0]!.trim().endsWith("-");
      out.push({
        date: `${m[1]} / ${m[2]}`,
        description: desc.slice(0, 220),
        amount: credit ? `${m[4]} (CR)` : m[4]!,
      });
    }
  } else if (id === "unionbank") {
    const re =
      /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.{10,180}?)\s+(?:PHP\s*)?(-?[\d,]+\.\d{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null && out.length < MAX_EXTRACT) {
      const desc = m[3]!.trim();
      if (SKIP_DESC.test(desc)) continue;
      const raw = m[4]!;
      out.push({
        date: `${m[1]} / ${m[2]}`,
        description: desc.slice(0, 220),
        amount: raw.startsWith("-") ? `${raw.slice(1)} (CR)` : raw,
      });
    }
  } else if (id === "bpi") {
    const re =
      /([A-Za-z]{3,12})\s+(\d{1,2})\s+([A-Za-z]{3,12})\s+(\d{1,2})\s+(.{4,200}?)\s+(-?[\d,]+\.\d{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null && out.length < MAX_EXTRACT) {
      if (!isBpiMonthWord(m[1]!) || !isBpiMonthWord(m[3]!)) continue;
      const desc = m[5]!.trim();
      if (SKIP_DESC.test(desc) || BPI_SUMMARY_ROW.test(desc)) continue;
      const raw = m[6]!;
      out.push({
        date: `${m[1]} ${m[2]} / ${m[3]} ${m[4]}`,
        description: desc.slice(0, 220),
        amount: raw.startsWith("-") ? `${raw.slice(1)} (CR)` : raw,
      });
    }
  }
  return dedupeTransactions(out);
}

export function extractTransactions(
  issuerId: string,
  text: string,
): TransactionLine[] {
  const id = issuerId.toLowerCase();

  // Bank-agnostic safety net: if the source text (pdf.js or OCR) is clearly
  // garbled/unusable, don't run bank-specific line regexes over noise — they can
  // occasionally false-positive-match garbage into a bogus "transaction".
  if (looksGarbled(text)) return [];

  const lines = cleanLines(text);

  let rows: TransactionLine[] = [];
  if (id === "metrobank") rows = extractMetrobank(lines);
  else if (id === "rcbc") rows = extractRcbc(lines);
  else if (id === "unionbank") rows = extractUnionbank(lines);
  else if (id === "bpi") {
    rows = extractBpi(lines);
  } else {
    rows = extractMetrobank(lines);
  }

  if (rows.length < 5) {
    const fb = fallbackFromFlat(id, text);
    if (fb.length > rows.length) rows = fb;
  }

  return rows.slice(0, MAX_EXTRACT);
}
