import type { DueEntryRow } from "@/server/services/due-entry-query.service";
import type { ParsedReceipt } from "@/lib/receipts/parsed-receipt";
import { receiptRequiresTotalDue } from "@/lib/receipts/payment-threshold";

export type MarkPaidResult =
  | {
      ok: true;
      entry: DueEntryRow;
      remindersSuppressed: number;
      calendarUpdated: number;
      calendarError?: string;
    }
  | { ok: false; reason: "not_found"; cardLast4: string; monthYM: string }
  | {
      ok: false;
      reason: "ambiguous";
      matches: DueEntryRow[];
      cardLast4: string;
      monthYM: string;
    };

export type MarkUnpaidResult =
  | {
      ok: true;
      entry: DueEntryRow;
      remindersRestored: number;
      calendarUpdated: number;
      calendarError?: string;
      receiptsRemoved?: number;
    }
  | { ok: false; reason: "not_found"; cardLast4: string; monthYM: string }
  | {
      ok: false;
      reason: "ambiguous";
      matches: DueEntryRow[];
      cardLast4: string;
      monthYM: string;
    }
  | {
      ok: false;
      reason: "already_unpaid";
      cardLast4: string;
      monthYM: string;
    };

export type ReceiptPayResult =
  | {
      ok: true;
      entry: DueEntryRow;
      amountPaid: number;
      amountRaw: string;
      minimumDueValue: number;
      totalDueValue: number;
      belowTotalDue: boolean;
      remindersSuppressed: number;
      calendarUpdated: number;
      calendarError?: string;
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
      matches: DueEntryRow[];
      parsed: ParsedReceipt;
    }
  | {
      ok: false;
      reason: "amount_below_minimum";
      entry: DueEntryRow;
      amountPaid: number;
      amountRaw: string;
      minimumDueValue: number;
      parsed: ParsedReceipt;
    };

function cardLabel(entry: DueEntryRow): string {
  return entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`;
}

function formatPeso(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `PHP ${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  return `${monthNames[idx] ?? m[2]} ${m[1]}`;
}

export function buildPaidConfirmationMessage(result: MarkPaidResult): string {
  if (!result.ok) {
    if (result.reason === "not_found") {
      return (
        `❌ *No entry found*\n\n` +
        `Card \`****${result.cardLast4}\` has no due record for *${result.monthYM}*.\n` +
        `Make sure the SOA has been processed first.`
      );
    }
    const bullets = result.matches
      .map((m) => `• ${cardLabel(m)} — due ${m.dueDate}`)
      .join("\n");
    return (
      `⚠️ *Multiple cards matched* \`****${result.cardLast4}\` in *${result.monthYM}*:\n\n` +
      `${bullets}\n\n` +
      `Resend with issuer in the dashboard.`
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
    const bullets = result.matches
      .map((m) => `• ${cardLabel(m)} — due ${m.dueDate}`)
      .join("\n");
    return (
      `⚠️ *Multiple cards matched* \`****${result.cardLast4}\` in *${result.monthYM}*:\n\n` +
      `${bullets}\n\n` +
      `Use the dashboard to disambiguate.`
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
      const threshold = receiptRequiresTotalDue() ? "total" : "minimum";
      return (
        `❌ *Payment not confirmed*\n\n` +
        `*${cardLabel(result.entry)}*\n` +
        `• Due: ${result.entry.dueDate}\n` +
        `• Amount paid: ${formatPeso(result.amountPaid)}\n` +
        `• Min due: ${result.entry.minimumDue} · Total due: ${result.entry.totalDue}\n\n` +
        `Amount is below the ${threshold} due.\n\n` +
        `If this is wrong, mark it manually:\n\`${result.entry.cardLast4} - ${ymToCaption(result.entry.dueDateYmd)} - paid\``
      );
    }
  }
}

export function receiptPaymentFailureMessage(
  result: Extract<ReceiptPayResult, { ok: false }>,
): string {
  switch (result.reason) {
    case "no_card_detected":
      return "Card number not detected on receipt";
    case "no_amount_detected":
      return "Payment amount not detected on receipt";
    case "no_due_entry":
      return "No matching due entry — run SOA first";
    case "already_paid":
      return "This card is already marked paid";
    case "ambiguous_card":
      return "Multiple cards match — add a month caption";
    case "amount_below_minimum":
      return "Amount is below minimum due";
    default:
      return "Could not confirm payment";
  }
}
