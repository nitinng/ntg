-- Migration: Fix RLS and seed routing settings for email pipeline
-- Supabase runs migrations in transactions; if 20260928050000 failed mid-way,
-- the INSERT templates succeeded but the RLS + routing settings may not have.
-- This migration patches those remaining gaps.

-- 1. Fix RLS on mail_templates: allow ALL authenticated users to read
--    (needed so resolveTemplate() works for any logged-in user, not just Admin/PNC)
DROP POLICY IF EXISTS "Staff view all templates" ON public.mail_templates;
CREATE POLICY "Staff view all templates"
  ON public.mail_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Fix RLS on email_queue INSERT: allow ANY authenticated user to queue emails
--    (the existing policy was TO authenticated but may be missing or superseded)
DROP POLICY IF EXISTS "System can insert to email queue" ON public.email_queue;
CREATE POLICY "System can insert to email queue" ON public.email_queue
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Seed missing routing defaults (skip if already present from prior migrations)
INSERT INTO public.email_routing_settings (key, value, label, description, value_type, "group", sort_order)
VALUES
  ('pnc_queue_email',      '"travel.desk@navgurukul.org"'::jsonb,
   'PNC Queue Email',      'Main PNC inbox for travel desk notifications',
   'text', 'routing', 1),

  ('support_email',        '"travel.desk@navgurukul.org"'::jsonb,
   'Support Email',        'Email address shown to employees for help',
   'text', 'routing', 3),

  ('portal_url',           '"https://ng-travel-desk.vercel.app"'::jsonb,
   'Portal URL',           'URL of the travel desk portal',
   'text', 'routing', 4),

  ('active_email_provider', '"smtp"'::jsonb,
   'Active Provider',      'Which outbound email provider to use',
   'text', 'provider', 10)
ON CONFLICT (key) DO NOTHING;
