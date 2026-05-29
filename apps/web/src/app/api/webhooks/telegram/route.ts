import { NextResponse } from "next/server";

import { prepareLegacyRuntime } from "@/server/services/legacy-runtime.service";

/**
 * Telegram webhook — handles mark-paid / mark-unpaid text commands.
 * Set webhook URL to /api/webhooks/telegram and optional TELEGRAM_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const token = request.headers.get("x-telegram-bot-api-secret-token");
    if (token !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const update = (await request.json()) as {
    update_id?: number;
    message?: {
      text?: string;
      chat: { id: number };
    };
  };

  const text = update.message?.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: true, skipped: "no_text" });
  }

  const adminUserId = process.env.TELEGRAM_DEFAULT_USER_ID;
  if (!adminUserId) {
    console.warn(
      "[telegram] TELEGRAM_DEFAULT_USER_ID not set — cannot route mark-paid",
    );
    return NextResponse.json({ ok: true, skipped: "no_user" });
  }

  await prepareLegacyRuntime(adminUserId);

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
    await dueSyncService.syncFromLegacyFile(adminUserId, workDir);
    const reply =
      result.ok === true
        ? buildPaidConfirmationMessage(result)
        : result.reason === "not_found"
          ? `No due entry for •••• ${paid.cardLast4} in ${paid.monthYM}`
          : "Multiple cards match — specify issuer in CLI";
    await sendTelegramReply(reply);
    return NextResponse.json({ ok: true, action: "mark_paid" });
  }

  const unpaid = parseUnpaidMessage(text);
  if (unpaid) {
    const result = await markCardUnpaid(unpaid.cardLast4, unpaid.monthYM);
    await dueSyncService.syncFromLegacyFile(adminUserId, workDir);
    const reply =
      result.ok === true
        ? buildUnpaidConfirmationMessage(result)
        : `Could not mark unpaid for •••• ${unpaid.cardLast4}`;
    await sendTelegramReply(reply);
    return NextResponse.json({ ok: true, action: "mark_unpaid" });
  }

  return NextResponse.json({ ok: true, skipped: "unrecognized" });
}

async function sendTelegramReply(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}
