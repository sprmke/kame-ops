// @ts-nocheck
/**
 * Payment receipt OCR for the Telegram bot.
 *
 * Responsibilities:
 *   1. Download a photo/document the user sent to the bot via the Telegram Bot API.
 *   2. OCR the image with Tesseract.js (same engine used for BPI PDF OCR).
 *   3. Heuristically extract the card last-4 digits and the amount paid so the
 *      caller can resolve a DueEntry and decide whether to mark it as paid.
 *
 * Used by: receipts router and Telegram webhook (photo / image-document messages).
 */
import fs from "node:fs";
import path from "node:path";
import { createWorker, PSM } from "tesseract.js";
import { projectPaths } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DownloadedReceipt = {
  /** Absolute path on disk where the image was persisted. */
  filePath: string;
  /** Telegram "file_path" relative portion (e.g. "photos/file_123.jpg"). */
  telegramFilePath: string;
  /** Total bytes downloaded. */
  sizeBytes: number;
};

export type ReceiptOcrResult = {
  text: string;
  /** Average word confidence reported by Tesseract (0–100), or undefined. */
  confidence?: number;
};

export type ParsedReceipt = {
  /** 4-digit string if detected; undefined otherwise. */
  cardLast4?: string;
  /** Numeric amount (peso units). */
  amount?: number;
  /** Raw matched amount string (e.g. "PHP 5,000.00") — for display. */
  amountRaw?: string;
  /** Short excerpt from the OCR output for failure-reply debugging. */
  rawExcerpt: string;
};

// ─── Telegram file download ───────────────────────────────────────────────────

type TgGetFileResp = {
  ok: boolean;
  result?: { file_id: string; file_path?: string; file_size?: number };
  description?: string;
};

/**
 * Fetch the `file_path` for a Telegram file_id, then download the binary from
 * the file CDN and save it under `data/receipts/YYYY-MM/`.
 */
export async function downloadTelegramPhoto(
  token: string,
  fileId: string,
  opts: { receiptsDir?: string; suggestedName?: string } = {},
): Promise<DownloadedReceipt> {
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  const meta = (await metaRes.json().catch(() => ({}))) as TgGetFileResp;
  if (!metaRes.ok || !meta.ok || !meta.result?.file_path) {
    throw new Error(
      meta.description
        ? `Telegram getFile: ${meta.description}`
        : `Telegram getFile: HTTP ${metaRes.status}`,
    );
  }
  const telegramFilePath = meta.result.file_path;

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${telegramFilePath}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!fileRes.ok) {
    throw new Error(`Telegram file download: HTTP ${fileRes.status}`);
  }
  const buf = Buffer.from(await fileRes.arrayBuffer());

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const baseDir =
    opts.receiptsDir && opts.receiptsDir.trim().length > 0
      ? opts.receiptsDir
      : path.join(projectPaths.dataDir, "receipts");
  const dir = path.join(baseDir, ym);
  fs.mkdirSync(dir, { recursive: true });

  const tgExt = path.extname(telegramFilePath).toLowerCase() || ".bin";
  const stem = opts.suggestedName?.replace(/[^A-Za-z0-9._-]+/g, "_") ?? fileId;
  const filePath = path.join(dir, `${stem}${tgExt}`);
  fs.writeFileSync(filePath, buf);

  return {
    filePath,
    telegramFilePath,
    sizeBytes: buf.length,
  };
}

// ─── OCR ──────────────────────────────────────────────────────────────────────

const PSM_VALUES = new Set<string>(Object.values(PSM));

function resolvePsm(raw: string | undefined): PSM {
  const t = raw?.trim() ?? "";
  if (t && PSM_VALUES.has(t)) return t as PSM;
  return PSM.SINGLE_BLOCK;
}

/**
 * Run Tesseract.js on an image file and return the raw recognized text.
 * Default PSM is SINGLE_BLOCK (6), suited for banking-app receipt screenshots.
 */
export async function ocrReceipt(
  imagePath: string,
  psmRaw?: string,
): Promise<ReceiptOcrResult> {
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: resolvePsm(psmRaw),
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(imagePath);
    return {
      text: (data.text ?? "").trim(),
      confidence:
        typeof data.confidence === "number" ? data.confidence : undefined,
    };
  } finally {
    await worker.terminate();
  }
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Convert a money-like string ("PHP 5,000.00", "₱ 1234", "P1,234.50") into a
 * JS number. Returns NaN when the input does not contain digits.
 */
export function parseMoneyToNumber(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** "5,000.00" style token, optional decimals. */
const MONEY_TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/;

/** "PHP 5,000.00" / "₱5,000.00" / "Php 5000" — currency prefix is optional. */
const MONEY_WITH_CURRENCY = new RegExp(
  `(?:PHP|Php|php|₱|P)\\s*(${MONEY_TOKEN.source})`,
);

/**
 * Amount line — matches labeled rows on bank/e-wallet receipts.
 * Covered patterns (case-insensitive):
 *   "Bill Amount PHP 20,920.00"      (GCash → Metrobank / RCBC)
 *   "Order Amount PHP …"
 *   "Transaction Amount PHP …"
 *   "Transfer Amount PHP …"
 *   "Amount PHP …" / "Amount: PHP …"
 *   "Amount Paid PHP …"
 *   "Total PHP …" / "Total Paid PHP …" / "Total Amount PHP …"
 *   "Payment Amount PHP …"           (NOT bare "Payment" — that matches too broadly)
 *   "Your payment worth PHP …"       (BDO sentence, "payment worth")
 *
 * Intentionally excluded:
 *   "Payment Successful!" — bare "Payment" without "amount" or "worth" should
 *   not match because the regex would then consume "3 banking days" and capture "3".
 *   "Paid on …" — "Paid" without a preceding "Amount" is too generic.
 */
const AMOUNT_LINE = new RegExp(
  `\\b(?:` +
    `(?:(?:bill|order|transaction|transfer)\\s+)?amount(?:\\s+paid)?` + // "Amount", "Bill Amount", "Amount Paid"
    `|total(?:\\s+(?:paid|amount))?` + // "Total", "Total Paid", "Total Amount"
    `|payment\\s+(?:amount|worth)` + // "Payment Amount", "payment worth" (NOT bare "Payment")
    `)\\b[^\\d₱]*((?:PHP|Php|php|₱|P)?\\s*${MONEY_TOKEN.source})`,
  "i",
);

/**
 * Extract digits from a string and return the last N (default 4).
 * Returns undefined if the result has fewer than N digits.
 */
function lastNDigits(raw: string, n = 4): string | undefined {
  const d = raw.replace(/\D/g, "");
  return d.length >= n ? d.slice(-n) : undefined;
}

/**
 * Try to read a 16-digit PAN (return last 4) from one OCR slice.
 * Order: labeled lines → bare 16-digit span → masked patterns → known last-4.
 */
function tryPickCardLast4InExcerpt(
  excerpt: string,
  knownLast4s: readonly string[],
): string | undefined {
  // ── 1) Label-based: find a card-number label then grab the 16 digits after it.
  //       Covers:
  //         "16 Digit Acct No. / Card No.   4111111111111111"  (GCash → Metrobank)
  //         "Credit Card Number   4012888888881881"             (GCash → RCBC)
  //         "Customer Number / Card Number  4222222222222222" (GCash → BPI)
  //         "Card No. 4111111111111111"                         (generic)
  //         "Acct. No.: 4333333333333333"                       (MariBank instaPay → UB / P2P)
  //       "acct(?:ount)?\\.?" allows "Acct." before "No."
  const LABEL_RE =
    /\b(?:16[\s-]*digit\s+acct(?:ount)?\s*(?:no\.?|number)?\s*(?:[/\\]\s*card\s*(?:no\.?|number)?)?|customer\s+(?:no\.?|number|#)?\s*\/?\s*card\s*(?:no\.?|number)?|credit\s+card\s*(?:no\.?|number)?|card\s*(?:no\.?|number|#)?|acct(?:ount)?\.?\s*(?:no\.?|number|#)?)\s*:?\s*([\d][\d\s-]{13,21}[\d])/i;
  const lm = excerpt.match(LABEL_RE);
  if (lm?.[1]) {
    const result = lastNDigits(lm[1]);
    if (result) return result;
  }

  // ── 2) Unlabeled full card number: any contiguous span (digits + spaces/dashes)
  //       that strips to exactly 16 digits.
  //       Catches "4333333333333333", "4111 1111 1111 1111",
  //       and split OCR like "411111111111 1111".
  const SPAN_RE = /\b\d[\d\s-]{13,20}\d\b/g;
  for (const m of excerpt.matchAll(SPAN_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 16) return digits.slice(-4);
  }

  // ── 3) Masked card patterns
  const maskedPatterns: RegExp[] = [
    /\*{2,}\s*(\d{4})\b/,
    /x{2,}\s*(\d{4})\b/i,
    /(?:ending|ends?)\s*(?:in|with)?\s*(\d{4})\b/i,
    /\bcard\s*(?:no\.?|number|#)?\s*[*x]{0,4}\s*(\d{4})\b/i,
    /\baccount\s*(?:no\.?|number|#)?\s*[*x]{0,4}\s*(\d{4})\b/i,
  ];
  for (const re of maskedPatterns) {
    const m = excerpt.match(re);
    if (m?.[1]) return m[1];
  }

  // ── 4) knownLast4s fallback: scan for any 4-digit group we recognise
  if (knownLast4s.length > 0) {
    const known = new Set(knownLast4s);
    for (const m of excerpt.matchAll(/\b(\d{4})\b/g)) {
      if (known.has(m[1]!)) return m[1];
    }
  }

  return undefined;
}

function pickCardLast4(
  text: string,
  knownLast4s: readonly string[] = [],
): string | undefined {
  // Replace bullet/dot obscuring characters with *.
  const cleaned = text.replace(/[\u2022\u2043\u25CF\u00B7\u2024\u22C5]/g, "*");

  // Many receipts (e.g. GCash → bank) put the *credit card* above a "From"
  // block and the *source wallet* inside "From". Searching only before "From"
  // avoids masked source-account tails like "••••••••5810".
  //
  // MariBank (and similar) "send to other bank" / instaPay receipts put the
  // *destination* card under "To" / "Acct. No.:" *after* "From", so when the
  // pre-From pass finds nothing we scan the tail starting at "From" as well.
  const fromIdx = cleaned.search(/\bfrom\b/i);
  const beforeFrom = fromIdx > 0 ? cleaned.slice(0, fromIdx) : cleaned;

  const a = tryPickCardLast4InExcerpt(beforeFrom, knownLast4s);
  if (a) return a;

  if (fromIdx > 0) {
    const afterFrom = cleaned.slice(fromIdx);
    const b = tryPickCardLast4InExcerpt(afterFrom, knownLast4s);
    if (b) return b;
  }

  return undefined;
}

function pickAmount(text: string): { amount: number; raw: string } | undefined {
  const labeled = text.match(AMOUNT_LINE);
  if (labeled?.[1]) {
    const raw = labeled[1].trim();
    const n = parseMoneyToNumber(raw);
    if (Number.isFinite(n) && n > 0) return { amount: n, raw };
  }

  const currency = text.match(MONEY_WITH_CURRENCY);
  if (currency?.[0]) {
    const raw = currency[0].trim();
    const n = parseMoneyToNumber(raw);
    if (Number.isFinite(n) && n > 0) return { amount: n, raw };
  }

  // Last resort: pick the largest money-shaped token with a decimal portion.
  // Requiring decimals avoids picking up 4-digit years / reference numbers.
  const candidates: { amount: number; raw: string }[] = [];
  const re = /\b(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\b/g;
  for (const m of text.matchAll(re)) {
    const raw = m[1]!;
    const n = parseMoneyToNumber(raw);
    if (Number.isFinite(n) && n > 0) candidates.push({ amount: n, raw });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.amount - a.amount);
  return candidates[0];
}

/**
 * Extract the card last-4 and amount from OCR text.
 * `knownLast4s` biases the card detector toward digits you actually have.
 */
export function parseReceiptText(
  text: string,
  knownLast4s: readonly string[] = [],
): ParsedReceipt {
  const normalized = text.replace(/\r/g, "");
  const cardLast4 = pickCardLast4(normalized, knownLast4s);
  const picked = pickAmount(normalized);

  const excerpt = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 12)
    .join("\n");

  return {
    cardLast4,
    amount: picked?.amount,
    amountRaw: picked?.raw,
    rawExcerpt: excerpt,
  };
}
