import {
  dueEntryKey as cardDueKey,
  normalizeCardLast4,
} from "@/lib/due/normalize";
import { parsePhpAmount } from "@/lib/utils/format-money";

import { soaPeriodMonthKey } from "./period";

export type SoaStatementForOutstanding = {
  issuerId: string;
  cardLast4: string;
  creditCardId?: string | null;
  statementMonth: number;
  statementYear: number;
  statementDate?: string | null;
  totalDue: string | null;
  minimumDue: string | null;
  dueDateYmd: string | null;
  soaUnavailable?: boolean | null;
  bankLabel?: string | null;
  cardDisplayLabel?: string | null;
};

export type DuePaymentInfo = {
  paidAt: Date | string | null;
  paidAmount: string | null;
  totalDue: string;
  minimumDue: string;
};

export type DuePaymentLookupRow = DuePaymentInfo & {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string;
  statementPeriodKey?: string | null;
  bankLabel?: string | null;
  cardDisplayLabel?: string | null;
};

export type PeriodCardBreakdown = {
  label: string;
  issuerId: string;
  cardLast4: string;
  grossMinimumDue: number;
  minimumRemaining: number;
  minimumMet: boolean;
  markedPaid: boolean;
  outstandingDue: number;
  paidAmount: number;
};

export function dueEntryKey(
  issuerId: string,
  cardLast4: string,
  dueDateYmd: string | null,
): string {
  return `${issuerId.toLowerCase()}:${normalizeCardLast4(cardLast4)}:${dueDateYmd ?? ""}`;
}

function cardPrefix(issuerId: string, cardLast4: string): string {
  return cardDueKey(issuerId, cardLast4);
}

function cardLabel(
  stmt: Pick<
    SoaStatementForOutstanding,
    "issuerId" | "cardLast4" | "bankLabel" | "cardDisplayLabel"
  >,
  payment?: DuePaymentLookupRow | null,
): string {
  const fromPayment =
    payment?.cardDisplayLabel?.trim() || payment?.bankLabel?.trim();
  if (fromPayment) return fromPayment;

  const fromStatement = stmt.cardDisplayLabel?.trim() || stmt.bankLabel?.trim();
  if (fromStatement) return fromStatement;

  return `${stmt.issuerId} · ${normalizeCardLast4(stmt.cardLast4)}`;
}

/**
 * Match a statement to its due-entry payment — same rules as Reminders/Receipts
 * (`isStatementMarkedPaid`), but returns payment amounts for outstanding math.
 */
export function resolvePaymentForStatement(
  stmt: SoaStatementForOutstanding,
  dues: DuePaymentLookupRow[],
): DuePaymentLookupRow | null {
  const statementPeriodKey = soaPeriodMonthKey(
    stmt.statementYear,
    stmt.statementMonth,
  );
  const prefix = cardPrefix(stmt.issuerId, stmt.cardLast4);
  const exactKey = dueEntryKey(stmt.issuerId, stmt.cardLast4, stmt.dueDateYmd);

  const exact = dues.find(
    (due) =>
      dueEntryKey(due.issuerId, due.cardLast4, due.dueDateYmd) === exactKey,
  );
  if (exact) return exact;

  const paidForCard = dues.filter(
    (due) => cardPrefix(due.issuerId, due.cardLast4) === prefix && due.paidAt,
  );

  for (const due of paidForCard) {
    if (due.statementPeriodKey === statementPeriodKey) return due;
    if (due.dueDateYmd.slice(0, 7) === statementPeriodKey) return due;
  }

  return null;
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

  const paidRecorded = payment?.paidAmount
    ? parsePhpAmount(payment.paidAmount)
    : payment?.paidAt
      ? total
      : 0;

  if (!payment?.paidAt && paidRecorded <= 0) {
    return { total, minimum };
  }

  if (payment?.paidAt && !payment.paidAmount) {
    return { total: 0, minimum: 0 };
  }

  if (paidRecorded >= total - 0.01) {
    return { total: 0, minimum: 0 };
  }

  const remainingTotal = Math.max(0, total - paidRecorded);

  if (paidRecorded >= minimum - 0.01) {
    return { total: remainingTotal, minimum: 0 };
  }

  const remainingMinimum = Math.min(
    Math.max(0, minimum - paidRecorded),
    remainingTotal,
  );

  return { total: remainingTotal, minimum: remainingMinimum };
}

/** Recorded payment for one statement (0 when not marked paid). */
export function paidAmountForStatement(
  stmt: Pick<
    SoaStatementForOutstanding,
    "totalDue" | "issuerId" | "cardLast4" | "dueDateYmd"
  >,
  payment?: DuePaymentInfo | null,
): number {
  const stmtTotal = parsePhpAmount(stmt.totalDue);
  const paid = payment?.paidAmount
    ? parsePhpAmount(payment.paidAmount)
    : payment?.paidAt
      ? stmtTotal
      : 0;

  if (paid <= 0) return 0;
  if (stmtTotal <= 0) return paid;
  return Math.min(paid, stmtTotal);
}

/** Sum of recorded payments for all statements in a period range. */
export function computeTotalPaid(
  statements: SoaStatementForOutstanding[],
  dues: DuePaymentLookupRow[],
): number {
  const parsed = statements.filter((s) => !s.soaUnavailable);

  let totalPaid = 0;
  for (const stmt of parsed) {
    const payment = resolvePaymentForStatement(stmt, dues);
    totalPaid += paidAmountForStatement(stmt, payment);
  }

  return totalPaid;
}

export type OutstandingTotals = {
  totalDue: number;
  totalMinimum: number;
  grossStatementDue: number;
  grossMinimumDue: number;
  cardCount: number;
  paidCardCount: number;
  minimumMetCardCount: number;
  nextDueYmd: string | null;
  cards: PeriodCardBreakdown[];
};

function statementOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

function parseStatementDateMs(
  statementDate: string | null | undefined,
): number {
  if (!statementDate || statementDate === "—") return 0;
  const m = statementDate.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return 0;
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
  if (mon === undefined) return 0;
  return new Date(Number(m[3]), mon, Number(m[2])).getTime();
}

function statementRank(stmt: SoaStatementForOutstanding): number {
  return (
    statementOrdinal(stmt.statementYear, stmt.statementMonth) * 1e12 +
    parseStatementDateMs(stmt.statementDate)
  );
}

function cardKey(
  stmt: Pick<
    SoaStatementForOutstanding,
    "issuerId" | "cardLast4" | "creditCardId"
  >,
): string {
  if (stmt.creditCardId) return `id:${stmt.creditCardId}`;
  return cardPrefix(stmt.issuerId, stmt.cardLast4);
}

/**
 * Period outstanding: one balance per card (latest statement in range),
 * minus recorded payments. Avoids double-counting May + June SOA totals.
 */
export function computeOutstandingTotals(
  statements: SoaStatementForOutstanding[],
  dues: DuePaymentLookupRow[],
): OutstandingTotals {
  const parsed = statements.filter((s) => !s.soaUnavailable);

  const latestByCard = new Map<string, SoaStatementForOutstanding>();
  for (const stmt of parsed) {
    const key = cardKey(stmt);
    const existing = latestByCard.get(key);
    if (!existing || statementRank(stmt) > statementRank(existing)) {
      latestByCard.set(key, stmt);
    }
  }

  let totalDue = 0;
  let totalMinimum = 0;
  let grossStatementDue = 0;
  let grossMinimumDue = 0;
  let paidCardCount = 0;
  let minimumMetCardCount = 0;
  const upcomingDues: string[] = [];
  const cards: PeriodCardBreakdown[] = [];

  for (const stmt of latestByCard.values()) {
    const grossMin = parsePhpAmount(stmt.minimumDue);
    const grossTotal = parsePhpAmount(stmt.totalDue);
    grossStatementDue += grossTotal;
    grossMinimumDue += grossMin;

    const payment = resolvePaymentForStatement(stmt, dues);
    const { total, minimum } = outstandingForStatement(stmt, payment);
    const paidAmount = paidAmountForStatement(stmt, payment);
    const markedPaid = Boolean(payment?.paidAt);
    const minimumMet = grossMin <= 0 || minimum <= 0;

    totalDue += total;
    totalMinimum += minimum;
    if (markedPaid) paidCardCount += 1;
    if (minimumMet) minimumMetCardCount += 1;
    if (total > 0 && stmt.dueDateYmd) {
      upcomingDues.push(stmt.dueDateYmd);
    }

    cards.push({
      label: cardLabel(stmt, payment),
      issuerId: stmt.issuerId,
      cardLast4: normalizeCardLast4(stmt.cardLast4),
      grossMinimumDue: grossMin,
      minimumRemaining: minimum,
      minimumMet,
      markedPaid,
      outstandingDue: total,
      paidAmount,
    });
  }

  cards.sort((a, b) => a.label.localeCompare(b.label));
  upcomingDues.sort();

  return {
    totalDue,
    totalMinimum,
    grossStatementDue,
    grossMinimumDue,
    cardCount: latestByCard.size,
    paidCardCount,
    minimumMetCardCount,
    nextDueYmd: upcomingDues[0] ?? null,
    cards,
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
