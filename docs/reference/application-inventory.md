# Application Inventory

**Status:** MVP implemented in `apps/web`. Update as features evolve.

## Apps

| App | Path       | Description                               |
| --- | ---------- | ----------------------------------------- |
| Web | `apps/web` | KameOps dashboard (Next.js 15, port 3005) |

## Routes

| Route                                     | Feature module                                                             | Status                |
| ----------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| `/`                                       | Marketing landing                                                          | Implemented           |
| `/login`                                  | `features/auth`                                                            | Google OAuth only     |
| `/register`                               | —                                                                          | Redirects to `/login` |
| `/dashboard`                              | `dashboard/overview`                                                       | Implemented           |
| `/dashboard/credit-cards`                 | `dashboard/credit-cards`                                                   | Implemented           |
| `/dashboard/soa`                          | `dashboard/soa` — SOA period list (CRUD)                                   | Implemented           |
| `/dashboard/soa/[periodId]`               | `dashboard/soa` — period detail (Overview / Transactions / Analytics tabs) | Implemented           |
| `/dashboard/soa/[periodId]/[statementId]` | `dashboard/soa` — per-card statement + transactions                        | Implemented           |
| `/dashboard/reminders`                    | `dashboard/reminders`                                                      | Implemented           |
| `/dashboard/automations`                  | `dashboard/automations`                                                    | Implemented           |
| `/dashboard/integrations`                 | `dashboard/integrations`                                                   | Implemented           |
| `/dashboard/receipts`                     | `dashboard/receipts`                                                       | Implemented           |
| `/dashboard/settings`                     | `dashboard/settings`                                                       | Implemented           |

## tRPC API

| Router                  | Procedures                                                                                                | Status                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `creditCards`           | list, get, create, update, delete                                                                         | Implemented                                                              |
| `soa`                   | listPeriods, getPeriod, getStatement, updatePeriod, deletePeriod, list, runPipeline, dedupe, clearHistory | Implemented — period detail has Overview / Transactions / Analytics tabs |
| `transactionCategories` | listOptions, listRules, createRule, updateRule, deleteRule, updateTransactionCategory                     | Implemented — keyword rules + learned corrections                        |
| `reminders`             | listDue, status, sendNow (force optional), markPaid, markUnpaid                                           | Implemented                                                              |
| `automations`           | list, create, run                                                                                         | Implemented                                                              |
| `integrations`          | list, upsert                                                                                              | Implemented                                                              |

## REST / webhooks

| Route                         | Purpose                                                                                                                 | Status      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| `POST /api/auth/register`     | Removed — use Google sign-in                                                                                            | —           |
| `GET /api/cron/reminders`     | Cron: send due reminders (Bearer)                                                                                       | Implemented |
| `GET /api/health/engines`     | Local prod verify: pdf/qpdf engine status (localhost only)                                                              | Implemented |
| `GET /api/soa/pdf`            | Stream SOA source or period summary PDF (auth); resolves `pdfStoragePath` / `summaryPdfStoragePath` or legacy work dirs | Implemented |
| `POST /api/webhooks/telegram` | Telegram updates (text + receipt photos)                                                                                | Implemented |
| `POST /api/receipts/upload`   | Receipt file upload (Supabase or local)                                                                                 | Implemented |

## Database (Drizzle)

| Table                                | Purpose                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `users`, auth tables                 | NextAuth users                                                                      |
| `credit_cards`                       | Card credentials (encrypted PDF password, `soa_subject`, `color`)                   |
| `soa_periods`                        | SOA run periods (date range + notify/calendar settings; `summary_pdf_storage_path`) |
| `soa_statements`, `soa_transactions` | SOA history                                                                         |
| `due_entries`                        | Due dates / paid state                                                              |
| `integrations`                       | Encrypted provider config                                                           |
| `reminders`, `reminder_logs`         | Reminder config + send log                                                          |
| `automation_jobs`, `automation_runs` | Scheduled jobs                                                                      |
| `receipts`                           | Receipt OCR (schema ready)                                                          |
| `activity_logs`                      | Audit trail                                                                         |

## Services (server)

| Service                     | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `gmail.service.ts`          | Google OAuth tokens + legacy Gmail bridge |
| `storage.service.ts`        | Supabase Storage uploads + local fallback |
| `integration.service.ts`    | Encrypted per-user integrations           |
| `legacy-runtime.service.ts` | Bridge to pay-credit-cards CLI            |

Source copied to `apps/web/src/server/legacy/pay-credit-cards/` — used at runtime via dynamic import for SOA, reminders, and notifications. Original repo: `automated-tasks/pay-credit-cards`.

## Scripts

| Script                        | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `apps/web` `db:seed`          | Prints Google sign-in setup instructions                             |
| `scripts/setup-supabase.ts`   | Supabase storage buckets + `db:push` (`docs/temp/supabase-setup.md`) |
| `scripts/migrate-from-cli.ts` | Import `cards.json` + `due-reminders-state.json`                     |
