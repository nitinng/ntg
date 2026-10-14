-- Make one SOS card visibly end before the next one starts
--
-- Slack groups consecutive messages from the same app under a single timestamp
-- and no avatar repeat, so two alerts in a row read as one long message. The
-- SOS card opened with a bold section line, which is only slightly heavier than
-- the body text around it and does not break that run.
--
-- Two changes, both of them things Slack actually honours:
--
--  1. The title becomes a header block. Headers render at a noticeably larger
--     size and weight, giving each card an unmistakable starting line. This is
--     what the desk notification card already did -- the SOS card was the odd
--     one out. Header text is plain_text and capped at 150 characters by the
--     API, so it is clamped rather than risking a rejected payload.
--
--  2. Severity colours split. 'warning' and 'info' both resolved to the same
--     grey, so the bar whose whole job is signalling severity carried no
--     information for half the levels. Warning is now amber, info blue;
--     critical and high keep their existing red and orange.
--
-- No layout beyond this is available: Slack exposes no background colour,
-- border, padding or corner radius to a message, so the panelled look of the
-- preview gallery cannot be reproduced through the API.

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
  v_sevword    TEXT;
  v_header     TEXT;
BEGIN
  -- warning and info both rendered as the same grey, so the one bar meant to
  -- tell severities apart at a glance told you nothing for two of the four.
  v_color := CASE v_sev
               WHEN 'critical' THEN '#E24B4A'
               WHEN 'high'     THEN '#EF9F27'
               WHEN 'warning'  THEN '#ECB22E'
               ELSE                 '#2F80ED' END;
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

  -- A header block renders larger and heavier than bold section text. That is
  -- what separates one card from the next: Slack stacks consecutive messages
  -- from the same app under a single timestamp, so without a strong opening
  -- line two alerts read as one long message. Header text is plain_text and
  -- the API rejects anything over 150 characters, hence the clamp.
  v_sevword := CASE v_sev
                 WHEN 'critical' THEN 'Critical'
                 WHEN 'high'     THEN 'Error'
                 WHEN 'warning'  THEN 'Warning'
                 ELSE                 'Info' END;
  v_header := v_icon || '  ' || v_sevword || ' — ' || v_title;
  IF length(v_header) > 150 THEN v_header := left(v_header, 147) || '...'; END IF;

  v_blocks := jsonb_build_array(
    jsonb_build_object('type', 'header',
      'text', jsonb_build_object('type', 'plain_text', 'text', v_header, 'emoji', TRUE)),
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

NOTIFY pgrst, 'reload schema';
