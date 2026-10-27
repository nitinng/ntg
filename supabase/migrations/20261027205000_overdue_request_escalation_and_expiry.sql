-- =============================================================================
-- Migration: Overdue Request Escalation and Auto-Expiry
-- =============================================================================
-- Issue #12:
-- 1. If no action is taken on an open request, escalate to PnC before travel date
--    (lead time configured in email_routing_settings, default 24h).
-- 2. Once travel date passes without action, auto-expire the request
--    (pnc_status = 'Cancelled by System'), notify employee/manager/PnC once,
--    and stop all further reminders.
-- =============================================================================

-- 1. Add audit flag to travel_requests for overdue escalation
ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS is_overdue_escalated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS overdue_escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_expired_at TIMESTAMPTZ;

-- 2. Template for Overdue Escalation (PnC)
INSERT INTO public.mail_templates (
  template_key, name, subject, body, event, audience, context_key,
  from_status, to_status, cc_rule, sheet_row, is_active, is_draft, status, version
) VALUES (
  'overdue_request_escalation.pnc.default',
  'Urgent: Request Pending Action with Imminent Travel Date',
  '🚨 Urgent: Travel Request {{submissionId}} Pending Action - Travel in < {{escalation_lead_hours}}h',
  '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #ef4444;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#ef4444;margin:4px 0 0 0;font-size:13px;font-weight:700;">URGENT ESCALATION: OVERDUE REQUEST</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hello PnC Desk,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Travel request <strong>{{submissionId}}</strong> for <strong>{{requester_name}}</strong> has had no action taken and travel is scheduled for <strong>{{departure_date}}</strong> (within {{escalation_lead_hours}} hours).</p>
      <div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#991b1b;line-height:1.7;">
        <div><strong>Current Stage:</strong> {{current_status}}</div>
        <div><strong>Traveler:</strong> {{requester_name}} ({{requester_email}})</div>
        <div><strong>Approving Manager:</strong> {{manager_name}} ({{manager_email}})</div>
        <div><strong>Sector:</strong> {{origin}} &rarr; {{destination}}</div>
      </div>
      <p style="color:#334155;font-size:13px;">Please prioritize or resolve this ticket immediately. If the departure date passes with no booking, this request will be automatically expired.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="{{portal_url}}/?tab=requests" style="background-color:#ef4444;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">Open Desk Queue &rarr;</a>
      </div>
    </div>',
  'INFO_REQUEST_ESCALATED', 'pnc', NULL, 'Processing', 'Processing', 'default', '12a', true, false, 'Published', 1
) ON CONFLICT (template_key) DO UPDATE SET
  body = EXCLUDED.body,
  subject = EXCLUDED.subject,
  is_active = true,
  status = 'Published';

-- 3. Template for Auto-Expired Request (Employee / Manager / PnC)
INSERT INTO public.mail_templates (
  template_key, name, subject, body, event, audience, context_key,
  from_status, to_status, cc_rule, sheet_row, is_active, is_draft, status, version
) VALUES (
  'request_auto_expired.employee.default',
  'Notice: Travel Request Auto-Expired (Travel Date Passed)',
  'Notice: Travel Request {{submissionId}} Expired - Travel Date Passed',
  '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #64748b;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Expiry Notice</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Dear <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request <strong>{{submissionId}}</strong> for departure on <strong>{{departure_date}}</strong> has <strong>automatically expired</strong> because the travel date has passed without ticket issuance.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #64748b;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div><strong>Sector:</strong> {{origin}} to {{destination}}</div>
        <div><strong>Status:</strong> Expired / Cancelled by System</div>
        <div><strong>Manager:</strong> {{manager_name}}</div>
      </div>
      <p style="color:#334155;font-size:13px;">If you still require travel for revised dates, please submit a fresh booking request on the Travel Desk.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
  'INFO_REQUEST_EXPIRED', 'employee', NULL, 'Processing', 'Cancelled by System', 'default_manager', '12b', true, false, 'Published', 1
) ON CONFLICT (template_key) DO UPDATE SET
  body = EXCLUDED.body,
  subject = EXCLUDED.subject,
  is_active = true,
  status = 'Published';

-- 4. Overdue and Expiry sweep function
CREATE OR REPLACE FUNCTION public.scan_overdue_travel_requests()
RETURNS TABLE (ticket_id UUID, submission_id TEXT, action_taken TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r             public.travel_requests%ROWTYPE;
  v_lead_hours  NUMERIC;
  v_now         TIMESTAMPTZ := now();
  v_today       DATE := CURRENT_DATE;
  v_pnc_emails  TEXT[];
  v_tpl_esc     public.mail_templates%ROWTYPE;
  v_tpl_exp     public.mail_templates%ROWTYPE;
BEGIN
  v_lead_hours := GREATEST(1, COALESCE(public.email_setting_number('overdue_escalation_lead_hours', 24), 24));

  -- 1. Auto-expire unbooked requests whose travel date has passed
  FOR r IN
    SELECT * FROM public.travel_requests
     WHERE pnc_status IN ('Not Started', 'Approval Pending', 'Processing', 'On Hold', 'On Hold / Escalated')
       AND date_of_travel IS NOT NULL
       AND date_of_travel < v_today
       AND auto_expired_at IS NULL
     ORDER BY date_of_travel ASC
     LIMIT 100
  LOOP
    UPDATE public.travel_requests
       SET pnc_status = 'Cancelled by System',
           status_change_reason = 'Auto-expired: travel date passed without booking',
           auto_expired_at = v_now,
           updated_at = v_now,
           timeline = COALESCE(r.timeline, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object(
               'id', extract(epoch FROM v_now)::text || '-auto-expired',
               'timestamp', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
               'actor', 'System',
               'event', 'Request Auto-Expired',
               'details', 'Travel date passed without booking. All reminders halted.'
             )
           )
     WHERE id = r.id;

    INSERT INTO public.ticket_status_history (ticket_id, from_status, to_status, actor_role, reason)
    VALUES (r.id, r.pnc_status, 'Cancelled by System', 'System', 'Auto-expired: travel date passed without booking');

    -- Queue one-time expiry notice copying manager and PnC
    PERFORM public.queue_reminder_email(r, 'INFO_REQUEST_EXPIRED', 'employee', v_now, 0);

    ticket_id := r.id;
    submission_id := r.submission_id;
    action_taken := 'auto_expired';
    RETURN NEXT;
  END LOOP;

  -- 2. Escalate open requests approaching travel date within lead time
  FOR r IN
    SELECT * FROM public.travel_requests
     WHERE pnc_status IN ('Not Started', 'Approval Pending', 'Processing')
       AND date_of_travel IS NOT NULL
       AND date_of_travel >= v_today
       AND (date_of_travel - v_today) * 24 <= v_lead_hours
       AND is_overdue_escalated IS NOT TRUE
     ORDER BY date_of_travel ASC
     LIMIT 50
  LOOP
    UPDATE public.travel_requests
       SET is_overdue_escalated = true,
           overdue_escalated_at = v_now,
           updated_at = v_now,
           timeline = COALESCE(r.timeline, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object(
               'id', extract(epoch FROM v_now)::text || '-overdue-escalated',
               'timestamp', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
               'actor', 'System',
               'event', 'Escalated to PnC (Imminent Travel Date)',
               'details', format('Request is untouched with travel within %s hours.', v_lead_hours)
             )
           )
     WHERE id = r.id;

    PERFORM public.queue_reminder_email(r, 'INFO_REQUEST_ESCALATED', 'pnc', v_now, 0);

    ticket_id := r.id;
    submission_id := r.submission_id;
    action_taken := 'overdue_escalated';
    RETURN NEXT;
  END LOOP;

END;
$$;
