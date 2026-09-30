/**
 * Booking Form Validation Utilities
 */

/**
 * Checks if the requester email and approving manager email are identical (case-insensitive, trimmed).
 */
export const areBookingEmailsIdentical = (
  requesterEmail?: string | null,
  approvingManagerEmail?: string | null
): boolean => {
  const req = (requesterEmail || '').trim().toLowerCase();
  const mgr = (approvingManagerEmail || '').trim().toLowerCase();
  if (!req || !mgr) return false;
  return req === mgr;
};

export interface BookingStep1ValidationData {
  requesterName?: string;
  requesterPhone?: string;
  purpose?: string;
  approvingManagerName?: string;
  approvingManagerEmail?: string;
  requesterEmail?: string;
}

/**
 * Validates Step 1 of the new booking form.
 * Returns isValid: true or isValid: false with a user-friendly error message.
 */
export const validateBookingStep1Data = (
  data: BookingStep1ValidationData,
  currentUserEmail?: string
): { isValid: boolean; error?: string } => {
  if (!data.requesterName?.trim()) {
    return { isValid: false, error: 'Full Name is required' };
  }
  if (!data.requesterPhone?.trim()) {
    return { isValid: false, error: 'Phone Number is required' };
  }
  if (data.requesterPhone.replace(/\D/g, '').length !== 10) {
    return { isValid: false, error: 'Phone Number must be exactly 10 digits' };
  }
  if (!data.purpose?.trim()) {
    return { isValid: false, error: 'Purpose of Travel is required' };
  }
  if (!data.approvingManagerName?.trim()) {
    return { isValid: false, error: 'Approving Manager Name is required' };
  }
  if (!data.approvingManagerEmail?.trim()) {
    return { isValid: false, error: 'Approving Manager Email is required' };
  }

  const userEmail = (data.requesterEmail || currentUserEmail || '').trim().toLowerCase();
  const managerEmail = data.approvingManagerEmail.trim().toLowerCase();
  if (userEmail && managerEmail && userEmail === managerEmail) {
    return { isValid: false, error: 'Email address and Approving Manager Email cannot be the same' };
  }

  return { isValid: true };
};
