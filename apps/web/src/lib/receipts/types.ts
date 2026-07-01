export type ReceiptAiSkipReason = "no_keys" | "unavailable" | "no_image";

export const AI_SKIP_NO_KEYS_MESSAGE = "No AI keys configured";

export type ReceiptAiVerdict =
  | "valid"
  | "likely_valid"
  | "unclear"
  | "invalid"
  | "skipped";

export function isReceiptAiPassed(
  verdict: ReceiptAiVerdict | string | null | undefined,
): boolean {
  const v = String(verdict ?? "").toLowerCase();
  return v === "valid" || v === "likely_valid";
}

export type ReceiptAiProvider = "gemini" | "groq";

export type CreditCardReceiptExtraction = {
  cardLast4?: string;
  amount?: number;
  amountRaw?: string;
  bankOrWallet?: string;
  paymentDate?: string;
  referenceNumber?: string;
};

export type CreditCardReceiptAiResult = {
  verdict: ReceiptAiVerdict;
  confidence: number | null;
  summary: string;
  hasAmount: boolean;
  hasDate: boolean;
  hasReference: boolean;
  isCreditCardPayment: boolean;
  extraction: CreditCardReceiptExtraction;
  aiModelError?: string;
  provider?: ReceiptAiProvider;
  skipReason?: ReceiptAiSkipReason;
};

export type ReceiptPaymentStatus =
  | "pending"
  | "marked_paid"
  | "rejected"
  | "ai_error";

export type ReceiptKnownCard = {
  last4: string;
  issuerId: string;
  bankLabel: string;
  displayLabel?: string | null;
};

export type ReceiptDueContext = {
  cardLast4: string;
  issuerId: string;
  bankLabel: string;
  dueDateYmd: string;
  minimumDue: string;
  totalDue: string;
};
