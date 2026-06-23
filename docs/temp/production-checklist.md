# Production Deployment Checklist

Use this before deploying KameOps to Vercel + Supabase.

## Phase A — Staging (required)

### Supabase

See **`docs/temp/supabase-setup.md`** for the full walkthrough.

- [ ] Create Supabase project (`kame-ops`, region `ap-southeast-1`)
- [ ] Set `DATABASE_URL` (pooler, port 6543) and `DIRECT_URL` (session, port 5432) in `.env.local`
- [ ] Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Run `bun run setup:supabase` (storage buckets + `db:push`)
- [ ] Sign in with Google — creates user in Supabase Postgres (no email/password seed)

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

### Google OAuth (required)

- [ ] Create Google Cloud project + OAuth **Web application** client
- [ ] Authorized redirect URI: `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
- [ ] Enable Gmail API and Google Calendar API
- [ ] Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel
- [ ] Sign in at `/login` — grants `gmail.readonly` + `calendar.events`
- [ ] After first sign-in, copy your user UUID from the DB for `TELEGRAM_DEFAULT_USER_ID` if using Telegram webhook

### Gmail (SOA)

- [x] OAuth tokens stored in `accounts` table on Google sign-in
- [x] Legacy SOA pipeline reads tokens via `gmail.service` env bridge
- [ ] No separate `configs/credentials.json` needed in production

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
