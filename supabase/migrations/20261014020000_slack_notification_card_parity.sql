-- Slack card parity for travel desk notifications
--
-- Why: 20261014010300 shapes the outgoing body per webhook type, but it can only
-- forward the keys a sender actually supplies. Only the SOS payload was updated
-- to supply them, so the three desk notification senders still fell short:
--
--   * send_desk_digest() and send_desk_notification_test() send {text, blocks}
--     with no attachments, so on a /services/ webhook they render as a bare
--     blocks message with no coloured left bar. The test button is the first
--     thing a new webhook gets pointed at, so the setup looked broken when the
--     webhook was in fact fine.
--   * None of the three supply a top-level 'plain_text', so on a /triggers/
--     webhook they fall back to 'text' -- which carries mrkdwn -- and Workflow
--     Builder prints the raw *asterisks* and `backticks`.
--
-- Fixed centrally in sos_dispatch_webhook() rather than in each payload builder:
-- every sender already funnels through it, the mrkdwn layouts stay the single
-- source of truth for the plain-text card, and future senders inherit both.
-- SOS is unaffected: it supplies 'plain_text' and 'attachments' itself, so both
-- branches below fall through to exactly what it passed in.

-- 1. mrkdwn -> plain text, for the Workflow Builder card ----------------------
CREATE OR REPLACE FUNCTION public.slack_plain_text(p_text TEXT)
RETURNS TEXT AS $slack_plain_text$
DECLARE
  v_out TEXT := COALESCE(p_text, '');
BEGIN
  -- <https://host/path|Label> -> Label
  v_out := regexp_replace(v_out, '<([^>|]*)\|([^>]*)>', '\2', 'g');
  -- <https://host/path>       -> https://host/path
  v_out := regexp_replace(v_out, '<([^>|]*)>', '\1', 'g');
  -- _italic_ -> italic. The pair must be delimited by whitespace or a line
  -- boundary, so snake_case identifiers keep their underscores: an unanchored
  -- '_(...)_' turns sos_dispatch_webhook into sosdispatchwebhook.
  v_out := regexp_replace(
             v_out,
             '(^|[[:space:]])_([^_' || E'\n' || ']+)_([[:space:]]|$)',
             '\1\2\3', 'g');
  -- Bold and code markers carry no meaning in a Workflow Builder text variable.
  v_out := replace(replace(v_out, '*', ''), '`', '');
  RETURN v_out;
END;
$slack_plain_text$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.slack_plain_text(TEXT) IS
  'Strips Slack mrkdwn so a card laid out for Block Kit prints cleanly as a Workflow Builder text variable.';

-- 2. Dispatcher: fill in whichever key the sender left out --------------------
CREATE OR REPLACE FUNCTION public.sos_dispatch_webhook(p_url TEXT, p_payload JSONB)
RETURNS BOOLEAN AS $sos_dispatch_webhook$
DECLARE
  v_body        JSONB;
  v_attachments JSONB;
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
        p_payload ->> 'plain_text',                          -- sender built its own
        public.slack_plain_text(p_payload ->> 'text'),       -- else derive from the mrkdwn card
        ''
      )
    );
  ELSE
    -- Slack App incoming webhook: only the keys Slack understands. A sender that
    -- supplied bare blocks gets the same coloured attachment wrapper the SOS and
    -- new-request cards build for themselves, so every card has the left bar.
    v_attachments := CASE
      WHEN p_payload ? 'attachments' THEN p_payload -> 'attachments'
      WHEN p_payload ? 'blocks'      THEN jsonb_build_array(jsonb_build_object(
                                            'color',  COALESCE(p_payload ->> 'color', '#176AE6'),
                                            'blocks', p_payload -> 'blocks'))
      ELSE NULL
    END;

    -- Top-level blocks are dropped when an attachment carries them, or the card renders twice.
    v_body := jsonb_strip_nulls(jsonb_build_object(
      'text',         p_payload -> 'text',
      'attachments',  v_attachments,
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
