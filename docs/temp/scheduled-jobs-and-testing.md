# Scheduled jobs (Supabase pg_cron)

KameOps runs due automations and payment reminders via **`GET /api/cron/dispatch`**. Production uses **Supabase `pg_cron` + `pg_net`** **once daily** (`0 4 * * *` UTC = 12:00 PM Asia/Manila), matching **`apps/web/vercel.json`**. Overdue jobs still run on the next tick when `next_run_at` is in the past.

> **Cost note:** Do **not** schedule `* * * * *`. An every-minute ping wakes a Vercel Fluid function ~1,440×/day and drives most of the project's Active CPU / provisioned memory even with no users.

## What the dispatcher does

Once daily (pg_cron and/or Vercel), the cron job HTTP-calls your deployed app. The handler:

1. Verifies `Authorization: Bearer <CRON_SECRET>`
2. Runs `automationService.dispatchDueJobs()` — evaluates each active `automation_jobs` row against the user's timezone schedule (daily / weekly / monthly + time)
3. **Overdue catch-up:** if `next_run_at` is in the past and the job has not run since that due time, it runs immediately (not only at the exact scheduled minute)
4. Runs `send_due_reminders` when due; respects per-card **reminder interval** via `reminder_logs` (sub-daily intervals need a more frequent cron — not enabled by default)

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
select vault.create_secret('https://kame-ops.vercel.app', 'kame_ops_app_url');
select vault.create_secret('<CRON_SECRET from Vercel>', 'kame_ops_cron_secret');
```

To rotate: delete old vault rows and create new ones, then re-run sync (step 3).

### 3. Install the sync function and schedule

Run the full script:

`apps/web/supabase/snippets/automation-dispatch-cron.sql`

Or, if the function already exists (after deploying the updated snippet):

```sql
select public.sync_kame_ops_automation_dispatch_cron_job();
```

Expected: `{"ok": true, "job": "kame-ops-automation-dispatch", "cronExpr": "0 4 * * *"}`

### 4. Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'kame-ops-automation-dispatch';
```

Expect `schedule = '0 4 * * *'`. After the next noon Manila tick, check **Vercel → Logs** or run an automation manually and confirm `automation_runs` updates.

## Fix: stop every-minute Vercel usage (run in Supabase SQL Editor)

If the live job is still `* * * * *`, apply this now:

```sql
-- 1) Stop the expensive minute ticker immediately
select cron.unschedule('kame-ops-automation-dispatch');

-- 2) Re-install the sync function from apps/web/supabase/snippets/automation-dispatch-cron.sql
--    (paste the full file contents, or at least CREATE OR REPLACE FUNCTION …)

-- 3) Schedule once daily
select public.sync_kame_ops_automation_dispatch_cron_job();

-- 4) Confirm
select jobid, jobname, schedule, active
from cron.job
where jobname = 'kame-ops-automation-dispatch';
```

**Optional — rely on Vercel only:** if Vault secrets / pg_cron are unused, leave the job unscheduled after step 1. `vercel.json` already hits `/api/cron/dispatch` at `0 4 * * *` UTC.

## Local / manual testing

No local pg_cron by default. Trigger dispatch manually:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3005/api/cron/dispatch"
```

Production:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://kame-ops.vercel.app/api/cron/dispatch"
```

## Troubleshooting

| Symptom                             | Check                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| High Vercel Fluid CPU / invocations | Confirm `cron.job` is **not** `* * * * *`; expect `0 4 * * *` or unscheduled                      |
| Deploy blocked on Vercel Hobby      | `vercel.json` allows **one** daily cron (`0 4 * * *`); that is enough for once-daily dispatch     |
| Jobs stuck with "Next run" overdue  | Confirm daily cron is active; run dispatch manually to verify; overdue catch-up runs on next tick |
| `401 Unauthorized` from dispatch    | `kame_ops_cron_secret` in Vault must match Vercel `CRON_SECRET`                                   |
| Jobs never run at scheduled time    | Daily cron fires at 04:00 UTC; user schedule is timezone-aware (`users.timezone`)                 |
| `sync_…` returns missing Vault      | Create both `kame_ops_app_url` and `kame_ops_cron_secret` first                                   |
| Need sub-daily reminder intervals   | Temporarily raise pg_cron (e.g. `0 * * * *` hourly) — avoid `* * * * *`                           |

## Incident: 2026-08 runaway retry storm (root cause of "automations not working")

**Symptom:** SOA check / reminders appeared broken for some accounts despite the Reminders page showing "Active" schedules.

**Root cause (two compounding bugs, confirmed via live DB inspection):**

1. The deployed `public.sync_kame_ops_automation_dispatch_cron_job()` function had drifted to `cron_expr := '* * * * *'` (every minute) instead of the documented `'0 4 * * *'` — likely left over from ad-hoc debugging and never reverted. `cron.job` showed the job firing every minute for weeks; every `net.http_get` call also **timed out** at pg_net's default 5000ms budget (visible via `net._http_response.timed_out`), since dispatching all users' jobs from one request routinely took longer than that.
2. `automationService.dispatchDueJobs()` never advanced `automation_jobs.next_run_at` when `executeJob()` threw (e.g. Google `invalid_grant` / reconnect required). Combined with bug 1, any account whose Google refresh token died got its `run_soa_pipeline` job retried **every single minute, forever**, hammering the Google token endpoint and generating 100k+ garbage rows in `automation_runs` for 3+ weeks with zero user-visible alert (the only reconnect prompt is `GoogleReconnectMonitor`, which only polls while a browser tab is open).

**Fix applied:**

- Redeployed the correct `'0 4 * * *'` cron function and re-ran `sync_kame_ops_automation_dispatch_cron_job()` (verified `cron.job.schedule = '0 4 * * *'`).
- `automation.service.ts#dispatchDueJobs` now **always advances `next_run_at`** to the next scheduled slot on failure (via `computeNextRunAt`), so a permanently-failing job backs off to once-per-schedule instead of retrying on every dispatch tick.
- Cron-triggered failures that match `isGoogleReconnectRequiredMessage` now send a best-effort Telegram/Slack ping (`notifyReconnectRequired`) so the user finds out without opening the app.
- Cleaned up `automation_runs` (kept latest 20 failed rows per job; deleted ~107k retry-storm rows).

**Suspected upstream trigger:** Google refresh tokens were dying (`invalid_grant`) every 1–4 weeks across multiple linked accounts — the classic signature of a Google Cloud OAuth **consent screen still in "Testing" publishing status** (test-user refresh tokens auto-expire after 7 days). Verify in Google Cloud Console → APIs & Services → OAuth consent screen and move to "In production" if confirmed; `gmail.readonly`/`calendar.events` are sensitive scopes so Google will show an "unverified app" warning during consent until formally verified, which is expected for a personal-use app.

**Prevention:** periodically re-run the verification query below; if `schedule <> '0 4 * * *'`, something modified the live function directly instead of going through the versioned snippet.

```sql
select jobid, schedule, active from cron.job where jobname = 'kame-ops-automation-dispatch';
```

## Related

- `docs/temp/production-checklist.md` — Vercel env vars including `CRON_SECRET`
- `apps/web/src/app/api/cron/dispatch/route.ts` — HTTP handler (unchanged)
- `apps/web/src/server/services/automation.service.ts` — `dispatchDueJobs` failure backoff + reconnect notification
