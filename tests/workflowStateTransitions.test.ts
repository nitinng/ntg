import { describe, it, expect } from 'vitest';
import { PNCStatus, TravelRequest, TripType, TravelMode, Priority, ApprovalStatus } from '../types';
import { ALLOWED_TRANSITIONS, isValidStatusTransition } from '../utils/workflow';

describe('Workflow State Machine & Transition Matrix', () => {
  const allStatuses = Object.values(PNCStatus);

  it('verifies all expected valid transitions from NOT_STARTED', () => {
    expect(isValidStatusTransition(PNCStatus.NOT_STARTED, PNCStatus.APPROVAL_PENDING)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.NOT_STARTED, PNCStatus.PROCESSING)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.NOT_STARTED, PNCStatus.CANCELLED_BY_EMPLOYEE)).toBe(true);

    // Invalid transitions directly from NOT_STARTED
    expect(isValidStatusTransition(PNCStatus.NOT_STARTED, PNCStatus.BOOKED)).toBe(false);
    expect(isValidStatusTransition(PNCStatus.NOT_STARTED, PNCStatus.CLOSED)).toBe(false);
    expect(isValidStatusTransition(PNCStatus.NOT_STARTED, PNCStatus.REJECTED_BY_PNC)).toBe(false);
  });

  it('verifies transitions from APPROVAL_PENDING', () => {
    expect(isValidStatusTransition(PNCStatus.APPROVAL_PENDING, PNCStatus.APPROVED)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.APPROVAL_PENDING, PNCStatus.REJECTED_BY_MANAGER)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.APPROVAL_PENDING, PNCStatus.CANCELLED_BY_EMPLOYEE)).toBe(true);

    // Invalid direct booking from APPROVAL_PENDING
    expect(isValidStatusTransition(PNCStatus.APPROVAL_PENDING, PNCStatus.BOOKED)).toBe(false);
    expect(isValidStatusTransition(PNCStatus.APPROVAL_PENDING, PNCStatus.CLOSED)).toBe(false);
  });

  it('verifies APPROVED auto-advances only to PROCESSING', () => {
    expect(isValidStatusTransition(PNCStatus.APPROVED, PNCStatus.PROCESSING)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.APPROVED, PNCStatus.BOOKED)).toBe(false);
    expect(isValidStatusTransition(PNCStatus.APPROVED, PNCStatus.CLOSED)).toBe(false);
  });

  it('verifies REJECTED_BY_MANAGER allows resubmission back to NOT_STARTED only', () => {
    expect(isValidStatusTransition(PNCStatus.REJECTED_BY_MANAGER, PNCStatus.NOT_STARTED)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.REJECTED_BY_MANAGER, PNCStatus.BOOKED)).toBe(false);
    expect(isValidStatusTransition(PNCStatus.REJECTED_BY_MANAGER, PNCStatus.PROCESSING)).toBe(false);
  });

  it('verifies PROCESSING transitions (Hold, PNC Reject, Book, Cancel)', () => {
    expect(isValidStatusTransition(PNCStatus.PROCESSING, PNCStatus.ON_HOLD)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.PROCESSING, PNCStatus.REJECTED_BY_PNC)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.PROCESSING, PNCStatus.BOOKED)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.PROCESSING, PNCStatus.CANCELLED_BY_EMPLOYEE)).toBe(true);

    // Cannot close directly without booking or cancellation
    expect(isValidStatusTransition(PNCStatus.PROCESSING, PNCStatus.CLOSED)).toBe(false);
  });

  it('verifies ON_HOLD transitions (Resume processing or Cancel)', () => {
    expect(isValidStatusTransition(PNCStatus.ON_HOLD, PNCStatus.PROCESSING)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.ON_HOLD, PNCStatus.CANCELLED_BY_EMPLOYEE)).toBe(true);

    // Cannot book straight from on-hold without resuming processing
    expect(isValidStatusTransition(PNCStatus.ON_HOLD, PNCStatus.BOOKED)).toBe(false);
  });

  it('verifies BOOKED transitions (Cancel by Employee, Cancel by PNC, Close)', () => {
    expect(isValidStatusTransition(PNCStatus.BOOKED, PNCStatus.CANCELLED_BY_EMPLOYEE)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.BOOKED, PNCStatus.CANCELLED_BY_PNC)).toBe(true);
    expect(isValidStatusTransition(PNCStatus.BOOKED, PNCStatus.CLOSED)).toBe(true);

    // Cannot revert booked ticket to Pending or Processing directly
    expect(isValidStatusTransition(PNCStatus.BOOKED, PNCStatus.NOT_STARTED)).toBe(false);
    expect(isValidStatusTransition(PNCStatus.BOOKED, PNCStatus.PROCESSING)).toBe(false);
  });

  it('verifies CLOSED is a strictly terminal state with no outbound transitions', () => {
    expect(ALLOWED_TRANSITIONS[PNCStatus.CLOSED]).toEqual([]);

    for (const status of allStatuses) {
      expect(isValidStatusTransition(PNCStatus.CLOSED, status)).toBe(false);
    }
  });

  it('ensures self-transitions (A -> A) return false', () => {
    for (const status of allStatuses) {
      expect(isValidStatusTransition(status, status)).toBe(false);
    }
  });
});
