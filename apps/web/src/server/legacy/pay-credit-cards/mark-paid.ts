// @ts-nocheck
/**
 * Core logic for marking a credit card payment as paid or un-paid.
 *
 * Called by:
 *   - due-entry.service (web UI mark paid/unpaid)
 *   - app/api/webhooks/telegram (Telegram text or receipt photo)
 *
 * Effects (paid):
 *   1. Marks all pending due-date reminders as "sent" so the daily
 *      send-reminders job stops pinging you.
 *   2. Updates all matching Google Calendar events to show "✅ PAID" and
 *      removes popup reminders.
 *   3. Persists paidAt on the DueEntry.
 *
 * Effects (unpaid):
 *   1. Removes paidAt from the DueEntry so send-reminders resumes.
 *   2. Deletes suppressed reminder fingerprints so they re-fire.
 *   3. Restores Google Calendar events to original title/color/popup.
 */
import { calendarConfig, receiptConfig, remindersConfig } from "./config";
import {
  findDueEntryByCardAndMonth,
  findNearestUnpaidByLast4,
  markDueEntryAsPaid,
  markDueEntryAsUnpaid,
  type DueEntry,
} from "./due-reminders-state";
import {
  markCalendarEventsPaid,
  markCalendarEventsUnpaid,
} from "./google-calendar";
import { log } from "./logger";
import { parseMoneyToNumber, type ParsedReceipt } from "./receipt-utils";

// ─── Month parsing ────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/**
 * Parse a loose "month year" string into "YYYY-MM".
 * Accepts: "april 2026", "apr 2026", "2026-04", "04/2026", "04-2026".
 * Returns null when it cannot be parsed.
 */
export function parseMonthYear(raw: string): string | null {
  const s = raw.trim().toLowerCase();

  const mWord = s.match(/^([a-z]+)\s+(\d{4})$/);
  if (mWord) {
    const mon = MONTH_MAP[mWord[1]!];
    if (!mon) return null;
    return `${mWord[2]}-${String(mon).padStart(2, "0")}`;
  }

  const mIso = s.match(/^(\d{4})-(\d{2})$/);
  if (mIso) return `${mIso[1]}-${mIso[2]}`;

  const mSlash = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mSlash) return `${mSlash[2]}-${mSlash[1]!.padStart(2, "0")}`;

  return null;
}

/**
 * Looser variant of `parseMonthYear` that scans an arbitrary string (e.g. a
 * Telegram photo caption) for the first month/year token it can find.
 * Returns "YYYY-MM" or null.
 */
export function extractMonthYearLoose(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const direct = parseMonthYear(s);
  if (direct) return direct;

  const mWord = s.match(/\b([a-z]{3,9})\s+(\d{4})\b/);
  if (mWord) {
    const mon = MONTH_MAP[mWord[1]!];
    if (mon) return `${mWord[2]}-${String(mon).padStart(2, "0")}`;
  }

  const mIso = s.match(/\b(\d{4})-(\d{2})\b/);
  if (mIso) return `${mIso[1]}-${mIso[2]}`;

  const mSlash = s.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (mSlash) {
    const mo = Number(mSlash[1]);
    if (mo >= 1 && mo <= 12) {
      return `${mSlash[2]}-${String(mo).padStart(2, "0")}`;
    }
  }

  return null;
}

// ─── Telegram message parser ──────────────────────────────────────────────────

/**
 * Parse a Telegram-style paid message: "xxxx - april 2026 - paid"
 * Case-insensitive; separators can be " - ", " – ", or " — ".
 * Returns { cardLast4, monthYM } or null when the format doesn't match.
 */
export function parsePaidMessage(
  text: string,
): { cardLast4: string; monthYM: string } | null {
  const s = text.trim().toLowerCase();
  // Allow any 4-digit sequence as card last-4, then a separator, month+year, separator, "paid".
  const m = s.match(/^(\d{4})\s*[-–—]\s*(.+?)\s*[-–—]\s*paid$/);
  if (!m) return null;
  const cardLast4 = m[1]!;
  const monthYM = parseMonthYear(m[2]!.trim());
  if (!monthYM) return null;
  return { cardLast4, monthYM };
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type MarkPaidResult =
  | {
      ok: true;
      entry: DueEntry;
      remindersSuppressed: number;
      calendarUpdated: number;
      calendarError?: string;
    }
  | { ok: false; reason: "not_found"; cardLast4: string; monthYM: string }
  | {
      ok: false;
      reason: "ambiguous";
      matches: DueEntry[];
      cardLast4: string;
      monthYM: string;
    };

// ─── Core action ─────────────────────────────────────────────────────────────

/**
 * Mark the specified card+month as paid and run the side-effect workflow.
 *
 * @param cardLast4 Last 4 digits of the credit card (e.g. "1234")
 * @param monthYM   Due-date month in YYYY-MM format (e.g. "2026-04")
 * @param skipCalendar Set true to skip Google Calendar updates (e.g. no credentials)
 */
export async function markCardPaid(
  cardLast4: string,
  monthYM: string,
  skipCalendar = false,
): Promise<MarkPaidResult> {
  const found = findDueEntryByCardAndMonth(cardLast4, monthYM);

  if (found === null) {
    return { ok: false, reason: "not_found", cardLast4, monthYM };
  }
  if (Array.isArray(found)) {
    return {
      ok: false,
      reason: "ambiguous",
      matches: found,
      cardLast4,
      monthYM,
    };
  }

  const entry = found;

  // 1. Suppress reminders + persist paidAt.
  const suppressed = markDueEntryAsPaid(entry, remindersConfig.windowDays + 2);

  // 2. Update Google Calendar events.
  let calendarUpdated = 0;
  let calendarError: string | undefined;
  if (!skipCalendar) {
    try {
      const calRes = await markCalendarEventsPaid(
        entry,
        calendarConfig.calendarId,
      );
      calendarUpdated = calRes.updated;
      if (calRes.error) calendarError = calRes.error;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
      log.warn(`Calendar update failed: ${calendarError}`);
    }
  }

  return {
    ok: true,
    entry,
    remindersSuppressed: suppressed,
    calendarUpdated,
    calendarError,
  };
}

// ─── Confirmation message helpers ────────────────────────────────────────────

/** Build a Telegram-friendly confirmation message for a text paid command. */
export function buildPaidConfirmationMessage(result: MarkPaidResult): string {
  if (!result.ok) {
    if (result.reason === "not_found") {
      return (
        `❌ *No entry found*\n\n` +
        `Card \`****${result.cardLast4}\` has no due record for *${result.monthYM}*.\n` +
        `Make sure the SOA has been processed first.`
      );
    }
    const bullets = (
      result as Extract<typeof result, { reason: "ambiguous" }>
    ).matches
      .map((m) => `• ${cardLabel(m)} — due ${m.dueDate}`)
      .join("\n");
    return (
      `⚠️ *Multiple cards matched* \`****${result.cardLast4}\` in *${result.monthYM}*:\n\n` +
      `${bullets}\n\n` +
      `Use the CLI to disambiguate.`
    );
  }

  const entry = result.entry;
  const bullets: string[] = [
    `• Due: ${entry.dueDate}`,
    `• ${result.remindersSuppressed} reminder(s) silenced`,
  ];
  if (result.calendarUpdated > 0) {
    bullets.push(
      `• ${result.calendarUpdated} calendar event(s) marked ✅ PAID`,
    );
  } else if (result.calendarError) {
    bullets.push(`• ⚠️ Calendar skipped: ${result.calendarError}`);
  }

  return (
    `✅ *Payment Marked*\n\n` + `*${cardLabel(entry)}*\n` + bullets.join("\n")
  );
}

// ─── Receipt-image workflow ──────────────────────────────────────────────────

export type ReceiptPayResult =
  | {
      ok: true;
      entry: DueEntry;
      amountPaid: number;
      amountRaw: string;
      minimumDueValue: number;
      totalDueValue: number;
      belowTotalDue: boolean;
      remindersSuppressed: number;
      calendarUpdated: number;
      calendarError?: string;
      /** Set when the caller supplied a caption month/year override. */
      monthYM?: string;
    }
  | { ok: false; reason: "no_card_detected"; parsed: ParsedReceipt }
  | { ok: false; reason: "no_amount_detected"; parsed: ParsedReceipt }
  | {
      ok: false;
      reason: "no_due_entry";
      cardLast4: string;
      monthYM?: string;
      parsed: ParsedReceipt;
    }
  | {
      ok: false;
      reason: "already_paid";
      cardLast4: string;
      parsed: ParsedReceipt;
    }
  | {
      ok: false;
      reason: "ambiguous_card";
      cardLast4: string;
      matches: DueEntry[];
      parsed: ParsedReceipt;
    }
  | {
      ok: false;
      reason: "amount_below_minimum";
      entry: DueEntry;
      amountPaid: number;
      amountRaw: string;
      minimumDueValue: number;
      parsed: ParsedReceipt;
    };

/**
 * Resolve the target DueEntry for a parsed receipt. If the caller provided a
 * caption like "april 2026", use that month; otherwise fall back to the
 * nearest unpaid statement for the card's last-4.
 */
function resolveReceiptEntry(
  cardLast4: string,
  caption: string | undefined,
): {
  entry?: DueEntry;
  matches?: DueEntry[];
  monthYM?: string;
  reason?: "no_due_entry" | "already_paid" | "ambiguous_card";
} {
  const monthYM = caption ? extractMonthYearLoose(caption) : null;

  if (monthYM) {
    const byMonth = findDueEntryByCardAndMonth(cardLast4, monthYM);
    if (byMonth === null) {
      return { reason: "no_due_entry", monthYM };
    }
    if (Array.isArray(byMonth)) {
      return { reason: "ambiguous_card", matches: byMonth, monthYM };
    }
    // When a specific month is requested, honor it even if already paid.
    return { entry: byMonth, monthYM };
  }

  const nearest = findNearestUnpaidByLast4(cardLast4);
  if (nearest === null) {
    return { reason: "no_due_entry" };
  }
  if (nearest === "already_paid") {
    return { reason: "already_paid" };
  }
  if (Array.isArray(nearest)) {
    return { reason: "ambiguous_card", matches: nearest };
  }
  return { entry: nearest };
}

/**
 * Validate a parsed receipt and — if it satisfies the minimum due — run the
 * usual mark-as-paid side effects. Captions (Telegram photo caption) can
 * optionally override the target month.
 *
 * Returns a structured result; no reply formatting happens here.
 */
export async function markCardPaidFromReceipt(
  parsed: ParsedReceipt,
  opts: { caption?: string; skipCalendar?: boolean } = {},
): Promise<ReceiptPayResult> {
  if (!parsed.cardLast4) {
    return { ok: false, reason: "no_card_detected", parsed };
  }
  if (parsed.amount === undefined || !Number.isFinite(parsed.amount)) {
    return { ok: false, reason: "no_amount_detected", parsed };
  }

  const resolved = resolveReceiptEntry(parsed.cardLast4, opts.caption);
  if (resolved.reason === "no_due_entry") {
    return {
      ok: false,
      reason: "no_due_entry",
      cardLast4: parsed.cardLast4,
      monthYM: resolved.monthYM,
      parsed,
    };
  }
  if (resolved.reason === "already_paid") {
    return {
      ok: false,
      reason: "already_paid",
      cardLast4: parsed.cardLast4,
      parsed,
    };
  }
  if (resolved.reason === "ambiguous_card") {
    return {
      ok: false,
      reason: "ambiguous_card",
      cardLast4: parsed.cardLast4,
      matches: resolved.matches ?? [],
      parsed,
    };
  }

  const entry = resolved.entry!;
  const amountPaid = parsed.amount;
  const amountRaw = parsed.amountRaw ?? String(parsed.amount);
  const minimumDueValue = parseMoneyToNumber(entry.minimumDue);
  const totalDueValue = parseMoneyToNumber(entry.totalDue);

  const threshold = receiptConfig.requireTotalDue
    ? totalDueValue
    : minimumDueValue;

  if (!Number.isFinite(threshold) || amountPaid + 0.005 < threshold) {
    return {
      ok: false,
      reason: "amount_below_minimum",
      entry,
      amountPaid,
      amountRaw,
      minimumDueValue,
      parsed,
    };
  }

  const suppressed = markDueEntryAsPaid(entry, remindersConfig.windowDays + 2);

  let calendarUpdated = 0;
  let calendarError: string | undefined;
  if (!opts.skipCalendar) {
    try {
      const calRes = await markCalendarEventsPaid(
        entry,
        calendarConfig.calendarId,
      );
      calendarUpdated = calRes.updated;
      if (calRes.error) calendarError = calRes.error;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
      log.warn(`Calendar update failed: ${calendarError}`);
    }
  }

  const belowTotalDue =
    Number.isFinite(totalDueValue) && amountPaid + 0.005 < totalDueValue;

  return {
    ok: true,
    entry,
    amountPaid,
    amountRaw,
    minimumDueValue,
    totalDueValue,
    belowTotalDue,
    remindersSuppressed: suppressed,
    calendarUpdated,
    calendarError,
    monthYM: resolved.monthYM,
  };
}

function formatPeso(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `PHP ${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function cardLabel(entry: DueEntry): string {
  return entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`;
}

/** Build a Telegram-friendly reply string for a ReceiptPayResult. */
export function buildReceiptConfirmationMessage(
  result: ReceiptPayResult,
): string {
  if (result.ok) {
    const bullets: string[] = [
      `• Card: \`****${result.entry.cardLast4}\``,
      `• Due Date: ${result.entry.dueDate}`,
      `• Amount paid: *${formatPeso(result.amountPaid)}*`,
      `• Min due: ${formatPeso(result.minimumDueValue)}`,
      `• Total due: ${formatPeso(result.totalDueValue)}`,
      `• ${result.remindersSuppressed} reminder(s) silenced`,
    ];
    if (result.calendarUpdated > 0) {
      bullets.push(
        `• ${result.calendarUpdated} calendar event(s) marked as PAID`,
      );
    } else if (result.calendarError) {
      bullets.push(`• ⚠️ Calendar skipped: ${result.calendarError}`);
    }
    if (result.belowTotalDue) {
      bullets.push(
        `\n⚠️ _Amount covers minimum due but balance remains on the card._`,
      );
    }
    return (
      `✅ *Payment Confirmed*\n\n` +
      `*${cardLabel(result.entry)}*\n` +
      bullets.join("\n")
    );
  }

  switch (result.reason) {
    case "no_card_detected":
      return (
        `❌ *Card number not detected*\n\n` +
        `Could not read a credit card number from the receipt.\n\n` +
        `_Details:_\n\`\`\`\n${result.parsed.rawExcerpt}\n\`\`\`\n\n` +
        `You can still mark it manually:\n\`xxxx - month year - paid\``
      );
    case "no_amount_detected":
      return (
        `❌ *Amount not detected*\n\n` +
        `Could not read the payment amount from the receipt.\n\n` +
        `_Details:_\n\`\`\`\n${result.parsed.rawExcerpt}\n\`\`\``
      );
    case "no_due_entry":
      return (
        `❌ *No due record found*\n\n` +
        `Card \`****${result.cardLast4}\`${result.monthYM ? ` for *${result.monthYM}*` : ""} has no pending due entry.\n\n` +
        `Make sure the SOA has been processed first.`
      );
    case "already_paid":
      return (
        `ℹ️ *Already marked as paid*\n\n` +
        `Card \`****${result.cardLast4}\` is already paid — no changes made.\n\n` +
        `• To re-verify a specific month, resend the photo with a caption like \`april 2026\`\n` +
        `• To undo: \`${result.cardLast4} - month year - unpaid\``
      );
    case "ambiguous_card": {
      const bullets = result.matches
        .map((m) => `• ${cardLabel(m)} — due ${m.dueDate}`)
        .join("\n");
      return (
        `⚠️ *Multiple cards matched* \`****${result.cardLast4}\`:\n\n` +
        `${bullets}\n\n` +
        `Resend the photo with a caption like \`april 2026\` to target a specific statement.`
      );
    }
    case "amount_below_minimum": {
      const threshold = receiptConfig.requireTotalDue ? "total" : "minimum";
      return (
        `❌ *Payment not confirmed*\n\n` +
        `*${cardLabel(result.entry)}*\n` +
        `• Due: ${result.entry.dueDate}\n` +
        `• Amount paid: ${formatPeso(result.amountPaid)}\n` +
        `• Min due: ${result.entry.minimumDue} · Total due: ${result.entry.totalDue}\n\n` +
        `Amount is below the ${threshold} due.\n\n` +
        `If this is wrong, mark it manually:\n\`${result.entry.cardLast4} - ${ymToCaption(result.entry.dueDateYMD)} - paid\``
      );
    }
  }
}

function indent(text: string, prefix = "   "): string {
  return text
    .split("\n")
    .map((l) => `${prefix}${l}`)
    .join("\n");
}

function ymToCaption(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})/);
  if (!m) return ymd;
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const idx = Number(m[2]) - 1;
  const name = monthNames[idx] ?? m[2];
  return `${name} ${m[1]}`;
}

// ─── Mark-as-unpaid (reverse) workflow ───────────────────────────────────────

/**
 * Parse a Telegram-style "unpaid" message: "xxxx - april 2026 - unpaid"
 * Same separators and month formats as parsePaidMessage.
 */
export function parseUnpaidMessage(
  text: string,
): { cardLast4: string; monthYM: string } | null {
  const s = text.trim().toLowerCase();
  const m = s.match(/^(\d{4})\s*[-–—]\s*(.+?)\s*[-–—]\s*unpaid$/);
  if (!m) return null;
  const cardLast4 = m[1]!;
  const monthYM = parseMonthYear(m[2]!.trim());
  if (!monthYM) return null;
  return { cardLast4, monthYM };
}

export type MarkUnpaidResult =
  | {
      ok: true;
      entry: DueEntry;
      remindersRestored: number;
      calendarUpdated: number;
      calendarError?: string;
    }
  | { ok: false; reason: "not_found"; cardLast4: string; monthYM: string }
  | {
      ok: false;
      reason: "ambiguous";
      matches: DueEntry[];
      cardLast4: string;
      monthYM: string;
    }
  | {
      ok: false;
      reason: "already_unpaid";
      cardLast4: string;
      monthYM: string;
    };

/**
 * Reverse a mark-as-paid for the specified card + month.
 *
 * @param cardLast4   Last 4 digits of the credit card (e.g. "1234")
 * @param monthYM     Due-date month in YYYY-MM format (e.g. "2026-04")
 * @param skipCalendar Set true to skip Google Calendar updates
 */
export async function markCardUnpaid(
  cardLast4: string,
  monthYM: string,
  skipCalendar = false,
): Promise<MarkUnpaidResult> {
  const found = findDueEntryByCardAndMonth(cardLast4, monthYM);

  if (found === null) {
    return { ok: false, reason: "not_found", cardLast4, monthYM };
  }
  if (Array.isArray(found)) {
    return {
      ok: false,
      reason: "ambiguous",
      matches: found,
      cardLast4,
      monthYM,
    };
  }

  const entry = found;

  if (!entry.paidAt) {
    return { ok: false, reason: "already_unpaid", cardLast4, monthYM };
  }

  // 1. Remove paidAt + restore reminder fingerprints.
  const restored = markDueEntryAsUnpaid(entry, remindersConfig.windowDays + 2);

  // 2. Restore Google Calendar events.
  let calendarUpdated = 0;
  let calendarError: string | undefined;
  if (!skipCalendar) {
    try {
      const calRes = await markCalendarEventsUnpaid(
        entry,
        calendarConfig.calendarId,
      );
      calendarUpdated = calRes.updated;
      if (calRes.error) calendarError = calRes.error;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
      log.warn(`Calendar restore failed: ${calendarError}`);
    }
  }

  return {
    ok: true,
    entry,
    remindersRestored: restored,
    calendarUpdated,
    calendarError,
  };
}

/** Build a Telegram-friendly reply string for a MarkUnpaidResult. */
export function buildUnpaidConfirmationMessage(
  result: MarkUnpaidResult,
): string {
  if (!result.ok) {
    if (result.reason === "not_found") {
      return (
        `❌ *No entry found*\n\n` +
        `Card \`****${result.cardLast4}\` has no due record for *${result.monthYM}*.\n` +
        `Make sure the SOA has been processed first.`
      );
    }
    if (result.reason === "already_unpaid") {
      return (
        `ℹ️ *Already unpaid*\n\n` +
        `Card \`****${result.cardLast4}\` for *${result.monthYM}* is already marked as unpaid — nothing changed.`
      );
    }
    const bullets = (
      result as Extract<typeof result, { reason: "ambiguous" }>
    ).matches
      .map((m) => `• ${cardLabel(m)} — due ${m.dueDate}`)
      .join("\n");
    return (
      `⚠️ *Multiple cards matched* \`****${result.cardLast4}\` in *${result.monthYM}*:\n\n` +
      `${bullets}\n\n` +
      `Use the CLI to disambiguate.`
    );
  }

  const entry = result.entry;
  const bullets: string[] = [
    `• Due: ${entry.dueDate}`,
    `• ${result.remindersRestored} reminder(s) re-enabled`,
  ];
  if (result.calendarUpdated > 0) {
    bullets.push(`• ${result.calendarUpdated} calendar event(s) restored`);
  } else if (result.calendarError) {
    bullets.push(`• ⚠️ Calendar skipped: ${result.calendarError}`);
  }

  return (
    `↩️ *Payment Reverted*\n\n` + `*${cardLabel(entry)}*\n` + bullets.join("\n")
  );
}
