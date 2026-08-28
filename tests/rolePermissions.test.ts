import { describe, it, expect } from 'vitest';
import { isUserAuthorizedForAction } from '../utils/workflow';
import { UserRole, PNCStatus, ApprovalStatus, TripType, TravelMode, Priority, TravelRequest } from '../types';

const createMockRequest = (overrides?: Partial<TravelRequest>): TravelRequest => ({
  id: 'req-1',
  submissionId: 'TRV-1001',
  timestamp: '2026-09-01T10:00:00.000Z',
  requesterId: 'emp-1',
  requesterName: 'Employee One',
  requesterEmail: 'employee1@navgurukul.org',
  requesterPhone: '9876543210',
  emergencyContactName: 'Emergency Person',
  emergencyContactPhone: '9876543211',
  emergencyContactRelation: 'Parent',
  bloodGroup: 'A+',
  purpose: 'Official',
  approvingManagerName: 'Manager Rahul',
  approvingManagerEmail: 'manager.rahul@navgurukul.org',
  tripType: TripType.ONE_WAY,
  mode: TravelMode.FLIGHT,
  from: 'Delhi',
  to: 'Bangalore',
  dateOfTravel: '2026-09-20',
  numberOfTravelers: 1,
  priority: Priority.MEDIUM,
  approvalStatus: ApprovalStatus.PENDING,
  pncStatus: PNCStatus.APPROVAL_PENDING,
  hasViolation: true,
  timeline: [],
  ...overrides
});

describe('Role & Authorization Checks: isUserAuthorizedForAction', () => {
  const request = createMockRequest();

  it('allows designated approving manager to approve or reject request', () => {
    const designatedManager = {
      email: 'manager.rahul@navgurukul.org',
      role: UserRole.EMPLOYEE,
      id: 'mgr-1'
    };

    expect(isUserAuthorizedForAction(designatedManager, 'approve_as_manager', request)).toBe(true);
    expect(isUserAuthorizedForAction(designatedManager, 'reject_as_manager', request)).toBe(true);
  });

  it('disallows unauthorized employee/manager from approving another manager’s request', () => {
    const unauthorizedUser = {
      email: 'other.manager@navgurukul.org',
      role: UserRole.EMPLOYEE,
      id: 'mgr-2'
    };

    expect(isUserAuthorizedForAction(unauthorizedUser, 'approve_as_manager', request)).toBe(false);
    expect(isUserAuthorizedForAction(unauthorizedUser, 'reject_as_manager', request)).toBe(false);
  });

  it('allows Admin to approve or reject any manager approval request as super-user', () => {
    const adminUser = {
      email: 'admin@navgurukul.org',
      role: UserRole.ADMIN,
      id: 'adm-1'
    };

    expect(isUserAuthorizedForAction(adminUser, 'approve_as_manager', request)).toBe(true);
    expect(isUserAuthorizedForAction(adminUser, 'reject_as_manager', request)).toBe(true);
  });

  it('allows only PNC or Admin to perform PNC processing, booking, or PNC cancellations', () => {
    const pncUser = { email: 'pnc@navgurukul.org', role: UserRole.PNC, id: 'pnc-1' };
    const adminUser = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };
    const empUser = { email: 'employee1@navgurukul.org', role: UserRole.EMPLOYEE, id: 'emp-1' };
    const financeUser = { email: 'finance@navgurukul.org', role: UserRole.FINANCE, id: 'fin-1' };

    expect(isUserAuthorizedForAction(pncUser, 'process_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(pncUser, 'book_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(pncUser, 'cancel_as_pnc', request)).toBe(true);

    expect(isUserAuthorizedForAction(adminUser, 'process_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(adminUser, 'book_pnc', request)).toBe(true);

    expect(isUserAuthorizedForAction(empUser, 'process_pnc', request)).toBe(false);
    expect(isUserAuthorizedForAction(empUser, 'book_pnc', request)).toBe(false);

    expect(isUserAuthorizedForAction(financeUser, 'process_pnc', request)).toBe(false);
    expect(isUserAuthorizedForAction(financeUser, 'book_pnc', request)).toBe(false);
  });

  it('allows requester or Admin to cancel or resubmit their own request', () => {
    const requester = { email: 'employee1@navgurukul.org', role: UserRole.EMPLOYEE, id: 'emp-1' };
    const otherEmployee = { email: 'stranger@navgurukul.org', role: UserRole.EMPLOYEE, id: 'emp-99' };
    const adminUser = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };

    expect(isUserAuthorizedForAction(requester, 'cancel_as_employee', request)).toBe(true);
    expect(isUserAuthorizedForAction(requester, 'resubmit_as_employee', request)).toBe(true);

    expect(isUserAuthorizedForAction(otherEmployee, 'cancel_as_employee', request)).toBe(false);
    expect(isUserAuthorizedForAction(otherEmployee, 'resubmit_as_employee', request)).toBe(false);

    expect(isUserAuthorizedForAction(adminUser, 'cancel_as_employee', request)).toBe(true);
  });

  it('protects the designated super-admin email (nitin@navgurukul.org) from role changes', () => {
    const callerAdmin = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };
    const protectedAdmin = { email: 'nitin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-root' };

    expect(isUserAuthorizedForAction(callerAdmin, 'modify_role', undefined, protectedAdmin)).toBe(false);
  });

  it('prevents self-demotion / modifying own role to avoid lockout', () => {
    const callerAdmin = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };

    expect(isUserAuthorizedForAction(callerAdmin, 'modify_role', undefined, callerAdmin)).toBe(false);
  });

  it('allows Admin to modify roles for ordinary target users', () => {
    const callerAdmin = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };
    const ordinaryUser = { email: 'emp@navgurukul.org', role: UserRole.EMPLOYEE, id: 'emp-2' };

    expect(isUserAuthorizedForAction(callerAdmin, 'modify_role', undefined, ordinaryUser)).toBe(true);
  });
});
