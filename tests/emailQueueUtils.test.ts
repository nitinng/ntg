import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PNCStatus, TravelEvent } from '../types';
import {
  createSupabaseMock,
  createMockRequest,
  template
} from './helpers/emailMocks';

const mocks = createSupabaseMock({
  templates: [
    template(TravelEvent.POLICY_VIOLATION_DETECTED, 'employee'),
    template(TravelEvent.POLICY_VIOLATION_DETECTED, 'manager'),
    template(TravelEvent.POLICY_EVALUATION_PASSED, 'employee'),
    template(TravelEvent.MANAGER_APPROVED, 'employee'),
    template(TravelEvent.INFO_PROVIDED, 'pnc'),
    template(TravelEvent.BOOKING_CONFIRMED, 'employee'),
    template(TravelEvent.EMPLOYEE_CANCELLED_PRE_APPROVAL, 'employee'),
    template(TravelEvent.EMPLOYEE_CANCELLED_PRE_APPROVAL, 'manager')
  ]
});

vi.mock('../supabaseClient', () => ({ supabase: mocks.supabase }));

// Imported after the mock so the module graph picks up the double.
const { queueEmailsForTransition } = await import('../utils/emailQueueUtils');
const { invalidateRoutingConfigCache } = await import('../utils/emailTriggers');

describe('queueEmailsForTransition', () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    mocks.invokeMock.mockClear();
    invalidateRoutingConfigCache();
  });

  it('stays silent on submission, because the policy verdict carries the notice', async () => {
    // Sheet row 1: REQUEST_SUBMITTED sends nothing; the transition that follows
    // (row 2 or row 4) is what reaches the employee.
    await queueEmailsForTransition(createMockRequest(), null, PNCStatus.NOT_STARTED);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('mails both the employee and the manager on a policy violation', async () => {
    // Sheet rows 2 and 3.
    await queueEmailsForTransition(
      createMockRequest(),
      PNCStatus.NOT_STARTED,
      PNCStatus.APPROVAL_PENDING
    );

    expect(mocks.insertMock).toHaveBeenCalledTimes(2);
    const audiences = mocks.insertMock.mock.calls.map(c => c[0].audience).sort();
    expect(audiences).toEqual(['employee', 'manager']);
  });

  it('records the event and template that produced each queued message', async () => {
    await queueEmailsForTransition(
      createMockRequest(),
      PNCStatus.NOT_STARTED,
      PNCStatus.APPROVAL_PENDING
    );

    const row = mocks.insertMock.mock.calls.find(c => c[0].audience === 'manager')![0];
    expect(row).toMatchObject({
      ticket_id: 'req-123',
      event: TravelEvent.POLICY_VIOLATION_DETECTED,
      audience: 'manager',
      to_status: PNCStatus.APPROVAL_PENDING,
      status: 'Pending',
      recipients: ['verma@navgurukul.org']
    });
    expect(row.template_key).toBe('policy_violation_detected.manager.default');
  });

  it('routes a passed policy evaluation straight to the employee', async () => {
    // Sheet row 4: no approval needed, request enters the PNC queue.
    await queueEmailsForTransition(
      createMockRequest(),
      PNCStatus.NOT_STARTED,
      PNCStatus.PROCESSING
    );

    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
    expect(mocks.insertMock.mock.calls[0][0]).toMatchObject({
      event: TravelEvent.POLICY_EVALUATION_PASSED,
      audience: 'employee'
    });
  });

  it('notifies PNC, not the employee, when the employee answers a hold', async () => {
    // Sheet row 25: the response goes back to the desk that asked for it.
    await queueEmailsForTransition(
      createMockRequest({ pncStatus: PNCStatus.ON_HOLD }),
      PNCStatus.ON_HOLD,
      PNCStatus.PROCESSING
    );

    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
    expect(mocks.insertMock.mock.calls[0][0]).toMatchObject({
      event: TravelEvent.INFO_PROVIDED,
      audience: 'pnc',
      recipients: ['pnc1@navgurukul.org', 'admin1@navgurukul.org']
    });
  });

  it('tells both sides when the employee withdraws before a manager decision', async () => {
    // Sheet rows 8 and 9: the manager's pending task is closed out explicitly.
    await queueEmailsForTransition(
      createMockRequest(),
      PNCStatus.APPROVAL_PENDING,
      PNCStatus.CANCELLED_BY_EMPLOYEE
    );

    expect(mocks.insertMock).toHaveBeenCalledTimes(2);
    const audiences = mocks.insertMock.mock.calls.map(c => c[0].audience).sort();
    expect(audiences).toEqual(['employee', 'manager']);
  });

  it('sends nothing for a transition the sheet marks silent', async () => {
    // Sheet row 6: Approved -> Processing. Row 5 already said it is with the desk.
    await queueEmailsForTransition(
      createMockRequest(),
      PNCStatus.APPROVED,
      PNCStatus.PROCESSING
    );
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('nudges the delivery worker once mail is queued', async () => {
    await queueEmailsForTransition(
      createMockRequest(),
      PNCStatus.APPROVAL_PENDING,
      PNCStatus.APPROVED
    );
    expect(mocks.invokeMock).toHaveBeenCalledWith('process-email-queue', expect.anything());
  });

  it('does not wake the worker when nothing was queued', async () => {
    await queueEmailsForTransition(createMockRequest(), null, PNCStatus.NOT_STARTED);
    expect(mocks.invokeMock).not.toHaveBeenCalled();
  });
});
