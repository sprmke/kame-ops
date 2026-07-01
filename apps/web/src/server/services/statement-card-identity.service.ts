import "server-only";

import { and, eq } from "drizzle-orm";

import { normalizeCardLast4 } from "@/lib/due/normalize";
import { db } from "@/lib/db";
import { creditCards, dueEntries, soaStatements } from "@/lib/db/schema";
import { resolveCardLast4FromSoaText } from "@/lib/soa/card-last4-from-text";
import {
  dueStatementAmountKey,
  indexStatementsByDueAmount,
} from "@/lib/soa/due-statement-match";

import { creditCardService } from "./credit-card.service";
import { enrichDueEntriesWithSoaPeriod } from "./due-statement-period.service";

type PipelineCard = Awaited<
  ReturnType<typeof creditCardService.listForSoaPipeline>
>[number];

function needsCardIdentityRepair(
  dues: Array<{
    issuerId: string;
    cardLast4: string;
    dueDateYmd: string;
    totalDue: string;
    statementPeriodKey?: string;
  }>,
): boolean {
  const seen = new Map<string, string>();
  for (const due of dues) {
    const periodKey = due.statementPeriodKey ?? due.dueDateYmd.slice(0, 7);
    const groupKey = `${due.issuerId.toLowerCase()}:${normalizeCardLast4(due.cardLast4)}:${periodKey}`;
    const signature = `${due.dueDateYmd}:${due.totalDue}`;
    const existing = seen.get(groupKey);
    if (existing && existing !== signature) return true;
    seen.set(groupKey, signature);
  }
  return false;
}

async function syncDueEntriesFromStatements(userId: string) {
  const [statements, dues, cards] = await Promise.all([
    db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
    }),
    db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
    }),
    db.query.creditCards.findMany({
      where: eq(creditCards.userId, userId),
    }),
  ]);

  const byAmount = indexStatementsByDueAmount(statements);
  const cardByKey = new Map(
    cards.map((c) => [
      `${c.issuer.toLowerCase()}:${normalizeCardLast4(c.last4)}`,
      c,
    ]),
  );

  for (const due of dues) {
    const key = dueStatementAmountKey(
      due.issuerId,
      due.dueDateYmd,
      due.totalDue,
    );
    if (!key) continue;

    const stmt = byAmount.get(key);
    if (!stmt) continue;

    const cardLast4 = normalizeCardLast4(stmt.cardLast4);
    const card =
      (stmt.creditCardId
        ? cards.find((c) => c.id === stmt.creditCardId)
        : undefined) ??
      cardByKey.get(`${stmt.issuerId.toLowerCase()}:${cardLast4}`);

    const next = {
      issuerId: stmt.issuerId.toLowerCase(),
      cardLast4,
      creditCardId: card?.id ?? stmt.creditCardId ?? null,
      bankLabel: stmt.bankLabel ?? due.bankLabel,
      cardDisplayLabel: card?.label ?? due.cardDisplayLabel,
      fullPan: card?.fullPan ?? due.fullPan,
      contactLine: card?.contactLine ?? due.contactLine,
      minimumDue: stmt.minimumDue ?? due.minimumDue,
      totalDue: stmt.totalDue ?? due.totalDue,
    };

    if (
      due.cardLast4 === next.cardLast4 &&
      due.creditCardId === next.creditCardId &&
      due.cardDisplayLabel === next.cardDisplayLabel
    ) {
      continue;
    }

    await db
      .update(dueEntries)
      .set(next)
      .where(and(eq(dueEntries.id, due.id), eq(dueEntries.userId, userId)));
  }
}

/** Backfill statement cardLast4 from stored Gmail subject (legacy rows). */
async function repairStatementsFromSubjects(userId: string) {
  const [statements, pipelineCards] = await Promise.all([
    db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
    }),
    creditCardService.listForSoaPipeline(userId),
  ]);

  const cardsByIssuer = new Map<string, PipelineCard[]>();
  for (const card of pipelineCards) {
    const issuer = card.issuer.toLowerCase();
    const list = cardsByIssuer.get(issuer) ?? [];
    list.push(card);
    cardsByIssuer.set(issuer, list);
  }

  for (const stmt of statements) {
    if (stmt.soaUnavailable) continue;

    const issuerCards = cardsByIssuer.get(stmt.issuerId.toLowerCase()) ?? [];
    if (issuerCards.length <= 1) continue;

    const cardLast4 = normalizeCardLast4(
      resolveCardLast4FromSoaText(
        "",
        issuerCards.map((c) => ({
          last4: c.last4,
          fullPan: c.fullPan,
          label: c.label,
        })),
        stmt.cardLast4,
        stmt.sourceEmailSubject ?? undefined,
      ),
    );

    const card = issuerCards.find(
      (c) => normalizeCardLast4(c.last4) === cardLast4,
    );
    const nextCreditCardId = card?.id ?? null;

    if (
      cardLast4 === normalizeCardLast4(stmt.cardLast4) &&
      nextCreditCardId === stmt.creditCardId
    ) {
      continue;
    }

    await db
      .update(soaStatements)
      .set({ cardLast4, creditCardId: nextCreditCardId })
      .where(
        and(eq(soaStatements.id, stmt.id), eq(soaStatements.userId, userId)),
      );
  }
}

async function unpaidDuesForRepairCheck(userId: string) {
  const rows = await db.query.dueEntries.findMany({
    where: eq(dueEntries.userId, userId),
  });
  const unpaid = rows.filter((row) => !row.paidAt);
  return enrichDueEntriesWithSoaPeriod(userId, unpaid);
}

/**
 * Same-bank cards share a PDF password; legacy rows may have the wrong last-4.
 * Reconcile statements from Gmail subject, then sync dues by amount key.
 */
export async function ensureDueEntryCardIdentity(
  userId: string,
): Promise<void> {
  let checkRows = await unpaidDuesForRepairCheck(userId);
  if (!needsCardIdentityRepair(checkRows)) return;

  await syncDueEntriesFromStatements(userId);

  checkRows = await unpaidDuesForRepairCheck(userId);
  if (!needsCardIdentityRepair(checkRows)) return;

  await repairStatementsFromSubjects(userId);
  await syncDueEntriesFromStatements(userId);
}

export async function listDueEntriesWithCorrectIdentity(
  userId: string,
  unpaidOnly: boolean,
) {
  await ensureDueEntryCardIdentity(userId);

  const rows = await db.query.dueEntries.findMany({
    where: eq(dueEntries.userId, userId),
    orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
  });

  const filtered = unpaidOnly ? rows.filter((row) => !row.paidAt) : rows;
  return enrichDueEntriesWithSoaPeriod(userId, filtered);
}
