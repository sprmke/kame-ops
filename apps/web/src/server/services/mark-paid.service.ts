import { and, eq } from "drizzle-orm";

import { normalizeCardLast4 } from "@/lib/due/normalize";
import { extractMonthYearLoose } from "@/lib/mark-paid/parse-messages";
import type { ParsedReceipt } from "@/lib/receipts/parsed-receipt";
import {
  computeDuePaymentCoverage,
  estimatePaymentSequence,
  isDueFullyPaid,
  parseDueAmounts,
  paymentTargetDue,
  paymentThresholdMet,
  sumReceiptAmounts,
} from "@/lib/receipts/partial-payment";
import {
  parseMoneyToNumber,
  receiptRequiresTotalDue,
} from "@/lib/receipts/payment-threshold";
import { db } from "@/lib/db";
import { creditCards, dueEntries, receipts } from "@/lib/db/schema";

import {
  dueEntryQueryService,
  type DueEntryRow,
} from "./due-entry-query.service";
import { googleCalendarService } from "./google-calendar.service";
import { reminderLogService } from "./reminder-log.service";
import { deleteReceiptsForDueEntry } from "./receipt-cleanup.service";

import type {
  MarkPaidResult,
  MarkUnpaidResult,
  ReceiptPayResult,
} from "@/lib/mark-paid/messages";

export type {
  MarkPaidResult,
  MarkUnpaidResult,
  ReceiptPayResult,
} from "@/lib/mark-paid/messages";

export {
  buildPaidConfirmationMessage,
  buildReceiptConfirmationMessage,
  buildUnpaidConfirmationMessage,
  receiptPaymentFailureMessage,
} from "@/lib/mark-paid/messages";

async function loadReceiptAmountsForDueEntry(
  userId: string,
  dueEntryId: string,
  excludeReceiptId?: string,
): Promise<number[]> {
  const rows = await db.query.receipts.findMany({
    where: and(eq(receipts.userId, userId), eq(receipts.dueEntryId, dueEntryId)),
  });

  return rows
    .filter(
      (row) =>
        row.id !== excludeReceiptId &&
        row.paymentStatus !== "rejected" &&
        row.paymentStatus !== "ai_error",
    )
    .map((row) => {
      if (row.parsedAmount) return Number(row.parsedAmount);
      if (row.parsedAmountRaw) return parseMoneyToNumber(row.parsedAmountRaw);
      return NaN;
    })
    .filter((amount) => Number.isFinite(amount) && amount > 0);
}

function cumulativePaidBeforeNewReceipt(
  entry: DueEntryRow,
  existingAmounts: number[],
): number {
  const receiptSum = sumReceiptAmounts(existingAmounts);
  const recorded = entry.paidAmount ? parseMoneyToNumber(entry.paidAmount) : 0;
  return Math.max(receiptSum, Number.isFinite(recorded) ? recorded : 0);
}

async function findNearestNotFullyPaidByLast4(
  userId: string,
  cardLast4: string,
): Promise<DueEntryRow | DueEntryRow[] | null> {
  const lastNorm = normalizeCardLast4(cardLast4);
  const all = await db.query.dueEntries.findMany({
    where: eq(dueEntries.userId, userId),
  });
  const forCard = all.filter(
    (d) => normalizeCardLast4(d.cardLast4) === lastNorm,
  );
  if (forCard.length === 0) return null;

  const open: DueEntryRow[] = [];
  for (const entry of forCard) {
    const amounts = await loadReceiptAmountsForDueEntry(userId, entry.id);
    const cumulative = cumulativePaidBeforeNewReceipt(entry, amounts);
    const { minimumDueValue, totalDueValue } = parseDueAmounts(entry);
    const coverage = computeDuePaymentCoverage(
      cumulative,
      minimumDueValue,
      totalDueValue,
    );
    if (!isDueFullyPaid(coverage)) {
      open.push(entry);
    }
  }

  if (open.length === 0) return null;
  if (open.length === 1) return open[0]!;

  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = (ymd: string) => {
    const a = new Date(`${ymd}T12:00:00`);
    const b = new Date(`${today}T12:00:00`);
    return Math.round((a.getTime() - b.getTime()) / 86_400_000);
  };

  const byIssuer = new Map<string, DueEntryRow>();
  for (const d of open) {
    const existing = byIssuer.get(d.issuerId);
    if (!existing) {
      byIssuer.set(d.issuerId, d);
      continue;
    }
    const curDist = Math.abs(daysUntil(d.dueDateYmd));
    const prevDist = Math.abs(daysUntil(existing.dueDateYmd));
    if (curDist < prevDist) byIssuer.set(d.issuerId, d);
  }

  const picks = Array.from(byIssuer.values());
  if (picks.length === 1) return picks[0]!;
  return picks;
}

async function applyReceiptToDueEntry(
  userId: string,
  entry: DueEntryRow,
  parsed: ParsedReceipt,
  opts?: {
    skipCalendar?: boolean;
    excludeReceiptId?: string;
  },
): Promise<Extract<ReceiptPayResult, { ok: true }>> {
  const amountPaid = parsed.amount!;
  const amountRaw = parsed.amountRaw ?? String(parsed.amount);
  const { minimumDueValue, totalDueValue } = parseDueAmounts(entry);
  const requireTotalDue = receiptRequiresTotalDue();
  const targetDue = paymentTargetDue(
    minimumDueValue,
    totalDueValue,
    requireTotalDue,
  );

  const existingAmounts = await loadReceiptAmountsForDueEntry(
    userId,
    entry.id,
    opts?.excludeReceiptId,
  );
  const cumulativeBefore = cumulativePaidBeforeNewReceipt(
    entry,
    existingAmounts,
  );
  const cumulativePaid = cumulativeBefore + amountPaid;
  const coverage = computeDuePaymentCoverage(
    cumulativePaid,
    minimumDueValue,
    totalDueValue,
    requireTotalDue,
  );
  const thresholdMet = paymentThresholdMet(coverage);
  const paymentSequence = estimatePaymentSequence(
    [...existingAmounts, amountPaid],
    targetDue,
  );

  let remindersSuppressed = 0;
  let calendarUpdated = 0;
  let calendarError: string | undefined;
  let updatedEntry = entry;

  if (thresholdMet && !entry.paidAt) {
    const effects = await applyPaidSideEffects(userId, entry, {
      skipCalendar: opts?.skipCalendar,
      paidAmount: String(cumulativePaid),
    });
    updatedEntry = effects.entry;
    remindersSuppressed = effects.remindersSuppressed;
    calendarUpdated = effects.calendarUpdated;
    calendarError = effects.calendarError;
  } else if (
    entry.paidAt &&
    cumulativePaid > cumulativeBefore + 0.005
  ) {
    const [refreshed] = await db
      .update(dueEntries)
      .set({ paidAmount: String(cumulativePaid) })
      .where(and(eq(dueEntries.id, entry.id), eq(dueEntries.userId, userId)))
      .returning();
    updatedEntry = refreshed ?? entry;
  } else if (!entry.paidAt && cumulativePaid > 0) {
    const [refreshed] = await db
      .update(dueEntries)
      .set({ paidAmount: String(cumulativePaid) })
      .where(and(eq(dueEntries.id, entry.id), eq(dueEntries.userId, userId)))
      .returning();
    updatedEntry = refreshed ?? entry;
  }

  return {
    ok: true,
    entry: updatedEntry,
    amountPaid,
    amountRaw,
    cumulativePaid,
    minimumDueValue,
    totalDueValue,
    coverage,
    paymentSequence,
    thresholdMet,
    belowTotalDue: coverage !== "full_paid",
    remindersSuppressed,
    calendarUpdated,
    calendarError,
  };
}

async function isDueEntryFullyPaid(
  userId: string,
  entry: DueEntryRow,
): Promise<boolean> {
  const amounts = await loadReceiptAmountsForDueEntry(userId, entry.id);
  const cumulative = cumulativePaidBeforeNewReceipt(entry, amounts);
  const { minimumDueValue, totalDueValue } = parseDueAmounts(entry);
  const coverage = computeDuePaymentCoverage(
    cumulative,
    minimumDueValue,
    totalDueValue,
  );
  return isDueFullyPaid(coverage);
}

async function reminderSuppressWindow(
  userId: string,
  entry: DueEntryRow,
): Promise<number> {
  if (entry.creditCardId) {
    const card = await db.query.creditCards.findFirst({
      where: and(
        eq(creditCards.id, entry.creditCardId),
        eq(creditCards.userId, userId),
      ),
    });
    if (card?.reminderWindowDays != null) {
      return card.reminderWindowDays + 2;
    }
  }
  const envWindow =
    Math.max(0, Number(process.env.DUE_REMINDERS_WINDOW_DAYS ?? "4") || 4) + 2;
  return envWindow;
}

async function applyPaidSideEffects(
  userId: string,
  entry: DueEntryRow,
  opts?: { skipCalendar?: boolean; paidAmount?: string },
) {
  const paidAt = new Date();
  await db
    .update(dueEntries)
    .set({
      paidAt,
      ...(opts?.paidAmount ? { paidAmount: opts.paidAmount } : {}),
    })
    .where(and(eq(dueEntries.id, entry.id), eq(dueEntries.userId, userId)));

  const windowDays = await reminderSuppressWindow(userId, entry);
  const remindersSuppressed = await reminderLogService.suppressForDueEntry(
    userId,
    {
      issuerId: entry.issuerId,
      cardLast4: entry.cardLast4,
      dueDateYmd: entry.dueDateYmd,
    },
    windowDays,
  );

  let calendarUpdated = 0;
  let calendarError: string | undefined;
  if (!opts?.skipCalendar) {
    try {
      const calRes = await googleCalendarService.markEventsPaid(userId, entry);
      calendarUpdated = calRes.updated;
      if (calRes.error) calendarError = calRes.error;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
    }
  }

  const refreshed = await db.query.dueEntries.findFirst({
    where: and(eq(dueEntries.id, entry.id), eq(dueEntries.userId, userId)),
  });

  return {
    entry: refreshed ?? { ...entry, paidAt },
    remindersSuppressed,
    calendarUpdated,
    calendarError,
  };
}

export const markPaidService = {
  async markByDueEntryId(
    userId: string,
    dueEntryId: string,
    opts?: { skipCalendar?: boolean },
  ): Promise<MarkPaidResult | { ok: false; reason: "not_found" }> {
    const entry = await db.query.dueEntries.findFirst({
      where: and(eq(dueEntries.id, dueEntryId), eq(dueEntries.userId, userId)),
    });
    if (!entry) return { ok: false, reason: "not_found" };

    const effects = await applyPaidSideEffects(userId, entry, opts);
    return { ok: true, ...effects };
  },

  async markByCardAndMonth(
    userId: string,
    cardLast4: string,
    monthYM: string,
    opts?: { skipCalendar?: boolean },
  ): Promise<MarkPaidResult> {
    const found = await dueEntryQueryService.findByCardAndMonth(
      userId,
      cardLast4,
      monthYM,
    );

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

    const effects = await applyPaidSideEffects(userId, found, opts);
    return { ok: true, ...effects };
  },

  async markUnpaidByCardAndMonth(
    userId: string,
    cardLast4: string,
    monthYM: string,
    opts?: { skipCalendar?: boolean; skipReceiptRemoval?: boolean },
  ): Promise<MarkUnpaidResult> {
    const found = await dueEntryQueryService.findByCardAndMonth(
      userId,
      cardLast4,
      monthYM,
    );

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

    if (!found.paidAt) {
      return { ok: false, reason: "already_unpaid", cardLast4, monthYM };
    }

    let receiptsRemoved = 0;
    if (!opts?.skipReceiptRemoval) {
      receiptsRemoved = await deleteReceiptsForDueEntry(userId, found);
    }

    await db
      .update(dueEntries)
      .set({
        paidAt: null,
        paidAmount: null,
        ...(opts?.skipReceiptRemoval ? {} : { receiptId: null }),
      })
      .where(and(eq(dueEntries.id, found.id), eq(dueEntries.userId, userId)));

    const windowDays = await reminderSuppressWindow(userId, found);
    const remindersRestored = await reminderLogService.clearForDueEntry(
      userId,
      {
        issuerId: found.issuerId,
        cardLast4: found.cardLast4,
        dueDateYmd: found.dueDateYmd,
      },
      windowDays,
    );

    let calendarUpdated = 0;
    let calendarError: string | undefined;
    if (!opts?.skipCalendar) {
      try {
        const calRes = await googleCalendarService.markEventsUnpaid(
          userId,
          found,
        );
        calendarUpdated = calRes.updated;
        if (calRes.error) calendarError = calRes.error;
      } catch (e) {
        calendarError = e instanceof Error ? e.message : String(e);
      }
    }

    const refreshed = await db.query.dueEntries.findFirst({
      where: and(eq(dueEntries.id, found.id), eq(dueEntries.userId, userId)),
    });

    return {
      ok: true,
      entry: refreshed ?? found,
      remindersRestored,
      calendarUpdated,
      calendarError,
      receiptsRemoved,
    };
  },

  async markUnpaidByDueEntryId(
    userId: string,
    dueEntryId: string,
    opts?: { skipCalendar?: boolean; skipReceiptRemoval?: boolean },
  ): Promise<MarkUnpaidResult | { ok: false; reason: "not_found" }> {
    const found = await db.query.dueEntries.findFirst({
      where: and(eq(dueEntries.id, dueEntryId), eq(dueEntries.userId, userId)),
    });
    if (!found) return { ok: false, reason: "not_found" };

    const monthYM = found.dueDateYmd.slice(0, 7);
    const cardLast4 = found.cardLast4;

    if (!found.paidAt) {
      return { ok: false, reason: "already_unpaid", cardLast4, monthYM };
    }

    let receiptsRemoved = 0;
    if (!opts?.skipReceiptRemoval) {
      receiptsRemoved = await deleteReceiptsForDueEntry(userId, found);
    }

    await db
      .update(dueEntries)
      .set({
        paidAt: null,
        paidAmount: null,
        ...(opts?.skipReceiptRemoval ? {} : { receiptId: null }),
      })
      .where(and(eq(dueEntries.id, found.id), eq(dueEntries.userId, userId)));

    const windowDays = await reminderSuppressWindow(userId, found);
    const remindersRestored = await reminderLogService.clearForDueEntry(
      userId,
      {
        issuerId: found.issuerId,
        cardLast4: found.cardLast4,
        dueDateYmd: found.dueDateYmd,
      },
      windowDays,
    );

    let calendarUpdated = 0;
    let calendarError: string | undefined;
    if (!opts?.skipCalendar) {
      try {
        const calRes = await googleCalendarService.markEventsUnpaid(
          userId,
          found,
        );
        calendarUpdated = calRes.updated;
        if (calRes.error) calendarError = calRes.error;
      } catch (e) {
        calendarError = e instanceof Error ? e.message : String(e);
      }
    }

    const refreshed = await db.query.dueEntries.findFirst({
      where: and(eq(dueEntries.id, found.id), eq(dueEntries.userId, userId)),
    });

    return {
      ok: true,
      entry: refreshed ?? found,
      remindersRestored,
      calendarUpdated,
      calendarError,
      receiptsRemoved,
    };
  },

  async markFromReceipt(
    userId: string,
    parsed: ParsedReceipt,
    opts?: {
      caption?: string;
      skipCalendar?: boolean;
      dueEntryId?: string;
      excludeReceiptId?: string;
    },
  ): Promise<ReceiptPayResult> {
    if (!parsed.cardLast4) {
      return { ok: false, reason: "no_card_detected", parsed };
    }
    if (parsed.amount === undefined || !Number.isFinite(parsed.amount)) {
      return { ok: false, reason: "no_amount_detected", parsed };
    }

    const monthYM = opts?.caption ? extractMonthYearLoose(opts.caption) : null;

    let entry: DueEntryRow | undefined;
    let monthResolved: string | undefined;

    if (opts?.dueEntryId) {
      const byId = await db.query.dueEntries.findFirst({
        where: and(
          eq(dueEntries.id, opts.dueEntryId),
          eq(dueEntries.userId, userId),
        ),
      });
      if (!byId) {
        return {
          ok: false,
          reason: "no_due_entry",
          cardLast4: parsed.cardLast4,
          parsed,
        };
      }
      if (await isDueEntryFullyPaid(userId, byId)) {
        return {
          ok: false,
          reason: "already_paid",
          cardLast4: parsed.cardLast4,
          parsed,
        };
      }
      entry = byId;
      monthResolved = byId.dueDateYmd.slice(0, 7);
    } else if (monthYM) {
      const byMonth = await dueEntryQueryService.findByCardAndMonth(
        userId,
        parsed.cardLast4,
        monthYM,
      );
      if (byMonth === null) {
        return {
          ok: false,
          reason: "no_due_entry",
          cardLast4: parsed.cardLast4,
          monthYM,
          parsed,
        };
      }
      if (Array.isArray(byMonth)) {
        return {
          ok: false,
          reason: "ambiguous_card",
          cardLast4: parsed.cardLast4,
          matches: byMonth,
          parsed,
        };
      }
      if (await isDueEntryFullyPaid(userId, byMonth)) {
        return {
          ok: false,
          reason: "already_paid",
          cardLast4: parsed.cardLast4,
          parsed,
        };
      }
      entry = byMonth;
      monthResolved = monthYM;
    } else {
      const nearest = await dueEntryQueryService.findNearestUnpaidByLast4(
        userId,
        parsed.cardLast4,
      );
      if (nearest === null) {
        return {
          ok: false,
          reason: "no_due_entry",
          cardLast4: parsed.cardLast4,
          parsed,
        };
      }
      if (nearest === "already_paid") {
        const open = await findNearestNotFullyPaidByLast4(
          userId,
          parsed.cardLast4,
        );
        if (open === null) {
          return {
            ok: false,
            reason: "already_paid",
            cardLast4: parsed.cardLast4,
            parsed,
          };
        }
        if (Array.isArray(open)) {
          return {
            ok: false,
            reason: "ambiguous_card",
            cardLast4: parsed.cardLast4,
            matches: open,
            parsed,
          };
        }
        entry = open;
      } else if (Array.isArray(nearest)) {
        return {
          ok: false,
          reason: "ambiguous_card",
          cardLast4: parsed.cardLast4,
          matches: nearest,
          parsed,
        };
      } else {
        entry = nearest;
      }
    }

    const result = await applyReceiptToDueEntry(userId, entry, parsed, {
      skipCalendar: opts?.skipCalendar,
      excludeReceiptId: opts?.excludeReceiptId,
    });

    return { ...result, monthYM: monthResolved };
  },
};
