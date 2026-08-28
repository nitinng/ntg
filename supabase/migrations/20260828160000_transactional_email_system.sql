-- ============================================================
-- Migration: Complete Transactional Email System Setup
-- Includes:
-- 1. mail_templates enhancement (status, version)
-- 2. mail_template_history table (audit logging)
-- 3. global_email_cc seed in settings table
-- 4. Complete, production-ready default mail templates
-- ============================================================

-- 1. Enhance mail_templates table
ALTER TABLE public.mail_templates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Published';
ALTER TABLE public.mail_templates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE public.mail_templates ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'employee';

-- 2. Create mail_template_history table
CREATE TABLE IF NOT EXISTS public.mail_template_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.mail_templates(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL, -- 'Created', 'Edited', 'Published', 'Moved to Draft', 'Archived', 'Restored'
  previous_subject TEXT,
  new_subject TEXT,
  previous_body TEXT,
  new_body TEXT,
  previous_status TEXT,
  new_status TEXT,
  version INTEGER DEFAULT 1
);

-- RLS for mail_template_history
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

-- 3. Seed Global Email CC in settings table
INSERT INTO public.settings (setting_key, setting_value, created_at, updated_at)
VALUES (
  'global_email_cc',
  '["travel.team@navgurukul.org", "nitin.s@navgurukul.org"]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO NOTHING;

-- 4. Seed Production-Ready Mail Templates
-- Base CSS Styling for all Navgurukul templates
-- Orange & Indigo Brand Colors (#FF6B35 / #4F46E5)

-- Template 1: Request Received
INSERT INTO public.mail_templates (name, subject, status_trigger, audience, is_draft, status, version, body)
VALUES (
  'Request Received',
  'Travel Request Received - {{request_id}}',
  'Not Started',
  'employee',
  false,
  'Published',
  1,
  '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
      <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
      <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">Travel Desk Notification</p>
    </div>
    <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{requester_name}}</strong>,</p>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">Your travel request <strong>{{request_id}}</strong> has been received and logged in the system.</p>
    <div style="background-color: #f8fafc; border-left: 4px solid #4F46E5; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: bold;">Trip Overview</p>
      <div style="margin-top: 8px; font-size: 13px; color: #475569; line-height: 1.7;">
        <div><strong>From:</strong> {{origin}} → <strong>To:</strong> {{destination}}</div>
        <div><strong>Date of Travel:</strong> {{departure_date}}</div>
        <div><strong>Travel Mode:</strong> {{travel_mode}}</div>
        <div><strong>Purpose:</strong> {{purpose}}</div>
      </div>
    </div>
    <p style="color: #475569; font-size: 13px; line-height: 1.5;">Our operations team (PNC) will review your itinerary and initiate bookings. You will receive updates as your request progresses.</p>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
      Navgurukul Travel Desk • Automated System Notification
    </div>
  </div>'
)
ON CONFLICT (status_trigger) WHERE is_draft = FALSE DO UPDATE
SET subject = EXCLUDED.subject, body = EXCLUDED.body, audience = EXCLUDED.audience, status = EXCLUDED.status;

-- Template 2: Manager Approval Required
INSERT INTO public.mail_templates (name, subject, status_trigger, audience, is_draft, status, version, body)
VALUES (
  'Manager Approval Required',
  'Action Required: Travel Approval for {{requester_name}} - {{request_id}}',
  'Approval Pending',
  'manager',
  false,
  'Published',
  1,
  '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
      <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
      <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">Manager Approval Request</p>
    </div>
    <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{manager_name}}</strong>,</p>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;"><strong>{{requester_name}}</strong> has submitted a travel request that requires your managerial approval due to policy constraints.</p>
    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">⚠️ Policy Exception / Violation</p>
      <p style="margin: 6px 0 0 0; color: #b45309; font-size: 13px;">{{violation_reasons}}</p>
    </div>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: bold;">Request Details</p>
      <div style="margin-top: 8px; font-size: 13px; color: #475569; line-height: 1.7;">
        <div><strong>Request ID:</strong> {{request_id}}</div>
        <div><strong>Employee:</strong> {{requester_name}} ({{requester_email}})</div>
        <div><strong>Journey:</strong> {{origin}} → {{destination}}</div>
        <div><strong>Date:</strong> {{departure_date}} ({{travel_mode}})</div>
        <div><strong>Purpose:</strong> {{purpose}}</div>
      </div>
    </div>
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{portal_url}}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Review & Approve in Portal</a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
      Navgurukul Travel Desk • Automated Manager Approval Routing
    </div>
  </div>'
)
ON CONFLICT (status_trigger) WHERE is_draft = FALSE DO UPDATE
SET subject = EXCLUDED.subject, body = EXCLUDED.body, audience = EXCLUDED.audience, status = EXCLUDED.status;

-- Template 3: Request Approved
INSERT INTO public.mail_templates (name, subject, status_trigger, audience, is_draft, status, version, body)
VALUES (
  'Request Approved',
  'Travel Request Approved - {{request_id}}',
  'Approved',
  'employee',
  false,
  'Published',
  1,
  '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
      <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
    </div>
    <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{requester_name}}</strong>,</p>
    <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #065f46; font-weight: bold; font-size: 14px;">✓ Manager Approval Granted</p>
      <p style="margin: 6px 0 0 0; color: #047857; font-size: 13px;">Your travel request has been approved by your manager and forwarded to PNC for booking.</p>
    </div>
    <div style="margin: 20px 0; font-size: 13px; color: #475569; line-height: 1.7;">
      <div><strong>Request ID:</strong> {{request_id}}</div>
      <div><strong>Route:</strong> {{origin}} → {{destination}} on {{departure_date}}</div>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
      Navgurukul Travel Desk
    </div>
  </div>'
)
ON CONFLICT (status_trigger) WHERE is_draft = FALSE DO UPDATE
SET subject = EXCLUDED.subject, body = EXCLUDED.body, audience = EXCLUDED.audience, status = EXCLUDED.status;

-- Template 4: Travel Booked
INSERT INTO public.mail_templates (name, subject, status_trigger, audience, is_draft, status, version, body)
VALUES (
  'Travel Booked',
  '✈️ Confirmed Travel Itinerary - {{request_id}}',
  'Booked',
  'employee',
  false,
  'Published',
  1,
  '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
      <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
      <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">Booking Confirmation & Itinerary</p>
    </div>
    <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{requester_name}}</strong>,</p>
    <p style="color: #334155; font-size: 14px; line-height: 1.6;">Great news! Your travel tickets have been booked and confirmed by the PNC team.</p>
    <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #065f46; font-weight: bold; font-size: 14px;">🎉 Confirmed Booking Details</p>
      <div style="margin-top: 8px; font-size: 13px; color: #047857; line-height: 1.7;">
        <div><strong>Booking / PNR Ref:</strong> {{booking_reference}}</div>
        <div><strong>Vendor / Provider:</strong> {{vendor_name}}</div>
        <div><strong>Ticket Cost:</strong> ₹{{ticket_cost}}</div>
        <div><strong>Journey:</strong> {{origin}} → {{destination}}</div>
        <div><strong>Date of Travel:</strong> {{departure_date}} ({{travel_mode}})</div>
      </div>
    </div>
    <p style="color: #475569; font-size: 13px; line-height: 1.5;">Please download your ticket or invoice attachments directly from your travel dashboard before departure.</p>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
      Navgurukul Travel Desk • Have a safe journey!
    </div>
  </div>'
)
ON CONFLICT (status_trigger) WHERE is_draft = FALSE DO UPDATE
SET subject = EXCLUDED.subject, body = EXCLUDED.body, audience = EXCLUDED.audience, status = EXCLUDED.status;
