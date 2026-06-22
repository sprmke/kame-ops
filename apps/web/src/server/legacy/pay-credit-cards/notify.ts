// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { notifyConfig } from "./config";

const TELEGRAM_CAPTION_MAX = 1024;

export type NotifySummaryResult = {
  telegram: boolean;
  slack: boolean;
};

function truncateCaption(s: string): string {
  if (s.length <= TELEGRAM_CAPTION_MAX) return s;
  return s.slice(0, TELEGRAM_CAPTION_MAX - 1) + "…";
}

async function sendTelegramText(text: string): Promise<void> {
  const token = notifyConfig.telegramBotToken;
  const chatId = notifyConfig.telegramChatId;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    description?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(
      data.description
        ? `Telegram: ${data.description}`
        : `Telegram: HTTP ${res.status}`,
    );
  }
}

async function sendTelegramPdf(
  pdfPath: string,
  fileName: string,
  caption: string,
): Promise<void> {
  const token = notifyConfig.telegramBotToken;
  const chatId = notifyConfig.telegramChatId;
  const buf = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", truncateCaption(caption));
  form.append("document", new Blob([buf]), fileName);

  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json()) as {
    ok?: boolean;
    description?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(
      data.description
        ? `Telegram: ${data.description}`
        : `Telegram: HTTP ${res.status}`,
    );
  }
}

async function sendSlackWebhook(text: string): Promise<void> {
  const url = notifyConfig.slackWebhookUrl;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook HTTP ${res.status}: ${body}`);
  }
}

/**
 * Sends the summary PDF to Telegram (if token + chat id are set) and/or
 * posts a short message to Slack (incoming webhook). No domain or paid tier required.
 */
export async function notifySummaryPdf(
  pdfPath: string,
  title: string,
  options?: { telegram?: boolean; slack?: boolean },
): Promise<NotifySummaryResult> {
  const fileName = path.basename(pdfPath);
  const result: NotifySummaryResult = { telegram: false, slack: false };
  const sendTelegram = options?.telegram !== false;
  const sendSlack = options?.slack !== false;

  if (
    sendTelegram &&
    notifyConfig.telegramBotToken &&
    notifyConfig.telegramChatId
  ) {
    await sendTelegramPdf(pdfPath, fileName, title);
    result.telegram = true;
  }

  if (sendSlack && notifyConfig.slackWebhookUrl) {
    const lines = [`*${title}*`];
    if (result.telegram) {
      const webLink = notifyConfig.telegramWebLink;
      lines.push(
        webLink.length > 0
          ? `Summary PDF was sent to Telegram. Click <${webLink}|here>.`
          : "Summary PDF was sent to Telegram.",
      );
    } else {
      lines.push(
        "Incoming webhooks cannot attach files; PDF is only on disk:",
        `\`${pdfPath}\``,
      );
      lines.push(
        "Tip: add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` to receive the PDF in Telegram.",
      );
    }
    await sendSlackWebhook(lines.join("\n"));
    result.slack = true;
  }

  if (!result.telegram && !result.slack) {
    if (!sendTelegram && !sendSlack) {
      return result;
    }
    throw new Error(
      "Notifier misconfigured: set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or SLACK_WEBHOOK_URL",
    );
  }

  return result;
}

/**
 * Text-only reminder (e.g. daily due-date pings). Telegram gets Markdown,
 * Slack gets its own mrkdwn variant so bold/italics render on both platforms.
 */
export async function sendReminderText(
  telegramText: string,
  slackText: string,
): Promise<NotifySummaryResult> {
  const result: NotifySummaryResult = { telegram: false, slack: false };

  if (notifyConfig.telegramBotToken && notifyConfig.telegramChatId) {
    await sendTelegramText(telegramText);
    result.telegram = true;
  }

  if (notifyConfig.slackWebhookUrl) {
    await sendSlackWebhook(slackText);
    result.slack = true;
  }

  if (!result.telegram && !result.slack) {
    throw new Error(
      "Notifier misconfigured: set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or SLACK_WEBHOOK_URL",
    );
  }

  return result;
}
