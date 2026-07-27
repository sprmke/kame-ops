# Application Inventory

**Status:** MVP implemented in `apps/web`. Update as features evolve.

## Apps

| App | Path       | Description                               |
| --- | ---------- | ----------------------------------------- |
| Web | `apps/web` | KameOps dashboard (Next.js 15, port 3005) |

## Routes

| Route                                     | Feature module                                                                                                                     | Status                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `/`                                       | Marketing landing                                                                                                                  | Implemented           |
| `/login`                                  | `features/auth`                                                                                                                    | Google OAuth only     |
| `/register`                               | —                                                                                                                                  | Redirects to `/login` |
| `/dashboard`                              | `dashboard/overview`                                                                                                               | Implemented           |
| `/dashboard/credit-cards`                 | `dashboard/credit-cards`                                                                                                           | Implemented           |
| `/dashboard/soa`                          | `dashboard/soa` — SOA period list (CRUD)                                                                                           | Implemented           |
| `/dashboard/soa/[periodId]`               | `dashboard/soa` — period detail (Overview / Transactions / Analytics tabs)                                                         | Implemented           |
| `/dashboard/soa/[periodId]/[statementId]` | `dashboard/soa` — per-card statement + transactions                                                                                | Implemented           |
| `/dashboard/reminders`                    | `dashboard/reminders` + `dashboard/automations` — due entries, mark paid, and scheduled jobs (payment reminders + SOA Gmail check) | Implemented           |
| `/dashboard/automations`                  | Redirects to `/dashboard/reminders`                                                                                                | Redirect              |
| `/dashboard/receipts`                     | `dashboard/receipts`                                                                                                               | Implemented           |
| `/dashboard/settings`                     | `dashboard/settings` — integrations (Gmail, Telegram, Slack, Receipt AI keys) + transaction category rules                         | Implemented           |

## tRPC API

| Router                  | Procedures                                                                                                                                                                                                                                  | Status                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `creditCards`           | list, get, create, update, delete                                                                                                                                                                                                           | Implemented                                                                                                                                                         |
| `soa`                   | listPeriods, getPeriod, getStatement, updatePeriod, deletePeriod, list, runPipeline, **getRunProgress**, dedupe, clearHistory                                                                                                               | Implemented — period detail has Overview / Transactions / Analytics tabs; `runPipeline` accepts optional `runId` for live progress polling                          |
| `transactionCategories` | listOptions, **listUserCategories**, **createCategory**, **deleteCategory**, listRules, createRule, updateRule, deleteRule, updateTransactionCategory, **getCategorizeProgress**, **categorizeStatementWithAi**, **categorizePeriodWithAi** | Implemented — built-in + user custom categories; add from SOA transaction picker or Settings; keyword rules + learned corrections; AI categorize with live progress |
| `reminders`             | listDue, status, markPaid, markUnpaid, **getActionProgress**                                                                                                                                                                                | Implemented — due reminders run via default `send_due_reminders` automation; mark paid/unpaid with live progress polling                                            |
| `automations`           | list, create, update, setActive, delete, run, **getRunProgress**                                                                                                                                                                            | Implemented — `run` requires `processId` for live progress; reminders use `reminder_run_progress`, SOA uses `soa_run_progress`                                      |
| `integrations`          | list, upsert, getFormConfigs, **checkGoogleAuth**                                                                                                                                                                                           | Implemented — `checkGoogleAuth` validates Google refresh token; global reconnect modal on failure or Gmail OAuth errors from tRPC                                   |
| `aiKeys`                | getFormConfig, save, verify                                                                                                                                                                                                                 | Implemented — comma-separated Gemini/Groq keys per user (rotation)                                                                                                  |
| `receipts`              | list, unpaidDueEntries, **getUploadProgress**, validateAndMarkPaid, **analyzeUploadBatch**, **processUploadBatch**, confirmMarkPaid, **revalidateWithAi**, **delete**                                                                                                                       | Implemented — multi-file upload with AI card grouping; one progress panel per detected card/bank; partial/multi-receipt sums per due entry        |
| `overview`              | **stats**                                                                                                                                                                                                                                   | Implemented — period mission panel (statement paid %, **minimum met per card**, cards paid, attention list), shared SOA spend/summary cards                         |

## REST / webhooks

| Route                         | Purpose                                                                                                                                                                                                                            | Status      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `POST /api/auth/register`     | Removed — use Google sign-in                                                                                                                                                                                                       | —           |
| `GET /api/cron/dispatch`      | Cron: run due `automation_jobs` + payment reminders (Bearer `CRON_SECRET`); **Supabase pg_cron** every minute + Vercel daily fallback; overdue jobs run when `next_run_at` is past — see `docs/temp/scheduled-jobs-and-testing.md` | Implemented |
| `GET /api/health/engines`     | Local prod verify: pdf/qpdf engine status (localhost only)                                                                                                                                                                         | Implemented |
| `GET /api/soa/pdf`            | Stream SOA source or period summary PDF (auth); resolves storage paths or temp workdir                                                                                                                                             | Implemented |
| `POST /api/webhooks/telegram` | Telegram updates (text + receipt photos)                                                                                                                                                                                           | Implemented |
| `POST /api/receipts/upload`   | Receipt file upload (Supabase or local)                                                                                                                                                                                            | Implemented |
| `GET /api/receipts/file`      | Stream receipt image/PDF for authenticated user (`receiptId`)                                                                                                                                                                      | Implemented |

## Database (Drizzle)

| Table                                | Purpose                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `users`, auth tables                 | NextAuth users                                                                                                                   |
| `credit_cards`                       | Card credentials (encrypted PDF password, `soa_subject`, `color`)                                                                |
| `soa_periods`                        | SOA run periods (date range + notify/calendar settings; `summary_pdf_storage_path`)                                              |
| `soa_statements`, `soa_transactions` | SOA history                                                                                                                      |
| `user_transaction_categories`        | User-defined spend categories (AI-created or future custom labels)                                                               |
| `due_entries`                        | Due dates / paid state                                                                                                           |
| `integrations`                       | Encrypted provider config (Gmail, Telegram, Slack, Calendar)                                                                     |
| `ai_api_keys`                        | Encrypted per-user Gemini/Groq API keys for receipt validation                                                                   |
| `reminders`, `reminder_logs`         | `reminder_logs`: idempotent send tracking per due entry                                                                          |
| `automation_jobs`, `automation_runs` | Scheduled jobs; default `send_due_reminders` and `run_soa_pipeline` seeded on first Reminders/Automations visit (daily 12:00 PM) |
| `ai_categorize_progress`             | Ephemeral AI categorization progress snapshots (step polling)                                                                    |
| `receipts`                           | Payment receipt uploads + AI validation (`ai_verdict`, `payment_status`, links to `due_entries`)                                 |
| `activity_logs`                      | Audit trail                                                                                                                      |

## Services (server)

| Service                         | Purpose                                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gmail.service.ts`              | Google OAuth tokens + env bridge for `lib/soa` Gmail fetch                                                                                                                                                                                    |
| `storage.service.ts`            | Supabase Storage uploads + local fallback                                                                                                                                                                                                     |
| `integration.service.ts`        | Encrypted per-user integrations                                                                                                                                                                                                               |
| `receipt-validation.service.ts` | Gemini/Groq vision validation — keys from `ai_api_keys` only (Settings)                                                                                                                                                                       |
| `receipt.service.ts`            | Receipt upload processing + mark paid                                                                                                                                                                                                         |
| `soa-workdir.service.ts`        | Per-user SOA workdir + `CARDS_JSON` / OAuth env for Gmail/PDF parse                                                                                                                                                                           |
| `mark-paid.service.ts`          | Native mark paid/unpaid/receipt (Postgres + `reminder_logs` + calendar); supports partial payments and multi-receipt sums per due entry                                                                                                                                                                       |
| `due-entry-upsert.service.ts`   | Upsert `due_entries` from SOA rows (no JSON state file)                                                                                                                                                                                       |
| `due-entry-query.service.ts`    | Due entry lookup for mark-paid and receipts                                                                                                                                                                                                   |
| `google-calendar.service.ts`    | Per-user calendar ID + OAuth; wraps `lib/soa/google-calendar.ts`                                                                                                                                                                              |
| `notification.service.ts`       | Native Telegram/Slack sends via `integration.service`                                                                                                                                                                                         |
| `reminder-log.service.ts`       | `reminder_logs` idempotency                                                                                                                                                                                                                   |
| `send-due-reminders.service.ts` | Native due reminder dispatch                                                                                                                                                                                                                  |
| `default-automation.service.ts` | Idempotent seed of default payment reminders + SOA Gmail check jobs; dedupes managed job types; migrates non-daily reminder schedules to daily                                                                                                |
| `automation.service.ts`         | Job CRUD, dispatch (`isAutomationJobDue` + overdue `next_run_at` catch-up), run-now; production cron via Supabase **pg_cron** + Vercel daily fallback → `/api/cron/dispatch`; `send_due_reminders` updates lock schedule to daily (time only) |
| `overview.service.ts`           | Dashboard snapshot: current period mission data, shared spend/summary stats, reminder attention flags                                                                                                                                         |

SOA pipeline lives in **`src/lib/soa/`** (Gmail fetch, bank parsers, summary PDF, calendar). Mark-paid, reminders, and due sync are native in `server/services/`. Workdir: `/tmp/kame-ops-{userId}/`. See `docs/temp/pay-credit-cards-migration.md`.

## Scripts

| Script                        | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `apps/web` `db:seed`          | Prints Google sign-in setup instructions                             |
| `scripts/setup-supabase.ts`   | Supabase storage buckets + `db:push` (`docs/temp/supabase-setup.md`) |
| `scripts/migrate-from-cli.ts` | Import `cards.json` + `due-reminders-state.json`                     |
