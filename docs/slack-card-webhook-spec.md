# Option A — post SOS alerts as a real Slack card

Implementation spec. Target: replace the Workflow Builder trigger URL with a Slack **app incoming
webhook**, and have the database emit an `attachments`-wrapped Block Kit card instead of the two
plain blocks it sends today.

Scope: the **SOS / alerting** stream only. Request pings and the daily digest still go by mail
(see "Optional follow-ups").

---

## 0. Background — why the current messages are plain

* `public.sos_webhook_payload()` (`supabase/migrations/20261010090000_sos_alert_system.sql:277`)
  already returns `{ text, blocks: [section, context] }`.
* `public.sos_dispatch_webhook()` (same file, `:316`) POSTs it with `net.http_post` to whatever URL
  is in **Alerts & Notices → SOS Alerts → Settings → Slack Webhook URL**.
* That URL is currently a **Workflow Builder trigger** (`https://hooks.slack.com/triggers/…`).
  A trigger does not render payloads: it maps **top-level** keys to workflow variables, discards
  everything else (including `blocks`), and the workflow's own *Send a message* step composes the
  text. Hence the plain output and the `WORKFLOW` badge.
* Two live consequences, both fixed by this change:
  1. A trigger **fails the run** when a variable it declares is missing from the request. Our DB
     payload has only two top-level keys (`text`, `blocks`), so any workflow declaring
     `severity`/`title`/`code` fails on real alerts while a flat hand-rolled test payload succeeds.
  2. `sos_dispatch_webhook()` returns `TRUE` when the request is **handed to pg_net**, not when
     Slack accepts it — so a rejected payload still records `notification_status = 'Queued'`.

The live `raise_sos_alert()` is the **redefinition** in
`supabase/migrations/20261010120000_desk_notifications_and_digest.sql:289`, not the one in the
earlier migration. Work against that one.

---

## 1. Slack side (do this first — you need the URL)

1. https://api.slack.com/apps → **Create New App** → *From scratch* → name it `Travel Desk Alerts`,
   pick the workspace.
2. **Incoming Webhooks** → toggle **On** → **Add New Webhook to Workspace** → choose
   `#alert-team-automation` → **Allow**.
3. Copy the URL. It must look like `https://hooks.slack.com/services/T…/B…/…`
   (`/services/`, **not** `/triggers/`).
4. Optional: **Basic Information → Display Information** — set the app name, icon and colour. That
   is what shows as the message author, replacing the `WORKFLOW` badge.
5. Leave the existing workflow in place until step 5 passes; switching back is a copy-paste.

One webhook URL = one channel. To split SOS and notifications into different channels later, add a
second webhook and put it in the notifications stream settings.

---

## 2. New migration

Create `supabase/migrations/20261013090000_sos_webhook_card.sql` (bump the timestamp to "now" in
the repo's `YYYYMMDDHHMMSS` style; it must sort after `20261010120000`).

### 2a. Severity palette

```sql
-- The one place severity becomes a colour. Matches the UI's severity chips:
-- rose / orange / amber / sky.
CREATE OR REPLACE FUNCTION public.sos_severity_colour(p_severity TEXT)
RETURNS TEXT AS $$
  SELECT CASE lower(COALESCE(p_severity, 'warning'))
           WHEN 'critical' THEN '#e11d48'
           WHEN 'high'     THEN '#ea580c'
           WHEN 'warning'  THEN '#d97706'
           ELSE                 '#0284c7'
         END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.sos_severity_emoji(p_severity TEXT)
RETURNS TEXT AS $$
  SELECT CASE lower(COALESCE(p_severity, 'warning'))
           WHEN 'critical' THEN '🚨'
           WHEN 'high'     THEN '🔴'
           WHEN 'warning'  THEN '🟠'
           ELSE                 '🔵'
         END
$$ LANGUAGE sql IMMUTABLE;
```

### 2b. The card builder

Takes the alert id rather than loose columns, so the message can never disagree with the row the
console shows. Reads the row back inside the same transaction that inserted it.

```sql
-- Builds what goes on the wire for one alert.
--
-- Two shapes, chosen by the destination URL:
--   * a real incoming webhook (/services/) gets the Block Kit card, wrapped in a single
--     attachment because the colour bar is an attachment property — Block Kit alone has no colour;
--   * a Workflow Builder trigger (/triggers/) gets flat top-level strings, because a trigger maps
--     top-level keys to variables and fails the run when a declared one is missing.
-- Pasting a different URL into Settings is therefore the whole switch.
CREATE OR REPLACE FUNCTION public.sos_webhook_card(p_alert_id UUID, p_url TEXT DEFAULT '')
RETURNS JSONB AS $sos_webhook_card$
DECLARE
  a          public.sos_alerts%ROWTYPE;
  v_portal   TEXT := '';
  v_link     TEXT := '';
  v_kv       TEXT;
  v_blocks   JSONB;
  v_fallback TEXT;
BEGIN
  SELECT * INTO a FROM public.sos_alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(btrim(value #>> '{}'), ''), '')
    INTO v_portal
    FROM public.email_routing_settings WHERE key = 'portal_url';

  IF COALESCE(v_portal, '') <> '' THEN
    v_link := rtrim(v_portal, '/') || '/?tab=sos&alertId=' || a.id::text;
  END IF;

  -- Shown in the notification and in any client that cannot render blocks.
  v_fallback := CASE a.severity
                  WHEN 'critical' THEN '[CRITICAL] '
                  WHEN 'high'     THEN '[HIGH] '
                  WHEN 'warning'  THEN '[WARNING] '
                  ELSE                 '[INFO] '
                END || 'Travel Desk SOS — ' || a.title;

  v_kv := public.desk_kv_line(a.context, 10);

  v_blocks := jsonb_build_array(
    -- header: plain_text only, 150 chars max.
    jsonb_build_object('type', 'header', 'text', jsonb_build_object(
      'type', 'plain_text', 'emoji', TRUE,
      'text', left(public.sos_severity_emoji(a.severity) || ' ' || a.title, 150))),

    -- fields render two-up; keep each one short so they do not wrap on mobile.
    jsonb_build_object('type', 'section', 'fields', jsonb_build_array(
      jsonb_build_object('type', 'mrkdwn', 'text', '*Severity*' || E'\n' || initcap(a.severity)),
      jsonb_build_object('type', 'mrkdwn', 'text', '*Code*' || E'\n' || '`' || a.code || '`'),
      jsonb_build_object('type', 'mrkdwn', 'text', '*Area*' || E'\n' || a.category),
      jsonb_build_object('type', 'mrkdwn', 'text', '*Raised by*' || E'\n' || a.source))),

    jsonb_build_object('type', 'section', 'text', jsonb_build_object(
      'type', 'mrkdwn', 'text', left(a.message, 2900)))
  );

  -- Context as one greppable code block, same `key=value` shape the mail uses.
  IF COALESCE(v_kv, '') <> '' THEN
    v_blocks := v_blocks || jsonb_build_array(
      jsonb_build_object('type', 'section', 'text', jsonb_build_object(
        'type', 'mrkdwn', 'text', '```' || left(v_kv, 2800) || '```')));
  END IF;

  IF v_link <> '' THEN
    v_blocks := v_blocks || jsonb_build_array(
      jsonb_build_object('type', 'actions', 'elements', jsonb_build_array(
        jsonb_build_object(
          'type', 'button', 'style', 'primary',
          'text', jsonb_build_object('type', 'plain_text', 'text', 'Open the SOS console'),
          'url', v_link))));
  END IF;

  v_blocks := v_blocks || jsonb_build_array(
    jsonb_build_object('type', 'context', 'elements', jsonb_build_array(
      jsonb_build_object('type', 'mrkdwn', 'text',
        '`' || a.code || '`'
        || CASE WHEN a.occurrences > 1 THEN ' · ×' || a.occurrences::text ELSE '' END
        || ' · ' || to_char(a.last_seen_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH24:MI') || ' IST'))));

  IF p_url LIKE 'https://hooks.slack.com/triggers/%' THEN
    RETURN jsonb_build_object(
      'text',           v_fallback,
      'severity',       a.severity,
      'severity_emoji', public.sos_severity_emoji(a.severity),
      'code',           a.code,
      'category',       a.category,
      'title',          a.title,
      'message',        a.message,
      'source',         a.source,
      'occurrences',    a.occurrences::text,
      'context',        COALESCE(v_kv, ''),
      'alert_id',       a.id::text,
      'url',            v_link
    );
  END IF;

  RETURN jsonb_build_object(
    'text', v_fallback,
    'attachments', jsonb_build_array(jsonb_build_object(
      'color',  public.sos_severity_colour(a.severity),
      'blocks', v_blocks))
  );
END;
$sos_webhook_card$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.sos_webhook_card(UUID, TEXT) FROM PUBLIC;
```

Every string is clamped because Slack rejects the **whole** message on one oversized field:
`header` 150 chars (plain_text), each section/field text 3000, 50 blocks per attachment, 10 fields
per section.

### 2c. Point `raise_sos_alert()` at it

The payload call is inline in `raise_sos_alert()`, so the function has to be redefined. Follow the
existing pattern: copy the function **verbatim** from
`supabase/migrations/20261010120000_desk_notifications_and_digest.sql:289` through its closing
`$raise_sos_alert$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`, paste it into the
new migration, and change exactly one call:

```sql
-- before
  v_webhook_sent := public.sos_dispatch_webhook(
    v_webhook,
    public.sos_webhook_payload(p_code, v_severity, v_title, v_message, v_source)
  );

-- after
  v_webhook_sent := public.sos_dispatch_webhook(
    v_webhook,
    public.sos_webhook_card(v_alert_id, v_webhook)
  );
```

Also copy the `REVOKE` / `GRANT EXECUTE … TO authenticated, service_role` block that follows it —
`CREATE OR REPLACE` keeps existing grants, but the repo restates them and a future reader should
see them next to the definition.

Nothing else in the function changes: the dedupe window, the per-actor rate limit, the daily cap,
the suppression reasons, the email fallback and the `notification_status` writes all stay as they
are.

Leave `sos_webhook_payload()` in place — it is unreferenced after this, but dropping it is a
separate cleanup and it is a useful fallback while the change beds in.

### 2d. Apply

```bash
supabase db push            # or: supabase migration up --linked
```

---

## 3. Settings change

**Alerts & Notices → SOS Alerts → Settings → Slack Webhook URL** → paste the `/services/` URL →
**Save Settings**. No code reads the URL's shape anywhere but `sos_webhook_card()`.

---

## 4. Test

`tests/sosWebhookCard.test.ts` — the repo already asserts against migration text
(`tests/autoClose.test.ts:13` reads the SQL and greps it), so mirror that:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/20261013090000_sos_webhook_card.sql';
const sql = readFileSync(MIGRATION, 'utf8');

describe('SOS webhook card', () => {
  it('wraps the blocks in a coloured attachment', () => {
    expect(sql).toContain("'attachments'");
    expect(sql).toContain("public.sos_severity_colour(a.severity)");
    expect(sql).toMatch(/'type',\s*'header'/);
  });

  it('falls back to flat variables for a Workflow Builder trigger', () => {
    expect(sql).toContain("p_url LIKE 'https://hooks.slack.com/triggers/%'");
    for (const key of ['severity', 'code', 'title', 'message', 'source', 'url']) {
      expect(sql).toContain(`'${key}',`);
    }
  });

  it('clamps the fields Slack rejects whole messages over', () => {
    expect(sql).toContain('left(public.sos_severity_emoji(a.severity)');
    expect(sql).toContain('left(a.message, 2900)');
  });

  it('raise_sos_alert posts the card and keeps its guards', () => {
    expect(sql).toContain('public.sos_webhook_card(v_alert_id, v_webhook)');
    expect(sql).not.toContain('sos_webhook_payload(');        // old builder is gone from this path
    expect(sql).toContain('duplicate_within_window');          // dedupe survived the copy
    expect(sql).toContain('actor_rate_limited');               // rate limit survived the copy
    expect(sql).toContain('daily_cap_reached');                // cap survived the copy
  });
});
```

Run: `npx vitest run tests/sosWebhookCard.test.ts` (3 suites in this repo fail at import without
`VITE_SUPABASE_URL` — unrelated, pre-existing).

---

## 5. Verify against the real channel

1. **Alerts & Notices → Send Test Alert**. Expect a card in `#alert-team-automation`: colour bar,
   bold header with the severity emoji, a 2×2 field grid, the message, the context code block, a
   primary **Open the SOS console** button, and the code/time footer.
2. pg_net is fire-and-forget, so check Slack actually accepted it:
   ```sql
   select id, status_code, left(content, 300) as body, created
     from net._http_response
    order by created desc
    limit 5;
   ```
   `200` + `ok` is success. `400` + `invalid_blocks` means a block was malformed — paste the
   payload into https://app.slack.com/block-kit-builder to find which:
   ```sql
   select jsonb_pretty(public.sos_webhook_card(id, 'https://hooks.slack.com/services/x'))
     from public.sos_alerts order by created_at desc limit 1;
   ```
   `404`/`410` means the webhook was revoked or the app removed from the channel.
3. Check the console agrees: the alert should read **Pushed to Slack**, and **Undelivered** stay 0.
4. Sanity-check the other path once: paste the workflow trigger URL back, send a test, confirm the
   workflow still posts (flat keys), then paste the `/services/` URL back.

---

## 6. Rollback

Paste the old URL back into Settings — that alone restores the previous behaviour for the workflow
shape. To revert the code, add a new migration that `CREATE OR REPLACE`s `raise_sos_alert()` from
`20261010120000_desk_notifications_and_digest.sql:289` unchanged; migrations here are forward-only.

---

## 7. Docs & changelog (repo convention)

* `docs/sos-alerts.md` — "Where messages go" currently says alerts reach Slack by mail with a
  webhook as the alternative. Add that the webhook path now posts a Block Kit card, that a
  `/triggers/` URL still works via flat variables, and note the colour map.
* `version-and-changelog.md` — new `## [vX.Y.Z]` entry with a `#### 📝 Commits in this Release`
  list (the parser needs a real hex hash: commit first, then record it, as
  `docs(changelog): record …` does). Bump `package.json` to match.

---

## Optional follow-ups (separate commits)

**A. Make the button's `alertId` do something.** `App.tsx:107` consumes `?tab=` only, so
`?tab=sos&alertId=…` lands on the feed without focusing the alert. Read `alertId` the same way,
pass it to `SOSView` as `focusAlertId`, and in `SOSView` seed `expandedId` from it and force
`statusFilter` to `all` for the first load, so a resolved alert is still reachable from an old
message. Strip the parameter after consuming it, as the `tab` handler does.

**B. Cards for request traffic and the digest.** `notify_new_request()` and `send_desk_digest()`
(`20261010120000_desk_notifications_and_digest.sql:513` and `:748`) queue mail only — the
notifications stream's `webhookUrl` is stored by the UI but never used. Mirror this work with a
`desk_notification_card()` + a dispatch call in both functions, falling back to mail exactly as the
SOS path does. The digest PDF can only ever go by mail, so the webhook message should link to the
console rather than pretend to carry the report.

**C. Trust the delivery status.** `sos_dispatch_webhook()` reports success on handoff to pg_net.
If you want `notification_status` to mean "Slack accepted it", add a sweep that joins
`net._http_response` back to the alert (store the pg_net request id on the row) and downgrades to
`Failed` on a non-2xx. Until then, treat **Undelivered** as a floor, not the truth.
