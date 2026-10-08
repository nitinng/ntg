-- =============================================================================
-- SECURITY H5: ticket_violations was readable, editable and deletable by all
-- =============================================================================
-- 20260723140000_ticket_state_machine_schema.sql defines a carefully scoped
-- read policy ("Users can view own violations": your own tickets, or staff),
-- and then immediately undoes it:
--
--     CREATE POLICY "System and PNC can insert/update violations"
--       ON public.ticket_violations FOR ALL TO authenticated
--       USING (true) WITH CHECK (true);
--
-- Permissive policies are OR'd, so FOR ALL USING (true) grants every command --
-- SELECT included -- to every authenticated user. Verified: an Employee read
-- another user's violation record, rewrote it, and deleted it.
--
-- Policy-compliance records are exactly what a user has motive to erase, so
-- this is both a confidentiality and an integrity problem.
--
-- Fix: scope the management policy to staff. The "Users can view own
-- violations" policy above it is left as-is and now actually governs reads.
--
-- Writes are expected to come from the SECURITY DEFINER transition functions
-- and the service role, neither of which is subject to RLS, so narrowing this
-- to staff does not break the automated path.
-- =============================================================================

DROP POLICY IF EXISTS "System and PNC can insert/update violations" ON public.ticket_violations;

CREATE POLICY "Staff manage violations" ON public.ticket_violations
  FOR ALL
  TO authenticated
  USING (public.get_user_role() IN ('Admin', 'PNC', 'Finance'))
  WITH CHECK (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));

-- Same defect, same migration, same table family: ticket_status_history is the
-- audit trail, and its INSERT policy is WITH CHECK (true) for any authenticated
-- user. An audit trail anyone can write to is not an audit trail -- a user can
-- fabricate transitions that never happened. The comment in the original
-- migration assumes inserts only ever arrive through the transition RPC, but
-- nothing stops a client writing to the table directly over PostgREST.
DROP POLICY IF EXISTS "System and PNC can insert ticket history" ON public.ticket_status_history;

CREATE POLICY "Staff insert ticket history" ON public.ticket_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('Admin', 'PNC', 'Finance'));
