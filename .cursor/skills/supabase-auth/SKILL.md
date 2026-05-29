---
name: supabase-auth
description: Supabase Auth skill for implementing authentication, authorization context, sessions, and OAuth providers for web and mobile clients.
---

# Supabase Auth Skill

Use Supabase Auth as the only auth provider for this project.

## Standards

- Use Supabase JWT/session validation server-side.
- Populate tRPC context with resolved `user`.
- Keep RBAC and tenancy checks in service layer.
- Never rely only on client claims for permission decisions.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
```

## Server Context Pattern

```typescript
import { supabaseAdmin } from '@/lib/auth/supabase-auth';

export async function getRequestUser(accessToken: string) {
  const { data } = await supabaseAdmin.auth.getUser(accessToken);
  return data.user ?? null;
}
```
