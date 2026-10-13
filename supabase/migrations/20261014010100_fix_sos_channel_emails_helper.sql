-- =============================================================================
-- Migration: 20261014010100_fix_sos_channel_emails_helper.sql
-- Description:
-- 1. Adds public.desk_json_text_array(jsonb) utility helper.
-- 2. Updates public.raise_sos_alert to use public.desk_channel_emails('alerting')
--    and desk_stream_settings('alerting').
-- 3. Notifies PostgREST to reload its schema cache.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.desk_json_text_array(p_val JSONB)
RETURNS TEXT[] AS $$
  SELECT COALESCE(
    array_agg(DISTINCT lower(btrim(addr))) FILTER (WHERE btrim(addr) <> ''),
    ARRAY[]::TEXT[]
  )
  FROM jsonb_array_elements_text(
    CASE jsonb_typeof(p_val)
      WHEN 'array'  THEN p_val
      WHEN 'string' THEN jsonb_build_array(p_val)
      ELSE '[]'::jsonb
    END
  ) AS a(addr);
$$ LANGUAGE sql IMMUTABLE;

-- Update raise_sos_alert with robust channel email handling
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
  v_portal        TEXT;
  v_webhook_sent  BOOLEAN := FALSE;
  v_sent_today    INTEGER;
  v_cap           INTEGER;
  v_actor_email   TEXT;
  v_actor_recent  INTEGER;
  v_queue_id      UUID;
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

  -- Dispatch to Slack webhook if configured
  v_webhook_sent := public.sos_dispatch_webhook(
    v_webhook,
    public.sos_webhook_payload(p_code, v_severity, v_title, v_message, v_source, p_context, 1, v_portal, v_alert_id)
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

  -- Fall back to channel email address
  IF array_length(v_channel, 1) IS NULL THEN
    UPDATE public.sos_alerts
       SET notification_status = 'Failed',
           notification_reason = 'webhook unavailable and no channel address configured'
     WHERE id = v_alert_id;

    RETURN QUERY SELECT v_alert_id, FALSE, 'notification_failed'::TEXT, 1;
    RETURN;
  END IF;

  BEGIN
    PERFORM set_config('app.sos_dispatch', 'on', TRUE);

    INSERT INTO public.email_queue (
      ticket_id, to_status, event, audience, recipients, subject, body,
      status, retry_count, attempt_count, available_at, idempotency_key
    ) VALUES (
      NULL, 'SOS', 'sos_alert', 'ops',
      v_channel,
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

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
