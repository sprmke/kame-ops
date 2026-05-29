import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { creditCards, soaStatements, soaTransactions } from "@/lib/db/schema";

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

    for (const row of rows) {
      if (row.soaUnavailable || row.cardLast4 === "—") continue;

      const creditCard = userCards.find(
        (c) =>
          c.issuer.toLowerCase() === row.issuerId.toLowerCase() &&
          c.last4 === row.cardLast4,
      );

      const [statement] = await db
        .insert(soaStatements)
        .values({
          userId,
          creditCardId: creditCard?.id,
          statementMonth: period.month,
          statementYear: period.year,
          bankLabel: row.bankLabel,
          issuerId: row.issuerId,
          cardLast4: row.cardLast4,
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
        })
        .returning();

      if (!statement) continue;

      if (row.transactions?.length) {
        await db.insert(soaTransactions).values(
          row.transactions.map((t) => ({
            soaStatementId: statement.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
          })),
        );
      }

      saved++;
    }

    return { saved };
  },
};
