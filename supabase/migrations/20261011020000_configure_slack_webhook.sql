-- =============================================================================
-- Migration: 20261011020000_configure_slack_webhook.sql
-- Description:
-- 1. Redesigns desk_message_body to render structured HTML cards instead of raw <pre>
--    so Slack's email integration does not squash newlines into a run-on block.
-- 2. Updates send_desk_digest to dispatch to the Slack webhook directly via pg_net.
-- Note: Slack webhook URLs should be configured securely via the Travel Desk
--       Settings UI (or sos_settings table) rather than hardcoded in migrations.
-- =============================================================================

-- 1. Redesign the HTML message body for Slack & Email clients
CREATE OR REPLACE FUNCTION public.desk_message_body(p_lines TEXT[])
RETURNS TEXT AS $desk_message_body$
DECLARE
  v_content TEXT := '';
  v_line    TEXT;
  v_first   BOOLEAN := TRUE;
BEGIN
  IF p_lines IS NULL OR array_length(p_lines, 1) IS NULL THEN
    RETURN '';
  END IF;

  FOR v_line IN SELECT unnest(p_lines) LOOP
    IF v_line IS NOT NULL AND btrim(v_line) <> '' THEN
      IF v_first THEN
        -- Heading / title banner
        v_content := v_content || 
          '<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">' ||
          public.sos_escape_html(v_line) || '</div>';
        v_first := FALSE;
      ELSIF v_line LIKE 'open: %' THEN
        -- Action button / portal link
        v_content := v_content ||
          '<div style="margin-top:14px;"><a href="' || substring(v_line FROM 7) ||
          '" style="display:inline-block;padding:8px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;">View in Travel Desk →</a></div>';
      ELSIF v_line LIKE 'unassigned: %' OR v_line LIKE 'stalled: %' THEN
        -- Attention / Alert callout box
        v_content := v_content ||
          '<div style="margin:8px 0;padding:10px 12px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;font-family:ui-monospace,monospace;font-size:12px;color:#991b1b;line-height:1.5;">' ||
          public.sos_escape_html(v_line) || '</div>';
      ELSE
        -- Clean info card line
        v_content := v_content ||
          '<div style="margin:6px 0;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;color:#334155;line-height:1.5;">' ||
          public.sos_escape_html(v_line) || '</div>';
      END IF;
    END IF;
  END LOOP;

  RETURN '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:16px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">' ||
         v_content ||
         '</div>';
END;
$desk_message_body$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Teach send_desk_digest to dispatch to the Slack webhook directly
CREATE OR REPLACE FUNCTION public.send_desk_digest(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $send_desk_digest$
DECLARE
  v_settings   JSONB;
  v_digest     JSONB;
  v_totals     JSONB;
  v_portal     TEXT;
  v_queue_id   UUID;
  v_lines      TEXT[];
  v_names      TEXT;
  v_webhook    TEXT;
  v_slack_text TEXT;
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

  -- Post directly to Slack webhook via pg_net if configured
  v_webhook := COALESCE(NULLIF(btrim(v_settings ->> 'webhookUrl'), ''), '');
  IF v_webhook <> '' THEN
    v_slack_text := '📊 *DAILY DESK DIGEST · ' || (v_digest ->> 'windowLabel') || ' (IST)*' || E'\n\n' ||
      '*⚡ Today''s Activity:*' || E'\n' ||
      '• *Raised:* ' || (v_totals ->> 'raised') || '   • *Booked:* ' || (v_totals ->> 'booked') ||
      '   • *Closed:* ' || (v_totals ->> 'closed') || '   • *Cancelled:* ' || (v_totals ->> 'cancelled') || E'\n\n' ||
      '*📈 Queue Status:*' || E'\n' ||
      '• *Total Open:* ' || (v_totals ->> 'open') || '   • *Assigned:* ' || (v_totals ->> 'assigned') ||
      '   • *Unassigned:* ' || (v_totals ->> 'unassigned') || E'\n' ||
      '• *Stalled (>48h):* ' || (v_totals ->> 'stalled') || '   • *Oldest in Queue:* ' || (v_totals ->> 'oldestOpenHours') || 'h' ||
      CASE WHEN (v_totals ->> 'unassigned')::INTEGER > 0
           THEN E'\n\n*🚨 Action Required — Unassigned Tickets:* ' || (v_totals ->> 'unassigned') || ' requests need owners'
           ELSE '' END ||
      CASE WHEN v_portal <> ''
           THEN E'\n\n🔗 *Open Desk:* <' || rtrim(v_portal, '/') || '/?tab=all-requests|View All Requests>'
           ELSE '' END;

    PERFORM public.sos_dispatch_webhook(
      v_webhook,
      jsonb_build_object('text', v_slack_text)
    );
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
    'sent', (v_queue_id IS NOT NULL OR v_webhook <> ''),
    'queueId', v_queue_id,
    'totals', v_totals,
    'reason', CASE WHEN v_queue_id IS NULL AND v_webhook = '' THEN 'no_channel_configured' ELSE NULL END
  );
END;
$send_desk_digest$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
