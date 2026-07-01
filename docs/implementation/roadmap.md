# Implementation Roadmap

## Phase 0 — Foundation ✅

- Turborepo, Next.js 15, Drizzle, tRPC, NextAuth, dashboard shell

## Phase 1 — Integrations & settings ✅ (mostly)

- [x] Integrations UI + encrypted storage + runtime env bridge
- [x] Settings page with env docs and connection status
- [x] Gmail OAuth via Google sign-in (Gmail + Calendar scopes)

## Phase 2 — Credit cards module ✅

- [x] Card CRUD + edit + confirm delete
- [x] SOA pipeline + **persist to `soa_statements`**
- [x] Mark paid/unpaid from dashboard + Telegram webhook

## Phase 3 — Reminders & notifications ✅

- [x] Due list with paid/unpaid sections
- [x] Send reminders + cron route
- [x] Integration secrets applied before SOA pipeline runs

## Phase 4 — Automations ✅

- [x] Job CRUD, manual run, run history in UI
- [x] Cron routes
- [ ] Supabase Cron dashboard (manual external setup)

## Phase 5 — Receipts ✅

- [x] Upload API + AI validation + mark paid + list UI
- [x] Supabase Storage service (local `/tmp` fallback when unset)

## Phase 6 — SOA analytics ✅

- [x] Category spend charts on SOA period detail (Overview + Analytics tabs)
- [x] Removed standalone `/dashboard/analytics` route (analytics live under each SOA period)

## Phase 7 — Telegram & calendar ✅ (mostly)

- [x] Webhook mark-paid / mark-unpaid text commands
- [x] Photo receipt handling in webhook
- [ ] In-app calendar view

## Production readiness (in progress)

- [x] CI workflow (lint, type-check, test, build)
- [x] `vercel.json` cron + function timeouts
- [x] Production env validation
- [x] Vitest unit tests (starting)
- [x] Google-only auth (email/password removed)
- [ ] Supabase Cron dashboard (Vercel Cron configured in repo)

## Phase 8 — Migration ✅

- [x] CLI import script + db seed

## Polish (latest) ✅

- [x] Landing page redesign
- [x] Dashboard overview with live stats
- [x] Slim Edge middleware (no DB in middleware)
- [x] Auth error page
- [x] Shared `DashboardPageHeader`, `StatCard`, `StatusBadge`, `EmptyState`

## Local dev

```bash
cd apps/web && cp .env.example .env.local
bun run db:push && bun run db:seed
cd ../.. && bun run dev
```

Open http://localhost:3005
