-- ============================================================================
-- Seed: Travel Desk lifecycle mail templates
--
-- GENERATED FILE - do not edit by hand.
--   source : "Travel Desk Stages- mails - Triggers.xlsx" (Final tab)
--   mapping: scripts/email-templates/mapping.json
--   regen  : python scripts/email-templates/generate_seed.py
--
-- 40 templates across 26 trigger events.
-- The sheet's "Revised Email Template" column is the source of truth; the original
-- "Email Template" column is the fallback where a row carries no revised copy.
--
-- Rows that deliberately send no email (recorded so the absence is intentional):
--   row 1    REQUEST_SUBMITTED - next transition carries the notification
--   row 6    APPROVAL_COMPLETED - row 5 already told the employee
--   row 10   REQUEST_EDIT_STARTED
--   row 11   REQUEST_RESUBMITTED - re-evaluation result carries it
--   row 16   REQUEST_EDIT_STARTED
--   row 17   REQUEST_RESUBMITTED
--   row 20   PNC_STARTED_PROCESSING - employee already told at row 4/14/19
--   row 30   TICKET_DOCUMENT_REPLACED - deliberately silent, document housekeeping
--   row 31   BOOKING_DETAIL_EDITED - non-material edit
--   row 32   merged into rows 23 and 24
--   row 34   CANCELLATION_CLOSED_PRE_BOOKING - row 33 closed it out
--   row 36   CANCELLATION_REQUEST_ASSIGNED - merged into row 23
--   row 38   REFUND_PROCESS_STARTED - row 37 already said recovery underway
--   row 41   REFUND_PROCESS_STARTED
--   row 42   NO_REFUND_REQUIRED after PNC cancellation - row 40 already covered it
--   row 44   SEGMENT_REFUND_PENDING
--   row 54   TRAVEL_DATE_REACHED
--   row 55   TRIP_COMPLETED - deliberate, carries no action
--   row 58   BOOKING_DOCUMENT_UPDATED - document housekeeping
-- ============================================================================

-- Update audience check constraint to permit all lifecycle audiences
ALTER TABLE public.mail_templates DROP CONSTRAINT IF EXISTS chk_mail_templates_audience;
ALTER TABLE public.mail_templates ADD CONSTRAINT chk_mail_templates_audience
  CHECK (audience IN ('employee', 'manager', 'pnc', 'finance', 'escalation_owner'));

-- Retire any previously seeded lifecycle template that is no longer in the sheet,
-- so a re-run of the generator cannot leave orphans firing in production.
UPDATE public.mail_templates
   SET status = 'Archived', is_active = FALSE, updated_at = NOW()
 WHERE sheet_row IS NOT NULL
   AND template_key NOT IN ('policy_violation_detected.employee.default', 'policy_violation_detected.manager.default', 'policy_evaluation_passed.employee.default', 'manager_approved.employee.default', 'manager_rejected.employee.default', 'employee_cancelled_pre_approval.employee.default', 'employee_cancelled_pre_approval.manager.default', 'policy_violation_detected.employee.resubmit_after_manager_rejection', 'policy_violation_detected.manager.resubmit_after_manager_rejection', 'policy_evaluation_passed.employee.resubmit_after_manager_rejection', 'pnc_rejected.employee.default', 'policy_violation_detected.employee.resubmit_after_pnc_rejection', 'policy_violation_detected.manager.resubmit_after_pnc_rejection', 'policy_evaluation_passed.employee.resubmit_after_pnc_rejection', 'info_requested.employee.default', 'booking_confirmed.employee.default', 'cancellation_requested.pnc.default', 'cancellation_requested.employee.default', 'cancellation_requested.employee.post_booking', 'info_provided.pnc.default', 'info_request_reminder_24h.employee.default', 'info_request_reminder_72h.employee.default', 'info_request_escalated.escalation_owner.default', 'info_request_expired.employee.default', 'booking_updated.employee.default', 'cancellation_processed_employee.employee.default', 'cancellation_processed_employee.employee.post_booking', 'no_refund_required.employee.default', 'pnc_cancellation.employee.default', 'partial_cancellation.employee.default', 'segment_refund_completed.employee.default', 'partial_refund_received.employee.default', 'refund_completed.employee.default', 'refund_completed.employee.after_partial_refund', 'refund_written_off.employee.default', 'refund_written_off.employee.after_partial_refund', 'refund_reconciliation_completed.employee.default', 'refund_reconciliation_completed.employee.after_write_off', 'refund_disputed.finance.default', 'retroactive_booking_recorded.employee.default');

INSERT INTO public.mail_templates
  (template_key, name, subject, body, event, audience, context_key,
   from_status, to_status, cc_rule, sheet_row, sheet_summary,
   status, is_draft, is_active, version)
SELECT v.template_key, v.name, v.subject, v.body, v.event, v.audience, v.context_key,
       v.from_status, v.to_status, v.cc_rule, v.sheet_row, v.sheet_summary,
       'Published', FALSE, TRUE, 1
FROM (VALUES
  ('policy_violation_detected.employee.default', 'Travel Request Received', 'Travel Request Received - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Thanks for submitting your travel request! We''ve received your booking details for {{origin}} to {{destination}} on {{departure_date}} ({{travel_mode}}).</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Since a few details fall outside our standard policy, we''ve forwarded your request to {{manager_name}} for approval: {{violation_reasons}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is needed from you right now. As soon as it''s approved, our travel desk will start booking and update you.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Trip Summary</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Request ID:</strong> {{submissionId}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}} ({{travel_mode}})</div><div style="margin:4px 0;"><strong style="color:#334155;">Departure Date:</strong> {{departure_date}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Purpose:</strong> {{purpose}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">You can check the status of your request anytime here: Track Your Request</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Safe travels ahead,</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_VIOLATION_DETECTED', 'employee', NULL, 'Not Started', 'Approval Pending', 'default', '2', 'Confirms we have the request, names the specific policy breach and the manager it has gone to, and makes clear no action is needed from the employee.'),
  ('policy_violation_detected.manager.default', 'Approval Needed: Travel Request for (Manager)', 'Approval Needed: Travel Request for {{requester_name}} - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Manager Action Required</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{requester_name}} has submitted a travel request from {{origin}} to {{destination}} on {{departure_date}} ({{travel_mode}}) for {{purpose}}.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Since a few details fall outside our standard policy, this request requires your review:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Click below to review-if you''re not signed in, you''ll be prompted to log in and taken straight to the request.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Review and Approve Request</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_VIOLATION_DETECTED', 'manager', NULL, 'Not Started', 'Approval Pending', 'default', '3', 'Gives the manager the violation and the full trip in the mail body so most approvals need no click-through. Subject names the employee so it can be triaged from the inbox.'),
  ('policy_evaluation_passed.employee.default', 'Your Travel Request is Being Processed', 'Your Travel Request is Being Processed - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request for {{origin}} to {{destination}} on {{departure_date}} ({{travel_mode}}) is within policy, so our travel desk is already working on booking your tickets.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is needed from you right now. We''ll share your confirmed tickets as soon as they''re ready.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If your plans change in the meantime, please edit or cancel your request directly on the portal rather than replying to this email:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Track or Manage Your Request</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Safe travels ahead,</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_EVALUATION_PASSED', 'employee', NULL, 'Not Started', 'Processing', 'default', '4', 'Explains why no approval was needed, sets the expectation of tickets by mail, and points changes at the travel desk rather than a reply.'),
  ('manager_approved.employee.default', 'Great news! Your Travel Request is Approved', 'Great news! Your Travel Request is Approved - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Great news-{{manager_name}} has approved your travel request for {{origin}} to {{destination}} on {{departure_date}} ({{travel_mode}})!</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Our travel desk is now working on securing your bookings, and we''ll email your confirmed tickets as soon as they''re ready.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">You can follow along or view your details here:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">View Your Request</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Safe travels ahead,</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'MANAGER_APPROVED', 'employee', NULL, 'Approval Pending', 'Approved', 'default', '5', 'Names the approver and hands off to the booking expectation.'),
  ('manager_rejected.employee.default', 'Update on Your Travel Request', 'Update on Your Travel Request - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{manager_name}} has reviewed your travel request for {{origin}} to {{destination}} on {{departure_date}} and was unable to approve it at this time.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Reason provided:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{rejection_reason}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Next Steps:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">You can update your itinerary to align with our policy and send it back over. If the updated request falls within standard policy, it will go straight to our travel desk for booking without needing a second review!</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Edit and Resubmit Request</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Here to help if you need anything,</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'MANAGER_REJECTED', 'employee', NULL, 'Approval Pending', 'Rejected by Manager', 'default', '7', 'Carries the rejection reason and explains that a compliant resubmission skips approval entirely.'),
  ('employee_cancelled_pre_approval.employee.default', 'Cancelled: Travel Request', 'Cancelled: Travel Request - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request ({{submissionId}}) has been successfully cancelled as requested.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Manager notified:</strong> {{manager_name}} has been updated; no approval action is required.</div><div style="margin:4px 0;"><strong style="color:#334155;">Cost status:</strong> No tickets or accommodations were booked, so no cancellation fees or amounts are owed.</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Need to plan a different trip?</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Raise a New Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'EMPLOYEE_CANCELLED_PRE_APPROVAL', 'employee', NULL, 'Approval Pending', 'Cancelled by Employee', 'default', '8', 'Confirms withdrawal, confirms the manager has been stood down, and states plainly that there is nothing to settle.'),
  ('employee_cancelled_pre_approval.manager.default', 'No Action Needed: Travel Approval Withdrawn (Manager)', 'No Action Needed: Travel Approval Withdrawn - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Manager Action Required</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{requester_name}} has withdrawn travel request {{submissionId}}.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The pending approval in your queue has been closed, and no further action is required from your side.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'EMPLOYEE_CANCELLED_PRE_APPROVAL', 'manager', NULL, 'Approval Pending', 'Cancelled by Employee', 'default', '9', 'Closes the loop on the action mail the manager already received.'),
  ('policy_violation_detected.employee.resubmit_after_manager_rejection', 'Update: Travel Request Received', 'Update: Travel Request Received - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We have received your updated travel request ({{submissionId}}).</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">However, the details still fall outside standard travel policy, it has been routed back to {{manager_name}} for exception approval.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Policy exceptions:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is needed from you right now. We will notify you as soon as your manager reviews the request.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Track Your Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_VIOLATION_DETECTED', 'employee', 'resubmit_after_manager_rejection', 'Not Started', 'Approval Pending', 'default', '12', 'FIXED: subject was the manager-facing ''Approval Required'' on an employee row. Copy now says ''still'' so it reads as a resubmission rather than a duplicate of row 2.'),
  ('policy_violation_detected.manager.resubmit_after_manager_rejection', 'Action Required: Resubmitted Travel Approval for (Manager)', 'Action Required: Resubmitted Travel Approval for {{requester_name}} - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Manager Action Required</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{requester_name}} has updated and resubmitted travel request {{submissionId}}. As it still falls outside standard travel policy, it requires your review and approval.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Policy Exception(s):</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Trip Overview:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} → {{destination}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Date &amp; Mode:</strong> {{departure_date}} via {{travel_mode}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Purpose:</strong> {{purpose}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Review Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_VIOLATION_DETECTED', 'manager', 'resubmit_after_manager_rejection', 'Not Started', 'Approval Pending', 'default', '13', 'Says ''revised and resubmitted'' so the manager does not mistake it for the mail they already actioned.'),
  ('policy_evaluation_passed.employee.resubmit_after_manager_rejection', 'In Progress: Travel Request Sent for Booking', 'In Progress: Travel Request Sent for Booking - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Great news! Your updated travel request ({{submissionId}}) now aligns with company travel policy.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">It has been sent directly to the travel desk for booking-no additional manager approval is needed. We will follow up with your confirmed tickets as soon as they are issued.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Track Your Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_EVALUATION_PASSED', 'employee', 'resubmit_after_manager_rejection', 'Not Started', 'Processing', 'default', '14', 'Confirms the edit fixed the problem, which is the reassurance the employee is waiting for.'),
  ('pnc_rejected.employee.default', 'Action Required: Update Needed for Travel Request', 'Action Required: Update Needed for Travel Request - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The travel desk is currently unable to proceed with booking your travel request ({{submissionId}}).</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Reason:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{rejection_reason}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Please update and resubmit your details. Once submitted, it will be re-evaluated against policy and sent directly back to our team for booking if it clears.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Edit and Resubmit Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'PNC_REJECTED', 'employee', NULL, 'Processing', 'Rejected by PNC', 'default', '15', 'Typos in the original summary fixed. Tells the employee what happens after they resubmit.'),
  ('policy_violation_detected.employee.resubmit_after_pnc_rejection', 'Update: Travel Request Received', 'Update: Travel Request Received - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We have received your updated travel request ({{submissionId}}).</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">However, the details still fall outside standard travel policy, it has been routed back to {{manager_name}} for exception approval.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Policy exceptions:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is needed from you right now. We will notify you as soon as your manager reviews the request.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Track Your Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_VIOLATION_DETECTED', 'employee', 'resubmit_after_pnc_rejection', 'Not Started', 'Approval Pending', 'default', '18a', 'FIXED: subject was the manager-facing ''Approval Required'' on an employee row. Copy now says ''still'' so it reads as a resubmission rather than a duplicate of row 2.'),
  ('policy_violation_detected.manager.resubmit_after_pnc_rejection', 'Action Required: Resubmitted Travel Approval for (Manager)', 'Action Required: Resubmitted Travel Approval for {{requester_name}} - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Manager Action Required</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{requester_name}} has updated and resubmitted travel request {{submissionId}}. As it still falls outside standard travel policy, it requires your review and approval.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Policy Exception(s):</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Trip Overview:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} → {{destination}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Date &amp; Mode:</strong> {{departure_date}} via {{travel_mode}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Purpose:</strong> {{purpose}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Review Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_VIOLATION_DETECTED', 'manager', 'resubmit_after_pnc_rejection', 'Not Started', 'Approval Pending', 'default', '18b', 'Says ''revised and resubmitted'' so the manager does not mistake it for the mail they already actioned.'),
  ('policy_evaluation_passed.employee.resubmit_after_pnc_rejection', 'In Progress: Travel Request Returned for Booking', 'In Progress: Travel Request Returned for Booking - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Great news! Your updated travel request ({{submissionId}}) now meets travel policy and is back with the travel desk for booking.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No further action is needed from your side. We will follow up with your confirmed tickets as soon as they are issued.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Track Your Request</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'POLICY_EVALUATION_PASSED', 'employee', 'resubmit_after_pnc_rejection', 'Not Started', 'Processing', 'default', '19', 'FIXED: the summary here was the cancellation text copied from row 9.'),
  ('info_requested.employee.default', 'Action Required: Details Needed to Complete Booking', 'Action Required: Details Needed to Complete Booking - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Booking for your travel request ({{submissionId}}) is temporarily on hold as we need a few additional details from you.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Information Needed:</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{information_requested}}</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We will resume booking as soon as you update the details. Because fares and seat availability change rapidly, please respond at your earliest to secure the best option.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">(If your plans have changed, you can cancel the request directly from the dashboard to close it out.)</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Provide Details</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'INFO_REQUESTED', 'employee', NULL, 'Processing', 'On Hold', 'default', '21', 'States exactly what is needed, gives the honest reason speed matters, and offers cancellation as the alternative to replying.'),
  ('booking_confirmed.employee.default', 'Booking Confirmation', 'Booking Confirmation: {{origin}} to {{destination}} (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your booking is confirmed. Here are your itinerary details:</p>
      <ul style="margin:12px 0;padding-left:20px;color:#475569;font-size:13px;line-height:1.8;"><li>Route: {{origin}} to {{destination}}</li><li>Date: {{departure_date}}</li><li>Travel Mode: {{travel_mode}}</li><li>Reference ID: {{booking_reference}}</li></ul>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Next Steps &amp; Important Information:</p>
      <ol style="margin:12px 0;padding-left:20px;color:#475569;font-size:13px;line-height:1.8;"><li>Download Your Ticket: Retrieve your ticket directly from the Travel Desk. Note that tickets are not attached to this email.</li><li>Changes &amp; Cancellations: Submit all modifications or cancellation requests through the Travel Desk</li></ol>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'BOOKING_CONFIRMED', 'employee', NULL, 'Processing', 'Booked', 'default', '22', 'FIXED: the original promised an attached ticket. The sender builds a single-part HTML message and the queue has no attachments column, so that promise cannot be kept. This links instead and says so. Also warns against dealing with the vendor directly.'),
  ('cancellation_requested.pnc.default', 'Action Required: Cancellation Request (PNC)', 'Action Required: Cancellation Request - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Operations</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi Team,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{requester_name}} has requested to cancel travel request {{submissionId}}.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Request Details:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Current Status:</strong> {{current_status}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Journey:</strong> {{origin}} → {{destination}} ({{departure_date}})</div><div style="margin:4px 0;"><strong style="color:#334155;">Booking Reference:</strong> {{booking_reference}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Reason:</strong> {{cancellation_reason}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Next Steps:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">If Booked:</strong> Initiate cancellation and log the refund details.</div><div style="margin:4px 0;"><strong style="color:#334155;">If Processing / On Hold:</strong> No booking was made; you may close out the request directly.</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Process Cancellation</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'CANCELLATION_REQUESTED', 'pnc', NULL, 'Processing', 'Cancellation Requested', 'default', '23', 'MERGED: rows 23, 32, 35 and 36 all fired on entry to Cancellation Requested. This is now the single PNC-facing mail for all of them. Carries the current state so PNC knows whether a vendor cancellation is involved before opening the app.'),
  ('cancellation_requested.employee.default', 'Cancellation Request Received (ID', 'Cancellation Request Received (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We have received your cancellation request for request {{submissionId}}.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">As no booking was finalized, no fees apply. The Travel Desk is closing your request.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Track Request:</strong> Monitor status on the Travel Desk.</div><div style="margin:4px 0;"><strong style="color:#334155;">Urgent Support:</strong> Reach out at | {{support_email}} ({{support_slack_channel}).</div></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'CANCELLATION_REQUESTED', 'employee', NULL, 'Processing', 'Cancellation Requested', 'default', '24', 'FIXED: subject was the PNC action subject on an employee row, and ''translation request'' was a typo for ''cancellation request''. MERGED with rows 32 and 35.'),
  ('cancellation_requested.employee.post_booking', 'Cancellation Request Received (ID', 'Cancellation Request Received (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We have received your cancellation request for trip {{submissionId}}.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The Travel Desk is processing the cancellation with the service provider to recover funds from your original fare ({{original_fare}}). Note that standard cancellation fees may apply.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We will share a settlement statement once processing is complete. No further action is required at this time.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Track Request: View updates on the Travel Desk.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'CANCELLATION_REQUESTED', 'employee', 'post_booking', 'Booked', 'Cancellation Requested', 'default', '35', 'MERGED into rows 23 and 24 for the PNC mail, but the employee copy differs here because a booked ticket may attract a charge. Row 23 handles PNC unchanged.'),
  ('info_provided.pnc.default', 'Response Received: Travel Request (PNC)', 'Response Received: Travel Request {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Operations</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi Team,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{requester_name}} has responded to your inquiry regarding request {{submissionId}}.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Requested Information:</strong> {{information_requested}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Employee Response:</strong> "{{employee_response}}"</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">This request is no longer on hold and is back in your queue for processing.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Next Step: Resume processing on the Travel Desk</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'INFO_PROVIDED', 'pnc', NULL, 'On Hold', 'Processing', 'default', '25', 'Quotes the response inline so PNC can often act without opening the app.'),
  ('info_request_reminder_24h.employee.default', 'Reminder: Information Needed for', 'Reminder: Information Needed for {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request {{submissionId}} has been on hold for 24 hours. We need the following details to proceed with your booking:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Required Information:</strong> {{information_requested}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Please provide these details promptly so we can process your itinerary. If your travel plans have changed, please cancel the request on the portal so we can close the ticket.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Action Required: Update your request on the Travel Desk</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'INFO_REQUEST_REMINDER_24H', 'employee', NULL, 'On Hold', 'On Hold', 'default', '26', 'FIXED: the event was named D3 (3 days) while the condition said 24 hours. Renamed to match the 24-hour condition, and the 3-day step is now its own row (26b).'),
  ('info_request_reminder_72h.employee.default', 'Final Reminder: Information Needed for', 'Final Reminder: Information Needed for {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request {{submissionId}} (Departure: {{departure_date}}) remains on hold. We still require the following information to proceed:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Required Information:</strong> {{information_requested}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Please update your request within 48 hours to avoid cancellation.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Unanswered requests will be closed automatically, requiring a new submission.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your manager has been copied for visibility.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Action Required: Update your request on the Travel Desk.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'INFO_REQUEST_REMINDER_72H', 'employee', NULL, 'On Hold', 'On Hold', 'default_manager', '26b', 'NEW ROW. Splits the single reminder into a 24-hour nudge and a 72-hour final notice, which is what the original D3-vs-24h contradiction implied was intended. Copies the manager because this is the last step before closure.'),
  ('info_request_escalated.escalation_owner.default', 'Action Required: Travel Request Stalled (Escalation)', 'Action Required: Travel Request Stalled - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Escalation Notice</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The travel request for {{requester_name}} (ID: {{submissionId}}) has been on hold for {{days_on_hold}} days awaiting a response.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Pending Information:</strong> {{information_requested}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Journey Details:</strong> {{origin}} to {{destination}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Departure Date:</strong> {{departure_date}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Please review this request to decide whether to follow up with the employee, rebook at updated fares, or close the ticket.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Review on the Travel Desk</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'INFO_REQUEST_ESCALATED', 'escalation_owner', NULL, 'On Hold', 'On Hold / Escalated', 'manager', '27', 'Adds days on hold and the travel date so the escalation owner can judge urgency from the mail alone.'),
  ('info_request_expired.employee.default', 'Travel Request Closed', 'Travel Request Closed: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request {{submissionId}} has been closed due to no response regarding the required details:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Pending Information:</strong> {{information_requested}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No bookings were made, and no fees apply.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If you still need to travel, please submit a new request promptly. Note that last-minute bookings may exceed budget limits and require manager approval.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Action: Submit a new request on the Travel Desk.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'INFO_REQUEST_EXPIRED', 'employee', NULL, 'On Hold', 'Cancelled by System', 'default_manager', '28', 'FIXED: the To stage was ''Cancelled by Employee'', but the employee did not cancel - the SLA did. Attributing it to the employee would distort cancellation reporting and the cancellation cost split. Subject says ''Closed'', not ''Cancelled'', for the same reason.'),
  ('booking_updated.employee.default', 'Booking Update', 'Booking Update: {{origin}} to {{destination}} (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your booking for request {{submissionId}} has been updated.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Summary of Changes:</strong> {{change_summary}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Updated Itinerary:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Departure Date:</strong> {{departure_date}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Travel Mode:</strong> {{travel_mode}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Booking Reference:</strong> {{booking_reference}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Important:</strong> The previously issued ticket is no longer valid. Please download your updated ticket before traveling.</div><div style="margin:4px 0;"><strong style="color:#334155;">Action:</strong> Download revised ticket on the Travel Desk.</div></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'BOOKING_UPDATED', 'employee', NULL, 'Booked', 'Booked', 'default', '29', 'RESTORED. This row was dropped in the last revision, which left a reissued PNR or a shifted departure time reaching the traveller through no channel at all. Fires only on material change - cosmetic edits and document re-uploads stay silent (rows 30 and 31).'),
  ('cancellation_processed_employee.employee.default', 'Travel Request Cancelled', 'Travel Request Cancelled - {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your travel request {{submissionId}} has been cancelled, as you asked.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Route:</strong> {{origin}} to {{destination}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Date:</strong> {{departure_date}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Nothing had been booked on this request, so there is no cancellation charge and nothing is owed by you.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If you need to travel after all, please raise a fresh request on the Travel Desk.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Request</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'CANCELLATION_PROCESSED_EMPLOYEE', 'employee', NULL, 'Cancellation Requested', 'Cancelled by Employee', 'default', '33', 'States plainly that no money is owed, which is the single most common follow-up question on a cancellation mail.'),
  ('cancellation_processed_employee.employee.post_booking', 'Booking Cancelled', 'Booking Cancelled: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your booking for the trip {{submissionId}} has been cancelled.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The Travel Desk team is recovering eligible funds, once finalized, we will share a settlement statement detailing the recovered amount, costs absorbed by Navgurukul, and any remaining balance.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is required from you at this time.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">ng-travel-desk.vercel.app</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'CANCELLATION_PROCESSED_EMPLOYEE', 'employee', 'post_booking', 'Cancellation Requested', 'Cancelled by Employee', 'default', '37', 'Sets the expectation of a follow-up statement so the employee does not chase, and deliberately quotes no amount owed before the refund is known.'),
  ('no_refund_required.employee.default', 'Travel Settlement Closed', 'Travel Settlement Closed: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The settlement for your cancelled trip {{submissionId}} is complete and the request is now closed.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Final Settlement:</strong> No funds were recoverable for this booking, and no balance is owed by you.</div><div style="margin:4px 0;"><strong style="color:#334155;">View Statement:</strong> ng-travel-desk.vercel.app</div></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'NO_REFUND_REQUIRED', 'employee', NULL, 'Cancelled by Employee', 'Reconciled', 'default', '39', 'EMAIL ADDED. Row 37 promised a final statement; this row was the terminal state and sent nothing, so that promise was never kept.'),
  ('pnc_cancellation.employee.default', 'Booking Cancelled by Travel Desk', 'Booking Cancelled by Travel Desk: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your booking for request {{submissionId}} has been cancelled by the Travel Desk.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Route &amp; Date:</strong> {{origin}} to {{destination}}, {{departure_date}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Reason:</strong> {{cancellation_reason}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is required on your part, and no charges apply to you for this cancellation.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If you still need to travel, please submit a new request promptly and notify the Travel Desk so we can prioritize it.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Raise New Request</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'PNC_CANCELLATION', 'employee', NULL, 'Booked', 'Cancelled by PNC', 'default_manager_if_approved', '40', 'FIXED: the CC read ''Manager*'' with the asterisk never defined. Condition is now stated. Copy makes it unambiguous that the employee bears no cost.'),
  ('partial_cancellation.employee.default', 'Partial Trip Cancellation', 'Partial Trip Cancellation: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">A portion of your travel request {{submissionId}} has been cancelled. The remainder of your itinerary remains confirmed.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Cancelled Segments:</strong> {{cancelled_segments}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Confirmed Segments:</strong> {{active_segments}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your remaining tickets are unchanged. Please retrieve the updated itinerary from the Travel Desk before traveling to ensure you carry the correct documentation.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Itinerary</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'PARTIAL_CANCELLATION', 'employee', NULL, 'Booked', 'Booked / Partially Cancelled', 'default', '43', 'Subject rewritten in plain language. Names both what is gone and what remains, which is the entire point of this mail.'),
  ('segment_refund_completed.employee.default', 'Refund Processed: Partial Cancellation (ID', 'Refund Processed: Partial Cancellation (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">We have successfully recovered {{refund_amount}} for the cancelled segment of your trip {{submissionId}}.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Refund Amount:</strong> {{refund_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Confirmed Segments:</strong> {{active_segments}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your remaining travel legs remain confirmed, and no balance is owed by you.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Settlement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'SEGMENT_REFUND_COMPLETED', 'employee', NULL, 'Booked / Partially Cancelled', 'Booked / Partially Cancelled', 'default', '45', 'FIXED: the original email summary was just the subject line repeated.'),
  ('partial_refund_received.employee.default', 'Partial Refund Processed', 'Partial Refund Processed: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">A partial refund has been recovered for your booking {{submissionId}}.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Amount Recovered:</strong> {{refund_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Remaining Balance Pending:</strong> {{outstanding_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The Travel Desk is pursuing the remaining amount with the service provider and will issue a final statement once closed. No action is required from you at this time.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Settlement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'PARTIAL_REFUND_RECEIVED', 'employee', NULL, 'Pending Refund', 'Partially Refunded', 'default_finance', '46', 'FIXED: summary repeated the subject. Now carries the numbers and says a final statement follows. Finance added to CC (they were absent from every row in a section that is entirely their work).'),
  ('refund_completed.employee.default', 'Full Refund Processed', 'Full Refund Processed: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The full fare for your booking {{submissionId}} has been recovered from the service provider.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Amount Recovered:</strong> {{refund_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No balance is owed by you, and the request is now officially closed.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Settlement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_COMPLETED', 'employee', NULL, 'Pending Refund', 'Fully Refunded', 'default_finance', '47', 'FIXED: summary repeated the subject. Finance added to CC.'),
  ('refund_completed.employee.after_partial_refund', 'Final Settlement: Full Refund Processed (ID', 'Final Settlement: Full Refund Processed (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The remaining balance for your booking {{submissionId}} has been successfully recovered.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Total Recovered:</strong> {{refund_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">This completes the refund process for this booking, and no balance is owed by you. The ticket is now fully settled and closed.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Settlement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_COMPLETED', 'employee', 'after_partial_refund', 'Partially Refunded', 'Fully Refunded', 'default_finance', '49', 'Copy differs from row 47 so it acknowledges the earlier partial refund rather than reading as a duplicate.'),
  ('refund_written_off.employee.default', 'Cancellation Settlement Statement', 'Cancellation Settlement Statement: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The cancellation settlement for the trip {{submissionId}} is now complete. The breakdown under our travel policy is as follows:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Recovered from Provider:</strong> {{refund_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Absorbed by Navgurukul:</strong> {{org_absorbed_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Employee Balance Due:</strong> {{employee_owed_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If a balance is listed under "Employee Balance Due", the Travel Desk team will reach out with details on how it will be processed.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No action is required from you at this time.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Full Breakdown</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_WRITTEN_OFF', 'employee', NULL, 'Pending Refund', 'Written Off', 'default_finance', '48', 'This is the only mail in the set that can tell someone they owe money. It now states the full split rather than hiding behind ''settlement update'', and says explicitly that no action is needed yet.'),
  ('refund_written_off.employee.after_partial_refund', 'Cancellation Settlement Statement', 'Cancellation Settlement Statement: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The cancellation settlement for the trip {{submissionId}} is now complete. The breakdown under our travel policy is as follows:</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Recovered from Provider:</strong> {{refund_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Amount Written Off:</strong> {{written_off_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Absorbed by Navgurukul:</strong> {{org_absorbed_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Employee Balance Due:</strong> {{employee_owed_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">If a balance is listed under "Employee Balance Due", the Travel Desk team will reach out with details on how it will be processed. No action is required from you at this time.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Full Breakdown</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_WRITTEN_OFF', 'employee', 'after_partial_refund', 'Partially Refunded', 'Written Off', 'default_finance', '50', 'As row 48, but acknowledges the partial recovery that already happened.'),
  ('refund_reconciliation_completed.employee.default', 'Travel Settlement Closed', 'Travel Settlement Closed: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The settlement for your trip {{submissionId}} is now complete, and the request is officially closed.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Amount Recovered:</strong> {{refund_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Absorbed by Navgurukul:</strong> {{org_absorbed_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Employee Balance Due:</strong> {{employee_owed_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No further action is required for this booking.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Statement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_RECONCILIATION_COMPLETED', 'employee', NULL, 'Fully Refunded', 'Reconciled', 'default', '51', 'EMAIL ADDED. Every terminal reconciliation row previously sent nothing, so the statement promised at row 37 never arrived.'),
  ('refund_reconciliation_completed.employee.after_write_off', 'Travel Settlement Closed', 'Travel Settlement Closed: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The settlement for your trip {{submissionId}} is now complete, and the request is officially closed.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Amount Recovered:</strong> {{refund_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Absorbed by Navgurukul:</strong> {{org_absorbed_amount}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Employee Balance Due:</strong> {{employee_owed_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">No further action is required for this booking.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Statement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_RECONCILIATION_COMPLETED', 'employee', 'after_write_off', 'Written Off', 'Reconciled', 'default', '52', 'EMAIL ADDED. Same template as row 51.'),
  ('refund_disputed.finance.default', 'Action Required: Refund Disputed (ID (Finance)', 'Action Required: Refund Disputed (ID: {{submissionId}})', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Finance Action Required</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">The refund for request {{submissionId}} has been disputed and requires review.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Employee:</strong> {{requester_name}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Original Fare:</strong> {{original_fare}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Expected Refund:</strong> {{expected_refund}}</div><div style="margin:4px 0;"><strong style="color:#334155;">Actual Amount Received:</strong> {{refund_amount}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Please review whether to pursue the remaining variance with the service provider or proceed with a write-off. Note that the employee has not been notified of this discrepancy.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Review Settlement</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'REFUND_DISPUTED', 'finance', NULL, 'Partially Refunded', 'Disputed', 'default', '53', 'EMAIL ADDED. A dispute with no notification sits invisible until someone happens to look at the queue. Internal only - the employee is not told until it resolves.'),
  ('retroactive_booking_recorded.employee.default', 'Travel Booking Recorded', 'Travel Booking Recorded: {{submissionId}}', '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6B35;">
        <img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />
        <p style="color:#64748b;margin:4px 0 0 0;font-size:13px;font-weight:500;">Travel Desk Notification</p>
      </div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Your self-booked trip has been recorded.</p>
      <div style="background-color:#f8fafc;border-left:4px solid #4F46E5;padding:16px;border-radius:6px;margin:20px 0;font-size:13px;color:#475569;line-height:1.7;"><div style="margin:4px 0;"><strong style="color:#334155;">Journey &amp; Date:</strong> {{origin}} to {{destination}}, {{departure_date}} ({{travel_mode}})</div><div style="margin:4px 0;"><strong style="color:#334155;">Fare:</strong> {{ticket_cost}}</div></div>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Please ensure your ticket and invoice are uploaded to the Travel Desk.</p>
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Reimbursement cannot be processed without these supporting documents.</p>
      <div style="text-align:center;margin:26px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Upload Documents</a></div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
        Navgurukul Travel Desk &bull; Automated notification, please do not reply to this address.
      </div>
    </div>', 'RETROACTIVE_BOOKING_RECORDED', 'employee', NULL, '-', 'Closed / Recorded', 'default', '57', 'FIXED: ''Action after transition'' read ''Human resolution required'', copied from row 53. EMAIL ADDED so the employee gets confirmation their self-booked trip was logged, and a nudge on the documents reimbursement depends on.')
) AS v(template_key, name, subject, body, event, audience, context_key,
       from_status, to_status, cc_rule, sheet_row, sheet_summary)
ON CONFLICT (template_key) DO UPDATE SET
  name          = EXCLUDED.name,
  subject       = EXCLUDED.subject,
  body          = EXCLUDED.body,
  event         = EXCLUDED.event,
  audience      = EXCLUDED.audience,
  context_key   = EXCLUDED.context_key,
  from_status   = EXCLUDED.from_status,
  to_status     = EXCLUDED.to_status,
  cc_rule       = EXCLUDED.cc_rule,
  sheet_row     = EXCLUDED.sheet_row,
  sheet_summary = EXCLUDED.sheet_summary,
  status        = 'Published',
  is_active     = TRUE,
  version       = public.mail_templates.version + 1,
  updated_at    = NOW();
