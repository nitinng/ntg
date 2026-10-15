-- =============================================================================
-- Migration: Add advance notice explanation line to manager approval email template
-- Template: Approval Needed: Travel Request for (Manager) [policy_violation_detected.manager.default]
-- =============================================================================

UPDATE public.mail_templates
   SET body = replace(
         body,
         '<p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>',
         '<p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">{{violation_reasons}}</p>'
         || '<p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">This travel request has not been raised within the required advance notice period. Please review the urgency and purpose of the travel before approving.</p>'
       ),
       updated_at = NOW()
 WHERE template_key = 'policy_violation_detected.manager.default'
   AND body NOT LIKE '%required advance notice period%';
