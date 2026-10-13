-- =============================================================================
-- Migration: 20261014010200_rich_sos_workflow_text_card.sql
-- Description:
-- Formats v_top_text inside public.sos_webhook_payload as a complete rich card
-- layout in mrkdwn so that Slack Workflow Builder (which outputs {text}) displays
-- the full card structure (severity pill, 4-field grid, code block, action link)
-- instead of a single line.
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

  -- Full card layout for top-level text (Slack Workflow Builder displays {text})
  v_top_text := '*' || v_pill || ' — ' || COALESCE(p_title, p_code) || '*' || E'\n' ||
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
                '*Service:* `' || v_service || '`   •   *Environment:* `production`' || E'\n' ||
                '*Occurrences:* `' || v_occ_label || '`   •   *Impact:* `' || v_impact || '`' || E'\n\n' ||
                '```' || E'\n' || v_snippet || E'\n' || '```' || E'\n\n' ||
                '🔗 *Action:* <' || v_portal_url || '|View logs in Travel Desk →>' || E'\n' ||
                '_Navgurukul Travel Desk • Automated SOS Alert_';

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
    'service', v_service,
    'environment', 'production',
    'occurrences', v_occ_label,
    'impact', v_impact,
    'snippet', v_snippet,
    'portal_url', v_portal_url,
    'severity', v_sev,
    'title', COALESCE(p_title, p_code),
    'blocks', v_blocks,
    'attachments', jsonb_build_array(
      jsonb_build_object(
        'color', v_color,
        'blocks', v_blocks
      )
    )
  );
END;
$sos_webhook_payload$ LANGUAGE plpgsql IMMUTABLE;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
