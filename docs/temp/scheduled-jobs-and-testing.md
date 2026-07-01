# Scheduled jobs (Supabase pg_cron)

KameOps runs due automations and payment reminders via **`GET /api/cron/dispatch`**. On **Vercel Hobby**, that route is **not** scheduled in `vercel.json` (sub-daily Vercel Cron requires Pro). Production uses **Supabase `pg_cron` + `pg_net`** instead.

## What the dispatcher does

Every minute, the cron job HTTP-calls your deployed app. The handler:

1. Verifies `Authorization: Bearer <CRON_SECRET>`
2. Runs `automationService.dispatchDueJobs()` — evaluates each active `automation_jobs` row against the user's timezone schedule (daily / weekly / monthly + time)
3. Runs `send_due_reminders` when due; respects per-card **reminder interval** (hourly, every 2h, etc.) via `reminder_logs`

Manual **Run now** in the Automations UI still works without pg_cron.

## Production setup (Supabase Cloud)

### 1. Enable extensions

**Database → Extensions** (or SQL Editor):

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
```

### 2. Store secrets in Vault

Use the same values as Vercel env vars. No trailing slash on the app URL.

```sql
select vault.create_secret('https://kame-ops-web.vercel.app', 'kame_ops_app_url');
select vault.create_secret('<CRON_SECRET from Vercel>', 'kame_ops_cron_secret');
```

To rotate: delete old vault rows and create new ones, then re-run sync (step 3).

### 3. Install the sync function and schedule

Run the full script:

`apps/web/supabase/snippets/automation-dispatch-cron.sql`

Or, if the function already exists:

```sql
select public.sync_kame_ops_automation_dispatch_cron_job();
```

Expected: `{"ok": true, "job": "kame-ops-automation-dispatch", "cronExpr": "* * * * *"}`

### 4. Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'kame-ops-automation-dispatch';
```

After ~1 minute, check **Vercel → Logs** or run an automation at the current minute and confirm `automation_runs` updates.

## Local / manual testing

No local pg_cron by default. Trigger dispatch manually:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3005/api/cron/dispatch"
```

Production:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://kame-ops-web.vercel.app/api/cron/dispatch"
```

## Troubleshooting

| Symptom                          | Check                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Deploy blocked on Vercel Hobby   | Ensure `crons` is **removed** from `apps/web/vercel.json`                            |
| `401 Unauthorized` from dispatch | `kame_ops_cron_secret` in Vault must match Vercel `CRON_SECRET`                      |
| Jobs never run at scheduled time | pg_cron must fire every minute; user schedule is timezone-aware (`users.timezone`)   |
| `sync_…` returns missing Vault   | Create both `kame_ops_app_url` and `kame_ops_cron_secret` first                      |
| Reminders only once per day      | Confirm minute cron is active; card interval &lt; 1440 needs frequent dispatch ticks |

## Related

- `docs/temp/production-checklist.md` — Vercel env vars including `CRON_SECRET`
- `apps/web/src/app/api/cron/dispatch/route.ts` — HTTP handler (unchanged)
