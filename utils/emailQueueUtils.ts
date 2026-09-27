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
    request.pnr ||
    (request.travelLegs && request.travelLegs[0]?.pnr) ||
    'CONFIRMED';

  // Money is rendered once, consistently. The settlement mails (sheet rows 46-53)
  // put several of these side by side, so a bare number next to a formatted one
  // would read as a different currency.
  const money = (amount: number | undefined | null): string =>
    amount === undefined || amount === null || Number.isNaN(Number(amount))
      ? 'Not yet determined'
      : `Rs. ${Number(amount).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;

  // Days the request has been waiting on the employee. Used by the reminder,
  // escalation and closure mails (rows 26, 26b, 27, 28).
  const holdStart = request.infoRequestedAt || request.onHoldSince;
  const daysOnHold = holdStart
    ? String(Math.max(0, Math.floor((Date.now() - new Date(holdStart).getTime()) / 86_400_000)))
    : '0';

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
    '{{violation_reasons}}': request.violationDetails || 'Policy advance booking notice / expense threshold limit',
    '{{rejection_reason}}': request.statusChangeReason || 'Policy guidelines exceeded',
    '{{statusChangeReason}}': request.statusChangeReason || '',
    '{{information_requested}}': request.infoRequested || '',
    '{{infoRequested}}': request.infoRequested || '',
    '{{employee_response}}': request.employeeResponse || '',
    '{{employeeResponse}}': request.employeeResponse || '',
    '{{booking_reference}}': bookingRef,
    '{{cancellation_reason}}': request.cancelledReason || request.statusChangeReason || 'Plans changed',
    '{{cancelledReason}}': request.cancelledReason || '',
    '{{portal_url}}': 'https://ng-travel-desk.vercel.app',
    '{{support_email}}': 'travel.team@navgurukul.org',

    // Refund and reconciliation (sheet rows 37-53).
    '{{original_fare}}': money(request.originalFare ?? request.ticketCost),
    '{{refund_amount}}': money(request.refundAmount),
    '{{expected_refund}}': money(request.expectedRefund),
    '{{written_off_amount}}': money(request.writtenOffAmount),
    '{{employee_owed_amount}}': money(request.employeeOwedAmount ?? 0),
    '{{org_absorbed_amount}}': money(request.orgAbsorbedAmount),
    '{{cancellation_charge}}': money(request.cancellationCharge),
    '{{outstanding_amount}}': money(
      request.expectedRefund !== undefined && request.refundAmount !== undefined
        ? Math.max(0, request.expectedRefund - request.refundAmount)
        : undefined
    ),

    // Partial cancellation (rows 43, 45) and booking updates (row 29).
    '{{cancelled_segments}}': request.cancelledSegments || 'See the itinerary on the Travel Desk',
    '{{active_segments}}': request.activeSegments || 'See the itinerary on the Travel Desk',
    '{{change_summary}}': request.changeSummary || 'See the updated itinerary on the Travel Desk',

    // Hold tracking (rows 26, 26b, 27, 28).
    '{{days_on_hold}}': daysOnHold,
    '{{current_status}}': request.pncStatus || '',

    ...(extraContext || {})
  };

  let rendered = content;
  for (const [placeholder, value] of Object.entries(variables)) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered.replace(new RegExp(escaped, 'g'), String(value ?? ''));
  }

  // Ensure any legacy text headers in older templates are seamlessly upgraded to the official brand logo
  rendered = rendered.replace(
    /<h1[^>]*>navgurukul(?: travel desk)?<\/h1>/gi,
    '<img src="https://ng-travel-desk.vercel.app/navgurukul-brand-logo.png" alt="NavGurukul" style="height:36px;width:auto;max-width:200px;display:inline-block;" />'
  );

  return rendered;
};

/**
 * Queues the lifecycle mails for a stage transition.
 *
 * Retained as the entry point the workflow UI already calls. It now derives the
 * sheet's trigger event from the transition and delegates; the event API in
 * ./emailTriggers is the one to call directly when the event is already known,
 * which is the case for everything the refund and reminder flows raise.
 *
 * The built-in template constants this module used to carry have been removed.
 * Copy now lives in the mail_templates table, seeded from the triggers sheet, so
 * that an unmigrated database sends nothing and says so rather than quietly
 * delivering superseded wording.
 */
export const queueEmailsForTransition = async (
  request: TravelRequest,
  fromStatus: PNCStatus | null,
  toStatus: PNCStatus,
  extraContext?: Record<string, any>
): Promise<void> => {
  const { deriveEventFromTransition, queueEmailsForEvent } = await import('./emailTriggers');

  const event = deriveEventFromTransition(fromStatus, toStatus);
  if (!event) return;

  await queueEmailsForEvent(request, event, {
    fromStatus,
    toStatus,
    extraContext
  });
};
