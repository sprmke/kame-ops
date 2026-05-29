# Implementation Roadmap

## Phase 0 — Foundation ✅

- Turborepo, Next.js 15, Drizzle, tRPC, NextAuth, dashboard shell

## Phase 1 — Integrations & settings ✅ (mostly)

- [x] Integrations UI + encrypted storage + runtime env bridge
- [x] Settings page with env docs and connection status
- [ ] Gmail OAuth UI (legacy `configs/` still used)

## Phase 2 — Credit cards module ✅

- [x] Card CRUD + edit + confirm delete
- [x] SOA pipeline + **persist to `soa_statements`**
- [x] Mark paid/unpaid from dashboard + Telegram webhook

## Phase 3 — Reminders & notifications ✅

- [x] Due list with paid/unpaid sections
- [x] Send reminders + cron route
- [x] Integration secrets applied before legacy runs

## Phase 4 — Automations ✅

- [x] Job CRUD, manual run, run history in UI
- [x] Cron routes
- [ ] Supabase Cron dashboard (manual external setup)

## Phase 5 — Receipts ✅ (basic)

- [x] Upload API + OCR tRPC + list UI
- [ ] Supabase Storage (local tmp upload for now)

## Phase 6 — Analytics ✅

- [x] Bar chart, pie chart, stat cards

## Phase 7 — Telegram & calendar ✅ (basic)

- [x] Webhook mark-paid / mark-unpaid text commands
- [ ] Photo receipt handling in webhook
- [ ] In-app calendar view

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
