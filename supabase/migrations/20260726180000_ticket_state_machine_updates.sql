-- Migration: Add State Machine and Mail Template Columns
-- Timestamp: 20260726180000

-- 1. Add info_requested and employee_response columns to travel_requests
ALTER TABLE public.travel_requests
ADD COLUMN IF NOT EXISTS info_requested TEXT,
ADD COLUMN IF NOT EXISTS employee_response TEXT;

-- 2. Add audience column to mail_templates
ALTER TABLE public.mail_templates
ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'employee' NOT NULL;

-- 3. Add check constraint on audience
ALTER TABLE public.mail_templates DROP CONSTRAINT IF EXISTS chk_mail_templates_audience;
ALTER TABLE public.mail_templates ADD CONSTRAINT chk_mail_templates_audience CHECK (audience IN ('employee', 'manager', 'pnc'));

-- 4. Update the unique index for published templates to include audience
DROP INDEX IF EXISTS public.mail_templates_published_unique;
CREATE UNIQUE INDEX IF NOT EXISTS mail_templates_published_unique
  ON public.mail_templates (status_trigger, audience)
  WHERE is_draft = FALSE;

-- 5. Seed templates as drafts
-- Delete draft versions of trigger/audience combinations we are about to insert to avoid duplication if run multiple times
DELETE FROM public.mail_templates 
WHERE is_draft = TRUE AND (status_trigger, audience) IN (
  ('Not Started', 'employee'),
  ('Approval Pending', 'manager'),
  ('Processing', 'employee'),
  ('Approved', 'employee'),
  ('Approved', 'manager'),
  ('Rejected by Manager', 'employee'),
  ('On Hold', 'employee'),
  ('On Hold', 'pnc'),
  ('Rejected by PNC', 'employee'),
  ('Booked', 'employee'),
  ('Cancelled by Employee', 'employee'),
  ('Cancelled by Employee', 'manager'),
  ('Cancelled by Employee', 'pnc'),
  ('Cancelled by PNC', 'employee'),
  ('Closed', 'employee')
);

INSERT INTO public.mail_templates (name, subject, status_trigger, audience, is_draft, body) VALUES
(
  'Request Received (Draft)',
  'We have received your travel request - {{submissionId}}',
  'Not Started',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Travel Request Received</h2>
    <p>Hi {{requesterName}},</p>
    <p>Your travel request from <strong>{{from}}</strong> to <strong>{{to}}</strong> has been received and is currently being processed.</p>
    <p><strong>Submission ID:</strong> {{submissionId}}</p>
    <p>We will keep you updated on the progress.</p>
  </div>'
),
(
  'Approval Needed (Draft)',
  'Action Required: Approval Needed for Policy Violation - {{submissionId}}',
  'Approval Pending',
  'manager',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Travel Request Approval Needed</h2>
    <p>Hi Manager,</p>
    <p>A travel request submitted by <strong>{{requesterName}}</strong> requires your approval due to a policy violation.</p>
    <p><strong>Reason for short notice:</strong> {{statusChangeReason}}</p>
    <p><strong>Route:</strong> {{from}} to {{to}} on {{dateOfTravel}}</p>
    <p>Please log in to the travel desk to approve or reject this request.</p>
  </div>'
),
(
  'PNC Processing (Draft)',
  'Your request is being processed by PNC - {{submissionId}}',
  'Processing',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Travel Request under Review</h2>
    <p>Hi {{requesterName}},</p>
    <p>Your travel request is now under review by the PNC team. We are working on arranging your tickets.</p>
    <p><strong>Submission ID:</strong> {{submissionId}}</p>
  </div>'
),
(
  'Approved by Manager (Employee Draft)',
  'Your travel request has been approved by your manager - {{submissionId}}',
  'Approved',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Request Approved</h2>
    <p>Hi {{requesterName}},</p>
    <p>Good news! Your travel request has been approved by your manager and has been forwarded to PNC for booking.</p>
    <p><strong>Submission ID:</strong> {{submissionId}}</p>
  </div>'
),
(
  'Approved by Manager (Manager Confirmation Draft)',
  'Confirmation: Approved Travel Request - {{submissionId}}',
  'Approved',
  'manager',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Approval Confirmation</h2>
    <p>Hi Manager,</p>
    <p>This is to confirm that you have approved the travel request for <strong>{{requesterName}}</strong>.</p>
    <p><strong>Submission ID:</strong> {{submissionId}}</p>
  </div>'
),
(
  'Rejected by Manager (Draft)',
  'Travel Request Rejected - {{submissionId}}',
  'Rejected by Manager',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Request Rejected</h2>
    <p>Hi {{requesterName}},</p>
    <p>Your manager has rejected your travel request.</p>
    <p><strong>Reason:</strong> {{statusChangeReason}}</p>
    <p>You can edit and resubmit your request in the travel portal.</p>
  </div>'
),
(
  'More Information Needed (Draft)',
  'Action Required: More information needed for travel - {{submissionId}}',
  'On Hold',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Clarification Needed</h2>
    <p>Hi {{requesterName}},</p>
    <p>The PNC team needs more information to proceed with booking your request.</p>
    <p><strong>Information requested:</strong> {{infoRequested}}</p>
    <p>Please log in to the travel desk and respond to this request.</p>
  </div>'
),
(
  'Employee Responded to On Hold (Draft)',
  'Employee Responded: Travel Clarification - {{submissionId}}',
  'On Hold',
  'pnc',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Employee Clarification Provided</h2>
    <p>Hi PNC Team,</p>
    <p><strong>{{requesterName}}</strong> has responded to the clarification request for travel <strong>{{submissionId}}</strong>.</p>
    <p><strong>Response:</strong> {{employeeResponse}}</p>
    <p>Please review and proceed with processing.</p>
  </div>'
),
(
  'Rejected by PNC (Draft)',
  'Travel Request Rejected by PNC - {{submissionId}}',
  'Rejected by PNC',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Request Rejected by PNC</h2>
    <p>Hi {{requesterName}},</p>
    <p>The PNC team has rejected your travel request.</p>
    <p><strong>Reason:</strong> {{statusChangeReason}}</p>
    <p>You can edit and resubmit your request in the travel portal.</p>
  </div>'
),
(
  'Ticket Booked (Draft)',
  'Your travel ticket is booked! - {{submissionId}}',
  'Booked',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Itinerary & Booking Details</h2>
    <p>Hi {{requesterName}},</p>
    <p>Your ticket has been booked by PNC.</p>
    <p><strong>Route:</strong> {{from}} to {{to}}</p>
    <p><strong>Date of Travel:</strong> {{dateOfTravel}}</p>
    <p><strong>Vendor:</strong> {{vendorName}}</p>
    <p><strong>Cost:</strong> ₹{{ticketCost}}</p>
    <p>Please view/download your ticket invoice here: <a href="{{invoiceUrl}}">Download Invoice</a></p>
  </div>'
),
(
  'Cancellation Confirmed (Draft)',
  'Cancellation Confirmed: Travel Request - {{submissionId}}',
  'Cancelled by Employee',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Cancellation Confirmed</h2>
    <p>Hi {{requesterName}},</p>
    <p>This is to confirm that your travel request <strong>{{submissionId}}</strong> has been cancelled by you.</p>
    <p><strong>Reason:</strong> {{cancelledReason}}</p>
  </div>'
),
(
  'No Longer Needs Approval (Draft)',
  'Cancelled: Travel Approval Request - {{submissionId}}',
  'Cancelled by Employee',
  'manager',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Travel Approval Request Cancelled</h2>
    <p>Hi Manager,</p>
    <p>The travel request for <strong>{{requesterName}}</strong> ({{submissionId}}) has been cancelled by the employee and no longer requires your approval.</p>
  </div>'
),
(
  'Stand Down - Cancelled (Draft)',
  'Stand Down: Booking Cancelled - {{submissionId}}',
  'Cancelled by Employee',
  'pnc',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Stand Down</h2>
    <p>Hi PNC Team,</p>
    <p>The travel request <strong>{{submissionId}}</strong> for <strong>{{requesterName}}</strong> has been cancelled by the employee. Please stand down on any booking efforts.</p>
  </div>'
),
(
  'Booked Ticket Cancelled by PNC (Draft)',
  'Cancellation Notice: Booked Ticket Cancelled by PNC - {{submissionId}}',
  'Cancelled by PNC',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Booked Ticket Cancelled</h2>
    <p>Hi {{requesterName}},</p>
    <p>We regret to inform you that your booked travel ticket <strong>{{submissionId}}</strong> has been cancelled by PNC due to operational reasons.</p>
    <p><strong>Reason:</strong> {{cancelledReason}}</p>
    <p>Please contact the PNC desk for next steps or rebooking options.</p>
  </div>'
),
(
  'Trip Marked Complete (Draft)',
  'Trip Marked Complete - {{submissionId}}',
  'Closed',
  'employee',
  TRUE,
  '<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
    <h2>Trip Complete</h2>
    <p>Hi {{requesterName}},</p>
    <p>Your travel request <strong>{{submissionId}}</strong> has been marked as complete and successfully closed.</p>
    <p>We hope you had a great trip!</p>
  </div>'
);
