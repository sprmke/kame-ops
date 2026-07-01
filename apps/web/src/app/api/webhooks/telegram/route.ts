import { NextResponse } from "next/server";

import {
  parsePaidMessage,
  parseUnpaidMessage,
} from "@/lib/mark-paid/parse-messages";
import {
  buildPaidConfirmationMessage,
  buildUnpaidConfirmationMessage,
} from "@/lib/mark-paid/messages";
import { downloadTelegramFile } from "@/lib/integrations/telegram-files";
import { integrationService } from "@/server/services/integration.service";
import { markPaidService } from "@/server/services/mark-paid.service";

export const maxDuration = 60;

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

  const paid = parsePaidMessage(text);
  if (paid) {
    const result = await markPaidService.markByCardAndMonth(
      userId,
      paid.cardLast4,
      paid.monthYM,
    );
    await sendTelegramReply(
      botToken,
      msg.chat.id,
      buildPaidConfirmationMessage(result),
    );
    return NextResponse.json({ ok: true, action: "mark_paid" });
  }

  const unpaid = parseUnpaidMessage(text);
  if (unpaid) {
    const result = await markPaidService.markUnpaidByCardAndMonth(
      userId,
      unpaid.cardLast4,
      unpaid.monthYM,
    );
    await sendTelegramReply(
      botToken,
      msg.chat.id,
      buildUnpaidConfirmationMessage(result),
    );
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
