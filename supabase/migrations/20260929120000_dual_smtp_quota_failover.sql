-- =============================================================================
-- Dual SMTP: per-account quota tracking + automatic failover
-- =============================================================================
-- The Email Notification Center runs two SMTP accounts: Account A ("smtp") is
-- the active transport and Account B ("smtp2") is the hot standby. Gmail
-- Workspace caps each account at ~2000 sends/day, so usage has to be tracked
-- per account rather than as one pooled 4000 counter.
-- =============================================================================

-- 1. Record which SMTP account actually delivered each email.
--    `provider` only ever says 'smtp', which cannot distinguish A from B.
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS smtp_slot TEXT;

ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_smtp_slot_check;
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_smtp_slot_check
  CHECK (smtp_slot IS NULL OR smtp_slot IN ('smtp', 'smtp2'));

-- Supports the per-account "sent today" counts the quota dashboard runs.
CREATE INDEX IF NOT EXISTS idx_email_queue_slot_sent_at
  ON public.email_queue (smtp_slot, sent_at)
  WHERE sent_at IS NOT NULL;

-- Everything already delivered went out on the single pre-existing SMTP account,
-- which is now Account A. Stamping it makes today's usage explicit instead of
-- leaving it to the reader's NULL-means-Account-A rule.
UPDATE public.email_queue
SET smtp_slot = 'smtp'
WHERE smtp_slot IS NULL
  AND sent_at IS NOT NULL
  AND status IN ('Sent', 'Delivered');

-- 2. Raise the pooled quota to 4000 (2000 per account) and add the knobs the
--    router needs. Merged into the existing row so unrelated keys survive.
UPDATE public.email_routing_settings
SET value = value || '{
      "dailyQuota": 4000,
      "perAccountQuota": 2000,
      "failoverAfterFailures": 3
    }'::jsonb,
    description = 'Daily send capacity per SMTP account, pooled totals, and warning thresholds for outbound traffic.',
    updated_at = NOW()
WHERE key = 'quota_settings';

-- 3. Which SMTP account is currently active. Written by the UI toggle and by
--    automatic promotion after repeated non-transient failures.
INSERT INTO public.email_routing_settings (key, value, label, description, value_type, "group", sort_order)
VALUES
  ('active_smtp_slot', '"smtp"'::jsonb,
   'Active SMTP Account Slot',
   'Designates whether Account A (smtp) or Account B (smtp2) is the primary transport.',
   'text', 'provider', 105),

  ('smtp_failure_streak', '{ "slot": "smtp", "count": 0 }'::jsonb,
   'SMTP Consecutive Failure Streak',
   'Consecutive non-transient send failures on the active account. Reaching failoverAfterFailures promotes the backup.',
   'json', 'provider', 106)
ON CONFLICT (key) DO NOTHING;

-- 4. Give Account B a default shape so a fresh environment renders the second
--    slot instead of an empty form. Existing credentials are left untouched.
UPDATE public.email_routing_settings
SET value = jsonb_set(
      value,
      '{smtp2}',
      '{
        "host": "smtp.gmail.com",
        "port": 587,
        "username": "",
        "password": "",
        "senderEmail": "",
        "senderName": "Navgurukul Travel Desk",
        "replyTo": ""
      }'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE key = 'provider_config'
  AND NOT (value ? 'smtp2');
