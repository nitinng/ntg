import { describe, it, expect } from 'vitest';
import { calculateProfileCompleteness, isUserVerified, isAppLockedForUser } from '../utils/verificationUtils';
import { User, UserRole, VerificationStatus, PolicyConfig } from '../types';

const defaultPolicy: PolicyConfig = {
  flightNoticeDays: 15,
  trainNoticeDays: 7,
  busNoticeDays: 7,
  autoApproveBelowAmount: 5000,
  isPassportRequired: true,
  isIdRequired: true,
  isEnforcementEnabled: true,
  temporaryUnlockDays: 7,
  tatApprovalHours: 24,
  tatProcessingHours: 48,
  tatBookingHours: 72,
  cancellationPncNgCover: 100,
  cancellationPncEmpCover: 0,
  cancellationEmpNgCover: 50,
  cancellationEmpEmpCover: 50
};

const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'usr-1',
  name: 'Anita Sharma',
  email: 'anita@navgurukul.org',
  role: UserRole.EMPLOYEE,
  department: 'Academic',
  campus: 'Pune',
  managerName: 'Rahul Verma',
  managerEmail: 'rahul@navgurukul.org',
  phone: '9876543210',
  emergencyContactName: 'Sunita Sharma',
  emergencyContactPhone: '9876543211',
  bloodGroup: 'B+',
  passportPhoto: {
    fileUrl: 'https://example.com/passport.jpg',
    status: VerificationStatus.APPROVED
  },
  idProof: {
    fileUrl: 'https://example.com/id.jpg',
    status: VerificationStatus.APPROVED
  },
  ...overrides
});

describe('Verification Utilities: calculateProfileCompleteness', () => {
  it('returns 100% when all 11 fields are filled', () => {
    const user = createMockUser();
    expect(calculateProfileCompleteness(user)).toBe(100);
  });

  it('returns 0% for null user or empty fields', () => {
    expect(calculateProfileCompleteness(null)).toBe(0);
    const emptyUser: User = {
      id: 'usr-empty',
      name: '',
      email: 'empty@test.org',
      role: UserRole.EMPLOYEE
    };
    expect(calculateProfileCompleteness(emptyUser)).toBe(0);
  });

  it('calculates partial completeness accurately', () => {
    // 5 out of 11 fields filled: name, department, campus, phone, bloodGroup -> 5/11 ~ 45%
    const partialUser = createMockUser({
      managerName: '',
      managerEmail: '',
      passportPhoto: undefined,
      idProof: undefined,
      emergencyContactName: '',
      emergencyContactPhone: ''
    });
    expect(calculateProfileCompleteness(partialUser)).toBe(45);
  });
});

describe('Verification Utilities: isUserVerified & Temporary Unlock', () => {
  const baseTime = new Date('2026-09-10T12:00:00.000Z');

  it('returns true when all required documents are APPROVED', () => {
    const user = createMockUser();
    expect(isUserVerified(user, defaultPolicy, baseTime)).toBe(true);
  });

  it('grants temporary unlock within configured temporaryUnlockDays when docs are uploaded', () => {
    // Uploaded 3 days before baseTime (<= 7 days)
    const pendingUser = createMockUser({
      passportPhoto: {
        fileUrl: 'https://example.com/pass.jpg',
        uploadedAt: '2026-09-07T12:00:00.000Z',
        status: VerificationStatus.PENDING
      },
      idProof: {
        fileUrl: 'https://example.com/id.jpg',
        uploadedAt: '2026-09-07T12:00:00.000Z',
        status: VerificationStatus.PENDING
      }
    });

    expect(isUserVerified(pendingUser, defaultPolicy, baseTime)).toBe(true);
  });

  it('denies temporary unlock after temporaryUnlockDays expire', () => {
    // Uploaded 10 days before baseTime (> 7 days)
    const expiredUser = createMockUser({
      passportPhoto: {
        fileUrl: 'https://example.com/pass.jpg',
        uploadedAt: '2026-08-31T12:00:00.000Z',
        status: VerificationStatus.PENDING
      },
      idProof: {
        fileUrl: 'https://example.com/id.jpg',
        uploadedAt: '2026-08-31T12:00:00.000Z',
        status: VerificationStatus.PENDING
      }
    });

    expect(isUserVerified(expiredUser, defaultPolicy, baseTime)).toBe(false);
  });

  it('denies temporary unlock if any document is REJECTED', () => {
    const rejectedUser = createMockUser({
      passportPhoto: {
        fileUrl: 'https://example.com/pass.jpg',
        uploadedAt: '2026-09-09T12:00:00.000Z',
        status: VerificationStatus.APPROVED
      },
      idProof: {
        fileUrl: 'https://example.com/id.jpg',
        uploadedAt: '2026-09-09T12:00:00.000Z',
        status: VerificationStatus.REJECTED
      }
    });

    expect(isUserVerified(rejectedUser, defaultPolicy, baseTime)).toBe(false);
  });

  it('honours skipped verification grace period', () => {
    // Skipped 4 days ago (<= 7 days)
    const skippedUser = createMockUser({
      passportPhoto: undefined,
      idProof: undefined,
      skippedVerificationAt: '2026-09-06T12:00:00.000Z'
    });

    expect(isUserVerified(skippedUser, defaultPolicy, baseTime)).toBe(true);

    // Skipped 9 days ago (> 7 days)
    const expiredSkipUser = createMockUser({
      passportPhoto: undefined,
      idProof: undefined,
      skippedVerificationAt: '2026-09-01T12:00:00.000Z'
    });

    expect(isUserVerified(expiredSkipUser, defaultPolicy, baseTime)).toBe(false);
  });
});

describe('Verification Utilities: isAppLockedForUser', () => {
  it('never locks out Admins regardless of document status or enforcement toggle', () => {
    const adminUser = createMockUser({
      role: UserRole.ADMIN,
      passportPhoto: undefined,
      idProof: undefined
    });
    expect(isAppLockedForUser(adminUser, defaultPolicy)).toBe(false);
  });

  it('never locks out users when isEnforcementEnabled is false', () => {
    const policyWithoutEnforcement: PolicyConfig = {
      ...defaultPolicy,
      isEnforcementEnabled: false
    };
    const unverifiedUser = createMockUser({
      role: UserRole.EMPLOYEE,
      passportPhoto: undefined,
      idProof: undefined
    });
    expect(isAppLockedForUser(unverifiedUser, policyWithoutEnforcement)).toBe(false);
  });

  it('locks out unverified employees when enforcement is enabled', () => {
    const unverifiedUser = createMockUser({
      role: UserRole.EMPLOYEE,
      passportPhoto: undefined,
      idProof: undefined
    });
    expect(isAppLockedForUser(unverifiedUser, defaultPolicy)).toBe(true);
  });
});
