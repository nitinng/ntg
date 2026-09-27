/**
 * Template variable resolution.
 *
 * The triggers sheet interpolates thirty variables across its thirty-seven mails.
 * A variable that silently resolves to an empty string produces a mail that reads
 * as broken - "Recovered:  " on a settlement statement - so every group the sheet
 * uses is pinned here, including the ones with no value yet.
 *
 * Transition and audience routing is covered in emailQueueUtils.test.ts and
 * emailTriggers.test.ts; this file does not repeat it.
 */

import { describe, it, expect, vi } from 'vitest';
import { PNCStatus, TravelRequest, TripType, TravelMode, Priority, ApprovalStatus } from '../types';
import { resolveTemplateVariables } from '../utils/emailQueueUtils';

vi.mock('../supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({})), functions: { invoke: vi.fn() } }
}));

const baseRequest: TravelRequest = {
  id: 'req-001',
  submissionId: 'TRV-O-260828-001',
  timestamp: '2026-08-28T10:00:00Z',
  requesterId: 'user-001',
  requesterName: 'Priya Sharma',
  requesterEmail: 'priya@navgurukul.org',
  requesterPhone: '9876543210',
  emergencyContactName: 'Contact Person',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Parent',
  bloodGroup: 'B+',
  approvingManagerName: 'Rahul Verma',
  approvingManagerEmail: 'rahul.manager@navgurukul.org',
  purpose: 'Campus Hackathon',
  tripType: TripType.ONE_WAY,
  mode: TravelMode.FLIGHT,
  from: 'Delhi',
  to: 'Bangalore',
  dateOfTravel: '2026-09-10',
  numberOfTravelers: 1,
  ticketCost: 5200,
  vendorName: 'Air India',
  bookingReference: 'AI-99124',
  violationDetails: 'Flight notice < 15 days',
  statusChangeReason: 'Approved for critical event',
  priority: Priority.HIGH,
  approvalStatus: ApprovalStatus.APPROVED,
  pncStatus: PNCStatus.APPROVED,
  hasViolation: true,
  timeline: []
};

describe('template variable resolution', () => {
  it('resolves the trip variables used by most of the sheet', () => {
    const subject = 'Travel Request {{request_id}} for {{requester_name}}';
    const body =
      '<p>Hello {{requester_name}}, your {{travel_mode}} from {{origin}} to {{destination}} ' +
      'on {{departure_date}} (Ref: {{booking_reference}}), approved by {{manager_name}}.</p>';

    expect(resolveTemplateVariables(subject, baseRequest))
      .toBe('Travel Request TRV-O-260828-001 for Priya Sharma');

    const rendered = resolveTemplateVariables(body, baseRequest);
    expect(rendered).toContain('your Flight from Delhi to Bangalore on 2026-09-10');
    expect(rendered).toContain('Ref: AI-99124');
    expect(rendered).toContain('approved by Rahul Verma');
    expect(rendered).not.toContain('{{');
  });

  it('accepts both the snake_case and camelCase spellings the sheet mixes', () => {
    const rendered = resolveTemplateVariables(
      '{{submissionId}} {{request_id}} {{requesterName}} {{requester_name}}',
      baseRequest
    );
    expect(rendered).toBe('TRV-O-260828-001 TRV-O-260828-001 Priya Sharma Priya Sharma');
  });

  it('formats settlement amounts consistently', () => {
    // Sheet rows 48 and 50 put four amounts side by side. A bare number next to a
    // formatted one reads as a different currency.
    const rendered = resolveTemplateVariables(
      'Original {{original_fare}} | Recovered {{refund_amount}} | ' +
      'Absorbed {{org_absorbed_amount}} | Due {{employee_owed_amount}}',
      {
        ...baseRequest,
        originalFare: 5200,
        refundAmount: 3200.5,
        orgAbsorbedAmount: 2000,
        employeeOwedAmount: 0
      }
    );

    expect(rendered).toBe(
      'Original Rs. 5,200.00 | Recovered Rs. 3,200.50 | ' +
      'Absorbed Rs. 2,000.00 | Due Rs. 0.00'
    );
  });

  it('says so rather than rendering a blank when an amount is not yet known', () => {
    // Sheet row 37 deliberately quotes no amount before the refund is known.
    const rendered = resolveTemplateVariables('Refund: {{refund_amount}}', baseRequest);
    expect(rendered).toBe('Refund: Not yet determined');
  });

  it('derives the outstanding balance from expected minus recovered', () => {
    const rendered = resolveTemplateVariables('{{outstanding_amount}}', {
      ...baseRequest,
      expectedRefund: 5000,
      refundAmount: 3000
    });
    expect(rendered).toBe('Rs. 2,000.00');
  });

  it('falls back to the ticket cost when no original fare was recorded', () => {
    const rendered = resolveTemplateVariables('{{original_fare}}', baseRequest);
    expect(rendered).toBe('Rs. 5,200.00');
  });

  it('counts days on hold for the reminder and escalation mails', () => {
    // Sheet rows 26, 26b and 27 lead with how long the request has been waiting.
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const rendered = resolveTemplateVariables('{{days_on_hold}}', {
      ...baseRequest,
      infoRequestedAt: threeDaysAgo
    });
    expect(rendered).toBe('3');
  });

  it('reports zero days on hold when the request was never held', () => {
    expect(resolveTemplateVariables('{{days_on_hold}}', baseRequest)).toBe('0');
  });

  it('points segment variables at the portal when no itinerary text is stored', () => {
    // Sheet row 43 names both what is gone and what remains - an empty list there
    // would defeat the entire purpose of the mail.
    const rendered = resolveTemplateVariables(
      'Cancelled: {{cancelled_segments}} / Active: {{active_segments}}',
      baseRequest
    );
    expect(rendered).not.toContain('Cancelled:  /');
    expect(rendered).toContain('Travel Desk');
  });

  it('lets the caller override any variable through extra context', () => {
    // The reminder scan supplies days_on_hold itself, computed from the scan window.
    const rendered = resolveTemplateVariables('{{days_on_hold}}', baseRequest, {
      '{{days_on_hold}}': '9'
    });
    expect(rendered).toBe('9');
  });

  it('leaves no unresolved placeholder across the sheet variable set', () => {
    const allVariables = [
      'submissionId', 'requester_name', 'requester_email', 'manager_name', 'origin',
      'destination', 'departure_date', 'travel_mode', 'purpose', 'ticket_cost',
      'vendor_name', 'violation_reasons', 'rejection_reason', 'information_requested',
      'employee_response', 'booking_reference', 'cancellation_reason', 'original_fare',
      'refund_amount', 'expected_refund', 'written_off_amount', 'employee_owed_amount',
      'org_absorbed_amount', 'outstanding_amount', 'cancelled_segments', 'active_segments',
      'change_summary', 'days_on_hold', 'current_status', 'support_email', 'portal_url'
    ];

    const rendered = resolveTemplateVariables(
      allVariables.map(v => `{{${v}}}`).join(' | '),
      baseRequest
    );

    expect(rendered).not.toContain('{{');
    expect(rendered).not.toContain('}}');
  });
});
