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

- [ ] **One project only** — e.g. `kame-ops-web` or `kame-ops`; delete or ignore duplicates to avoid env/domain drift
- [ ] Link repo `sprmke/kame-ops`; **Root Directory** = `apps/web` (not repo root)
- [ ] Framework Preset = **Next.js** (auto when root is correct)
- [ ] Set production env vars (see below)
- [ ] Remove `SKIP_ENV_VALIDATION` in production
- [ ] Deploy and verify `/login` + `/dashboard`
- [x] Schedule automation dispatch via **Supabase pg_cron** (see **`docs/temp/scheduled-jobs-and-testing.md`**) — Vault secrets + `sync_kame_ops_automation_dispatch_cron_job()` on project `elfgaejqxipbyylhwgxx`
- [x] Vercel daily fallback cron in `apps/web/vercel.json` (`0 4 * * *` UTC)

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

## Automation dispatch (Supabase pg_cron)

| Target                                            | Schedule (UTC) | Notes                                                                                                    |
| ------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /api/cron/dispatch` on `NEXT_PUBLIC_APP_URL` | `* * * * *`    | Every minute via **`pg_cron` + `pg_net`** in Supabase; see **`docs/temp/scheduled-jobs-and-testing.md`** |

`apps/web/vercel.json` also schedules the same route **once daily** at `0 4 * * *` UTC (12:00 PM Manila) as a Hobby-plan fallback. Dispatcher runs overdue jobs when `next_run_at` is in the past.

Cron requests must include: `Authorization: Bearer <CRON_SECRET>` (stored in Supabase Vault as `kame_ops_cron_secret`).

User automations use friendly schedules (daily/weekly/monthly + time) stored in `automation_jobs.config.scheduleConfig`, evaluated in each user's timezone (`users.timezone`, default `Asia/Manila`).

## Troubleshooting deploys

### Build succeeds then: `No Output Directory named "public"`

Vercel **Root Directory** is the repo root instead of `apps/web`. Turbo builds Next.js under `apps/web/.next`, but Vercel looks for a static `public` folder at the root.

**Fix:** Project → **Settings → General → Root Directory** → `apps/web` → Save → Redeploy.

Do **not** set Output Directory to `public` manually.

### `functions` pattern doesn't match Serverless Functions

`vercel.json` used Pages Router-style `functions` paths. App Router limits use `export const maxDuration` in each `route.ts` instead. Do not add a `functions` block for `src/app/api/**` routes.

### Two Vercel projects (`kame-ops` vs `kame-ops-web`)

Use **one** production project. Copy env vars and domain to the project with **Root Directory = `apps/web`**. The other can be deleted or left unused.

## CI

GitHub Actions workflow `.github/workflows/ci.yml` runs lint, type-check, tests, and build on every PR.

## What's implemented in code (latest)

- Supabase Storage service with local `/tmp` fallback (`storage.service.ts`)
- Receipt upload → cloud or local storage
- Telegram webhook: text mark-paid/unpaid + receipt photos
- Per-user Telegram routing via integration `chatId` or `TELEGRAM_DEFAULT_USER_ID`
- Production env validation in `env.ts`
- Vitest unit tests (starting with `parseMonthYear`)
