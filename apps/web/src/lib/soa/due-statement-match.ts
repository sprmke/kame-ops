import { parsePhpAmount } from "@/lib/utils/format-money";

/** Match a due entry to a SOA statement without relying on card last-4. */
export function dueStatementAmountKey(
  issuerId: string,
  dueDateYmd: string | null | undefined,
  totalDue: string | null | undefined,
): string | null {
  const ymd = dueDateYmd?.trim();
  if (!ymd) return null;
  const amount = parsePhpAmount(totalDue ?? "");
  if (amount <= 0) return null;
  return `${issuerId.toLowerCase()}:${ymd}:${amount.toFixed(2)}`;
}

export type DueStatementMatchRow = {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string | null;
  totalDue: string | null;
  creditCardId?: string | null;
  cardDisplayLabel?: string | null;
  bankLabel?: string | null;
};

export function indexStatementsByDueAmount<T extends DueStatementMatchRow>(
  statements: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const stmt of statements) {
    const key = dueStatementAmountKey(
      stmt.issuerId,
      stmt.dueDateYmd,
      stmt.totalDue,
    );
    if (!key) continue;
    map.set(key, stmt);
  }
  return map;
}

export function matchStatementToDueEntry<
  TDue extends { issuerId: string; dueDateYmd: string; totalDue: string },
  TStmt extends DueStatementMatchRow,
>(due: TDue, statementsByAmount: Map<string, TStmt>): TStmt | null {
  const key = dueStatementAmountKey(due.issuerId, due.dueDateYmd, due.totalDue);
  if (!key) return null;
  return statementsByAmount.get(key) ?? null;
}
