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

## Manual SOA upload

Period detail **Upload** accepts PDF/image when the bank does not email SOA. Detects issuer + last-4 **only if that last-4 exists on the user's cards**, picks the statement month inside a multi-month period, and prompts when the file is outside the current period. AI (`ai_api_keys`) fills fields parsers cannot read. Persist + due upsert reuse the Gmail pipeline. Uploads are MIME-sniffed; `storagePath` must belong to the user.

## Parsing Notes

- **RCBC**: prefer geometry-ordered lines when it improves transaction count
- **OCR fallback (any bank)**: `run.ts` auto-triggers OCR (`lib/soa/pdf-ocr.ts`) for
  ANY issuer once `assessSoaTextQuality` (`lib/soa/text-quality.ts`) flags the pdf.js
  text as unusable (empty, no peso/date tokens, garbled glyphs) — not BPI-only.
  `pickBetterSoaText` chooses OCR vs. original text; `SOA_OCR_FORCE` /
  `SOA_OCR_DISABLE` override per issuer or `all`; legacy `BPI_OCR*` vars remain
  BPI-only aliases. See `apps/web/.env.example`.
- **Unavailable SOA**: set `soaUnavailable` flag; UI shows em dash in overview
- **Multi-card completeness**: `run.ts` dedupes downloaded PDFs by `filePath`
  (attachment-level), not `messageId` — a single Gmail message can carry
  multiple card statements as separate attachments; keying on `messageId`
  alone silently drops every attachment after the first. After parsing,
  `findMissingCards` (`lib/soa/soa-coverage.ts`) flags any card whose issuer
  had PDF(s) this period but no row matched its last-4 (wrong/shared password,
  unresolved last-4, etc.) and adds a per-card `unavailableCardRow` placeholder
  instead of letting the card silently disappear from the run.

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
