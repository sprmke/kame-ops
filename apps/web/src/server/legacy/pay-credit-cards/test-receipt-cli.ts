// @ts-nocheck
/**
 * Local dry-run CLI for testing receipt OCR + parsing without the Telegram bot.
 *
 * Usage:
 *   npm run test-receipt -- path/to/receipt.png
 *   npm run test-receipt -- path/to/receipt.png "april 2026"
 *
 * The command:
 *   1. Runs Tesseract OCR on the image
 *   2. Parses card last-4 and amount
 *   3. Looks up the matching DueEntry (same logic as the bot)
 *   4. Shows what would have happened WITHOUT marking anything paid
 *
 * Nothing is written to state or Google Calendar — this is read-only.
 */
import path from "node:path";
import { loadState } from "./due-reminders-state";
import { log, logBanner } from "./logger";
import {
  buildReceiptConfirmationMessage,
  markCardPaidFromReceipt,
} from "./mark-paid";
import { ocrReceipt, parseReceiptText } from "./receipt-ocr";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const imagePath = args[0];
  const caption = args[1];

  if (!imagePath) {
    log.error(
      "Usage: npm run test-receipt -- path/to/image.png [\"caption month\"]"
    );
    process.exit(1);
  }

  const resolvedPath = path.resolve(imagePath);

  logBanner("pay-credit-cards · Test Receipt", "Dry run — nothing will change");
  log.kv("Image", resolvedPath);
  if (caption) log.kv("Caption", caption);
  log.line("");

  // ── Step 1: OCR ─────────────────────────────────────────────────────────────
  log.header("OCR");
  log.info("Running Tesseract… (this may take 10–30 seconds)");
  const ocr = await ocrReceipt(resolvedPath);
  log.kv(
    "Confidence",
    ocr.confidence !== undefined ? `${Math.round(ocr.confidence)}%` : "—"
  );
  log.line("");
  log.line("─── Raw OCR text ───────────────────────────────────────");
  for (const line of ocr.text.split("\n")) {
    log.line(`  ${line}`);
  }
  log.line("────────────────────────────────────────────────────────");
  log.line("");

  // ── Step 2: Parse ────────────────────────────────────────────────────────────
  log.header("Parsing");
  const knownLast4s = Array.from(
    new Set(loadState().dues.map((d) => d.cardLast4))
  );
  log.kv("Known card last-4s", knownLast4s.length > 0 ? knownLast4s.join(", ") : "(none in state)");
  const parsed = parseReceiptText(ocr.text, knownLast4s);
  log.kv("Card last-4 detected", parsed.cardLast4 ?? "(not found)");
  log.kv("Amount detected", parsed.amountRaw ?? "(not found)");
  log.line("");

  // ── Step 3: Simulate mark-as-paid ────────────────────────────────────────────
  log.header("Simulated result (read-only)");
  const result = await markCardPaidFromReceipt(parsed, {
    caption,
    skipCalendar: true,
  });
  const msg = buildReceiptConfirmationMessage(result);
  for (const line of msg.split("\n")) {
    log.line(line);
  }

  if (result.ok) {
    log.line("");
    log.warn("Dry run — nothing was marked paid. Run the bot normally to process real receipts.");
  }

  log.line("");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
