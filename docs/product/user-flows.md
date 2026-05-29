# User Flows

**Status:** Planned high-level flows for v1 dashboard.

## Onboarding

1. Sign up / sign in (Supabase Auth)
2. Connect integrations (Telegram, Slack, Gmail, Calendar)
3. Add credit cards (or import from migration script)
4. Run first SOA or enable Gmail poller automation

## Monthly SOA cycle

1. Bank emails SOA → poller or manual **Run SOA**
2. View parsed statement, transactions, summary PDF
3. Calendar events + reminder window start (D-4…D-0)
4. Daily reminder pings until paid
5. Mark paid via UI, Telegram, or receipt photo
6. Reminders stop; calendar shows paid

## Automation management

1. Open **Automations** → see jobs (SOA poll, reminders)
2. Toggle job, view run history, retry failed run
3. Configure catch-up days for Gmail poller

## Receipt upload

1. Upload sample or payment receipt in **Receipts**
2. OCR + optional AI analysis
3. Link to card / mark paid when amount validates

Expand with screen-level steps when UI is implemented.
