import { PNCStatus, UserRole, TravelRequest } from '../types';

/**
 * Transition rules mapped directly from ticket_lifecycle_flow.md
 */
export const ALLOWED_TRANSITIONS: Record<PNCStatus, PNCStatus[]> = {
  [PNCStatus.NOT_STARTED]: [
    PNCStatus.APPROVAL_PENDING,
    PNCStatus.PROCESSING,
    PNCStatus.CANCELLED_BY_EMPLOYEE
  ],
  [PNCStatus.APPROVAL_PENDING]: [
    PNCStatus.APPROVED,
    PNCStatus.REJECTED_BY_MANAGER,
    PNCStatus.CANCELLED_BY_EMPLOYEE
  ],
  [PNCStatus.APPROVED]: [
    PNCStatus.PROCESSING
  ],
  [PNCStatus.REJECTED_BY_MANAGER]: [
    PNCStatus.NOT_STARTED // Resubmission
  ],
  [PNCStatus.PROCESSING]: [
    PNCStatus.ON_HOLD,
    PNCStatus.REJECTED_BY_PNC,
    PNCStatus.BOOKED,
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLATION_REQUESTED
  ],
  [PNCStatus.ON_HOLD]: [
    PNCStatus.PROCESSING, // Employee responds
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLATION_REQUESTED,
    PNCStatus.ON_HOLD_ESCALATED, // SLA breached, escalation owner takes it (sheet row 27)
    PNCStatus.CANCELLED_BY_SYSTEM // No reply within the SLA (sheet row 28)
  ],
  [PNCStatus.ON_HOLD_ESCALATED]: [
    PNCStatus.PROCESSING,
    PNCStatus.CANCELLED_BY_SYSTEM,
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLATION_REQUESTED
  ],
  // The SLA closed this request, not the employee. Kept distinct from
  // CANCELLED_BY_EMPLOYEE so cancellation reporting and the cost split stay honest
  // (sheet row 28 calls this fix out explicitly).
  [PNCStatus.CANCELLED_BY_SYSTEM]: [
    PNCStatus.CLOSED
  ],
  [PNCStatus.REJECTED_BY_PNC]: [
    PNCStatus.NOT_STARTED // Resubmission
  ],
  [PNCStatus.BOOKED]: [
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLED_BY_PNC,
    PNCStatus.CANCELLATION_REQUESTED,
    PNCStatus.PARTIALLY_CANCELLED,
    PNCStatus.CLOSED
  ],
  [PNCStatus.PARTIALLY_CANCELLED]: [
    PNCStatus.PENDING_REFUND,
    PNCStatus.CANCELLATION_REQUESTED,
    PNCStatus.CANCELLED_BY_PNC,
    PNCStatus.CLOSED
  ],
  [PNCStatus.CANCELLATION_REQUESTED]: [
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLED_BY_PNC,
    PNCStatus.PROCESSING,
    PNCStatus.BOOKED
  ],
  [PNCStatus.CANCELLED_BY_EMPLOYEE]: [
    PNCStatus.PENDING_REFUND, // Money to recover (sheet row 38)
    PNCStatus.RECONCILED,     // Nothing recoverable (sheet row 39)
    PNCStatus.CLOSED
  ],
  [PNCStatus.CANCELLED_BY_PNC]: [
    PNCStatus.PENDING_REFUND, // Sheet row 41
    PNCStatus.RECONCILED,     // Sheet row 42
    PNCStatus.CLOSED
  ],

  // Refund and reconciliation tail (sheet rows 46-53).
  [PNCStatus.PENDING_REFUND]: [
    PNCStatus.PARTIALLY_REFUNDED,
    PNCStatus.FULLY_REFUNDED,
    PNCStatus.WRITTEN_OFF,
    PNCStatus.DISPUTED
  ],
  [PNCStatus.PARTIALLY_REFUNDED]: [
    PNCStatus.FULLY_REFUNDED,
    PNCStatus.WRITTEN_OFF,
    PNCStatus.DISPUTED,
    // A part-refunded ticket whose remainder is settled has nothing left to
    // chase, so reconciliation must be reachable without a detour through a
    // full refund or a write-off that did not happen.
    PNCStatus.RECONCILED
  ],
  [PNCStatus.FULLY_REFUNDED]: [
    PNCStatus.RECONCILED
  ],
  [PNCStatus.WRITTEN_OFF]: [
    PNCStatus.RECONCILED
  ],
  [PNCStatus.DISPUTED]: [
    PNCStatus.PARTIALLY_REFUNDED,
    PNCStatus.FULLY_REFUNDED,
    PNCStatus.WRITTEN_OFF,
    // A dispute that is resolved in the org's favour closes directly.
    PNCStatus.RECONCILED
  ],
  [PNCStatus.RECONCILED]: [
    PNCStatus.CLOSED
  ],

  // Travel booked outside the system and recorded afterwards (sheet rows 57, 58).
  [PNCStatus.CLOSED_RECORDED]: [],

  [PNCStatus.CLOSED]: [] // Terminal state
};

/**
 * Validates whether a state transition from fromStatus to toStatus is valid.
 */
export const isValidStatusTransition = (fromStatus: PNCStatus, toStatus: PNCStatus): boolean => {
  if (fromStatus === toStatus) return false;
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
};

/**
 * Validates whether a user with the specified role and email is authorized to perform an action on a request.
 */
export const isUserAuthorizedForAction = (
  user: { email: string; role: UserRole; id?: string },
  action: 'approve_as_manager' | 'reject_as_manager' | 'process_pnc' | 'book_pnc' | 'cancel_as_employee' | 'cancel_as_pnc' | 'resubmit_as_employee' | 'modify_role',
  request?: TravelRequest,
  targetUser?: { email: string; id?: string; role?: UserRole }
): boolean => {
  const PROTECTED_ADMIN_EMAIL = 'nitin@navgurukul.org';

  switch (action) {
    case 'approve_as_manager':
    case 'reject_as_manager':
      if (user.role === UserRole.ADMIN) return true;
      if (!request || !request.approvingManagerEmail) return false;
      return request.approvingManagerEmail.toLowerCase() === user.email.toLowerCase();

    case 'process_pnc':
    case 'book_pnc':
    case 'cancel_as_pnc':
      return user.role === UserRole.PNC || user.role === UserRole.PNC_ADMIN || user.role === UserRole.ADMIN;

    case 'cancel_as_employee':
      if (!request) return false;
      if (user.role === UserRole.ADMIN) return true;
      return request.requesterEmail.toLowerCase() === user.email.toLowerCase() ||
             (request.requesterId && user.id ? request.requesterId === user.id : false);

    case 'resubmit_as_employee':
      if (!request) return false;
      return request.requesterEmail.toLowerCase() === user.email.toLowerCase() ||
             (request.requesterId && user.id ? request.requesterId === user.id : false);

    case 'modify_role':
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PNC_ADMIN && user.role !== UserRole.PNC) return false;
      if (targetUser?.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL) return false; // Protected admin cannot be changed
      if (targetUser?.id && user.id && targetUser.id === user.id) return false; // Cannot self-demote
      return true;

    default:
      return false;
  }
};
