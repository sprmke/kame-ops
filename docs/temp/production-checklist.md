# Production Deployment Checklist

Use this before deploying KameOps to Vercel + Supabase.

## Phase A — Staging (required)

### Supabase

- [ ] Create Supabase project
- [ ] Copy `DATABASE_URL` (pooler) and `DIRECT_URL` (optional, migrations)
- [ ] Run schema: `cd apps/web && bun run db:push`
- [ ] Seed admin: `bun run db:seed` (set `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- [ ] Create Storage buckets: `kame-ops-private` (and `kame-ops-public` if needed)
- [ ] Set bucket policies (private bucket: service role only)

### Vercel

- [ ] Link repo; set root directory to `apps/web`
- [ ] Set production env vars (see below)
- [ ] Remove `SKIP_ENV_VALIDATION` in production
- [ ] Deploy and verify `/login` + `/dashboard`
- [ ] Cron jobs auto-configured via `apps/web/vercel.json`

### Telegram

- [ ] Save bot token + chat ID in Integrations UI (or env fallback)
- [ ] Set `TELEGRAM_WEBHOOK_SECRET` (random string)
- [ ] Register webhook:
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -d "url=https://your-app.vercel.app/api/webhooks/telegram" \
    -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
  ```
- [ ] Set `TELEGRAM_DEFAULT_USER_ID` to your user UUID until multi-user chat mapping is fully tested

### Gmail (SOA)

- [ ] Legacy OAuth still uses `configs/credentials.json` + `configs/token.json` on the server filesystem
- [ ] For Vercel: migrate to in-app Gmail OAuth (roadmap item) or run SOA poll from a machine with configs

## Phase B — Production hardening

- [ ] Rotate all secrets (`AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`)
- [ ] Gmail OAuth in integrations UI (replace legacy file config)
- [ ] Expand test suite (bank parsers, mark-paid, tRPC)
- [ ] Error monitoring (Sentry or Vercel logs alerts)
- [ ] Formal Drizzle migrations instead of `db:push` only

## Required production env vars

| Variable                          | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `DATABASE_URL`                    | Supabase Postgres connection            |
| `AUTH_SECRET`                     | NextAuth session signing (32+ chars)    |
| `ENCRYPTION_KEY`                  | Card PDF passwords, integration secrets |
| `CRON_SECRET`                     | Protects `/api/cron/*`                  |
| `TELEGRAM_WEBHOOK_SECRET`         | Validates Telegram webhook              |
| `SUPABASE_URL`                    | Storage API                             |
| `SUPABASE_SERVICE_ROLE_KEY`       | Storage uploads/downloads               |
| `SUPABASE_STORAGE_BUCKET_PRIVATE` | Receipts, SOA PDFs                      |
| `NEXT_PUBLIC_APP_URL`             | Public app URL                          |

## Cron schedule (vercel.json)

| Route                 | Schedule (UTC) | Local (Asia/Manila) |
| --------------------- | -------------- | ------------------- |
| `/api/cron/reminders` | `0 4 * * *`    | Daily 12:00 PM      |
| `/api/cron/soa-poll`  | `*/10 * * * *` | Every 10 minutes    |

Cron requests must include: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron adds this automatically when configured).

## CI

GitHub Actions workflow `.github/workflows/ci.yml` runs lint, type-check, tests, and build on every PR.

## What's implemented in code (latest)

- Supabase Storage service with local `/tmp` fallback (`storage.service.ts`)
- Receipt upload → cloud or local storage
- Telegram webhook: text mark-paid/unpaid + receipt photos
- Per-user Telegram routing via integration `chatId` or `TELEGRAM_DEFAULT_USER_ID`
- Production env validation in `env.ts`
- Vitest unit tests (starting with `parseMonthYear`)
