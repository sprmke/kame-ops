-- KameOps automation dispatcher: pg_cron + pg_net → GET /api/cron/dispatch
--
-- Vercel Hobby cannot run sub-daily crons in vercel.json. Schedule this in Supabase instead.
--
-- One-time Vault secrets (Supabase Dashboard → SQL Editor):
--
--   SELECT vault.create_secret('https://kame-ops.vercel.app', 'kame_ops_app_url');
--   SELECT vault.create_secret('<same value as CRON_SECRET in Vercel>', 'kame_ops_cron_secret');
--
-- Then run the sync at the bottom of this file (or: SELECT public.sync_kame_ops_automation_dispatch_cron_job();)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.sync_kame_ops_automation_dispatch_cron_job()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, cron, vault, pg_temp
AS $fn$
DECLARE
  r RECORD;
  cron_expr text := '* * * * *';
  v_cmd_body text := $BODY$
SELECT net.http_get(
  url := rtrim(
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kame_ops_app_url'),
    '/'
  ) || '/api/cron/dispatch',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kame_ops_cron_secret')
  )
);
$BODY$;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'kame_ops_app_url'
  ) OR NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'kame_ops_cron_secret'
  ) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error',
      'Missing Vault secrets kame_ops_app_url and/or kame_ops_cron_secret. See apps/web/supabase/snippets/automation-dispatch-cron.sql'
    );
  END IF;

  FOR r IN
    SELECT jobname FROM cron.job
    WHERE jobname = 'kame-ops-automation-dispatch'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  PERFORM cron.schedule('kame-ops-automation-dispatch', cron_expr, v_cmd_body);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'job', 'kame-ops-automation-dispatch',
    'cronExpr', cron_expr
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', 'sync_kame_ops_automation_dispatch_cron_job failed: ' || sqlerrm
    );
END;
$fn$;

COMMENT ON FUNCTION public.sync_kame_ops_automation_dispatch_cron_job() IS
  'Schedules kame-ops-automation-dispatch (every minute UTC) calling GET /api/cron/dispatch with CRON_SECRET from Vault.';

-- Apply after Vault secrets exist:
-- SELECT public.sync_kame_ops_automation_dispatch_cron_job();
