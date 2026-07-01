---
name: credit-cards
description: Credit card SOA module for KameOps — Gmail SOA fetch, PDF parsing (Metrobank, RCBC, BPI, Unionbank), due tracking, mark-paid, receipt AI validation. Use when porting pay-credit-cards CLI or building CC UI/API.
---

# Credit Cards Module Skill

## Legacy CLI Source

Reference behavior: `automated-tasks/pay-credit-cards/src/`. Web implementation:

| Legacy file                                                     | Web location                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `soa-run.ts`                                                    | `lib/soa/run.ts` + `soa.service.ts`                                 |
| `parse-soa.ts`, `parse-transactions.ts`, `pdf.ts`, `bpi-ocr.ts` | `lib/soa/`                                                          |
| `summary-pdf.ts`                                                | `lib/soa/summary-pdf.ts`                                            |
| `gmail.ts`                                                      | `lib/soa/gmail-fetch.ts` + `gmail.service.ts`                       |
| `google-calendar.ts`                                            | `lib/soa/google-calendar.ts` + `google-calendar.service.ts`         |
| `notification-body.ts`                                          | `lib/reminders/notification-body.ts`                                |
| `due-reminders-state.ts`                                        | **Removed** — `due_entries` + `reminder_logs`                       |
| `send-reminders.ts`, `notify.ts`                                | **Removed** — `send-due-reminders.service` + `notification.service` |
| `mark-paid.ts`                                                  | **Removed** — `mark-paid.service.ts`                                |
| `receipt-ocr.ts` (CLI)                                          | `receipt-validation.service.ts` (AI vision)                         |

## Card Configuration

DB table `credit_cards` (replaces `CARDS_JSON`). Loaded via `creditCardService.listForSoaPipeline()` into workdir env for SOA run.

## SOA Run

`tRPC` → `soa.service.runSoaPipeline` → `prepareSoaWorkdir` → `lib/soa/run.ts`.

## Parsing Notes

- **RCBC**: prefer geometry-ordered lines when it improves transaction count
- **BPI**: enable OCR path when pdf.js text is empty
- **Unavailable SOA**: set `soaUnavailable` flag; UI shows em dash in overview

## Mark Paid

Native `mark-paid.service.ts` — Postgres + `reminder_logs` + calendar. Text: `(\d{4})\s*[-–—]\s*(.+?)\s*[-–—]\s*paid`.

## Receipt AI keys

Settings → `ai_api_keys` (encrypted). No env vars.

## Summary PDF

`lib/soa/summary-pdf.ts` — paid column from Postgres via `overview-paid-label.ts` inject.

## Migration Checklist

- [ ] Import cards from CLI via `scripts/migrate-from-cli.ts`
- [ ] Import `due-reminders-state.json` → `due_entries` + `reminder_logs`
- [ ] Compare one month SOA output CLI vs web for each bank
