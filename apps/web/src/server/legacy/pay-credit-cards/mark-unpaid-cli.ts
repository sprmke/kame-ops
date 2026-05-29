// @ts-nocheck
/**
 * Interactive terminal command to reverse a "mark as paid" — restores
 * Slack/Telegram daily reminders and Google Calendar events to their original
 * unpaid state.
 *
 * Usage:
 *   npm run mark-unpaid
 *
 * You will be asked:
 *   1. Which credit card (shows a numbered list from CARDS_JSON)
 *   2. Which month and year (e.g. "april 2026")
 *
 * The command then:
 *   - Removes paidAt from the DueEntry so send-reminders resumes
 *   - Deletes suppressed reminder fingerprints so daily pings re-fire
 *   - Restores Google Calendar events to original title, color, and popup reminder
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadCardCredentials } from "./config";
import { log, logBanner } from "./logger";
import {
  buildUnpaidConfirmationMessage,
  markCardUnpaid,
  parseMonthYear,
} from "./mark-paid";

async function main() {
  logBanner("pay-credit-cards · Mark as Unpaid", "Terminal interactive");

  const cards = loadCardCredentials();
  if (cards.length === 0) {
    log.error(
      "No cards found in CARDS_JSON. Check your .env configuration."
    );
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  const qp = log.questionPrefix();

  try {
    // ── Step 1: pick a card ──────────────────────────────────────────────────
    log.header("Select credit card");
    cards.forEach((c, i) => {
      const label = c.label ?? `${c.issuer} ****${c.last4}`;
      log.line(`  ${i + 1}. ${label}`);
    });
    log.line("");

    let card: (typeof cards)[number] | undefined;
    while (!card) {
      const raw = await rl.question(
        `${qp}Enter card number (1–${cards.length}): `
      );
      const n = Number(raw.trim());
      if (Number.isInteger(n) && n >= 1 && n <= cards.length) {
        card = cards[n - 1];
      } else {
        log.warn(`Please enter a number between 1 and ${cards.length}.`);
      }
    }

    const cardLabel = card.label ?? `${card.issuer} ****${card.last4}`;
    log.success(`Selected: ${cardLabel}`);

    // ── Step 2: pick month + year ────────────────────────────────────────────
    log.header("Enter payment month");
    log.detail("Examples: april 2026  |  apr 2026  |  2026-04");
    log.line("");

    let monthYM: string | undefined;
    while (!monthYM) {
      const raw = await rl.question(`${qp}Month and year: `);
      const parsed = parseMonthYear(raw.trim());
      if (parsed) {
        monthYM = parsed;
      } else {
        log.warn(
          `Could not parse "${raw.trim()}". Try formats like "april 2026", "apr 2026", or "2026-04".`
        );
      }
    }

    log.line("");
    log.info(`Marking ${cardLabel} as UNPAID for ${monthYM}…`);
    log.line("");

    // ── Step 3: run the workflow ─────────────────────────────────────────────
    const result = await markCardUnpaid(card.last4, monthYM);
    const msg = buildUnpaidConfirmationMessage(result);

    if (result.ok) {
      log.header("Done");
      for (const line of msg.split("\n")) {
        log.line(line);
      }
    } else {
      log.header("Not completed");
      for (const line of msg.split("\n")) {
        log.warn(line);
      }

      if (result.reason === "not_found") {
        log.line("");
        log.detail(
          "Tip: run `npm run start` or `npm run poll-new-soa` first to " +
            "populate the reminders state from the latest SOA, then try again."
        );
      }
    }
  } finally {
    rl.close();
  }

  log.line("");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
