// @ts-nocheck
/**
 * Shared body formatter for due-date notifications.
 *
 * Used by:
 *   - Google Calendar event descriptions (google-calendar.ts)
 *   - Daily Telegram / Slack reminders (send-reminders.ts)
 *
 * Keeping the layout in one place guarantees the two channels stay in sync —
 * if a field like "Interest charges" shows up on Calendar, it also shows up
 * in the Telegram / Slack ping, with the same label and order.
 */
import type { SoaRow, TransactionLine } from "./types";

/**
 * Card line for Calendar + reminder bodies: show bank / nickname plus last 4.
 * If `cardDisplayLabel` is a short name like "BPI" (no digits), append `****xxxx`
 * so the description is never ambiguous across cards from the same issuer.
 */
export function cardLabelForDueBody(
  bankLabel: string,
  cardLast4: string,
  cardDisplayLabel?: string | null
): string {
  const base = (cardDisplayLabel?.trim() || bankLabel).trim();
  if (!cardLast4) return base;
  if (
    base.includes(`****${cardLast4}`) ||
    base.slice(-4) === cardLast4
  ) {
    return base;
  }
  return `${base} ****${cardLast4}`;
}

export type DueBodyInfo = {
  cardLabel: string;
  /** Raw formatted due date, e.g. "Apr 25, 2026". */
  dueDate: string;
  minimumDue: string;
  totalDue: string;
  interestCharges?: string;
  viewSoaLink?: string;
  contactLine?: string;
  /** Full/masked PAN, e.g. "4321 XXXX XXXX 1234". Shown when set in CARDS_JSON.fullPan. */
  fullPan?: string;
};

/** Parse a raw transaction amount string like "1,234.56" or "1,234.56(CR)". */
export function parseTransactionAmount(raw: string): number {
  const n = Number.parseFloat(
    raw.replace(/\(CR\)/gi, "").replace(/,/g, "").trim()
  );
  return Number.isFinite(n) ? n : 0;
}

/**
 * Returns the total of all interest-charge lines, or undefined if there are none.
 * Formatted as "₱X,XXX.XX" when present.
 */
export function formatInterestCharges(
  transactions: TransactionLine[] | undefined
): string | undefined {
  if (!transactions || transactions.length === 0) return undefined;
  const lines = transactions.filter((t) =>
    /interest\s+charges?/i.test(t.description)
  );
  if (lines.length === 0) return undefined;
  const total = lines.reduce(
    (sum, t) => sum + parseTransactionAmount(t.amount),
    0
  );
  return `₱${total.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Build a DueBodyInfo from a parsed SOA row (used at Calendar + state-upsert time). */
export function dueBodyInfoFromSoaRow(
  row: SoaRow,
  viewSoaLink?: string
): DueBodyInfo {
  return {
    cardLabel: cardLabelForDueBody(
      row.bankLabel,
      row.cardLast4,
      row.cardDisplayLabel
    ),
    dueDate: row.dueDate,
    minimumDue: row.minimumDue,
    totalDue: row.totalDue,
    interestCharges: formatInterestCharges(row.transactions),
    viewSoaLink: viewSoaLink && viewSoaLink.trim().length > 0 ? viewSoaLink.trim() : undefined,
    contactLine: row.contactLine?.trim() ? row.contactLine.trim() : undefined,
    fullPan: row.fullPan?.trim() ? row.fullPan.trim() : undefined,
  };
}

export type BuildDueBodyOptions = {
  /**
   * Override the first line. Defaults to `Credit card payment due: <dueDate>`.
   * Used by Calendar's D-0 event which uses "Credit card payment DUE TODAY!".
   */
  headerLine?: string;
};

/**
 * Returns the canonical body lines in the exact order Calendar uses:
 *
 *   Credit card payment due: Apr 25, 2026
 *   Card: BPI ****1234   (last 4 always appended when the display label omits it)
 *   Card number: 4321 XXXX XXXX 1234  (optional — only when CARDS_JSON.fullPan is set)
 *   Minimum due: ₱500.00
 *   Total due: ₱12,345.67
 *   Interest charges: ₱1,234.56     (optional — only when present in transactions)
 *   View SOA: <link>                (optional — only when TELEGRAM_WEB_LINK is set)
 *   Contact: <contactLine>          (optional — only when CARDS_JSON.contactLine is set)
 *
 * Plain text. Platform-specific formatting (Markdown / mrkdwn / urgency headers /
 * call-to-action tips) is layered on top by each caller.
 */
export function buildDueBodyLines(
  info: DueBodyInfo,
  opts: BuildDueBodyOptions = {}
): string[] {
  const lines: string[] = [];
  lines.push(opts.headerLine ?? `Credit card payment due: ${info.dueDate}`);
  lines.push(`Card: ${info.cardLabel}`);
  if (info.fullPan) lines.push(`Card number: ${info.fullPan}`);
  lines.push(`Minimum due: ${info.minimumDue}`);
  lines.push(`Total due: ${info.totalDue}`);
  if (info.interestCharges) lines.push(`Interest charges: ${info.interestCharges}`);
  if (info.viewSoaLink) lines.push(`View SOA: ${info.viewSoaLink}`);
  if (info.contactLine) lines.push(`Contact: ${info.contactLine}`);
  return lines;
}
