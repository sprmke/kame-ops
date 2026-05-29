# KameOps — Documentation

Central hub for **KameOps** documentation. Topic-based paths mirror Kame Homes (`property-management-app/docs`).

## Quick links

| Section                                                       | Description                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Application Inventory](./reference/application-inventory.md) | **What exists today** — routes, features, API, DB (keep in sync) |
| [Architecture](./architecture/README.md)                      | Structure, tech stack, mobile readiness                          |
| [Database](./database/README.md)                              | Schema design                                                    |
| [Product](./product/README.md)                                | Design system, user flows, dashboard UX                          |
| [Implementation](./implementation/README.md)                  | Roadmap and phases                                               |
| [Temp](./temp/README.md)                                      | Migration notes, exploratory docs                                |

## By role

### New developers

1. Read this README and [`.cursorrules`](../.cursorrules)
2. Skim [architecture/tech-stack.md](./architecture/tech-stack.md) and [architecture/project-structure.md](./architecture/project-structure.md)
3. Read [temp/pay-credit-cards-migration.md](./temp/pay-credit-cards-migration.md) for legacy behavior
4. Follow [implementation/roadmap.md](./implementation/roadmap.md)

### Cursor AI

1. `.cursor/rules/` and `.cursor/skills/` for patterns
2. `reference/application-inventory.md` for current state
3. `18-credit-cards-module.mdc` when working on SOA/dues
4. `19-automations-integrations.mdc` for cron and webhooks

## Maintaining docs

- Update `reference/application-inventory.md` when adding routes, routers, or schema
- Put exploratory notes in `docs/temp/` only
- Promote stable content from `temp/` into main docs when ready
