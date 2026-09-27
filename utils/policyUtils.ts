import { TravelRequest, TravelModePolicy, PolicyConfig, Priority } from '../types';

export const checkPolicyViolation = (request: TravelRequest, policies: TravelModePolicy[]): boolean => {
  if (request.hasViolation) return true;
  if (!policies || policies.length === 0) return false;

  const modePolicy = policies.find(p => p.travelMode === request.mode);
  if (!modePolicy || modePolicy.minAdvanceDays <= 0) return false;

  const requestDate = new Date(request.timestamp || Date.now());
  const travelDate = new Date(request.dateOfTravel);
  const diffTime = travelDate.getTime() - requestDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays < modePolicy.minAdvanceDays;
};

/**
 * Calculates dynamic booking urgency based on days remaining to departure:
 * - Critical: < criticalDays (default: < 2 days)
 * - High: criticalDays to highDays (default: 2 to 10 days)
 * - Medium: highDays to mediumDays (default: 10 to 20 days)
 * - Low: > mediumDays (default: > 20 days)
 */
export const calculateDynamicUrgency = (
  dateOfTravel?: string | null,
  policy?: Partial<PolicyConfig>,
  referenceDate?: Date
): Priority => {
  if (!dateOfTravel) return Priority.MEDIUM;
  const travelDate = new Date(dateOfTravel);
  if (isNaN(travelDate.getTime())) return Priority.MEDIUM;

  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);
  travelDate.setHours(0, 0, 0, 0);

  const diffTime = travelDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const criticalThreshold = policy?.urgencyThresholds?.criticalDays ?? 2;
  const highThreshold = policy?.urgencyThresholds?.highDays ?? 10;
  const mediumThreshold = policy?.urgencyThresholds?.mediumDays ?? 20;

  if (daysRemaining < criticalThreshold) {
    return Priority.CRITICAL;
  }
  if (daysRemaining <= highThreshold) {
    return Priority.HIGH;
  }
  if (daysRemaining <= mediumThreshold) {
    return Priority.MEDIUM;
  }
  return Priority.LOW;
};

export const getDaysRemaining = (
  dateOfTravel?: string | null,
  referenceDate?: Date
): number | null => {
  if (!dateOfTravel) return null;
  const travelDate = new Date(dateOfTravel);
  if (isNaN(travelDate.getTime())) return null;

  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);
  travelDate.setHours(0, 0, 0, 0);

  const diffTime = travelDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Resolves the effective booking/ticketing SLA turnaround target (in hours) for a request.
 * - If urgency SLA is toggled ON (enableUrgencySla = true), returns the tier-specific hours (Critical/High/Medium/Low).
 * - Otherwise falls back to the generic ticketing TAT target (tatBookingHours, default 72h).
 */
export const getEffectiveBookingSlaHours = (
  priority?: Priority | null,
  policy?: Partial<PolicyConfig>
): number => {
  if (policy?.enableUrgencySla && policy?.urgencySlaHours && priority) {
    switch (priority) {
      case Priority.CRITICAL:
        return policy.urgencySlaHours.critical ?? 4;
      case Priority.HIGH:
        return policy.urgencySlaHours.high ?? 12;
      case Priority.MEDIUM:
        return policy.urgencySlaHours.medium ?? 24;
      case Priority.LOW:
        return policy.urgencySlaHours.low ?? 48;
    }
  }
  return policy?.tatBookingHours || 72;
};

/**
 * Checks whether elapsed time (in ms) has exceeded the effective booking SLA target.
 */
export const isRequestBookingSlaBreached = (
  elapsedMs: number,
  priority?: Priority | null,
  policy?: Partial<PolicyConfig>
): boolean => {
  const targetHours = getEffectiveBookingSlaHours(priority, policy);
  return elapsedMs > targetHours * 60 * 60 * 1000;
};
