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

      // Find published mail template matching (status_trigger, audience)
      const { data: templates } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('status_trigger', t.trigger)
        .eq('audience', t.audience)
        .or('status.eq.Published,is_draft.eq.false');

      const template = templates && templates.length > 0 ? templates[0] : null;
      let subject = '';
      let body = '';
      let isTemplatePublished = true;

      if (template) {
        subject = resolveTemplateVariables(template.subject, request, extraContext);
        body = resolveTemplateVariables(template.body, request, extraContext);
      } else {
        // Fallback default structure
        subject = `Update on Travel Request: ${t.trigger} (${request.submissionId || request.id})`;
        body = `<div style="font-family: Arial, sans-serif; padding: 20px;">
                  <p>Hi ${request.requesterName || 'there'},</p>
                  <p>The status of travel request <strong>${request.submissionId || request.id}</strong> has been updated to: <strong>${t.trigger}</strong>.</p>
                  <p>Please log in to the Navgurukul Travel Portal for full details.</p>
                </div>`;
      }

      const sortedRecipients = recipients.slice().sort().join(',');
      const idempotencyKey = `ticket:${request.id}:status:${toStatus}:aud:${t.audience}:${sortedRecipients}`;

      await supabase.from('email_queue').insert({
        ticket_id: request.id,
        to_status: toStatus,
        recipients,
        cc: globalCc,
        subject,
        body,
        status: isTemplatePublished ? 'Pending' : 'Failed',
        last_error: isTemplatePublished ? null : 'Template not published or missing',
        idempotency_key: idempotencyKey,
        retry_count: 0,
        attempt_count: 0
      });
    }
  } catch (err) {
    // Non-blocking resilience: travel transition continues uninterrupted
    console.error('Non-blocking error in queueEmailsForTransition:', err);
  }
};
