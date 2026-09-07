# KameOps

**A business automation platform for reminders, scheduled jobs, notifications, and integrations — with Philippine credit card SOA workflows as the first module.**

Track statement-of-account PDFs from Gmail, parse dues across multiple PH banks, send Telegram/Slack reminders, validate payment receipts with AI, and mark cards paid from the dashboard or bot. Built with **Next.js 15**, **tRPC**, **Drizzle**, **Supabase**, and **Bun**.

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#routes">Routes</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/tRPC-11-2596BE?style=flat-square" alt="tRPC" />
  <img src="https://img.shields.io/badge/Drizzle-ORM-000?style=flat-square" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Bun-F9F1E1?style=flat-square&logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/Vercel-000?style=flat-square&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/Google-OAuth-4285F4?style=flat-square&logo=google" alt="Google OAuth" />
</p>

---

## Features

### Credit cards & SOA

- **Card CRUD** — encrypted PDF passwords, recurring due day, per-card Gmail routing, bank issuer config
- **SOA pipeline** — Gmail fetch → PDF unlock/parse → summary PDF → Postgres upsert
- **Bank parsers (PH)** — Metrobank, RCBC, BPI, Unionbank; OCR fallback when PDF text is unusable
- **Manual SOA upload** — drag-and-drop PDF or image; auto-detects bank and statement period
- **Period workspace** — Overview, Transactions, and Analytics tabs per billing cycle
- **Transaction categories** — built-in labels, custom categories, keyword rules, AI categorization

### Due tracking & reminders

- **Due entries** — minimum/total due, paid status, partial payments, multi-receipt sums
- **Mark paid / unpaid** — dashboard UI, Telegram webhook, receipt AI validation
- **Scheduled reminders** — default daily jobs for payment alerts and SOA Gmail checks
- **Preventive due entries** — fallback rows when the reminder window opens without a parsed SOA
- **Google Calendar** — optional due-date events per card cycle

### Receipts & AI validation

- **Multi-file upload** — batch processing with live progress per detected card/bank
- **Gemini / Groq vision** — validates payment screenshots against due amounts
- **Telegram bot** — send receipt photos to mark cards paid from chat
- **Month view** — receipts grouped by SOA statement period

### Integrations & automations

- **Multi Google/Gmail accounts** — link additional inboxes without switching sessions
- **Telegram & Slack** — outbound notifications and inbound mark-paid via webhook
- **Automation jobs** — cron-style scheduling with run history and manual trigger
- **Supabase pg_cron + Vercel** — daily dispatch for due jobs and SOA pipeline

### Dashboard

- **Overview** — statement paid %, minimum met per card, attention list, spend summary
- **Settings** — integrations, AI API keys, transaction category rules
- **Light / dark mode** via `next-themes`
- Public `/` landing — dashboard routes require Google sign-in

---

## Tech Stack

| Layer     | Technology                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Framework | [Next.js 15](https://nextjs.org/) (App Router, Turbopack)                                                       |
| UI        | [React 19](https://react.dev/), [Tailwind CSS 3](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| API       | [tRPC 11](https://trpc.io/) + [TanStack Query 5](https://tanstack.com/query)                                    |
| Database  | [Supabase Postgres](https://supabase.com/) + [Drizzle ORM](https://orm.drizzle.team/)                           |
| Auth      | [NextAuth 5](https://authjs.dev/) — Google OAuth (Gmail + Calendar scopes)                                      |
| Storage   | [Supabase Storage](https://supabase.com/storage) (SOA PDFs, receipts)                                           |
| PDF / OCR | pdfjs-dist, qpdf-wasm, Tesseract.js, pdfkit                                                                     |
| AI        | Gemini / Groq (receipt validation, SOA extraction, transaction categorization)                                  |
| Monorepo  | [Turborepo](https://turbo.build/) + [Bun](https://bun.sh/)                                                      |
| Hosting   | [Vercel](https://vercel.com/) — [kame-ops-web.vercel.app](https://kame-ops-web.vercel.app)                      |
| Toasts    | [Sonner](https://sonner.emilkowal.ski/)                                                                         |
| Forms     | React Hook Form + Zod                                                                                           |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.1+ and Node.js 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (local Postgres) **or** a [Supabase](https://supabase.com/) project
- [Google Cloud](https://console.cloud.google.com/) OAuth 2.0 **Web application** credentials (Gmail + Calendar scopes)

### 1. Clone and install

```bash
git clone https://github.com/sprmke/kame-ops.git
cd kame-ops
bun install
```

### 2. Environment variables

Create `apps/web/.env.local`. Minimum for local Docker Postgres:

| Variable               | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `DATABASE_URL`         | Postgres connection string                     |
| `AUTH_SECRET`          | Random string, 32+ chars                       |
| `ENCRYPTION_KEY`       | Random string, 32+ chars (integration secrets) |
| `NEXT_PUBLIC_APP_URL`  | `http://localhost:3005`                        |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                         |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                     |

For **Supabase** (Postgres + Storage in production), also set `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and storage bucket names. Full walkthrough: [`docs/temp/supabase-setup.md`](./docs/temp/supabase-setup.md).

**Google OAuth setup**

1. Create OAuth credentials (Web application) in Google Cloud Console.
2. Enable Gmail API and Google Calendar API.
3. Add authorized redirect URI: `http://localhost:3005/api/auth/callback/google`
4. Add authorized JavaScript origins: `http://localhost:3005` (and your production URL).

### 3. Bootstrap local stack

One command installs deps, starts Docker Postgres, pushes schema, and prints sign-in instructions:

```bash
bun run setup:local
```

Or bootstrap and start the dev server in one step:

```bash
bun run dev:local
```

For Supabase instead of Docker:

```bash
bun run setup:supabase
```

### 4. Run locally

```bash
bun run dev
```

Open [http://localhost:3005](http://localhost:3005).

- **`/`** — public landing page
- **`/login`** — Google sign-in
- **`/dashboard`** — overview (after auth)

---

## Scripts

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `bun run dev`            | Start Next.js dev server (port 3005)                     |
| `bun run dev:local`      | Bootstrap local stack + start dev server                 |
| `bun run setup:local`    | Install, Docker Postgres, schema push, seed instructions |
| `bun run setup:supabase` | Create storage buckets + apply schema to Supabase        |
| `bun run build`          | Production build (Turborepo)                             |
| `bun run lint`           | ESLint across workspace                                  |
| `bun run type-check`     | TypeScript check                                         |
| `bun run test`           | Vitest unit tests                                        |
| `bun run db:generate`    | Generate Drizzle migrations                              |
| `bun run db:migrate`     | Run migrations                                           |
| `bun run db:push`        | Push schema (dev only)                                   |
| `bun run db:studio`      | Open Drizzle Studio                                      |
| `bun run format`         | Prettier write                                           |

---

## Project structure

```text
apps/web/
  src/app/                    # Routes only (pages, layouts, API handlers)
  src/features/dashboard/     # Feature modules
    credit-cards/             # Card CRUD
    soa/                      # SOA periods, statements, analytics
    reminders/                # Due entries, mark paid, automations
    receipts/                 # Upload + AI validation
    integrations/             # Gmail, Telegram, Slack settings
    settings/                 # Profile, AI keys, category rules
    overview/                 # Dashboard home
  src/server/
    routers/                  # tRPC routers
    services/                 # Business logic (SOA, reminders, receipts, …)
  src/lib/soa/                # Gmail fetch, bank parsers, summary PDF
docs/                         # Product and technical documentation
scripts/                      # Local setup, Supabase bootstrap, CLI migration
.cursor/                      # Cursor rules, skills, hooks, agents
```

---

## Routes

| Route                       | Access | Description                                         |
| --------------------------- | ------ | --------------------------------------------------- |
| `/`                         | Public | Marketing landing                                   |
| `/login`                    | Public | Google OAuth sign-in                                |
| `/dashboard`                | Auth   | Overview and mission panel                          |
| `/dashboard/credit-cards`   | Auth   | Manage cards                                        |
| `/dashboard/soa`            | Auth   | SOA period list                                     |
| `/dashboard/soa/[periodId]` | Auth   | Period detail (Overview / Transactions / Analytics) |
| `/dashboard/reminders`      | Auth   | Due entries, mark paid, scheduled jobs              |
| `/dashboard/receipts`       | Auth   | Receipt upload and validation                       |
| `/dashboard/settings`       | Auth   | Integrations, AI keys, category rules               |

---

## AI development

| Path                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| [`.cursorrules`](./.cursorrules)       | Main Cursor rules                                  |
| [`.cursor/rules/`](./.cursor/rules/)   | Modular rules                                      |
| [`.cursor/skills/`](./.cursor/skills/) | Agent skills (`/credit-cards`, `/integrations`, …) |
| [`docs/`](./docs/)                     | Product and technical docs                         |

---

## Related projects

- [`property-management-app`](https://github.com/sprmke) — Kame Homes (reference stack)
- [`automated-tasks/pay-credit-cards`](../automated-tasks/pay-credit-cards) — legacy CLI source (ported into KameOps services)

---

## License

Private / personal use.

---

<p align="center">
  Built for operators who want reminders, SOA parsing, and payment tracking in one place — not scattered scripts and inbox tabs.
</p>
