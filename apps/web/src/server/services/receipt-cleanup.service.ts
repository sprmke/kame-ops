import "server-only";

import { and, eq } from "drizzle-orm";

import { matchReceiptToDue } from "@/lib/receipts/match-due";
import { db } from "@/lib/db";
import { dueEntries, receipts } from "@/lib/db/schema";

import { enrichDueEntriesWithSoaPeriod } from "./due-statement-period.service";
import { storageService } from "./storage.service";

import type { DueEntryRow } from "./due-entry-query.service";

async function deleteReceiptRow(
  userId: string,
  receiptId: string,
): Promise<boolean> {
  const row = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, receiptId), eq(receipts.userId, userId)),
  });
  if (!row) return false;

  if (row.dueEntryId) {
    await db
      .update(dueEntries)
      .set({ receiptId: null })
      .where(
        and(
          eq(dueEntries.id, row.dueEntryId),
          eq(dueEntries.userId, userId),
          eq(dueEntries.receiptId, receiptId),
        ),
      );
  }

  await storageService.deletePrivate(row.storagePath);
  await db
    .delete(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));

  return true;
}

/** Delete all payment receipts linked to a due entry's card and statement period. */
export async function deleteReceiptsForDueEntry(
  userId: string,
  entry: DueEntryRow,
): Promise<number> {
  const [due] = await enrichDueEntriesWithSoaPeriod(userId, [entry]);
  if (!due) return 0;

  const dueCandidate = {
    id: due.id,
    issuerId: due.issuerId,
    cardLast4: due.cardLast4,
    dueDateYmd: due.dueDateYmd,
    statementPeriodKey: due.statementPeriodKey,
    statementPeriodLabel: due.statementPeriodLabel,
  };

  const rows = await db.query.receipts.findMany({
    where: eq(receipts.userId, userId),
  });

  const idsToDelete = new Set<string>();
  if (entry.receiptId) idsToDelete.add(entry.receiptId);

  for (const row of rows) {
    if (row.dueEntryId === entry.id) {
      idsToDelete.add(row.id);
      continue;
    }

    const matched = matchReceiptToDue([dueCandidate], {
      dueEntryId: row.dueEntryId,
      parsedCardLast4: row.parsedCardLast4,
      dueDateYmd: null,
      aiAnalysis: row.aiAnalysis as { paymentDate?: string } | null | undefined,
      createdAt: row.createdAt,
    });

    if (matched?.id === entry.id) {
      idsToDelete.add(row.id);
    }
  }

  let removed = 0;
  for (const receiptId of idsToDelete) {
    if (await deleteReceiptRow(userId, receiptId)) {
      removed += 1;
    }
  }

  await db
    .update(dueEntries)
    .set({ receiptId: null })
    .where(and(eq(dueEntries.id, entry.id), eq(dueEntries.userId, userId)));

  return removed;
}
