-- =============================================================================
-- Create public.settings, which no migration ever created
-- =============================================================================
-- 20260828160000_transactional_email_system.sql:50 inserts the global email CC
-- into public.settings, and the app reads and writes it (utils/emailQueueUtils
-- getGlobalEmailCc, components/PolicyManagement for policy_config), but nothing
-- in this repo creates it. It exists in the live project because it was made by
-- hand in the dashboard; a database built from these migrations has no such
-- table, and the chain stops there.
--
-- ON THE TIMESTAMP: numbered BEFORE the migration that needs it, for the same
-- reason as 20260219145700 -- the chain aborts before any later migration could
-- fix it. The existing migration is untouched.
--
-- SAFE ON THE LIVE DATABASE. The table already exists there with its own
-- policies, and taking RLS into our hands could lock the app out of its own
-- settings. So everything below is guarded on the table being absent: on the
-- live project this migration does nothing at all. It only has to make a fresh
-- rebuild match what production already looks like.
-- =============================================================================

DO $create_settings$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    RAISE NOTICE 'public.settings already exists; leaving it and its policies untouched.';
    RETURN;
  END IF;

  CREATE TABLE public.settings (
    setting_key   TEXT PRIMARY KEY,
    setting_value JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  COMMENT ON TABLE public.settings IS
    'Application settings keyed by name. Holds global_email_cc and policy_config.';

  ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

  -- Reads: any signed-in user. policy_config drives the request form's own
  -- validation, so an employee filling in a request has to be able to read it.
  CREATE POLICY "Authenticated read settings" ON public.settings
    FOR SELECT TO authenticated USING (TRUE);

  -- Writes: the staff who are shown the editors (PolicyManagement is gated on
  -- Admin / PNC Admin), matching the role lists used elsewhere in this schema.
  CREATE POLICY "Staff manage settings" ON public.settings
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('Admin', 'PNC Admin'))
    WITH CHECK (public.get_user_role() IN ('Admin', 'PNC Admin'));
END;
$create_settings$;
