/**
 * Desk ownership. The rules that matter are the negative ones: claiming must
 * not become a way to take a colleague's work, and an employee must never
 * appear as an owner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, PNCStatus } from '../types';
import { createMockRequest } from './helpers/emailMocks';

const updateMock = vi.fn().mockResolvedValue({ error: null });
const eqMock = vi.fn(() => updateMock());
const fromMock = vi.fn((_table: string) => ({ update: vi.fn(() => ({ eq: eqMock })) }));

vi.mock('../supabaseClient', () => ({ supabase: { from: (table: string) => fromMock(table) } }));

const {
  canOwnRequests,
  canReassign,
  canClaim,
  ownerLabel,
  assignRequestTo,
  claimOnProcessing
} = await import('../utils/assignment');

const user = (role: UserRole, id = 'u1', name = 'Desk One') => ({
  id,
  name,
  email: `${id}@navgurukul.org`,
  role
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({ error: null });
});

describe('who can own a request', () => {
  it('admits the desk roles and nobody else', () => {
    expect(canOwnRequests(UserRole.PNC)).toBe(true);
    expect(canOwnRequests(UserRole.PNC_ADMIN)).toBe(true);
    expect(canOwnRequests(UserRole.ADMIN)).toBe(true);
    expect(canOwnRequests(UserRole.EMPLOYEE)).toBe(false);
    expect(canOwnRequests(UserRole.FINANCE)).toBe(false);
    expect(canOwnRequests(undefined)).toBe(false);
  });

  it('limits taking work off a colleague to supervisors', () => {
    expect(canReassign(UserRole.PNC_ADMIN)).toBe(true);
    expect(canReassign(UserRole.ADMIN)).toBe(true);
    // A PNC member may claim free work but not take held work.
    expect(canReassign(UserRole.PNC)).toBe(false);
  });
});

describe('canClaim', () => {
  it('lets any desk member claim an unowned request', () => {
    const request = createMockRequest();
    expect(canClaim(request, user(UserRole.PNC))).toBe(true);
    expect(canClaim(request, user(UserRole.PNC_ADMIN))).toBe(true);
  });

  it('never lets an employee claim, even their own request', () => {
    expect(canClaim(createMockRequest(), user(UserRole.EMPLOYEE))).toBe(false);
  });

  it('does not offer a claim on a request the user already holds', () => {
    const request = { ...createMockRequest(), assignedPncId: 'u1' };
    expect(canClaim(request, user(UserRole.PNC, 'u1'))).toBe(false);
  });

  it('blocks a PNC member from taking a colleague-held request', () => {
    const request = { ...createMockRequest(), assignedPncId: 'other' };
    expect(canClaim(request, user(UserRole.PNC, 'u1'))).toBe(false);
  });

  it('lets a PNC Admin reassign a colleague-held request', () => {
    const request = { ...createMockRequest(), assignedPncId: 'other' };
    expect(canClaim(request, user(UserRole.PNC_ADMIN, 'u1'))).toBe(true);
  });

  it('is false with no signed-in user', () => {
    expect(canClaim(createMockRequest(), null)).toBe(false);
  });
});

describe('ownerLabel', () => {
  const users = [{ id: 'u1', name: 'Asha', email: 'asha@navgurukul.org' }];

  it('reads Unassigned when nobody holds it', () => {
    expect(ownerLabel(createMockRequest(), users)).toBe('Unassigned');
  });

  it('names the owner', () => {
    expect(ownerLabel({ ...createMockRequest(), assignedPncId: 'u1' } as any, users)).toBe('Asha');
  });

  it('degrades gracefully when the owner is not in the loaded list', () => {
    // A queue row must not render blank because a profile has not loaded.
    expect(ownerLabel({ ...createMockRequest(), assignedPncId: 'gone' } as any, users)).toBe('Assigned');
  });
});

describe('claimOnProcessing', () => {
  it('claims an unowned request for the desk member moving it', async () => {
    const actor = user(UserRole.PNC, 'u1');
    const result = await claimOnProcessing(createMockRequest(), actor);

    expect(result.assignedPncId).toBe('u1');
    expect(result.assignedAt).toBeTruthy();
    expect(fromMock).toHaveBeenCalledWith('travel_requests');
  });

  it('leaves an already-owned request with its owner', async () => {
    // Answering a hold on a colleague's request must not take it from them.
    const request = { ...createMockRequest(), assignedPncId: 'other' };
    const result = await claimOnProcessing(request as any, user(UserRole.PNC, 'u1'));

    expect(result.assignedPncId).toBe('other');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does nothing for a non-desk actor', async () => {
    const result = await claimOnProcessing(createMockRequest(), user(UserRole.EMPLOYEE, 'e1'));
    expect(result.assignedPncId).toBeFalsy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does nothing with no actor', async () => {
    const result = await claimOnProcessing(createMockRequest(), null);
    expect(result.assignedPncId).toBeFalsy();
  });

  it('returns the request unchanged when the write fails', async () => {
    // Ownership is a convenience over the queue; failing to claim must not
    // abandon the status change that triggered it.
    updateMock.mockResolvedValue({ error: { message: 'denied' } });
    const result = await claimOnProcessing(createMockRequest(), user(UserRole.PNC, 'u1'));
    expect(result.assignedPncId).toBeFalsy();
  });
});

describe('assignRequestTo', () => {
  it('records a claim on the timeline', async () => {
    const actor = user(UserRole.PNC, 'u1', 'Asha');
    const { request } = await assignRequestTo(createMockRequest(), actor, actor);

    const entry = request.timeline[request.timeline.length - 1];
    expect(entry.event).toContain('Claimed by Asha');
    expect(entry.actor).toBe('Asha');
  });

  it('distinguishes a reassignment from a self-claim', async () => {
    const actor = user(UserRole.PNC_ADMIN, 'admin1', 'Ravi');
    const assignee = user(UserRole.PNC, 'u2', 'Meera');
    const { request } = await assignRequestTo(
      { ...createMockRequest(), assignedPncId: 'u1' } as any,
      assignee,
      actor
    );

    const entry = request.timeline[request.timeline.length - 1];
    expect(entry.event).toContain('Assigned to Meera');
    expect(entry.actor).toBe('Ravi');
    expect(request.assignedPncId).toBe('u2');
  });

  it('surfaces a write failure instead of claiming success', async () => {
    updateMock.mockResolvedValue({ error: { message: 'row-level security' } });
    const actor = user(UserRole.PNC, 'u1');
    const { request, error } = await assignRequestTo(createMockRequest(), actor, actor);

    expect(error).toContain('row-level security');
    expect(request.assignedPncId).toBeFalsy();
  });
});
