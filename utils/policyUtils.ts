import { TravelRequest, TravelModePolicy } from '../types';

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
