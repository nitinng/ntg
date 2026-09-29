-- ============================================================
-- Migration: Email & Notification Center Infrastructure
-- Expands email queue status, adds audit logging, and seeds
-- multi-provider routing & quota configurations.
-- ============================================================

-- 1. Expand email_queue statuses to support complete delivery lifecycle
ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_status_check;
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_status_check 
  CHECK (status IN ('Pending', 'Processing', 'Sent', 'Delivered', 'Failed', 'Bounced', 'Cancelled', 'Queued', 'Sending'));

-- 2. Add delivery timestamps and metadata to email_queue
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_details JSONB;

-- 3. Audit trail for Email & Notification Center
CREATE TABLE IF NOT EXISTS public.email_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_email TEXT,
  actor_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.email_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view email audit logs" ON public.email_audit_logs;
CREATE POLICY "Staff can view email audit logs"
  ON public.email_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC')));

DROP POLICY IF EXISTS "Admins manage email audit logs" ON public.email_audit_logs;
CREATE POLICY "Admins manage email audit logs"
  ON public.email_audit_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'));

-- 4. Update value_type check constraint in email_routing_settings to allow 'json'
ALTER TABLE public.email_routing_settings DROP CONSTRAINT IF EXISTS email_routing_settings_value_type_check;
ALTER TABLE public.email_routing_settings ADD CONSTRAINT email_routing_settings_value_type_check
  CHECK (value_type IN ('email_list', 'number', 'text', 'boolean', 'json'));

-- 5. Seed multi-provider routing & quota settings
--    Credentials are intentionally blank. They are entered through the Email
--    Notification Center or supplied as edge-function secrets; this file is
--    public. The values originally seeded here were rotated after exposure.
--    (Redacted 2026-09-29; see 20260929130000_scrub_seeded_smtp_credentials.sql.)
INSERT INTO public.email_routing_settings (key, value, label, description, value_type, "group", sort_order)
VALUES
  ('active_email_provider', '"smtp"'::jsonb,
   'Active Email Provider',
   'Currently active outbound transport (smtp, ses, gmail, or resend).',
   'text', 'provider', 100),

  ('provider_config', '{
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "username": "",
      "password": "",
      "senderEmail": "travel@navgurukul.org",
      "senderName": "Navgurukul Travel Desk",
      "replyTo": "travel@navgurukul.org"
    },
    "ses": {
      "region": "ap-south-1",
      "smtpEndpoint": "email-smtp.ap-south-1.amazonaws.com:587",
      "accessKeyId": "",
      "configurationSet": "travel-desk-production",
      "senderEmail": "travel@navgurukul.org",
      "senderName": "Navgurukul Travel Desk",
      "replyTo": "travel@navgurukul.org"
    },
    "gmail": {
      "senderEmail": "travel@navgurukul.org",
      "senderName": "Navgurukul Travel Desk",
      "authorizedScope": "https://www.googleapis.com/auth/gmail.send"
    },
    "resend": {
      "senderEmail": "travel@navgurukul.org",
      "senderName": "Navgurukul Travel Desk"
    }
  }'::jsonb,
   'Provider Credentials & Settings',
   'Connection credentials and sender profiles for configured email providers.',
   'json', 'provider', 110),

  ('quota_settings', '{
    "dailyQuota": 2000,
    "warningThresholdPct": 80,
    "criticalThresholdPct": 95,
    "fallbackProvider": "ses"
  }'::jsonb,
   'Quota & Threshold Alerts',
   'Daily send capacity and warning thresholds for outbound traffic.',
   'json', 'quota', 120),

  ('domain_security_status', '{
    "domain": "navgurukul.org",
    "spf": { "status": "Valid", "record": "v=spf1 include:_spf.google.com ~all", "lastChecked": "2026-09-27T12:00:00Z" },
    "dkim": { "status": "Verified", "selector": "google._domainkey.navgurukul.org", "keyLength": "2048-bit RSA", "lastChecked": "2026-09-27T12:00:00Z" },
    "dmarc": { "status": "Valid", "policy": "p=reject", "record": "v=DMARC1; p=reject; rua=mailto:travel@navgurukul.org", "lastChecked": "2026-09-27T12:00:00Z" },
    "mx": { "status": "Active", "records": ["1 ASPMX.L.GOOGLE.COM", "5 ALT1.ASPMX.L.GOOGLE.COM"], "lastChecked": "2026-09-27T12:00:00Z" }
  }'::jsonb,
   'Domain Security Status',
   'Authentication records (SPF, DKIM, DMARC, MX) for navgurukul.org.',
   'json', 'security', 130)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  "group" = EXCLUDED."group",
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
