export type ReceiptAiVerdict =
  | "valid"
  | "likely_valid"
  | "unclear"
  | "invalid"
  | "skipped";

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

export type GeminiIntegrationVerifyResult = {
  apiKeyConfigured: boolean;
  model: string;
  ok: boolean;
  latencyMs?: number;
  statusCode?: number;
  error?: string;
  geminiKeysCount?: number;
  groqConfigured?: boolean;
};

export type ReceiptAiSecretsStatus = {
  geminiApiKeyConfigured: boolean;
  geminiKeysCount: number;
  groqApiKeyConfigured: boolean;
  model: string;
};
