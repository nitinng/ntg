import { describe, it, expect, vi } from 'vitest';
import { PNCStatus, TravelRequest, TripType, TravelMode, Priority, ApprovalStatus } from '../types';
import { queueEmailsForTransition } from '../utils/emailQueueUtils';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockRejectedValue(new Error('Database timeout connecting to settings'))
              })
            })
          };
        }
        if (table === 'mail_templates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  or: vi.fn().mockRejectedValue(new Error('PostgREST query exception'))
                })
              })
            })
          };
        }
        if (table === 'email_queue') {
          return {
            insert: vi.fn().mockRejectedValue(new Error('Database lock contention'))
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        };
      })
    }
  };
});

describe('Email Provider & Queue Failure Isolation', () => {
  const sampleRequest: TravelRequest = {
    id: 'req-fail-01',
    submissionId: 'TRV-O-260828-999',
    timestamp: '2026-08-28T10:00:00Z',
    requesterId: 'user-fail',
    requesterName: 'Kavita Singh',
    requesterEmail: 'kavita@navgurukul.org',
    purpose: 'Quarterly Sync',
    tripType: TripType.ONE_WAY,
    mode: TravelMode.FLIGHT,
    from: 'Pune',
    to: 'Dharamshala',
    dateOfTravel: '2026-09-20',
    priority: Priority.MEDIUM,
    approvalStatus: ApprovalStatus.APPROVED,
    pncStatus: PNCStatus.PROCESSING,
    timeline: []
  };

  it('guarantees travel operation succeeds without unhandled promise rejection when DB/email error occurs', async () => {
    // This function must NEVER throw or bubble an unhandled rejection
    let didThrow = false;
    try {
      await queueEmailsForTransition(sampleRequest, PNCStatus.NOT_STARTED, PNCStatus.PROCESSING);
    } catch (err) {
      didThrow = true;
    }

    expect(didThrow).toBe(false);
  });
});
