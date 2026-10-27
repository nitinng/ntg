import { describe, it, expect } from 'vitest';
import { UserRole, PNCStatus, TravelMode, Priority, TravelRequest, User } from '../types';
import { isUserAuthorizedForAction, getVisibleRolesForBaseRole } from '../utils/workflow';
import { areBookingEmailsIdentical } from '../utils/bookingValidation';
import { resolveTemplateVariables } from '../utils/emailQueueUtils';

describe('End-to-End Testing: Role Combinations & Permissions Matrix', () => {
  const baseRequest: TravelRequest = {
    id: 'req-e2e-1',
    submissionId: 'TRV-E2E-001',
    timestamp: new Date().toISOString(),
    requesterId: 'emp-user-1',
    requesterName: 'Aman Sharma',
    requesterEmail: 'aman@navgurukul.org',
    requesterPhone: '9876543210',
    emergencyContactName: 'Parent',
    emergencyContactPhone: '9876543211',
    emergencyContactRelation: 'Parent',
    bloodGroup: 'B+',
    purpose: 'Campus Visit',
    approvingManagerName: 'Praveen Lingam',
    approvingManagerEmail: 'praveenlingam@navgurukul.org',
    tripType: 'One-way' as any,
    mode: TravelMode.TRAIN,
    from: 'Delhi',
    to: 'Pune Campus',
    dateOfTravel: '2026-11-15',
    numberOfTravelers: 1,
    priority: Priority.MEDIUM,
    approvalStatus: 'Pending' as any,
    pncStatus: PNCStatus.APPROVAL_PENDING,
    hasViolation: false,
    timeline: []
  };

  const users: Record<string, User> = {
    employee: {
      id: 'emp-user-1',
      name: 'Aman Sharma',
      email: 'aman@navgurukul.org',
      role: UserRole.EMPLOYEE,
      managerName: 'Praveen Lingam',
      managerEmail: 'praveenlingam@navgurukul.org'
    },
    employeeAsManager: {
      id: 'emp-mgr-1',
      name: 'Praveen Lingam',
      email: 'praveenlingam@navgurukul.org',
      role: UserRole.EMPLOYEE
    },
    pncStaff: {
      id: 'pnc-user-1',
      name: 'Neha Desk',
      email: 'neha.p@navgurukul.org',
      role: UserRole.PNC
    },
    pncAdmin: {
      id: 'pnca-user-1',
      name: 'Aayushi Admin',
      email: 'aayushi.b@navgurukul.org',
      role: UserRole.PNC_ADMIN
    },
    finance: {
      id: 'fin-user-1',
      name: 'Finance User',
      email: 'finance@navgurukul.org',
      role: UserRole.FINANCE
    },
    admin: {
      id: 'adm-user-1',
      name: 'Nitin SuperAdmin',
      email: 'nitin.s@navgurukul.org',
      role: UserRole.ADMIN
    }
  };

  describe('1. Role Switcher Visibility per Base Role', () => {
    it('Employee base role cannot switch to any other role (returns empty array)', () => {
      const allowed = getVisibleRolesForBaseRole(UserRole.EMPLOYEE);
      expect(allowed).toEqual([]);
    });

    it('PNC staff can toggle between Employee and PNC views', () => {
      const allowed = getVisibleRolesForBaseRole(UserRole.PNC);
      expect(allowed).toEqual([UserRole.EMPLOYEE, UserRole.PNC]);
    });

    it('PNC Admin can toggle between Employee and PNC Admin views', () => {
      const allowed = getVisibleRolesForBaseRole(UserRole.PNC_ADMIN);
      expect(allowed).toEqual([UserRole.EMPLOYEE, UserRole.PNC_ADMIN]);
    });

    it('Finance can toggle between Employee and Finance views', () => {
      const allowed = getVisibleRolesForBaseRole(UserRole.FINANCE);
      expect(allowed).toEqual([UserRole.EMPLOYEE, UserRole.FINANCE]);
    });

    it('Admin can toggle across all 5 roles', () => {
      const allowed = getVisibleRolesForBaseRole(UserRole.ADMIN);
      expect(allowed).toEqual([
        UserRole.EMPLOYEE,
        UserRole.PNC,
        UserRole.PNC_ADMIN,
        UserRole.FINANCE,
        UserRole.ADMIN
      ]);
    });
  });

  describe('2. Manager Approval Authorization & Identification', () => {
    it('authorizes the designated manager (even if base role is Employee) to approve/reject', () => {
      expect(
        isUserAuthorizedForAction(users.employeeAsManager, 'approve_as_manager', baseRequest)
      ).toBe(true);
      expect(
        isUserAuthorizedForAction(users.employeeAsManager, 'reject_as_manager', baseRequest)
      ).toBe(true);
    });

    it('forbids unrelated employees from acting on manager approval', () => {
      expect(
        isUserAuthorizedForAction(users.employee, 'approve_as_manager', baseRequest)
      ).toBe(false);
    });

    it('allows Admin to intervene and action manager approval as super-user', () => {
      expect(
        isUserAuthorizedForAction(users.admin, 'approve_as_manager', baseRequest)
      ).toBe(true);
    });

    it('prevents self-approval validation check', () => {
      expect(areBookingEmailsIdentical('aman@navgurukul.org', 'aman@navgurukul.org')).toBe(true);
      expect(areBookingEmailsIdentical('aman@navgurukul.org', 'praveenlingam@navgurukul.org')).toBe(false);
    });
  });

  describe('3. Desk Operations Authority', () => {
    it('authorizes PNC, PNC Admin, and Admin for desk booking and processing', () => {
      for (const staff of [users.pncStaff, users.pncAdmin, users.admin]) {
        expect(isUserAuthorizedForAction(staff, 'process_pnc', baseRequest)).toBe(true);
        expect(isUserAuthorizedForAction(staff, 'book_pnc', baseRequest)).toBe(true);
      }
    });

    it('denies booking/processing authority to regular Employees and Finance', () => {
      for (const nonDesk of [users.employee, users.finance]) {
        expect(isUserAuthorizedForAction(nonDesk, 'process_pnc', baseRequest)).toBe(false);
        expect(isUserAuthorizedForAction(nonDesk, 'book_pnc', baseRequest)).toBe(false);
      }
    });
  });

  describe('4. Email Template Variable & Deep Link Interpolation', () => {
    it('replaces {{ticket_url}} and plain "View Your Request" with styled primary CTA button', () => {
      const template = '<p>Your ticket is ready.</p><p>View Your Request</p>';
      const rendered = resolveTemplateVariables(template, baseRequest);
      expect(rendered).toContain('href="https://ng-travel-desk.vercel.app/?ticketId=TRV-E2E-001"');
      expect(rendered).toContain('View Your Request &rarr;');
      expect(rendered).toContain('background-color:#4F46E5');
    });

    it('replaces {{approval_url}} with direct approvals tab deep link for manager email', () => {
      const template = '<a href="{{approval_url}}">Review and Approve</a>';
      const rendered = resolveTemplateVariables(template, baseRequest);
      expect(rendered).toContain('https://ng-travel-desk.vercel.app/?tab=approvals&ticketId=TRV-E2E-001');
    });
  });
});
