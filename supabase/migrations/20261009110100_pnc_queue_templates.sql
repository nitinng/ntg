-- =============================================================================
-- PNC queue notifications, the Critical priority flag, and the booking-mail CC
-- =============================================================================
-- 3a. The desk is told when work reaches its queue. Two events put it there:
--     POLICY_EVALUATION_PASSED (a request that cleared policy) and
--     APPROVAL_COMPLETED (one the manager has just approved). Resubmissions
--     arrive through the first of these -- a resubmitted request re-runs policy
--     evaluation -- so they need no separate trigger.
--
-- 3b. Priority is a template *variant* rather than a separate event, so PNC
--     cannot be double-mailed: resolveTemplate returns exactly one row per
--     (event, audience), preferring the context-specific one and falling back
--     to the context-less default. A desk that never seeds the Critical variant
--     still gets the ordinary queue mail; it cannot get both.
--
-- 3d. BOOKING_CONFIRMED copies the manager when they approved the request. No
--     new mail -- just the cc_rule, which resolveCc already implements as
--     'default_manager_if_approved' (defaults + manager only when
--     approvingManagerEmail and managerApprovalDate are both set).
--
-- Re-runnable: upserts on template_key; the 3d statement is a plain UPDATE.
-- =============================================================================

INSERT INTO public.mail_templates (
  template_key, name, subject, body, event, audience, context_key,
  from_status, to_status, cc_rule, sheet_row, is_active, is_draft, status, version
)
VALUES
  (
    'policy_evaluation_passed.pnc.default',
    'New Request in Queue',
    'New Travel Request to Book - {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Queue</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">A travel request has cleared policy and is waiting to be booked.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Traveller:</strong> {{requester_name}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}} ({{travel_mode}})</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Travel Date:</strong> {{departure_date}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Priority:</strong> {{priority}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Booking Target:</strong> {{sla_target_hours}} hours</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Open it to claim and book: {{portal_url}}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'POLICY_EVALUATION_PASSED', 'pnc', NULL,
    'Not Started', 'Processing', 'default', '4', TRUE, FALSE, 'Published', 1
  ),
  (
    'policy_evaluation_passed.pnc.priority_critical',
    'Priority Request in Queue',
    '[PRIORITY] Travel on {{departure_date}} - book within {{sla_target_hours}}h - {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:2px solid #dc2626;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #dc2626;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#dc2626;margin:4px 0 0 0;font-size:13px;font-weight:700;">Priority - Imminent Travel</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">This request is travelling on <strong>{{departure_date}}</strong> ({{days_remaining}} day(s) away) and needs booking within <strong>{{sla_target_hours}} hours</strong>.</p>
      <div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Traveller:</strong> {{requester_name}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}} ({{travel_mode}})</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Travel Date:</strong> {{departure_date}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Priority:</strong> {{priority}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Booking Target:</strong> {{sla_target_hours}} hours from now</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Claim and book it here: {{portal_url}}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'POLICY_EVALUATION_PASSED', 'pnc', 'priority_critical',
    'Not Started', 'Processing', 'default', '4', TRUE, FALSE, 'Published', 1
  ),
  (
    'approval_completed.pnc.default',
    'Approved Request in Queue',
    'Manager-Approved Request to Book - {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Queue</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{manager_name}} has approved a travel request that fell outside policy. It is now waiting to be booked.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Traveller:</strong> {{requester_name}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Approved By:</strong> {{manager_name}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}} ({{travel_mode}})</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Travel Date:</strong> {{departure_date}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Priority:</strong> {{priority}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Booking Target:</strong> {{sla_target_hours}} hours</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Open it to claim and book: {{portal_url}}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'APPROVAL_COMPLETED', 'pnc', NULL,
    'Approved', 'Processing', 'default', '14', TRUE, FALSE, 'Published', 1
  ),
  (
    'approval_completed.pnc.priority_critical',
    'Priority Approved Request in Queue',
    '[PRIORITY] Approved - travel on {{departure_date}}, book within {{sla_target_hours}}h - {{submissionId}}',
    '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:2px solid #dc2626;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #dc2626;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#dc2626;margin:4px 0 0 0;font-size:13px;font-weight:700;">Priority - Imminent Travel</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{manager_name}} has just approved this request, and it is travelling on <strong>{{departure_date}}</strong> ({{days_remaining}} day(s) away). It needs booking within <strong>{{sla_target_hours}} hours</strong>.</p>
      <div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;">
        <div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Traveller:</strong> {{requester_name}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Approved By:</strong> {{manager_name}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}} ({{travel_mode}})</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Travel Date:</strong> {{departure_date}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Priority:</strong> {{priority}}</div>
        <div style="margin:4px 0;"><strong style="color:#334155;">Booking Target:</strong> {{sla_target_hours}} hours from now</div>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Claim and book it here: {{portal_url}}</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>',
    'APPROVAL_COMPLETED', 'pnc', 'priority_critical',
    'Approved', 'Processing', 'default', '14', TRUE, FALSE, 'Published', 1
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

-- 3d. Copy the approving manager on the booking confirmation, when there was
-- one. Scoped to the employee-facing rows so a future PNC or manager variant of
-- this event is not silently re-routed.
UPDATE public.mail_templates
   SET cc_rule = 'default_manager_if_approved',
       updated_at = NOW()
 WHERE event = 'BOOKING_CONFIRMED'
   AND audience = 'employee'
   AND cc_rule IS DISTINCT FROM 'default_manager_if_approved';
