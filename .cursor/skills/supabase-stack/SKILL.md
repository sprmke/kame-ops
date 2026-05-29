---
name: supabase-stack
description: Supabase stack skill for KameOps using Supabase Postgres, Supabase Auth, Supabase Storage, Drizzle, and tRPC. Use when implementing auth, storage, DB integration, or platform-level backend decisions.
---

# Supabase Stack Skill

This skill enforces the finalized backend stack:

- `tRPC + Drizzle + Supabase Postgres`
- `Supabase Auth`
- `Supabase Storage`

## When To Use

- Adding or updating authentication/session logic
- Implementing database access patterns or migrations
- Building file upload/download features
- Updating platform architecture docs/rules/config

## Architecture Defaults

1. Keep all business workflows in TypeScript service layer.
2. Use tRPC as the only app API interface for privileged writes.
3. Verify Supabase JWT in server context before protected procedures.
4. Keep storage provider operations in `upload.service`.
5. Persist storage keys/metadata, not provider-specific URLs.

## Supabase Auth Pattern

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

In request context:

- read bearer token/cookie
- call `supabaseAdmin.auth.getUser(accessToken)`
- set `ctx.user` for protected procedures

## Required Env Vars

```bash
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_PUBLIC=
SUPABASE_STORAGE_BUCKET_PRIVATE=
```

## MCP Workflow

When touching platform code, use:

1. Supabase MCP to inspect schema/advisors/migrations
2. Context7 MCP for latest Supabase/Drizzle/tRPC docs
3. Browser MCP for auth and upload flow verification
