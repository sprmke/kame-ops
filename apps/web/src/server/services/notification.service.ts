import { readFile } from "fs/promises";
import { basename } from "path";

import { integrationService } from "./integration.service";

const TELEGRAM_CAPTION_MAX = 1024;

export type NotifyResult = {
  telegram: boolean;
  slack: boolean;
};

function truncateCaption(text: string): string {
  if (text.length <= TELEGRAM_CAPTION_MAX) return text;
  return `${text.slice(0, TELEGRAM_CAPTION_MAX - 1)}…`;
}

async function sendTelegramText(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
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
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!res.ok || !data.ok) {
    throw new Error(
      data.description
        ? `Telegram: ${data.description}`
        : `Telegram: HTTP ${res.status}`,
    );
  }
}

async function sendTelegramPdf(
  botToken: string,
  chatId: string,
  pdfPath: string,
  caption: string,
): Promise<void> {
  const buf = await readFile(pdfPath);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", truncateCaption(caption));
  form.append("document", new Blob([buf]), basename(pdfPath));

  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!res.ok || !data.ok) {
    throw new Error(
      data.description
        ? `Telegram: ${data.description}`
        : `Telegram: HTTP ${res.status}`,
    );
  }
}

async function sendSlackWebhook(
  webhookUrl: string,
  text: string,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook HTTP ${res.status}: ${body}`);
  }
}

export const notificationService = {
  async isConfigured(userId: string): Promise<boolean> {
    const telegram = await integrationService.getConfig<{
      botToken?: string;
      chatId?: string;
    }>(userId, "telegram");
    const slack = await integrationService.getConfig<{ webhookUrl?: string }>(
      userId,
      "slack",
    );
    return (
      Boolean(telegram?.botToken && telegram?.chatId) ||
      Boolean(slack?.webhookUrl)
    );
  },

  async sendReminderText(
    userId: string,
    telegramText: string,
    slackText: string,
  ): Promise<NotifyResult> {
    const telegram = await integrationService.getConfig<{
      botToken?: string;
      chatId?: string;
    }>(userId, "telegram");
    const slack = await integrationService.getConfig<{ webhookUrl?: string }>(
      userId,
      "slack",
    );

    const result: NotifyResult = { telegram: false, slack: false };

    if (telegram?.botToken && telegram?.chatId) {
      await sendTelegramText(telegram.botToken, telegram.chatId, telegramText);
      result.telegram = true;
    }

    if (slack?.webhookUrl) {
      await sendSlackWebhook(slack.webhookUrl, slackText);
      result.slack = true;
    }

    if (!result.telegram && !result.slack) {
      throw new Error(
        "Connect Telegram or Slack in Settings to send reminders.",
      );
    }

    return result;
  },

  async notifySummaryPdf(
    userId: string,
    pdfPath: string,
    title: string,
    options?: { telegram?: boolean; slack?: boolean },
  ): Promise<NotifyResult> {
    const telegram = await integrationService.getConfig<{
      botToken?: string;
      chatId?: string;
      webLink?: string;
    }>(userId, "telegram");
    const slack = await integrationService.getConfig<{ webhookUrl?: string }>(
      userId,
      "slack",
    );

    const sendTelegram = options?.telegram !== false;
    const sendSlack = options?.slack !== false;
    const result: NotifyResult = { telegram: false, slack: false };

    if (sendTelegram && telegram?.botToken && telegram?.chatId) {
      await sendTelegramPdf(telegram.botToken, telegram.chatId, pdfPath, title);
      result.telegram = true;
    }

    if (sendSlack && slack?.webhookUrl) {
      const lines = [`*${title}*`];
      if (result.telegram) {
        const webLink = telegram?.webLink?.trim();
        lines.push(
          webLink
            ? `Summary PDF was sent to Telegram. Click <${webLink}|here>.`
            : "Summary PDF was sent to Telegram.",
        );
      } else {
        lines.push("Summary PDF is available in KameOps.");
      }
      await sendSlackWebhook(slack.webhookUrl, lines.join("\n"));
      result.slack = true;
    }

    if (!result.telegram && !result.slack) {
      if (!sendTelegram && !sendSlack) return result;
      throw new Error(
        "Connect Telegram or Slack in Settings to send SOA summaries.",
      );
    }

    return result;
  },
};
