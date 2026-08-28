import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PNCStatus, TravelRequest, TripType, TravelMode, Priority, ApprovalStatus } from '../types';
import { queueEmailsForTransition, resolveTemplateVariables, DEFAULT_GLOBAL_CC } from '../utils/emailQueueUtils';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: [], error: null })
        }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { setting_value: ['travel.team@navgurukul.org', 'nitin.s@navgurukul.org'] },
          error: null
        })
      }),
      in: vi.fn().mockResolvedValue({
        data: [{ email: 'pnc1@navgurukul.org' }, { email: 'admin1@navgurukul.org' }],
        error: null
      })
    }),
    insert: insertMock
  });

  return {
    supabase: {
      from: fromMock
    }
  };
});

describe('Transactional Email Lifecycle Routine', () => {
  const mockRequest: TravelRequest = {
    id: 'req-001',
    submissionId: 'TRV-O-260828-001',
    timestamp: '2026-08-28T10:00:00Z',
    requesterId: 'user-001',
    requesterName: 'Priya Sharma',
    requesterEmail: 'priya@navgurukul.org',
    approvingManagerName: 'Rahul Verma',
    approvingManagerEmail: 'rahul.manager@navgurukul.org',
    purpose: 'Campus Hackathon',
    tripType: TripType.ONE_WAY,
    mode: TravelMode.FLIGHT,
    from: 'Delhi',
    to: 'Bangalore',
    dateOfTravel: '2026-09-10',
    ticketCost: 5200,
    vendorName: 'Air India',
    bookingReference: 'AI-99124',
    violationReason: 'Flight notice < 15 days',
    statusChangeReason: 'Approved for critical event',
    priority: Priority.HIGH,
    approvalStatus: ApprovalStatus.APPROVED,
    pncStatus: PNCStatus.APPROVED,
    timeline: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves all dynamic template variables correctly', () => {
    const templateSubject = 'Travel Request {{request_id}} for {{requester_name}}';
    const templateBody = '<p>Hello {{requester_name}}, your {{travel_mode}} from {{origin}} to {{destination}} on {{departure_date}} costs ₹{{estimated_cost}} (Ref: {{booking_reference}}).</p>';

    const resolvedSubject = resolveTemplateVariables(templateSubject, mockRequest);
    const resolvedBody = resolveTemplateVariables(templateBody, mockRequest);

    expect(resolvedSubject).toBe('Travel Request TRV-O-260828-001 for Priya Sharma');
    expect(resolvedBody).toContain('Hello Priya Sharma, your Flight from Delhi to Bangalore on 2026-09-10 costs ₹5200 (Ref: AI-99124).');
    expect(resolvedBody).not.toContain('{{');
  });

  it('queues an email with Global CC when request is submitted (Not Started)', async () => {
    await queueEmailsForTransition(mockRequest, null, PNCStatus.NOT_STARTED);

    expect(supabase.from).toHaveBeenCalledWith('email_queue');
    const insertMock = supabase.from('email_queue').insert as any;
    expect(insertMock).toHaveBeenCalled();
    const queuedItem = insertMock.mock.calls[0][0];

    expect(queuedItem.recipients).toEqual(['priya@navgurukul.org']);
    expect(queuedItem.cc).toEqual(DEFAULT_GLOBAL_CC);
    expect(queuedItem.to_status).toBe(PNCStatus.NOT_STARTED);
    expect(queuedItem.idempotency_key).toContain('ticket:req-001:status:Not Started:aud:employee:priya@navgurukul.org');
  });

  it('queues manager approval email when status moves to Approval Pending', async () => {
    await queueEmailsForTransition(mockRequest, PNCStatus.NOT_STARTED, PNCStatus.APPROVAL_PENDING);

    const insertMock = supabase.from('email_queue').insert as any;
    expect(insertMock).toHaveBeenCalled();
    const queuedItem = insertMock.mock.calls[0][0];

    expect(queuedItem.recipients).toEqual(['rahul.manager@navgurukul.org']);
    expect(queuedItem.cc).toEqual(DEFAULT_GLOBAL_CC);
    expect(queuedItem.to_status).toBe(PNCStatus.APPROVAL_PENDING);
    expect(queuedItem.idempotency_key).toContain('aud:manager:rahul.manager@navgurukul.org');
  });

  it('queues both employee and manager emails on Approved transition', async () => {
    await queueEmailsForTransition(mockRequest, PNCStatus.APPROVAL_PENDING, PNCStatus.APPROVED);

    const insertMock = supabase.from('email_queue').insert as any;
    expect(insertMock).toHaveBeenCalledTimes(2);

    const empEmail = insertMock.mock.calls[0][0];
    const mgrEmail = insertMock.mock.calls[1][0];

    expect(empEmail.recipients).toEqual(['priya@navgurukul.org']);
    expect(mgrEmail.recipients).toEqual(['rahul.manager@navgurukul.org']);
  });

  it('queues PNC alert email when employee responds to On Hold clarification', async () => {
    await queueEmailsForTransition(mockRequest, PNCStatus.ON_HOLD, PNCStatus.PROCESSING);

    const insertMock = supabase.from('email_queue').insert as any;
    expect(insertMock).toHaveBeenCalled();
    const pncItem = insertMock.mock.calls[0][0];

    expect(pncItem.recipients).toEqual(['pnc1@navgurukul.org', 'admin1@navgurukul.org']);
  });

  it('queues confirmation with itinerary details when ticket is Booked', async () => {
    await queueEmailsForTransition(mockRequest, PNCStatus.PROCESSING, PNCStatus.BOOKED);

    const insertMock = supabase.from('email_queue').insert as any;
    expect(insertMock).toHaveBeenCalled();
    const bookedItem = insertMock.mock.calls[0][0];

    expect(bookedItem.recipients).toEqual(['priya@navgurukul.org']);
    expect(bookedItem.to_status).toBe(PNCStatus.BOOKED);
  });
});
