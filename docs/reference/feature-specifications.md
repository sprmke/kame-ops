# Feature Specifications

**Status:** Stub. Add per-feature specs as modules are implemented.

## Credit cards module

See `docs/temp/pay-credit-cards-migration.md` and `.cursor/rules/18-credit-cards-module.mdc` for legacy behavior and porting requirements.

### Manual SOA upload

- **Upload:** `POST /api/soa/manual-upload` stores the file; `soa.processManualUpload` parses it.
- **Inputs:** `periodId`, `storagePath`, `originalFileName`, optional `mimeType`, `forceMonth`/`forceYear`, `allowOutOfRange`.
- **Alignment:** statement date (else due date) vs the period range. In-range months persist immediately; out-of-range or unknown month returns `needs_confirmation`.
- **Parse path:** PDF unlock with card passwords → text/OCR → bank parsers → AI fill. Images use AI vision (Gemini, Groq fallback). Settings `ai_api_keys` required for AI.
- **Card assignment:** last-4 must match a card the user owns; issuer is taken from that card (or from statement text when last-4 is shared). Unknown last-4 is rejected — not assigned to a random card.
- **Dates:** statement/due dates accept ISO (`YYYY-MM-DD`) and display (`Mon DD, YYYY`); invalid overflow dates (e.g. Feb 31) are ignored.
- **Upload safety:** MIME is sniffed from file bytes (empty `Content-Type` is not trusted). `storagePath` must belong to the authenticated user.
- **Persist:** same `soa_statements` / `soa_transactions` / `due_entries` path as Gmail runs (`sourceMessageId` prefix `manual:`).

- Card create requires `dueDay` (integer 1–31); card edit requires it in the UI.
- The monthly expected date clamps to the month’s last day.
- During the configured reminder window, an active card without an SOA-backed due entry gets an `expected` due entry.
- Expected entries show missing-SOA guidance, generate reminders/calendar events, and cannot be marked paid.
- SOA ingestion upgrades the same card/month entry to `source = soa`.

## Platform

- Reminders: generic engine with `relatedEntityType` / `relatedEntityId`
- Automations: Supabase Cron + `automation_runs` logging
- Integrations: per-user OAuth and webhook config
