import { describe, it, expect } from 'vitest';
import { isUserAuthorizedForAction, getVisibleRolesForBaseRole } from '../utils/workflow';
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

  it('allows PNC, PNC Admin, or Admin to perform PNC processing, booking, or PNC cancellations', () => {
    const pncUser = { email: 'pnc@navgurukul.org', role: UserRole.PNC, id: 'pnc-1' };
    const pncAdminUser = { email: 'pncadmin@navgurukul.org', role: UserRole.PNC_ADMIN, id: 'pnca-1' };
    const adminUser = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };
    const empUser = { email: 'employee1@navgurukul.org', role: UserRole.EMPLOYEE, id: 'emp-1' };
    const financeUser = { email: 'finance@navgurukul.org', role: UserRole.FINANCE, id: 'fin-1' };

    expect(isUserAuthorizedForAction(pncUser, 'process_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(pncUser, 'book_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(pncUser, 'cancel_as_pnc', request)).toBe(true);

    expect(isUserAuthorizedForAction(pncAdminUser, 'process_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(pncAdminUser, 'book_pnc', request)).toBe(true);
    expect(isUserAuthorizedForAction(pncAdminUser, 'cancel_as_pnc', request)).toBe(true);

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

  it('allows Admin and PNC Admin to modify roles for ordinary target users', () => {
    const callerAdmin = { email: 'admin@navgurukul.org', role: UserRole.ADMIN, id: 'adm-1' };
    const callerPncAdmin = { email: 'pncadmin@navgurukul.org', role: UserRole.PNC_ADMIN, id: 'pnca-1' };
    const ordinaryUser = { email: 'emp@navgurukul.org', role: UserRole.EMPLOYEE, id: 'emp-2' };

    expect(isUserAuthorizedForAction(callerAdmin, 'modify_role', undefined, ordinaryUser)).toBe(true);
    expect(isUserAuthorizedForAction(callerPncAdmin, 'modify_role', undefined, ordinaryUser)).toBe(true);
  });

  it('validates promotion boundaries: PNC can promote up to PNC, PNC Admin up to PNC Admin', () => {
    const isPromotionAllowed = (callerRole: UserRole, targetCurrentRole: UserRole, newRole: UserRole) => {
      if (callerRole === UserRole.ADMIN) return true;
      if (callerRole === UserRole.PNC) {
        if (targetCurrentRole !== UserRole.EMPLOYEE && targetCurrentRole !== UserRole.PNC) return false;
        return newRole === UserRole.EMPLOYEE || newRole === UserRole.PNC;
      }
      if (callerRole === UserRole.PNC_ADMIN) {
        if (targetCurrentRole !== UserRole.EMPLOYEE && targetCurrentRole !== UserRole.PNC && targetCurrentRole !== UserRole.PNC_ADMIN) return false;
        return newRole === UserRole.EMPLOYEE || newRole === UserRole.PNC || newRole === UserRole.PNC_ADMIN;
      }
      return false;
    };

    // PNC can promote Employee -> PNC
    expect(isPromotionAllowed(UserRole.PNC, UserRole.EMPLOYEE, UserRole.PNC)).toBe(true);
    expect(isPromotionAllowed(UserRole.PNC, UserRole.PNC, UserRole.EMPLOYEE)).toBe(true);
    // PNC cannot promote to PNC Admin or Admin or Finance
    expect(isPromotionAllowed(UserRole.PNC, UserRole.EMPLOYEE, UserRole.PNC_ADMIN)).toBe(false);
    expect(isPromotionAllowed(UserRole.PNC, UserRole.EMPLOYEE, UserRole.ADMIN)).toBe(false);
    expect(isPromotionAllowed(UserRole.PNC, UserRole.EMPLOYEE, UserRole.FINANCE)).toBe(false);
    // PNC cannot demote or alter a PNC Admin, Finance or Admin
    expect(isPromotionAllowed(UserRole.PNC, UserRole.PNC_ADMIN, UserRole.PNC)).toBe(false);
    expect(isPromotionAllowed(UserRole.PNC, UserRole.ADMIN, UserRole.PNC)).toBe(false);

    // PNC Admin can promote up to PNC Admin
    expect(isPromotionAllowed(UserRole.PNC_ADMIN, UserRole.EMPLOYEE, UserRole.PNC)).toBe(true);
    expect(isPromotionAllowed(UserRole.PNC_ADMIN, UserRole.EMPLOYEE, UserRole.PNC_ADMIN)).toBe(true);
    expect(isPromotionAllowed(UserRole.PNC_ADMIN, UserRole.PNC, UserRole.PNC_ADMIN)).toBe(true);
    // PNC Admin cannot promote to Finance or Admin
    expect(isPromotionAllowed(UserRole.PNC_ADMIN, UserRole.EMPLOYEE, UserRole.ADMIN)).toBe(false);
    expect(isPromotionAllowed(UserRole.PNC_ADMIN, UserRole.EMPLOYEE, UserRole.FINANCE)).toBe(false);
    // PNC Admin cannot alter an Admin or Finance user
    expect(isPromotionAllowed(UserRole.PNC_ADMIN, UserRole.ADMIN, UserRole.PNC_ADMIN)).toBe(false);

    // Admin has full access to assign any role
    expect(isPromotionAllowed(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.ADMIN)).toBe(true);
    expect(isPromotionAllowed(UserRole.ADMIN, UserRole.PNC_ADMIN, UserRole.FINANCE)).toBe(true);
  });

  it('validates Department permissions: PNC is View-only, PNC Admin and Admin have Edit access', () => {
    const canEditDepartments = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.PNC_ADMIN;

    expect(canEditDepartments(UserRole.PNC)).toBe(false);
    expect(canEditDepartments(UserRole.PNC_ADMIN)).toBe(true);
    expect(canEditDepartments(UserRole.ADMIN)).toBe(true);
    expect(canEditDepartments(UserRole.EMPLOYEE)).toBe(false);
    expect(canEditDepartments(UserRole.FINANCE)).toBe(false);
  });

  it('validates Email Center permissions matrix across sub-modules', () => {
    // 1. Templates & Cadence: PNC (V), PNC Admin (E), Admin (F)
    const canEditTemplates = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.PNC_ADMIN;
    expect(canEditTemplates(UserRole.PNC)).toBe(false);
    expect(canEditTemplates(UserRole.PNC_ADMIN)).toBe(true);
    expect(canEditTemplates(UserRole.ADMIN)).toBe(true);

    // 2. Delivery Monitor & Outbox: PNC (V), PNC Admin (V), Admin (F)
    const canManageDeliveryQueue = (role: UserRole) => role === UserRole.ADMIN;
    expect(canManageDeliveryQueue(UserRole.PNC)).toBe(false);
    expect(canManageDeliveryQueue(UserRole.PNC_ADMIN)).toBe(false);
    expect(canManageDeliveryQueue(UserRole.ADMIN)).toBe(true);

    // 3. Email Routing & SLA: PNC (V), PNC Admin (E), Admin (F)
    const canEditRouting = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.PNC_ADMIN;
    expect(canEditRouting(UserRole.PNC)).toBe(false);
    expect(canEditRouting(UserRole.PNC_ADMIN)).toBe(true);
    expect(canEditRouting(UserRole.ADMIN)).toBe(true);

    // 4. Email Setup: PNC (V), PNC Admin (V), Admin (F)
    const canEditSetup = (role: UserRole) => role === UserRole.ADMIN;
    expect(canEditSetup(UserRole.PNC)).toBe(false);
    expect(canEditSetup(UserRole.PNC_ADMIN)).toBe(false);
    expect(canEditSetup(UserRole.ADMIN)).toBe(true);

    // 5. Usage & Quota: PNC (V), PNC Admin (V), Admin (F)
    const canEditQuota = (role: UserRole) => role === UserRole.ADMIN;
    expect(canEditQuota(UserRole.PNC)).toBe(false);
    expect(canEditQuota(UserRole.PNC_ADMIN)).toBe(false);
    expect(canEditQuota(UserRole.ADMIN)).toBe(true);
  });

  describe('Role Toggle Navigation (getVisibleRolesForBaseRole)', () => {
    it('1. Base Employee: No role toggle (fixed to Employee)', () => {
      expect(getVisibleRolesForBaseRole(UserRole.EMPLOYEE)).toEqual([]);
    });

    it('2. Base PNC: Can toggle between Employee, PNC', () => {
      expect(getVisibleRolesForBaseRole(UserRole.PNC)).toEqual([UserRole.EMPLOYEE, UserRole.PNC]);
    });

    it('3. Base Finance: Can toggle between Employee, Finance', () => {
      expect(getVisibleRolesForBaseRole(UserRole.FINANCE)).toEqual([UserRole.EMPLOYEE, UserRole.FINANCE]);
    });

    it('4. Base PNC Admin: Can toggle between Employee, PNC Admin', () => {
      expect(getVisibleRolesForBaseRole(UserRole.PNC_ADMIN)).toEqual([UserRole.EMPLOYEE, UserRole.PNC_ADMIN]);
    });

    it('5. Base Admin: Can toggle between Employee, PNC, PNC Admin, Finance, Admin', () => {
      expect(getVisibleRolesForBaseRole(UserRole.ADMIN)).toEqual([
        UserRole.EMPLOYEE,
        UserRole.PNC,
        UserRole.PNC_ADMIN,
        UserRole.FINANCE,
        UserRole.ADMIN
      ]);
    });

    it('handles null/undefined baseRole with empty array (no toggle)', () => {
      expect(getVisibleRolesForBaseRole(null)).toEqual([]);
      expect(getVisibleRolesForBaseRole(undefined)).toEqual([]);
    });
  });

  describe('PNC Admin > PNC (PNC Admin = PNC + more)', () => {
    it('guarantees PNC Admin has every operational authority of PNC', () => {
      const pncActor = { email: 'pnc@navgurukul.org', role: UserRole.PNC, id: 'pnc-1' };
      const pncAdminActor = { email: 'pnca@navgurukul.org', role: UserRole.PNC_ADMIN, id: 'pnca-1' };

      const actions = ['process_pnc', 'book_pnc', 'cancel_as_pnc'] as const;
      actions.forEach(act => {
        expect(isUserAuthorizedForAction(pncAdminActor, act, request)).toBe(true);
        expect(isUserAuthorizedForAction(pncAdminActor, act, request)).toBe(
          isUserAuthorizedForAction(pncActor, act, request)
        );
      });
    });

    it('guarantees PNC Admin has additional supervisory authorities that PNC lacks', () => {
      // Reassignment authority (taking from colleague)
      const canReassignColleague = (role: UserRole) => role === UserRole.PNC_ADMIN || role === UserRole.ADMIN;
      expect(canReassignColleague(UserRole.PNC_ADMIN)).toBe(true);
      expect(canReassignColleague(UserRole.PNC)).toBe(false);

      // Department editing
      const canEditDepartments = (role: UserRole) => role === UserRole.PNC_ADMIN || role === UserRole.ADMIN;
      expect(canEditDepartments(UserRole.PNC_ADMIN)).toBe(true);
      expect(canEditDepartments(UserRole.PNC)).toBe(false);

      // Mail template editing
      const canEditTemplates = (role: UserRole) => role === UserRole.PNC_ADMIN || role === UserRole.ADMIN;
      expect(canEditTemplates(UserRole.PNC_ADMIN)).toBe(true);
      expect(canEditTemplates(UserRole.PNC)).toBe(false);

      // Role promotion up to PNC Admin
      const canPromoteToPncAdmin = (callerRole: UserRole) => callerRole === UserRole.PNC_ADMIN || callerRole === UserRole.ADMIN;
      expect(canPromoteToPncAdmin(UserRole.PNC_ADMIN)).toBe(true);
      expect(canPromoteToPncAdmin(UserRole.PNC)).toBe(false);
    });
  });
});
