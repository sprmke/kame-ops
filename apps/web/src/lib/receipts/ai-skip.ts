import type {
  CreditCardReceiptAiResult,
  ReceiptAiSkipReason,
} from "@/lib/receipts/types";

export { AI_SKIP_NO_KEYS_MESSAGE } from "@/lib/receipts/types";

export function skippedReceiptAi(
  summary: string,
  skipReason: ReceiptAiSkipReason,
): CreditCardReceiptAiResult {
  return {
    verdict: "skipped",
    confidence: null,
    summary,
    hasAmount: false,
    hasDate: false,
    hasReference: false,
    isCreditCardPayment: false,
    extraction: {},
    skipReason,
  };
}

export function isReceiptAiSkippedNoKeys(
  ai: Pick<CreditCardReceiptAiResult, "verdict" | "skipReason">,
): boolean {
  return ai.verdict === "skipped" && ai.skipReason === "no_keys";
}

export function isReceiptAiSkipped(
  ai: Pick<CreditCardReceiptAiResult, "verdict">,
): boolean {
  return ai.verdict === "skipped";
}
