-- =============================================================================
-- Remove the compatibility index added by 20260828155950
-- =============================================================================
-- It existed only so 20260828160000 could plan its ON CONFLICT (status_trigger)
-- upsert. Leaving it in place would re-impose the very constraint 20260726180000
-- removed -- one published template per stage, regardless of audience -- which
-- the triggers-sheet templates deliberately break (rows 2/12/18 and 23/24/35
-- each publish to several audiences for one stage).
--
-- Unconditional and IF EXISTS, so it is a no-op wherever the index was skipped
-- or never created.
-- =============================================================================

DROP INDEX IF EXISTS public.mail_templates_status_trigger_conflict_target;
