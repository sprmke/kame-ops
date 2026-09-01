import { and, eq } from "drizzle-orm";

import { normalizeCardLast4 } from "@/lib/due/normalize";
import { parseDueDateToYmd } from "@/lib/due/parse-due-date";
import { formatInterestCharges } from "@/lib/soa/interest-charges";
import { dueEntryKey } from "@/lib/soa/outstanding";
import { dueStatementAmountKey } from "@/lib/soa/due-statement-match";
import { db } from "@/lib/db";
import { creditCards, dueEntries } from "@/lib/db/schema";

import { invalidateDueEntryRows } from "./user-rows.service";

type SoaRow = {
  issuerId: string;
  cardLast4: string;
  bankLabel: string;
  cardDisplayLabel?: string;
  fullPan?: string;
  dueDate: string;
  minimumDue: string;
  totalDue: string;
  contactLine?: string;
  soaUnavailable?: boolean;
  transactions?: { date: string; description: string; amount: string }[];
};

export type DueUpsertResult = {
  added: number;
  updated: number;
  skipped: number;
};

export const dueEntryUpsertService = {
  async upsertFromSoaRows(
    userId: string,
    rows: SoaRow[],
  ): Promise<DueUpsertResult> {
    const userCards = await db.query.creditCards.findMany({
      where: eq(creditCards.userId, userId),
    });
    const cardByKey = new Map(
      userCards.map((c) => [
        `${c.issuer.toLowerCase()}:${normalizeCardLast4(c.last4)}`,
        c,
      ]),
    );

    const existingRows = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
    });
    const byKey = new Map(
      existingRows.map((d) => [
        dueEntryKey(d.issuerId, d.cardLast4, d.dueDateYmd),
        d,
      ]),
    );
    const byAmount = new Map<string, (typeof existingRows)[number]>();
    const expectedByCardMonth = new Map<
      string,
      (typeof existingRows)[number]
    >();
    for (const d of existingRows) {
      const amountKey = dueStatementAmountKey(
        d.issuerId,
        d.dueDateYmd,
        d.totalDue,
      );
      if (amountKey) byAmount.set(amountKey, d);
      if (d.source === "expected" && d.creditCardId) {
        expectedByCardMonth.set(
          `${d.creditCardId}:${d.dueDateYmd.slice(0, 7)}`,
          d,
        );
      }
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const cardsWithSoaUpsert = new Set<string>();

    for (const r of rows) {
      if (r.soaUnavailable) {
        skipped++;
        continue;
      }
      const ymd = parseDueDateToYmd(r.dueDate);
      if (!ymd) {
        skipped++;
        continue;
      }

      const issuerId = r.issuerId.trim().toLowerCase();
      const cardLast4 = normalizeCardLast4(r.cardLast4);

      const amountKey = dueStatementAmountKey(issuerId, ymd, r.totalDue);
      const card = cardByKey.get(`${issuerId}:${cardLast4}`);

      const values = {
        issuerId,
        cardLast4,
        bankLabel: r.bankLabel,
        cardDisplayLabel: card?.label ?? r.cardDisplayLabel ?? null,
        fullPan: r.fullPan?.trim() || card?.fullPan || null,
        dueDate: r.dueDate,
        dueDateYmd: ymd,
        minimumDue: r.minimumDue,
        totalDue: r.totalDue,
        interestCharges: formatInterestCharges(r.transactions) ?? null,
        contactLine: r.contactLine?.trim() || card?.contactLine || null,
        creditCardId: card?.id ?? null,
        source: "soa",
      };

      // Exact identity (issuer + card + due date) must win over the amount-based
      // fallback. The amount key intentionally omits card last-4 to repair rows
      // where last-4 detection failed, but checking it first meant two different
      // cards from the same issuer with the same due date and total due could
      // collide — the second row would silently take over the first card's due
      // entry (and its `paidAt`), making an unpaid card show up as "Paid".
      const key = dueEntryKey(issuerId, cardLast4, ymd);
      const existing =
        byKey.get(key) ??
        (amountKey ? byAmount.get(amountKey) : undefined) ??
        (card
          ? expectedByCardMonth.get(`${card.id}:${ymd.slice(0, 7)}`)
          : undefined);

      if (!existing) {
        const [inserted] = await db
          .insert(dueEntries)
          .values({ userId, ...values })
          .returning();
        byKey.set(key, inserted!);
        if (card?.id) cardsWithSoaUpsert.add(card.id);
        added++;
        continue;
      }

      await db
        .update(dueEntries)
        .set({
          ...values,
          paidAt: existing.paidAt,
          paidAmount: existing.paidAmount,
          receiptId: existing.receiptId,
        })
        .where(
          and(eq(dueEntries.id, existing.id), eq(dueEntries.userId, userId)),
        );
      if (card?.id) cardsWithSoaUpsert.add(card.id);
      updated++;
    }

    if (cardsWithSoaUpsert.size > 0) {
      for (const cardId of cardsWithSoaUpsert) {
        await db
          .delete(dueEntries)
          .where(
            and(
              eq(dueEntries.userId, userId),
              eq(dueEntries.creditCardId, cardId),
              eq(dueEntries.source, "expected"),
            ),
          );
      }
    }

    if (added > 0 || updated > 0 || cardsWithSoaUpsert.size > 0) {
      invalidateDueEntryRows();
    }

    return { added, updated, skipped };
  },
};
