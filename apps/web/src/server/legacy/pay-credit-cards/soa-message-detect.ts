// @ts-nocheck
import type { gmail_v1 } from 'googleapis';
import { MONTH_NAMES_LONG, MONTH_NAMES_SHORT } from './month';

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function partHasPdfAttachment(
  part: gmail_v1.Schema$MessagePart | undefined,
): boolean {
  if (!part) return false;
  const mime = (part.mimeType ?? '').toLowerCase();
  const name = (part.filename ?? '').toLowerCase();
  if (part.body?.attachmentId) {
    if (name.endsWith('.pdf')) return true;
    if (mime === 'application/pdf') return true;
  }
  if (part.parts) {
    for (const p of part.parts) {
      if (partHasPdfAttachment(p)) return true;
    }
  }
  return false;
}

/** Heuristic: subject lines for configured bank SOA emails. */
export function subjectLooksLikeCreditCardSoa(subject: string): boolean {
  const s = subject.toLowerCase();
  if (/statement\s+of\s+account|\bsoa\b|\bmsoa\b/.test(s)) return true;
  if (/metrobank.*credit|\bcredit\s+card.*metrobank/.test(s)) return true;
  if (/rcbc|flex\s+visa|estatement|e-statement/.test(s)) return true;
  if (/bpi.*credit\s+card|electronic\s+statement/.test(s)) return true;
  if (/rewards\s+visa|unionbank|union\s+bank/.test(s)) return true;
  return false;
}

const LONG_ALT = MONTH_NAMES_LONG.join('|');
const SHORT_ALT = MONTH_NAMES_SHORT.join('|');
const MONTH_YEAR_RE = new RegExp(
  `\\b(${LONG_ALT}|${SHORT_ALT})\\s+(20\\d{2})\\b`,
  'gi',
);
const YEAR_MONTH_RE = new RegExp(
  `\\b(20\\d{2})\\s+(${LONG_ALT}|${SHORT_ALT})\\b`,
  'gi',
);

function monthTokenToCliMonth(token: string): string | null {
  const t = token.trim();
  const idxLong = MONTH_NAMES_LONG.findIndex(
    (m) => m.toLowerCase() === t.toLowerCase(),
  );
  if (idxLong >= 0) return String(idxLong + 1);
  const idxShort = MONTH_NAMES_SHORT.findIndex(
    (m) => m.toLowerCase() === t.toLowerCase(),
  );
  if (idxShort >= 0) return String(idxShort + 1);
  return null;
}

/**
 * Best-effort statement period from the email subject (matches "March 2026", "2026 March", etc.).
 */
export function inferStatementMonthYearFromSubject(
  subject: string,
): { month: string; year: string } | null {
  MONTH_YEAR_RE.lastIndex = 0;
  let best: { month: string; year: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = MONTH_YEAR_RE.exec(subject)) !== null) {
    const mo = monthTokenToCliMonth(m[1] ?? '');
    const yr = m[2];
    if (mo && yr) best = { month: mo, year: yr };
  }
  if (best) return best;

  YEAR_MONTH_RE.lastIndex = 0;
  while ((m = YEAR_MONTH_RE.exec(subject)) !== null) {
    const yr = m[1];
    const mo = monthTokenToCliMonth(m[2] ?? '');
    if (mo && yr) best = { month: mo, year: yr };
  }
  return best;
}

/**
 * Fallback period from Gmail internalDate (ms): use that message's calendar month/year in local time.
 */
export function inferStatementMonthYearFromInternalDate(
  internalDate: string | undefined,
): { month: string; year: string } | null {
  if (!internalDate) return null;
  const ms = Number.parseInt(internalDate, 10);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return {
    month: String(d.getMonth() + 1),
    year: String(d.getFullYear()),
  };
}

export type SoaCandidateMessage = {
  messageId: string;
  subject: string;
  month: string;
  year: string;
  periodSource: 'subject' | 'internalDate';
};

export function messageMetadataToSoaCandidate(options: {
  messageId: string;
  payload: gmail_v1.Schema$MessagePart | undefined;
  internalDate: string | undefined;
}): SoaCandidateMessage | null {
  const { messageId, payload, internalDate } = options;
  if (!partHasPdfAttachment(payload)) return null;
  const subject = getHeader(payload?.headers, 'Subject');
  if (!subjectLooksLikeCreditCardSoa(subject)) return null;

  const fromSubject = inferStatementMonthYearFromSubject(subject);
  if (fromSubject) {
    return {
      messageId,
      subject,
      month: fromSubject.month,
      year: fromSubject.year,
      periodSource: 'subject',
    };
  }

  const fromDate = inferStatementMonthYearFromInternalDate(internalDate);
  if (fromDate) {
    return {
      messageId,
      subject,
      month: fromDate.month,
      year: fromDate.year,
      periodSource: 'internalDate',
    };
  }

  return null;
}
