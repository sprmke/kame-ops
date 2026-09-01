import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { creditCards, soaStatements, soaTransactions } from "@/lib/db/schema";
import { parseDueDateToYmd } from "@/lib/due/parse-due-date";
import { normalizeCardLast4 } from "@/lib/due/normalize";

import {
  categorizeTransaction,
  transactionCategoryService,
} from "./transaction-category.service";

type SoaRow = {
  bankLabel: string;
  issuerId: string;
  cardLast4: string;
  sourceEmailSubject: string;
  sourceMessageId: string;
  pdfFileName: string;
  minimumDue: string;
  totalDue: string;
  statementDate: string;
  dueDate: string;
  parseNotes?: string;
  soaUnavailable?: boolean;
  pdfStoragePath?: string | null;
  transactions?: { date: string; description: string; amount: string }[];
};

export const soaPersistService = {
  async persistRows(
    userId: string,
    rows: SoaRow[],
    period: { month: number; year: number },
  ) {
    const userCards = await db.query.creditCards.findMany({
      where: and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
    });

    let saved = 0;
    let updated = 0;
    let unavailable = 0;

    for (const row of rows) {
      if (row.soaUnavailable && row.cardLast4 === "—") {
        // Bank-level placeholder (no SOA email for this issuer at all) — expand to
        // every card under that issuer so each one gets its own "unavailable" record.
        const issuerCards = userCards.filter(
          (c) => c.issuer.toLowerCase() === row.issuerId.toLowerCase(),
        );
        for (const card of issuerCards) {
          const expanded = {
            ...row,
            cardLast4: normalizeCardLast4(card.last4),
            soaUnavailable: true,
          };
          const result = await persistOneRow(
            userId,
            expanded,
            period,
            userCards,
          );
          if (result === "saved") saved++;
          if (result === "updated") updated++;
          if (result === "unavailable") unavailable++;
        }
        continue;
      }

      if (row.cardLast4 === "—") continue;

      // Card-level placeholder (bank had SOA email(s) this period, but this specific
      // card had no matching PDF/row) or a normally parsed row — both persist via the
      // same path; persistOneRow reports "unavailable" when row.soaUnavailable is set.
      const result = await persistOneRow(userId, row, period, userCards);
      if (result === "saved") saved++;
      if (result === "updated") updated++;
      if (result === "unavailable") unavailable++;
    }

    return { saved, updated, unavailable };
  },
};

type PersistRowResult = "saved" | "updated" | "skipped" | "unavailable";

/**
 * One statement row per (user, issuer, card, period) — always. Previously this
 * matched real (parsed) rows by `sourceMessageId`/`pdfFileName` while
 * "unavailable" placeholders (which never have a real message id or file
 * name) matched by card instead. That let a placeholder saved on one run and
 * the real statement found on a later run resolve to two different lookups,
 * so the real row was INSERTed next to the placeholder instead of replacing
 * it — the duplicate "blank card + real card" rows in the SOA table. Keying
 * everything by the normalized card last-4 makes both paths converge on the
 * same row.
 */
export function soaStatementLookupWhere(
  userId: string,
  row: Pick<SoaRow, "issuerId" | "cardLast4">,
  period: { month: number; year: number },
) {
  return and(
    eq(soaStatements.userId, userId),
    eq(soaStatements.issuerId, row.issuerId),
    eq(soaStatements.cardLast4, normalizeCardLast4(row.cardLast4)),
    eq(soaStatements.statementMonth, period.month),
    eq(soaStatements.statementYear, period.year),
  );
}

async function persistOneRow(
  userId: string,
  row: SoaRow,
  period: { month: number; year: number },
  userCards: { id: string; issuer: string; last4: string }[],
): Promise<PersistRowResult> {
  const cardLast4 = normalizeCardLast4(row.cardLast4);
  const creditCard = userCards.find(
    (c) =>
      c.issuer.toLowerCase() === row.issuerId.toLowerCase() &&
      normalizeCardLast4(c.last4) === cardLast4,
  );

  const existing = await db.query.soaStatements.findFirst({
    where: soaStatementLookupWhere(userId, { ...row, cardLast4 }, period),
  });

  // Never let a "no SOA email found this run" placeholder erase a
  // previously saved real statement. Overwriting it would wipe the real
  // `dueDateYmd`, which in turn breaks the due-entry ↔ statement matching
  // used for the "Paid" badge (a stale paid due from another period can
  // then get attributed to this statement once its own due date is gone).
  if (row.soaUnavailable && existing && !existing.soaUnavailable) {
    return "skipped";
  }

  const statementValues = {
    creditCardId: creditCard?.id,
    bankLabel: row.bankLabel,
    sourceEmailSubject: row.sourceEmailSubject,
    sourceMessageId: row.sourceMessageId,
    pdfFileName: row.pdfFileName,
    minimumDue: row.minimumDue,
    totalDue: row.totalDue,
    statementDate: row.statementDate,
    dueDate: row.dueDate,
    dueDateYmd: parseDueDateToYmd(row.dueDate),
    parseNotes: row.parseNotes,
    soaUnavailable: row.soaUnavailable ?? false,
    ...(row.pdfStoragePath ? { pdfStoragePath: row.pdfStoragePath } : {}),
  };

  let statement = existing;

  if (existing) {
    const [row_] = await db
      .update(soaStatements)
      .set({
        ...statementValues,
        cardLast4,
        creditCardId: creditCard?.id ?? null,
      })
      .where(eq(soaStatements.id, existing.id))
      .returning();
    statement = row_ ?? existing;
    await db
      .delete(soaTransactions)
      .where(eq(soaTransactions.soaStatementId, existing.id));
  } else {
    const [row_] = await db
      .insert(soaStatements)
      .values({
        userId,
        statementMonth: period.month,
        statementYear: period.year,
        issuerId: row.issuerId,
        cardLast4,
        ...statementValues,
      })
      .returning();
    statement = row_;
  }

  if (!statement) return "skipped";

  if (row.transactions?.length) {
    const [rules, customLabels] = await Promise.all([
      transactionCategoryService.getRulesForUser(userId),
      transactionCategoryService.getCustomLabelMap(userId),
    ]);
    const customSlugs = new Set(customLabels.keys());
    await db.insert(soaTransactions).values(
      row.transactions.map((t) => {
        const categorized = categorizeTransaction(t, rules, customSlugs);
        return {
          soaStatementId: statement.id,
          date: t.date,
          description: t.description,
          amount: t.amount,
          categorySlug: categorized.categorySlug,
          categorySource: categorized.categorySource,
        };
      }),
    );
  }

  if (row.soaUnavailable) return "unavailable";

  return existing ? "updated" : "saved";
}
