-- Point the desk notification email fallback at its own channel
--
-- 20261010120000 seeded the notifications stream with the SOS channel's Slack
-- address, because at the time both streams shared one channel. They no longer
-- do: SOS posts to #alert-team-automation, desk notifications to
-- #alert-traveldesk-notifications.
--
-- That address is not decoration. When the webhook call fails, the stream falls
-- back to email, so an unfixed default would route notifications into the SOS
-- channel precisely when something is already going wrong -- PnC would not see
-- them, and the dev channel would fill with travel traffic.
--
-- Edits the stored row rather than replacing it: the SOS address is removed,
-- the notification address added, and any other address the team put there is
-- kept. Re-running changes nothing.

DO $notification_channel_email$
DECLARE
  v_sos_email   TEXT := 'alert-team-automation-aaaawk4tlokditwloipugpaleq@navgurukul.slack.com';
  v_notif_email TEXT := 'alert-traveldesk-noti-aaaawmrwar4zebzkq473xvzllm@navgurukul.slack.com';
  v_current     JSONB;
  v_next        JSONB;
BEGIN
  SELECT COALESCE(value -> 'channelEmails', '[]'::jsonb)
    INTO v_current
    FROM public.sos_settings
   WHERE key = 'notifications';

  -- No notifications row yet: the seeding migration owns that case.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT e ORDER BY e), '[]'::jsonb)
    INTO v_next
    FROM jsonb_array_elements_text(v_current) AS e
   WHERE e <> v_sos_email;

  IF NOT (v_next @> to_jsonb(v_notif_email)) THEN
    v_next := v_next || jsonb_build_array(v_notif_email);
  END IF;

  UPDATE public.sos_settings
     SET value = jsonb_set(value, '{channelEmails}', v_next)
   WHERE key = 'notifications';
END
$notification_channel_email$;

NOTIFY pgrst, 'reload schema';
