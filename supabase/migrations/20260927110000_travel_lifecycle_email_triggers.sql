-- ============================================================================
-- Travel Desk lifecycle email triggers
--
-- Implements the model described in "Travel Desk Stages- mails - Triggers.xlsx"
-- (Final tab). Three things change:
--
--   1. mail_templates moves from a to-status key to an (event, audience, context_key)
--      key. The sheet has several rows that land on the same stage but must say
--      different things - rows 2/12/18 all reach "Approval Pending", rows 33 and 37
--      both reach "Cancelled by Employee" but differ on whether money is owed.
--      A to-status key physically cannot express that.
--
--   2. The lifecycle gains the ten stages the sheet uses that the app did not have,
--      all of them in the cancellation / refund / reconciliation tail.
--
--   3. Routing defaults (the sheet's "system set defaults" CC, the Finance list and
--      the "Escalation Owner") become configurable rows rather than hardcoded arrays.
--
-- Run order: this file, then 20260927120000_seed_travel_lifecycle_mail_templates.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Lifecycle stages
-- ---------------------------------------------------------------------------

-- Ten stages the sheet requires and the app did not have. All sit in the
-- cancellation / refund tail, which previously terminated at "Cancelled by *".
DO $$
DECLARE
  all_stages TEXT := $stages$
    'Not Started', 'Approval Pending', 'Rejected by Manager', 'Approved',
    'Processing', 'On Hold', 'Rejected by PNC', 'Booked',
    'Cancelled by Employee', 'Cancelled by PNC', 'Cancellation Requested', 'Closed',
    -- added for the triggers sheet
    'Cancelled by System', 'On Hold / Escalated', 'Booked / Partially Cancelled',
    'Pending Refund', 'Partially Refunded', 'Fully Refunded', 'Written Off',
    'Disputed', 'Reconciled', 'Closed / Recorded'
  $stages$;
BEGIN
  EXECUTE 'ALTER TABLE public.travel_requests DROP CONSTRAINT IF EXISTS chk_pnc_status';
  EXECUTE 'ALTER TABLE public.travel_requests ADD CONSTRAINT chk_pnc_status CHECK (pnc_status IN ('
        || all_stages || '))';

  EXECUTE 'ALTER TABLE public.ticket_status_history DROP CONSTRAINT IF EXISTS chk_history_from_status';
  EXECUTE 'ALTER TABLE public.ticket_status_history ADD CONSTRAINT chk_history_from_status '
        || 'CHECK (from_status IS NULL OR from_status IN (' || all_stages || '))';

  EXECUTE 'ALTER TABLE public.ticket_status_history DROP CONSTRAINT IF EXISTS chk_history_to_status';
  EXECUTE 'ALTER TABLE public.ticket_status_history ADD CONSTRAINT chk_history_to_status '
        || 'CHECK (to_status IN (' || all_stages || '))';
END $$;

-- Financial columns the refund/reconciliation templates interpolate. Without these
-- the settlement mails (sheet rows 46-53) have nothing to render.
ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS original_fare         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_amount         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS expected_refund       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS written_off_amount    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS employee_owed_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS org_absorbed_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cancellation_charge   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cancelled_segments    TEXT,
  ADD COLUMN IF NOT EXISTS active_segments       TEXT,
  ADD COLUMN IF NOT EXISTS change_summary        TEXT,
  ADD COLUMN IF NOT EXISTS employee_response     TEXT,
  ADD COLUMN IF NOT EXISTS info_requested        TEXT,
  ADD COLUMN IF NOT EXISTS info_requested_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at          TIMESTAMPTZ;

COMMENT ON COLUMN public.travel_requests.info_requested_at IS
  'Set when the request enters On Hold via INFO_REQUESTED. Drives the 24h / 72h / escalation / expiry reminder scan.';


-- ---------------------------------------------------------------------------
-- 2. mail_templates: from to-status key to (event, audience, context_key)
-- ---------------------------------------------------------------------------

ALTER TABLE public.mail_templates
  ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'Published',
  ADD COLUMN IF NOT EXISTS version        INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS audience       TEXT DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS template_key   TEXT,
  ADD COLUMN IF NOT EXISTS event          TEXT,
  ADD COLUMN IF NOT EXISTS context_key    TEXT,
  ADD COLUMN IF NOT EXISTS from_status    TEXT,
  ADD COLUMN IF NOT EXISTS to_status      TEXT,
  ADD COLUMN IF NOT EXISTS cc_rule        TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sheet_row      TEXT,
  ADD COLUMN IF NOT EXISTS sheet_summary  TEXT;

COMMENT ON COLUMN public.mail_templates.context_key IS
  'Nullable discriminator for rows that share an (event, audience) pair but carry different copy '
  '- e.g. post_booking, resubmit_after_pnc_rejection. NULL is the fallback for that pair.';
COMMENT ON COLUMN public.mail_templates.from_status IS
  'Documentation and admin-UI display only. Template resolution uses context_key, not from_status.';
COMMENT ON COLUMN public.mail_templates.sheet_row IS
  'Row number in the source triggers sheet. NULL for templates created by hand in the admin UI.';

-- Backfill the four pre-existing templates so nothing is orphaned by the new key.
UPDATE public.mail_templates
   SET template_key = COALESCE(
         template_key,
         'legacy.' || lower(regexp_replace(COALESCE(status_trigger, name), '[^a-zA-Z0-9]+', '_', 'g'))
                   || '.' || COALESCE(audience, 'employee')),
       to_status    = COALESCE(to_status, status_trigger),
       is_active    = COALESCE(is_active, NOT COALESCE(is_draft, FALSE))
 WHERE template_key IS NULL;

-- The four templates seeded before this migration cover ground the sheet now covers with
-- reviewed copy, and they carry no event, so the trigger engine can never select them.
-- Archived rather than deleted: they stay visible under Archived in the admin UI and can
-- be restored if a comparison is needed.
UPDATE public.mail_templates
   SET status = 'Archived',
       is_active = FALSE,
       updated_at = NOW()
 WHERE event IS NULL
   AND sheet_row IS NULL
   AND (status IS NULL OR status <> 'Archived');

-- Ensure template history table exists for template versioning
CREATE TABLE IF NOT EXISTS public.mail_template_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.mail_templates(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  previous_subject TEXT,
  new_subject TEXT,
  previous_body TEXT,
  new_body TEXT,
  previous_status TEXT,
  new_status TEXT,
  version INTEGER DEFAULT 1
);

ALTER TABLE public.mail_template_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view template history" ON public.mail_template_history;
CREATE POLICY "Staff can view template history"
  ON public.mail_template_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC'))
  );

DROP POLICY IF EXISTS "Admins manage template history" ON public.mail_template_history;
CREATE POLICY "Admins manage template history"
  ON public.mail_template_history FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- The old key. A partial unique index on status_trigger allowed exactly one published
-- template per stage, which is the constraint the sheet breaks on rows 2/12/18 and 23/24/35.
DROP INDEX IF EXISTS public.mail_templates_published_unique;

ALTER TABLE public.mail_templates ALTER COLUMN template_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mail_templates_template_key_unique
  ON public.mail_templates (template_key);

-- One published template per (event, audience, context_key). context_key is coalesced so
-- that two rows cannot both claim the NULL-context fallback for the same pair - a plain
-- three-column index would treat NULLs as distinct and let duplicates through.
CREATE UNIQUE INDEX IF NOT EXISTS mail_templates_trigger_unique
  ON public.mail_templates (event, audience, COALESCE(context_key, ''))
  WHERE is_draft = FALSE AND event IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mail_templates_event_audience
  ON public.mail_templates (event, audience)
  WHERE is_active = TRUE AND is_draft = FALSE;


-- ---------------------------------------------------------------------------
-- 3. Routing settings - the sheet's "system set defaults", Finance and Escalation Owner
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_routing_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  value_type  TEXT NOT NULL DEFAULT 'email_list'
              CHECK (value_type IN ('email_list', 'number', 'text', 'boolean')),
  "group"     TEXT NOT NULL DEFAULT 'routing',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

ALTER TABLE public.email_routing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view email routing settings" ON public.email_routing_settings;
CREATE POLICY "Staff can view email routing settings"
  ON public.email_routing_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC')));

DROP POLICY IF EXISTS "Admins manage email routing settings" ON public.email_routing_settings;
CREATE POLICY "Admins manage email routing settings"
  ON public.email_routing_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'));

INSERT INTO public.email_routing_settings (key, value, label, description, value_type, "group", sort_order)
VALUES
  ('default_cc', '["travel.team@navgurukul.org"]'::jsonb,
   'Default CC',
   'The sheet''s "system set defaults". Copied on every lifecycle mail unless a template opts out.',
   'email_list', 'routing', 10),

  ('finance_cc', '["finance@navgurukul.org"]'::jsonb,
   'Finance CC',
   'Added on refund and settlement mails (sheet rows 46-50, 53).',
   'email_list', 'routing', 20),

  ('escalation_owners', '["pnc@navgurukul.org"]'::jsonb,
   'Escalation owners',
   'Recipients of the stalled-request escalation (sheet row 27). The sheet left this party undefined.',
   'email_list', 'routing', 30),

  ('pnc_queue_cc', '[]'::jsonb,
   'PNC queue CC',
   'Optional extra recipients on PNC-facing operational mails, on top of the active PNC and Admin users.',
   'email_list', 'routing', 40),

  ('support_email', '"travel.team@navgurukul.org"'::jsonb,
   'Support email',
   'Rendered as {{support_email}} in template bodies.',
   'text', 'routing', 50),

  ('portal_url', '"https://travel.navgurukul.org"'::jsonb,
   'Portal URL',
   'Target of every call-to-action button. Rendered as {{portal_url}}.',
   'text', 'routing', 60),

  ('info_reminder_first_hours', '24'::jsonb,
   'First information reminder (hours)',
   'Hours on hold before the first nudge. Sheet row 26.',
   'number', 'reminders', 70),

  ('info_reminder_final_hours', '72'::jsonb,
   'Final information reminder (hours)',
   'Hours on hold before the final notice, which also copies the manager. Sheet row 26b.',
   'number', 'reminders', 80),

  ('info_escalation_days', '5'::jsonb,
   'Escalate after (days)',
   'Days on hold before the request is escalated to the escalation owners. Sheet row 27.',
   'number', 'reminders', 90),

  ('info_expiry_days', '7'::jsonb,
   'Auto-close after (days)',
   'Days on hold before the request is closed as "Cancelled by System". Sheet row 28.',
   'number', 'reminders', 100),

  ('reminders_enabled', 'true'::jsonb,
   'Time-based reminders enabled',
   'Master switch for the reminder / escalation / expiry scan.',
   'boolean', 'reminders', 110)
ON CONFLICT (key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. Reminder scan support
-- ---------------------------------------------------------------------------

-- The sheet's rows 26, 26b, 27 and 28 fire on elapsed time, not on a transition.
-- This table records which time-based mail has already gone out for a given hold,
-- so a scan that runs more often than the interval cannot send twice.
CREATE TABLE IF NOT EXISTS public.email_reminder_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  event          TEXT NOT NULL,
  hold_started_at TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One mail per (ticket, event, hold). A request that goes on hold a second time gets
-- a fresh hold_started_at and so becomes eligible again.
CREATE UNIQUE INDEX IF NOT EXISTS email_reminder_log_once
  ON public.email_reminder_log (ticket_id, event, hold_started_at);

ALTER TABLE public.email_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view reminder log" ON public.email_reminder_log;
CREATE POLICY "Staff can view reminder log"
  ON public.email_reminder_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC')));

DROP POLICY IF EXISTS "Service role writes reminder log" ON public.email_reminder_log;
CREATE POLICY "Service role writes reminder log"
  ON public.email_reminder_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'));


-- ---------------------------------------------------------------------------
-- 5. email_queue: carry the trigger that produced each message
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cc TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS bcc TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS event        TEXT,
  ADD COLUMN IF NOT EXISTS audience     TEXT,
  ADD COLUMN IF NOT EXISTS context_key  TEXT,
  ADD COLUMN IF NOT EXISTS template_key TEXT;

COMMENT ON COLUMN public.email_queue.template_key IS
  'Which mail_templates row produced this message. Lets the Sent Mails view trace a delivery '
  'back to a sheet row, and lets the Usage tab group sends by trigger.';

CREATE INDEX IF NOT EXISTS idx_email_queue_event ON public.email_queue (event);
CREATE INDEX IF NOT EXISTS idx_email_queue_sent_at ON public.email_queue (sent_at DESC);
