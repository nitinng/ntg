/**
 * Covers the parts of the trigger model that the old status-keyed scheme could not
 * express: two sheet rows sharing an (event, audience) pair and differing only in
 * context, the CC rules, and the nineteen rows that deliberately send nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PNCStatus, TravelEvent } from '../types';
import {
  createSupabaseMock,
  createMockRequest,
  template,
  DEFAULT_ROUTING_SETTINGS
} from './helpers/emailMocks';

const templates = [
  // Cancellation confirmed - the same event and audience, but the post-booking
  // variant is the only one that can mention a charge (sheet rows 33 and 37).
  template(TravelEvent.CANCELLATION_PROCESSED_EMPLOYEE, 'employee', {
    subject: 'Travel Request Cancelled - {{submissionId}}'
  }),
  template(TravelEvent.CANCELLATION_PROCESSED_EMPLOYEE, 'employee', {
    context_key: 'post_booking',
    subject: 'Booking Cancelled: {{submissionId}}'
  }),

  // Policy violation on a first submission vs. after a rejection (rows 2, 12, 18).
  template(TravelEvent.POLICY_VIOLATION_DETECTED, 'employee', {
    subject: 'Travel Request Received - {{submissionId}}'
  }),
  template(TravelEvent.POLICY_VIOLATION_DETECTED, 'employee', {
    context_key: 'resubmit_after_manager_rejection',
    subject: 'Update: Travel Request Received - {{submissionId}}'
  }),
  template(TravelEvent.POLICY_VIOLATION_DETECTED, 'employee', {
    context_key: 'resubmit_after_pnc_rejection',
    subject: 'Update: Travel Request Received - {{submissionId}}'
  }),

  // CC rule coverage.
  template(TravelEvent.PARTIAL_REFUND_RECEIVED, 'employee', { cc_rule: 'default_finance' }),
  template(TravelEvent.INFO_REQUEST_EXPIRED, 'employee', { cc_rule: 'default_manager' }),
  template(TravelEvent.PNC_CANCELLATION, 'employee', { cc_rule: 'default_manager_if_approved' }),
  template(TravelEvent.INFO_REQUEST_ESCALATED, 'escalation_owner', { cc_rule: 'manager' }),
  template(TravelEvent.REFUND_DISPUTED, 'finance', { cc_rule: 'default' }),
  template(TravelEvent.INFO_PROVIDED, 'pnc', { cc_rule: 'default' }),


  // Draft and archived rows must never be selected.
  template(TravelEvent.BOOKING_UPDATED, 'employee', {
    context_key: 'post_booking',
    is_draft: true,
    status: 'Draft'
  }),
  template(TravelEvent.BOOKING_UPDATED, 'employee', { subject: 'Booking Update: {{submissionId}}' })
];

// Mutated per test; the mock reads it lazily at query time.
const mockOptions = {
  templates,
  routingSettings: DEFAULT_ROUTING_SETTINGS,
  statusHistory: [] as { to_status: string; created_at: string }[]
};

const mocks = createSupabaseMock(mockOptions);

vi.mock('../supabaseClient', () => ({ supabase: mocks.supabase }));

const {
  queueEmailsForEvent,
  deriveEventFromTransition,
  resolveCc,
  invalidateRoutingConfigCache,
  SILENT_EVENTS,
  DEFAULT_ROUTING_CONFIG
} = await import('../utils/emailTriggers');

const lastInsert = () => mocks.insertMock.mock.calls[mocks.insertMock.mock.calls.length - 1][0];

describe('template context discrimination', () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    invalidateRoutingConfigCache();
    mockOptions.statusHistory = [];
  });

  it('uses the pre-booking copy when no ticket was ever issued', async () => {
    // Sheet row 33. Nothing was booked, so nothing is owed.
    await queueEmailsForEvent(
      createMockRequest(),
      TravelEvent.CANCELLATION_PROCESSED_EMPLOYEE,
      { fromStatus: PNCStatus.CANCELLATION_REQUESTED }
    );

    expect(lastInsert().subject).toBe('Travel Request Cancelled - TRV-5555');
    expect(lastInsert().context_key).toBeNull();
  });

  it('uses the post-booking copy when a ticket exists', async () => {
    // Sheet row 37. Both variants arrive from "Cancellation Requested", so the
    // stage cannot tell them apart - only the presence of a booking can.
    await queueEmailsForEvent(
      createMockRequest({ bookingReference: 'PNR-9021', ticketCost: 6500 }),
      TravelEvent.CANCELLATION_PROCESSED_EMPLOYEE,
      { fromStatus: PNCStatus.CANCELLATION_REQUESTED }
    );

    expect(lastInsert().subject).toBe('Booking Cancelled: TRV-5555');
    expect(lastInsert().context_key).toBe('post_booking');
  });

  it('falls back to the default copy when the context has no template', async () => {
    await queueEmailsForEvent(
      createMockRequest(),
      TravelEvent.PARTIAL_REFUND_RECEIVED,
      { contextKey: 'after_partial_refund' }
    );
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
  });

  it('never selects a draft template', async () => {
    await queueEmailsForEvent(
      createMockRequest({ bookingReference: 'PNR-1' }),
      TravelEvent.BOOKING_UPDATED,
      { contextKey: 'post_booking' }
    );
    // The post_booking row is a draft, so the published default must win.
    expect(lastInsert().subject).toBe('Booking Update: TRV-5555');
  });

  it('separates the two resubmission paths that share a stage', async () => {
    mockOptions.statusHistory = [{ to_status: PNCStatus.REJECTED_BY_PNC, created_at: '2026-09-10T00:00:00Z' }];

    await queueEmailsForEvent(
      createMockRequest({ resubmissionCount: 1 }),
      TravelEvent.POLICY_VIOLATION_DETECTED,
      { fromStatus: PNCStatus.NOT_STARTED, audiences: ['employee'] }
    );

    expect(lastInsert().context_key).toBe('resubmit_after_pnc_rejection');
  });

  it('treats a request that was never resubmitted as a first submission', async () => {
    mockOptions.statusHistory = [{ to_status: PNCStatus.REJECTED_BY_MANAGER, created_at: '2026-09-10T00:00:00Z' }];

    await queueEmailsForEvent(
      createMockRequest(),
      TravelEvent.POLICY_VIOLATION_DETECTED,
      { fromStatus: PNCStatus.NOT_STARTED, audiences: ['employee'] }
    );

    expect(lastInsert().context_key).toBeNull();
  });
});

describe('CC rules', () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    invalidateRoutingConfigCache();
  });

  it('adds Finance to settlement mail', async () => {
    await queueEmailsForEvent(createMockRequest(), TravelEvent.PARTIAL_REFUND_RECEIVED);
    expect(lastInsert().cc).toEqual([
      'travel.team@navgurukul.org',
      'finance@navgurukul.org'
    ]);
  });

  it('copies the manager on the final notice before closure', async () => {
    // Sheet row 28: last step before the request is closed without a reply.
    await queueEmailsForEvent(createMockRequest(), TravelEvent.INFO_REQUEST_EXPIRED);
    expect(lastInsert().cc).toContain('verma@navgurukul.org');
  });

  it('copies the manager on a desk cancellation only when they approved it', async () => {
    // Sheet row 40's CC read "Manager*" with the asterisk never defined.
    await queueEmailsForEvent(createMockRequest(), TravelEvent.PNC_CANCELLATION);
    expect(lastInsert().cc).not.toContain('verma@navgurukul.org');

    mocks.insertMock.mockClear();
    await queueEmailsForEvent(
      createMockRequest({ managerApprovalDate: '2026-09-05T10:00:00Z' }),
      TravelEvent.PNC_CANCELLATION
    );
    expect(lastInsert().cc).toContain('verma@navgurukul.org');
  });

  it('does not copy someone who is already a direct recipient', () => {
    const request = createMockRequest();
    const cc = resolveCc('default_manager', request, DEFAULT_ROUTING_CONFIG, [
      'verma@navgurukul.org'
    ]);
    expect(cc).not.toContain('verma@navgurukul.org');
  });

  it('routes the dispute to Finance rather than the traveller', async () => {
    // Sheet row 53 is internal only - the employee is not told until it resolves.
    await queueEmailsForEvent(createMockRequest(), TravelEvent.REFUND_DISPUTED);
    expect(lastInsert().recipients).toEqual(['finance@navgurukul.org']);
    expect(lastInsert().recipients).not.toContain('priya@navgurukul.org');
  });

  it('sends the escalation to the configured owners, copying the manager', async () => {
    await queueEmailsForEvent(createMockRequest(), TravelEvent.INFO_REQUEST_ESCALATED);
    expect(lastInsert().recipients).toEqual(['escalation@navgurukul.org']);
    expect(lastInsert().cc).toEqual(['verma@navgurukul.org']);
  });
});

describe('PNC desk routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profilesRoleFilters.length = 0;
    mockOptions.templates = templates;
    invalidateRoutingConfigCache();
  });

  it('counts PNC Admin as part of the PNC desk', async () => {
    // A 'PNC Admin' profile is staff in every other respect (App.tsx 606-640),
    // but the recipient lookup listed only PNC and Admin, so a desk staffed by
    // PNC Admins received none of their own queue mail.
    await queueEmailsForEvent(createMockRequest(), TravelEvent.INFO_PROVIDED, {
      fromStatus: PNCStatus.ON_HOLD,
      toStatus: PNCStatus.PROCESSING
    });

    expect(mocks.profilesRoleFilters.length).toBeGreaterThan(0);
    for (const roles of mocks.profilesRoleFilters) {
      expect(roles).toContain('PNC Admin');
      expect(roles).toContain('PNC');
      expect(roles).toContain('Admin');
    }
  });

  it('still resolves the pnc audience to the configured desk addresses', async () => {
    await queueEmailsForEvent(createMockRequest(), TravelEvent.INFO_PROVIDED, {
      fromStatus: PNCStatus.ON_HOLD,
      toStatus: PNCStatus.PROCESSING
    });

    const row = lastInsert();
    expect(row.audience).toBe('pnc');
    expect(row.recipients.length).toBeGreaterThan(0);
  });
});

describe('deliberate silence', () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    invalidateRoutingConfigCache();
  });

  it.each(SILENT_EVENTS)('sends nothing for %s', async event => {
    await queueEmailsForEvent(createMockRequest(), event);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('keeps a booking self-loop silent unless the change is material', () => {
    // Sheet rows 30 and 31 are silent; row 29 mails, and the caller raises
    // BOOKING_UPDATED explicitly to say so.
    expect(deriveEventFromTransition(PNCStatus.BOOKED, PNCStatus.BOOKED))
      .toBe(TravelEvent.BOOKING_DETAIL_EDITED);
    expect(SILENT_EVENTS).toContain(TravelEvent.BOOKING_DETAIL_EDITED);
  });

  it('skips an audience with no recipient rather than dropping the whole event', async () => {
    await queueEmailsForEvent(
      createMockRequest({ approvingManagerEmail: undefined, managerEmail: undefined }),
      TravelEvent.INFO_REQUEST_ESCALATED
    );
    // Escalation owners still receive it; the empty manager CC is simply omitted.
    expect(lastInsert().recipients).toEqual(['escalation@navgurukul.org']);
    expect(lastInsert().cc).toEqual([]);
  });
});

describe('transition to event mapping', () => {
  it('distinguishes an employee withdrawal from a processed cancellation', () => {
    expect(deriveEventFromTransition(PNCStatus.APPROVAL_PENDING, PNCStatus.CANCELLED_BY_EMPLOYEE))
      .toBe(TravelEvent.EMPLOYEE_CANCELLED_PRE_APPROVAL);
    expect(deriveEventFromTransition(PNCStatus.CANCELLATION_REQUESTED, PNCStatus.CANCELLED_BY_EMPLOYEE))
      .toBe(TravelEvent.CANCELLATION_PROCESSED_EMPLOYEE);
  });

  it('separates SLA closure from an employee cancellation', () => {
    // Sheet row 28 calls this out: attributing an SLA closure to the employee
    // would distort cancellation reporting and the cost split.
    expect(deriveEventFromTransition(PNCStatus.ON_HOLD, PNCStatus.CANCELLED_BY_SYSTEM))
      .toBe(TravelEvent.INFO_REQUEST_EXPIRED);
  });

  it('tells a nothing-recoverable close from an end-of-reconciliation close', () => {
    expect(deriveEventFromTransition(PNCStatus.CANCELLED_BY_EMPLOYEE, PNCStatus.RECONCILED))
      .toBe(TravelEvent.NO_REFUND_REQUIRED);
    expect(deriveEventFromTransition(PNCStatus.FULLY_REFUNDED, PNCStatus.RECONCILED))
      .toBe(TravelEvent.REFUND_RECONCILIATION_COMPLETED);
  });

  it('maps the whole refund tail', () => {
    expect(deriveEventFromTransition(PNCStatus.BOOKED, PNCStatus.PARTIALLY_CANCELLED))
      .toBe(TravelEvent.PARTIAL_CANCELLATION);
    expect(deriveEventFromTransition(PNCStatus.PENDING_REFUND, PNCStatus.PARTIALLY_REFUNDED))
      .toBe(TravelEvent.PARTIAL_REFUND_RECEIVED);
    expect(deriveEventFromTransition(PNCStatus.PENDING_REFUND, PNCStatus.FULLY_REFUNDED))
      .toBe(TravelEvent.REFUND_COMPLETED);
    expect(deriveEventFromTransition(PNCStatus.PENDING_REFUND, PNCStatus.WRITTEN_OFF))
      .toBe(TravelEvent.REFUND_WRITTEN_OFF);
    expect(deriveEventFromTransition(PNCStatus.PENDING_REFUND, PNCStatus.DISPUTED))
      .toBe(TravelEvent.REFUND_DISPUTED);
  });
});

describe('idempotency', () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    invalidateRoutingConfigCache();
  });

  it('keys on ticket, event, audience, context and recipients', async () => {
    await queueEmailsForEvent(createMockRequest(), TravelEvent.PARTIAL_REFUND_RECEIVED);
    const key = lastInsert().idempotency_key;
    expect(key).toContain('ticket:req-123');
    expect(key).toContain(`event:${TravelEvent.PARTIAL_REFUND_RECEIVED}`);
    expect(key).toContain('aud:employee');
    expect(key).toContain('ctx:default');
  });

  it('lets a reminder scan distinguish repeat sends of one event', async () => {
    await queueEmailsForEvent(createMockRequest(), TravelEvent.PARTIAL_REFUND_RECEIVED, {
      idempotencySuffix: '2026-09-20T00:00:00Z'
    });
    expect(lastInsert().idempotency_key).toContain('seq:2026-09-20T00:00:00Z');
  });
});
