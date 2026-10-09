-- =============================================================================
-- One PNC owner per request
-- =============================================================================
-- Requests in the desk queue had no owner, so two PNC staff could pick up the
-- same booking and neither could tell whether a request had been looked at.
--
-- RLS: no new policy is needed to *set* these. "Admins update all requests"
-- (recreated with 'PNC Admin' in 20261009090000) already governs staff updates
-- to travel_requests, and these are columns on that table.
--
-- What does need saying is the opposite: the requester-update guard from
-- 20261005120000 pins the columns an employee must not rewrite when editing
-- their own request. Ownership is a desk decision, so without pinning, an
-- employee could assign their own request to a PNC member -- or unassign it --
-- through the ordinary edit path. The guard is extended below.
--
-- Claim/reassign history is written to travel_requests.timeline rather than
-- ticket_status_history: that table records *status* transitions (from_status /
-- to_status are NOT NULL in its shape), and a claim changes no status. The
-- timeline is the existing free-form audit trail the UI already renders.
-- =============================================================================

ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS assigned_pnc_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.travel_requests.assigned_pnc_id IS
  'PNC or PNC Admin who owns this request. Claimed on first move into Processing, reassignable by a PNC Admin.';
COMMENT ON COLUMN public.travel_requests.assigned_at IS
  'When the current owner took the request.';

-- Queue views filter on "unassigned", which is a NULL scan over open requests.
CREATE INDEX IF NOT EXISTS travel_requests_assigned_pnc_id_idx
  ON public.travel_requests (assigned_pnc_id);

-- ---------------------------------------------------------------------------
-- Keep ownership out of a requester's hands.
--
-- Recreated in full (CREATE OR REPLACE) rather than patched, since a function
-- body cannot be amended in place. This is 20261009090000's version plus the
-- two ownership columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_requester_request_update()
RETURNS TRIGGER AS $guard_requester_request_update$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.requester_id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  NEW.id              := OLD.id;
  NEW.submission_id   := OLD.submission_id;
  NEW.requester_id    := OLD.requester_id;
  NEW.created_at      := OLD.created_at;

  NEW.approval_status := OLD.approval_status;

  NEW.ticket_cost     := OLD.ticket_cost;
  NEW.invoice_url     := OLD.invoice_url;
  NEW.vendor_name     := OLD.vendor_name;
  NEW.booking_status  := OLD.booking_status;
  NEW.payment_source  := OLD.payment_source;
  NEW.advance_id      := OLD.advance_id;
  NEW.split_tickets   := OLD.split_tickets;
  NEW.booked_by       := OLD.booked_by;

  -- Desk ownership: assignable only by staff.
  NEW.assigned_pnc_id := OLD.assigned_pnc_id;
  NEW.assigned_at     := OLD.assigned_at;

  RETURN NEW;
END;
$guard_requester_request_update$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_requester_request_update ON public.travel_requests;
CREATE TRIGGER trg_guard_requester_request_update
BEFORE UPDATE ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_requester_request_update();
