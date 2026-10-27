-- =============================================================================
-- Migration: Email Routing Recipients Seed & Lifecycle Notification Updates
-- =============================================================================
-- 1. Updates default_cc and global_email_cc with the approved 7 seed addresses:
--    - pranjal.t@navgurukul.org
--    - aayushi.b@navgurukul.org
--    - travel@navgurukul.org
--    - praveenlingam@navgurukul.org
--    - neha.p@navgurukul.org
--    - shreyamishra@navgurukul.org
--    - nitin.s@navgurukul.org
--    Removing all other addresses (dev team, volunteers@, nitin@, etc.).
-- 2. Adds overdue_escalation_lead_hours setting (default 24h).
-- 3. Adds/updates EMPLOYEE_CANCELLED_PRE_APPROVAL template for PnC desk.
-- 4. Adds MANAGER_APPROVAL_REQUEST template for direct manager approval on submit.
-- =============================================================================

-- 1. Update email_routing_settings default_cc
UPDATE public.email_routing_settings
SET value = jsonb_build_array(
  'pranjal.t@navgurukul.org',
  'aayushi.b@navgurukul.org',
  'travel@navgurukul.org',
  'praveenlingam@navgurukul.org',
  'neha.p@navgurukul.org',
  'shreyamishra@navgurukul.org',
  'nitin.s@navgurukul.org'
),
updated_at = now()
WHERE key = 'default_cc';

-- 2. Update settings global_email_cc
UPDATE public.settings
SET setting_value = jsonb_build_array(
  'pranjal.t@navgurukul.org',
  'aayushi.b@navgurukul.org',
  'travel@navgurukul.org',
  'praveenlingam@navgurukul.org',
  'neha.p@navgurukul.org',
  'shreyamishra@navgurukul.org',
  'nitin.s@navgurukul.org'
),
updated_at = now()
WHERE setting_key = 'global_email_cc';

-- 3. Overdue escalation lead hours setting
INSERT INTO public.email_routing_settings (key, value, label, description, value_type, "group", sort_order)
VALUES (
  'overdue_escalation_lead_hours',
  '24'::jsonb,
  'Overdue Escalation Lead Time (Hours)',
  'Hours before travel date to escalate pending untouched requests to PnC before auto-expiring.',
  'number',
  'routing',
  25
)
ON CONFLICT (key) DO UPDATE SET
  value = '24'::jsonb,
  updated_at = now();

-- 4. Template: Pre-approval cancellation sent to PnC
INSERT INTO public.mail_templates (
  template_key,
  name,
  subject,
  body,
  event,
  audience,
  context_key,
  from_status,
  to_status,
  cc_rule,
  sheet_row,
  is_active,
  is_draft,
  status,
  version
)
VALUES (
  'employee_cancelled_pre_approval.pnc.default',
  'Request Cancelled Before Manager Approval (PNC)',
  'Notice: Travel Request Cancelled Before Manager Approval - {{submissionId}}',
  '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hello PnC Team,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Travel request <strong>{{submissionId}}</strong> raised by <strong>{{requester_name}}</strong> has been <strong>cancelled</strong> by the employee before manager approval was completed.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #64748b;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div><strong>Traveler:</strong> {{requester_name}} ({{requester_email}})</div>
        <div><strong>Approving Manager:</strong> {{manager_name}} ({{manager_email}})</div>
        <div><strong>Sector:</strong> {{origin}} to {{destination}}</div>
        <div><strong>Travel Date:</strong> {{departure_date}}</div>
        <div><strong>Cancellation Reason:</strong> {{cancellation_reason}}</div>
      </div>
      <p style="color:#64748b;font-size:13px;">No further booking action or financial settlement is required for this ticket.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
  'EMPLOYEE_CANCELLED_PRE_APPROVAL',
  'pnc',
  NULL,
  'Approval Pending',
  'Cancelled by Employee',
  'default',
  '9b',
  true,
  false,
  'Published',
  1
)
ON CONFLICT (template_key) DO UPDATE SET
  body = EXCLUDED.body,
  subject = EXCLUDED.subject,
  is_active = true,
  status = 'Published';

-- 5. Template: Direct Manager Approval on Request Submit (update existing manager trigger)
UPDATE public.mail_templates
SET name = 'Action Required: Manager Approval for Travel Booking',
    subject = 'Action Required: Approve Travel for {{requester_name}} - {{submissionId}}',
    body = '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Approval Request</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Dear <strong>{{manager_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your direct reportee <strong>{{requester_name}}</strong> wants to book travel. Please review the details below and approve or reject this request.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div><strong>Request ID:</strong> {{submissionId}}</div>
        <div><strong>Sector:</strong> {{origin}} to {{destination}}</div>
        <div><strong>Travel Date:</strong> {{departure_date}}</div>
        <div><strong>Purpose:</strong> {{purpose}}</div>
        <div><strong>Mode:</strong> {{travel_mode}}</div>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="{{approval_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;box-shadow:0 2px 4px rgba(79,70,229,0.2);">Review and Approve Request &rarr;</a>
      </div>
      <p style="color:#64748b;font-size:12px;text-align:center;margin-top:16px;">
        To review our reimbursement policies: <a href="https://app.notion.com/p/navgurukul/Travel-Reimbursement-Policy-2026-37da93c7c39180e7ac27fa2ec5ebc528" style="color:#4F46E5;">Click here to read the travel policy</a>
      </p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    is_active = true,
    status = 'Published',
    version = version + 1
WHERE template_key = 'policy_violation_detected.manager.default';
