# Supabase setup for KameOps

Step-by-step guide to connect KameOps to **Supabase Postgres** and **Supabase Storage**.

> Auth stays on **Google OAuth via NextAuth** for now. Supabase Auth is a future migration — this setup uses Supabase only for database and file storage.

---

## 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project**
   - Name: `kame-ops` (do not reuse unrelated projects)
   - Database password: generate a strong password and **save it**
   - Region: **ap-southeast-1** (Singapore — closest to Philippines)
3. Wait until the project status is **Active** (~2 minutes)

---

## 2. Copy connection strings

**Settings → Database → Connection string**

### App runtime (`DATABASE_URL`)

- Tab: **ORMs** or **Connection pooling**
- Mode: **Transaction** (port **6543**)
- Add `?pgbouncer=true` if not present

Example shape:

```
postgresql://postgres.zfttdwtceyqszyeyhilc:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

### Migrations (`DIRECT_URL`)

- Mode: **Session** (port **5432**)

Example shape:

```
postgresql://postgres.zfttdwtceyqszyeyhilc:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Use **URI** format. Replace `[PASSWORD]` with your database password (URL-encode special characters).

---

## 3. Copy API keys

**Settings → API**

| Env var                     | Where                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`              | Project URL → `https://[ref].supabase.co`                    |
| `SUPABASE_ANON_KEY`         | `anon` `public` key                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (**server only**, never expose to client) |

---

## 4. Update `apps/web/.env.local`

Comment out local Docker `DATABASE_URL` and set Supabase values:

```env
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kame_ops

DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://[REF].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET_PUBLIC=kame-ops-public
SUPABASE_STORAGE_BUCKET_PRIVATE=kame-ops-private
```

Keep your existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, and `ENCRYPTION_KEY`.

---

## 5. Run the setup script

From repo root:

```bash
# Verify env + Supabase API connectivity
bun run setup:supabase --check

# Create storage buckets + apply Drizzle schema
bun run setup:supabase
```

What the script does:

| Step     | Action                                                              |
| -------- | ------------------------------------------------------------------- |
| Storage  | Creates `kame-ops-private` and `kame-ops-public` buckets if missing |
| Database | Runs `bun run db:push` against `DIRECT_URL`                         |

Flags:

```bash
bun run setup:supabase --storage   # buckets only
bun run setup:supabase --db        # schema only
```

---

## 6. Sign in and verify

```bash
bun run dev
```

1. Open http://localhost:3005/login → **Continue with Google**
2. **Dashboard → Integrations** — Gmail connected
3. **Dashboard → SOA** — Run SOA (uses Gmail + Supabase-backed app DB)
4. **Dashboard → Receipts** — upload a test image (uses Supabase Storage when configured)

### Check data in Supabase

- **Table Editor** — `users`, `accounts`, `credit_cards`, etc.
- **Storage** — `kame-ops-private` → `receipts/{userId}/...`

---

## 7. Local dev vs Supabase

| Mode       | `DATABASE_URL`            | Docker          |
| ---------- | ------------------------- | --------------- |
| Local only | `localhost:5432/kame_ops` | `bun run db:up` |
| Supabase   | Supabase pooler URL       | Not needed      |

`bun run setup:local` skips Docker when `DATABASE_URL` is not localhost.

---

## 8. Production (Vercel)

Set the same Supabase env vars in Vercel (Production + Preview).

Also set:

- `NEXT_PUBLIC_APP_URL` → your deployed URL
- `AUTH_URL` → same
- Remove `SKIP_ENV_VALIDATION`
- Add production `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`
- After first deploy: enable automation dispatch — **`docs/temp/scheduled-jobs-and-testing.md`** (Vault + pg_cron)

Add your production URL to Google OAuth redirect URIs.

---

## Troubleshooting

### `db:push` fails on pooler URL

Set `DIRECT_URL` (session mode, port 5432). Drizzle uses `DIRECT_URL` when present.

### `Storage upload failed`

- Run `bun run setup:supabase --storage`
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is the **service_role** key
- Bucket names must match `SUPABASE_STORAGE_BUCKET_*`

### Signed in locally but empty dashboard

You switched from Docker to Supabase — data does not migrate automatically. Sign in creates a new user row on Supabase. Re-add credit cards or run `scripts/migrate-from-cli.ts` if importing from legacy CLI.

### Password special characters in connection string

URL-encode `@`, `#`, `%`, etc. in the database password, or reset the DB password in Supabase to alphanumeric only.

---

## Scripts reference

| Command                          | Purpose                       |
| -------------------------------- | ----------------------------- |
| `bun run setup:supabase`         | Buckets + schema              |
| `bun run setup:supabase --check` | Validate env                  |
| `bun run db:push`                | Schema only (from `apps/web`) |
| `bun run db:studio`              | Drizzle Studio                |
