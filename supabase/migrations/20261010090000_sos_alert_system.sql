-- =============================================================================
-- SOS: no silent failures
-- =============================================================================
-- Until now a failure in this system had three possible endings: a toast the
-- user dismisses, a console line nobody reads, or nothing at all. The queue
-- worker could demote an SMTP account mid-flight, an advance deduction could
-- fail to post, the overnight auto-close sweep could stop running -- and the
-- first anyone would know is when someone noticed the consequence days later.
--
-- This migration gives every one of those paths somewhere to go:
--
--   public.sos_alerts      durable record of every failure, deduplicated
--   public.sos_settings    where alerts go and how loud they have to be
--   raise_sos_alert()      the one entry point: records, then notifies
--   scan_sos_health()      hourly sweep for failures nothing can report itself
--
-- Alerts are pushed to the automation Slack channel by mail, through the
-- channel's own email address. That deliberately shares a transport with the
-- email system an alert often reports on, so two things are true by design:
-- every alert is recorded whether or not it is delivered, and a Slack incoming
-- webhook can be configured as a delivery path that does not depend on mail.
--
-- The application mirrors the dedupe and threshold rules in
-- utils/sos/alertRules.ts; a change to one belongs in the other.
--
-- NOTE ON QUOTING: every function body is delimited by a uniquely named dollar
-- tag. The Supabase dashboard's SQL editor splits pasted scripts with a
-- splitter that mis-handles unnamed tags and cuts bodies in half. Keep them
-- named -- this file then applies through psql, the CLI and the editor alike.
-- Every statement is idempotent, so a partial run is fixed by continuing.
-- =============================================================================

-- 1. The alert record ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable key from utils/sos/catalog.ts. Not an enum: the catalogue is owned
  -- by the application, and a code it adds must never be rejected by the
  -- database at the moment something is already going wrong.
  code                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'platform',
  severity            TEXT NOT NULL DEFAULT 'warning'
                        CHECK (severity IN ('critical', 'high', 'warning', 'info')),

  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,
  source              TEXT NOT NULL DEFAULT 'web'
                        CHECK (source IN ('web', 'worker', 'database')),

  -- Identity used to fold repeats together: code plus whatever the caller
  -- considers the subject of the failure (an account slot, a ticket, a job).
  fingerprint         TEXT NOT NULL,
  occurrences         INTEGER NOT NULL DEFAULT 1,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status              TEXT NOT NULL DEFAULT 'Open'
                        CHECK (status IN ('Open', 'Acknowledged', 'Resolved')),
  acknowledged_by     TEXT,
  acknowledged_at     TIMESTAMPTZ,
  resolved_by         TEXT,
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT,

  -- Delivery is tracked separately from the alert itself, because an alert
  -- that could not be delivered is precisely the one worth keeping.
  notification_status TEXT NOT NULL DEFAULT 'Pending'
                        CHECK (notification_status IN ('Pending', 'Queued', 'Suppressed', 'Failed')),
  notification_reason TEXT,
  notified_at         TIMESTAMPTZ,
  email_queue_id      UUID,

  raised_by_email     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The console's default view: newest first, filtered by state.
CREATE INDEX IF NOT EXISTS idx_sos_alerts_created_at ON public.sos_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_status ON public.sos_alerts (status, severity);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_category ON public.sos_alerts (category, created_at DESC);

-- The dedupe lookup runs on every single raise, so it gets its own index.
CREATE INDEX IF NOT EXISTS idx_sos_alerts_fingerprint
  ON public.sos_alerts (fingerprint, last_seen_at DESC);

-- Supports the daily notification cap.
CREATE INDEX IF NOT EXISTS idx_sos_alerts_notified_at
  ON public.sos_alerts (notified_at)
  WHERE notified_at IS NOT NULL;

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- Everyone who runs the desk can read the alert feed. Employees cannot: the
-- context can carry another traveller's ticket details.
DROP POLICY IF EXISTS "Staff can view SOS alerts" ON public.sos_alerts;
CREATE POLICY "Staff can view SOS alerts"
  ON public.sos_alerts FOR SELECT
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin', 'PNC', 'Finance'));

-- Acknowledging and resolving is a supervisory action.
DROP POLICY IF EXISTS "Admins triage SOS alerts" ON public.sos_alerts;
CREATE POLICY "Admins triage SOS alerts"
  ON public.sos_alerts FOR UPDATE
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin'))
  WITH CHECK (COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin'));

-- There is deliberately no INSERT policy. Alerts are only ever written through
-- raise_sos_alert(), which is SECURITY DEFINER: that keeps the dedupe, the
-- rate limit and the notification rules on a path nobody can go around.

-- 2. Settings -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sos_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

ALTER TABLE public.sos_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view SOS settings" ON public.sos_settings;
CREATE POLICY "Staff can view SOS settings"
  ON public.sos_settings FOR SELECT
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin', 'PNC', 'Finance'));

DROP POLICY IF EXISTS "Admins manage SOS settings" ON public.sos_settings;
CREATE POLICY "Admins manage SOS settings"
  ON public.sos_settings FOR ALL
  TO authenticated
  USING (COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin'))
  WITH CHECK (COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC Admin'));

-- The destination channel. This is a Slack channel email address: mail sent to
-- it is posted into #alert-team-automation, which needs no credentials and no
-- app install. ON CONFLICT DO NOTHING so re-running never clobbers a changed
-- address or a configured webhook.
INSERT INTO public.sos_settings (key, value, label, description)
VALUES (
  'alerting',
  jsonb_build_object(
    'enabled', true,
    'channelEmail', 'alert-team-automation-aaaawk4tlokditwloipugpaleq@navgurukul.slack.com',
    'webhookUrl', '',
    'minSeverity', 'warning',
    'mutedCategories', '[]'::jsonb,
    'dedupeWindowMinutes', 30,
    'dailyNotificationCap', 200
  ),
  'SOS Alerting',
  'Where automation failures are pushed, how loud they have to be, and how aggressively repeats are folded together.'
)
ON CONFLICT (key) DO NOTHING;

-- Thresholds for the hourly health sweep, separated from delivery settings so
-- tuning the sweep cannot accidentally mute the channel.
INSERT INTO public.sos_settings (key, value, label, description)
VALUES (
  'health_thresholds',
  jsonb_build_object(
    'queueStuckMinutes', 45,
    'queueBacklogCount', 250,
    'staleProcessingMinutes', 30,
    'failedSendLookbackMinutes', 120,
    'autoCloseMaxAgeHours', 36
  ),
  'SOS Health Thresholds',
  'When the hourly sweep decides the email queue, the scheduler or the transport has stopped behaving.'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Helpers ------------------------------------------------------------------

-- Start of the current IST day, as a timestamptz. The daily notification cap
-- has to roll over on the desk's day, not on UTC's.
CREATE OR REPLACE FUNCTION public.sos_ist_day_start()
RETURNS TIMESTAMPTZ AS $sos_ist_day_start$
  SELECT (date_trunc('day', (NOW() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata')
$sos_ist_day_start$ LANGUAGE sql STABLE;

-- Alert text can carry a database error, a filename or whatever an employee's
-- browser threw. It is rendered as mail, so it is escaped before it goes in.
CREATE OR REPLACE FUNCTION public.sos_escape_html(p_text TEXT)
RETURNS TEXT AS $sos_escape_html$
  SELECT replace(replace(replace(replace(COALESCE(p_text, ''),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$sos_escape_html$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.sos_severity_rank(p_severity TEXT)
RETURNS INTEGER AS $sos_severity_rank$
  SELECT CASE lower(COALESCE(p_severity, 'warning'))
           WHEN 'critical' THEN 4
           WHEN 'high'     THEN 3
           WHEN 'warning'  THEN 2
           WHEN 'info'     THEN 1
           ELSE 2
         END
$sos_severity_rank$ LANGUAGE sql IMMUTABLE;

-- The mail body posted into Slack. Slack renders the HTML part of a channel
-- email, so this stays plain: what broke, where, and the context that makes it
-- actionable without opening the console.
CREATE OR REPLACE FUNCTION public.sos_build_body(
  p_code TEXT, p_severity TEXT, p_title TEXT, p_message TEXT,
  p_context JSONB, p_source TEXT, p_occurrences INTEGER,
  p_portal_url TEXT DEFAULT NULL
)
RETURNS TEXT AS $sos_build_body$
DECLARE
  v_colour  TEXT;
  v_icon    TEXT;
  v_rows    TEXT := '';
  v_key     TEXT;
  v_value   TEXT;
BEGIN
  v_colour := CASE lower(p_severity)
                WHEN 'critical' THEN '#dc2626'
                WHEN 'high'     THEN '#ea580c'
                WHEN 'warning'  THEN '#d97706'
                ELSE '#2563eb'
              END;
  v_icon := CASE lower(p_severity)
              WHEN 'critical' THEN '&#128680;'
              WHEN 'high'     THEN '&#128308;'
              WHEN 'warning'  THEN '&#128992;'
              ELSE '&#128309;'
            END;

  FOR v_key, v_value IN
    SELECT k, left(CASE jsonb_typeof(v) WHEN 'string' THEN v #>> '{}' ELSE v::text END, 500)
      FROM jsonb_each(COALESCE(p_context, '{}'::jsonb)) AS t(k, v)
     ORDER BY k
     LIMIT 25
  LOOP
    v_rows := v_rows || '<li style="font-family:monospace;font-size:12px;">'
                     || public.sos_escape_html(v_key) || ': '
                     || public.sos_escape_html(v_value) || '</li>';
  END LOOP;

  RETURN
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:640px;">'
    || '<div style="border-left:4px solid ' || v_colour || ';padding:12px 16px;background:#f8fafc;">'
    || '<p style="margin:0;font-size:15px;font-weight:700;color:' || v_colour || ';">'
    || v_icon || ' ' || upper(public.sos_escape_html(p_severity)) || ' &mdash; '
    || public.sos_escape_html(p_title) || '</p>'
    || '<p style="margin:8px 0 0 0;font-size:13px;color:#334155;">'
    || public.sos_escape_html(p_message) || '</p></div>'
    || '<p style="font-size:12px;color:#64748b;"><strong>Code:</strong> '
    || public.sos_escape_html(p_code)
    || ' &bull; <strong>Raised by:</strong> ' || public.sos_escape_html(p_source)
    || CASE WHEN COALESCE(p_occurrences, 1) > 1
            THEN ' &bull; <strong>Occurrences:</strong> ' || p_occurrences::text
            ELSE '' END
    || '</p>'
    || CASE WHEN v_rows <> '' THEN '<ul style="padding-left:18px;color:#334155;">' || v_rows || '</ul>' ELSE '' END
    -- Straight into the console, where the alert is recorded along with
    -- everything the channel never got.
    || CASE WHEN COALESCE(btrim(p_portal_url), '') <> ''
            THEN '<p style="font-size:12px;"><a href="'
                 || public.sos_escape_html(rtrim(p_portal_url, '/'))
                 || '/?tab=sos">Open the SOS console</a></p>'
            ELSE '' END
    || '</div>';
END;
$sos_build_body$ LANGUAGE plpgsql IMMUTABLE;

-- The Slack incoming-webhook payload for the same alert. Posting straight to
-- Slack is the delivery path that does not travel through the email system an
-- alert is so often reporting on -- see sos_dispatch_webhook() below.
CREATE OR REPLACE FUNCTION public.sos_webhook_payload(
  p_code TEXT, p_severity TEXT, p_title TEXT, p_message TEXT, p_source TEXT
)
RETURNS JSONB AS $sos_webhook_payload$
  SELECT jsonb_build_object(
    'text', CASE lower(p_severity)
              WHEN 'critical' THEN '[CRITICAL] '
              WHEN 'high'     THEN '[HIGH] '
              WHEN 'warning'  THEN '[WARNING] '
              ELSE '[INFO] '
            END || 'Travel Desk SOS — ' || COALESCE(p_title, p_code),
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'type', 'section',
        'text', jsonb_build_object(
          'type', 'mrkdwn',
          'text', '*' || upper(COALESCE(p_severity, 'warning')) || ' — ' || COALESCE(p_title, p_code)
                  || '*' || E'\n' || COALESCE(p_message, '')
        )
      ),
      jsonb_build_object(
        'type', 'context',
        'elements', jsonb_build_array(
          jsonb_build_object('type', 'mrkdwn',
            'text', '`' || COALESCE(p_code, 'UNKNOWN') || '` • raised by ' || COALESCE(p_source, 'web'))
        )
      )
    )
  )
$sos_webhook_payload$ LANGUAGE sql IMMUTABLE;

-- Posts an alert to the Slack webhook, if one is configured and pg_net is
-- available. Returns TRUE only when the request was actually handed off.
--
-- Guarded on pg_net the way the sweeps are guarded on pg_cron: Supabase ships
-- the extension but it is off until enabled, and an alerting path that throws
-- because an extension is missing is worse than one that quietly falls back to
-- mail. The call is made through EXECUTE so this function still compiles where
-- the net schema does not exist at all.
CREATE OR REPLACE FUNCTION public.sos_dispatch_webhook(p_url TEXT, p_payload JSONB)
RETURNS BOOLEAN AS $sos_dispatch_webhook$
BEGIN
  IF COALESCE(btrim(p_url), '') = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    RETURN FALSE;
  END IF;

  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
    USING p_url, p_payload, '{"Content-Type": "application/json"}'::jsonb;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- Fall back to the channel address rather than losing the alert.
  RAISE NOTICE 'SOS webhook post failed, falling back to email: %', SQLERRM;
  RETURN FALSE;
END;
$sos_dispatch_webhook$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. The entry point ----------------------------------------------------------
-- Everything that raises an alert -- the browser, the Deno queue worker, the
-- health sweep, the triggers below -- comes through here, so the dedupe, the
-- abuse rate limit and the notification rules are applied exactly once.

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
  v_channel       TEXT;
  v_webhook       TEXT;
  v_portal        TEXT;
  v_webhook_sent  BOOLEAN := FALSE;
  v_sent_today    INTEGER;
  v_cap           INTEGER;
  v_actor_email   TEXT;
  v_actor_recent  INTEGER;
  v_queue_id      UUID;
BEGIN
  -- Normalise first: an alert raised from an error path must never fail
  -- validation and lose the failure it was reporting.
  v_severity := CASE WHEN lower(COALESCE(p_severity, '')) IN ('critical', 'high', 'warning', 'info')
                     THEN lower(p_severity) ELSE 'warning' END;
  v_source   := CASE WHEN lower(COALESCE(p_source, '')) IN ('web', 'worker', 'database')
                     THEN lower(p_source) ELSE 'web' END;
  v_category := COALESCE(NULLIF(btrim(p_category), ''), 'platform');
  v_title    := left(COALESCE(NULLIF(btrim(p_title), ''), p_code, 'Unspecified failure'), 300);
  v_message  := left(COALESCE(NULLIF(btrim(p_message), ''), v_title), 4000);

  v_fingerprint := COALESCE(NULLIF(btrim(p_code), ''), 'UNKNOWN') || ':' ||
                   lower(left(COALESCE(NULLIF(btrim(p_dedupe_key), ''), 'global'), 180));

  SELECT value INTO v_settings FROM public.sos_settings WHERE key = 'alerting';
  v_settings := COALESCE(v_settings, '{}'::jsonb);
  v_window   := GREATEST(COALESCE((v_settings ->> 'dedupeWindowMinutes')::INTEGER, 30), 1);
  v_cap      := GREATEST(COALESCE((v_settings ->> 'dailyNotificationCap')::INTEGER, 200), 1);
  v_channel  := COALESCE(NULLIF(btrim(v_settings ->> 'channelEmail'), ''), '');
  v_webhook  := COALESCE(NULLIF(btrim(v_settings ->> 'webhookUrl'), ''), '');

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = auth.uid();

  -- Abuse guard. Any signed-in account can raise an alert, because an
  -- employee's browser has to be able to report its own failures. A single
  -- account flooding the table is capped here rather than in the channel.
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

  -- Fold a repeat into the alert it repeats, while that alert is recent and
  -- still unresolved. Past the window a fresh alert is raised, so a problem
  -- that comes back after being quiet pages again instead of hiding inside an
  -- old row.
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

  -- Decide delivery before inserting, so the row records the outcome.
  IF NOT COALESCE((v_settings ->> 'enabled')::BOOLEAN, TRUE) THEN
    v_notify := FALSE; v_reason := 'alerting_disabled';
  ELSIF v_channel = '' AND v_webhook = '' THEN
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

  -- Queue the Slack mail. Wrapped, because the thing most likely to be broken
  -- when an alert is raised is the email system itself: a failure to deliver
  -- is recorded against the alert rather than thrown back at the caller, who
  -- is already inside an error path.
  -- Prefer the webhook: it reaches Slack without using the email system, which
  -- is the system an alert is most often about.
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

  -- No webhook, or it could not be posted: fall back to the channel address.
  IF v_channel = '' THEN
    UPDATE public.sos_alerts
       SET notification_status = 'Failed',
           notification_reason = 'webhook unavailable and no channel address configured'
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, FALSE, 'notification_failed'::TEXT, 1;
    RETURN;
  END IF;

  BEGIN
    -- Tells the email_queue recipient guard that this row is an SOS. The guard
    -- forces the recipients to the configured channel, so the marker cannot be
    -- used to send anywhere else even if something managed to set it.
    PERFORM set_config('app.sos_dispatch', 'on', TRUE);

    INSERT INTO public.email_queue (
      ticket_id, to_status, event, audience, recipients, subject, body,
      status, retry_count, attempt_count, available_at, idempotency_key
    ) VALUES (
      NULL, 'SOS', 'sos_alert', 'ops',
      ARRAY[v_channel],
      CASE lower(v_severity)
        WHEN 'critical' THEN '[CRITICAL] '
        WHEN 'high'     THEN '[HIGH] '
        WHEN 'warning'  THEN '[WARNING] '
        ELSE '[INFO] '
      END || 'Travel Desk SOS — ' || v_title,
      public.sos_build_body(p_code, v_severity, v_title, v_message, p_context, v_source, 1, v_portal),
      'Pending', 0, 0, NOW(),
      'sos:' || v_alert_id::text
    )
    RETURNING id INTO v_queue_id;

    PERFORM set_config('app.sos_dispatch', 'off', TRUE);

    UPDATE public.sos_alerts
       SET notification_status = 'Queued',
           notified_at         = NOW(),
           email_queue_id      = v_queue_id
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, TRUE, 'delivered'::TEXT, 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sos_dispatch', 'off', TRUE);

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

-- 5. Let the SOS mail past the recipient guard ---------------------------------
-- 20261008110000 filters every non-staff insert into email_queue against an
-- allow-list derived from the ticket. An SOS has no ticket and goes to a Slack
-- address that is on nobody's allow-list, so an alert raised from an
-- employee's browser would be refused. The branch added here recognises the
-- marker raise_sos_alert() sets, and pins the recipients to the configured
-- channel: the exemption cannot address mail anywhere else. The rest of the
-- guard is carried over from that migration unchanged.

CREATE OR REPLACE FUNCTION public.guard_email_queue_insert()
RETURNS TRIGGER AS $guard_email_queue_insert$
DECLARE
  v_allowed TEXT[];
  v_owner   UUID;
  v_channel TEXT;
BEGIN
  -- SOS dispatch: raise_sos_alert() is the only thing that sets this marker,
  -- and it is transaction-local. Recipients are overwritten rather than
  -- checked, so this branch can only ever address the alerting channel.
  IF COALESCE(current_setting('app.sos_dispatch', TRUE), 'off') = 'on' THEN
    SELECT COALESCE(NULLIF(btrim(value ->> 'channelEmail'), ''), '')
      INTO v_channel
      FROM public.sos_settings WHERE key = 'alerting';

    IF v_channel IS NULL OR v_channel = '' THEN
      RAISE EXCEPTION 'No SOS channel address configured' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    NEW.recipients := ARRAY[v_channel];
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

-- 6. Failures the database can see for itself ----------------------------------

-- A queue row reaching Failed means a notification nobody will ever retry.
-- The SOS mail itself is excluded: an alert about an undeliverable alert would
-- queue another undeliverable alert. That case is recorded directly instead,
-- with delivery suppressed, so the console still shows it.
CREATE OR REPLACE FUNCTION public.sos_on_email_failed()
RETURNS TRIGGER AS $sos_on_email_failed$
BEGIN
  IF NEW.status <> 'Failed' OR COALESCE(OLD.status, '') = 'Failed' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.event, '') = 'sos_alert' THEN
    -- Mark the alert this mail was carrying as undelivered, so the console
    -- shows plainly that Slack never heard about it.
    UPDATE public.sos_alerts
       SET notification_status = 'Failed',
           notification_reason = left(COALESCE(NEW.last_error, 'channel mail failed'), 500)
     WHERE email_queue_id = NEW.id;

    -- And record the delivery failure itself once, folding repeats, since the
    -- usual cause takes out every alert mail at the same time.
    UPDATE public.sos_alerts
       SET occurrences  = sos_alerts.occurrences + 1,
           last_seen_at = NOW(),
           message      = 'The alert channel mail itself failed to send: '
                          || COALESCE(NEW.last_error, 'no error recorded')
     WHERE fingerprint = 'SOS_NOTIFICATION_FAILED:channel'
       AND status <> 'Resolved'
       AND last_seen_at > NOW() - INTERVAL '1 hour';

    IF NOT FOUND THEN
      INSERT INTO public.sos_alerts (
        code, category, severity, title, message, context, source,
        fingerprint, notification_status, notification_reason
      ) VALUES (
        'SOS_NOTIFICATION_FAILED', 'platform', 'high',
        'An SOS could not be pushed to Slack',
        'The alert channel mail itself failed to send: ' || COALESCE(NEW.last_error, 'no error recorded'),
        jsonb_build_object('queueId', NEW.id, 'subject', NEW.subject, 'lastError', NEW.last_error),
        'database', 'SOS_NOTIFICATION_FAILED:channel', 'Suppressed', 'would_loop'
      );
    END IF;

    RETURN NEW;
  END IF;

  PERFORM public.raise_sos_alert(
    'EMAIL_SEND_PERMANENT_FAILURE', 'email_delivery', 'high',
    'A queued email was abandoned after its final attempt',
    'Mail "' || left(COALESCE(NEW.subject, '(no subject)'), 160) || '" was abandoned: '
      || COALESCE(NEW.last_error, 'no error recorded'),
    jsonb_build_object(
      'queueId', NEW.id,
      'ticketId', NEW.ticket_id,
      'event', NEW.event,
      'templateKey', NEW.template_key,
      'attempts', NEW.attempt_count,
      'smtpSlot', NEW.smtp_slot,
      'lastError', left(COALESCE(NEW.last_error, ''), 600)
    ),
    'database',
    -- One alert per failing template rather than one per recipient: a broken
    -- template fails for everybody and should read as one problem.
    COALESCE(NEW.template_key, NEW.event, 'unknown')
  );

  RETURN NEW;
END;
$sos_on_email_failed$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sos_on_email_failed ON public.email_queue;
CREATE TRIGGER trg_sos_on_email_failed
AFTER UPDATE OF status ON public.email_queue
FOR EACH ROW
EXECUTE FUNCTION public.sos_on_email_failed();

-- 7. The hourly sweep ----------------------------------------------------------
-- Some failures have nobody to report them: a worker that never ran, a cron job
-- that stopped firing, a queue quietly filling up. The sweep looks for the
-- evidence those leave behind.

CREATE OR REPLACE FUNCTION public.scan_sos_health()
RETURNS JSONB AS $scan_sos_health$
DECLARE
  v_thresholds   JSONB;
  v_raised       INTEGER := 0;
  v_stuck        INTEGER;
  v_oldest       TIMESTAMPTZ;
  v_backlog      INTEGER;
  v_stale        INTEGER;
  v_failed       INTEGER;
  v_quota        INTEGER;
  v_usage_a      INTEGER;
  v_usage_b      INTEGER;
  v_stuck_mins   INTEGER;
  v_backlog_max  INTEGER;
  v_stale_mins   INTEGER;
  v_failed_mins  INTEGER;
  v_close_hours  INTEGER;
  v_last_close   TIMESTAMPTZ;
  v_job          RECORD;
BEGIN
  SELECT value INTO v_thresholds FROM public.sos_settings WHERE key = 'health_thresholds';
  v_thresholds  := COALESCE(v_thresholds, '{}'::jsonb);
  v_stuck_mins  := COALESCE((v_thresholds ->> 'queueStuckMinutes')::INTEGER, 45);
  v_backlog_max := COALESCE((v_thresholds ->> 'queueBacklogCount')::INTEGER, 250);
  v_stale_mins  := COALESCE((v_thresholds ->> 'staleProcessingMinutes')::INTEGER, 30);
  v_failed_mins := COALESCE((v_thresholds ->> 'failedSendLookbackMinutes')::INTEGER, 120);
  v_close_hours := COALESCE((v_thresholds ->> 'autoCloseMaxAgeHours')::INTEGER, 36);

  -- (a) Mail that should have gone out and has not.
  SELECT COUNT(*), MIN(created_at) INTO v_stuck, v_oldest
    FROM public.email_queue
   WHERE status = 'Pending'
     AND COALESCE(available_at, created_at) < NOW() - (v_stuck_mins || ' minutes')::INTERVAL;

  IF COALESCE(v_stuck, 0) > 0 THEN
    PERFORM public.raise_sos_alert(
      'EMAIL_QUEUE_STUCK', 'email_delivery', 'critical',
      'Mail has been sitting in the queue unsent',
      v_stuck || ' email(s) have been due for delivery for more than ' || v_stuck_mins
        || ' minutes. The queue worker is not draining them.',
      jsonb_build_object('pendingOverdue', v_stuck, 'oldestQueuedAt', v_oldest, 'thresholdMinutes', v_stuck_mins),
      'database', 'queue'
    );
    v_raised := v_raised + 1;
  END IF;

  -- (b) Growing faster than it drains.
  SELECT COUNT(*) INTO v_backlog FROM public.email_queue WHERE status = 'Pending';
  IF COALESCE(v_backlog, 0) > v_backlog_max THEN
    PERFORM public.raise_sos_alert(
      'EMAIL_QUEUE_BACKLOG', 'email_delivery', 'high',
      'Email queue backlog above the safe threshold',
      v_backlog || ' messages are waiting, above the configured ceiling of ' || v_backlog_max || '.',
      jsonb_build_object('pending', v_backlog, 'threshold', v_backlog_max),
      'database', 'queue'
    );
    v_raised := v_raised + 1;
  END IF;

  -- (c) Rows a crashed worker left claimed.
  SELECT COUNT(*) INTO v_stale
    FROM public.email_queue
   WHERE status = 'Processing'
     AND processed_at < NOW() - (v_stale_mins || ' minutes')::INTERVAL;

  IF COALESCE(v_stale, 0) > 0 THEN
    PERFORM public.raise_sos_alert(
      'EMAIL_QUEUE_STALE_PROCESSING', 'email_delivery', 'high',
      'Queue rows stranded in Processing',
      v_stale || ' message(s) have been claimed by a worker for more than ' || v_stale_mins
        || ' minutes without finishing.',
      jsonb_build_object('stale', v_stale, 'thresholdMinutes', v_stale_mins),
      'database', 'queue'
    );
    v_raised := v_raised + 1;
  END IF;

  -- (d) Abandoned sends in the recent past, as a count rather than one each.
  SELECT COUNT(*) INTO v_failed
    FROM public.email_queue
   WHERE status = 'Failed'
     AND processed_at > NOW() - (v_failed_mins || ' minutes')::INTERVAL;

  IF COALESCE(v_failed, 0) > 3 THEN
    PERFORM public.raise_sos_alert(
      'EMAIL_SEND_PERMANENT_FAILURE', 'email_delivery', 'high',
      'A queued email was abandoned after its final attempt',
      v_failed || ' messages were abandoned in the last ' || v_failed_mins
        || ' minutes. This is a transport problem, not one bad address.',
      jsonb_build_object('failed', v_failed, 'lookbackMinutes', v_failed_mins),
      'database', 'sweep'
    );
    v_raised := v_raised + 1;
  END IF;

  -- (e) Both SMTP accounts spent for the day.
  SELECT COALESCE((value ->> 'perAccountQuota')::INTEGER, 2000) INTO v_quota
    FROM public.email_routing_settings WHERE key = 'quota_settings';
  v_quota := COALESCE(v_quota, 2000);

  SELECT
    COUNT(*) FILTER (WHERE smtp_slot = 'smtp'),
    COUNT(*) FILTER (WHERE smtp_slot = 'smtp2')
    INTO v_usage_a, v_usage_b
    FROM public.email_queue
   WHERE sent_at >= public.sos_ist_day_start();

  IF COALESCE(v_usage_a, 0) >= v_quota AND COALESCE(v_usage_b, 0) >= v_quota THEN
    PERFORM public.raise_sos_alert(
      'SMTP_QUOTA_EXHAUSTED', 'email_transport', 'critical',
      'Both SMTP accounts have spent their daily quota',
      'Account A has sent ' || v_usage_a || ' and Account B ' || v_usage_b || ' against a cap of '
        || v_quota || ' each. Nothing can go out until the quota rolls over at IST midnight.',
      jsonb_build_object('accountA', v_usage_a, 'accountB', v_usage_b, 'perAccountQuota', v_quota),
      'database', 'quota'
    );
    v_raised := v_raised + 1;
  END IF;

  -- (f) The overnight closure sweep. Its absence is invisible by definition:
  --     nothing fails, requests simply never close.
  IF to_regproc('public.scan_auto_close_trips') IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_last_close
      FROM public.ticket_status_history
     WHERE to_status = 'Closed'
       AND COALESCE(actor_role, '') = 'System'
       AND COALESCE(reason, '') ILIKE '%travel date passed%';

    IF v_last_close IS NOT NULL
       AND v_last_close < NOW() - (v_close_hours || ' hours')::INTERVAL THEN
      PERFORM public.raise_sos_alert(
        'AUTO_CLOSE_SWEEP_STALLED', 'scheduler', 'high',
        'Overnight auto-close sweep has not run',
        'The last auto-close was ' || to_char(v_last_close, 'YYYY-MM-DD HH24:MI')
          || ' UTC, more than ' || v_close_hours || ' hours ago.',
        jsonb_build_object('lastAutoCloseAt', v_last_close, 'maxAgeHours', v_close_hours),
        'database', 'auto-close'
      );
      v_raised := v_raised + 1;
    END IF;
  END IF;

  -- (g) The scheduler itself. Only readable where pg_cron is installed.
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-close-trips') THEN
      PERFORM public.raise_sos_alert(
        'CRON_JOB_MISSING', 'scheduler', 'high',
        'An expected scheduled job is not registered',
        'The auto-close-trips job is not registered with pg_cron, so completed trips are never closed.',
        jsonb_build_object('job', 'auto-close-trips'),
        'database', 'auto-close-trips'
      );
      v_raised := v_raised + 1;
    END IF;

    IF to_regclass('cron.job_run_details') IS NOT NULL THEN
      FOR v_job IN
        SELECT j.jobname, COUNT(*) AS failures, MAX(d.end_time) AS last_failure,
               MAX(d.return_message) AS last_message
          FROM cron.job_run_details d
          JOIN cron.job j ON j.jobid = d.jobid
         WHERE d.status = 'failed'
           AND d.end_time > NOW() - INTERVAL '70 minutes'
         GROUP BY j.jobname
      LOOP
        PERFORM public.raise_sos_alert(
          'CRON_JOB_FAILED', 'scheduler', 'critical',
          'A scheduled database job failed',
          'Job "' || v_job.jobname || '" failed ' || v_job.failures || ' time(s) in the last hour: '
            || COALESCE(left(v_job.last_message, 300), 'no message'),
          jsonb_build_object('job', v_job.jobname, 'failures', v_job.failures,
                             'lastFailureAt', v_job.last_failure),
          'database', v_job.jobname
        );
        v_raised := v_raised + 1;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ranAt', NOW(),
    'alertsRaised', v_raised,
    'pendingOverdue', COALESCE(v_stuck, 0),
    'pending', COALESCE(v_backlog, 0),
    'staleProcessing', COALESCE(v_stale, 0),
    'recentFailures', COALESCE(v_failed, 0)
  );
END;
$scan_sos_health$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.scan_sos_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_sos_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.scan_sos_health() TO authenticated;

-- 8. Schedule the sweep --------------------------------------------------------
-- Guarded on pg_cron the same way the auto-close sweep is: if the extension is
-- off, this says so and does nothing rather than failing the migration. Run at
-- :17 so it does not land in the same minute as every other hourly job.

DO $schedule_sos_sweep$
BEGIN
  IF to_regproc('cron.schedule') IS NULL THEN
    RAISE NOTICE 'pg_cron is not enabled, so the SOS health sweep was NOT scheduled. Enable it under Database > Extensions and re-run this migration.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sos-health-sweep') THEN
    PERFORM cron.unschedule('sos-health-sweep');
  END IF;

  PERFORM cron.schedule('sos-health-sweep', '17 * * * *', 'SELECT public.scan_sos_health();');

  RAISE NOTICE 'SOS health sweep scheduled: hourly at :17.';
END;
$schedule_sos_sweep$;

-- 9. Housekeeping --------------------------------------------------------------
-- Alerts are operational history, not records to keep forever. Resolved ones
-- older than 90 days are dropped; open ones are kept whatever their age,
-- because an alert nobody has looked at is the one that still matters.

CREATE OR REPLACE FUNCTION public.purge_sos_alerts(p_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $purge_sos_alerts$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.sos_alerts
   WHERE status = 'Resolved'
     AND COALESCE(resolved_at, created_at) < NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$purge_sos_alerts$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.purge_sos_alerts(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_sos_alerts(INTEGER) TO service_role;
