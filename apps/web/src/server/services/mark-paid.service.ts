import { and, eq } from "drizzle-orm";

import { extractMonthYearLoose } from "@/lib/mark-paid/parse-messages";
import type { ParsedReceipt } from "@/lib/receipts/parsed-receipt";
import {
  parseMoneyToNumber,
  receiptRequiresTotalDue,
} from "@/lib/receipts/payment-threshold";
import { db } from "@/lib/db";
import { creditCards, dueEntries } from "@/lib/db/schema";

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
    opts?: { caption?: string; skipCalendar?: boolean; dueEntryId?: string },
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
      if (byId.paidAt) {
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
        return {
          ok: false,
          reason: "already_paid",
          cardLast4: parsed.cardLast4,
          parsed,
        };
      }
      if (Array.isArray(nearest)) {
        return {
          ok: false,
          reason: "ambiguous_card",
          cardLast4: parsed.cardLast4,
          matches: nearest,
          parsed,
        };
      }
      entry = nearest;
    }

    const amountPaid = parsed.amount;
    const amountRaw = parsed.amountRaw ?? String(parsed.amount);
    const minimumDueValue = parseMoneyToNumber(entry.minimumDue);
    const totalDueValue = parseMoneyToNumber(entry.totalDue);
    const threshold = receiptRequiresTotalDue()
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

    const effects = await applyPaidSideEffects(userId, entry, {
      skipCalendar: opts?.skipCalendar,
      paidAmount: amountRaw,
    });

    const belowTotalDue =
      Number.isFinite(totalDueValue) && amountPaid + 0.005 < totalDueValue;

    return {
      ok: true,
      entry: effects.entry,
      amountPaid,
      amountRaw,
      minimumDueValue,
      totalDueValue,
      belowTotalDue,
      remindersSuppressed: effects.remindersSuppressed,
      calendarUpdated: effects.calendarUpdated,
      calendarError: effects.calendarError,
      monthYM: monthResolved,
    };
  },
};
