import { supabase } from '../supabaseClient';
import { TravelRequest, PNCStatus } from '../types';

export const DEFAULT_GLOBAL_CC = [
  'travel.team@navgurukul.org',
  'nitin.s@navgurukul.org'
];

/**
 * Resolves the active Global CC recipient list from the settings table.
 */
export const getGlobalEmailCc = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('setting_value')
      .eq('setting_key', 'global_email_cc')
      .maybeSingle();

    if (!error && data?.setting_value && Array.isArray(data.setting_value) && data.setting_value.length > 0) {
      return data.setting_value.filter(Boolean);
    }
  } catch (err) {
    console.warn('Failed to fetch global_email_cc from settings, using default:', err);
  }
  return DEFAULT_GLOBAL_CC;
};

/**
 * Safely resolves dynamic variables inside an email template subject or body.
 */
export const resolveTemplateVariables = (
  content: string,
  request: TravelRequest,
  extraContext?: Record<string, any>
): string => {
  if (!content) return '';

  const bookingRef = request.bookingReference ||
    (request.legs && request.legs[0]?.pnr) ||
    'CONFIRMED';

  const variables: Record<string, string> = {
    '{{request_id}}': request.submissionId || request.id || '',
    '{{submissionId}}': request.submissionId || request.id || '',
    '{{requester_name}}': request.requesterName || 'Employee',
    '{{requesterName}}': request.requesterName || 'Employee',
    '{{requester_email}}': request.requesterEmail || '',
    '{{requesterEmail}}': request.requesterEmail || '',
    '{{manager_name}}': request.approvingManagerName || request.managerName || 'Approving Manager',
    '{{manager_email}}': request.approvingManagerEmail || request.managerEmail || '',
    '{{origin}}': request.from || '',
    '{{from}}': request.from || '',
    '{{destination}}': request.to || '',
    '{{to}}': request.to || '',
    '{{departure_date}}': request.dateOfTravel || '',
    '{{dateOfTravel}}': request.dateOfTravel || '',
    '{{travel_mode}}': request.mode || 'Flight',
    '{{mode}}': request.mode || 'Flight',
    '{{trip_type}}': request.tripType || 'One-way',
    '{{tripType}}': request.tripType || 'One-way',
    '{{purpose}}': request.purpose || '',
    '{{estimated_cost}}': request.ticketCost ? String(request.ticketCost) : '0',
    '{{ticketCost}}': request.ticketCost ? String(request.ticketCost) : '0',
    '{{ticket_cost}}': request.ticketCost ? String(request.ticketCost) : '0',
    '{{vendor_name}}': request.vendorName || 'Travel Partner',
    '{{vendorName}}': request.vendorName || 'Travel Partner',
    '{{invoiceUrl}}': request.invoiceUrl || '',
    '{{violation_reasons}}': request.violationReason || 'Policy advance booking notice / expense threshold limit',
    '{{rejection_reason}}': request.statusChangeReason || 'Policy guidelines exceeded',
    '{{statusChangeReason}}': request.statusChangeReason || '',
    '{{information_requested}}': request.infoRequested || '',
    '{{infoRequested}}': request.infoRequested || '',
    '{{employee_response}}': request.employeeResponse || '',
    '{{employeeResponse}}': request.employeeResponse || '',
    '{{booking_reference}}': bookingRef,
    '{{cancellation_reason}}': request.cancelledReason || request.statusChangeReason || 'Plans changed',
    '{{cancelledReason}}': request.cancelledReason || '',
    '{{portal_url}}': 'https://travel.navgurukul.org',
    ...(extraContext || {})
  };

  let rendered = content;
  for (const [placeholder, value] of Object.entries(variables)) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered.replace(new RegExp(escaped, 'g'), String(value ?? ''));
  }

  return rendered;
};

export interface BuiltinTemplate {
  name: string;
  subject: string;
  body: string;
}

export const BUILTIN_MAIL_TEMPLATES: Record<string, BuiltinTemplate> = {
  'Not Started:employee': {
    name: 'Request Received',
    subject: 'Travel Request Received - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
        <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">Travel Desk Notification</p>
      </div>
      <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Your travel request <strong>{{request_id}}</strong> has been received and logged in the system.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #4F46E5; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: bold;">Trip Overview</p>
        <div style="margin-top: 8px; font-size: 13px; color: #475569; line-height: 1.7;">
          <div><strong>From:</strong> {{origin}} → <strong>To:</strong> {{destination}}</div>
          <div><strong>Date of Travel:</strong> {{departure_date}}</div>
          <div><strong>Travel Mode:</strong> {{travel_mode}}</div>
          <div><strong>Purpose:</strong> {{purpose}}</div>
        </div>
      </div>
      <p style="color: #475569; font-size: 13px; line-height: 1.5;">Our operations team (PNC) will review your itinerary and initiate bookings. You will receive updates as your request progresses.</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
        Navgurukul Travel Desk • Automated System Notification
      </div>
    </div>`
  },
  'Approval Pending:manager': {
    name: 'Manager Approval Required',
    subject: 'Action Required: Travel Approval for {{requester_name}} - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
        <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">Manager Approval Request</p>
      </div>
      <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;"><strong>{{requester_name}}</strong> has submitted a travel request that requires your managerial approval due to policy constraints.</p>
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">⚠️ Policy Exception / Violation</p>
        <p style="margin: 6px 0 0 0; color: #b45309; font-size: 13px;">{{violation_reasons}}</p>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: bold;">Request Details</p>
        <div style="margin-top: 8px; font-size: 13px; color: #475569; line-height: 1.7;">
          <div><strong>Request ID:</strong> {{request_id}}</div>
          <div><strong>Employee:</strong> {{requester_name}} ({{requester_email}})</div>
          <div><strong>Journey:</strong> {{origin}} → {{destination}}</div>
          <div><strong>Date:</strong> {{departure_date}} ({{travel_mode}})</div>
          <div><strong>Purpose:</strong> {{purpose}}</div>
        </div>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{{portal_url}}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Review & Approve in Portal</a>
      </div>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
        Navgurukul Travel Desk • Automated Manager Approval Routing
      </div>
    </div>`
  },
  'Approved:employee': {
    name: 'Request Approved',
    subject: 'Travel Request Approved - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
      </div>
      <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{requester_name}}</strong>,</p>
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #065f46; font-weight: bold; font-size: 14px;">✓ Manager Approval Granted</p>
        <p style="margin: 6px 0 0 0; color: #047857; font-size: 13px;">Your travel request has been approved by your manager and forwarded to PNC for booking.</p>
      </div>
      <div style="margin: 20px 0; font-size: 13px; color: #475569; line-height: 1.7;">
        <div><strong>Request ID:</strong> {{request_id}}</div>
        <div><strong>Route:</strong> {{origin}} → {{destination}} on {{departure_date}}</div>
      </div>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
        Navgurukul Travel Desk
      </div>
    </div>`
  },
  'Approved:manager': {
    name: 'Manager Approval Confirmation',
    subject: 'Confirmation: You approved travel request {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">This is confirmation that you approved the travel request for <strong>{{requester_name}}</strong> ({{request_id}}).</p>
      <p style="color: #64748b; font-size: 13px;">The request has been routed to PNC desk for ticket processing.</p>
    </div>`
  },
  'Rejected by Manager:employee': {
    name: 'Request Rejected by Manager',
    subject: 'Travel Request Not Approved - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">✕ Travel Request Not Approved</p>
        <p style="margin: 6px 0 0 0; color: #b91c1c; font-size: 13px;">Reason: {{rejection_reason}}</p>
      </div>
    </div>`
  },
  'Processing:employee': {
    name: 'Request Processing Started',
    subject: 'Travel Request In Processing - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your travel request <strong>{{request_id}}</strong> is now being actively processed by the PNC Travel Desk.</p>
    </div>`
  },
  'On Hold:employee': {
    name: 'Information Required',
    subject: 'Clarification Needed for Travel Request - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e; font-weight: bold;">Action Required: Clarification Needed</p>
        <p style="margin: 6px 0 0 0; color: #b45309; font-size: 13px;">{{information_requested}}</p>
      </div>
      <p style="font-size: 13px;">Please log in to respond so booking can resume.</p>
    </div>`
  },
  'On Hold:pnc': {
    name: 'Employee Response Received',
    subject: 'Update on Hold Request: {{requester_name}} responded - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">PNC Operations Team,</p>
      <p style="color: #334155; font-size: 14px;"><strong>{{requester_name}}</strong> has provided clarification on request <strong>{{request_id}}</strong>:</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #334155; font-size: 13px;">"{{employee_response}}"</p>
      </div>
    </div>`
  },
  'Rejected by PNC:employee': {
    name: 'Request Rejected by PNC',
    subject: 'Travel Request Unable to Book - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">✕ Travel Desk Unable to Book</p>
        <p style="margin: 6px 0 0 0; color: #b91c1c; font-size: 13px;">Reason: {{rejection_reason}}</p>
      </div>
    </div>`
  },
  'Booked:employee': {
    name: 'Travel Booked',
    subject: '✈️ Confirmed Travel Itinerary - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
        <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 500;">Booking Confirmation & Itinerary</p>
      </div>
      <p style="color: #1e293b; font-size: 15px; line-height: 1.6;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Great news! Your travel tickets have been booked and confirmed by the PNC team.</p>
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #065f46; font-weight: bold; font-size: 14px;">🎉 Confirmed Booking Details</p>
        <div style="margin-top: 8px; font-size: 13px; color: #047857; line-height: 1.7;">
          <div><strong>Booking / PNR Ref:</strong> {{booking_reference}}</div>
          <div><strong>Vendor / Provider:</strong> {{vendor_name}}</div>
          <div><strong>Ticket Cost:</strong> ₹{{estimated_cost}}</div>
          <div><strong>Journey:</strong> {{origin}} → {{destination}}</div>
          <div><strong>Date of Travel:</strong> {{departure_date}} ({{travel_mode}})</div>
        </div>
      </div>
      <p style="color: #475569; font-size: 13px; line-height: 1.5;">Please download your ticket or invoice attachments directly from your travel dashboard before departure.</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">
        Navgurukul Travel Desk • Have a safe journey!
      </div>
    </div>`
  },
  'Cancelled by Employee:employee': {
    name: 'Employee Cancellation Confirmed',
    subject: 'Travel Request Cancelled - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your travel request <strong>{{request_id}}</strong> has been successfully cancelled as requested.</p>
    </div>`
  },
  'Cancelled by Employee:manager': {
    name: 'Manager Approval Stand Down',
    subject: 'Cancelled: Travel request {{request_id}} by {{requester_name}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{manager_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px;"><strong>{{requester_name}}</strong> has cancelled travel request <strong>{{request_id}}</strong>. No approval action is required.</p>
    </div>`
  },
  'Cancelled by Employee:pnc': {
    name: 'Booked Ticket Cancellation Notice',
    subject: 'Action: Booked Ticket Cancelled by Employee - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">PNC Operations Team,</p>
      <p style="color: #334155; font-size: 14px;">Employee <strong>{{requester_name}}</strong> has requested cancellation for booked trip <strong>{{request_id}}</strong> (PNR: {{booking_reference}}). Please process refund/cancellation with vendor.</p>
    </div>`
  },
  'Cancelled by PNC:employee': {
    name: 'PNC Cancellation Notice',
    subject: 'Important: Travel Request Cancelled by Travel Desk - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your travel request <strong>{{request_id}}</strong> has been cancelled by the Travel Desk. Reason: {{cancellation_reason}}</p>
    </div>`
  },
  'Closed:employee': {
    name: 'Request Closed',
    subject: 'Travel Completed - {{request_id}}',
    body: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #FF6B35;">
        <h1 style="color: #FF6B35; margin: 0; font-size: 26px; font-weight: 800;">navgurukul</h1>
      </div>
      <p style="color: #1e293b; font-size: 15px;">Hi <strong>{{requester_name}}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your travel request <strong>{{request_id}}</strong> has been completed and closed. Thank you for using Navgurukul Travel Desk!</p>
    </div>`
  }
};

/**
 * Automatically maps lifecycle state transitions to published mail templates,
 * resolves placeholders & global CC, and inserts deterministic snapshot records into public.email_queue.
 */
export const queueEmailsForTransition = async (
  request: TravelRequest,
  fromStatus: PNCStatus | null,
  toStatus: PNCStatus,
  extraContext?: Record<string, any>
) => {
  try {
    const transitions: { audience: 'employee' | 'manager' | 'pnc'; trigger: string; getRecipients: () => Promise<string[]> }[] = [];

    // Helper to query all active PNC and Admin emails from database
    const getPncEmails = async () => {
      const { data } = await supabase.from('profiles').select('email').in('role', ['PNC', 'Admin']);
      return data?.map(u => u.email).filter(Boolean) as string[] || [];
    };

    // Transition mapping rules based on mail_sender_routine.md
    if (toStatus === PNCStatus.NOT_STARTED) {
      transitions.push({
        audience: 'employee',
        trigger: 'Not Started',
        getRecipients: async () => [request.requesterEmail]
      });
    } else if (toStatus === PNCStatus.APPROVAL_PENDING) {
      if (request.approvingManagerEmail) {
        transitions.push({
          audience: 'manager',
          trigger: 'Approval Pending',
          getRecipients: async () => [request.approvingManagerEmail!]
        });
      }
    } else if (toStatus === PNCStatus.PROCESSING) {
      if (fromStatus === PNCStatus.ON_HOLD) {
        // Employee responded to hold
        transitions.push({
          audience: 'pnc',
          trigger: 'On Hold',
          getRecipients: getPncEmails
        });
      } else {
        // Normal transition to Processing
        transitions.push({
          audience: 'employee',
          trigger: 'Processing',
          getRecipients: async () => [request.requesterEmail]
        });
      }
    } else if (toStatus === PNCStatus.APPROVED) {
      transitions.push({
        audience: 'employee',
        trigger: 'Approved',
        getRecipients: async () => [request.requesterEmail]
      });
      if (request.approvingManagerEmail) {
        transitions.push({
          audience: 'manager',
          trigger: 'Approved',
          getRecipients: async () => [request.approvingManagerEmail!]
        });
      }
    } else if (toStatus === PNCStatus.REJECTED_BY_MANAGER) {
      transitions.push({
        audience: 'employee',
        trigger: 'Rejected by Manager',
        getRecipients: async () => [request.requesterEmail]
      });
    } else if (toStatus === PNCStatus.ON_HOLD) {
      transitions.push({
        audience: 'employee',
        trigger: 'On Hold',
        getRecipients: async () => [request.requesterEmail]
      });
    } else if (toStatus === PNCStatus.REJECTED_BY_PNC) {
      transitions.push({
        audience: 'employee',
        trigger: 'Rejected by PNC',
        getRecipients: async () => [request.requesterEmail]
      });
    } else if (toStatus === PNCStatus.BOOKED) {
      transitions.push({
        audience: 'employee',
        trigger: 'Booked',
        getRecipients: async () => [request.requesterEmail]
      });
    } else if (toStatus === PNCStatus.CANCELLED_BY_EMPLOYEE) {
      transitions.push({
        audience: 'employee',
        trigger: 'Cancelled by Employee',
        getRecipients: async () => [request.requesterEmail]
      });
      if (fromStatus === PNCStatus.APPROVAL_PENDING && request.approvingManagerEmail) {
        transitions.push({
          audience: 'manager',
          trigger: 'Cancelled by Employee',
          getRecipients: async () => [request.approvingManagerEmail!]
        });
      }
      if (fromStatus === PNCStatus.PROCESSING || fromStatus === PNCStatus.ON_HOLD || fromStatus === PNCStatus.BOOKED) {
        transitions.push({
          audience: 'pnc',
          trigger: 'Cancelled by Employee',
          getRecipients: getPncEmails
        });
      }
    } else if (toStatus === PNCStatus.CANCELLED_BY_PNC) {
      transitions.push({
        audience: 'employee',
        trigger: 'Cancelled by PNC',
        getRecipients: async () => [request.requesterEmail]
      });
    } else if (toStatus === PNCStatus.CLOSED) {
      transitions.push({
        audience: 'employee',
        trigger: 'Closed',
        getRecipients: async () => [request.requesterEmail]
      });
    }

    // Resolve global CC recipients
    const globalCc = await getGlobalEmailCc();

    // Process each transition's template fetching and email insertion
    for (const t of transitions) {
      const recipients = await t.getRecipients();
      if (!recipients || recipients.length === 0) continue;

      // 1. Query database for customized template
      let template: any = null;
      try {
        const { data: dbTemplates } = await supabase
          .from('mail_templates')
          .select('*')
          .eq('status_trigger', t.trigger);

        if (dbTemplates && dbTemplates.length > 0) {
          template = dbTemplates.find((tpl: any) => tpl.audience === t.audience && tpl.status !== 'Draft' && !tpl.is_draft) ||
                     dbTemplates.find((tpl: any) => tpl.status !== 'Draft' && !tpl.is_draft) ||
                     dbTemplates[0];
        }
      } catch (e) {
        console.warn('Could not query mail_templates table:', e);
      }

      // 2. Built-in template fallback from authoritative mail_sender_routine.md
      const builtin = BUILTIN_MAIL_TEMPLATES[`${t.trigger}:${t.audience}`] ||
                      BUILTIN_MAIL_TEMPLATES[`${t.trigger}:employee`] ||
                      BUILTIN_MAIL_TEMPLATES['Not Started:employee'];

      const rawSubject = template?.subject || builtin?.subject || `Update on Travel Request: ${t.trigger} - {{request_id}}`;
      const rawBody = template?.body || builtin?.body || `<p>Travel request {{request_id}} updated to: ${t.trigger}</p>`;
      const templateName = template?.name || builtin?.name || `Travel Request ${t.trigger}`;

      const subject = resolveTemplateVariables(rawSubject, request, extraContext);
      const body = resolveTemplateVariables(rawBody, request, extraContext);

      const sortedRecipients = recipients.slice().sort().join(',');
      const idempotencyKey = `ticket:${request.id}:status:${toStatus}:aud:${t.audience}:${sortedRecipients}`;

      await supabase.from('email_queue').insert({
        ticket_id: request.id,
        to_status: toStatus,
        recipients,
        cc: globalCc,
        subject,
        body,
        template_name: templateName,
        status: 'Pending',
        last_error: null,
        idempotency_key: idempotencyKey,
        retry_count: 0,
        attempt_count: 0
      });
    }

    // 🚀 Automatic Fire-and-Forget: Trigger Edge Function worker immediately for instant delivery
    if (transitions.length > 0 && typeof supabase?.functions?.invoke === 'function') {
      void supabase.functions.invoke('process-email-queue', {
        body: { batchSize: 10 }
      }).catch(workerErr => {
        console.warn('Non-blocking background worker trigger notice:', workerErr);
      });
    }
  } catch (err) {
    // Non-blocking resilience: travel transition continues uninterrupted
    console.error('Non-blocking error in queueEmailsForTransition:', err);
  }
};
