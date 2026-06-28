import { NextResponse } from "next/server";

import { integrationService } from "@/server/services/integration.service";
import { prepareLegacyRuntime } from "@/server/services/legacy-runtime.service";

type TgPhotoSize = { file_id: string; width: number; height: number };
type TgDocument = { file_id: string; mime_type?: string };
type TgMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number };
  photo?: TgPhotoSize[];
  document?: TgDocument;
};

type TgUpdate = {
  update_id: number;
  message?: TgMessage;
};

/**
 * Telegram webhook — mark-paid/unpaid text commands and receipt AI validation.
 * Set webhook URL to /api/webhooks/telegram and TELEGRAM_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const token = request.headers.get("x-telegram-bot-api-secret-token");
    if (token !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const update = (await request.json()) as TgUpdate;
  const msg = update.message;
  if (!msg) {
    return NextResponse.json({ ok: true, skipped: "no_message" });
  }

  const userId = await resolveUserId(msg.chat.id);
  if (!userId) {
    console.warn("[telegram] No user mapped for chat", msg.chat.id);
    return NextResponse.json({ ok: true, skipped: "no_user" });
  }

  const botToken = await integrationService.getTelegramBotToken(userId);
  if (!botToken) {
    console.warn("[telegram] No bot token for user", userId);
    return NextResponse.json({ ok: true, skipped: "no_bot_token" });
  }

  await prepareLegacyRuntime(userId);

  if (msg.photo?.length) {
    const largest = pickLargestPhoto(msg.photo);
    if (largest) {
      await handleReceiptPhoto(botToken, userId, msg, largest.file_id);
      return NextResponse.json({ ok: true, action: "receipt_photo" });
    }
  }

  if (msg.document?.mime_type?.startsWith("image/")) {
    await handleReceiptPhoto(botToken, userId, msg, msg.document.file_id);
    return NextResponse.json({ ok: true, action: "receipt_document" });
  }

  const text = msg.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: true, skipped: "no_text" });
  }

  const {
    parsePaidMessage,
    parseUnpaidMessage,
    markCardPaid,
    markCardUnpaid,
    buildPaidConfirmationMessage,
    buildUnpaidConfirmationMessage,
  } = await import("@/server/legacy/pay-credit-cards/mark-paid");

  const { dueSyncService } = await import("@/server/services/due-sync.service");
  const workDir = process.env.DATA_DIR!;

  const paid = parsePaidMessage(text);
  if (paid) {
    const result = await markCardPaid(paid.cardLast4, paid.monthYM);
    await dueSyncService.syncFromLegacyFile(userId, workDir);
    const reply =
      result.ok === true
        ? buildPaidConfirmationMessage(result)
        : result.reason === "not_found"
          ? `No due entry for •••• ${paid.cardLast4} in ${paid.monthYM}`
          : "Multiple cards match — specify issuer in CLI";
    await sendTelegramReply(botToken, msg.chat.id, reply);
    return NextResponse.json({ ok: true, action: "mark_paid" });
  }

  const unpaid = parseUnpaidMessage(text);
  if (unpaid) {
    const result = await markCardUnpaid(unpaid.cardLast4, unpaid.monthYM);
    await dueSyncService.syncFromLegacyFile(userId, workDir);
    const reply =
      result.ok === true
        ? buildUnpaidConfirmationMessage(result)
        : `Could not mark unpaid for •••• ${unpaid.cardLast4}`;
    await sendTelegramReply(botToken, msg.chat.id, reply);
    return NextResponse.json({ ok: true, action: "mark_unpaid" });
  }

  return NextResponse.json({ ok: true, skipped: "unrecognized" });
}

async function resolveUserId(chatId: number): Promise<string | null> {
  const fromIntegration = await integrationService.findUserIdByTelegramChatId(
    String(chatId),
  );
  if (fromIntegration) return fromIntegration;

  const fallback = process.env.TELEGRAM_DEFAULT_USER_ID;
  return fallback?.trim() || null;
}

function pickLargestPhoto(sizes: TgPhotoSize[]): TgPhotoSize | undefined {
  if (sizes.length === 0) return undefined;
  return sizes.reduce((best, cur) =>
    cur.width * cur.height > best.width * best.height ? cur : best,
  );
}

async function handleReceiptPhoto(
  botToken: string,
  userId: string,
  msg: TgMessage,
  fileId: string,
): Promise<void> {
  await sendTelegramReply(
    botToken,
    msg.chat.id,
    "⏳ Receipt received! Validating your payment…",
  );

  const { downloadTelegramFile } =
    await import("@/server/legacy/pay-credit-cards/receipt-utils");
  const { receiptService } = await import("@/server/services/receipt.service");

  let reply: string;
  try {
    const downloaded = await downloadTelegramFile(botToken, fileId);

    const result = await receiptService.processTelegramReceipt(
      userId,
      downloaded.buffer,
      downloaded.mimeType,
      msg.caption,
    );

    if (result.error) {
      reply = `❌ *AI validation unavailable*\n\n${result.error}`;
    } else if (result.message) {
      reply = result.message;
    } else {
      reply = "❌ Could not process receipt";
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    reply = `❌ Error processing receipt: ${errMsg}`;
  }

  await sendTelegramReply(botToken, msg.chat.id, reply);
}

async function sendTelegramReply(
  botToken: string,
  chatId: number,
  text: string,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}
