/**
 * Desk ownership of a request.
 *
 * Requests in the PNC queue had no owner, so two staff could pick up the same
 * booking and nobody could tell whether a request had been looked at. The first
 * PNC or PNC Admin to move a request into Processing claims it; a PNC Admin can
 * hand it to someone else.
 *
 * The claim is recorded on travel_requests.assigned_pnc_id, and the human-
 * readable trail goes in the request timeline rather than ticket_status_history
 * -- that table records *status* transitions, and a claim changes no status.
 */

import { supabase } from '../supabaseClient';
import { TravelRequest, User, UserRole, TimelineEvent } from '../types';

/** Roles that can hold a request. */
export const canOwnRequests = (role?: UserRole | null): boolean =>
  role === UserRole.PNC || role === UserRole.PNC_ADMIN || role === UserRole.ADMIN;

/**
 * Whether this user may take a request that someone else already holds.
 *
 * Claiming an unowned request is open to any desk member; taking one off a
 * colleague is a supervisory act, so it is limited to PNC Admin and Admin.
 */
export const canReassign = (role?: UserRole | null): boolean =>
  role === UserRole.PNC_ADMIN || role === UserRole.ADMIN;

export const canClaim = (request: TravelRequest, user?: User | null): boolean => {
  if (!user || !canOwnRequests(user.role)) return false;
  if (!request.assignedPncId) return true;
  if (request.assignedPncId === user.id) return false; // already theirs
  return canReassign(user.role);
};

/** Display name for the current owner, for a queue column or a detail panel. */
export const ownerLabel = (
  request: TravelRequest,
  users: { id: string; name?: string; email: string }[]
): string => {
  if (!request.assignedPncId) return 'Unassigned';
  const owner = users.find(u => u.id === request.assignedPncId);
  return owner?.name || owner?.email || 'Assigned';
};

export interface AssignmentResult {
  request: TravelRequest;
  error?: string;
}

/**
 * Assigns (or reassigns) a request and records it on the timeline.
 *
 * Never throws: ownership is a convenience over the queue, and failing to claim
 * must not abandon the status change that triggered it. The caller decides
 * whether a failure is worth surfacing.
 */
export const assignRequestTo = async (
  request: TravelRequest,
  assignee: User,
  actor: User,
  options: { silent?: boolean } = {}
): Promise<AssignmentResult> => {
  const assignedAt = new Date().toISOString();

  const event =
    assignee.id === actor.id
      ? `Claimed by ${actor.name || actor.email}`
      : `Assigned to ${assignee.name || assignee.email}`;

  const timeline: TimelineEvent[] = [
    ...(request.timeline || []),
    {
      id: `${Date.now()}-assign`,
      timestamp: assignedAt,
      actor: actor.name || actor.email,
      event,
      details: request.assignedPncId ? 'Reassigned from a previous owner.' : 'First claim on this request.'
    }
  ];

  const { error } = await supabase
    .from('travel_requests')
    .update({
      assigned_pnc_id: assignee.id,
      assigned_at: assignedAt,
      ...(options.silent ? {} : { timeline })
    })
    .eq('id', request.id);

  if (error) {
    console.warn('Could not assign request:', error.message);
    return { request, error: error.message };
  }

  return {
    request: {
      ...request,
      assignedPncId: assignee.id,
      assignedAt,
      ...(options.silent ? {} : { timeline })
    }
  };
};

/**
 * Claims a request for the user moving it into Processing, if it is unowned.
 *
 * Deliberately a no-op when the request already has an owner: moving a
 * colleague's request along (answering a hold, say) should not quietly take it
 * from them.
 */
export const claimOnProcessing = async (
  request: TravelRequest,
  actor?: User | null
): Promise<TravelRequest> => {
  if (!actor || !canOwnRequests(actor.role)) return request;
  if (request.assignedPncId) return request;

  const { request: updated } = await assignRequestTo(request, actor, actor);
  return updated;
};
