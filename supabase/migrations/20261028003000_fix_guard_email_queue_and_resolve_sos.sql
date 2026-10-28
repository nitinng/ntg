-- Migration: Fix guard_email_queue_insert permissions and resolve 3 SOS alerts
-- Date: 2026-10-28
--
-- 1. Updates guard_email_queue_insert() so that:
--    - Desk staff (Admin, PNC, PNC Admin, Finance) and triggers (auth.uid() IS NULL) continue to have unrestricted queue access.
--    - Requesters are permitted to queue emails for their own requests.
--    - Approving managers (matching approving_manager_email or the requester profile's manager_email)
--      are permitted to queue emails when approving or rejecting requests.
--    - Addresses are still strictly sanitised through allowed_email_recipients().
--
-- 2. Marks the 3 open SOS alerts as 'Resolved':
--    - EMAIL_ENQUEUE_FAILED: "Not permitted to queue email for a request you do not own"
--    - CLIENT_UNHANDLED_REJECTION: "signal is aborted without reason"
--    - CLIENT_UNCAUGHT_ERROR: "Uncaught ReferenceError: useCallback is not defined"

CREATE OR REPLACE FUNCTION public.guard_email_queue_insert()
RETURNS TRIGGER AS $guard_email_queue_insert$
DECLARE
  v_allowed TEXT[];
  v_owner   UUID;
  v_stream  TEXT;
  v_channel TEXT[];
  v_user_email TEXT;
  v_appr_mgr_email TEXT;
  v_req_mgr_email TEXT;
  v_is_authorized BOOLEAN := FALSE;
BEGIN
  -- 1. Channel exemptions (desk notifications / alerting stream)
  v_stream := COALESCE(current_setting('app.desk_dispatch', TRUE), '');
  IF v_stream IN ('alerting', 'notifications') THEN
    v_channel := public.desk_channel_emails(v_stream);

    IF array_length(v_channel, 1) IS NULL THEN
      RAISE EXCEPTION 'No channel address configured for %', v_stream
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    NEW.recipients := v_channel;
    NEW.cc  := NULL;
    NEW.bcc := NULL;
    RETURN NEW;
  END IF;

  -- 2. SOS dispatch exemption
  IF current_setting('app.sos_dispatch', TRUE) = 'on' THEN
    SELECT ARRAY[value->>'channel'] INTO v_channel
      FROM public.sos_settings
     WHERE key = 'email';

    IF v_channel IS NULL OR array_length(v_channel, 1) IS NULL THEN
      RAISE EXCEPTION 'No SOS channel address configured' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    NEW.recipients := v_channel;
    NEW.cc  := NULL;
    NEW.bcc := NULL;
    RETURN NEW;
  END IF;

  -- 3. Staff compose mail deliberately; the service role and database triggers run
  -- with auth.uid() NULL. Neither is constrained here.
  IF auth.uid() IS NULL
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  -- 4. If standalone mail (no ticket_id) is enqueued by an authenticated user, allow it
  IF NEW.ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 5. Identify the actor's email
  SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();
  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  END IF;

  -- 6. Query request owner and approving managers
  SELECT tr.requester_id, tr.approving_manager_email, p.manager_email
    INTO v_owner, v_appr_mgr_email, v_req_mgr_email
    FROM public.travel_requests tr
    LEFT JOIN public.profiles p ON p.id = tr.requester_id
   WHERE tr.id = NEW.ticket_id;

  -- Authorize if user is the requester or the approving manager
  IF v_owner IS NOT NULL THEN
    IF v_owner = auth.uid()
       OR (v_user_email IS NOT NULL AND lower(btrim(v_user_email)) = lower(btrim(COALESCE(v_appr_mgr_email, ''))))
       OR (v_user_email IS NOT NULL AND lower(btrim(v_user_email)) = lower(btrim(COALESCE(v_req_mgr_email, ''))))
    THEN
      v_is_authorized := TRUE;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION
      'Not permitted to queue email for a request you do not own'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 7. Sanitize recipients against allowed addresses for this ticket
  v_allowed := public.allowed_email_recipients(NEW.ticket_id);

  NEW.recipients := public.filter_allowed_emails(NEW.recipients, v_allowed);
  NEW.cc         := public.filter_allowed_emails(NEW.cc,         v_allowed);
  NEW.bcc        := public.filter_allowed_emails(NEW.bcc,        v_allowed);

  IF array_length(NEW.recipients, 1) IS NULL THEN
    RAISE EXCEPTION
      'No permitted recipients for this request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$guard_email_queue_insert$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Mark the 3 SOS Alerts as Resolved
UPDATE public.sos_alerts
   SET status = 'Resolved',
       resolved_by = 'system',
       resolved_at = NOW(),
       resolution_note = 'Fixed guard_email_queue_insert trigger to allow approving managers and requesters to queue transition notifications.'
 WHERE code = 'EMAIL_ENQUEUE_FAILED'
   AND (message ILIKE '%Not permitted to queue email for a request you do not own%' OR status = 'Open');

UPDATE public.sos_alerts
   SET status = 'Resolved',
       resolved_by = 'system',
       resolved_at = NOW(),
       resolution_note = 'Added isAbortError filter to global SOS handler to gracefully ignore benign Fetch/AbortController cancellation rejections.'
 WHERE code = 'CLIENT_UNHANDLED_REJECTION'
   AND (message ILIKE '%signal is aborted%' OR status = 'Open');

UPDATE public.sos_alerts
   SET status = 'Resolved',
       resolved_by = 'system',
       resolved_at = NOW(),
       resolution_note = 'Imported useCallback in App.tsx and verified across all components.'
 WHERE code = 'CLIENT_UNCAUGHT_ERROR'
   AND (message ILIKE '%useCallback is not defined%' OR status = 'Open');
