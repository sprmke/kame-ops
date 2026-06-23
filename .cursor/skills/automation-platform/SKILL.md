---
name: automation-platform
description: KameOps platform domain skill for reminders, cron automations, notifications, integrations, and user-scoped workflows. Use when building non-credit-card platform features or shared infrastructure.
---

# KameOps Platform Skill

## Domain Model

KameOps is a **user-scoped automation platform**. Credit cards are one module; reminders and cron jobs are generic.

### Core entities

| Entity                  | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `integrations`          | Gmail, Telegram, Slack, Google Calendar credentials per user |
| `automation_jobs`       | Scheduled tasks (SOA pipeline, send reminders, custom)       |
| `automation_runs`       | Execution log with status and errors                         |
| `reminders`             | Generic due-date reminders (any `relatedEntityType`)         |
| `reminder_logs`         | Sent fingerprints for idempotency                            |
| `notification_channels` | User prefs per channel                                       |

### User scoping

```typescript
// Every query must filter by authenticated user
const jobs = await db.query.automationJobs.findMany({
  where: and(
    eq(automationJobs.userId, ctx.user.id),
    isNull(automationJobs.deletedAt),
  ),
});
```

## Reminder Engine

- Window: D-N through D-0 (configurable `windowDays`, default 4)
- Fingerprint format: `reminder:{entityType}:{entityId}:{dueDateYmd}:D-{n}`
- Skip when `completedAt` or entity-specific `paidAt` is set
- Urgency headers: info → warning → final → today

## Automation Jobs

```typescript
const AUTOMATION_JOB_TYPES = {
  RUN_SOA_PIPELINE: "run_soa_pipeline",
  SEND_REMINDERS: "send_due_reminders",
  CUSTOM_WEBHOOK: "custom_webhook",
} as const;
```

Cron invokes secured API routes; services perform work; runs are logged.

## Notification Abstraction

```typescript
interface NotificationPayload {
  telegramMarkdown?: string;
  slackMrkdwn?: string;
  fingerprint: string;
}

// notification.service sends only to configured channels
await notificationService.sendReminder(userId, payload);
```

Never call Telegram/Slack from UI components.

## Integration Storage

- Encrypt sensitive fields (tokens, webhook URLs, card PDF passwords) before insert
- Never expose secrets in tRPC responses—return `isConnected: true` only
- OAuth refresh for Google: store refresh token on integration row

## Module Extension Pattern

New industry module (e.g. recurring bills):

1. Add feature folder `features/dashboard/bills/`
2. Add schema tables scoped by `userId`
3. Add tRPC router + service
4. Reuse `reminders` with `relatedEntityType: 'bill'`
5. Register optional `automation_jobs` handlers
6. Update `docs/reference/application-inventory.md`

Do not import credit-cards feature from other modules.

## References

- `@docs/architecture/project-structure.md`
- `@docs/product/user-flows.md`
- Rule `19-automations-integrations.mdc`
