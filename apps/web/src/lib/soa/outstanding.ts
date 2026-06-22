import { parsePhpAmount } from "@/lib/utils/format-money";

export type SoaStatementForOutstanding = {
  issuerId: string;
  cardLast4: string;
  statementMonth: number;
  statementYear: number;
  totalDue: string | null;
  minimumDue: string | null;
  dueDateYmd: string | null;
  soaUnavailable?: boolean | null;
};

export type DuePaymentInfo = {
  paidAt: Date | string | null;
  paidAmount: string | null;
  totalDue: string;
  minimumDue: string;
};

export function dueEntryKey(
  issuerId: string,
  cardLast4: string,
  dueDateYmd: string | null,
): string {
  return `${issuerId.toLowerCase()}:${cardLast4}:${dueDateYmd ?? ""}`;
}

function cardKey(issuerId: string, cardLast4: string): string {
  return `${issuerId.toLowerCase()}:${cardLast4}`;
}

function statementOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * Outstanding balance for one statement after mark-paid / partial payment.
 * When paidAt is set without paidAmount, treat as fully settled (legacy sync).
 */
export function outstandingForStatement(
  stmt: Pick<
    SoaStatementForOutstanding,
    "totalDue" | "minimumDue" | "issuerId" | "cardLast4" | "dueDateYmd"
  >,
  payment?: DuePaymentInfo | null,
): { total: number; minimum: number } {
  const total = parsePhpAmount(stmt.totalDue);
  const minimum = parsePhpAmount(stmt.minimumDue);
  if (total <= 0) return { total: 0, minimum: 0 };
  if (!payment?.paidAt) return { total, minimum };

  const paidRecorded = payment.paidAmount
    ? parsePhpAmount(payment.paidAmount)
    : total;

  if (paidRecorded >= total - 0.01) {
    return { total: 0, minimum: 0 };
  }

  const remainingTotal = Math.max(0, total - paidRecorded);
  const remainingMinimum = Math.min(minimum, remainingTotal);

  return { total: remainingTotal, minimum: remainingMinimum };
}

export type OutstandingTotals = {
  totalDue: number;
  totalMinimum: number;
  cardCount: number;
  nextDueYmd: string | null;
};

/**
 * Period outstanding: one balance per card (latest statement in range),
 * minus recorded payments. Avoids double-counting May + June SOA totals.
 */
export function computeOutstandingTotals(
  statements: SoaStatementForOutstanding[],
  paymentByDueKey: Map<string, DuePaymentInfo>,
): OutstandingTotals {
  const parsed = statements.filter((s) => !s.soaUnavailable);

  const latestByCard = new Map<string, SoaStatementForOutstanding>();
  for (const stmt of parsed) {
    const key = cardKey(stmt.issuerId, stmt.cardLast4);
    const existing = latestByCard.get(key);
    if (
      !existing ||
      statementOrdinal(stmt.statementYear, stmt.statementMonth) >
        statementOrdinal(existing.statementYear, existing.statementMonth)
    ) {
      latestByCard.set(key, stmt);
    }
  }

  let totalDue = 0;
  let totalMinimum = 0;
  const upcomingDues: string[] = [];

  for (const stmt of latestByCard.values()) {
    const dueKey = dueEntryKey(stmt.issuerId, stmt.cardLast4, stmt.dueDateYmd);
    const payment = paymentByDueKey.get(dueKey);
    const { total, minimum } = outstandingForStatement(stmt, payment);
    totalDue += total;
    totalMinimum += minimum;
    if (total > 0 && stmt.dueDateYmd) {
      upcomingDues.push(stmt.dueDateYmd);
    }
  }

  upcomingDues.sort();

  return {
    totalDue,
    totalMinimum,
    cardCount: latestByCard.size,
    nextDueYmd: upcomingDues[0] ?? null,
  };
}

/** Sum of statement totals for one calendar month (historical section header). */
export function computeStatementMonthTotals(
  statements: SoaStatementForOutstanding[],
): { totalDue: number; totalMinimum: number; cardCount: number } {
  const parsed = statements.filter((s) => !s.soaUnavailable);
  return {
    totalDue: parsed.reduce((sum, s) => sum + parsePhpAmount(s.totalDue), 0),
    totalMinimum: parsed.reduce(
      (sum, s) => sum + parsePhpAmount(s.minimumDue),
      0,
    ),
    cardCount: parsed.length,
  };
}
