-- =============================================================================
-- A narrow status timeline for the employee's own request
-- =============================================================================
-- The employee ticket view shows no history, so a traveller cannot see where
-- their request has been -- only where it is now.
--
-- A NOTE ON THE BRIEF, which said 20261008100100 scoped ticket_status_history
-- to staff and asked that the table not be reopened:
--
--   That migration replaced the INSERT policy only (it was WITH CHECK (true),
--   so any authenticated user could forge audit rows). It did not touch SELECT.
--   The live read policy is still "Users can view own ticket history" from
--   20260723140000, which already lets the requester AND their approving
--   manager read their own ticket's history -- every column, including
--   `notes` and the actor.
--
--   So the employee read path was never closed, and is in fact wider than the
--   from/to/timestamp this feature needs. Narrowing that policy would be a
--   broader RLS change than this work is scoped to, so it is left alone and
--   flagged for a separate decision.
--
-- What this adds is the narrow projection the UI should use regardless: from
-- status, to status and timestamp, for the caller's own requests only. No
-- actor, no notes. Written as SECURITY DEFINER rather than a view because the
-- ownership check then lives inside the function, where it cannot be widened
-- by a later policy edit on the underlying table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_ticket_status_history(p_ticket_id UUID)
RETURNS TABLE (
  from_status TEXT,
  to_status   TEXT,
  changed_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $get_my_ticket_status_history$
  SELECT h.from_status, h.to_status, h.created_at
    FROM public.ticket_status_history h
   WHERE h.ticket_id = p_ticket_id
     -- Ownership is checked here, not by RLS: SECURITY DEFINER bypasses RLS,
     -- so this predicate is the whole access control for this function.
     -- auth.uid() is NULL for the service role, which must not match a row.
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.travel_requests r
        WHERE r.id = h.ticket_id
          AND r.requester_id = auth.uid()
     )
   ORDER BY h.created_at ASC;
$get_my_ticket_status_history$;

REVOKE ALL ON FUNCTION public.get_my_ticket_status_history(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_ticket_status_history(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_my_ticket_status_history(UUID) IS
  'Status timeline (from, to, when) for a request the caller owns. No actor or notes. Returns nothing for anyone else''s request.';
