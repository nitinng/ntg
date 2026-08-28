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
    PNCStatus.CANCELLATION_REQUESTED
  ],
  [PNCStatus.REJECTED_BY_PNC]: [
    PNCStatus.NOT_STARTED // Resubmission
  ],
  [PNCStatus.BOOKED]: [
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLED_BY_PNC,
    PNCStatus.CANCELLATION_REQUESTED,
    PNCStatus.CLOSED
  ],
  [PNCStatus.CANCELLATION_REQUESTED]: [
    PNCStatus.CANCELLED_BY_EMPLOYEE,
    PNCStatus.CANCELLED_BY_PNC,
    PNCStatus.PROCESSING,
    PNCStatus.BOOKED
  ],
  [PNCStatus.CANCELLED_BY_EMPLOYEE]: [
    PNCStatus.CLOSED
  ],
  [PNCStatus.CANCELLED_BY_PNC]: [
    PNCStatus.CLOSED
  ],
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
      return user.role === UserRole.PNC || user.role === UserRole.ADMIN;

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
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PNC) return false;
      if (targetUser?.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL) return false; // Protected admin cannot be changed
      if (targetUser?.id && user.id && targetUser.id === user.id) return false; // Cannot self-demote
      return true;

    default:
      return false;
  }
};
