-- =============================================================================
-- Put the ticket in the booking confirmation
-- =============================================================================
-- The booking mail told travellers to go and fetch their ticket from the
-- portal, and said in as many words: "Note that tickets are not attached to
-- this email." Both are now wrong, so the copy is corrected here alongside the
-- delivery change.
--
-- {{ticket_download_url}} is deliberately NOT a variable that
-- resolveTemplateVariables knows about. Queue-time rendering only substitutes
-- placeholders in its own map, so this one survives into the queued row and is
-- filled in by the edge function at SEND time.
--
-- That timing is the whole point. Storage buckets became private on 8 Oct
-- (20261008100200), so the link must be signed -- and a queued mail can sit
-- through retries, a daily quota hold or an overnight backoff before it is
-- sent. A URL signed at queue time could expire before the mail ever leaves.
-- Signing at send time starts the clock when the mail actually goes.
--
-- Written as targeted replace() calls rather than a whole-body rewrite so that
-- any local edits to this template survive, and so a re-run is a no-op once the
-- source strings are gone.
-- =============================================================================

UPDATE public.mail_templates
   SET body = replace(
         body,
         '<li>Download Your Ticket: Retrieve your ticket directly from the Travel Desk. Note that tickets are not attached to this email.</li>',
         '<li>Your Ticket: attached to this email where the file size allows, and always downloadable from the button below.</li>'
       ),
       updated_at = NOW()
 WHERE event = 'BOOKING_CONFIRMED'
   AND audience = 'employee'
   AND body LIKE '%tickets are not attached to this email%';

UPDATE public.mail_templates
   SET body = replace(
         body,
         '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">',
         '<div style="text-align:center;margin:26px 0;"><a href="{{ticket_download_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Download Your Ticket</a></div>'
         || '<p style="color:#64748b;font-size:12px;line-height:1.6;margin:12px 0;text-align:center;">This download link is valid for 7 days. After that, your ticket stays available on the Travel Desk portal.</p>'
         || '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">'
       ),
       updated_at = NOW()
 WHERE event = 'BOOKING_CONFIRMED'
   AND audience = 'employee'
   AND body NOT LIKE '%{{ticket_download_url}}%';
