-- =============================================================================
-- Refund-path mail templates
-- =============================================================================
-- Two templates the trigger sheet implies but the seed never carried:
--
-- 1. REFUND_PROCESS_STARTED / employee
--    A ticket entering "Pending Refund" previously sent nothing, so a traveller
--    whose booking was cancelled with money outstanding heard nothing between
--    the cancellation notice and the eventual settlement -- which is exactly
--    the window in which they want to know whether they owe anything. Reaches
--    the employee on both routes: the employee cancelling (P13) and the desk
--    cancelling (P15). Finance is copied through cc_rule rather than a second
--    audience, so this stays one mail with one idempotency key.
--
-- 2. NO_REFUND_REQUIRED / employee / context 'pnc_cancellation'
--    "Cancelled by PNC -> Reconciled" correctly raises NO_REFUND_REQUIRED, but
--    the only template for it was written for an employee who cancelled
--    themselves ("your cancelled trip"). Addressing it to someone whose trip
--    the *desk* cancelled reads as blame. Template resolution prefers an exact
--    (event, audience, context_key) match and falls back to the context-less
--    row, so adding this variant changes the PNC route and leaves the employee
--    route untouched.
--
-- Re-runnable: upserts on template_key, matching 20260928050000's format.
-- =============================================================================

INSERT INTO public.mail_templates (
  template_key, name, subject, body, event, audience, context_key,
  from_status, to_status, cc_rule, sheet_row, is_active, is_draft, status, version
)
VALUES
  (
    'refund_process_started.employee.default',
    'Refund Process Started',
    'Refund Underway for Your Cancelled Trip - {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your booking for {{origin}} to {{destination}} on {{departure_date}} has been cancelled, and we have started the refund process with the airline or operator.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Cancellation Charge:</strong> {{cancellation_charge}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Expected Refund:</strong> {{expected_refund}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Your Share:</strong> {{employee_owed_amount}}</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;"><strong>Do you need to do anything?</strong> No. You do not need to reply, raise a claim or follow up. Refunds are credited by the airline or operator and can take up to 7-10 working days to appear.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If "Your Share" above is more than zero, our Finance team will contact you separately about settling it. Nothing is due from you until they do.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We will email you again once the refund is confirmed and the request is closed. You can follow its progress here: {{portal_url}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Questions? Write to {{support_email}}.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'REFUND_PROCESS_STARTED', 'employee', NULL,
    NULL, 'Pending Refund', 'default_finance', '46', TRUE, FALSE, 'Published', 1
  ),
  (
    'no_refund_required.employee.pnc_cancellation',
    'Travel Settlement Closed (Desk Cancellation)',
    'Travel Settlement Closed: {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The travel desk cancelled your booking for {{origin}} to {{destination}} on {{departure_date}}, and we have now closed the request.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Final Settlement:</strong> No funds were recoverable on this booking.</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Amount Owed by You:</strong> Nothing. This cancellation was made by the travel desk and carries no cost to you.</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;"><strong>Do you need to do anything?</strong> No. Nothing is owed and no action is needed.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If you still need to travel, please raise a fresh request at {{portal_url}} and we will book it for you.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Questions about this cancellation? Write to {{support_email}}.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'NO_REFUND_REQUIRED', 'employee', 'pnc_cancellation',
    'Cancelled by PNC', 'Reconciled', 'default', '42', TRUE, FALSE, 'Published', 1
  )
ON CONFLICT (template_key) DO UPDATE SET
  name       = EXCLUDED.name,
  subject    = EXCLUDED.subject,
  body       = EXCLUDED.body,
  event      = EXCLUDED.event,
  audience   = EXCLUDED.audience,
  context_key= EXCLUDED.context_key,
  from_status= EXCLUDED.from_status,
  to_status  = EXCLUDED.to_status,
  cc_rule    = EXCLUDED.cc_rule,
  sheet_row  = EXCLUDED.sheet_row,
  is_active  = TRUE,
  is_draft   = FALSE,
  status     = 'Published',
  version    = public.mail_templates.version + 1,
  updated_at = NOW();
