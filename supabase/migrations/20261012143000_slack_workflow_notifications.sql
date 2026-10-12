-- =============================================================================
-- Migration: 20261012143000_slack_workflow_notifications.sql
-- Description:
-- 1. Routes travel request notifications directly through the Slack workflow webhook,
--    matching the SOS alert delivery mechanism and skipping duplicate channel email.
-- 2. Formats notification messages (mrkdwn and Block Kit) closely following the
--    official NavGurukul Mail Template design (brand banner, structured trip card,
--    status indicators, action buttons, and footer).
-- 3. Enhances send_desk_digest to dispatch full Block Kit payloads and prevent
--    duplicate emails to Slack channel email addresses when webhook is active.
-- 4. Aligns desk_message_body HTML cards to match the official Mail Template layout.
-- 5. Adds send_desk_notification_test RPC for 1-click test delivery from console.
-- =============================================================================

-- 1. Helper: build rich Slack payload for travel requests matching mail template design
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

  -- mrkdwn for Slack Workflow Builder output variable and fallback view
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

  -- Block Kit blocks for rich cards
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
    'blocks', v_blocks
  );
END;
$desk_request_webhook_payload$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Update notify_new_request trigger function to route through Slack webhook
CREATE OR REPLACE FUNCTION public.notify_new_request()
RETURNS TRIGGER AS $notify_new_request$
DECLARE
  v_settings     JSONB;
  v_webhook      TEXT;
  v_portal       TEXT;
  v_webhook_sent BOOLEAN := FALSE;
  v_lines        TEXT[];
  v_trip         TEXT;
BEGIN
  v_settings := public.desk_stream_settings('notifications');

  IF NOT COALESCE((v_settings ->> 'enabled')::BOOLEAN, TRUE)
     OR NOT COALESCE((v_settings ->> 'notifyOnNewRequest')::BOOLEAN, TRUE) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  -- Resolve webhook: check notifications setting, fallback to alerting webhook
  v_webhook := COALESCE(
    NULLIF(btrim(v_settings ->> 'webhookUrl'), ''),
    NULLIF(btrim((SELECT value ->> 'webhookUrl' FROM public.sos_settings WHERE key = 'alerting')), ''),
    ''
  );

  -- Dispatch to Slack workflow / webhook if available
  IF v_webhook <> '' THEN
    v_webhook_sent := public.sos_dispatch_webhook(
      v_webhook,
      public.desk_request_webhook_payload(NEW, v_portal)
    );
  END IF;

  -- If successfully delivered to Slack, do NOT send duplicate channel email
  IF v_webhook_sent THEN
    RETURN NEW;
  END IF;

  -- Fallback to email only when webhook is not configured or failed
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

-- 3. Redesign HTML message body for email clients to match the Mail Template design
CREATE OR REPLACE FUNCTION public.desk_message_body(p_lines TEXT[])
RETURNS TEXT AS $desk_message_body$
DECLARE
  v_content TEXT := '';
  v_line    TEXT;
  v_first   BOOLEAN := TRUE;
  v_portal  TEXT := 'https://ng-travel-desk.vercel.app';
BEGIN
  IF p_lines IS NULL OR array_length(p_lines, 1) IS NULL THEN
    RETURN '';
  END IF;

  FOR v_line IN SELECT unnest(p_lines) LOOP
    IF v_line IS NOT NULL AND btrim(v_line) <> '' THEN
      IF v_first THEN
        -- Title card banner with brand orange accent
        v_content := v_content || 
          '<div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:16px;padding:12px 14px;background:#f8fafc;border-left:4px solid #FF6B35;border-radius:4px;">' ||
          public.sos_escape_html(v_line) || '</div>';
        v_first := FALSE;
      ELSIF v_line LIKE 'open: %' THEN
        -- Primary action button
        v_portal := substring(v_line FROM 7);
        v_content := v_content ||
          '<div style="margin:24px 0 12px 0;text-align:center;"><a href="' || v_portal ||
          '" style="display:inline-block;padding:12px 28px;background:#4F46E5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">View in Travel Desk →</a></div>';
      ELSIF v_line LIKE 'unassigned: %' OR v_line LIKE 'stalled: %' THEN
        -- Alert / attention callout box
        v_content := v_content ||
          '<div style="margin:10px 0;padding:12px 14px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#991b1b;line-height:1.6;">' ||
          public.sos_escape_html(v_line) || '</div>';
      ELSE
        -- Clean info line
        v_content := v_content ||
          '<div style="margin:8px 0;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#334155;line-height:1.6;">' ||
          public.sos_escape_html(v_line) || '</div>';
      END IF;
    END IF;
  END LOOP;

  RETURN '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">' ||
         '<div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">' ||
           '<img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />' ||
           '<p style="color:#64748b;margin:6px 0 0 0;font-size:13px;font-weight:600;">Travel Desk Notification</p>' ||
         '</div>' ||
         v_content ||
         '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">' ||
           'Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.' ||
         '</div>' ||
         '</div>';
END;
$desk_message_body$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Update send_desk_digest to dispatch complete Block Kit payload and prevent duplicate mail
CREATE OR REPLACE FUNCTION public.send_desk_digest(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $send_desk_digest$
DECLARE
  v_settings     JSONB;
  v_digest       JSONB;
  v_totals       JSONB;
  v_portal       TEXT;
  v_queue_id     UUID;
  v_lines        TEXT[];
  v_names        TEXT;
  v_webhook      TEXT;
  v_slack_text   TEXT;
  v_slack_blocks JSONB;
  v_webhook_sent BOOLEAN := FALSE;
  v_target_url   TEXT;
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

  v_target_url := CASE WHEN v_portal <> '' THEN rtrim(v_portal, '/') || '/?tab=all-requests' ELSE 'https://ng-travel-desk.vercel.app/?tab=all-requests' END;

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
    v_lines := v_lines || ('open: ' || v_target_url);
  END IF;

  -- 1. Webhook dispatch
  v_webhook := COALESCE(
    NULLIF(btrim(v_settings ->> 'webhookUrl'), ''),
    NULLIF(btrim((SELECT value ->> 'webhookUrl' FROM public.sos_settings WHERE key = 'alerting')), ''),
    ''
  );

  IF v_webhook <> '' THEN
    v_slack_text := '📊 *TRAVEL DESK · DAILY DIGEST*' || E'\n' ||
      '*Date:* ' || (v_digest ->> 'windowLabel') || ' (IST)' || E'\n\n' ||
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
      '*⚡ Today''s Activity:*' || E'\n' ||
      '• *Raised:* ' || (v_totals ->> 'raised') || '   • *Booked:* ' || (v_totals ->> 'booked') ||
      '   • *Closed:* ' || (v_totals ->> 'closed') || '   • *Cancelled:* ' || (v_totals ->> 'cancelled') || E'\n\n' ||
      '*📈 Queue Status:*' || E'\n' ||
      '• *Total Open:* ' || (v_totals ->> 'open') || '   • *Assigned:* ' || (v_totals ->> 'assigned') ||
      '   • *Unassigned:* ' || (v_totals ->> 'unassigned') || E'\n' ||
      '• *Stalled (>48h):* ' || (v_totals ->> 'stalled') || '   • *Oldest in Queue:* ' || (v_totals ->> 'oldestOpenHours') || 'h' ||
      CASE WHEN (v_totals ->> 'unassigned')::INTEGER > 0
           THEN E'\n\n*🚨 Action Required — Unassigned Tickets:* ' || (v_totals ->> 'unassigned') || ' requests need owners'
           ELSE '' END || E'\n' ||
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n\n' ||
      '🔗 *Action:* <' || v_target_url || '|View All Requests →>' || E'\n\n' ||
      '_Navgurukul Travel Desk • Automated Report_';

    v_slack_blocks := jsonb_build_array(
      jsonb_build_object(
        'type', 'header',
        'text', jsonb_build_object(
          'type', 'plain_text',
          'text', '📊 Daily Desk Digest — ' || (v_digest ->> 'windowLabel') || ' (IST)',
          'emoji', TRUE
        )
      ),
      jsonb_build_object(
        'type', 'section',
        'text', jsonb_build_object(
          'type', 'mrkdwn',
          'text', '*⚡ Today:* *' || (v_totals ->> 'raised') || '* raised · *' || (v_totals ->> 'booked') || '* booked · *' || (v_totals ->> 'closed') || '* closed' || E'\n' ||
                  '*📈 Queue:* *' || (v_totals ->> 'open') || '* open · *' || (v_totals ->> 'unassigned') || '* unassigned · *' || (v_totals ->> 'stalled') || '* stalled'
        )
      ),
      jsonb_build_object('type', 'divider'),
      jsonb_build_object(
        'type', 'actions',
        'elements', jsonb_build_array(
          jsonb_build_object(
            'type', 'button',
            'text', jsonb_build_object('type', 'plain_text', 'text', 'View All Requests →', 'emoji', TRUE),
            'url', v_target_url,
            'style', 'primary'
          )
        )
      ),
      jsonb_build_object(
        'type', 'context',
        'elements', jsonb_build_array(
          jsonb_build_object('type', 'mrkdwn', 'text', 'Navgurukul Travel Desk • Automated Report')
        )
      )
    );

    v_webhook_sent := public.sos_dispatch_webhook(
      v_webhook,
      jsonb_build_object(
        'text', v_slack_text,
        'blocks', v_slack_blocks
      )
    );
  END IF;

  -- 2. Fallback to channel email only if webhook not sent
  IF NOT v_webhook_sent THEN
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
  END IF;

  RETURN jsonb_build_object(
    'sent', (v_webhook_sent OR v_queue_id IS NOT NULL),
    'webhookSent', v_webhook_sent,
    'queueId', v_queue_id,
    'totals', v_totals,
    'reason', CASE WHEN NOT v_webhook_sent AND v_queue_id IS NULL THEN 'no_channel_configured' ELSE NULL END
  );
END;
$send_desk_digest$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. RPC: Send a test notification to Slack workflow
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

  v_text := '🔔 *TRAVEL DESK NOTIFICATION · LIVE WORKFLOW TEST*' || E'\n' ||
            '*Status:* 🟢 Operational  •  *Channel:* #alert-team-automation' || E'\n\n' ||
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
            '👤 *Triggered By:* ' || COALESCE(p_actor_email, 'Admin') || E'\n' ||
            '🕒 *Sent At:* ' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI:SS') || ' IST' || E'\n' ||
            '📡 *Delivery Mode:* Slack Workflow Webhook' || E'\n' ||
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
      'text', jsonb_build_object('type', 'mrkdwn', 'text', '*Status:* 🟢 *Operational*   |   *Delivery:* *Slack Workflow Webhook*')
    ),
    jsonb_build_object('type', 'divider'),
    jsonb_build_object(
      'type', 'section',
      'fields', jsonb_build_array(
        jsonb_build_object('type', 'mrkdwn', 'text', '*👤 Triggered By:*' || E'\n' || COALESCE(p_actor_email, 'Admin')),
        jsonb_build_object('type', 'mrkdwn', 'text', '*🕒 Sent At:*' || E'\n' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') || ' IST'),
        jsonb_build_object('type', 'mrkdwn', 'text', '*📡 Channel:*' || E'\n' || '#alert-team-automation'),
        jsonb_build_object('type', 'mrkdwn', 'text', '*🎨 Design System:*' || E'\n' || 'Mail Template Aligned')
      )
    ),
    jsonb_build_object('type', 'divider'),
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
        jsonb_build_object('type', 'mrkdwn', 'text', 'Navgurukul Travel Desk • Automated Notification')
      )
    )
  );

  v_webhook_sent := public.sos_dispatch_webhook(
    v_webhook,
    jsonb_build_object('text', v_text, 'blocks', v_blocks)
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
