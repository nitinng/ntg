-- =============================================================================
-- Migration: 20261014010300_slack_payload_by_webhook_type.sql
--
-- Why: Slack Workflow Builder webhooks (hooks.slack.com/triggers/...) insert
-- variables as LITERAL text — mrkdwn (*bold*, `code`, <url|label>) is printed
-- raw, and attachments / colour bars / buttons are ignored entirely. Only a
-- Slack App incoming webhook (hooks.slack.com/services/...) renders Block Kit.
--
-- So the payload is now shaped per destination inside sos_dispatch_webhook():
--   * /services/ (Slack App)  -> Block Kit card in a coloured attachment,
--                                 4-field grid, 3-line trace, Acknowledge/View logs.
--   * /triggers/ (Workflow)   -> clean plain text with no markup characters,
--                                 plus every field as its own string variable.
-- =============================================================================

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
      jsonb_build_object('type', 'mrkdwn', 'text', E'*Environment*\nproduction'),
      jsonb_build_object('type', 'mrkdwn', 'text', E'*Occurrences*\n'  || v_occ),
      jsonb_build_object('type', 'mrkdwn', 'text', E'*Impact*\n'       || v_impact))),
    jsonb_build_object('type', 'section',
      'text', jsonb_build_object('type', 'mrkdwn', 'text', '```' || v_snippet || '```')),
    jsonb_build_object('type', 'actions', 'block_id', 'sos_actions', 'elements', v_actions),
    jsonb_build_object('type', 'context', 'elements', jsonb_build_array(
      jsonb_build_object('type', 'mrkdwn', 'text', '`' || p_code || '` · Travel Desk SOS')))
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

-- Shapes any payload for the kind of webhook it is going to.
CREATE OR REPLACE FUNCTION public.sos_dispatch_webhook(p_url TEXT, p_payload JSONB)
RETURNS BOOLEAN AS $sos_dispatch_webhook$
DECLARE
  v_body JSONB;
BEGIN
  IF COALESCE(btrim(p_url), '') = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    RETURN FALSE;
  END IF;

  IF p_url ILIKE '%hooks.slack.com/triggers/%' OR p_url ILIKE '%hooks.slack.com/workflows/%' THEN
    -- Workflow Builder: string variables only; {text} becomes the clean plain-text card.
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
      INTO v_body
      FROM jsonb_each(p_payload)
     WHERE jsonb_typeof(value) = 'string' AND key <> 'plain_text';
    v_body := v_body || jsonb_build_object('text', COALESCE(p_payload ->> 'plain_text', p_payload ->> 'text', ''));
  ELSE
    -- Slack App incoming webhook: only the keys Slack understands. Top-level
    -- blocks are dropped when an attachment carries them, or the card renders twice.
    v_body := jsonb_strip_nulls(jsonb_build_object(
      'text',         p_payload -> 'text',
      'attachments',  p_payload -> 'attachments',
      'blocks',       CASE WHEN p_payload ? 'attachments' THEN NULL ELSE p_payload -> 'blocks' END,
      'unfurl_links', FALSE,
      'unfurl_media', FALSE
    ));
  END IF;

  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
    USING p_url, v_body, '{"Content-Type": "application/json"}'::jsonb;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SOS webhook post failed, falling back to email: %', SQLERRM;
  RETURN FALSE;
END;
$sos_dispatch_webhook$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
