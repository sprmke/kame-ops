import "server-only";

import type { AiApiKeyVerifyResult } from "@/lib/ai/types";
import type {
  CreditCardReceiptAiResult,
  CreditCardReceiptExtraction,
  ReceiptAiProvider,
  ReceiptAiVerdict,
  ReceiptDueContext,
  ReceiptKnownCard,
} from "@/lib/receipts/types";
import {
  AI_SKIP_NO_KEYS_MESSAGE,
  skippedReceiptAi,
} from "@/lib/receipts/ai-skip";
import { aiApiKeyService } from "./ai-api-key.service";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const geminiKeyIndexByUser = new Map<string, number>();

function shouldTryNextProvider(status: number): boolean {
  return status === 429 || status === 403 || status >= 500;
}

function skipped(summary = "AI validation unavailable") {
  return skippedReceiptAi(summary, "unavailable");
}

function normalizeVerdict(raw: unknown): ReceiptAiVerdict {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    v === "valid" ||
    v === "likely_valid" ||
    v === "unclear" ||
    v === "invalid"
  ) {
    return v;
  }
  return "unclear";
}

function normalizeLast4(raw: unknown): string | undefined {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

function normalizeAmount(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseAiJson(
  text: string,
  defaultSummary: string,
): CreditCardReceiptAiResult | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : null;
    const summary =
      String(parsed.summary ?? "")
        .trim()
        .slice(0, 200) || defaultSummary;

    const extraction: CreditCardReceiptExtraction = {
      cardLast4: normalizeLast4(parsed.card_last4 ?? parsed.cardLast4),
      amount: normalizeAmount(parsed.amount_php ?? parsed.amount),
      amountRaw:
        String(parsed.amount_raw ?? parsed.amountRaw ?? "").trim() || undefined,
      bankOrWallet:
        String(parsed.bank_or_wallet ?? parsed.bankOrWallet ?? "")
          .trim()
          .toLowerCase() || undefined,
      paymentDate:
        String(parsed.payment_date ?? parsed.paymentDate ?? "").trim() ||
        undefined,
      referenceNumber:
        String(
          parsed.reference_number ?? parsed.referenceNumber ?? "",
        ).trim() || undefined,
    };

    return {
      verdict: normalizeVerdict(parsed.verdict),
      confidence,
      summary,
      hasAmount: Boolean(parsed.has_amount ?? extraction.amount),
      hasDate: Boolean(parsed.has_date ?? extraction.paymentDate),
      hasReference: Boolean(parsed.has_reference ?? extraction.referenceNumber),
      isCreditCardPayment: Boolean(
        parsed.is_credit_card_payment ?? parsed.isCreditCardPayment ?? true,
      ),
      extraction,
    };
  } catch {
    return null;
  }
}

function parseGeminiApiError(status: number, errText: string): string {
  let message = `Gemini API returned ${status}`;
  try {
    const parsed = JSON.parse(errText) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    if (errText.trim()) message = errText.trim().slice(0, 240);
  }
  return message;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function normalizeVisionMimeType(mimeType: string, path?: string): string {
  if (mimeType?.startsWith("image/")) return mimeType;
  if (mimeType === "application/pdf") return mimeType;
  const ext = path?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function buildCreditCardReceiptPrompt(
  knownCards: ReceiptKnownCard[],
  dueContext?: ReceiptDueContext,
): string {
  const cardLines =
    knownCards.length > 0
      ? knownCards
          .map(
            (c) =>
              `- ${c.displayLabel ?? c.bankLabel} (${c.issuerId}) ending ${c.last4}`,
          )
          .join("\n")
      : "- (none on file)";

  const dueBlock = dueContext
    ? `
Expected payment target (if this receipt should match it):
- Bank: ${dueContext.bankLabel} (${dueContext.issuerId})
- Card last 4: ${dueContext.cardLast4}
- Due date: ${dueContext.dueDateYmd}
- Minimum due: ${dueContext.minimumDue}
- Total due: ${dueContext.totalDue}
`
    : "";

  return `You are validating a Philippine credit card payment receipt screenshot or PDF.
The payer may use GCash, Maya, MariBank, BDO, Metrobank, BPI, RCBC, Unionbank, or other bank/e-wallet apps to pay a credit card bill.

Known cards for this account:
${cardLines}
${dueBlock}
Analyze the image and return ONLY valid JSON (no markdown) with this exact shape:
{
  "verdict": "valid" | "likely_valid" | "unclear" | "invalid",
  "confidence": number between 0 and 1,
  "summary": "one short sentence for the user",
  "has_amount": boolean,
  "has_date": boolean,
  "has_reference": boolean,
  "is_credit_card_payment": boolean,
  "card_last4": "1234 or null",
  "amount_php": number or null,
  "amount_raw": "PHP 5,000.00 or null",
  "bank_or_wallet": "gcash|maya|metrobank|bpi|rcbc|unionbank|bdo|maribank|other|null",
  "payment_date": "YYYY-MM-DD or null",
  "reference_number": "string or null"
}

Extraction rules (Philippine bank/e-wallet receipts):
- card_last4: last 4 digits of the DESTINATION credit card. Look for labels like "16 Digit Acct No", "Card No", "Credit Card Number", "Customer Number / Card Number", "Acct. No.", masked patterns (*1234, xxxx 1234), or a full 16-digit PAN.
- For GCash/Maya receipts, the credit card is often ABOVE a "From" block; the source wallet account below "From" is NOT the card number.
- For MariBank/instaPay "send to other bank" receipts, the destination card may appear under "To" / "Acct. No." AFTER "From".
- amount_php: the bill payment amount in pesos. Prefer labeled lines: "Bill Amount", "Order Amount", "Transaction Amount", "Transfer Amount", "Amount Paid", "Total", "Total Paid", "Payment Amount", "Your payment worth". Ignore bare "Payment Successful" headers.
- bank_or_wallet: the app or bank shown on the receipt (source app or destination bank).

Verdict rules:
- "valid": clear credit card bill payment screenshot with recognizable amount and card destination.
- "likely_valid": probably a CC payment but blurry, cropped, or missing one field.
- "unclear": cannot tell if this is a credit card payment proof.
- "invalid": clearly NOT a payment receipt (random photo, chat, ID only, unrelated).
- summary: plain English, max 120 characters, no line breaks.`;
}

async function tryGeminiKey(
  apiKey: string,
  prompt: string,
  base64: string,
  safeMime: string,
  logTag: string,
): Promise<CreditCardReceiptAiResult | null> {
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: safeMime, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (shouldTryNextProvider(res.status)) {
        console.warn(
          `[${logTag}] Gemini key exhausted/error (${res.status}), trying next...`,
        );
        return null;
      }
      const detail = parseGeminiApiError(res.status, errText);
      console.warn(`[${logTag}] Gemini API error (${res.status}):`, detail);
      return null;
    }

    const body = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parseAiJson(text, "Receipt analyzed.");
    if (!parsed) {
      console.warn(`[${logTag}] Gemini returned unreadable JSON, trying next…`);
      return null;
    }

    return { ...parsed, provider: "gemini" satisfies ReceiptAiProvider };
  } catch (err) {
    console.warn(
      `[${logTag}] Gemini key threw:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function tryGroq(
  groqKey: string,
  prompt: string,
  base64: string,
  safeMime: string,
  logTag: string,
): Promise<CreditCardReceiptAiResult | null> {
  if (!GROQ_SUPPORTED_MIME_TYPES.has(safeMime)) {
    console.warn(
      `[${logTag}] Groq skipped — unsupported MIME type: ${safeMime}`,
    );
    return null;
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${safeMime};base64,${base64}` },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (shouldTryNextProvider(res.status)) {
        console.warn(`[${logTag}] Groq rate-limited/error (${res.status})`);
        return null;
      }
      console.warn(`[${logTag}] Groq API error (${res.status})`);
      return null;
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseAiJson(text, "Receipt analyzed.");
    if (!parsed) {
      console.warn(`[${logTag}] Groq returned unreadable JSON, trying next…`);
      return null;
    }

    return { ...parsed, provider: "groq" satisfies ReceiptAiProvider };
  } catch (err) {
    console.error(`[${logTag}] Groq unexpected error:`, err);
    return null;
  }
}

async function callVisionProviders(
  userId: string,
  prompt: string,
  imageBytes: Uint8Array,
  mimeType: string,
  logTag: string,
): Promise<CreditCardReceiptAiResult> {
  // User-scoped keys from Settings only (ai_api_keys) — no process.env fallback.
  const { gemini: geminiKeys, groq: groqKeys } =
    await aiApiKeyService.getUserKeysSnapshot(userId);

  if (geminiKeys.length === 0 && groqKeys.length === 0) {
    console.warn(`[${logTag}] No AI API keys configured — skipping`);
    return skippedReceiptAi(AI_SKIP_NO_KEYS_MESSAGE, "no_keys");
  }
  if (!imageBytes?.length) {
    return skippedReceiptAi("No image data to validate", "no_image");
  }

  const safeMime = normalizeVisionMimeType(mimeType);
  const base64 = bytesToBase64(imageBytes);

  if (geminiKeys.length > 0) {
    const startIdx =
      (geminiKeyIndexByUser.get(userId) ?? 0) % geminiKeys.length;
    for (let i = 0; i < geminiKeys.length; i++) {
      const idx = (startIdx + i) % geminiKeys.length;
      const result = await tryGeminiKey(
        geminiKeys[idx]!,
        prompt,
        base64,
        safeMime,
        logTag,
      );
      if (result) {
        geminiKeyIndexByUser.set(userId, (idx + 1) % geminiKeys.length);
        return result;
      }
    }
    console.warn(
      `[${logTag}] All ${geminiKeys.length} Gemini key(s) failed, trying Groq fallback...`,
    );
  }

  if (groqKeys.length > 0) {
    for (const groqKey of groqKeys) {
      const result = await tryGroq(groqKey, prompt, base64, safeMime, logTag);
      if (result) return result;
    }
  }

  console.warn(`[${logTag}] All AI providers exhausted`);
  return skipped();
}

export function shouldPersistReceiptValidation(
  result: CreditCardReceiptAiResult,
): boolean {
  return !result.aiModelError;
}

export function formatReceiptVerdictLabel(
  verdict: ReceiptAiVerdict | string | null | undefined,
): string {
  switch (String(verdict ?? "").toLowerCase()) {
    case "valid":
      return "Valid";
    case "likely_valid":
      return "Likely valid";
    case "unclear":
      return "Unclear";
    case "invalid":
      return "Invalid";
    case "skipped":
      return "Not checked";
    default:
      return "Unknown";
  }
}

export async function validateCreditCardReceiptImage(
  userId: string,
  imageBytes: Uint8Array,
  mimeType: string,
  opts: {
    knownCards?: ReceiptKnownCard[];
    dueContext?: ReceiptDueContext;
  } = {},
): Promise<CreditCardReceiptAiResult> {
  const prompt = buildCreditCardReceiptPrompt(
    opts.knownCards ?? [],
    opts.dueContext,
  );
  return callVisionProviders(
    userId,
    prompt,
    imageBytes,
    mimeType,
    "cc-receipt-validation",
  );
}

function parseGroqApiError(status: number, errText: string): string {
  let message = `Groq API returned ${status}`;
  try {
    const parsed = JSON.parse(errText) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    if (errText.trim()) message = errText.trim().slice(0, 240);
  }
  return message;
}

export async function verifyGeminiApiKey(
  apiKey: string,
): Promise<AiApiKeyVerifyResult> {
  const base: AiApiKeyVerifyResult = {
    provider: "gemini",
    model: GEMINI_MODEL,
    ok: false,
  };

  const started = Date.now();
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with exactly: ok" }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const latencyMs = Date.now() - started;
    const statusCode = res.status;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ...base,
        latencyMs,
        statusCode,
        error: parseGeminiApiError(statusCode, errText),
      };
    }

    await res.json().catch(() => ({}));
    return { ...base, ok: true, latencyMs, statusCode };
  } catch (err) {
    return {
      ...base,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function verifyGroqApiKey(
  apiKey: string,
): Promise<AiApiKeyVerifyResult> {
  const base: AiApiKeyVerifyResult = {
    provider: "groq",
    model: GROQ_MODEL,
    ok: false,
  };

  const started = Date.now();
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        temperature: 0,
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const latencyMs = Date.now() - started;
    const statusCode = res.status;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ...base,
        latencyMs,
        statusCode,
        error: parseGroqApiError(statusCode, errText),
      };
    }

    await res.json().catch(() => ({}));
    return { ...base, ok: true, latencyMs, statusCode };
  } catch (err) {
    return {
      ...base,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
