import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  expectedDueDateCandidates,
  formatExpectedDueDate,
} from "@/lib/credit-cards/expected-due";
import { db } from "@/lib/db";
import { creditCards, dueEntries, formatBankIssuer } from "@/lib/db/schema";
import { daysUntilYmd, todayYmdLocal } from "@/lib/reminders/reminder-status";

import { invalidateDueEntryRows } from "./user-rows.service";

const DEFAULT_WINDOW_DAYS = Math.max(
  0,
  Number(process.env.DUE_REMINDERS_WINDOW_DAYS ?? "4") || 4,
);
const OVERDUE_FOLLOW_UP_DAYS = 7;

type EnsureExpectedDueEntriesOptions = {
  asOfYmd?: string;
  cardId?: string;
};

export const expectedDueEntryService = {
  async ensureForUser(
    userId: string,
    options: EnsureExpectedDueEntriesOptions = {},
  ) {
    const asOfYmd = options.asOfYmd ?? todayYmdLocal();
    const cards = await db.query.creditCards.findMany({
      where: and(
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
        eq(creditCards.isActive, true),
        options.cardId ? eq(creditCards.id, options.cardId) : undefined,
      ),
    });
    const existing = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
    });
    let added = 0;
    let updated = 0;

    for (const card of cards) {
      if (!card.dueDay) continue;

      for (const dueDateYmd of expectedDueDateCandidates(
        asOfYmd,
        card.dueDay,
      )) {
        const daysAway = daysUntilYmd(dueDateYmd, asOfYmd);
        const windowDays = card.reminderWindowDays ?? DEFAULT_WINDOW_DAYS;
        if (daysAway > windowDays || daysAway < -OVERDUE_FOLLOW_UP_DAYS) {
          continue;
        }

        const dueMonth = dueDateYmd.slice(0, 7);
        const forMonth = existing.filter(
          (entry) =>
            entry.creditCardId === card.id &&
            entry.dueDateYmd.startsWith(dueMonth),
        );
        if (forMonth.some((entry) => entry.source === "soa")) continue;

        const expected = forMonth.find((entry) => entry.source === "expected");
        const values = {
          issuerId: card.issuer,
          cardLast4: card.last4,
          bankLabel: formatBankIssuer(card.issuer),
          cardDisplayLabel: card.label,
          fullPan: card.fullPan,
          dueDate: formatExpectedDueDate(dueDateYmd),
          dueDateYmd,
          minimumDue: "—",
          totalDue: "—",
          contactLine: card.contactLine,
          source: "expected",
          creditCardId: card.id,
          updatedAt: new Date(),
        };

        if (expected) {
          await db
            .update(dueEntries)
            .set(values)
            .where(
              and(
                eq(dueEntries.id, expected.id),
                eq(dueEntries.userId, userId),
              ),
            );
          updated++;
          continue;
        }

        const inserted = await db
          .insert(dueEntries)
          .values({ userId, ...values })
          .onConflictDoNothing()
          .returning({ id: dueEntries.id });
        added += inserted.length;
      }
    }

    if (added > 0 || updated > 0) invalidateDueEntryRows();
    return { added, updated };
  },
};
