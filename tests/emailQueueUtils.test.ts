import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueEmailsForTransition } from '../utils/emailQueueUtils';
import { PNCStatus, TravelRequest, TripType, TravelMode, Priority, ApprovalStatus } from '../types';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const insertMock = vi.fn().mockResolvedValue({ error: null });

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { setting_value: ['travel.team@navgurukul.org', 'nitin.s@navgurukul.org'] },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { email: 'pnc1@navgurukul.org' },
                  { email: 'admin1@navgurukul.org' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'mail_templates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    status_trigger: 'Approval Pending',
                    audience: 'manager',
                    subject: 'Action Required: Approval for {{requesterName}} ({{submissionId}})',
                    body: '<p>Hi Manager, please review trip to {{to}} on {{dateOfTravel}}.</p>',
                    is_draft: false,
                    status: 'Published'
                  }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'email_queue') {
          return {
            insert: insertMock
          };
        }
        return {};
      })
    }
  };
});

const createMockRequest = (overrides?: Partial<TravelRequest>): TravelRequest => ({
  id: 'req-123',
  submissionId: 'TRV-5555',
  timestamp: '2026-09-01T10:00:00.000Z',
  requesterId: 'usr-1',
  requesterName: 'Priya Sharma',
  requesterEmail: 'priya@navgurukul.org',
  requesterPhone: '9876543210',
  emergencyContactName: 'Contact Person',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Parent',
  bloodGroup: 'B+',
  purpose: 'Annual Conference',
  approvingManagerName: 'Manager Verma',
  approvingManagerEmail: 'verma@navgurukul.org',
  tripType: TripType.ONE_WAY,
  mode: TravelMode.FLIGHT,
  from: 'Delhi',
  to: 'Bangalore',
  dateOfTravel: '2026-09-25',
  numberOfTravelers: 1,
  priority: Priority.HIGH,
  approvalStatus: ApprovalStatus.PENDING,
  pncStatus: PNCStatus.APPROVAL_PENDING,
  hasViolation: true,
  ticketCost: 6500,
  vendorName: 'IndiGo',
  timeline: [],
  ...overrides
});

describe('Email Queue Side Effects: queueEmailsForTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues manager approval email with replaced merge fields for APPROVAL_PENDING', async () => {
    const request = createMockRequest();
    await queueEmailsForTransition(request, PNCStatus.NOT_STARTED, PNCStatus.APPROVAL_PENDING);

    const emailQueueTable = supabase.from('email_queue');
    expect(emailQueueTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 'req-123',
        to_status: PNCStatus.APPROVAL_PENDING,
        recipients: ['verma@navgurukul.org'],
        subject: 'Action Required: Approval for Priya Sharma (TRV-5555)',
        body: '<p>Hi Manager, please review trip to Bangalore on 2026-09-25.</p>',
        status: 'Pending'
      })
    );
  });

  it('queues employee receipt email on NOT_STARTED entry', async () => {
    const request = createMockRequest();
    await queueEmailsForTransition(request, null, PNCStatus.NOT_STARTED);

    const emailQueueTable = supabase.from('email_queue');
    expect(emailQueueTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 'req-123',
        to_status: PNCStatus.NOT_STARTED,
        recipients: ['priya@navgurukul.org']
      })
    );
  });

  it('notifies both employee and manager when request is APPROVED', async () => {
    const request = createMockRequest();
    await queueEmailsForTransition(request, PNCStatus.APPROVAL_PENDING, PNCStatus.APPROVED);

    const emailQueueTable = supabase.from('email_queue');
    // Expect 2 inserts: one for employee, one for manager
    expect(emailQueueTable.insert).toHaveBeenCalledTimes(2);
  });

  it('notifies PNC team when employee responds to ON_HOLD', async () => {
    const request = createMockRequest({
      employeeResponse: 'Selected morning flight as requested'
    });
    await queueEmailsForTransition(request, PNCStatus.ON_HOLD, PNCStatus.PROCESSING);

    const emailQueueTable = supabase.from('email_queue');
    expect(emailQueueTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 'req-123',
        to_status: PNCStatus.PROCESSING,
        recipients: expect.arrayContaining(['pnc1@navgurukul.org', 'admin1@navgurukul.org'])
      })
    );
  });

  it('notifies manager and PNC when request is cancelled while in pending/processing queues', async () => {
    const request = createMockRequest();
    await queueEmailsForTransition(request, PNCStatus.APPROVAL_PENDING, PNCStatus.CANCELLED_BY_EMPLOYEE);

    const emailQueueTable = supabase.from('email_queue');
    // Employee received confirmation + manager received notice
    expect(emailQueueTable.insert).toHaveBeenCalledTimes(2);
  });
});
