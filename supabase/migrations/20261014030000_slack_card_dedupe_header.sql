-- Stop the Slack App card repeating its own header
--
-- Slack renders a message's top-level "text" ABOVE the attachment, so a payload
-- carrying both a text line and a header block prints the title twice:
--
--     🔵 INFO — SOS test alert        <- top-level text
--     🔵 Info — SOS test alert        <- blocks[0], inside the attachment
--
-- The text line is not decoration: Slack uses it for the push notification and
-- the sidebar preview, so it cannot simply be dropped. Legacy attachments have
-- a field for exactly this -- "fallback" -- which feeds notifications and
-- previews but is never rendered in-channel when blocks are present.
--
-- So on the /services/ branch the dispatcher now folds the text line into each
-- attachment as its fallback and sends no top-level text. One header renders,
-- notifications still read correctly, and every sender benefits at once rather
-- than each payload builder having to remember the rule.
--
-- A payload with no attachments (plain text ping) keeps its text untouched, and
-- the /triggers/ branch is not involved: Workflow Builder has no attachments.

CREATE OR REPLACE FUNCTION public.sos_dispatch_webhook(p_url TEXT, p_payload JSONB)
RETURNS BOOLEAN AS $sos_dispatch_webhook$
DECLARE
  v_body        JSONB;
  v_attachments JSONB;
  v_fallback    TEXT;
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
    v_body := v_body || jsonb_build_object(
      'text',
      COALESCE(
        p_payload ->> 'plain_text',                     -- sender built its own
        public.slack_plain_text(p_payload ->> 'text'),  -- else derive from the mrkdwn card
        ''
      )
    );
  ELSE
    -- Slack App incoming webhook. A sender that supplied bare blocks gets the
    -- same coloured attachment wrapper the SOS and new-request cards build for
    -- themselves, so every card has the left bar.
    v_attachments := CASE
      WHEN p_payload ? 'attachments' THEN p_payload -> 'attachments'
      WHEN p_payload ? 'blocks'      THEN jsonb_build_array(jsonb_build_object(
                                            'color',  COALESCE(p_payload ->> 'color', '#176AE6'),
                                            'blocks', p_payload -> 'blocks'))
      ELSE NULL
    END;

    -- Carry the text line into the attachment as its fallback so the push
    -- notification keeps reading properly without the card printing it again.
    v_fallback := NULLIF(btrim(COALESCE(p_payload ->> 'text', '')), '');
    IF v_attachments IS NOT NULL AND v_fallback IS NOT NULL THEN
      SELECT jsonb_agg(
               CASE WHEN att ? 'fallback' THEN att
                    ELSE att || jsonb_build_object('fallback', v_fallback) END
               ORDER BY ord)
        INTO v_attachments
        FROM jsonb_array_elements(v_attachments) WITH ORDINALITY AS t(att, ord);
    END IF;

    v_body := jsonb_strip_nulls(jsonb_build_object(
      -- Omitted entirely when an attachment carries it, or the header renders twice.
      'text',         CASE WHEN v_attachments IS NULL THEN p_payload -> 'text' ELSE NULL END,
      'attachments',  v_attachments,
      -- Top-level blocks are dropped when an attachment carries them, same reason.
      'blocks',       CASE WHEN v_attachments IS NULL THEN p_payload -> 'blocks' ELSE NULL END,
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
