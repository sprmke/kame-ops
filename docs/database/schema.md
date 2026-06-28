# Database Schema

**Status:** Planned. Drizzle schema will live in `apps/web/src/lib/db/schema/` (or `packages/database` when extracted).

## Core tables (planned)

- `users` — profile extension for Supabase Auth users
- `credit_cards` — card credentials (encrypted PDF password), optional `soa_subject` (Gmail SOA search), `color` (#RRGGBB accent)
- `soa_statements`, `soa_transactions` — parsed SOA data
- `due_entries` — payment due tracking
- `receipts` — uploaded receipt images + AI validation fields
- `reminders`, `reminder_logs` — generic reminder engine
- `integrations` — Gmail, Telegram, Slack, Calendar per user
- `automation_jobs`, `automation_runs` — cron definitions and logs
- `notification_channels` — user notification preferences
- `activity_log` — audit trail

## Conventions

- UUID primary keys
- `deletedAt` soft delete where applicable
- All user-owned rows include `userId` FK
- Encrypt secrets at application layer before insert

Update this doc when schema is implemented.
