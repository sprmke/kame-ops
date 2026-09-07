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
| `/dashboard/settings`                     | `dashboard/settings` — integrations (multi Google/Gmail accounts, Telegram, Slack, Receipt AI keys) + transaction category rules   | Implemented           |

## tRPC API

| Router                  | Procedures                                                                                                                                                                                                                                  | Status                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `creditCards`           | list, get, create, update, delete                                                                                                                                                                                                           | Implemented — create/edit require recurring `dueDay`; list includes `googleAccountLabel`; `googleAccountId` per card for SOA Gmail routing                                                                                                           |
| `soa`                   | listPeriods, getPeriod, getStatement, updatePeriod, deletePeriod, list, runPipeline, **getRunProgress**, **processManualUpload**, dedupe, clearHistory                                                                                      | Implemented — period detail has Overview / Transactions / Analytics tabs; `runPipeline` accepts optional `runId` for live progress polling; **processManualUpload** parses a stored PDF/image into persist/dues/analytics                            |
| `transactionCategories` | listOptions, **listUserCategories**, **createCategory**, **deleteCategory**, listRules, createRule, updateRule, deleteRule, updateTransactionCategory, **getCategorizeProgress**, **categorizeStatementWithAi**, **categorizePeriodWithAi** | Implemented — built-in + user custom categories; add from SOA transaction picker or Settings; keyword rules + learned corrections; AI categorize with live progress                                                                                  |
| `reminders`             | listDue, status, markPaid, markUnpaid, **getActionProgress**                                                                                                                                                                                | Implemented — due reminders run via default `send_due_reminders` automation; mark paid/unpaid with live progress polling                                                                                                                             |
| `automations`           | list, create, update, setActive, delete, run, **getRunProgress**                                                                                                                                                                            | Implemented — `run` requires `processId` for live progress; reminders use `reminder_run_progress`, SOA uses `soa_run_progress`                                                                                                                       |
| `integrations`          | list, upsert, getFormConfigs, **checkGoogleAuth**, **listGoogleAccounts**, **getGoogleLinkUrl**, **updateGoogleAccountCards**, **disconnectGoogleAccount**                                                                                  | Implemented — multi Google/Gmail accounts per user; link flow via `/api/auth/google/link`; manage linked cards per account in Settings; reconnect modal uses link OAuth (no session switch)                                                          |
| `aiKeys`                | getFormConfig, save, verify                                                                                                                                                                                                                 | Implemented — comma-separated Gemini/Groq keys per user (rotation)                                                                                                                                                                                   |
| `receipts`              | list, unpaidDueEntries, **getUploadProgress**, validateAndMarkPaid, **analyzeUploadBatch**, **processUploadBatch**, confirmMarkPaid, **revalidateWithAi**, **delete**                                                                       | Implemented — multi-file upload with AI card grouping; one progress panel per detected card/bank; monotonic batch progress via `receipt_upload_progress.item_*`; partial/multi-receipt sums per due entry; month view groups by SOA statement period |
| `overview`              | **stats**                                                                                                                                                                                                                                   | Implemented — period mission panel (statement paid %, **minimum met per card**, cards paid, attention list), shared SOA spend/summary cards                                                                                                          |

## REST / webhooks

| Route                                | Purpose                                                                                                                                                                                                                                      | Status      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `GET /api/auth/google/link`          | Start OAuth to link an additional Google/Gmail account (session required); optional `creditCardId` query params                                                                                                                              | Implemented |
| `GET /api/auth/google/link/callback` | OAuth callback — upserts `accounts`, links selected credit cards, redirects to `callbackUrl` with status                                                                                                                                     | Implemented |
| `POST /api/auth/register`            | Removed — use Google sign-in                                                                                                                                                                                                                 | —           |
| `GET /api/cron/dispatch`             | Cron: run due `automation_jobs` + payment reminders (Bearer `CRON_SECRET`); **Supabase pg_cron** + Vercel both **once daily** (`0 4 * * *` UTC); overdue jobs run when `next_run_at` is past — see `docs/temp/scheduled-jobs-and-testing.md` | Implemented |
| `GET /api/health/engines`            | Local prod verify: pdf/qpdf engine status (localhost only)                                                                                                                                                                                   | Implemented |
| `GET /api/soa/pdf`                   | Stream SOA source or period summary PDF (auth); resolves storage paths or temp workdir                                                                                                                                                       | Implemented |
| `POST /api/soa/manual-upload`        | Store a manually uploaded SOA PDF or image (auth); processing is `soa.processManualUpload`                                                                                                                                                   | Implemented |
| `POST /api/webhooks/telegram`        | Telegram updates (text + receipt photos)                                                                                                                                                                                                     | Implemented |
| `POST /api/receipts/upload`          | Receipt file upload (Supabase or local)                                                                                                                                                                                                      | Implemented |
| `GET /api/receipts/file`             | Stream receipt image/PDF for authenticated user (`receiptId`)                                                                                                                                                                                | Implemented |

## Database (Drizzle)

| Table                                | Purpose                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `users`, auth tables                 | NextAuth users; `accounts.google_email` for linked Gmail display                                                                      |
| `credit_cards`                       | Card credentials (encrypted PDF password, required-on-save recurring `due_day`, `soa_subject`, `color`, optional `google_account_id`) |
| `soa_periods`                        | SOA run periods (date range + notify/calendar settings; `summary_pdf_storage_path`)                                                   |
| `soa_statements`, `soa_transactions` | SOA history                                                                                                                           |
| `user_transaction_categories`        | User-defined spend categories (AI-created or future custom labels)                                                                    |
| `due_entries`                        | Due dates / paid state; `source` distinguishes parsed SOA rows from preventive missing-SOA expectations                               |
| `integrations`                       | Encrypted provider config (Gmail, Telegram, Slack, Calendar)                                                                          |
| `ai_api_keys`                        | Encrypted per-user Gemini/Groq API keys for receipt validation                                                                        |
| `reminders`, `reminder_logs`         | `reminder_logs`: idempotent send tracking per due entry                                                                               |
| `automation_jobs`, `automation_runs` | Scheduled jobs; default `send_due_reminders` and `run_soa_pipeline` seeded on first Reminders/Automations visit (daily 12:00 PM)      |
| `ai_categorize_progress`             | Ephemeral AI categorization progress snapshots (step polling)                                                                         |
| `receipts`                           | Payment receipt uploads + AI validation (`ai_verdict`, `payment_status`, links to `due_entries`)                                      |
| `activity_logs`                      | Audit trail                                                                                                                           |

## Services (server)

| Service                         | Purpose                                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gmail.service.ts`              | Multi Google/Gmail accounts; per-card OAuth env bridge (`applyTokensToEnv`); `getGoogleAccountIdsForSoa` validates all inboxes used by active cards before SOA                                                                                |
| `storage.service.ts`            | Supabase Storage uploads + local fallback                                                                                                                                                                                                     |
| `integration.service.ts`        | Encrypted per-user integrations                                                                                                                                                                                                               |
| `receipt-validation.service.ts` | Gemini/Groq vision validation — keys from `ai_api_keys` only (Settings)                                                                                                                                                                       |
| `receipt.service.ts`            | Receipt upload processing + mark paid                                                                                                                                                                                                         |
| `soa-workdir.service.ts`        | Per-user SOA workdir + `CARDS_JSON` / OAuth env for Gmail/PDF parse                                                                                                                                                                           |
| `mark-paid.service.ts`          | Native mark paid/unpaid/receipt (Postgres + `reminder_logs` + calendar); supports partial payments and multi-receipt sums per due entry                                                                                                       |
| `due-entry-upsert.service.ts`   | Upsert `due_entries` from SOA rows (no JSON state file)                                                                                                                                                                                       |
| `due-entry-query.service.ts`    | Due entry lookup for mark-paid and receipts                                                                                                                                                                                                   |
| `google-calendar.service.ts`    | Per-user calendar ID + OAuth; wraps `lib/soa/google-calendar.ts`                                                                                                                                                                              |
| `notification.service.ts`       | Native Telegram/Slack sends via `integration.service`                                                                                                                                                                                         |
| `reminder-log.service.ts`       | `reminder_logs` idempotency                                                                                                                                                                                                                   |
| `send-due-reminders.service.ts` | Native due reminder dispatch                                                                                                                                                                                                                  |
| `expected-due-entry.service.ts` | Creates fallback due entries when the reminder window opens without a parsed SOA; clamps days 29–31 for shorter months                                                                                                                        |
| `default-automation.service.ts` | Idempotent seed of default payment reminders + SOA Gmail check jobs; dedupes managed job types; migrates non-daily reminder schedules to daily                                                                                                |
| `automation.service.ts`         | Job CRUD, dispatch (`isAutomationJobDue` + overdue `next_run_at` catch-up), run-now; production cron via Supabase **pg_cron** + Vercel daily fallback → `/api/cron/dispatch`; `send_due_reminders` updates lock schedule to daily (time only) |
| `overview.service.ts`           | Dashboard snapshot: current period mission data, shared spend/summary stats, reminder attention flags                                                                                                                                         |
| `soa-ai-extract.service.ts`     | Gemini/Groq extraction of SOA fields + transactions from text or images (`ai_api_keys`)                                                                                                                                                       |
| `soa-manual-upload.service.ts`  | Manual SOA upload: unlock/OCR/parse, bank + month detection, period alignment, persist + due upsert                                                                                                                                           |
| `user-rows.service.ts`          | Per-request loaders for the user-scoped row sets most reads share (`due_entries`, `soa_statements`, `credit_cards`) plus their invalidate helpers                                                                                             |

SOA pipeline lives in **`src/lib/soa/`** (Gmail fetch, bank parsers, summary PDF, calendar). Each active card resolves a `googleAccountId` (explicit or default); `runSoaSingleMonth` switches Gmail clients per issuer search config. Mark-paid, reminders, and due sync are native in `server/services/`. Workdir: `/tmp/kame-ops-{userId}/`. See `docs/temp/pay-credit-cards-migration.md`.

## Data loading and caching

| Piece                                  | Purpose                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `server/ssr.ts`                        | `createSsrHelpers` + `prefetchForPage`: prefetch a page's queries during the server render and return dehydrated state               |
| `components/providers/TrpcHydrate.tsx` | Client wrapper that superjson-deserializes that state into a `HydrationBoundary` so `useQuery` reads it without a network round trip |
| `server/lib/request-cache.ts`          | `AsyncLocalStorage` memoization for one request (`runWithRequestCache`, `cachedPerRequest`, `invalidateRequestCache`)                |
| `server/services/user-rows.service.ts` | The shared row loaders built on that cache                                                                                           |
| `hooks/use-nav-data-prefetch.ts`       | Warms each dashboard route's queries on sidebar hover/focus, since Next route prefetch only fetches the shell for dynamic pages      |

Dashboard pages are Server Components that call `prefetchForPage` and render inside `TrpcHydrate`. The tRPC GET handler wraps requests in `runWithRequestCache`; POST is deliberately excluded so mutations always read fresh rows. Read paths that repair rows (`statement-card-identity.service.ts`) call the matching invalidate helper after writing.

## Scripts

| Script                             | Purpose                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` `db:seed`               | Prints Google sign-in setup instructions                                                                                      |
| `scripts/setup-supabase.ts`        | Supabase storage buckets + `db:push` (`docs/temp/supabase-setup.md`)                                                          |
| `scripts/migrate-from-cli.ts`      | Import `cards.json` + `due-reminders-state.json`                                                                              |
| `apps/web` `scripts/perf-probe.ts` | Times the hot dashboard tRPC procedures against the real database (`bun --conditions=react-server run scripts/perf-probe.ts`) |
