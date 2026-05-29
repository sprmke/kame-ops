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

Default sign-in (from seed): `admin@localhost` / `admin123` (see `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `apps/web/.env.local`).

Requires **Bun** and **Docker Desktop** when using local Postgres (`DATABASE_URL` pointing at `localhost`). For Supabase, set `DATABASE_URL` in `.env.local` — setup skips Docker automatically.

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
