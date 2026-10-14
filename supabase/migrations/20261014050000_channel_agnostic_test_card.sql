-- Stop the test card naming a channel it cannot know
--
-- SOS and desk notifications now post to different channels (SOS to the dev
-- and support channel, notifications to their own). The test card carried the
-- channel as a hardcoded string, so the moment the two were split it would
-- land in one channel while announcing the other -- wrong at exactly the
-- moment someone is verifying the split.
--
-- An incoming webhook does not expose which channel it is bound to, so the
-- card cannot derive the name either. It is also simply redundant: the card
-- IS in the channel. Dropped from both the Block Kit grid and the plain-text
-- variant, leaving Triggered By and Sent At, with status and delivery in the
-- footer.

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
            '*Status:* 🟢 Operational' || E'\n\n' ||
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
        jsonb_build_object('type', 'mrkdwn', 'text', '*🕒 Sent At:*' || E'\n' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') || ' IST')
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
