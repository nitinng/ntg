import { describe, it, expect } from 'vitest';
import { checkPolicyViolation } from '../utils/policyUtils';
import { TravelRequest, TravelModePolicy, TravelMode, TripType, Priority, ApprovalStatus, PNCStatus } from '../types';

const createMockRequest = (overrides?: Partial<TravelRequest>): TravelRequest => ({
  id: 'req-1',
  submissionId: 'TRV-1001',
  timestamp: '2026-09-01T10:00:00.000Z',
  requesterId: 'user-1',
  requesterName: 'John Doe',
  requesterEmail: 'john@navgurukul.org',
  requesterPhone: '9876543210',
  emergencyContactName: 'Jane Doe',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Spouse',
  bloodGroup: 'O+',
  purpose: 'Campus Visit',
  tripType: TripType.ONE_WAY,
  mode: TravelMode.FLIGHT,
  from: 'Delhi',
  to: 'Dharamshala',
  dateOfTravel: '2026-09-20', // 19 days after request timestamp
  numberOfTravelers: 1,
  priority: Priority.MEDIUM,
  approvalStatus: ApprovalStatus.PENDING,
  pncStatus: PNCStatus.NOT_STARTED,
  hasViolation: false,
  timeline: [],
  ...overrides,
});

const defaultPolicies: TravelModePolicy[] = [
  { id: 'pol-1', travelMode: TravelMode.FLIGHT, minAdvanceDays: 15 },
  { id: 'pol-2', travelMode: TravelMode.TRAIN, minAdvanceDays: 7 },
  { id: 'pol-3', travelMode: TravelMode.BUS, minAdvanceDays: 3 }
];

describe('Policy Utility: checkPolicyViolation', () => {
  it('returns true if request already has hasViolation explicitly flagged', () => {
    const req = createMockRequest({
      hasViolation: true,
      dateOfTravel: '2026-10-01' // 30 days in advance (well beyond policy)
    });
    expect(checkPolicyViolation(req, defaultPolicies)).toBe(true);
  });

  it('returns false if policies array is empty or undefined', () => {
    const req = createMockRequest({
      hasViolation: false,
      dateOfTravel: '2026-09-02' // Only 1 day advance
    });
    expect(checkPolicyViolation(req, [])).toBe(false);
    expect(checkPolicyViolation(req, undefined as any)).toBe(false);
  });

  it('detects flight violation when notice days are less than minAdvanceDays', () => {
    const req = createMockRequest({
      mode: TravelMode.FLIGHT,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-10' // 9 days diff < 15 days min
    });
    expect(checkPolicyViolation(req, defaultPolicies)).toBe(true);
  });

  it('passes flight validation when notice days equal or exceed minAdvanceDays', () => {
    const exactReq = createMockRequest({
      mode: TravelMode.FLIGHT,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-16' // 15 days diff == 15 days min
    });
    expect(checkPolicyViolation(exactReq, defaultPolicies)).toBe(false);

    const safeReq = createMockRequest({
      mode: TravelMode.FLIGHT,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-25' // 24 days diff > 15 days min
    });
    expect(checkPolicyViolation(safeReq, defaultPolicies)).toBe(false);
  });

  it('evaluates train policy correctly (7 days min)', () => {
    const violatingTrain = createMockRequest({
      mode: TravelMode.TRAIN,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-05' // 4 days diff < 7
    });
    expect(checkPolicyViolation(violatingTrain, defaultPolicies)).toBe(true);

    const validTrain = createMockRequest({
      mode: TravelMode.TRAIN,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-08' // 7 days diff == 7
    });
    expect(checkPolicyViolation(validTrain, defaultPolicies)).toBe(false);
  });

  it('evaluates bus policy correctly (3 days min)', () => {
    const violatingBus = createMockRequest({
      mode: TravelMode.BUS,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-02' // 1 day diff < 3
    });
    expect(checkPolicyViolation(violatingBus, defaultPolicies)).toBe(true);

    const validBus = createMockRequest({
      mode: TravelMode.BUS,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-05' // 4 days diff > 3
    });
    expect(checkPolicyViolation(validBus, defaultPolicies)).toBe(false);
  });

  it('handles zero or negative minAdvanceDays without triggering violations', () => {
    const zeroPolicy: TravelModePolicy[] = [
      { id: 'pol-0', travelMode: TravelMode.BUS, minAdvanceDays: 0 }
    ];
    const req = createMockRequest({
      mode: TravelMode.BUS,
      timestamp: '2026-09-01T00:00:00.000Z',
      dateOfTravel: '2026-09-01'
    });
    expect(checkPolicyViolation(req, zeroPolicy)).toBe(false);
  });

  it('handles past travel dates as a violation', () => {
    const pastReq = createMockRequest({
      mode: TravelMode.FLIGHT,
      timestamp: '2026-09-10T00:00:00.000Z',
      dateOfTravel: '2026-09-05' // Travel date before request date
    });
    expect(checkPolicyViolation(pastReq, defaultPolicies)).toBe(true);
  });
});
