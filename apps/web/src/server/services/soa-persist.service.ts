import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { creditCards, soaStatements, soaTransactions } from "@/lib/db/schema";

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
  transactions?: { date: string; description: string; amount: string }[];
};

function parseDueDateYmd(dueDate: string): string | null {
  const m = dueDate.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  const mon = months[m[1]!];
  if (mon === undefined) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

export const soaPersistService = {
  async persistRows(
    userId: string,
    rows: SoaRow[],
    period: { month: number; year: number },
  ) {
    const userCards = await db.query.creditCards.findMany({
      where: eq(creditCards.userId, userId),
    });

    let saved = 0;
    let updated = 0;

    for (const row of rows) {
      if (row.soaUnavailable || row.cardLast4 === "—") continue;

      const creditCard = userCards.find(
        (c) =>
          c.issuer.toLowerCase() === row.issuerId.toLowerCase() &&
          c.last4 === row.cardLast4,
      );

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
        dueDateYmd: parseDueDateYmd(row.dueDate),
        parseNotes: row.parseNotes,
        soaUnavailable: row.soaUnavailable ?? false,
      };

      const existing = await db.query.soaStatements.findFirst({
        where: and(
          eq(soaStatements.userId, userId),
          eq(soaStatements.issuerId, row.issuerId),
          eq(soaStatements.cardLast4, row.cardLast4),
          eq(soaStatements.statementMonth, period.month),
          eq(soaStatements.statementYear, period.year),
        ),
      });

      let statement = existing;

      if (existing) {
        const [row_] = await db
          .update(soaStatements)
          .set(statementValues)
          .where(eq(soaStatements.id, existing.id))
          .returning();
        statement = row_ ?? existing;
        await db
          .delete(soaTransactions)
          .where(eq(soaTransactions.soaStatementId, existing.id));
        updated++;
      } else {
        const [row_] = await db
          .insert(soaStatements)
          .values({
            userId,
            statementMonth: period.month,
            statementYear: period.year,
            issuerId: row.issuerId,
            cardLast4: row.cardLast4,
            ...statementValues,
          })
          .returning();
        statement = row_;
        saved++;
      }

      if (!statement) continue;

      if (row.transactions?.length) {
        const rules = await transactionCategoryService.getRulesForUser(userId);
        await db.insert(soaTransactions).values(
          row.transactions.map((t) => {
            const categorized = categorizeTransaction(t, rules);
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
    }

    return { saved, updated };
  },
};
