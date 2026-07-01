export type DueMonthPaidStatus = "all_paid" | "partial" | "unpaid";

export type DueEntryForStatementMonth = {
  statementPeriodKey: string;
  paidAt: Date | null;
};

export function dueMonthPaidSummary(
  entries: DueEntryForStatementMonth[],
  monthKey: string,
): { paidCount: number; totalCount: number } {
  const inMonth = entries.filter(
    (entry) => entry.statementPeriodKey === monthKey,
  );
  return {
    paidCount: inMonth.filter((entry) => entry.paidAt).length,
    totalCount: inMonth.length,
  };
}

export function dueMonthPaidStatus(
  paidCount: number,
  totalCount: number,
): DueMonthPaidStatus {
  if (totalCount === 0) return "unpaid";
  if (paidCount === totalCount) return "all_paid";
  if (paidCount === 0) return "unpaid";
  return "partial";
}
