-- Migration: Update portal_url to https://ng-travel-desk.vercel.app and update mail_templates with brand logo image

-- 1. Update email_routing_settings portal_url (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_routing_settings') THEN
    UPDATE public.email_routing_settings
    SET value = '"https://ng-travel-desk.vercel.app"'::jsonb
    WHERE key = 'portal_url';
  END IF;
END $$;

-- 2. Update existing mail_templates bodies: replace text h1 navgurukul with brand logo image
UPDATE public.mail_templates
SET body = REPLACE(
  body,
  '<h1 style="color:#FF6B35;margin:0;font-size:26px;font-weight:800;">navgurukul</h1>',
  '<img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />'
)
WHERE body LIKE '%<h1 style="color:#FF6B35;margin:0;font-size:26px;font-weight:800;">navgurukul</h1>%';

-- 3. Replace any hardcoded travel.navgurukul.org in mail_templates bodies
UPDATE public.mail_templates
SET body = REPLACE(
  body,
  'https://travel.navgurukul.org',
  'https://ng-travel-desk.vercel.app'
)
WHERE body LIKE '%https://travel.navgurukul.org%';
