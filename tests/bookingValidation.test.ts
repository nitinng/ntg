import { describe, it, expect } from 'vitest';
import { areBookingEmailsIdentical, validateBookingStep1Data, BookingStep1ValidationData } from '../utils/bookingValidation';

describe('Booking Validation: areBookingEmailsIdentical', () => {
  it('returns true when requester and approving manager emails match exactly', () => {
    expect(areBookingEmailsIdentical('priya@navgurukul.org', 'priya@navgurukul.org')).toBe(true);
  });

  it('returns true when emails match case-insensitively', () => {
    expect(areBookingEmailsIdentical('Priya.Sharma@navgurukul.org', 'priya.sharma@navgurukul.org')).toBe(true);
    expect(areBookingEmailsIdentical('NITIN@NAVGURUKUL.ORG', 'nitin@navgurukul.org')).toBe(true);
  });

  it('returns true when emails match with leading or trailing whitespace', () => {
    expect(areBookingEmailsIdentical('  rahul@navgurukul.org  ', 'rahul@navgurukul.org')).toBe(true);
    expect(areBookingEmailsIdentical('rahul@navgurukul.org', ' rahul@navgurukul.org \t')).toBe(true);
  });

  it('returns false when emails are distinct', () => {
    expect(areBookingEmailsIdentical('employee@navgurukul.org', 'manager@navgurukul.org')).toBe(false);
  });

  it('returns false when either email is empty or nullish', () => {
    expect(areBookingEmailsIdentical('', 'manager@navgurukul.org')).toBe(false);
    expect(areBookingEmailsIdentical('employee@navgurukul.org', '')).toBe(false);
    expect(areBookingEmailsIdentical(null, 'manager@navgurukul.org')).toBe(false);
    expect(areBookingEmailsIdentical('employee@navgurukul.org', undefined)).toBe(false);
    expect(areBookingEmailsIdentical('', '')).toBe(false);
    expect(areBookingEmailsIdentical('   ', '   ')).toBe(false);
  });
});

describe('Booking Validation: validateBookingStep1Data', () => {
  const validData: BookingStep1ValidationData = {
    requesterName: 'Priya Sharma',
    requesterEmail: 'priya@navgurukul.org',
    requesterPhone: '9876543210',
    purpose: 'Quarterly Team Meetup',
    approvingManagerName: 'Rahul Verma',
    approvingManagerEmail: 'rahul@navgurukul.org'
  };

  it('validates successfully when all fields are properly provided and emails differ', () => {
    const result = validateBookingStep1Data(validData);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('fails validation when email address and approving manager email are identical', () => {
    const invalidData: BookingStep1ValidationData = {
      ...validData,
      requesterEmail: 'priya@navgurukul.org',
      approvingManagerEmail: 'priya@navgurukul.org'
    };

    const result = validateBookingStep1Data(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email address and Approving Manager Email cannot be the same');
  });

  it('fails validation when email address and approving manager email match case-insensitively with spaces', () => {
    const invalidData: BookingStep1ValidationData = {
      ...validData,
      requesterEmail: 'priya@navgurukul.org',
      approvingManagerEmail: '  PRIYA@NAVGURUKUL.ORG  '
    };

    const result = validateBookingStep1Data(invalidData);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email address and Approving Manager Email cannot be the same');
  });

  it('uses fallback currentUserEmail if data.requesterEmail is missing', () => {
    const dataWithoutEmail: BookingStep1ValidationData = {
      ...validData,
      requesterEmail: undefined,
      approvingManagerEmail: 'current.user@navgurukul.org'
    };

    const result = validateBookingStep1Data(dataWithoutEmail, 'current.user@navgurukul.org');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Email address and Approving Manager Email cannot be the same');
  });

  it('fails validation when full name is missing', () => {
    const result = validateBookingStep1Data({ ...validData, requesterName: '   ' });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Full Name is required');
  });

  it('fails validation when phone number is missing or invalid length', () => {
    const missingPhone = validateBookingStep1Data({ ...validData, requesterPhone: '' });
    expect(missingPhone.isValid).toBe(false);
    expect(missingPhone.error).toBe('Phone Number is required');

    const shortPhone = validateBookingStep1Data({ ...validData, requesterPhone: '98765' });
    expect(shortPhone.isValid).toBe(false);
    expect(shortPhone.error).toBe('Phone Number must be exactly 10 digits');
  });

  it('fails validation when purpose of travel is missing', () => {
    const result = validateBookingStep1Data({ ...validData, purpose: ' ' });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Purpose of Travel is required');
  });

  it('fails validation when approving manager name is missing', () => {
    const result = validateBookingStep1Data({ ...validData, approvingManagerName: '' });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Approving Manager Name is required');
  });

  it('fails validation when approving manager email is missing', () => {
    const result = validateBookingStep1Data({ ...validData, approvingManagerEmail: '' });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Approving Manager Email is required');
  });
});
