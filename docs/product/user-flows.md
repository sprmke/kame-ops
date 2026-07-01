# User Flows

**Status:** Planned high-level flows for v1 dashboard.

## Onboarding

1. Sign up / sign in (Supabase Auth)
2. Connect integrations (Telegram, Slack, Gmail, Calendar)
3. Add credit cards (or import from migration script)
4. Run first SOA

## Monthly SOA cycle

1. Bank emails SOA → manual **Run SOA** (or scheduled `run_soa_pipeline` automation)
2. View parsed statement, transactions, summary PDF
3. Calendar events + reminder window start (D-4…D-0)
4. Daily reminder pings until paid
5. Mark paid via UI, Telegram, or receipt photo
6. Reminders stop; calendar shows paid

## Reminders & schedule

1. Open **Reminders** → **Schedule** (payment reminders + SOA Gmail check) and **Due dates** (cards in window)
2. Toggle a job, edit daily time, or run now
3. Mark paid/unpaid on due cards; upload receipt from mark-paid flow

## Automation management

Managed on **Reminders** (Schedule section). `/dashboard/automations` redirects there.

1. Payment reminders — daily check for cards in reminder window
2. SOA Gmail check — daily fetch/parse pipeline
3. Toggle job, view last run status, retry with Run now

## Receipt upload

1. Upload payment receipt in **Receipts**
2. AI validates card, amount, and bank/wallet (Gemini + Groq fallback)
3. Mark SOA paid when amount meets minimum/total due

Expand with screen-level steps when UI is implemented.
