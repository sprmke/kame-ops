import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { soaStatements } from "@/lib/db/schema";
import { dueEntryKey } from "@/lib/soa/outstanding";
import {
  formatSoaPeriodLabel,
  formatSoaPeriodLabelFromKey,
  soaPeriodMonthKey,
} from "@/lib/soa/period";

function statementOrdinal(year: number, month: number): number {
  return year * 12 + month;
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
  }

  return rows.map((row) => {
    // Only trust a statement's billing period when its own due date exactly
    // matches this due entry. A "latest statement for this card" fallback used
    // to live here, but it could attribute a stale (already paid) due entry
    // from an older cycle to the newest statement's period — making the new,
    // unpaid statement show up as "Paid". Falling back to the due entry's own
    // date keeps each entry's period tied to itself.
    const matched = stmtByDueKey.get(
      dueEntryKey(row.issuerId, row.cardLast4, row.dueDateYmd),
    );

    if (matched) {
      return { ...row, ...periodFromStatement(matched) };
    }

    return { ...row, ...periodFromDueDateFallback(row.dueDateYmd) };
  });
}
