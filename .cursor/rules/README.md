# Cursor Rules for KameOps

Modular rules for **KameOps** — business automation platform (credit cards as first module). Mirrors patterns from Kame Homes (`property-management-app`).

## Rules Overview

| File                              | Description                                  | Activation            |
| --------------------------------- | -------------------------------------------- | --------------------- |
| `00-project-context.mdc`          | Global context, docs map, module boundaries  | Always                |
| `01-tech-stack.mdc`               | Bun, Next.js, React, TypeScript              | `*.ts`, `*.tsx`       |
| `02-architecture.mdc`             | Monorepo, features, server layout            | All files             |
| `03-database.mdc`                 | Drizzle ORM patterns                         | Schema, services      |
| `04-api.mdc`                      | tRPC routers and services                    | Routers, services     |
| `05-components.mdc`               | React + shadcn/ui                            | `*.tsx`               |
| `06-state-management.mdc`         | TanStack Query + Zustand                     | Hooks, stores         |
| `07-forms.mdc`                    | React Hook Form + Zod                        | Forms                 |
| `08-security.mdc`                 | Auth, encryption, user scoping               | Server code           |
| `09-testing.mdc`                  | Vitest + Playwright                          | Tests                 |
| `10-performance.mdc`              | Performance budgets                          | Code                  |
| `11-workflow.mdc`                 | Dev workflow, feature order                  | All                   |
| `12-thinking-framework.mdc`       | Plan before coding                           | Always                |
| `13-ui-ux-design.mdc`             | Design system, themes                        | UI                    |
| `14-dashboard-ui.mdc`             | Dashboard screens                            | Dashboard features    |
| `15-accessibility.mdc`            | WCAG 2.1 AA                                  | UI                    |
| `16-docs-sync.mdc`                | Keep docs aligned with code                  | Always                |
| `17-supabase-platform.mdc`        | Supabase Postgres/Auth/Storage               | Server, env           |
| `17-mobile-readiness.mdc`         | Mobile-ready APIs                            | All                   |
| `18-credit-cards-module.mdc`      | SOA, dues, mark-paid, banks                  | CC module             |
| `19-automations-integrations.mdc` | Cron, webhooks, Gmail/Telegram/Slack         | Automations           |
| `20-legacy-cli-reference.mdc`     | Legacy CLI in automated-tasks                | pay-credit-cards path |
| `21-minimal-ui-copy.mdc`          | No unsolicited UI text; copy only on request | Always                |

## Skills (`.cursor/skills/`)

| Skill                           | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `automation-platform`           | Reminders, cron, notifications (platform) |
| `credit-cards`                  | SOA module, port from CLI                 |
| `integrations`                  | Gmail, Calendar, Telegram, Slack          |
| `supabase-stack`                | Postgres, Auth, Storage                   |
| `supabase-auth`                 | Auth flows                                |
| `drizzle-orm`                   | Schema and queries                        |
| `trpc-api`                      | API layer                                 |
| `tanstack-query`                | Client data fetching                      |
| `tanstack-table`                | Data tables                               |
| `component-generator`           | New components                            |
| `form-builder`                  | Forms                                     |
| `frontend-design` / `ui-design` | UI quality                                |
| `testing`                       | Tests                                     |
| `performance`                   | Optimization                              |
| `emails`                        | Resend / React Email                      |
| `accessibility`                 | A11y                                      |
| `docs-first`                    | Documentation workflow                    |
| `mobile-readiness`              | Future mobile clients                     |
| `aws-s3`                        | Supabase Storage patterns                 |

## Subagents (`.cursor/agents/`)

- `verifier` — Validate completed work
- `debugger` — Root cause analysis
- `test-runner` — Run tests
- `security-auditor` — Auth, secrets, scoping

## Hooks (`.cursor/hooks.json`)

- **afterFileEdit**: Prettier + legacy stack terminology warning
- **beforeShellExecution**: Dangerous command guard

## MCP (user-level)

Configure in Cursor Settings: Supabase MCP, Context7, Browser/Playwright for E2E.

## Related Repos

| Repo                               | Role                         |
| ---------------------------------- | ---------------------------- |
| `kame-ops`                         | This app (build here)        |
| `property-management-app`          | Stack reference (Kame Homes) |
| `automated-tasks/pay-credit-cards` | Legacy CLI source            |
