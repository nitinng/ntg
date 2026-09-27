-- ============================================================================
-- Time-based reminder, escalation and closure scan
--
-- Sheet rows 26, 26b, 27 and 28 fire on elapsed time rather than on a user action,
-- so nothing in the app can raise them - the request simply sits on hold and the
-- mail is never sent. This adds a server-side scan that the scheduler calls.
--
-- The scan runs in SQL rather than in the edge function so that it works with no
-- browser open and no extra deploy target. It renders only the eight variables
-- those four templates actually use; every other mail is rendered client-side by
-- resolveTemplateVariables as before.
--
-- Delivery is unchanged: the scan queues into email_queue and the existing
-- process-email-queue worker sends.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Settings helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.email_setting_number(p_key TEXT, p_default NUMERIC)
RETURNS NUMERIC
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::NUMERIC FROM public.email_routing_settings WHERE key = p_key),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.email_setting_list(p_key TEXT)
RETURNS TEXT[]
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(value))
       FROM public.email_routing_settings
      WHERE key = p_key AND jsonb_typeof(value) = 'array'),
    ARRAY[]::TEXT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.email_setting_text(p_key TEXT, p_default TEXT)
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.email_routing_settings WHERE key = p_key),
    p_default
  );
$$;


-- ---------------------------------------------------------------------------
-- Renderer
-- ---------------------------------------------------------------------------

-- Renders the variables used by the four time-based templates. Deliberately narrow:
-- the full thirty-variable set lives in resolveTemplateVariables, and duplicating it
-- here would create two renderers to keep in step.
CREATE OR REPLACE FUNCTION public.render_reminder_template(
  p_content        TEXT,
  p_request        public.travel_requests,
  p_days_on_hold   INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  out TEXT := COALESCE(p_content, '');
BEGIN
  out := replace(out, '{{submissionId}}',           COALESCE(p_request.submission_id, p_request.id::TEXT));
  out := replace(out, '{{request_id}}',             COALESCE(p_request.submission_id, p_request.id::TEXT));
  out := replace(out, '{{requester_name}}',         COALESCE(p_request.requester_name, 'Employee'));
  out := replace(out, '{{requesterName}}',          COALESCE(p_request.requester_name, 'Employee'));
  out := replace(out, '{{requester_email}}',        COALESCE(p_request.requester_email, ''));
  out := replace(out, '{{manager_name}}',           COALESCE(p_request.approving_manager_name, 'Approving Manager'));
  out := replace(out, '{{origin}}',                 COALESCE(p_request.from_location, ''));
  out := replace(out, '{{destination}}',            COALESCE(p_request.to_location, ''));
  out := replace(out, '{{departure_date}}',         COALESCE(to_char(p_request.date_of_travel, 'DD Mon YYYY'), 'Not set'));
  out := replace(out, '{{travel_mode}}',            COALESCE(p_request.travel_mode, 'Flight'));
  out := replace(out, '{{purpose}}',                COALESCE(p_request.purpose, ''));
  out := replace(out, '{{current_status}}',         COALESCE(p_request.pnc_status, ''));
  out := replace(out, '{{days_on_hold}}',           COALESCE(p_days_on_hold::TEXT, '0'));
  out := replace(out, '{{information_requested}}',  COALESCE(p_request.info_requested, 'the details we asked for'));
  out := replace(out, '{{employee_response}}',      COALESCE(p_request.employee_response, ''));
  out := replace(out, '{{support_email}}',          public.email_setting_text('support_email', 'travel.team@navgurukul.org'));
  out := replace(out, '{{portal_url}}',             public.email_setting_text('portal_url', 'https://travel.navgurukul.org'));
  RETURN out;
END;
$$;

-- Mirrors resolveCc in utils/emailTriggers.ts for the rules the reminder templates use.
CREATE OR REPLACE FUNCTION public.resolve_reminder_cc(
  p_cc_rule    TEXT,
  p_request    public.travel_requests,
  p_recipients TEXT[]
)
RETURNS TEXT[]
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  cc TEXT[];
  manager TEXT := NULLIF(p_request.approving_manager_email, '');
BEGIN
  cc := CASE p_cc_rule
          WHEN 'none'            THEN ARRAY[]::TEXT[]
          WHEN 'manager'         THEN ARRAY[manager]
          WHEN 'default_manager' THEN public.email_setting_list('default_cc') || ARRAY[manager]
          WHEN 'default_finance' THEN public.email_setting_list('default_cc') || public.email_setting_list('finance_cc')
          ELSE public.email_setting_list('default_cc')
        END;

  -- Drop blanks, de-duplicate, and never copy a direct recipient.
  RETURN ARRAY(
    SELECT DISTINCT e
      FROM unnest(cc) AS e
     WHERE e IS NOT NULL
       AND e <> ''
       AND lower(e) <> ALL (SELECT lower(r) FROM unnest(p_recipients) AS r)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- The scan
-- ---------------------------------------------------------------------------

-- Queues one time-based mail for a request, guarded by email_reminder_log so that a
-- scan running more often than the interval cannot send twice for the same hold.
CREATE OR REPLACE FUNCTION public.queue_reminder_email(
  p_request       public.travel_requests,
  p_event         TEXT,
  p_audience      TEXT,
  p_hold_start    TIMESTAMPTZ,
  p_days_on_hold  INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  tpl         public.mail_templates%ROWTYPE;
  recipients  TEXT[];
  cc          TEXT[];
BEGIN
  -- Already sent for this hold.
  IF EXISTS (
    SELECT 1 FROM public.email_reminder_log
     WHERE ticket_id = p_request.id
       AND event = p_event
       AND hold_started_at = p_hold_start
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO tpl
    FROM public.mail_templates
   WHERE event = p_event
     AND audience = p_audience
     AND context_key IS NULL
     AND is_active
     AND NOT is_draft
     AND status = 'Published'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  recipients := CASE p_audience
                  WHEN 'employee'         THEN ARRAY[p_request.requester_email]
                  WHEN 'manager'          THEN ARRAY[p_request.approving_manager_email]
                  WHEN 'escalation_owner' THEN public.email_setting_list('escalation_owners')
                  WHEN 'finance'          THEN public.email_setting_list('finance_cc')
                  ELSE ARRAY[]::TEXT[]
                END;

  recipients := ARRAY(SELECT e FROM unnest(recipients) AS e WHERE e IS NOT NULL AND e <> '');
  IF array_length(recipients, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  cc := public.resolve_reminder_cc(COALESCE(tpl.cc_rule, 'default'), p_request, recipients);

  INSERT INTO public.email_queue (
    ticket_id, to_status, event, audience, context_key, template_key, template_name,
    recipients, cc, subject, body, status, retry_count, attempt_count, idempotency_key
  ) VALUES (
    p_request.id,
    p_request.pnc_status,
    p_event,
    p_audience,
    NULL,
    tpl.template_key,
    tpl.name,
    recipients,
    cc,
    public.render_reminder_template(tpl.subject, p_request, p_days_on_hold),
    public.render_reminder_template(tpl.body,    p_request, p_days_on_hold),
    'Pending',
    0,
    0,
    format('ticket:%s|event:%s|aud:%s|ctx:default|to:%s|seq:%s',
           p_request.id, p_event, p_audience,
           array_to_string(recipients, ','),
           to_char(p_hold_start, 'YYYY-MM-DD"T"HH24:MI:SSOF'))
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  INSERT INTO public.email_reminder_log (ticket_id, event, hold_started_at)
  VALUES (p_request.id, p_event, p_hold_start)
  ON CONFLICT (ticket_id, event, hold_started_at) DO NOTHING;

  RETURN TRUE;
END;
$$;


-- Walks every held request and raises whichever milestones have elapsed.
-- Returns one row per mail queued, so the caller can log what the scan did.
CREATE OR REPLACE FUNCTION public.scan_email_reminders()
RETURNS TABLE (ticket_id UUID, submission_id TEXT, event TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              public.travel_requests%ROWTYPE;
  hold_start     TIMESTAMPTZ;
  hours_on_hold  NUMERIC;
  days_on_hold   INTEGER;
  first_hours    NUMERIC := public.email_setting_number('info_reminder_first_hours', 24);
  final_hours    NUMERIC := public.email_setting_number('info_reminder_final_hours', 72);
  escalate_days  NUMERIC := public.email_setting_number('info_escalation_days', 5);
  expiry_days    NUMERIC := public.email_setting_number('info_expiry_days', 7);
BEGIN
  IF public.email_setting_text('reminders_enabled', 'true') <> 'true' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM public.travel_requests
     WHERE pnc_status IN ('On Hold', 'On Hold / Escalated')
       AND COALESCE(info_requested_at, on_hold_since) IS NOT NULL
  LOOP
    hold_start    := COALESCE(r.info_requested_at, r.on_hold_since);
    hours_on_hold := EXTRACT(EPOCH FROM (NOW() - hold_start)) / 3600.0;
    days_on_hold  := FLOOR(hours_on_hold / 24.0)::INTEGER;

    -- Closure first: once the SLA has run out there is no point sending a nudge.
    -- Sheet row 28 - attributed to the system, never to the employee, so that
    -- cancellation reporting and the cost split stay honest.
    IF hours_on_hold >= expiry_days * 24 THEN
      IF public.queue_reminder_email(r, 'INFO_REQUEST_EXPIRED', 'employee', hold_start, days_on_hold) THEN
        ticket_id := r.id; submission_id := r.submission_id;
        event := 'INFO_REQUEST_EXPIRED'; action := 'queued + closed';
        RETURN NEXT;
      END IF;

      UPDATE public.travel_requests
         SET pnc_status = 'Cancelled by System',
             status_change_reason = format('Closed automatically: no response for %s days', days_on_hold),
             updated_at = NOW()
       WHERE id = r.id;

      INSERT INTO public.ticket_status_history (ticket_id, from_status, to_status, actor_role, reason)
      VALUES (r.id, r.pnc_status, 'Cancelled by System', 'System',
              format('SLA expiry after %s days on hold', days_on_hold));

      CONTINUE;
    END IF;

    -- Escalation. Sheet row 27.
    IF hours_on_hold >= escalate_days * 24 THEN
      IF public.queue_reminder_email(r, 'INFO_REQUEST_ESCALATED', 'escalation_owner', hold_start, days_on_hold) THEN
        ticket_id := r.id; submission_id := r.submission_id;
        event := 'INFO_REQUEST_ESCALATED'; action := 'queued + escalated';
        RETURN NEXT;
      END IF;

      IF r.pnc_status <> 'On Hold / Escalated' THEN
        UPDATE public.travel_requests
           SET pnc_status = 'On Hold / Escalated',
               escalated_at = NOW(),
               updated_at = NOW()
         WHERE id = r.id;

        INSERT INTO public.ticket_status_history (ticket_id, from_status, to_status, actor_role, reason)
        VALUES (r.id, r.pnc_status, 'On Hold / Escalated', 'System',
                format('SLA breach after %s days on hold', days_on_hold));
      END IF;

      CONTINUE;
    END IF;

    -- Final notice, which also copies the manager. Sheet row 26b.
    IF hours_on_hold >= final_hours THEN
      IF public.queue_reminder_email(r, 'INFO_REQUEST_REMINDER_72H', 'employee', hold_start, days_on_hold) THEN
        ticket_id := r.id; submission_id := r.submission_id;
        event := 'INFO_REQUEST_REMINDER_72H'; action := 'queued';
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    -- First nudge. Sheet row 26.
    IF hours_on_hold >= first_hours THEN
      IF public.queue_reminder_email(r, 'INFO_REQUEST_REMINDER_24H', 'employee', hold_start, days_on_hold) THEN
        ticket_id := r.id; submission_id := r.submission_id;
        event := 'INFO_REQUEST_REMINDER_24H'; action := 'queued';
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.scan_email_reminders() IS
  'Raises the sheet''s time-based triggers (rows 26, 26b, 27, 28) for held requests. '
  'Idempotent per (ticket, event, hold) - safe to run more often than the shortest interval.';

REVOKE ALL ON FUNCTION public.scan_email_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_email_reminders() TO authenticated, service_role;


-- Keeps info_requested_at in step with the hold, so the scan has a clock to read.
-- A request that goes on hold a second time gets a fresh timestamp, which resets
-- its reminder eligibility through the email_reminder_log unique key.
CREATE OR REPLACE FUNCTION public.sync_info_requested_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pnc_status = 'On Hold' AND COALESCE(OLD.pnc_status, '') <> 'On Hold' THEN
    NEW.info_requested_at := NOW();
    NEW.on_hold_since := COALESCE(NEW.on_hold_since, NOW());
  ELSIF NEW.pnc_status NOT IN ('On Hold', 'On Hold / Escalated')
        AND COALESCE(OLD.pnc_status, '') IN ('On Hold', 'On Hold / Escalated') THEN
    NEW.info_requested_at := NULL;
    NEW.escalated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_info_requested_at ON public.travel_requests;
CREATE TRIGGER trg_sync_info_requested_at
  BEFORE UPDATE OF pnc_status ON public.travel_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_info_requested_at();


-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

-- Hourly is the coarsest cadence that still honours a 24-hour milestone without
-- drifting more than an hour. Guarded because pg_cron is not enabled on every
-- Supabase plan; where it is absent, call scan_email_reminders() from an external
-- scheduler instead - see docs/email-triggers.md.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    PERFORM cron.unschedule(jobid)
       FROM cron.job
      WHERE jobname = 'travel-desk-email-reminders';

    PERFORM cron.schedule(
      'travel-desk-email-reminders',
      '7 * * * *',                      -- hourly, off the hour to avoid the busy minute
      $cron$SELECT public.scan_email_reminders();$cron$
    );

    RAISE NOTICE 'Scheduled travel-desk-email-reminders hourly via pg_cron.';
  ELSE
    RAISE NOTICE 'pg_cron unavailable - schedule public.scan_email_reminders() externally.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- A project without permission to create extensions must not fail the migration.
  RAISE NOTICE 'Could not schedule reminder scan (%). Schedule it externally.', SQLERRM;
END $$;
