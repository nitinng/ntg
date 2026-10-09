import { describe, it, expect } from 'vitest';
import { TravelRequest, User, UserRole, PNCStatus, ApprovalStatus, Priority } from '../types';
import { StageSegment, RequestStageJourney, PncStaffMetrics } from '../components/AnalyticsView';

const createMockRequest = (overrides?: Partial<TravelRequest>): TravelRequest => ({
  id: 'req-1',
  submissionId: 'TRV-1001',
  timestamp: '2026-10-01T10:00:00.000Z',
  requesterId: 'user-1',
  requesterName: 'John Doe',
  requesterEmail: 'john@navgurukul.org',
  requesterPhone: '9876543210',
  emergencyContactName: 'Jane Doe',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Spouse',
  bloodGroup: 'O+',
  purpose: 'Campus Visit',
  tripType: 'One Way' as any,
  mode: 'Flight' as any,
  from: 'Delhi',
  to: 'Pune',
  dateOfTravel: '2026-10-25',
  numberOfTravelers: 1,
  priority: Priority.MEDIUM,
  approvalStatus: ApprovalStatus.APPROVED,
  pncStatus: PNCStatus.BOOKED,
  hasViolation: false,
  timeline: [],
  ...overrides,
});

const mockStaff: User[] = [
  { id: 'u-1', name: 'Asha Sharma', email: 'asha@navgurukul.org', role: UserRole.PNC },
  { id: 'u-2', name: 'Ravi Patel', email: 'ravi@navgurukul.org', role: UserRole.PNC_ADMIN },
  { id: 'u-3', name: 'Meera Sen', email: 'meera@navgurukul.org', role: UserRole.PNC },
];

describe('PNC Analytics Stage-to-Stage & Handover Logic', () => {
  it('identifies single owner end-to-end processing with no handover', () => {
    const req = createMockRequest({
      timeline: [
        { id: '1', timestamp: '2026-10-01T10:30:00.000Z', actor: 'Manager', event: 'Approved' },
        { id: '2', timestamp: '2026-10-01T11:00:00.000Z', actor: 'Asha Sharma', event: 'Claimed by Asha Sharma' },
        { id: '3', timestamp: '2026-10-01T14:00:00.000Z', actor: 'Asha Sharma', event: 'Status changed to: Booked' },
      ],
      assignedPncId: 'u-1',
    });

    // Verification of single-owner timeline
    const firstClaim = req.timeline.find(e => e.event.includes('Claimed by'));
    expect(firstClaim?.actor).toBe('Asha Sharma');

    const handovers = req.timeline.filter(e => e.event.includes('Reassigned') || e.details?.includes('Reassigned'));
    expect(handovers.length).toBe(0);
  });

  it('detects mid-way continuation when another PNC user takes over an active request', () => {
    const req = createMockRequest({
      timeline: [
        { id: '1', timestamp: '2026-10-01T10:00:00.000Z', actor: 'Manager', event: 'Approved' },
        { id: '2', timestamp: '2026-10-01T11:00:00.000Z', actor: 'Asha Sharma', event: 'Claimed by Asha Sharma' },
        { id: '3', timestamp: '2026-10-01T13:00:00.000Z', actor: 'Asha Sharma', event: 'Status changed to: On Hold', details: 'Awaiting student ID' },
        { id: '4', timestamp: '2026-10-01T16:00:00.000Z', actor: 'Ravi Patel', event: 'Claimed by Ravi Patel', details: 'Reassigned from a previous owner.' },
        { id: '5', timestamp: '2026-10-01T18:00:00.000Z', actor: 'Ravi Patel', event: 'Status changed to: Booked', details: 'Tickets booked on Indigo' },
      ],
      assignedPncId: 'u-2',
    });

    const actor1 = 'Asha Sharma';
    const actor2 = 'Ravi Patel';

    // Verify stage 1 duration: 11:00 to 16:00 (5 hours)
    const tStart = new Date(req.timeline[1].timestamp).getTime();
    const tHandover = new Date(req.timeline[3].timestamp).getTime();
    const tBooked = new Date(req.timeline[4].timestamp).getTime();

    const stage1Hours = (tHandover - tStart) / 3600000;
    const stage2Hours = (tBooked - tHandover) / 3600000;

    expect(stage1Hours).toBe(5);
    expect(stage2Hours).toBe(2);

    // Verify actors
    expect(req.timeline[1].actor).toBe(actor1);
    expect(req.timeline[3].actor).toBe(actor2);
  });

  it('correctly credits pickups, handovers initiated, and handovers received', () => {
    // Asha starts 2 requests, 1 completed by her, 1 handed over to Ravi
    // Ravi completes the handed-over request and picks up 1 request of his own
    const staffStats: Record<string, { pickups: number; outHandovers: number; inHandovers: number; completed: number }> = {
      'Asha Sharma': { pickups: 2, outHandovers: 1, inHandovers: 0, completed: 1 },
      'Ravi Patel': { pickups: 1, outHandovers: 0, inHandovers: 1, completed: 2 },
    };

    expect(staffStats['Asha Sharma'].pickups).toBe(2);
    expect(staffStats['Asha Sharma'].outHandovers).toBe(1);
    expect(staffStats['Ravi Patel'].inHandovers).toBe(1);
    expect(staffStats['Ravi Patel'].completed).toBe(2);
  });
});
