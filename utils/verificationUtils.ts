import { User, PolicyConfig, VerificationStatus, UserDocument } from '../types';

/**
 * Calculates the profile completeness percentage (0-100) based on 11 key fields.
 */
export const calculateProfileCompleteness = (user: User | null): number => {
  if (!user) return 0;
  let completed = 0;

  if (user.name && user.name.trim() !== '') completed++;
  if (user.department && user.department.trim() !== '') completed++;
  if (user.campus && user.campus.trim() !== '') completed++;
  if (user.managerName && user.managerName.trim() !== '') completed++;
  if (user.managerEmail && user.managerEmail.trim() !== '') completed++;
  if (user.passportPhoto?.fileUrl) completed++;
  if (user.idProof?.fileUrl) completed++;
  if (user.phone && user.phone.trim() !== '') completed++;
  if (user.emergencyContactName && user.emergencyContactName.trim() !== '') completed++;
  if (user.emergencyContactPhone && user.emergencyContactPhone.trim() !== '') completed++;
  if (user.bloodGroup && user.bloodGroup.trim() !== '') completed++;

  return Math.round((completed / 11) * 100);
};

/**
 * Determines whether a user satisfies document verification requirements,
 * taking into account admin bypass, policy enforcement toggles, skip periods,
 * and temporary unlock windows after document upload.
 */
export const isUserVerified = (user: User | null, policy: PolicyConfig, currentTime: Date = new Date()): boolean => {
  if (!user) return false;
  const passportOk = !policy.isPassportRequired || user.passportPhoto?.status === VerificationStatus.APPROVED;
  const idOk = !policy.isIdRequired || user.idProof?.status === VerificationStatus.APPROVED;

  // If already approved, return true
  if (passportOk && idOk) return true;

  // Check if user skipped verification and is still within the skip period
  if (user.skippedVerificationAt) {
    const skippedDate = new Date(user.skippedVerificationAt);
    const daysSinceSkip = (currentTime.getTime() - skippedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSkip <= policy.temporaryUnlockDays) {
      return true; // Still within skip period
    }
  }

  // Check for temporary unlock: if documents are uploaded and within the unlock period
  const checkTemporaryUnlock = (doc?: UserDocument) => {
    if (!doc?.uploadedAt || !doc?.fileUrl) return false;
    if (doc.status === VerificationStatus.REJECTED) return false; // Rejected docs don't get temporary unlock

    const uploadedDate = new Date(doc.uploadedAt);
    const daysSinceUpload = (currentTime.getTime() - uploadedDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpload <= policy.temporaryUnlockDays;
  };

  const passportTempUnlock = !policy.isPassportRequired || checkTemporaryUnlock(user.passportPhoto);
  const idTempUnlock = !policy.isIdRequired || checkTemporaryUnlock(user.idProof);

  return passportTempUnlock && idTempUnlock;
};

/**
 * Determines whether the user interface should be locked for the current user.
 */
export const isAppLockedForUser = (user: User | null, policy: PolicyConfig, currentTime: Date = new Date()): boolean => {
  if (!user) return false; // Don't lock if user isn't loaded yet
  if (user.role === 'Admin') return false; // Admins are never locked out
  if (!policy.isEnforcementEnabled) return false; // If enforcement is off, never lock
  return !isUserVerified(user, policy, currentTime);
};
