-- =============================================================================
-- Trip completed: the closing mail
-- =============================================================================
-- Reaching "Closed" sent nothing, so a trip ended without acknowledgement and
-- without anyone asking the traveller for their expenses.
--
-- Scope: the mail is raised by the *transition*, not by whoever caused it, so
-- it fires whether PNC closes the request by hand or a future automatic close
-- does it when the travel date passes. That question is still open and nothing
-- here depends on its answer.
--
-- It does NOT fire for every close. "Closed" is reachable from six stages and
-- five are cancellation or reconciliation tails, so the trigger is gated on
-- the two that mean a trip actually happened (Booked, Booked / Partially
-- Cancelled). Prompting someone for the expenses of a journey they never took
-- -- because the desk cancelled it, or the SLA expired -- would be worse than
-- the silence this replaces.
--
-- Re-runnable: upserts on template_key.
-- =============================================================================

INSERT INTO public.mail_templates (
  template_key, name, subject, body, event, audience, context_key,
  from_status, to_status, cc_rule, sheet_row, is_active, is_draft, status, version
)
VALUES
  (
    'trip_completed.employee.default',
    'Trip Completed',
    'Your Trip is Complete - {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We hope your trip from {{origin}} to {{destination}} went well. This request is now closed, and no further booking action is needed.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #10b981;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}} ({{travel_mode}})</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Travel Date:</strong> {{departure_date}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Purpose:</strong> {{purpose}}</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;"><strong>One thing left to do.</strong> If you spent anything of your own on this trip -- local travel, meals, or anything else your team reimburses -- please submit those expenses now. Claims are much harder to process once a trip has been closed for a while.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If you spent nothing out of pocket, there is nothing to do and you can ignore this.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">You can review this trip any time at {{portal_url}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Questions? Write to {{support_email}}.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'TRIP_COMPLETED', 'employee', NULL,
    'Booked', 'Closed', 'default', '55', TRUE, FALSE, 'Published', 1
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
