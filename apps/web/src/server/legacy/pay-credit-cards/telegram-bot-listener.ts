// @ts-nocheck
/**
 * Telegram bot listener — polls getUpdates and handles "mark as paid" commands.
 *
 * Message format (case-insensitive):
 *   xxxx - april 2026 - paid
 *   xxxx - apr 2026 - paid
 *   xxxx - 2026-04 - paid
 *
 * Where xxxx is the last 4 digits of the credit card.
 *
 * When matched, the bot:
 *   1. Silences all pending daily reminders for that card/month
 *   2. Updates Google Calendar events to "✅ PAID" + removes popup reminders
 *   3. Replies to the chat with a confirmation message
 *
 * Usage:
 *   npm run telegram-bot           # long-running daemon (Ctrl+C to stop)
 *   npm run telegram-bot -- --once  # process pending updates then exit
 *
 * Schedule with launchd / pm2 for always-on operation (see docs/PAID-WORKFLOW.md).
 */
import fs from "node:fs";
import path from "node:path";
import { notifyConfig, projectPaths, receiptConfig } from "./config";
import { loadState } from "./due-reminders-state";
import { log, logBanner } from "./logger";
import {
  buildPaidConfirmationMessage,
  buildReceiptConfirmationMessage,
  buildUnpaidConfirmationMessage,
  markCardPaid,
  markCardPaidFromReceipt,
  markCardUnpaid,
  parsePaidMessage,
  parseUnpaidMessage,
} from "./mark-paid";
import {
  downloadTelegramPhoto,
  ocrReceipt,
  parseReceiptText,
} from "./receipt-ocr";

const POLL_TIMEOUT_SEC = 30;
const STATE_FILE = path.join(projectPaths.dataDir, "telegram-bot-state.json");

// ─── State ────────────────────────────────────────────────────────────────────

type BotState = { offset: number };

function loadBotState(): BotState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as {
        offset?: number;
      };
      if (typeof raw.offset === "number") return { offset: raw.offset };
    }
  } catch {
    // ignore
  }
  return { offset: 0 };
}

function saveBotState(state: BotState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// ─── Telegram API helpers ─────────────────────────────────────────────────────

type TgPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  width: number;
  height: number;
};

type TgDocument = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
};

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: TgPhotoSize[];
    document?: TgDocument;
    from?: { first_name?: string; username?: string };
  };
};

async function getUpdates(
  token: string,
  offset: number
): Promise<TgUpdate[]> {
  const url =
    `https://api.telegram.org/bot${token}/getUpdates` +
    `?timeout=${POLL_TIMEOUT_SEC}&offset=${offset}&allowed_updates=["message"]`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout((POLL_TIMEOUT_SEC + 10) * 1000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: TgUpdate[];
    description?: string;
    error_code?: number;
  };
  if (!res.ok || !data.ok) {
    const detail =
      typeof data.description === "string" && data.description.length > 0
        ? ` — ${data.description}`
        : "";
    const code =
      typeof data.error_code === "number" ? ` (error_code ${data.error_code})` : "";
    throw new Error(
      `Telegram getUpdates failed: HTTP ${res.status}${code}${detail}`
    );
  }
  return data.result ?? [];
}

/** Sends a reply and returns the sent message_id (for later editing). */
async function sendReply(
  token: string,
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<number | undefined> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };
  if (replyToMessageId !== undefined) {
    body.reply_to_message_id = replyToMessageId;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: number };
  };
  if (!res.ok || !data.ok) {
    throw new Error(
      data.description
        ? `Telegram sendMessage: ${data.description}`
        : `Telegram sendMessage: HTTP ${res.status}`
    );
  }
  return data.result?.message_id;
}

/**
 * Edits a previously sent bot message in-place (Telegram editMessageText).
 * Falls back silently so the caller can send a fresh reply if this fails.
 */
async function editMessage(
  token: string,
  chatId: number,
  messageId: number,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as {
        description?: string;
      };
      log.warn(
        `editMessage failed: ${d.description ?? `HTTP ${res.status}`}`
      );
      return false;
    }
    return true;
  } catch (e) {
    log.warn(
      `editMessage error: ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}

/**
 * Updates a pending acknowledgment message with the final result text.
 * If the edit fails (e.g. message too old, network error), sends a new reply
 * so the user always sees the outcome.
 */
async function resolveAck(
  token: string,
  chatId: number,
  ackMessageId: number | undefined,
  replyToMessageId: number,
  finalText: string
): Promise<void> {
  if (ackMessageId !== undefined) {
    const edited = await editMessage(token, chatId, ackMessageId, finalText);
    if (edited) return;
  }
  // Fallback: send fresh reply
  try {
    await sendReply(token, chatId, finalText, replyToMessageId);
  } catch (e) {
    log.warn(
      `Could not send reply: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/**
 * Send a plain message to the configured TELEGRAM_CHAT_ID (not as a reply).
 * Used for proactive notifications (e.g. startup). Fails silently so a missing
 * chat-id or a temporary API error never prevents the bot from starting.
 */
async function sendNotification(token: string, text: string): Promise<void> {
  const chatId = notifyConfig.telegramChatId;
  if (!chatId) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as {
        description?: string;
      };
      log.warn(
        `Startup notification failed: ${d.description ?? `HTTP ${res.status}`}`
      );
    }
  } catch (e) {
    log.warn(
      `Startup notification error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/**
 * Best-effort "typing…" indicator. Fails silently: this is cosmetic.
 */
async function sendChatAction(
  token: string,
  chatId: number,
  action: "typing" | "upload_photo" = "typing"
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // non-fatal
  }
}

// ─── Update handlers ──────────────────────────────────────────────────────────

function senderLabel(msg: NonNullable<TgUpdate["message"]>): string {
  return (
    msg.from?.first_name ?? msg.from?.username ?? String(msg.chat.id)
  );
}

async function handleTextUpdate(
  token: string,
  msg: NonNullable<TgUpdate["message"]> & { text: string }
): Promise<void> {
  const text = msg.text;

  // ── "xxxx - month - unpaid" ───────────────────────────────────────────────
  const unparsed = parseUnpaidMessage(text);
  if (unparsed) {
    log.info(
      `Received unpaid command from ${senderLabel(msg)}: "${text.trim()}"`
    );

    // Acknowledge immediately so the user knows the command was received.
    let ackId: number | undefined;
    try {
      ackId = await sendReply(
        token,
        msg.chat.id,
        `⏳ Reverting \`****${unparsed.cardLast4}\` for *${unparsed.monthYM}*…`,
        msg.message_id
      );
    } catch (e) {
      log.warn(
        `Could not send ack: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    let reply: string;
    try {
      const result = await markCardUnpaid(
        unparsed.cardLast4,
        unparsed.monthYM
      );
      reply = buildUnpaidConfirmationMessage(result);
      if (result.ok) {
        log.success(
          `Unpaid: ****${unparsed.cardLast4} ${unparsed.monthYM} — ` +
            `${result.remindersRestored} fingerprint(s) cleared, ` +
            `${result.calendarUpdated} calendar event(s) restored`
        );
      } else {
        log.warn(`Could not mark unpaid: ${reply}`);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log.error(`Error processing unpaid command: ${errMsg}`);
      reply = `❌ Error processing unpaid command: ${errMsg}`;
    }
    await resolveAck(token, msg.chat.id, ackId, msg.message_id, reply);
    return;
  }

  // ── "xxxx - month - paid" ─────────────────────────────────────────────────
  const parsed = parsePaidMessage(text);
  if (!parsed) return; // not a recognised command — ignore

  log.info(
    `Received paid command from ${senderLabel(msg)}: "${text.trim()}"`
  );

  // Acknowledge immediately.
  let ackId: number | undefined;
  try {
    ackId = await sendReply(
      token,
      msg.chat.id,
      `⏳ Marking \`****${parsed.cardLast4}\` as paid for *${parsed.monthYM}*…`,
      msg.message_id
    );
  } catch (e) {
    log.warn(
      `Could not send ack: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  let reply: string;
  try {
    const result = await markCardPaid(parsed.cardLast4, parsed.monthYM);
    reply = buildPaidConfirmationMessage(result);
    if (result.ok) {
      log.success(
        `Processed: ****${parsed.cardLast4} ${parsed.monthYM} — ` +
          `${result.remindersSuppressed} reminder(s) silenced, ` +
          `${result.calendarUpdated} calendar event(s) updated`
      );
    } else {
      log.warn(`Could not mark paid: ${reply}`);
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log.error(`Error processing paid command: ${errMsg}`);
    reply = `❌ Error processing paid command: ${errMsg}`;
  }

  await resolveAck(token, msg.chat.id, ackId, msg.message_id, reply);
}

/** Pick the highest-resolution PhotoSize for OCR. */
function pickLargestPhoto(sizes: TgPhotoSize[]): TgPhotoSize | undefined {
  if (sizes.length === 0) return undefined;
  return sizes.reduce((best, cur) =>
    cur.width * cur.height > best.width * best.height ? cur : best
  );
}

async function handleReceiptUpdate(
  token: string,
  msg: NonNullable<TgUpdate["message"]>,
  fileId: string,
  updateId: number
): Promise<void> {
  log.info(
    `Received receipt image from ${senderLabel(msg)}` +
      (msg.caption ? ` (caption: "${msg.caption.trim()}")` : "")
  );

  // Acknowledge immediately — OCR can take 10-30 seconds.
  void sendChatAction(token, msg.chat.id, "typing");
  let ackId: number | undefined;
  try {
    ackId = await sendReply(
      token,
      msg.chat.id,
      "⏳ Receipt received! Reading and verifying your payment… _(this may take up to 30 seconds)_",
      msg.message_id
    );
  } catch (e) {
    log.warn(
      `Could not send ack: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  let reply: string;
  try {
    const downloaded = await downloadTelegramPhoto(token, fileId, {
      receiptsDir: receiptConfig.imagesDir,
      suggestedName: `${updateId}-${msg.message_id}`,
    });
    log.kv("Saved receipt", downloaded.filePath);

    const ocr = await ocrReceipt(
      downloaded.filePath,
      receiptConfig.tesseractPsm
    );
    log.kv(
      "OCR confidence",
      ocr.confidence !== undefined ? `${Math.round(ocr.confidence)}%` : "—"
    );

    const knownLast4s = Array.from(
      new Set(loadState().dues.map((d) => d.cardLast4))
    );
    const parsed = parseReceiptText(ocr.text, knownLast4s);
    log.kv(
      "Parsed",
      `card=****${parsed.cardLast4 ?? "?"}  amount=${parsed.amountRaw ?? "?"}`
    );

    const result = await markCardPaidFromReceipt(parsed, {
      caption: msg.caption,
    });
    reply = buildReceiptConfirmationMessage(result);
    if (result.ok) {
      log.success(
        `Receipt paid: ****${result.entry.cardLast4} ${result.entry.dueDateYMD} — ` +
          `${result.remindersSuppressed} reminder(s) silenced, ` +
          `${result.calendarUpdated} calendar event(s) updated` +
          (result.belowTotalDue ? " (below total due)" : "")
      );
    } else {
      log.warn(`Receipt not accepted: ${result.reason}`);
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log.error(`Error processing receipt image: ${errMsg}`);
    reply = `❌ Error processing receipt image: ${errMsg}`;
  }

  await resolveAck(token, msg.chat.id, ackId, msg.message_id, reply);
}

async function handleUpdate(
  token: string,
  update: TgUpdate
): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  if (msg.photo && msg.photo.length > 0) {
    const largest = pickLargestPhoto(msg.photo);
    if (largest) {
      await handleReceiptUpdate(token, msg, largest.file_id, update.update_id);
      return;
    }
  }

  if (msg.document && msg.document.mime_type?.startsWith("image/")) {
    await handleReceiptUpdate(
      token,
      msg,
      msg.document.file_id,
      update.update_id
    );
    return;
  }

  if (msg.text) {
    await handleTextUpdate(
      token,
      msg as NonNullable<TgUpdate["message"]> & { text: string }
    );
    return;
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  const token = notifyConfig.telegramBotToken;
  if (!token) {
    log.error(
      "TELEGRAM_BOT_TOKEN is not set. " +
        "Add it to .env and run: npm run telegram-bot"
    );
    process.exit(1);
  }

  const once = process.argv.includes("--once");

  logBanner(
    "pay-credit-cards · Telegram bot",
    once ? "Single pass (--once)" : "Long-polling daemon"
  );
  log.kv("Mode", once ? "process pending updates then exit" : "continuous");
  log.kv("State file", STATE_FILE);
  log.line("");

  const state = loadBotState();
  log.kv("Starting at offset", String(state.offset));

  // In continuous (daemon) mode, notify the chat that the bot is back online.
  // Any pending commands sent while the machine was off will be processed
  // immediately after this message, so the user sees them in context.
  if (!once && notifyConfig.telegramChatId) {
    await sendNotification(
      token,
      [
        "🤖 *Bot is back online.*",
        "",
        "Any payment commands or receipt photos you sent while this machine was offline are being processed now.",
        "",
        "If your card is still not marked as paid after a few moments, please resend the payment command or receipt:",
        "• Text command: `xxxx - month year - paid`",
        "• Receipt photo: send the image again (optional caption: `april 2026`)",
      ].join("\n")
    );
    log.info("Startup notification sent to Telegram chat.");
  }

  let running = true;
  process.on("SIGINT", () => {
    log.line("");
    log.info("Shutting down…");
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });

  while (running) {
    let updates: TgUpdate[];
    try {
      updates = await getUpdates(token, state.offset);
    } catch (e) {
      if (!running) break;
      const msg = e instanceof Error ? e.message : String(e);
      // Transient network error — back off a little.
      log.warn(`getUpdates error: ${msg} — retrying in 10s`);
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }

    for (const update of updates) {
      await handleUpdate(token, update);
      state.offset = update.update_id + 1;
      saveBotState(state);
    }

    if (once) break;
  }

  log.info("Bot stopped.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
