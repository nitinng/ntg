-- =============================================================================
-- Scrub seeded SMTP/SES credentials from email_routing_settings
-- =============================================================================
-- 20260927140000 seeded live AWS SES SMTP credentials into provider_config, and
-- that file sits in a public repository. The literals have been redacted at
-- source; this clears the values already written to the database.
--
-- Removing them here does NOT undo the exposure — the credentials are in git
-- history and must be rotated in AWS independently of this migration.
-- =============================================================================

-- Account A: only reset the slot if it still holds the leaked seed. A host that
-- no longer points at the AWS Mail Manager ingress endpoint means an operator
-- has since entered their own credentials, which must be left alone.
UPDATE public.email_routing_settings
SET value = jsonb_set(
      value,
      '{smtp}',
      (value -> 'smtp')
        || jsonb_build_object('host', 'smtp.gmail.com', 'username', '', 'password', ''),
      true
    ),
    updated_at = NOW()
WHERE key = 'provider_config'
  AND value -> 'smtp' ->> 'host' LIKE '%mail-manager-smtp%';

-- SES: the seeded access key is exposed regardless of later edits.
UPDATE public.email_routing_settings
SET value = jsonb_set(
      value,
      '{ses}',
      (value -> 'ses')
        || jsonb_build_object('accessKeyId', '', 'secretAccessKey', ''),
      true
    ),
    updated_at = NOW()
WHERE key = 'provider_config'
  AND value ? 'ses'
  AND COALESCE(value -> 'ses' ->> 'accessKeyId', '') <> '';

INSERT INTO public.email_audit_logs (action, actor_email, actor_name, details)
VALUES (
  'Seeded SMTP Credentials Scrubbed',
  'migration',
  'Database Migration',
  jsonb_build_object(
    'reason', 'Credentials were committed to a public repository',
    'requiresRotation', true,
    'migration', '20260929130000'
  )
);
