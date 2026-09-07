# Database Schema

**Status:** Planned. Drizzle schema will live in `apps/web/src/lib/db/schema/` (or `packages/database` when extracted).

## Core tables (planned)

- `users` — profile extension for Supabase Auth users
- `credit_cards` — card credentials, required-on-save recurring `due_day` (1–31 fallback when SOA is missing), encrypted PDF password, optional `soa_subject`, and `color`
- `soa_statements`, `soa_transactions` — parsed SOA data (Gmail or manual upload; file in `pdf_storage_path`)
- `user_transaction_categories` — per-user custom category slugs/labels (e.g. AI-created)
- `due_entries` — payment due tracking; `source` is `soa` or preventive `expected`
- `receipts` — uploaded receipt images + AI validation fields
- `receipt_upload_progress` — ephemeral DB-backed progress rows for receipt batch upload UI (`item_index`, `item_total`, `items_completed` for monotonic multi-receipt progress)
- `reminders`, `reminder_logs` — generic reminder engine
- `integrations` — Gmail, Telegram, Slack, Calendar per user
- `ai_api_keys` — encrypted Gemini/Groq API keys per user (receipt AI)
- `automation_jobs`, `automation_runs` — cron definitions and logs
- `notification_channels` — user notification preferences
- `activity_log` — audit trail

## Conventions

- UUID primary keys
- `deletedAt` soft delete where applicable
- All user-owned rows include `userId` FK
- Encrypt secrets at application layer before insert

Update this doc when schema is implemented.
