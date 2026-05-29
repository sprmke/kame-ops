# Project Structure

See also `.cursor/rules/02-architecture.mdc` for the canonical layout.

## Monorepo

```
kame-ops/
├── apps/web/                 # Next.js dashboard
├── packages/                 # Shared packages (database, types, ui, emails, …)
├── docs/
├── scripts/                  # CLI migration scripts
└── .cursor/                  # Rules, skills, hooks, agents
```

## App (`apps/web/src`)

| Path                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `app/`                | Routes only                                  |
| `features/dashboard/` | Feature modules (credit-cards, reminders, …) |
| `features/shared/`    | Shared auth forms/hooks                      |
| `components/`         | Shared UI (shadcn)                           |
| `lib/`                | db, api client, auth, env                    |
| `server/`             | tRPC, services, jobs                         |

## Credit cards module

`features/dashboard/credit-cards/` + `server/services/soa*.ts` + routers `credit-cards`, `soa`.

## Legacy CLI

`automated-tasks/pay-credit-cards/` — port into services; do not extend CLI long-term.
