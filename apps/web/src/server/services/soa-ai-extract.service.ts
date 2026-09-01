import "server-only";

import {
  parseSoaAiExtractJson,
  type SoaAiExtractResult,
} from "@/lib/soa/ai-extract-parse";

import { aiApiKeyService } from "./ai-api-key.service";
import { GEMINI_MODEL, GROQ_MODEL } from "./receipt-validation.service";

export type { SoaAiExtractResult };

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const LOG_TAG = "soa-ai-extract";

const GROQ_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function shouldTryNext(status: number): boolean {
  return status === 429 || status === 403 || status >= 500;
}

function buildPrompt(
  knownCards: { issuer: string; last4: string; label?: string }[],
) {
  const cardLines = knownCards
    .map(
      (c) => `- ${c.issuer} •••• ${c.last4}${c.label ? ` (${c.label})` : ""}`,
    )
    .join("\n");

  return `You extract Philippine credit-card statement of account (SOA) fields.
Return JSON only:
{
  "issuer_id": "metrobank" | "rcbc" | "bpi" | "unionbank" | null,
  "card_last4": "1234 or null",
  "statement_date": "Mon DD, YYYY or null",
  "due_date": "Mon DD, YYYY or null",
  "minimum_due": "1,234.56 or null",
  "total_due": "1,234.56 or null",
  "transactions": [{ "date": "string", "description": "string", "amount": "1,234.56" }]
}

Rules:
- issuer_id must be one of the four banks or null.
- Prefer matching card_last4 to these known cards when possible:
${cardLines || "- (none)"}
- Amounts are PHP. No currency symbol.
- Include posted purchase/payment lines only, not summary totals.
- If this is not a credit-card SOA, still fill any readable fields and leave the rest null.`;
}

async function callGeminiText(
  apiKey: string,
  prompt: string,
  bodyText: string,
) {
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\nSOA text:\n${bodyText}` }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    if (shouldTryNext(res.status)) return null;
    return null;
  }
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return parseSoaAiExtractJson(
    body.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
  );
}

async function callGeminiVision(
  apiKey: string,
  prompt: string,
  base64: string,
  mime: string,
) {
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return parseSoaAiExtractJson(
    body.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
  );
}

async function callGroqText(apiKey: string, prompt: string, bodyText: string) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "user", content: `${prompt}\n\nSOA text:\n${bodyText}` },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseSoaAiExtractJson(body.choices?.[0]?.message?.content ?? "");
}

async function callGroqVision(
  apiKey: string,
  prompt: string,
  base64: string,
  mime: string,
) {
  if (!GROQ_IMAGE_TYPES.has(mime)) return null;
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseSoaAiExtractJson(body.choices?.[0]?.message?.content ?? "");
}

export const soaAiExtractService = {
  async extractFromText(
    userId: string,
    text: string,
    knownCards: { issuer: string; last4: string; label?: string }[],
  ): Promise<SoaAiExtractResult | null> {
    const trimmed = text.trim().slice(0, 24_000);
    if (!trimmed) return null;
    const { gemini, groq } = await aiApiKeyService.getUserKeysSnapshot(userId);
    if (gemini.length === 0 && groq.length === 0) return null;
    const prompt = buildPrompt(knownCards);

    for (const key of gemini) {
      try {
        const parsed = await callGeminiText(key, prompt, trimmed);
        if (parsed) return parsed;
      } catch (err) {
        console.warn(
          `[${LOG_TAG}] Gemini text failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    for (const key of groq) {
      try {
        const parsed = await callGroqText(key, prompt, trimmed);
        if (parsed) return parsed;
      } catch (err) {
        console.warn(
          `[${LOG_TAG}] Groq text failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return null;
  },

  async extractFromImage(
    userId: string,
    bytes: Buffer,
    mimeType: string,
    knownCards: { issuer: string; last4: string; label?: string }[],
  ): Promise<SoaAiExtractResult | null> {
    const { gemini, groq } = await aiApiKeyService.getUserKeysSnapshot(userId);
    if (gemini.length === 0 && groq.length === 0) return null;
    const prompt = buildPrompt(knownCards);
    const base64 = bytes.toString("base64");
    const mime = mimeType || "image/jpeg";

    for (const key of gemini) {
      try {
        const parsed = await callGeminiVision(key, prompt, base64, mime);
        if (parsed) return parsed;
      } catch (err) {
        console.warn(
          `[${LOG_TAG}] Gemini vision failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    for (const key of groq) {
      try {
        const parsed = await callGroqVision(key, prompt, base64, mime);
        if (parsed) return parsed;
      } catch (err) {
        console.warn(
          `[${LOG_TAG}] Groq vision failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return null;
  },
};
