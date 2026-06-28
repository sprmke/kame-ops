# pay-credit-cards → KameOps Migration

Temporary reference for porting the CLI at `automated-tasks/pay-credit-cards/`.

## State migration

| Legacy                              | KameOps table                                  |
| ----------------------------------- | ---------------------------------------------- |
| `CARDS_JSON` env                    | `credit_cards`                                 |
| `due-reminders-state.json` → `dues` | `due_entries`                                  |
| `due-reminders-state.json` → `sent` | `reminder_logs`                                |
| `telegram-bot-state.json`           | Not needed (webhook replaces long-poll offset) |
| `data/downloads/`, `data/output/`   | Supabase Storage                               |
| `data/receipts/`                    | Supabase Storage + `receipts` table            |

## Behavior parity checklist

- [ ] SOA single month + range PDF
- [ ] Daily reminders D-4…D-0, idempotent fingerprints
- [ ] Telegram PDF + Slack text
- [ ] Google Calendar D-4…D-0 + mark paid/unpaid
- [ ] Telegram paid/unpaid text commands
- [x] Receipt AI validation + minimum due threshold for mark paid
- [ ] Bank parsers: metrobank, rcbc, bpi, unionbank

## Scheduling

| Legacy                   | KameOps                                         |
| ------------------------ | ----------------------------------------------- |
| launchd `poll-new-soa`   | **Run SOA** UI or `run_soa_pipeline` automation |
| launchd `send-reminders` | Supabase Cron → `/api/cron/reminders`           |
| launchd `telegram-bot`   | Telegram webhook                                |

## Source file map

See `.cursor/skills/credit-cards/SKILL.md` for file → service mapping.
