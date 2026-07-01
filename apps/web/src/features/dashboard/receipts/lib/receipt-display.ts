import { formatPhpAmount, parsePhpAmount } from "@/lib/utils/format-money";

import type { ReceiptListItem } from "./receipt-utils";

export type ChecklistState = "pass" | "fail" | "unknown";

export type ReceiptValidationCheck = {
  id: string;
  label: string;
  state: ChecklistState;
  detail?: string;
};

export type ReceiptPaymentCoverage = {
  paidAmount: number;
  totalDue: number;
  minimumDue: number;
  paidLabel: string;
  totalLabel: string;
  coverageLabel: "full" | "minimum" | "below_minimum" | "unknown";
  coverageText: string;
  progressPercent: number;
};

function monthNameFromYmd(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-PH", { month: "long" });
}

function resolveBankName(receipt: ReceiptListItem): string {
  if (receipt.bankLabel) return receipt.bankLabel;
  if (receipt.cardDisplayLabel) {
    return receipt.cardDisplayLabel.split(/\s+/)[0] ?? receipt.cardDisplayLabel;
  }
  if (receipt.bankDetected) return receipt.bankDetected;
  return "Card";
}

function resolvePaymentMonth(receipt: ReceiptListItem): string {
  const fromPeriod = receipt.statementPeriodLabel?.split(" ")[0];
  if (fromPeriod) return fromPeriod;

  const fromDue = monthNameFromYmd(receipt.dueDateYmd);
  if (fromDue) return fromDue;

  const paymentDate = receipt.aiAnalysis?.paymentDate;
  if (paymentDate) {
    const fromPayment = monthNameFromYmd(paymentDate);
    if (fromPayment) return fromPayment;
  }

  return new Date(receipt.createdAt).toLocaleDateString("en-PH", {
    month: "long",
  });
}

export function formatReceiptCardTitle(receipt: ReceiptListItem): string {
  const bank = resolveBankName(receipt);
  const last4 = receipt.parsedCardLast4 ?? "????";
  const month = resolvePaymentMonth(receipt);
  return `${bank} - ${last4} - ${month} Payment`;
}

export function buildReceiptPaymentCoverage(
  receipt: ReceiptListItem,
): ReceiptPaymentCoverage | null {
  const paidAmount =
    receipt.parsedAmount ?? parsePhpAmount(receipt.parsedAmountRaw) ?? 0;
  const totalDue = parsePhpAmount(receipt.totalDue);
  const minimumDue = parsePhpAmount(receipt.minimumDue);

  if (paidAmount <= 0 && totalDue <= 0 && minimumDue <= 0) {
    return null;
  }

  const paidLabel =
    paidAmount > 0
      ? formatPhpAmount(paidAmount)
      : parsePhpAmount(receipt.parsedAmountRaw) > 0
        ? formatPhpAmount(parsePhpAmount(receipt.parsedAmountRaw))
        : "—";
  const totalLabel = totalDue > 0 ? formatPhpAmount(totalDue) : "—";

  let coverageLabel: ReceiptPaymentCoverage["coverageLabel"] = "unknown";
  let coverageText = "Amount unverified";
  let progressPercent = 0;

  if (paidAmount > 0 && totalDue > 0) {
    progressPercent = Math.min(100, Math.round((paidAmount / totalDue) * 100));
    if (paidAmount >= totalDue * 0.995) {
      coverageLabel = "full";
      coverageText = "Full statement due";
    } else if (minimumDue > 0 && paidAmount >= minimumDue * 0.995) {
      coverageLabel = "minimum";
      coverageText = "Minimum due only";
    } else {
      coverageLabel = "below_minimum";
      coverageText = "Below minimum due";
    }
  } else if (paidAmount > 0) {
    coverageText = "Paid amount detected";
    progressPercent = 100;
  }

  return {
    paidAmount,
    totalDue,
    minimumDue,
    paidLabel,
    totalLabel,
    coverageLabel,
    coverageText,
    progressPercent,
  };
}

export function coverageBadgeVariant(
  coverage: ReceiptPaymentCoverage,
): "success" | "warning" | "muted" | "destructive" {
  switch (coverage.coverageLabel) {
    case "full":
      return "success";
    case "minimum":
      return "warning";
    case "below_minimum":
      return "destructive";
    default:
      return "muted";
  }
}

function paymentDatesAlign(
  paymentDate: string | undefined,
  dueDateYmd: string | null,
): ChecklistState {
  if (!paymentDate || !dueDateYmd) return "unknown";
  return paymentDate.slice(0, 7) === dueDateYmd.slice(0, 7) ? "pass" : "fail";
}

export function buildReceiptValidationChecks(
  receipt: ReceiptListItem,
): ReceiptValidationCheck[] {
  const analysis = receipt.aiAnalysis;
  const coverage = buildReceiptPaymentCoverage(receipt);

  const cardMatched =
    receipt.parsedCardLast4 &&
    (receipt.dueDateYmd || receipt.cardDisplayLabel || receipt.bankLabel)
      ? "pass"
      : receipt.parsedCardLast4
        ? "unknown"
        : "fail";

  const checks: ReceiptValidationCheck[] = [
    {
      id: "payment_type",
      label: "Credit card payment",
      state: analysis?.isCreditCardPayment
        ? "pass"
        : analysis?.isCreditCardPayment === false
          ? "fail"
          : "unknown",
    },
    {
      id: "card_match",
      label: "Card number matched",
      state: cardMatched,
      detail: receipt.parsedCardLast4
        ? `···· ${receipt.parsedCardLast4}`
        : undefined,
    },
    {
      id: "amount_detected",
      label: "Amount detected",
      state: analysis?.hasAmount
        ? "pass"
        : analysis?.hasAmount === false
          ? "fail"
          : "unknown",
      detail: receipt.parsedAmountRaw ?? undefined,
    },
    {
      id: "date_visible",
      label: "Payment date visible",
      state: analysis?.hasDate
        ? "pass"
        : analysis?.hasDate === false
          ? "fail"
          : "unknown",
      detail: analysis?.paymentDate ?? undefined,
    },
    {
      id: "date_match",
      label: "Date matches due period",
      state: paymentDatesAlign(analysis?.paymentDate, receipt.dueDateYmd),
    },
    {
      id: "minimum_due",
      label: "Meets minimum due",
      state:
        coverage && coverage.minimumDue > 0
          ? coverage.paidAmount >= coverage.minimumDue * 0.995
            ? "pass"
            : coverage.paidAmount > 0
              ? "fail"
              : "unknown"
          : "unknown",
    },
    {
      id: "full_due",
      label: "Full statement due paid",
      state:
        coverage && coverage.totalDue > 0
          ? coverage.paidAmount >= coverage.totalDue * 0.995
            ? "pass"
            : coverage.paidAmount > 0
              ? "fail"
              : "unknown"
          : "unknown",
    },
    {
      id: "reference",
      label: "Reference number",
      state: analysis?.hasReference
        ? "pass"
        : analysis?.hasReference === false
          ? "fail"
          : "unknown",
      detail: analysis?.referenceNumber ?? undefined,
    },
  ];

  return checks;
}

export function isPdfReceipt(name: string | null | undefined): boolean {
  return Boolean(name?.toLowerCase().endsWith(".pdf"));
}
