import { integrationService } from "./integration.service";

/** Apply per-user integration secrets to process.env for lib/soa runners. */
export async function applyIntegrationsToEnv(userId: string): Promise<void> {
  const telegram = await integrationService.getConfig<{
    botToken?: string;
    chatId?: string;
    webLink?: string;
  }>(userId, "telegram");

  if (telegram?.botToken) process.env.TELEGRAM_BOT_TOKEN = telegram.botToken;
  if (telegram?.chatId) process.env.TELEGRAM_CHAT_ID = telegram.chatId;
  if (telegram?.webLink) process.env.TELEGRAM_WEB_LINK = telegram.webLink;

  const slack = await integrationService.getConfig<{ webhookUrl?: string }>(
    userId,
    "slack",
  );
  if (slack?.webhookUrl) process.env.SLACK_WEBHOOK_URL = slack.webhookUrl;

  const calendar = await integrationService.getConfig<{ calendarId?: string }>(
    userId,
    "google_calendar",
  );
  if (calendar?.calendarId)
    process.env.GOOGLE_CALENDAR_ID = calendar.calendarId;
}
