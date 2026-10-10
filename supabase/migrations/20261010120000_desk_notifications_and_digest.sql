-- =============================================================================
-- Desk notifications: a second channel, terser messages, and a daily report
-- =============================================================================
-- The SOS work (20261010090000) gave failures somewhere to go. This adds the
-- other half: the desk's ordinary traffic.
--
--   * Two configurable channels, each taking a LIST of addresses --
--     'alerting' for SOS, 'notifications' for request traffic. Both start on
--     the same Slack address; splitting them later is a settings change, not a
--     deployment.
--   * Every request raised pings the notifications channel.
--   * A daily digest of what the desk did -- raised, assigned, claimed,
--     unassigned, moved, stalled -- with the full breakdown attached as a PDF.
--   * Every message rewritten as a compact key=value block. The old HTML cards
--     read as paragraphs in Slack; these read as a status line, and can be
--     parsed by anything downstream that wants to.
--
-- SOS settings and the SOS console are Admin-only from here on: not PNC Admin,
-- not PNC, not Finance.
--
-- NOTE ON QUOTING: every function body uses a uniquely named dollar tag, so the
-- file applies through psql, the CLI and the Supabase SQL editor alike. Every
-- statement is idempotent.
-- =============================================================================

-- 1. Queue support for an attached report --------------------------------------
-- The digest's PDF cannot be built in SQL. The row carries the data instead,
-- and the queue worker renders and attaches it at send time.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS report_payload JSONB;

COMMENT ON COLUMN public.email_queue.report_payload IS
  'Digest data for mail that carries a generated report. The queue worker renders it to PDF and attaches it; NULL for ordinary mail.';

-- 2. Channels ------------------------------------------------------------------
-- A single address was never going to survive contact with a second team, so
-- both streams carry a list. The old single-address key is folded into it.

UPDATE public.sos_settings
SET value = (value - 'channelEmail')
            || jsonb_build_object(
                 'channelEmails',
                 CASE
                   WHEN COALESCE(btrim(value ->> 'channelEmail'), '') <> ''
                     THEN jsonb_build_array(btrim(value ->> 'channelEmail'))
                   ELSE COALESCE(value -> 'channelEmails', '[]'::jsonb)
                 END
               ),
    updated_at = NOW()
WHERE key = 'alerting'
  AND NOT (value ? 'channelEmails');

-- The request-traffic channel. Same address as SOS for now, by request: when
-- the SLA channel exists, only this row changes.
INSERT INTO public.sos_settings (key, value, label, description)
VALUES (
  'notifications',
  jsonb_build_object(
    'enabled', true,
    'channelEmails', jsonb_build_array('alert-team-automation-aaaawk4tlokditwloipugpaleq@navgurukul.slack.com'),
    'webhookUrl', '',
    'notifyOnNewRequest', true,
    'digestEnabled', true,
    'digestAttachPdf', true,
    'stalledAfterHours', 48,
    'dailyNotificationCap', 500
  ),
  'Desk Notifications',
  'Where request traffic and the daily desk digest are posted. Separate from SOS so alerting and routine traffic can live in different channels.'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Admin only ------------------------------------------------------------------
-- SOS reads the whole desk's failures, including context quoting other people's
-- requests, and its settings decide where that goes. It is an Admin screen.

DROP POLICY IF EXISTS "Staff can view SOS alerts" ON public.sos_alerts;
DROP POLICY IF EXISTS "Admins triage SOS alerts" ON public.sos_alerts;
DROP POLICY IF EXISTS "Admins view SOS alerts" ON public.sos_alerts;
CREATE POLICY "Admins view SOS alerts"
  ON public.sos_alerts FOR SELECT
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') = 'Admin');

CREATE POLICY "Admins triage SOS alerts"
  ON public.sos_alerts FOR UPDATE
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') = 'Admin')
  WITH CHECK (COALESCE(public.get_user_role(), '') = 'Admin');

DROP POLICY IF EXISTS "Staff can view SOS settings" ON public.sos_settings;
DROP POLICY IF EXISTS "Admins manage SOS settings" ON public.sos_settings;
CREATE POLICY "Admins manage SOS settings"
  ON public.sos_settings FOR ALL
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') = 'Admin')
  WITH CHECK (COALESCE(public.get_user_role(), '') = 'Admin');

-- 4. Channel helpers --------------------------------------------------------------

-- The addresses a stream posts to. SECURITY DEFINER because the settings table
-- is Admin-only and these are read from triggers that run as whoever happened
-- to be saving a request.
CREATE OR REPLACE FUNCTION public.desk_channel_emails(p_stream TEXT)
RETURNS TEXT[] AS $desk_channel_emails$
  SELECT COALESCE(
           array_agg(DISTINCT lower(btrim(addr))) FILTER (WHERE btrim(addr) <> ''),
           ARRAY[]::TEXT[]
         )
    FROM public.sos_settings s
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE jsonb_typeof(s.value -> 'channelEmails')
        WHEN 'array'  THEN s.value -> 'channelEmails'
        WHEN 'string' THEN jsonb_build_array(s.value ->> 'channelEmails')
        ELSE '[]'::jsonb
      END
    ) AS a(addr)
   WHERE s.key = p_stream
$desk_channel_emails$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.desk_stream_settings(p_stream TEXT)
RETURNS JSONB AS $desk_stream_settings$
  SELECT COALESCE((SELECT value FROM public.sos_settings WHERE key = p_stream), '{}'::jsonb)
$desk_stream_settings$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- The message body.
--
-- Slack renders a channel email by stripping it back to text, so the body is a
-- preformatted block rather than a card: a heading line, then one fact per
-- line as key=value. It scans in a second and parses with a split.
CREATE OR REPLACE FUNCTION public.desk_message_body(p_lines TEXT[])
RETURNS TEXT AS $desk_message_body$
  SELECT '<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
         || 'font-size:13px;line-height:1.5;margin:0;white-space:pre-wrap;">'
         || COALESCE(
              string_agg(public.sos_escape_html(line), E'\n'),
              ''
            )
         || '</pre>'
    FROM unnest(COALESCE(p_lines, ARRAY[]::TEXT[])) AS t(line)
   WHERE line IS NOT NULL
$desk_message_body$ LANGUAGE sql IMMUTABLE;

-- Renders a jsonb object as `key=value key=value`, which is how context travels
-- in these messages: one line, greppable, no prose.
-- One level of nesting is flattened to dotted keys rather than dumped as JSON:
-- `usageToday.smtp=120` reads and greps; `usageToday={"smtp": 120}` does neither.
CREATE OR REPLACE FUNCTION public.desk_kv_line(p_context JSONB, p_limit INTEGER DEFAULT 10)
RETURNS TEXT AS $desk_kv_line$
  SELECT string_agg(k || '=' || v, '  ' ORDER BY k)
    FROM (
      SELECT k, v FROM (
        SELECT outer_key AS k,
               left(CASE jsonb_typeof(outer_value)
                      WHEN 'string' THEN outer_value #>> '{}'
                      ELSE outer_value::text END, 120) AS v
          FROM jsonb_each(COALESCE(p_context, '{}'::jsonb)) AS o(outer_key, outer_value)
         WHERE jsonb_typeof(outer_value) NOT IN ('null', 'object')

        UNION ALL

        SELECT o.outer_key || '.' || i.inner_key,
               left(CASE jsonb_typeof(i.inner_value)
                      WHEN 'string' THEN i.inner_value #>> '{}'
                      ELSE i.inner_value::text END, 120)
          FROM jsonb_each(COALESCE(p_context, '{}'::jsonb)) AS o(outer_key, outer_value)
          CROSS JOIN LATERAL jsonb_each(o.outer_value) AS i(inner_key, inner_value)
         WHERE jsonb_typeof(o.outer_value) = 'object'
           AND jsonb_typeof(i.inner_value) <> 'null'
      ) flat
     ORDER BY k
     LIMIT GREATEST(COALESCE(p_limit, 10), 1)
    ) AS kv
$desk_kv_line$ LANGUAGE sql IMMUTABLE;

-- Queues one message to a channel.
--
-- The recipients are resolved here and pinned by the guard, so no caller can
-- address channel mail anywhere else. Returns NULL when the stream has no
-- address configured -- a channel nobody has set up is not an error, it is a
-- channel nobody has set up.
CREATE OR REPLACE FUNCTION public.desk_queue_channel_mail(
  p_stream          TEXT,
  p_subject         TEXT,
  p_lines           TEXT[],
  p_idempotency_key TEXT DEFAULT NULL,
  p_report_payload  JSONB DEFAULT NULL
)
RETURNS UUID AS $desk_queue_channel_mail$
DECLARE
  v_recipients TEXT[];
  v_queue_id   UUID;
BEGIN
  v_recipients := public.desk_channel_emails(p_stream);
  IF array_length(v_recipients, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.desk_dispatch', p_stream, TRUE);

  INSERT INTO public.email_queue (
    ticket_id, to_status, event, audience, recipients, subject, body,
    status, retry_count, attempt_count, available_at, idempotency_key, report_payload
  ) VALUES (
    NULL,
    CASE WHEN p_stream = 'alerting' THEN 'SOS' ELSE 'Notification' END,
    CASE WHEN p_stream = 'alerting' THEN 'sos_alert' ELSE 'desk_notification' END,
    'ops',
    v_recipients,
    left(p_subject, 300),
    public.desk_message_body(p_lines),
    'Pending', 0, 0, NOW(),
    p_idempotency_key,
    p_report_payload
  )
  RETURNING id INTO v_queue_id;

  PERFORM set_config('app.desk_dispatch', '', TRUE);
  RETURN v_queue_id;
END;
$desk_queue_channel_mail$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. The recipient guard, taught about both streams -----------------------------
-- Replaces the SOS-only exemption from 20261010090000. The marker now names the
-- stream, and the recipients are overwritten with that stream's configured
-- addresses -- so the exemption can only ever reach a configured channel,
-- whichever one it is.

CREATE OR REPLACE FUNCTION public.guard_email_queue_insert()
RETURNS TRIGGER AS $guard_email_queue_insert$
DECLARE
  v_allowed TEXT[];
  v_owner   UUID;
  v_stream  TEXT;
  v_channel TEXT[];
BEGIN
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

  IF array_length(NEW.recipients, 1) IS NULL THEN
    RAISE EXCEPTION
      'No permitted recipients for this request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$guard_email_queue_insert$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. SOS, rewritten to post a terse block to the channel list -------------------

CREATE OR REPLACE FUNCTION public.raise_sos_alert(
  p_code       TEXT,
  p_category   TEXT DEFAULT 'platform',
  p_severity   TEXT DEFAULT 'warning',
  p_title      TEXT DEFAULT NULL,
  p_message    TEXT DEFAULT NULL,
  p_context    JSONB DEFAULT '{}'::jsonb,
  p_source     TEXT DEFAULT 'web',
  p_dedupe_key TEXT DEFAULT NULL
)
RETURNS TABLE (alert_id UUID, notified BOOLEAN, suppression_reason TEXT, occurrence_count INTEGER)
AS $raise_sos_alert$
DECLARE
  v_settings      JSONB;
  v_fingerprint   TEXT;
  v_severity      TEXT;
  v_category      TEXT;
  v_source        TEXT;
  v_title         TEXT;
  v_message       TEXT;
  v_window        INTEGER;
  v_existing      public.sos_alerts%ROWTYPE;
  v_alert_id      UUID;
  v_occurrences   INTEGER := 1;
  v_reason        TEXT;
  v_notify        BOOLEAN := TRUE;
  v_channel       TEXT[];
  v_webhook       TEXT;
  v_webhook_sent  BOOLEAN := FALSE;
  v_portal        TEXT;
  v_sent_today    INTEGER;
  v_cap           INTEGER;
  v_actor_email   TEXT;
  v_actor_recent  INTEGER;
  v_queue_id      UUID;
  v_lines         TEXT[];
BEGIN
  v_severity := CASE WHEN lower(COALESCE(p_severity, '')) IN ('critical', 'high', 'warning', 'info')
                     THEN lower(p_severity) ELSE 'warning' END;
  v_source   := CASE WHEN lower(COALESCE(p_source, '')) IN ('web', 'worker', 'database')
                     THEN lower(p_source) ELSE 'web' END;
  v_category := COALESCE(NULLIF(btrim(p_category), ''), 'platform');
  v_title    := left(COALESCE(NULLIF(btrim(p_title), ''), p_code, 'Unspecified failure'), 300);
  v_message  := left(COALESCE(NULLIF(btrim(p_message), ''), v_title), 4000);

  v_fingerprint := COALESCE(NULLIF(btrim(p_code), ''), 'UNKNOWN') || ':' ||
                   lower(left(COALESCE(NULLIF(btrim(p_dedupe_key), ''), 'global'), 180));

  v_settings := public.desk_stream_settings('alerting');
  v_window   := GREATEST(COALESCE((v_settings ->> 'dedupeWindowMinutes')::INTEGER, 30), 1);
  v_cap      := GREATEST(COALESCE((v_settings ->> 'dailyNotificationCap')::INTEGER, 200), 1);
  v_channel  := public.desk_channel_emails('alerting');
  v_webhook  := COALESCE(NULLIF(btrim(v_settings ->> 'webhookUrl'), ''), '');

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = auth.uid();

  IF auth.uid() IS NOT NULL THEN
    SELECT COUNT(*) INTO v_actor_recent
      FROM public.sos_alerts
     WHERE raised_by_email IS NOT DISTINCT FROM v_actor_email
       AND created_at > NOW() - INTERVAL '1 minute';

    IF v_actor_recent > 30 THEN
      RETURN QUERY SELECT NULL::UUID, FALSE, 'actor_rate_limited'::TEXT, 0;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_existing
    FROM public.sos_alerts
   WHERE fingerprint = v_fingerprint
     AND status <> 'Resolved'
     AND last_seen_at > NOW() - (v_window || ' minutes')::INTERVAL
   ORDER BY last_seen_at DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.sos_alerts
       SET occurrences  = sos_alerts.occurrences + 1,
           last_seen_at = NOW(),
           message      = v_message,
           context      = COALESCE(p_context, '{}'::jsonb),
           severity     = CASE WHEN public.sos_severity_rank(v_severity)
                                  > public.sos_severity_rank(sos_alerts.severity)
                               THEN v_severity ELSE sos_alerts.severity END
     WHERE id = v_existing.id
     RETURNING id, sos_alerts.occurrences INTO v_alert_id, v_occurrences;

    RETURN QUERY SELECT v_alert_id, FALSE, 'duplicate_within_window'::TEXT, v_occurrences;
    RETURN;
  END IF;

  IF NOT COALESCE((v_settings ->> 'enabled')::BOOLEAN, TRUE) THEN
    v_notify := FALSE; v_reason := 'alerting_disabled';
  ELSIF array_length(v_channel, 1) IS NULL AND v_webhook = '' THEN
    v_notify := FALSE; v_reason := 'no_destination';
  ELSIF public.sos_severity_rank(v_severity)
          < public.sos_severity_rank(COALESCE(v_settings ->> 'minSeverity', 'warning')) THEN
    v_notify := FALSE; v_reason := 'below_min_severity';
  ELSIF COALESCE(v_settings -> 'mutedCategories', '[]'::jsonb) ? v_category THEN
    v_notify := FALSE; v_reason := 'category_muted';
  ELSE
    SELECT COUNT(*) INTO v_sent_today
      FROM public.sos_alerts
     WHERE notified_at >= public.sos_ist_day_start();

    IF v_sent_today >= v_cap THEN
      v_notify := FALSE; v_reason := 'daily_cap_reached';
    END IF;
  END IF;

  INSERT INTO public.sos_alerts (
    code, category, severity, title, message, context, source,
    fingerprint, notification_status, notification_reason, raised_by_email
  ) VALUES (
    COALESCE(NULLIF(btrim(p_code), ''), 'UNKNOWN'), v_category, v_severity, v_title, v_message,
    COALESCE(p_context, '{}'::jsonb), v_source, v_fingerprint,
    CASE WHEN v_notify THEN 'Pending' ELSE 'Suppressed' END, v_reason, v_actor_email
  )
  RETURNING id INTO v_alert_id;

  IF NOT v_notify THEN
    RETURN QUERY SELECT v_alert_id, FALSE, v_reason, 1;
    RETURN;
  END IF;

  v_webhook_sent := public.sos_dispatch_webhook(
    v_webhook,
    public.sos_webhook_payload(p_code, v_severity, v_title, v_message, v_source)
  );

  IF v_webhook_sent THEN
    UPDATE public.sos_alerts
       SET notification_status = 'Queued',
           notification_reason = 'webhook',
           notified_at         = NOW()
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, TRUE, 'delivered'::TEXT, 1;
    RETURN;
  END IF;

  IF array_length(v_channel, 1) IS NULL THEN
    UPDATE public.sos_alerts
       SET notification_status = 'Failed',
           notification_reason = 'webhook unavailable and no channel address configured'
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, FALSE, 'notification_failed'::TEXT, 1;
    RETURN;
  END IF;

  -- The message. Four lines and a link: what, where, the facts, how to act.
  v_lines := ARRAY[
    'SOS · ' || upper(v_severity) || ' · ' || COALESCE(p_code, 'UNKNOWN'),
    v_message,
    'area=' || v_category || '  src=' || v_source
      || '  at=' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') || ' IST'
  ];

  IF public.desk_kv_line(p_context) IS NOT NULL THEN
    v_lines := v_lines || public.desk_kv_line(p_context)::TEXT;
  END IF;

  IF v_portal <> '' THEN
    v_lines := v_lines || ('open: ' || rtrim(v_portal, '/') || '/?tab=sos');
  END IF;

  BEGIN
    v_queue_id := public.desk_queue_channel_mail(
      'alerting',
      CASE lower(v_severity)
        WHEN 'critical' THEN '🚨 '
        WHEN 'high'     THEN '🔴 '
        WHEN 'warning'  THEN '🟠 '
        ELSE '🔵 '
      END || upper(v_severity) || ' · ' || COALESCE(p_code, 'UNKNOWN') || ' · ' || v_title,
      v_lines,
      'sos:' || v_alert_id::text
    );

    UPDATE public.sos_alerts
       SET notification_status = 'Queued',
           notified_at         = NOW(),
           email_queue_id      = v_queue_id
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, TRUE, 'delivered'::TEXT, 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.desk_dispatch', '', TRUE);

    UPDATE public.sos_alerts
       SET notification_status = 'Failed',
           notification_reason = left(SQLERRM, 500)
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, FALSE, 'notification_failed'::TEXT, 1;
  END;
END;
$raise_sos_alert$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.raise_sos_alert(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raise_sos_alert(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raise_sos_alert(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role;

-- The old body builder is no longer used; the message is assembled above.
DROP FUNCTION IF EXISTS public.sos_build_body(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.sos_build_body(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER);

-- 7. Every request raised pings the channel --------------------------------------

-- The statuses that mean a request is still the desk's problem.
CREATE OR REPLACE FUNCTION public.desk_open_statuses()
RETURNS TEXT[] AS $desk_open_statuses$
  SELECT ARRAY[
    'Not Started', 'Approval Pending', 'Approved', 'Processing',
    'On Hold', 'Booked', 'Cancellation Requested'
  ]
$desk_open_statuses$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.notify_new_request()
RETURNS TRIGGER AS $notify_new_request$
DECLARE
  v_settings JSONB;
  v_portal   TEXT;
  v_lines    TEXT[];
  v_trip     TEXT;
BEGIN
  v_settings := public.desk_stream_settings('notifications');

  IF NOT COALESCE((v_settings ->> 'enabled')::BOOLEAN, TRUE)
     OR NOT COALESCE((v_settings ->> 'notifyOnNewRequest')::BOOLEAN, TRUE) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  v_trip := COALESCE(NEW.from_location, '?') || ' -> ' || COALESCE(NEW.to_location, '?');

  v_lines := ARRAY[
    'REQUEST · ' || COALESCE(NEW.submission_id, left(NEW.id::text, 8)) || ' · ' || COALESCE(NEW.pnc_status, 'Not Started'),
    'who=' || COALESCE(NEW.requester_name, NEW.requester_email, 'unknown')
      || '  dept=' || COALESCE(NULLIF(NEW.requester_department, ''), '-')
      || '  campus=' || COALESCE(NULLIF(NEW.requester_campus, ''), '-'),
    'trip=' || v_trip
      || '  date=' || COALESCE(to_char(NEW.date_of_travel, 'DD Mon'), '-')
      || '  mode=' || COALESCE(NULLIF(NEW.travel_mode, ''), '-')
      || '  type=' || COALESCE(NULLIF(NEW.trip_type, ''), '-'),
    'priority=' || COALESCE(NULLIF(NEW.priority, ''), '-')
      || '  travellers=' || COALESCE(NEW.number_of_travelers, 1)
      || '  manager=' || COALESCE(NULLIF(NEW.approving_manager_email, ''), '-')
      || '  owner=unassigned'
  ];

  IF v_portal <> '' THEN
    v_lines := v_lines || ('open: ' || rtrim(v_portal, '/') || '/?tab=requests');
  END IF;

  -- A failure to announce a request must never stop the request being created.
  BEGIN
    PERFORM public.desk_queue_channel_mail(
      'notifications',
      '🆕 ' || COALESCE(NEW.submission_id, 'NEW') || ' · ' || v_trip
        || COALESCE(' · ' || to_char(NEW.date_of_travel, 'DD Mon'), ''),
      v_lines,
      'request-new:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.desk_dispatch', '', TRUE);
    BEGIN
      PERFORM public.raise_sos_alert(
        'DESK_NOTIFICATION_FAILED', 'platform', 'warning',
        'A desk notification could not be queued',
        'The new-request ping for ' || COALESCE(NEW.submission_id, NEW.id::text)
          || ' could not be queued: ' || SQLERRM,
        jsonb_build_object('ticketId', NEW.id, 'submissionId', NEW.submission_id),
        'database', 'new-request'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Desk notification and its SOS both failed: %', SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$notify_new_request$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_new_request ON public.travel_requests;
CREATE TRIGGER trg_notify_new_request
AFTER INSERT ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_request();

-- 8. The daily digest ------------------------------------------------------------
-- One pass over the desk: what came in, who holds it, what moved, what did not.
-- The shape returned here is the contract with utils/desk/digest.ts, which
-- renders it to the PDF that goes with the message.

CREATE OR REPLACE FUNCTION public.build_desk_digest(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $build_desk_digest$
DECLARE
  v_from      TIMESTAMPTZ;
  v_to        TIMESTAMPTZ;
  v_stalled   INTEGER;
  v_open      TEXT[];
  v_result    JSONB;
BEGIN
  v_from := COALESCE(p_from, public.sos_ist_day_start());
  v_to   := COALESCE(p_to, NOW());
  v_open := public.desk_open_statuses();

  v_stalled := GREATEST(
    COALESCE((public.desk_stream_settings('notifications') ->> 'stalledAfterHours')::INTEGER, 48),
    1
  );

  WITH window_requests AS (
    SELECT * FROM public.travel_requests
     WHERE created_at >= v_from AND created_at < v_to
  ),
  open_requests AS (
    SELECT tr.*,
           COALESCE(p.name, p.email) AS owner_name,
           GREATEST(
             COALESCE(tr.updated_at, tr.created_at),
             COALESCE((SELECT MAX(h.created_at) FROM public.ticket_status_history h
                        WHERE h.ticket_id = tr.id), tr.created_at)
           ) AS last_moved_at
      FROM public.travel_requests tr
      LEFT JOIN public.profiles p ON p.id = tr.assigned_pnc_id
     WHERE tr.pnc_status = ANY (v_open)
  ),
  movement AS (
    SELECT h.ticket_id, h.from_status, h.to_status, h.created_at,
           COALESCE(pr.name, pr.email, h.actor_role) AS actor,
           tr.submission_id
      FROM public.ticket_status_history h
      JOIN public.travel_requests tr ON tr.id = h.ticket_id
      LEFT JOIN public.profiles pr ON pr.id = h.actor_id
     WHERE h.created_at >= v_from AND h.created_at < v_to
  )
  SELECT jsonb_build_object(
    'generatedAt', NOW(),
    'windowFrom', v_from,
    'windowTo', v_to,
    'windowLabel', to_char(v_from AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY'),
    'stalledAfterHours', v_stalled,

    'totals', jsonb_build_object(
      'raised',    (SELECT COUNT(*) FROM window_requests),
      'booked',    (SELECT COUNT(*) FROM public.travel_requests
                     WHERE pnc_status = 'Booked' AND updated_at >= v_from AND updated_at < v_to),
      'closed',    (SELECT COUNT(*) FROM movement WHERE to_status = 'Closed'),
      'cancelled', (SELECT COUNT(*) FROM movement WHERE to_status LIKE 'Cancelled%'),
      'open',      (SELECT COUNT(*) FROM open_requests),
      'assigned',  (SELECT COUNT(*) FROM open_requests WHERE assigned_pnc_id IS NOT NULL),
      'unassigned',(SELECT COUNT(*) FROM open_requests WHERE assigned_pnc_id IS NULL),
      'claimed',   (SELECT COUNT(*) FROM public.travel_requests
                     WHERE assigned_at >= v_from AND assigned_at < v_to),
      'moved',     (SELECT COUNT(DISTINCT ticket_id) FROM movement),
      'stalled',   (SELECT COUNT(*) FROM open_requests
                     WHERE last_moved_at < NOW() - (v_stalled || ' hours')::INTERVAL),
      'oldestOpenHours', COALESCE(
                     (SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600)
                        FROM open_requests), 0)
    ),

    'byStatus', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', pnc_status, 'count', c) ORDER BY c DESC)
        FROM (SELECT pnc_status, COUNT(*) AS c FROM open_requests GROUP BY pnc_status) s
    ), '[]'::jsonb),

    'byOwner', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'owner', owner, 'assigned', held, 'open', still_open, 'booked', booked
             ) ORDER BY held DESC)
        FROM (
          SELECT COALESCE(owner_name, 'Unassigned') AS owner,
                 COUNT(*) AS held,
                 COUNT(*) FILTER (WHERE pnc_status <> 'Booked') AS still_open,
                 COUNT(*) FILTER (WHERE pnc_status = 'Booked') AS booked
            FROM open_requests
           WHERE assigned_pnc_id IS NOT NULL
           GROUP BY COALESCE(owner_name, 'Unassigned')
        ) o
    ), '[]'::jsonb),

    'raisedList', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ticket', COALESCE(w.submission_id, left(w.id::text, 8)),
               'status', w.pnc_status,
               'requester', COALESCE(w.requester_name, w.requester_email, '-'),
               'trip', COALESCE(w.from_location, '?') || ' -> ' || COALESCE(w.to_location, '?'),
               'travelDate', to_char(w.date_of_travel, 'DD Mon'),
               'priority', w.priority,
               'owner', (SELECT COALESCE(p.name, p.email) FROM public.profiles p WHERE p.id = w.assigned_pnc_id)
             ) ORDER BY w.created_at)
        FROM (SELECT * FROM window_requests ORDER BY created_at LIMIT 200) w
    ), '[]'::jsonb),

    'unassignedList', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ticket', COALESCE(u.submission_id, left(u.id::text, 8)),
               'status', u.pnc_status,
               'requester', COALESCE(u.requester_name, u.requester_email, '-'),
               'trip', COALESCE(u.from_location, '?') || ' -> ' || COALESCE(u.to_location, '?'),
               'ageHours', ROUND(EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 3600)
             ) ORDER BY u.created_at)
        FROM (SELECT * FROM open_requests WHERE assigned_pnc_id IS NULL
               ORDER BY created_at LIMIT 100) u
    ), '[]'::jsonb),

    'stalledList', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ticket', COALESCE(s.submission_id, left(s.id::text, 8)),
               'status', s.pnc_status,
               'owner', s.owner_name,
               'requester', COALESCE(s.requester_name, s.requester_email, '-'),
               'trip', COALESCE(s.from_location, '?') || ' -> ' || COALESCE(s.to_location, '?'),
               'ageHours', ROUND(EXTRACT(EPOCH FROM (NOW() - s.last_moved_at)) / 3600)
             ) ORDER BY s.last_moved_at)
        FROM (SELECT * FROM open_requests
               WHERE last_moved_at < NOW() - (v_stalled || ' hours')::INTERVAL
               ORDER BY last_moved_at LIMIT 100) s
    ), '[]'::jsonb),

    'movementList', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ticket', COALESCE(m.submission_id, left(m.ticket_id::text, 8)),
               'fromStatus', m.from_status,
               'toStatus', m.to_status,
               'at', m.created_at,
               'actor', m.actor
             ) ORDER BY m.created_at)
        FROM (SELECT * FROM movement ORDER BY created_at LIMIT 150) m
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$build_desk_digest$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.build_desk_digest(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_desk_digest(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_desk_digest(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- 9. Posting the digest ----------------------------------------------------------
-- The message is the headline; the PDF carries the detail. The queue row holds
-- the digest data, and the worker renders the attachment at send time.

CREATE OR REPLACE FUNCTION public.send_desk_digest(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $send_desk_digest$
DECLARE
  v_settings JSONB;
  v_digest   JSONB;
  v_totals   JSONB;
  v_portal   TEXT;
  v_lines    TEXT[];
  v_queue_id UUID;
  v_names    TEXT;
BEGIN
  v_settings := public.desk_stream_settings('notifications');

  IF NOT COALESCE((v_settings ->> 'enabled')::BOOLEAN, TRUE)
     OR NOT COALESCE((v_settings ->> 'digestEnabled')::BOOLEAN, TRUE) THEN
    RETURN jsonb_build_object('sent', FALSE, 'reason', 'digest_disabled');
  END IF;

  v_digest := public.build_desk_digest(p_from, p_to);
  v_totals := v_digest -> 'totals';

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  SELECT string_agg(o ->> 'owner' || '=' || (o ->> 'assigned'), '  ')
    INTO v_names
    FROM jsonb_array_elements(v_digest -> 'byOwner') AS o;

  v_lines := ARRAY[
    'DESK DIGEST · ' || (v_digest ->> 'windowLabel') || ' (IST)',
    'raised=' || (v_totals ->> 'raised')
      || '  booked=' || (v_totals ->> 'booked')
      || '  closed=' || (v_totals ->> 'closed')
      || '  cancelled=' || (v_totals ->> 'cancelled'),
    'open=' || (v_totals ->> 'open')
      || '  assigned=' || (v_totals ->> 'assigned')
      || '  unassigned=' || (v_totals ->> 'unassigned')
      || '  claimed=' || (v_totals ->> 'claimed'),
    'moved=' || (v_totals ->> 'moved')
      || '  stalled=' || (v_totals ->> 'stalled')
      || '  oldest_open=' || (v_totals ->> 'oldestOpenHours') || 'h'
  ];

  IF COALESCE(v_names, '') <> '' THEN
    v_lines := v_lines || ('owners: ' || left(v_names, 300));
  END IF;

  -- Name the tickets nobody owns, because that is the line somebody has to act
  -- on before tomorrow. The rest is in the attachment.
  IF (v_totals ->> 'unassigned')::INTEGER > 0 THEN
    v_lines := v_lines || (
      'unassigned: ' || left(COALESCE((
        SELECT string_agg((u ->> 'ticket') || '(' || (u ->> 'ageHours') || 'h)', ' ')
          FROM jsonb_array_elements(v_digest -> 'unassignedList') AS u
      ), '-'), 300)
    );
  END IF;

  IF (v_totals ->> 'stalled')::INTEGER > 0 THEN
    v_lines := v_lines || (
      'stalled: ' || left(COALESCE((
        SELECT string_agg((s ->> 'ticket') || '(' || (s ->> 'ageHours') || 'h)', ' ')
          FROM jsonb_array_elements(v_digest -> 'stalledList') AS s
      ), '-'), 300)
    );
  END IF;

  IF COALESCE((v_settings ->> 'digestAttachPdf')::BOOLEAN, TRUE) THEN
    v_lines := v_lines || 'report: attached (PDF)'::TEXT;
  END IF;

  IF v_portal <> '' THEN
    v_lines := v_lines || ('open: ' || rtrim(v_portal, '/') || '/?tab=all-requests');
  END IF;

  v_queue_id := public.desk_queue_channel_mail(
    'notifications',
    '📊 Desk digest · ' || (v_digest ->> 'windowLabel')
      || ' · raised ' || (v_totals ->> 'raised')
      || ' · unassigned ' || (v_totals ->> 'unassigned')
      || ' · stalled ' || (v_totals ->> 'stalled'),
    v_lines,
    'desk-digest:' || to_char(COALESCE(p_to, NOW()) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD-HH24'),
    CASE WHEN COALESCE((v_settings ->> 'digestAttachPdf')::BOOLEAN, TRUE)
         THEN v_digest ELSE NULL END
  );

  RETURN jsonb_build_object(
    'sent', v_queue_id IS NOT NULL,
    'queueId', v_queue_id,
    'totals', v_totals,
    'reason', CASE WHEN v_queue_id IS NULL THEN 'no_channel_configured' ELSE NULL END
  );
END;
$send_desk_digest$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.send_desk_digest(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_desk_digest(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_desk_digest(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- 10. Schedule the digest ---------------------------------------------------------
-- 19:30 IST, which is 14:00 UTC. pg_cron runs on the server clock (UTC on
-- Supabase), so the expression is written in UTC the way the auto-close sweep
-- is. To move it, edit the expression and re-run: the job is replaced by name.
--
--   19:30 IST -> '0 14 * * *'
--   18:00 IST -> '30 12 * * *'
--   21:00 IST -> '30 15 * * *'

DO $schedule_desk_digest$
BEGIN
  IF to_regproc('cron.schedule') IS NULL THEN
    RAISE NOTICE 'pg_cron is not enabled, so the desk digest was NOT scheduled. Enable it under Database > Extensions and re-run this migration.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'desk-daily-digest') THEN
    PERFORM cron.unschedule('desk-daily-digest');
  END IF;

  PERFORM cron.schedule('desk-daily-digest', '0 14 * * *', 'SELECT public.send_desk_digest();');

  RAISE NOTICE 'Desk digest scheduled: 14:00 UTC daily (19:30 IST).';
END;
$schedule_desk_digest$;
