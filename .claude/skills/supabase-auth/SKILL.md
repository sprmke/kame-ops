---
name: supabase-auth
description: Supabase Auth skill for implementing authentication, authorization context, sessions, and OAuth providers for web and mobile clients.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Supabase Auth Skill

Use Supabase Auth as the authentication standard.

## Defaults

- Validate bearer token/cookie server-side with Supabase Auth.
- Hydrate request context user before protected handlers.
- Keep RBAC in service layer and tenant checks in every query.

## Required Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
