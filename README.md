# KameOps

Business automation platform: reminders, scheduled jobs, notifications, and integrations. **Credit card SOA management** (Philippine banks) is the first module, migrated from [`automated-tasks/pay-credit-cards`](../automated-tasks/pay-credit-cards).

## Local development

One command bootstraps Docker Postgres, env file, schema, and seed user:

```bash
bun run setup:local    # install + docker + db push + seed
bun run dev:local      # same, then start the dev server
```

After the first run, start the app with:

```bash
bun run dev
```

App URL: **http://localhost:3005** (`bun run dev`).

Sign in at **/login** with Google (grants Gmail + Calendar access for SOA automation). Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/web/.env.local` — see `.env.example` for redirect URI setup.

Requires **Bun**, **Node.js 20+**, and **Docker Desktop** when using local Postgres (`DATABASE_URL` pointing at `localhost`). For **Supabase** (Postgres + Storage), see `docs/temp/supabase-setup.md` and run `bun run setup:supabase` after filling in `.env.local`.

## Status

**Pre-build:** Cursor rules, skills, hooks, agents, and docs are set up. Application scaffold (Next.js monorepo) is next—see `docs/implementation/roadmap.md`.

## Stack

Same as [Kame Homes](https://github.com/) (`property-management-app`): Bun, Turborepo, Next.js, React, tRPC, Drizzle, Supabase, shadcn/ui.

## AI development

| Path                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| [`.cursorrules`](./.cursorrules)       | Main Cursor rules                                  |
| [`.cursor/rules/`](./.cursor/rules/)   | Modular rules                                      |
| [`.cursor/skills/`](./.cursor/skills/) | Agent skills (`/credit-cards`, `/integrations`, …) |
| [`docs/`](./docs/)                     | Product and technical docs                         |

## Related projects

- `property-management-app` — reference implementation (Kame Homes)
- `automated-tasks/pay-credit-cards` — legacy CLI source

## License

Private / personal use.
