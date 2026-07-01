import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { soaStatements } from '@/lib/db/schema';
import { dueEntryKey } from '@/lib/soa/outstanding';
import {
  formatSoaPeriodLabel,
  formatSoaPeriodLabelFromKey,
  soaPeriodMonthKey,
} from '@/lib/soa/period';

function statementOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

function cardKey(issuerId: string, cardLast4: string): string {
  return `${issuerId.toLowerCase()}:${cardLast4}`;
}

type SoaStatementPeriodRow = {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string | null;
  statementMonth: number;
  statementYear: number;
};

function periodFromStatement(statement: SoaStatementPeriodRow): {
  statementPeriodKey: string;
  statementPeriodLabel: string;
} {
  return {
    statementPeriodKey: soaPeriodMonthKey(
      statement.statementYear,
      statement.statementMonth,
    ),
    statementPeriodLabel: formatSoaPeriodLabel(
      statement.statementMonth,
      statement.statementYear,
    ),
  };
}

function periodFromDueDateFallback(dueDateYmd: string): {
  statementPeriodKey: string;
  statementPeriodLabel: string;
} {
  const key = dueDateYmd.slice(0, 7);
  return {
    statementPeriodKey: key,
    statementPeriodLabel: formatSoaPeriodLabelFromKey(key),
  };
}

export async function enrichDueEntriesWithSoaPeriod<
  T extends {
    issuerId: string;
    cardLast4: string;
    dueDateYmd: string;
  },
>(userId: string, rows: T[]) {
  const statements = await db.query.soaStatements.findMany({
    where: eq(soaStatements.userId, userId),
    columns: {
      issuerId: true,
      cardLast4: true,
      dueDateYmd: true,
      statementMonth: true,
      statementYear: true,
    },
  });

  const stmtByDueKey = new Map<string, SoaStatementPeriodRow>();
  const latestStmtByCard = new Map<string, SoaStatementPeriodRow>();

  for (const stmt of statements) {
    const key = dueEntryKey(stmt.issuerId, stmt.cardLast4, stmt.dueDateYmd);
    const existing = stmtByDueKey.get(key);
    if (
      !existing ||
      statementOrdinal(stmt.statementYear, stmt.statementMonth) >
        statementOrdinal(existing.statementYear, existing.statementMonth)
    ) {
      stmtByDueKey.set(key, stmt);
    }

    const card = cardKey(stmt.issuerId, stmt.cardLast4);
    const latest = latestStmtByCard.get(card);
    if (
      !latest ||
      statementOrdinal(stmt.statementYear, stmt.statementMonth) >
        statementOrdinal(latest.statementYear, latest.statementMonth)
    ) {
      latestStmtByCard.set(card, stmt);
    }
  }

  return rows.map((row) => {
    const matched =
      stmtByDueKey.get(
        dueEntryKey(row.issuerId, row.cardLast4, row.dueDateYmd),
      ) ?? latestStmtByCard.get(cardKey(row.issuerId, row.cardLast4));

    if (matched) {
      return { ...row, ...periodFromStatement(matched) };
    }

    return { ...row, ...periodFromDueDateFallback(row.dueDateYmd) };
  });
}
