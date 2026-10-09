-- =============================================================================
-- Schedule the auto-close sweep
-- =============================================================================
-- 20261009140000 added scan_auto_close_trips(). It does nothing until something
-- calls it; this schedules it.
--
-- ON THE TIME: 03:00 IST, which is 21:30 UTC the previous day. pg_cron runs on
-- the server clock, which is UTC on Supabase, so '0 3 * * *' would have meant
-- 08:30 IST -- well into the working morning, when the desk is live and a
-- batch of closure mail is least welcome. The point of an overnight sweep is
-- that it lands before anyone is looking.
--
-- To move it, change the expression below and re-run: the job is unscheduled
-- and recreated by name, so this migration is re-runnable and editing it in
-- place is how you change the time.
--
--   03:00 IST  ->  '30 21 * * *'   (21:30 UTC, the night before)
--   02:00 IST  ->  '30 20 * * *'
--   03:00 UTC  ->  '0 3 * * *'
--
-- GUARDED on pg_cron being available. Supabase ships it but it is off until
-- enabled under Database > Extensions. If it is missing this migration says so
-- and does nothing, rather than failing and rolling back everything applied
-- alongside it -- enable the extension and re-run to pick the schedule up.
--
-- The sweep is bounded (200 requests per run) and idempotent, so a missed night
-- is caught up by the next run rather than lost, and a double run sends nothing
-- twice.
-- =============================================================================

DO $schedule_auto_close$
BEGIN
  IF to_regproc('cron.schedule') IS NULL THEN
    RAISE NOTICE 'pg_cron is not enabled, so the auto-close sweep was NOT scheduled. Enable it under Database > Extensions and re-run this migration.';
    RETURN;
  END IF;

  -- Unschedule first so re-running replaces the job rather than duplicating it.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-close-trips') THEN
    PERFORM cron.unschedule('auto-close-trips');
  END IF;

  PERFORM cron.schedule(
    'auto-close-trips',
    '30 21 * * *',
    'SELECT public.scan_auto_close_trips();'
  );

  RAISE NOTICE 'Auto-close sweep scheduled: 21:30 UTC daily (03:00 IST).';
END;
$schedule_auto_close$;
