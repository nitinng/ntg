import { supabase } from '../supabaseClient';
import { TravelRequest, PNCStatus } from '../types';

/**
 * Automatically fetches the correct published email templates, resolves placeholders,
 * and pushes the rendered emails into the DB email_queue table.
 */
export const queueEmailsForTransition = async (
  request: TravelRequest,
  fromStatus: PNCStatus | null,
  toStatus: PNCStatus
) => {
  try {
    const transitions: { audience: 'employee' | 'manager' | 'pnc'; trigger: string; getRecipients: () => Promise<string[]> }[] = [];

    // Helper to query all active PNC and Admin emails from database
    const getPncEmails = async () => {
      const { data } = await supabase.from('profiles').select('email').in('role', ['PNC', 'Admin']);
      return data?.map(u => u.email).filter(Boolean) as string[] || [];
    };

    // Transition mapping rules
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
      if (fromStatus === PNCStatus.PROCESSING || fromStatus === PNCStatus.ON_HOLD) {
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

    // Process each transition's template fetching and email insertion
    for (const t of transitions) {
      const recipients = await t.getRecipients();
      if (recipients.length === 0) continue;

      // Find published mail template matching (status_trigger, audience)
      const { data: templates } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('status_trigger', t.trigger)
        .eq('audience', t.audience)
        .eq('is_draft', false);

      const template = templates && templates.length > 0 ? templates[0] : null;
      let subject = '';
      let body = '';

      const mergeFields = (text: string) => {
        if (!text) return '';
        return text
          .replace(/\{\{requesterName\}\}/g, request.requesterName || '')
          .replace(/\{\{requesterEmail\}\}/g, request.requesterEmail || '')
          .replace(/\{\{submissionId\}\}/g, request.submissionId || request.id || '')
          .replace(/\{\{from\}\}/g, request.from || '')
          .replace(/\{\{to\}\}/g, request.to || '')
          .replace(/\{\{dateOfTravel\}\}/g, request.dateOfTravel || '')
          .replace(/\{\{ticketCost\}\}/g, request.ticketCost ? String(request.ticketCost) : '')
          .replace(/\{\{vendorName\}\}/g, request.vendorName || '')
          .replace(/\{\{invoiceUrl\}\}/g, request.invoiceUrl || '')
          .replace(/\{\{purpose\}\}/g, request.purpose || '')
          .replace(/\{\{infoRequested\}\}/g, request.infoRequested || '')
          .replace(/\{\{employeeResponse\}\}/g, request.employeeResponse || '')
          .replace(/\{\{statusChangeReason\}\}/g, request.statusChangeReason || '')
          .replace(/\{\{cancelledReason\}\}/g, request.cancelledReason || '');
      };

      if (template) {
        subject = mergeFields(template.subject);
        body = mergeFields(template.body);
      } else {
        // Fallback default structure if no template is published
        subject = `Update on Travel Request: ${t.trigger} (${request.submissionId || request.id})`;
        body = `<p>Hi ${request.requesterName},</p>
                <p>The status of your travel request has been updated to: <strong>${t.trigger}</strong>.</p>
                <p>Please log in to the portal for more details.</p>`;
      }

      const idempotencyKey = `ticket:${request.id}:status:${toStatus}:aud:${t.audience}:${recipients.slice().sort().join(',')}`;

      await supabase.from('email_queue').insert({
        ticket_id: request.id,
        to_status: toStatus,
        recipients,
        subject,
        body,
        status: 'Pending',
        idempotency_key: idempotencyKey,
        retry_count: 0,
        attempt_count: 0
      });
    }
  } catch (err) {
    console.error('Error in queueEmailsForTransition:', err);
  }
};
