import { parseMoneyToNumber, receiptRequiresTotalDue } from "@/lib/receipts/payment-threshold";

/** PHP rounding tolerance — matches mark-paid threshold checks. */
export const MONEY_TOLERANCE = 0.005;

export type DuePaymentCoverage =
  | "not_paid"
  | "partial"
  | "minimum_met"
  | "full_paid";

export type PaymentSequence = {
  index: number;
  estimatedTotal: number;
  label: string;
};

export function sumReceiptAmounts(amounts: number[]): number {
  return amounts.reduce(
    (sum, n) => (Number.isFinite(n) && n > 0 ? sum + n : sum),
    0,
  );
}

export function meetsMoneyThreshold(paid: number, due: number): boolean {
  if (!Number.isFinite(due) || due <= 0) return paid > 0;
  return paid + MONEY_TOLERANCE >= due;
}

/**
 * Coverage from cumulative paid amount vs statement minimum/total due.
 * When `requireTotalDue` is true, minimum_met is skipped — threshold is total only.
 */
export function computeDuePaymentCoverage(
  cumulativePaid: number,
  minimumDue: number,
  totalDue: number,
  requireTotalDue = receiptRequiresTotalDue(),
): DuePaymentCoverage {
  if (!Number.isFinite(cumulativePaid) || cumulativePaid <= 0) {
    return "not_paid";
  }

  const meetsTotal =
    Number.isFinite(totalDue) && totalDue > 0
      ? meetsMoneyThreshold(cumulativePaid, totalDue)
      : false;

  if (meetsTotal) return "full_paid";

  const meetsMinimum =
    !requireTotalDue &&
    Number.isFinite(minimumDue) &&
    minimumDue > 0 &&
    meetsMoneyThreshold(cumulativePaid, minimumDue);

  if (meetsMinimum) return "minimum_met";

  return "partial";
}

export function paymentThresholdMet(coverage: DuePaymentCoverage): boolean {
  return coverage === "minimum_met" || coverage === "full_paid";
}

export function isDueFullyPaid(coverage: DuePaymentCoverage): boolean {
  return coverage === "full_paid";
}

/** Estimate payment sequence label e.g. "2/3" from receipt amounts so far. */
export function estimatePaymentSequence(
  amountsIncludingCurrent: number[],
  targetDue: number,
): PaymentSequence {
  const index = amountsIncludingCurrent.length;
  if (index <= 0) {
    return { index: 0, estimatedTotal: 1, label: "1/1" };
  }

  const cumulative = sumReceiptAmounts(amountsIncludingCurrent);
  if (targetDue > 0 && meetsMoneyThreshold(cumulative, targetDue)) {
    return { index, estimatedTotal: index, label: `${index}/${index}` };
  }

  const avgPayment = cumulative / index;
  const remaining = Math.max(0, targetDue - cumulative);
  const paymentsLeft =
    avgPayment > 0 && remaining > 0 ? Math.ceil(remaining / avgPayment) : 0;
  const estimatedTotal = Math.max(index + paymentsLeft, index);

  return {
    index,
    estimatedTotal,
    label: `${index}/${estimatedTotal}`,
  };
}

export function parseDueAmounts(entry: {
  minimumDue: string;
  totalDue: string;
}): { minimumDueValue: number; totalDueValue: number } {
  return {
    minimumDueValue: parseMoneyToNumber(entry.minimumDue),
    totalDueValue: parseMoneyToNumber(entry.totalDue),
  };
}

export function paymentTargetDue(
  minimumDueValue: number,
  totalDueValue: number,
  requireTotalDue = receiptRequiresTotalDue(),
): number {
  if (requireTotalDue && Number.isFinite(totalDueValue) && totalDueValue > 0) {
    return totalDueValue;
  }
  if (Number.isFinite(minimumDueValue) && minimumDueValue > 0) {
    return minimumDueValue;
  }
  if (Number.isFinite(totalDueValue) && totalDueValue > 0) {
    return totalDueValue;
  }
  return 0;
}

export function coverageLabel(coverage: DuePaymentCoverage): string {
  switch (coverage) {
    case "full_paid":
      return "Paid in full";
    case "minimum_met":
      return "Minimum due met";
    case "partial":
      return "Partial payment";
    case "not_paid":
      return "Not paid";
  }
}
