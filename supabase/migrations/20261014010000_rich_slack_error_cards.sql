-- =============================================================================
-- Migration: 20261014010000_rich_slack_error_cards.sql
-- Description:
-- 1. Updates public.sos_webhook_payload to output structured Slack Block Kit
--    cards inside a legacy attachments wrapper for the colored sidebar:
--      - #E24B4A for Critical
--      - #EF9F27 for High / Error
--      - #64748B for Warning / Info
--    Includes severity pill, 4-field triage grid (Service, Environment, Occurrences, Impact),
--    truncated 2-3 line code block for the error/stack, and action buttons:
--    Acknowledge (action_id: ack) and View logs.
-- 2. Updates public.raise_sos_alert to forward context, occurrences, portal URL,
--    and alert ID to public.sos_webhook_payload.
-- 3. Updates public.desk_request_webhook_payload to include the legacy attachments
--    wrapper with #176AE6 blue border for rich card presentation in Slack.
-- 4. Creates public.acknowledge_sos_from_slack RPC function for Slack interactivity.
-- =============================================================================

-- 1. Rich Slack Block Kit payload function with colored attachments sidebar
CREATE OR REPLACE FUNCTION public.sos_webhook_payload(
  p_code        TEXT,
  p_severity    TEXT,
  p_title       TEXT,
  p_message     TEXT,
  p_source      TEXT,
  p_context     JSONB DEFAULT '{}'::jsonb,
  p_occurrences INT DEFAULT 1,
  p_portal      TEXT DEFAULT NULL,
  p_alert_id    UUID DEFAULT NULL
)
RETURNS JSONB AS $sos_webhook_payload$
DECLARE
  v_sev         TEXT;
  v_color       TEXT;
  v_pill        TEXT;
  v_service     TEXT;
  v_impact      TEXT;
  v_snippet     TEXT;
  v_portal_url  TEXT;
  v_occ_label   TEXT;
  v_top_text    TEXT;
  v_actions     JSONB;
  v_blocks      JSONB;
BEGIN
  v_sev := lower(COALESCE(p_severity, 'warning'));

  -- Sidebar colors: #E24B4A for critical, #EF9F27 for high/error, #64748B for warning
  v_color := CASE v_sev
    WHEN 'critical' THEN '#E24B4A'
    WHEN 'high'     THEN '#EF9F27'
    WHEN 'warning'  THEN '#64748B'
    ELSE '#3B82F6'
  END;

  -- Severity pill
  v_pill := CASE v_sev
    WHEN 'critical' THEN ':red_circle: Critical'
    WHEN 'high'     THEN ':large_orange_circle: Error'
    WHEN 'warning'  THEN ':warning: Warning'
    ELSE ':information_source: Info'
  END;

  -- Service name
  v_service := CASE lower(COALESCE(p_source, 'web'))
    WHEN 'worker'   THEN 'travel-desk-worker'
    WHEN 'database' THEN 'travel-desk-db'
    ELSE 'travel-desk-web'
  END;

  -- Occurrences string
  v_occ_label := CASE
    WHEN COALESCE(p_occurrences, 1) > 1 THEN p_occurrences::text || ' in recent window'
    ELSE '1 occurrence'
  END;

  -- Impact / affected user or route
  v_impact := COALESCE(
    NULLIF(p_context ->> 'userEmail', ''),
    NULLIF(p_context ->> 'email', ''),
    CASE WHEN NULLIF(p_context ->> 'ticketId', '') IS NOT NULL THEN 'Ticket ' || (p_context ->> 'ticketId') ELSE NULL END,
    NULLIF(p_context ->> 'route', ''),
    'Single user session'
  );

  -- Clean 2-3 lines of error or stack trace
  v_snippet := COALESCE(
    NULLIF(p_context ->> 'stack', ''),
    NULLIF(p_context ->> 'error', ''),
    p_message,
    p_code || ': ' || COALESCE(p_title, 'Unexpected error')
  );
  IF length(v_snippet) > 300 THEN
    v_snippet := left(v_snippet, 297) || '...';
  END IF;

  -- Portal URL
  v_portal_url := COALESCE(NULLIF(rtrim(p_portal, '/'), ''), 'https://ng-travel-desk.vercel.app')
    || '/?tab=sos'
    || CASE WHEN p_alert_id IS NOT NULL THEN '&alertId=' || p_alert_id::text ELSE '' END;

  -- Top-level fallback text (used by Slack Workflow Builder and push notifications)
  v_top_text := CASE v_sev
    WHEN 'critical' THEN '🚨 [CRITICAL] '
    WHEN 'high'     THEN '🔴 [HIGH] '
    WHEN 'warning'  THEN '🟠 [WARNING] '
    ELSE '🔵 [INFO] '
  END || 'Travel Desk SOS — ' || COALESCE(p_title, p_code) ||
  CASE WHEN COALESCE(p_occurrences, 1) > 1 THEN ' (×' || p_occurrences::text || ')' ELSE '' END;

  -- Action buttons: Acknowledge & View logs
  v_actions := jsonb_build_array(
    jsonb_build_object(
      'type', 'button',
      'text', jsonb_build_object('type', 'plain_text', 'text', 'Acknowledge', 'emoji', TRUE),
      'style', 'primary',
      'action_id', 'ack',
      'value', COALESCE(p_alert_id::text, p_code)
    ),
    jsonb_build_object(
      'type', 'button',
      'text', jsonb_build_object('type', 'plain_text', 'text', 'View logs', 'emoji', TRUE),
      'url', v_portal_url
    )
  );

  -- Retry button for retryable worker/queue errors
  IF p_code LIKE 'EMAIL_%' OR p_code LIKE 'SMTP_%' OR p_code = 'AUTO_ADVANCE_FAILED' THEN
    v_actions := v_actions || jsonb_build_array(
      jsonb_build_object(
        'type', 'button',
        'text', jsonb_build_object('type', 'plain_text', 'text', 'Retry job', 'emoji', TRUE),
        'action_id', 'retry',
        'value', COALESCE(p_alert_id::text, p_code)
      )
    );
  END IF;

  v_blocks := jsonb_build_array(
    jsonb_build_object(
      'type', 'section',
      'text', jsonb_build_object(
        'type', 'mrkdwn',
        'text', '*' || v_pill || ' — ' || COALESCE(p_title, p_code) || '*'
      )
    ),
    jsonb_build_object(
      'type', 'section',
      'fields', jsonb_build_array(
        jsonb_build_object('type', 'mrkdwn', 'text', '*Service*' || E'\n' || v_service),
        jsonb_build_object('type', 'mrkdwn', 'text', '*Environment*' || E'\nproduction'),
        jsonb_build_object('type', 'mrkdwn', 'text', '*Occurrences*' || E'\n' || v_occ_label),
        jsonb_build_object('type', 'mrkdwn', 'text', '*Impact*' || E'\n' || v_impact)
      )
    ),
    jsonb_build_object(
      'type', 'section',
      'text', jsonb_build_object(
        'type', 'mrkdwn',
        'text', '```' || v_snippet || '```'
      )
    ),
    jsonb_build_object(
      'type', 'actions',
      'elements', v_actions
    )
  );

  RETURN jsonb_build_object(
    'text', v_top_text,
    'attachments', jsonb_build_array(
      jsonb_build_object(
        'color', v_color,
        'blocks', v_blocks
      )
    )
  );
END;
$sos_webhook_payload$ LANGUAGE plpgsql IMMUTABLE;

-- 5-argument backwards-compatibility overload
CREATE OR REPLACE FUNCTION public.sos_webhook_payload(
  p_code TEXT, p_severity TEXT, p_title TEXT, p_message TEXT, p_source TEXT
)
RETURNS JSONB AS $$
  SELECT public.sos_webhook_payload(p_code, p_severity, p_title, p_message, p_source, '{}'::jsonb, 1, NULL, NULL);
$$ LANGUAGE sql IMMUTABLE;

-- 2. Update raise_sos_alert to dispatch the rich Block Kit payload
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

  SELECT value INTO v_settings FROM public.sos_settings WHERE key = 'alerting';
  v_settings := COALESCE(v_settings, '{}'::jsonb);
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

-- 3. Update desk_request_webhook_payload with #176AE6 blue border attachments wrapper
CREATE OR REPLACE FUNCTION public.desk_request_webhook_payload(
  p_request public.travel_requests,
  p_portal  TEXT
)
RETURNS JSONB AS $desk_request_webhook_payload$
DECLARE
  v_ticket       TEXT;
  v_status       TEXT;
  v_trip         TEXT;
  v_date         TEXT;
  v_who          TEXT;
  v_dept         TEXT;
  v_mode         TEXT;
  v_priority     TEXT;
  v_manager      TEXT;
  v_portal_url   TEXT;
  v_prio_label   TEXT;
  v_text         TEXT;
  v_blocks       JSONB;
BEGIN
  v_ticket     := COALESCE(p_request.submission_id, left(p_request.id::text, 8));
  v_status     := COALESCE(p_request.pnc_status, 'Not Started');
  v_trip       := COALESCE(p_request.from_location, '?') || ' ➔ ' || COALESCE(p_request.to_location, '?');
  v_date       := COALESCE(to_char(p_request.date_of_travel, 'DD Mon YYYY'), 'Not specified');
  v_who        := COALESCE(p_request.requester_name, p_request.requester_email, 'Unknown');
  v_dept       := COALESCE(NULLIF(p_request.requester_department, ''), 'General')
                  || CASE WHEN COALESCE(p_request.requester_campus, '') <> '' THEN ' (' || p_request.requester_campus || ')' ELSE '' END;
  v_mode       := COALESCE(NULLIF(p_request.travel_mode, ''), 'Travel')
                  || CASE WHEN COALESCE(p_request.trip_type, '') <> '' THEN ' · ' || p_request.trip_type ELSE '' END
                  || CASE WHEN COALESCE(p_request.number_of_travelers, 1) > 1 THEN ' (' || p_request.number_of_travelers || ' travelers)' ELSE '' END;
  v_priority   := COALESCE(NULLIF(p_request.priority, ''), 'Normal');
  v_manager    := COALESCE(NULLIF(p_request.approving_manager_email, ''), 'None');
  v_portal_url := CASE WHEN COALESCE(p_portal, '') <> '' THEN rtrim(p_portal, '/') || '/?tab=requests' ELSE 'https://ng-travel-desk.vercel.app/?tab=requests' END;

  v_prio_label := CASE lower(v_priority)
                    WHEN 'high'   THEN '🔴 High'
                    WHEN 'urgent' THEN '🚨 Urgent'
                    ELSE '⚡ ' || v_priority
                  END;

  v_text := '✈️ *TRAVEL DESK NOTIFICATION · NEW REQUEST*' || E'\n' ||
            '*Request ID:* `' || v_ticket || '`  •  *Status:* 🟡 ' || v_status || E'\n\n' ||
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
            '👤 *Traveler:* ' || v_who || E'\n' ||
            '🏢 *Dept / Campus:* ' || v_dept || E'\n' ||
            '🛫 *Trip Route:* ' || v_trip || E'\n' ||
            '📅 *Travel Date:* ' || v_date || E'\n' ||
            '🎫 *Mode & Type:* ' || v_mode || E'\n' ||
            '⚡ *Priority:* ' || v_prio_label || E'\n' ||
            '👔 *Approving Manager:* ' || v_manager || E'\n' ||
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n\n' ||
            '🔗 *Action:* <' || v_portal_url || '|View in Travel Desk →>' || E'\n\n' ||
            '_Navgurukul Travel Desk • Automated Notification_';

  v_blocks := jsonb_build_array(
    jsonb_build_object(
      'type', 'header',
      'text', jsonb_build_object(
        'type', 'plain_text',
        'text', '✈️ New Travel Request — ' || v_ticket,
        'emoji', TRUE
      )
    ),
    jsonb_build_object(
      'type', 'section',
      'text', jsonb_build_object(
        'type', 'mrkdwn',
        'text', '*Status:* 🟡 *' || v_status || '*   |   *Priority:* *' || v_prio_label || '*'
      )
    ),
    jsonb_build_object('type', 'divider'),
    jsonb_build_object(
      'type', 'section',
      'fields', jsonb_build_array(
        jsonb_build_object('type', 'mrkdwn', 'text', '*👤 Traveler:*' || E'\n' || v_who),
        jsonb_build_object('type', 'mrkdwn', 'text', '*🏢 Dept / Campus:*' || E'\n' || v_dept),
        jsonb_build_object('type', 'mrkdwn', 'text', '*🛫 Trip Route:*' || E'\n' || v_trip),
        jsonb_build_object('type', 'mrkdwn', 'text', '*📅 Travel Date:*' || E'\n' || v_date),
        jsonb_build_object('type', 'mrkdwn', 'text', '*🎫 Mode & Type:*' || E'\n' || v_mode),
        jsonb_build_object('type', 'mrkdwn', 'text', '*👔 Approving Manager:*' || E'\n' || v_manager)
      )
    ),
    jsonb_build_object('type', 'divider'),
    jsonb_build_object(
      'type', 'actions',
      'elements', jsonb_build_array(
        jsonb_build_object(
          'type', 'button',
          'text', jsonb_build_object('type', 'plain_text', 'text', 'View in Travel Desk →', 'emoji', TRUE),
          'url', v_portal_url,
          'style', 'primary'
        )
      )
    ),
    jsonb_build_object(
      'type', 'context',
      'elements', jsonb_build_array(
        jsonb_build_object('type', 'mrkdwn', 'text', 'Navgurukul Travel Desk • Automated Notification')
      )
    )
  );

  RETURN jsonb_build_object(
    'text', v_text,
    'blocks', v_blocks,
    'attachments', jsonb_build_array(
      jsonb_build_object(
        'color', '#176AE6',
        'blocks', v_blocks
      )
    )
  );
END;
$desk_request_webhook_payload$ LANGUAGE plpgsql IMMUTABLE;

-- 4. RPC function for Slack Interactivity acknowledge endpoint
CREATE OR REPLACE FUNCTION public.acknowledge_sos_from_slack(
  p_alert_id   UUID,
  p_actor_name TEXT DEFAULT 'Slack User'
)
RETURNS JSONB AS $$
DECLARE
  v_title TEXT;
BEGIN
  UPDATE public.sos_alerts
     SET status = 'Acknowledged',
         acknowledged_by = COALESCE(NULLIF(btrim(p_actor_name), ''), 'Slack User'),
         acknowledged_at = NOW()
   WHERE id = p_alert_id
  RETURNING title INTO v_title;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Alert not found');
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'alertId', p_alert_id,
    'title', v_title,
    'status', 'Acknowledged',
    'acknowledgedBy', p_actor_name,
    'acknowledgedAt', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.acknowledge_sos_from_slack(UUID, TEXT) TO service_role;
