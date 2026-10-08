-- =============================================================================
-- SECURITY H2: any logged-in user could send mail as the organisation
-- =============================================================================
-- email_queue carries recipients TEXT[], cc, bcc, subject and body, and its
-- INSERT policy (20260723140000, re-applied twice since) is:
--
--     CREATE POLICY "System can insert to email queue" ON public.email_queue
--       FOR INSERT TO authenticated WITH CHECK (true);
--
-- The worker sends whatever is in the queue, from travel@navgurukul.org,
-- through the organisation's authenticated SES identity -- so the mail passes
-- SPF, DKIM and DMARC and reads as entirely genuine. Verified: an Employee
-- queued a row addressed to an external address with an arbitrary HTML body,
-- and a second row referencing another user's ticket_id. Nothing validated the
-- recipients against the request being notified.
--
-- Why not simply restrict INSERT to staff: the client queues mail for the
-- employee's own lifecycle events (submission, resubmission, responding to an
-- information request, requesting cancellation) from the browser, as the
-- employee. Locking the table to staff would silently break those mails.
--
-- Fix: keep the insert, constrain what it may say. A BEFORE INSERT trigger
-- filters recipients, cc and bcc against an allow-list derived server-side from
-- the ticket itself -- its requester, its approving manager, the desk and the
-- configured routing addresses. Anything else is dropped. A non-staff insert
-- for someone else's ticket is rejected outright.
--
-- Legitimate values are always inside the allow-list, so no existing mail
-- changes. Injected addresses are removed, and a row left with no permitted
-- recipient is refused rather than sent to nobody.
--
-- SCOPE: this closes the arbitrary-recipient vector -- the phishing relay.
-- The body of a mail about a user's own request is still composed in the
-- browser, so it remains untrusted content; that is why it must be sanitised
-- before any staff screen renders it (see the H3 change). Rendering templates
-- server-side would close that too, and is the larger follow-up.
-- =============================================================================

-- NOTE ON QUOTING
-- Each function body below is delimited by a uniquely named dollar tag rather
-- than an unnamed one. Both are valid SQL and psql accepts either, but the
-- Supabase dashboard's SQL editor splits a pasted script into statements with a
-- splitter that mis-handles unnamed tags: it cuts the body in half and fails
-- with "unterminated dollar-quoted string". Named tags are unambiguous, so one
-- file works in the editor, in psql and through the CLI alike.
--
-- Keep the tags named, and keep the unnamed form out of the comments too -- a
-- splitter that cannot parse it in code is unlikely to skip it in a comment.
-- =============================================================================

-- 1. The addresses a given ticket may legitimately notify ----------------------
-- SECURITY DEFINER so it can read email_routing_settings and profiles, which
-- RLS otherwise limits to staff.

CREATE OR REPLACE FUNCTION public.allowed_email_recipients(p_ticket_id UUID)
RETURNS TEXT[] AS $allowed_email_recipients$
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(e.email))), ARRAY[]::text[])
    FROM (
           -- The requester, and the manager named on the request.
           SELECT tr.requester_email AS email
             FROM public.travel_requests tr
            WHERE tr.id = p_ticket_id
           UNION ALL
           SELECT tr.approving_manager_email
             FROM public.travel_requests tr
            WHERE tr.id = p_ticket_id
           UNION ALL
           -- The requester's manager of record, which the client falls back to
           -- when a request carries no approving manager.
           SELECT p.manager_email
             FROM public.profiles p
             JOIN public.travel_requests tr ON tr.requester_id = p.id
            WHERE tr.id = p_ticket_id
           UNION ALL
           -- The desk: mail about a request always reaches the people who action it.
           SELECT p.email
             FROM public.profiles p
            WHERE p.role IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
           UNION ALL
           -- Configured routing addresses. Settings values are jsonb and may be
           -- a bare string or an array, so normalise to an array first: a
           -- set-returning function cannot sit inside CASE, so the CASE yields
           -- jsonb and the expansion wraps it.
           SELECT jsonb_array_elements_text(
                    CASE jsonb_typeof(s.value)
                      WHEN 'array'  THEN s.value
                      WHEN 'string' THEN jsonb_build_array(s.value)
                      ELSE '[]'::jsonb
                    END
                  )
             FROM public.email_routing_settings s
            WHERE s.key IN ('pnc_queue_email', 'pnc_queue_cc', 'default_cc',
                            'finance_cc', 'escalation_owners', 'support_email')
         ) AS e
   WHERE e.email IS NOT NULL AND btrim(e.email) <> ''
$allowed_email_recipients$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Keep only the addresses that are on the list ------------------------------

CREATE OR REPLACE FUNCTION public.filter_allowed_emails(p_addrs TEXT[], p_allowed TEXT[])
RETURNS TEXT[] AS $filter_allowed_emails$
  SELECT COALESCE(array_agg(a ORDER BY ord), ARRAY[]::text[])
    FROM unnest(COALESCE(p_addrs, ARRAY[]::text[])) WITH ORDINALITY AS t(a, ord)
   WHERE lower(btrim(a)) = ANY (p_allowed)
$filter_allowed_emails$ LANGUAGE sql IMMUTABLE;

-- 3. The guard -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_email_queue_insert()
RETURNS TRIGGER AS $guard_email_queue_insert$
DECLARE
  v_allowed TEXT[];
  v_owner   UUID;
BEGIN
  -- Staff compose mail deliberately; the service role and database triggers run
  -- with auth.uid() NULL. Neither is constrained here.
  IF auth.uid() IS NULL
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  SELECT tr.requester_id INTO v_owner
    FROM public.travel_requests tr WHERE tr.id = NEW.ticket_id;

  IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION
      'Not permitted to queue email for a request you do not own'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_allowed := public.allowed_email_recipients(NEW.ticket_id);

  NEW.recipients := public.filter_allowed_emails(NEW.recipients, v_allowed);
  NEW.cc         := public.filter_allowed_emails(NEW.cc,         v_allowed);
  NEW.bcc        := public.filter_allowed_emails(NEW.bcc,        v_allowed);

  -- Everything was stripped: the insert was addressed somewhere it had no
  -- business going. Refuse rather than queue a mail addressed to nobody.
  IF array_length(NEW.recipients, 1) IS NULL THEN
    RAISE EXCEPTION
      'No permitted recipients for this request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$guard_email_queue_insert$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_email_queue_insert ON public.email_queue;
CREATE TRIGGER trg_guard_email_queue_insert
BEFORE INSERT ON public.email_queue
FOR EACH ROW
EXECUTE FUNCTION public.guard_email_queue_insert();

-- 4. Tighten the policy as well -------------------------------------------------
-- The trigger does the real work, but the policy should not read as though
-- anyone may queue anything. Non-staff may only insert against their own ticket.

DROP POLICY IF EXISTS "System can insert to email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Queue email for own request or as staff" ON public.email_queue;
CREATE POLICY "Queue email for own request or as staff" ON public.email_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
    OR EXISTS (
      SELECT 1 FROM public.travel_requests tr
       WHERE tr.id = email_queue.ticket_id
         AND tr.requester_id = auth.uid()
    )
  );
