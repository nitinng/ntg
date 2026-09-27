/**
 * Validation for the email routing settings.
 *
 * Extracted from the view so it can be tested directly. The stakes are higher than
 * they look: a typo in the standing CC silently misroutes every lifecycle mail, and
 * SLA windows in the wrong order would close a request before anyone chased it.
 */

import { EmailRoutingSetting } from '../types';

// Deliberately permissive - this catches typos and pasted junk, not every RFC edge case.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: unknown): boolean =>
  typeof value === 'string' && EMAIL_RE.test(value.trim());

export type ValidationErrors = Record<string, string>;

export const validateRoutingSettings = (
  settings: Pick<EmailRoutingSetting, 'key' | 'valueType'>[],
  draft: Record<string, unknown>
): ValidationErrors => {
  const errors: ValidationErrors = {};

  for (const setting of settings) {
    const value = draft[setting.key];

    if (setting.valueType === 'email_list') {
      if (!Array.isArray(value)) {
        errors[setting.key] = 'Expected a list of addresses';
        continue;
      }
      const offenders = value.filter(v => !isValidEmail(v));
      if (offenders.length > 0) {
        errors[setting.key] = `Not a valid address: ${offenders.join(', ')}`;
      }
      continue;
    }

    if (setting.valueType === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        errors[setting.key] = 'Must be a positive number';
      }
      continue;
    }

    if (setting.key === 'support_email' && !isValidEmail(value)) {
      errors[setting.key] = 'Not a valid address';
      continue;
    }

    if (setting.key === 'portal_url') {
      const url = String(value ?? '');
      if (!/^https?:\/\/.+/.test(url)) {
        errors[setting.key] = 'Must be a full URL starting with http:// or https://';
      }
    }
  }

  // The four windows must stay in ascending order. Out of order, a request would be
  // escalated before it was chased, or closed before it was escalated.
  const first = Number(draft.info_reminder_first_hours);
  const final = Number(draft.info_reminder_final_hours);
  const escalateHours = Number(draft.info_escalation_days) * 24;
  const expiryHours = Number(draft.info_expiry_days) * 24;

  if (Number.isFinite(first) && Number.isFinite(final) && final <= first) {
    errors.info_reminder_final_hours = 'Must be later than the first reminder';
  }
  if (Number.isFinite(final) && Number.isFinite(escalateHours) && escalateHours <= final) {
    errors.info_escalation_days = 'Must be later than the final reminder';
  }
  if (Number.isFinite(escalateHours) && Number.isFinite(expiryHours) && expiryHours <= escalateHours) {
    errors.info_expiry_days = 'Must be later than escalation';
  }

  return errors;
};

/** Keys whose draft value differs from what is stored. */
export const findDirtyKeys = (
  settings: Pick<EmailRoutingSetting, 'key' | 'value'>[],
  draft: Record<string, unknown>
): string[] =>
  settings
    .filter(s => JSON.stringify(draft[s.key]) !== JSON.stringify(s.value))
    .map(s => s.key);
