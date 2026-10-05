-- Migration: Allow requesters to update their own travel requests (scoped)
--
-- Bug: submitting a new travel request as an Employee failed with
--      "Cannot coerce the result to a single JSON object" (PostgREST PGRST116).
--
-- Cause: travel_requests had SELECT + INSERT policies for requesters, but the
--        only UPDATE policy was "Admins update all requests" (Admin/PNC/Finance).
--        The submit flow inserts the row and then immediately updates it to
--        auto-advance pnc_status Not Started -> Processing / Approval Pending.
--        For an Employee that UPDATE matched zero rows under RLS, so the
--        chained .select().single() got an empty result and raised PGRST116.
--        Net effect: the row was created but stranded in "Not Started", while
--        the UI reported the submission as failed.
--
-- Fix: add a requester UPDATE policy, scoped three ways so it does not become a
--      blanket write grant:
--        1. USING    - own rows only, and not in a terminal state.
--        2. WITH CHECK - pnc_status may only move to a requester-reachable state.
--        3. a BEFORE UPDATE trigger that pins privileged columns to their old
--           values for requester-driven updates.

-- 1. Requester UPDATE policy -------------------------------------------------

DROP POLICY IF EXISTS "Employees update own requests" ON public.travel_requests;
CREATE POLICY "Employees update own requests" ON public.travel_requests
  FOR UPDATE
  USING (
    auth.uid() = requester_id
    -- Terminal states: the employee UI exposes no actions here, so block writes.
    AND COALESCE(pnc_status, '') NOT IN (
      'Cancelled by Employee',
      'Cancelled by PNC',
      'Cancelled by System',
      'Cancellation Requested',
      'Closed',
      'Closed / Recorded - (self-booked)',
      'Reconciled',
      'Written Off'
    )
  )
  WITH CHECK (
    auth.uid() = requester_id
    -- Only the transitions the employee flows actually perform:
    --   submit / resubmit  -> Not Started -> Processing | Approval Pending
    --   respond to On Hold -> Processing
    --   request cancel     -> Cancellation Requested
    AND COALESCE(pnc_status, '') IN (
      'Not Started',
      'Processing',
      'Approval Pending',
      'Cancellation Requested'
    )
  );

-- 2. Column guard for requester-driven updates -------------------------------
-- RequestDetailOverlay's employee "respond to info request" flow reuses the
-- shared onUpdate handler, which round-trips booking/finance columns it did not
-- intend to change (and coerces some to NULL on the way). So rather than
-- rejecting the statement, pin those columns back to their stored values. A
-- requester therefore cannot alter them at all, and no existing flow breaks.
--
-- Skipped for Admin/PNC/Finance, and for the service role / database triggers
-- and cron jobs, where auth.uid() is NULL.

CREATE OR REPLACE FUNCTION public.guard_requester_request_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.requester_id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  -- Identity / ownership: never rewritable.
  NEW.id              := OLD.id;
  NEW.submission_id   := OLD.submission_id;
  NEW.requester_id    := OLD.requester_id;
  NEW.created_at      := OLD.created_at;

  -- Approval outcome: a requester must not approve their own request.
  NEW.approval_status := OLD.approval_status;

  -- Booking + finance: owned by the PNC / Finance desk.
  NEW.ticket_cost     := OLD.ticket_cost;
  NEW.invoice_url     := OLD.invoice_url;
  NEW.vendor_name     := OLD.vendor_name;
  NEW.booking_status  := OLD.booking_status;
  NEW.payment_source  := OLD.payment_source;
  NEW.advance_id      := OLD.advance_id;
  NEW.split_tickets   := OLD.split_tickets;
  NEW.booked_by       := OLD.booked_by;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_requester_request_update ON public.travel_requests;
CREATE TRIGGER trg_guard_requester_request_update
BEFORE UPDATE ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_requester_request_update();
