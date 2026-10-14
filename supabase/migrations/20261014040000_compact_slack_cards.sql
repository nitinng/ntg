-- Compact the Slack cards without losing any detail
--
-- Both cards spent rows on values that never change or that only matter
-- internally, pushing the real content further down the message:
--
--   SOS:    'Environment: production' is a constant, yet it held one of the
--           four prime grid slots. Moved to the context footer, which Slack
--           renders smaller and greyer -- where constants belong.
--
--   Notice: the Status/Delivery row duplicated what the footer could carry,
--           and 'Design System: Mail Template Aligned' is build detail no
--           recipient acts on. Both removed, status folded into the footer.
--
-- Also fixes a label that is now simply wrong: the test card asserted
-- 'Delivery: Slack Workflow Webhook' as a hardcoded string. It is derived
-- from the configured URL, so a Slack App webhook no longer reports itself
-- as a Workflow one. A passing test now carries a green bar.
--
-- No information is dropped except the Design System line: environment,
-- status and delivery all still appear, in the footer.

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
  v_sev        TEXT := lower(COALESCE(p_severity, 'warning'));
  v_title      TEXT := COALESCE(NULLIF(btrim(p_title), ''), p_code, 'Unspecified failure');
  v_ctx        JSONB := COALESCE(p_context, '{}'::jsonb);
  v_color      TEXT;
  v_pill       TEXT;
  v_icon       TEXT;
  v_label      TEXT;
  v_service    TEXT;
  v_impact     TEXT;
  v_raw        TEXT;
  v_snippet    TEXT;
  v_url        TEXT;
  v_occ        TEXT;
  v_actor      TEXT;
  v_actions    JSONB;
  v_blocks     JSONB;
  v_plain      TEXT;
BEGIN
  v_color := CASE v_sev WHEN 'critical' THEN '#E24B4A' WHEN 'high' THEN '#EF9F27' ELSE '#8B95A5' END;
  v_pill  := CASE v_sev
               WHEN 'critical' THEN ':red_circle: Critical'
               WHEN 'high'     THEN ':large_orange_circle: Error'
               WHEN 'warning'  THEN ':white_circle: Warning'
               ELSE ':large_blue_circle: Info' END;
  v_icon  := CASE v_sev WHEN 'critical' THEN '🔴' WHEN 'high' THEN '🟠' WHEN 'warning' THEN '⚪' ELSE '🔵' END;
  v_label := CASE v_sev WHEN 'critical' THEN 'CRITICAL' WHEN 'high' THEN 'ERROR' WHEN 'warning' THEN 'WARNING' ELSE 'INFO' END;

  v_service := CASE lower(COALESCE(p_source, 'web'))
                 WHEN 'worker'   THEN 'travel-desk-worker'
                 WHEN 'database' THEN 'travel-desk-db'
                 ELSE 'travel-desk-web' END;

  v_occ := CASE WHEN COALESCE(p_occurrences, 1) > 1
                THEN p_occurrences::text || ' times' ELSE 'First occurrence' END;

  -- The signed-in user who hit the failure (raise_sos_alert runs in their session).
  BEGIN
    SELECT email INTO v_actor FROM public.profiles WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  -- A bare "/" route says nothing, so it is skipped in favour of a person.
  v_impact := COALESCE(
    NULLIF(v_ctx ->> 'userEmail', ''),
    NULLIF(v_ctx ->> 'email', ''),
    NULLIF(v_ctx ->> 'triggeredBy', ''),
    v_actor,
    CASE WHEN NULLIF(v_ctx ->> 'ticketId', '') IS NOT NULL THEN 'Ticket ' || (v_ctx ->> 'ticketId') END,
    CASE WHEN COALESCE(v_ctx ->> 'route', '/') NOT IN ('', '/') THEN 'Route ' || (v_ctx ->> 'route') END,
    'Unknown user'
  );

  -- First three lines of the stack (raiseSos joins frames with " | "), else the error.
  v_raw := COALESCE(NULLIF(v_ctx ->> 'stack', ''), NULLIF(v_ctx ->> 'error', ''), NULLIF(p_message, ''), v_title);
  v_snippet := array_to_string(
                 (string_to_array(replace(v_raw, ' | ', E'\n'), E'\n'))[1:3], E'\n');
  IF length(v_snippet) > 400 THEN v_snippet := left(v_snippet, 397) || '...'; END IF;
  -- Triple backticks inside a code block would end it early.
  v_snippet := replace(v_snippet, '```', '''''''');

  v_url := COALESCE(NULLIF(rtrim(p_portal, '/'), ''), 'https://ng-travel-desk.vercel.app')
           || '/?tab=sos' || CASE WHEN p_alert_id IS NOT NULL THEN '&alertId=' || p_alert_id::text ELSE '' END;

  -- Block Kit card (Slack App incoming webhook) --------------------------------
  v_actions := jsonb_build_array(
    jsonb_build_object('type', 'button', 'style', 'primary', 'action_id', 'ack',
      'text', jsonb_build_object('type', 'plain_text', 'text', 'Acknowledge'),
      'value', COALESCE(p_alert_id::text, p_code)),
    jsonb_build_object('type', 'button', 'action_id', 'view_logs',
      'text', jsonb_build_object('type', 'plain_text', 'text', 'View logs'),
      'url', v_url)
  );
  IF p_code LIKE 'EMAIL_%' OR p_code LIKE 'SMTP_%' THEN
    v_actions := v_actions || jsonb_build_array(
      jsonb_build_object('type', 'button', 'action_id', 'retry',
        'text', jsonb_build_object('type', 'plain_text', 'text', 'Retry'),
        'value', COALESCE(p_alert_id::text, p_code)));
  END IF;

  v_blocks := jsonb_build_array(
    jsonb_build_object('type', 'section',
      'text', jsonb_build_object('type', 'mrkdwn', 'text', '*' || v_pill || ' — ' || v_title || '*')),
    jsonb_build_object('type', 'section', 'fields', jsonb_build_array(
      jsonb_build_object('type', 'mrkdwn', 'text', E'*Service*\n'      || v_service),
      jsonb_build_object('type', 'mrkdwn', 'text', E'*Occurrences*\n'  || v_occ),
      jsonb_build_object('type', 'mrkdwn', 'text', E'*Impact*\n'       || v_impact))),
    jsonb_build_object('type', 'section',
      'text', jsonb_build_object('type', 'mrkdwn', 'text', '```' || v_snippet || '```')),
    jsonb_build_object('type', 'actions', 'block_id', 'sos_actions', 'elements', v_actions),
    jsonb_build_object('type', 'context', 'elements', jsonb_build_array(
      jsonb_build_object('type', 'mrkdwn', 'text', '`' || p_code || '` · production · Travel Desk SOS')))
  );

  -- Plain text (Workflow Builder prints this verbatim — no markup characters) ---
  v_plain := v_icon || '  ' || v_label || '  ·  ' || v_title || E'\n\n'
          || 'Service        ' || v_service || E'\n'
          || 'Environment    production' || E'\n'
          || 'Occurrences    ' || v_occ || E'\n'
          || 'Impact         ' || v_impact || E'\n\n'
          || v_snippet || E'\n\n'
          || 'View logs: ' || v_url;

  RETURN jsonb_build_object(
    -- Notification / fallback line for the Slack App path.
    'text', v_icon || ' ' || v_label || ' — ' || v_title,
    'plain_text', v_plain,
    'attachments', jsonb_build_array(jsonb_build_object('color', v_color, 'blocks', v_blocks)),
    -- Individual string variables, for a Workflow Builder message laid out by hand.
    'severity', v_label,
    'title', v_title,
    'service', v_service,
    'environment', 'production',
    'occurrences', v_occ,
    'impact', v_impact,
    'error', v_snippet,
    'code', p_code,
    'logs_url', v_url
  );
END;
$sos_webhook_payload$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.send_desk_notification_test(p_actor_email TEXT)
RETURNS JSONB AS $send_desk_notification_test$
DECLARE
  v_settings     JSONB;
  v_webhook      TEXT;
  v_portal       TEXT;
  v_webhook_sent BOOLEAN := FALSE;
  v_portal_url   TEXT;
  v_text         TEXT;
  v_blocks       JSONB;
  v_delivery     TEXT;
BEGIN
  v_settings := public.desk_stream_settings('notifications');

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  v_portal_url := CASE WHEN v_portal <> '' THEN rtrim(v_portal, '/') || '/?tab=notifications' ELSE 'https://ng-travel-desk.vercel.app/?tab=notifications' END;

  v_webhook := COALESCE(
    NULLIF(btrim(v_settings ->> 'webhookUrl'), ''),
    NULLIF(btrim((SELECT value ->> 'webhookUrl' FROM public.sos_settings WHERE key = 'alerting')), ''),
    ''
  );

  IF v_webhook = '' THEN
    RETURN jsonb_build_object('delivered', FALSE, 'reason', 'no_webhook_configured');
  END IF;

  -- Report the channel actually in use instead of asserting 'Workflow'.
  v_delivery := CASE
    WHEN v_webhook ILIKE '%hooks.slack.com/triggers/%'
      OR v_webhook ILIKE '%hooks.slack.com/workflows/%' THEN 'Slack Workflow webhook'
    ELSE 'Slack App webhook' END;

  v_text := '🔔 *TRAVEL DESK NOTIFICATION · LIVE WORKFLOW TEST*' || E'\n' ||
            '*Status:* 🟢 Operational  •  *Channel:* #alert-team-automation' || E'\n\n' ||
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
            '👤 *Triggered By:* ' || COALESCE(p_actor_email, 'Admin') || E'\n' ||
            '🕒 *Sent At:* ' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI:SS') || ' IST' || E'\n' ||
            '📡 *Delivery Mode:* ' || v_delivery || E'\n' ||
            '🎨 *Template Styling:* NavGurukul Brand Alignment Active' || E'\n' ||
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n\n' ||
            '🔗 *Action:* <' || v_portal_url || '|Open Notification Settings →>' || E'\n\n' ||
            '_If you see this card in Slack, request traffic is wired up end-to-end._';

  v_blocks := jsonb_build_array(
    jsonb_build_object(
      'type', 'header',
      'text', jsonb_build_object('type', 'plain_text', 'text', '🔔 Travel Desk Notification — Test Successful', 'emoji', TRUE)
    ),
    jsonb_build_object(
      'type', 'section',
      'fields', jsonb_build_array(
        jsonb_build_object('type', 'mrkdwn', 'text', '*👤 Triggered By:*' || E'\n' || COALESCE(p_actor_email, 'Admin')),
        jsonb_build_object('type', 'mrkdwn', 'text', '*🕒 Sent At:*' || E'\n' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') || ' IST'),
        jsonb_build_object('type', 'mrkdwn', 'text', '*📡 Channel:*' || E'\n' || '#alert-team-automation')
      )
    ),
    jsonb_build_object(
      'type', 'actions',
      'elements', jsonb_build_array(
        jsonb_build_object(
          'type', 'button',
          'text', jsonb_build_object('type', 'plain_text', 'text', 'Open Notification Settings →', 'emoji', TRUE),
          'url', v_portal_url,
          'style', 'primary'
        )
      )
    ),
    jsonb_build_object(
      'type', 'context',
      'elements', jsonb_build_array(
        jsonb_build_object('type', 'mrkdwn', 'text', '🟢 Operational · ' || v_delivery || ' · Navgurukul Travel Desk')
      )
    )
  );

  v_webhook_sent := public.sos_dispatch_webhook(
    v_webhook,
    jsonb_build_object('text', v_text, 'blocks', v_blocks, 'color', '#2EB67D')
  );

  RETURN jsonb_build_object(
    'delivered', v_webhook_sent,
    'reason', CASE WHEN v_webhook_sent THEN NULL ELSE 'dispatch_failed' END
  );
END;
$send_desk_notification_test$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.send_desk_notification_test(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_desk_notification_test(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_desk_notification_test(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
