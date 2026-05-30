# Application Inventory

**Status:** MVP implemented in `apps/web`. Update as features evolve.

## Apps

| App | Path       | Description                               |
| --- | ---------- | ----------------------------------------- |
| Web | `apps/web` | KameOps dashboard (Next.js 15, port 3005) |

## Routes

| Route                     | Feature module           | Status      |
| ------------------------- | ------------------------ | ----------- |
| `/`                       | Marketing landing        | Implemented |
| `/login`, `/register`     | `features/auth`          | Implemented |
| `/dashboard`              | `dashboard/overview`     | Implemented |
| `/dashboard/credit-cards` | `dashboard/credit-cards` | Implemented |
| `/dashboard/soa`          | `dashboard/soa`          | Implemented |
| `/dashboard/reminders`    | `dashboard/reminders`    | Implemented |
| `/dashboard/automations`  | `dashboard/automations`  | Implemented |
| `/dashboard/integrations` | `dashboard/integrations` | Implemented |
| `/dashboard/receipts`     | `dashboard/receipts`     | Implemented |
| `/dashboard/analytics`    | `dashboard/analytics`    | Basic chart |
| `/dashboard/settings`     | `dashboard/settings`     | Implemented |

## tRPC API

| Router         | Procedures                        | Status      |
| -------------- | --------------------------------- | ----------- |
| `creditCards`  | list, get, create, update, delete | Implemented |
| `soa`          | list, runPipeline, pollGmail      | Implemented |
| `reminders`    | listDue, sendNow                  | Implemented |
| `automations`  | list, create, run                 | Implemented |
| `integrations` | list, upsert                      | Implemented |

## REST / webhooks

| Route                         | Purpose                                  | Status      |
| ----------------------------- | ---------------------------------------- | ----------- |
| `POST /api/auth/register`     | Email/password signup                    | Implemented |
| `GET /api/cron/reminders`     | Cron: send due reminders (Bearer)        | Implemented |
| `GET /api/cron/soa-poll`      | Cron: SOA poll per user (Bearer)         | Implemented |
| `POST /api/webhooks/telegram` | Telegram updates (text + receipt photos) | Implemented |
| `POST /api/receipts/upload`   | Receipt file upload (Supabase or local)  | Implemented |

## Database (Drizzle)

| Table                                | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `users`, auth tables                 | NextAuth users                            |
| `credit_cards`                       | Card credentials (encrypted PDF password) |
| `soa_statements`, `soa_transactions` | SOA history                               |
| `due_entries`                        | Due dates / paid state                    |
| `integrations`                       | Encrypted provider config                 |
| `reminders`, `reminder_logs`         | Reminder config + send log                |
| `automation_jobs`, `automation_runs` | Scheduled jobs                            |
| `receipts`                           | Receipt OCR (schema ready)                |
| `gmail_poll_state`                   | Gmail history cursor                      |
| `activity_logs`                      | Audit trail                               |

## Services (server)

| Service                     | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `storage.service.ts`        | Supabase Storage uploads + local fallback |
| `integration.service.ts`    | Encrypted per-user integrations           |
| `legacy-runtime.service.ts` | Bridge to pay-credit-cards CLI            |

Source copied to `apps/web/src/server/legacy/pay-credit-cards/` — used at runtime via dynamic import for SOA, reminders, and notifications. Original repo: `automated-tasks/pay-credit-cards`.

## Scripts

| Script                        | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `apps/web` `db:seed`          | Create admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `scripts/migrate-from-cli.ts` | Import `cards.json` + `due-reminders-state.json`        |
