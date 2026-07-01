# pay-credit-cards → KameOps Migration

Temporary reference for porting the CLI at `automated-tasks/pay-credit-cards/`.

## State migration

| Legacy                              | KameOps table                                  |
| ----------------------------------- | ---------------------------------------------- |
| `CARDS_JSON` env                    | `credit_cards`                                 |
| `due-reminders-state.json` → `dues` | `due_entries`                                  |
| `due-reminders-state.json` → `sent` | `reminder_logs`                                |
| `telegram-bot-state.json`           | Not needed (webhook replaces long-poll offset) |
| `data/downloads/`, `data/output/`   | Supabase Storage + `/tmp/kame-ops-{userId}/`   |
| `data/receipts/`                    | Supabase Storage + `receipts` table            |

## Behavior parity checklist

- [x] SOA single month + range PDF (`lib/soa/run.ts`, `lib/soa/summary-pdf.ts`)
- [x] Daily reminders D-4…D-0, idempotent fingerprints (`reminder_logs` + native send)
- [x] Telegram PDF + Slack text (`notification.service`)
- [x] Google Calendar D-4…D-0 + mark paid/unpaid (`google-calendar.service` + `lib/soa/google-calendar.ts`)
- [x] Telegram paid/unpaid text commands (native `mark-paid.service`)
- [x] Receipt AI validation + minimum due threshold for mark paid
- [x] Bank parsers: metrobank, rcbc, bpi, unionbank (`lib/soa/parse-soa.ts`, etc.)

## Web app module layout (current)

| Path                                            | Role                                                          |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `lib/soa/`                                      | SOA run, parsers, PDF, summary PDF, Gmail fetch, calendar API |
| `lib/reminders/`                                | Message bodies, mark-paid parsers                             |
| `lib/google/`                                   | OAuth client for Gmail/Calendar                               |
| `server/services/soa-workdir.service.ts`        | Per-user workdir + env bridge                                 |
| `server/services/mark-paid.service.ts`          | Mark paid/unpaid/receipt                                      |
| `server/services/send-due-reminders.service.ts` | Scheduled reminders                                           |
| `server/services/due-entry-upsert.service.ts`   | SOA → `due_entries`                                           |

**Removed:** `server/legacy/pay-credit-cards/`, `due-reminders-state.json` runtime, `due-sync.service`, legacy `notify.ts`, `send-reminders.ts`, `mark-paid.ts`.

## Scheduling

| Legacy                   | KameOps                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| launchd `poll-new-soa`   | **Run SOA** UI or `run_soa_pipeline` automation                  |
| launchd `send-reminders` | Default `send_due_reminders` automation via `/api/cron/dispatch` |
| launchd `telegram-bot`   | Telegram webhook at `/api/webhooks/telegram`                     |

## CLI import (one-time)

`scripts/migrate-from-cli.ts` — import `cards.json` + `due-reminders-state.json` into Postgres.

## Source file map

See `.cursor/skills/credit-cards/SKILL.md` for file → service mapping.
