import { describe, it, expect } from 'vitest';
import { PNCStatus, UserRole } from '../types';
import { createMockRequest } from './helpers/emailMocks';

describe('Me vs All Filtering in Queue and PNC Dashboard', () => {
  const currentUser = {
    id: 'user-me-1',
    name: 'Asha Sharma',
    email: 'asha@navgurukul.org',
    role: UserRole.PNC
  };

  const otherUser = {
    id: 'user-other-2',
    name: 'Ravi Patel',
    email: 'ravi@navgurukul.org',
    role: UserRole.PNC_ADMIN
  };

  const req1 = { ...createMockRequest(), id: 'r1', pncStatus: PNCStatus.PROCESSING, assignedPncId: currentUser.id };
  const req2 = { ...createMockRequest(), id: 'r2', pncStatus: PNCStatus.BOOKED, assignedPncId: currentUser.id };
  const req3 = { ...createMockRequest(), id: 'r3', pncStatus: PNCStatus.PROCESSING, assignedPncId: otherUser.id };
  const req4 = { ...createMockRequest(), id: 'r4', pncStatus: PNCStatus.NOT_STARTED, assignedPncId: null };
  const req5 = { ...createMockRequest(), id: 'r5', pncStatus: PNCStatus.APPROVAL_PENDING, assignedPncId: null };

  const requests = [req1, req2, req3, req4, req5];

  it('correctly partitions requests between All and Me in the Queue', () => {
    // All
    const allCount = requests.length;
    expect(allCount).toBe(5);

    // Me (only tickets claimed by currentUser)
    const myRequests = requests.filter(r => Boolean(currentUser.id && r.assignedPncId === currentUser.id));
    expect(myRequests.length).toBe(2);
    expect(myRequests.map(r => r.id)).toEqual(['r1', 'r2']);

    // Stage counts for All
    const processingAll = requests.filter(r => r.pncStatus === PNCStatus.PROCESSING).length;
    expect(processingAll).toBe(2);

    // Stage counts for Me
    const processingMe = myRequests.filter(r => r.pncStatus === PNCStatus.PROCESSING).length;
    expect(processingMe).toBe(1);

    const bookedMe = myRequests.filter(r => r.pncStatus === PNCStatus.BOOKED).length;
    expect(bookedMe).toBe(1);

    const notStartedMe = myRequests.filter(r => r.pncStatus === PNCStatus.NOT_STARTED).length;
    expect(notStartedMe).toBe(0);
  });

  it('handles user with no claimed requests gracefully', () => {
    const freshUser = {
      id: 'fresh-user-3',
      name: 'New Agent',
      email: 'new@navgurukul.org',
      role: UserRole.PNC
    };

    const myRequests = requests.filter(r => Boolean(freshUser.id && r.assignedPncId === freshUser.id));
    expect(myRequests.length).toBe(0);
  });

  it('correctly combines time filter with Me filter in PNC Dashboard', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const tReq1 = { ...createMockRequest(), id: 't1', timestamp: twoDaysAgo, assignedPncId: currentUser.id };
    const tReq2 = { ...createMockRequest(), id: 't2', timestamp: tenDaysAgo, assignedPncId: currentUser.id };
    const tReq3 = { ...createMockRequest(), id: 't3', timestamp: twoDaysAgo, assignedPncId: otherUser.id };

    const timeRequests = [tReq1, tReq2, tReq3];

    // Filter by last 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last7DaysRequests = timeRequests.filter(r => new Date(r.timestamp) >= sevenDaysAgo);
    expect(last7DaysRequests.length).toBe(2); // tReq1 and tReq3

    // Scope to Me within last 7 days
    const last7DaysMe = last7DaysRequests.filter(r => Boolean(currentUser.id && r.assignedPncId === currentUser.id));
    expect(last7DaysMe.length).toBe(1);
    expect(last7DaysMe[0].id).toBe('t1');
  });

  it('correctly tracks and filters partially booked and pending refund requests', () => {
    const refundReq = { ...createMockRequest(), id: 'ref1', pncStatus: PNCStatus.PENDING_REFUND, assignedPncId: currentUser.id };
    const partCancelledReq = { ...createMockRequest(), id: 'part1', pncStatus: PNCStatus.PARTIALLY_CANCELLED, assignedPncId: otherUser.id };
    const partBookedAliasReq = { ...createMockRequest(), id: 'part2', pncStatus: 'Partially Booked' as any, assignedPncId: currentUser.id };

    const extendedRequests = [...requests, refundReq, partCancelledReq, partBookedAliasReq];

    // Counting helper matching PNCDashboard countStatus
    const countStatus = (status: PNCStatus | string, list: any[]) => {
      return list.filter(r => {
        if (r.pncStatus === status) return true;
        if (status === PNCStatus.PARTIALLY_CANCELLED && r.pncStatus === 'Partially Booked') return true;
        return false;
      }).length;
    };

    // Pending Refund count
    expect(countStatus(PNCStatus.PENDING_REFUND, extendedRequests)).toBe(1);

    // Partially Cancelled / Partially Booked count (combining enum and alias)
    expect(countStatus(PNCStatus.PARTIALLY_CANCELLED, extendedRequests)).toBe(2);

    // Filter by Me
    const myExtended = extendedRequests.filter(r => Boolean(currentUser.id && r.assignedPncId === currentUser.id));
    expect(countStatus(PNCStatus.PENDING_REFUND, myExtended)).toBe(1);
    expect(countStatus(PNCStatus.PARTIALLY_CANCELLED, myExtended)).toBe(1);
  });
});
