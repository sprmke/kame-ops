import { dueEntryKey } from "@/lib/soa/outstanding";
import { soaPeriodMonthKey } from "@/lib/soa/period";

export type StatementPaidMatchInput = {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string | null;
  statementMonth: number;
  statementYear: number;
};

export type DueEntryPaidMatchInput = {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string;
  paidAt: Date | string | null;
  statementPeriodKey?: string | null;
};

function cardPrefix(issuerId: string, cardLast4: string): string {
  return `${issuerId.toLowerCase()}:${cardLast4}`;
}

/**
 * Whether a SOA statement should show as paid — aligned with Reminders/Receipts.
 * Matches exact due-date keys first, then card + statement billing month when
 * the SOA due date is missing or phrased as "Pls Pay Immediately".
 */
export function isStatementMarkedPaid(
  statement: StatementPaidMatchInput,
  dues: DueEntryPaidMatchInput[],
): boolean {
  const paidDues = dues.filter((due) => due.paidAt);
  if (paidDues.length === 0) return false;

  const statementKey = dueEntryKey(
    statement.issuerId,
    statement.cardLast4,
    statement.dueDateYmd,
  );
  if (
    paidDues.some(
      (due) =>
        dueEntryKey(due.issuerId, due.cardLast4, due.dueDateYmd) ===
        statementKey,
    )
  ) {
    return true;
  }

  const statementPeriodKey = soaPeriodMonthKey(
    statement.statementYear,
    statement.statementMonth,
  );
  const prefix = cardPrefix(statement.issuerId, statement.cardLast4);

  return paidDues.some((due) => {
    if (cardPrefix(due.issuerId, due.cardLast4) !== prefix) return false;
    if (due.statementPeriodKey === statementPeriodKey) return true;
    return due.dueDateYmd.slice(0, 7) === statementPeriodKey;
  });
}
