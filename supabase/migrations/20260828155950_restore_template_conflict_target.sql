-- =============================================================================
-- Restore the conflict target 20260828160000 was written against
-- =============================================================================
-- THE DEFECT
--
-- 20260726180000 widened the published-template index:
--     DROP   mail_templates_published_unique ON (status_trigger)
--     CREATE mail_templates_published_unique ON (status_trigger, audience)
-- so that one published template per stage *per audience* became legal.
--
-- 20260828160000, written a month later, still upserts with
--     ON CONFLICT (status_trigger) WHERE is_draft = FALSE
-- which needs the single-column index that no longer exists. Postgres resolves
-- a conflict target at plan time, so the statement fails even on a fresh
-- database where no row could actually conflict. That single error is what
-- stops the chain and cascades into fourteen further failures -- it is the real
-- blocker behind "the migrations cannot rebuild a database", not the missing
-- settings table, which merely fails first.
--
-- THE FIX, AND WHY IT IS SHAPED THIS WAY
--
-- The existing migration is not edited. ON CONFLICT infers its arc from the
-- *shape* of an index, not its name, so a separate single-column index with the
-- same predicate satisfies it. This migration adds that index just before
-- 20260828160000 runs; 20260828160050 drops it immediately after. Net effect on
-- any database: nothing. Between the two, 20260828160000 can plan its upsert.
--
-- Verified: at this point in the chain there are six non-draft templates and no
-- duplicate status_trigger among them, so the index builds.
--
-- GUARDED. If a database ever does hold two published templates sharing a
-- status_trigger, the index cannot be built -- and silently failing here would
-- be better than aborting a migration run over a compatibility shim. The DO
-- block skips in that case and says so; 20260828160000 would then fail on its
-- own merits, which is the pre-existing behaviour and no worse.
-- =============================================================================

DO $restore_conflict_target$
DECLARE
  duplicates INTEGER;
BEGIN
  IF to_regclass('public.mail_templates') IS NULL THEN
    RAISE NOTICE 'mail_templates does not exist yet; nothing to do.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO duplicates
    FROM (
      SELECT status_trigger
        FROM public.mail_templates
       WHERE is_draft = FALSE AND status_trigger IS NOT NULL
       GROUP BY status_trigger
      HAVING COUNT(*) > 1
    ) d;

  IF duplicates > 0 THEN
    RAISE NOTICE 'Skipping compatibility index: % status_trigger value(s) are published for more than one audience.', duplicates;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS mail_templates_status_trigger_conflict_target
    ON public.mail_templates (status_trigger)
    WHERE is_draft = FALSE;
END;
$restore_conflict_target$;
