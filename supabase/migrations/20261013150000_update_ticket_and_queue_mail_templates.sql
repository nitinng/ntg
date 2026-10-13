-- =============================================================================
-- Migration: Ticket mail dual actions, PNC queue generalized copy,
-- and Desk Assignment / Reassignment / Transfer tracking.
-- =============================================================================

-- 1. Dual actions for ticket-related emails:
--    - Direct Download link/button ({{ticket_download_url}}) with attachment
--    - Travel Desk dashboard link/button ({{portal_url}}) to view/download in portal
--    Applies to:
--    - BOOKING_CONFIRMED (booking_confirmed.employee.default)
--    - BOOKING_UPDATED (booking_updated.employee.default)

-- 1a. BOOKING_UPDATED (Booking Update) ----------------------------------------
UPDATE public.mail_templates
   SET body = replace(
         body,
         '<div style="margin:4px 0;"><strong style="color:#334155;">Action:</strong> Download revised ticket on the Travel Desk.</div></div>',
         '<div style="margin:4px 0;"><strong style="color:#334155;">Action:</strong> Download your revised ticket directly from this email or access it on the Travel Desk portal.</div></div>'
         || '<div style="text-align:center;margin:26px 0;">'
         || '<a href="{{ticket_download_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;margin:6px 6px;">Download Revised Ticket</a>'
         || '<a href="{{portal_url}}" style="background-color:#f8fafc;color:#334155;border:1px solid #cbd5e1;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;margin:6px 6px;">View on Travel Desk</a>'
         || '</div>'
         || '<p style="color:#64748b;font-size:12px;line-height:1.6;margin:12px 0;text-align:center;">Your revised ticket is attached where file size allows. The direct download link is valid for 7 days, and your updated ticket is always accessible on your Travel Desk dashboard.</p>'
       ),
       updated_at = NOW()
 WHERE event = 'BOOKING_UPDATED'
   AND audience = 'employee'
   AND body NOT LIKE '%{{ticket_download_url}}%';

-- 1b. BOOKING_CONFIRMED (Booking Confirmation) --------------------------------
UPDATE public.mail_templates
   SET body = replace(
         body,
         '<div style="text-align:center;margin:26px 0;"><a href="{{ticket_download_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Download Your Ticket</a></div>',
         '<div style="text-align:center;margin:26px 0;">'
         || '<a href="{{ticket_download_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;margin:6px 6px;">Download Your Ticket</a>'
         || '<a href="{{portal_url}}" style="background-color:#f8fafc;color:#334155;border:1px solid #cbd5e1;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;margin:6px 6px;">View on Travel Desk</a>'
         || '</div>'
       ),
       updated_at = NOW()
 WHERE event = 'BOOKING_CONFIRMED'
   AND audience = 'employee'
   AND body LIKE '%{{ticket_download_url}}%'
   AND body NOT LIKE '%View on Travel Desk%';

-- 2a. PNC Queue Default Templates (Generalize "Open it to claim and book") -----
UPDATE public.mail_templates
   SET body = replace(
         body,
         '<p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Open it to claim and book: {{portal_url}}</p>',
         '<div style="text-align:center;margin:24px 0;"><a href="{{portal_url}}" style="background-color:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View in Travel Desk Queue</a></div>'
       ),
       updated_at = NOW()
 WHERE template_key IN ('policy_evaluation_passed.pnc.default', 'approval_completed.pnc.default')
   AND body LIKE '%Open it to claim and book%';

-- 2b. PNC Queue Critical Templates (Generalize "Claim and book it here") --------
UPDATE public.mail_templates
   SET body = replace(
         body,
         '<p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">Claim and book it here: {{portal_url}}</p>',
         '<div style="text-align:center;margin:24px 0;"><a href="{{portal_url}}" style="background-color:#dc2626;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">View Priority Request in Queue</a></div>'
       ),
       updated_at = NOW()
 WHERE template_key IN ('policy_evaluation_passed.pnc.priority_critical', 'approval_completed.pnc.priority_critical')
   AND body LIKE '%Claim and book it here%';

-- 3. Database Schema: Track Assignment Reason and Assignment Type -------------
ALTER TABLE public.travel_requests
  ADD COLUMN IF NOT EXISTS assignment_reason TEXT,
  ADD COLUMN IF NOT EXISTS assignment_type TEXT;

COMMENT ON COLUMN public.travel_requests.assignment_reason IS
  'Mandatory or optional reason provided when assigning, reassigning, or transferring the request.';
COMMENT ON COLUMN public.travel_requests.assignment_type IS
  'Type of desk assignment: claim, assign, reassign, or transfer.';

-- 4. Guard Requester Updates (Prevent employees tampering with assignment reason/type)
CREATE OR REPLACE FUNCTION public.guard_requester_request_update()
RETURNS TRIGGER AS $guard_requester_request_update$
BEGIN
  IF auth.uid() IS NULL
     OR auth.uid() IS DISTINCT FROM OLD.requester_id
     OR COALESCE(public.get_user_role(), '') IN ('Admin', 'PNC', 'PNC Admin', 'Finance')
  THEN
    RETURN NEW;
  END IF;

  NEW.id                  := OLD.id;
  NEW.submission_id       := OLD.submission_id;
  NEW.requester_id        := OLD.requester_id;
  NEW.created_at          := OLD.created_at;

  NEW.approval_status     := OLD.approval_status;

  NEW.ticket_cost         := OLD.ticket_cost;
  NEW.invoice_url         := OLD.invoice_url;
  NEW.vendor_name         := OLD.vendor_name;
  NEW.booking_status      := OLD.booking_status;
  NEW.payment_source      := OLD.payment_source;
  NEW.advance_id          := OLD.advance_id;
  NEW.split_tickets       := OLD.split_tickets;
  NEW.booked_by           := OLD.booked_by;

  -- Desk ownership: assignable only by staff.
  NEW.assigned_pnc_id     := OLD.assigned_pnc_id;
  NEW.assigned_at         := OLD.assigned_at;
  NEW.assignment_reason   := OLD.assignment_reason;
  NEW.assignment_type     := OLD.assignment_type;

  RETURN NEW;
END;
$guard_requester_request_update$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
