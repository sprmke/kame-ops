import { and, eq } from "drizzle-orm";

import { normalizeCardLast4 } from "@/lib/due/normalize";
import { parseDueDateToYmd } from "@/lib/due/parse-due-date";
import { formatInterestCharges } from "@/lib/soa/interest-charges";
import { dueEntryKey } from "@/lib/soa/outstanding";
import { dueStatementAmountKey } from "@/lib/soa/due-statement-match";
import { db } from "@/lib/db";
import { creditCards, dueEntries } from "@/lib/db/schema";

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
    for (const d of existingRows) {
      const amountKey = dueStatementAmountKey(
        d.issuerId,
        d.dueDateYmd,
        d.totalDue,
      );
      if (amountKey) byAmount.set(amountKey, d);
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

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
      };

      const key = dueEntryKey(issuerId, cardLast4, ymd);
      const existing =
        (amountKey ? byAmount.get(amountKey) : undefined) ?? byKey.get(key);

      if (!existing) {
        const [inserted] = await db
          .insert(dueEntries)
          .values({ userId, ...values })
          .returning();
        byKey.set(key, inserted!);
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
      updated++;
    }

    return { added, updated, skipped };
  },
};
