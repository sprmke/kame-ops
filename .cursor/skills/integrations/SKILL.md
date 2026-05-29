---
name: integrations
description: Third-party integrations for KameOps — Gmail, Google Calendar, Telegram Bot API, Slack webhooks. Use when connecting services, webhooks, or porting notify.ts / telegram-bot-listener.ts.
---

# Integrations Skill

## Providers

### Gmail

- Scopes: `gmail.readonly` (SOA download, history poll)
- OAuth: per-user refresh token on `integrations` row
- History API for poller; catch-up search `newer_than:Nd has:attachment filename:pdf`
- Handle 404 on expired history — reset cursor

### Google Calendar

- Scope: `calendar.events`
- Create D-4…D-0 all-day events with private fingerprint `payCcFp` / `pay-cc:...`
- `markCalendarEventsPaid` / `Unpaid` — port from legacy `google-calendar.ts`

### Telegram

- **Outbound**: `sendMessage`, `sendDocument` (summary PDF)
- **Inbound**: webhook (not long-poll) for paid/unpaid and receipt photos
- `TELEGRAM_WEB_LINK` must be quoted in env if used in messages (URL contains `#`)
- Markdown for reminders; truncate captions at 1024 chars

### Slack

- Incoming webhook: **text only** (no PDF attachments)
- Link to Telegram Web when PDF was sent there

## Service Pattern

```typescript
// integrations.service.ts
async function getTelegramConfig(
  userId: string,
): Promise<TelegramConfig | null> {
  const row = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.userId, userId),
      eq(integrations.provider, "telegram"),
    ),
  });
  if (!row?.isActive) return null;
  return decryptConfig(row.config);
}
```

## Webhook Routes

| Route                           | Purpose                     |
| ------------------------------- | --------------------------- |
| `POST /api/webhooks/telegram`   | Bot updates (paid, receipt) |
| `POST /api/cron/soa-poll`       | Gmail poller (cron secret)  |
| `POST /api/cron/send-reminders` | Daily reminders             |

Validate secrets on every cron/webhook request.

## UI Integration Settings

- Show connected/disconnected status per provider
- OAuth connect buttons for Google
- Manual fields for Telegram bot token + chat id, Slack webhook URL
- Test connection action (send test ping)

## Security

- Never log tokens or webhook URLs
- Rotate tokens on disconnect
- Rate-limit webhook endpoints

## Legacy Reference

- `pay-credit-cards/src/notify.ts`
- `pay-credit-cards/src/telegram-bot-listener.ts`
- `pay-credit-cards/src/gmail-auth.ts`
