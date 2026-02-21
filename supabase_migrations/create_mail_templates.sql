-- Create Mail Templates Table
CREATE TABLE IF NOT EXISTS public.mail_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status_trigger TEXT UNIQUE, -- e.g., 'Approved', 'Rejected'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.mail_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone (Authenticated) can view templates (PNC needs to view, Admin needs to view)
CREATE POLICY "Staff view all templates" ON public.mail_templates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'PNC'))
);

-- Only Admin can insert, update, delete
CREATE POLICY "Admins manage templates" ON public.mail_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);

-- Insert Default Templates
INSERT INTO public.mail_templates (name, subject, status_trigger, body) VALUES
(
  'Booking Confirmation',
  'Travel Booking Confirmed - {{submissionId}}',
  'Booked',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #FF6B35; font-size: 32px; margin: 0;">navgurukul</h1>
      <div style="border-bottom: 3px solid #FF6B35; margin-top: 10px;"></div>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Hi <strong>{{requesterName}}</strong>,</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Great news! Your travel booking has been confirmed.</p>
    
    <div style="background-color: #E8F5E9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #2E7D32; font-weight: bold; font-size: 14px;">✓ Booking Confirmed</p>
      <p style="margin: 5px 0 0 0; color: #555; font-size: 13px;">Your tickets have been booked successfully.</p>
    </div>
    
    <div style="margin: 20px 0;">
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Purpose:</strong> {{purpose}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>From:</strong> {{from}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>To:</strong> {{to}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Date:</strong> {{dateOfTravel}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Request ID:</strong> {{submissionId}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Vendor:</strong> {{vendorName}}</p>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Please download your ticket from the travel portal.</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6; margin-top: 30px;">Safe travels!</p>
  </div>'
),
(
  'Request Approved',
  'Travel Request Approved - {{submissionId}}',
  'Approved',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #FF6B35; font-size: 32px; margin: 0;">navgurukul</h1>
      <div style="border-bottom: 3px solid #FF6B35; margin-top: 10px;"></div>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Hi <strong>{{requesterName}}</strong>,</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Your travel request has been approved and is now being processed.</p>
    
    <div style="background-color: #E3F2FD; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #1565C0; font-weight: bold; font-size: 14px;">✓ Approved - Processing</p>
      <p style="margin: 5px 0 0 0; color: #555; font-size: 13px;">We are working on booking your travel.</p>
    </div>
    
    <div style="margin: 20px 0;">
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Purpose:</strong> {{purpose}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>From:</strong> {{from}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>To:</strong> {{to}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Date:</strong> {{dateOfTravel}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Request ID:</strong> {{submissionId}}</p>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">You will receive a confirmation email once your booking is complete.</p>
  </div>'
),
(
  'Request Rejected by PNC',
  'Action Required: Travel Request - {{submissionId}}',
  'Rejected by PNC',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #FF6B35; font-size: 32px; margin: 0;">navgurukul</h1>
      <div style="border-bottom: 3px solid #FF6B35; margin-top: 10px;"></div>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Hi <strong>{{requesterName}}</strong>,</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Your travel request requires attention.</p>
    
    <div style="background-color: #FFF3E0; border-left: 4px solid #FF9800; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #E65100; font-weight: bold; font-size: 14px;">⚠ Request Returned</p>
      <p style="margin: 5px 0 0 0; color: #555; font-size: 13px;">Please review and resubmit with required changes.</p>
    </div>
    
    <div style="margin: 20px 0;">
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Purpose:</strong> {{purpose}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>From:</strong> {{from}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>To:</strong> {{to}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Date:</strong> {{dateOfTravel}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Request ID:</strong> {{submissionId}}</p>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;"><strong>Action Required:</strong> Please log in to the travel portal to view the feedback and make necessary changes.</p>
  </div>'
),
(
  'Policy Violation - Approval Pending',
  'Action Required: Travel Policy Violation - {{submissionId}}',
  'Approval Pending',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #FF6B35; font-size: 32px; margin: 0;">navgurukul</h1>
      <div style="border-bottom: 3px solid #FF6B35; margin-top: 10px;"></div>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Hi <strong>{{requesterName}}</strong>,</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Your travel request has been submitted, but it requires additional information.</p>
    
    <div style="background-color: #FFF9C4; border-left: 4px solid #FBC02D; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #F57F17; font-weight: bold; font-size: 14px;">⚠ Travel Policy Violated: Less than 10 days notice (Bus)</p>
      <p style="margin: 5px 0 0 0; color: #555; font-size: 13px;">You requested travel with only 5 day(s) notice, but policy requires 10 days.</p>
    </div>
    
    <div style="margin: 20px 0;">
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Purpose:</strong> {{purpose}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>From:</strong> {{from}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>To:</strong> {{to}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Date:</strong> {{dateOfTravel}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Request ID:</strong> {{submissionId}}</p>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;"><strong>Action Required:</strong> Please provide a reason for this urgent travel request by clicking the button below. Your request will be sent for approval once the reason is submitted.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="#" style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Submit Reason</a>
    </div>
  </div>'
),
(
  'Request Rejected by Manager',
  'Travel Request Update - {{submissionId}}',
  'Rejected by Manager',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #FF6B35; font-size: 32px; margin: 0;">navgurukul</h1>
      <div style="border-bottom: 3px solid #FF6B35; margin-top: 10px;"></div>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Hi <strong>{{requesterName}}</strong>,</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Your travel request has been reviewed by your manager.</p>
    
    <div style="background-color: #FFEBEE; border-left: 4px solid #F44336; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #C62828; font-weight: bold; font-size: 14px;">✗ Not Approved</p>
      <p style="margin: 5px 0 0 0; color: #555; font-size: 13px;">Your manager has not approved this travel request.</p>
    </div>
    
    <div style="margin: 20px 0;">
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Purpose:</strong> {{purpose}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>From:</strong> {{from}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>To:</strong> {{to}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Date:</strong> {{dateOfTravel}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Request ID:</strong> {{submissionId}}</p>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Please contact your manager for more details or submit a new request if needed.</p>
  </div>'
),
(
  'Request Closed',
  'Travel Completed - {{submissionId}}',
  'Closed',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #FF6B35; font-size: 32px; margin: 0;">navgurukul</h1>
      <div style="border-bottom: 3px solid #FF6B35; margin-top: 10px;"></div>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Hi <strong>{{requesterName}}</strong>,</p>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Your travel request has been completed and closed.</p>
    
    <div style="background-color: #F5F5F5; border-left: 4px solid #9E9E9E; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #424242; font-weight: bold; font-size: 14px;">✓ Request Closed</p>
      <p style="margin: 5px 0 0 0; color: #555; font-size: 13px;">This travel request has been archived.</p>
    </div>
    
    <div style="margin: 20px 0;">
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Purpose:</strong> {{purpose}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>From:</strong> {{from}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>To:</strong> {{to}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Date:</strong> {{dateOfTravel}}</p>
      <p style="margin: 5px 0; color: #333; font-size: 14px;"><strong>Request ID:</strong> {{submissionId}}</p>
    </div>
    
    <p style="color: #333; font-size: 14px; line-height: 1.6;">Thank you for using the Navgurukul Travel Desk. We hope you had a safe journey!</p>
  </div>'
);
