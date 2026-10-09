-- =============================================================================
-- Stop exposing the desk's working notes to the traveller
-- =============================================================================
-- "Users can view own ticket history" (20260723140000) lets the requester and
-- their approving manager SELECT their own ticket's history -- every column,
-- including actor_id, actor_role and reason. `reason` is where the desk records
-- why it did something ("duplicate of TRV-9910", "traveller unreachable",
-- "manager overruled"), written for colleagues rather than for the traveller.
--
-- 20261009120000 added get_my_ticket_status_history, which returns only
-- from/to/when, and the employee timeline reads through it. This removes the
-- broad path so that narrow function is the only way an employee reaches this
-- table -- otherwise the restriction is cosmetic and anyone can query the rest
-- over PostgREST.
--
-- WHAT THIS BREAKS IF DONE ALONE, AND WHY IT DOES NOT
--
-- utils/emailTriggers.ts deriveResubmissionContext queries this table FROM THE
-- EMPLOYEE'S BROWSER to tell a first submission from a resubmission after a
-- manager rejection and one after a PNC rejection -- three sheet rows that share
-- an (event, audience) pair and differ only by that history. Narrowing the
-- policy without replacing that read would not error loudly: the query returns
-- no rows, the context resolves to undefined, and every resubmission silently
-- gets first-submission copy. So the function below replaces it, and the
-- client is moved onto it in the same change.
--
-- The manager loses their direct read too. No screen used it: the manager's
-- view renders travel_requests.timeline, not this table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The one fact the trigger layer needs, without the notes around it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_last_rejection_status(p_ticket_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $get_my_last_rejection_status$
  SELECT h.to_status
    FROM public.ticket_status_history h
   WHERE h.ticket_id = p_ticket_id
     AND h.to_status IN ('Rejected by Manager', 'Rejected by PNC')
     -- SECURITY DEFINER bypasses RLS, so this predicate is the access control.
     -- auth.uid() is NULL for the service role and must not match a row.
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.travel_requests r
        WHERE r.id = h.ticket_id
          AND r.requester_id = auth.uid()
     )
   ORDER BY h.created_at DESC
   LIMIT 1;
$get_my_last_rejection_status$;

REVOKE ALL ON FUNCTION public.get_my_last_rejection_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_last_rejection_status(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_my_last_rejection_status(UUID) IS
  'Last rejection stage for a request the caller owns, or NULL. Used to pick resubmission email copy. No notes or actor.';

-- ---------------------------------------------------------------------------
-- Staff only. Employees reach their own history through the two narrow
-- functions above; nobody else reaches it at all.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own ticket history" ON public.ticket_status_history;

DROP POLICY IF EXISTS "Staff view ticket history" ON public.ticket_status_history;
CREATE POLICY "Staff view ticket history" ON public.ticket_status_history
FOR SELECT
TO authenticated
USING (public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance'));
