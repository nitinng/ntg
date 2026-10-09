-- =============================================================================
-- Close a trip automatically once the travel date has passed
-- =============================================================================
-- Decided after Phase 4: "Closed" is reached automatically when the travel date
-- passes, rather than by PNC after reconciliation.
--
-- This runs in SQL, as the reminder scan does (20260927130000), for the same
-- reason: it has to work with no browser open. It reuses that migration's
-- queue_reminder_email / render_reminder_template helpers rather than
-- duplicating them, and the existing process-email-queue worker delivers.
--
-- WHAT IS AND IS NOT CLOSED
--
-- Only 'Booked' and 'Booked / Partially Cancelled' are swept. Those are the two
-- stages that mean a trip actually happened, and they are exactly the two the
-- TRIP_COMPLETED trigger is gated on client-side (deriveEventFromTransition),
-- so the automatic path and the manual path raise the same mail on the same
-- transitions. Cancellation and refund tails are deliberately left alone: they
-- close through reconciliation, and a cancelled trip must never be sent "hope
-- it went well, submit your expenses".
--
-- A request still in 'Pending Refund' or 'Disputed' when its travel date passes
-- is also left alone -- money is still moving and closing it would strand that.
--
-- WHICH DATE
--
-- The later of return_date and date_of_travel, so a return leg is not closed
-- while the traveller is still out. Plus a grace period (default 1 day,
-- settable as auto_close_grace_days in email_routing_settings) because
-- date_of_travel is a DATE with no timezone: closing at UTC midnight would fire
-- while it is still the travel evening in IST.
-- =============================================================================

INSERT INTO public.email_routing_settings (key, value, label, description, value_type, "group", sort_order)
VALUES (
  'auto_close_grace_days',
  '1'::jsonb,
  'Auto-close grace days',
  'Days after the last travel date before a booked trip is closed automatically. 0 closes the morning after travel.',
  'number',
  'routing',
  20
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.scan_auto_close_trips()
RETURNS TABLE (ticket_id UUID, submission_id TEXT, closed_from TEXT, mail_queued BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $scan_auto_close_trips$
DECLARE
  req         public.travel_requests%ROWTYPE;
  grace_days  INTEGER;
  closed_at   TIMESTAMPTZ := now();
  queued      BOOLEAN;
  prior       TEXT;
BEGIN
  grace_days := GREATEST(0, COALESCE(public.email_setting_number('auto_close_grace_days', 1), 1)::INTEGER);

  FOR req IN
    SELECT *
      FROM public.travel_requests
     WHERE pnc_status IN ('Booked', 'Booked / Partially Cancelled')
       AND COALESCE(return_date, date_of_travel) IS NOT NULL
       AND COALESCE(return_date, date_of_travel) < (CURRENT_DATE - grace_days)
     ORDER BY COALESCE(return_date, date_of_travel)
     -- Bounded so one long-neglected backlog cannot produce a thousand mails in
     -- a single run; the next run picks up where this one left off.
     LIMIT 200
  LOOP
    prior := req.pnc_status;

    UPDATE public.travel_requests
       SET pnc_status = 'Closed',
           status_change_reason = 'Closed automatically: travel date passed',
           timeline = COALESCE(timeline, '[]'::jsonb) || jsonb_build_object(
             'id',        extract(epoch FROM closed_at)::TEXT || '-autoclose',
             'timestamp', to_char(closed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
             'actor',     'System',
             'event',     'Status changed to: Closed',
             'details',   'Closed automatically because the travel date has passed.'
           ),
           updated_at = closed_at
     WHERE id = req.id;

    -- The audit trail the employee timeline reads.
    INSERT INTO public.ticket_status_history (ticket_id, from_status, to_status, actor_role, reason)
    VALUES (req.id, prior, 'Closed', 'System', 'Travel date passed');

    -- Reflect the new stage before rendering, so {{current_status}} is right.
    req.pnc_status := 'Closed';

    -- Dedup key is the ticket's own close time, so a retried scan cannot
    -- double-send and a reopened-then-reclosed request can legitimately re-send.
    queued := public.queue_reminder_email(req, 'TRIP_COMPLETED', 'employee', closed_at, 0);

    ticket_id   := req.id;
    submission_id := req.submission_id;
    closed_from := prior;
    mail_queued := queued;
    RETURN NEXT;
  END LOOP;
END;
$scan_auto_close_trips$;

REVOKE ALL ON FUNCTION public.scan_auto_close_trips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_auto_close_trips() TO service_role;

COMMENT ON FUNCTION public.scan_auto_close_trips() IS
  'Closes booked trips whose travel date has passed and queues the trip-completed mail. Call on a schedule (daily). Service role only.';
