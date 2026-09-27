import { describe, it, expect } from 'vitest';
import {
  validateRoutingSettings,
  findDirtyKeys,
  isValidEmail
} from '../utils/emailRoutingValidation';

const SETTINGS = [
  { key: 'default_cc', valueType: 'email_list' as const },
  { key: 'finance_cc', valueType: 'email_list' as const },
  { key: 'escalation_owners', valueType: 'email_list' as const },
  { key: 'support_email', valueType: 'text' as const },
  { key: 'portal_url', valueType: 'text' as const },
  { key: 'info_reminder_first_hours', valueType: 'number' as const },
  { key: 'info_reminder_final_hours', valueType: 'number' as const },
  { key: 'info_escalation_days', valueType: 'number' as const },
  { key: 'info_expiry_days', valueType: 'number' as const },
  { key: 'reminders_enabled', valueType: 'boolean' as const }
];

const validDraft = {
  default_cc: ['travel.team@navgurukul.org'],
  finance_cc: ['finance@navgurukul.org'],
  escalation_owners: ['pnc@navgurukul.org'],
  support_email: 'travel.team@navgurukul.org',
  portal_url: 'https://travel.navgurukul.org',
  info_reminder_first_hours: 24,
  info_reminder_final_hours: 72,
  info_escalation_days: 5,
  info_expiry_days: 7,
  reminders_enabled: true
};

describe('routing settings validation', () => {
  it('accepts the seeded defaults', () => {
    expect(validateRoutingSettings(SETTINGS, validDraft)).toEqual({});
  });

  it('rejects a malformed address in a recipient list', () => {
    // A typo here silently misroutes every lifecycle mail until someone notices.
    const errors = validateRoutingSettings(SETTINGS, {
      ...validDraft,
      default_cc: ['travel.team@navgurukul.org', 'travel.team@navgurukul']
    });
    expect(errors.default_cc).toContain('travel.team@navgurukul');
  });

  it('allows an empty recipient list', () => {
    // An empty PNC queue CC is a legitimate configuration, not an error.
    const errors = validateRoutingSettings(SETTINGS, { ...validDraft, finance_cc: [] });
    expect(errors.finance_cc).toBeUndefined();
  });

  it('rejects a support address that is not an address', () => {
    const errors = validateRoutingSettings(SETTINGS, { ...validDraft, support_email: 'travel desk' });
    expect(errors.support_email).toBeDefined();
  });

  it('requires the portal URL to be a full URL', () => {
    // It is the href behind every call-to-action button in the templates.
    expect(
      validateRoutingSettings(SETTINGS, { ...validDraft, portal_url: 'travel.navgurukul.org' })
        .portal_url
    ).toBeDefined();
    expect(
      validateRoutingSettings(SETTINGS, { ...validDraft, portal_url: 'http://localhost:3000' })
        .portal_url
    ).toBeUndefined();
  });

  it.each([0, -1, NaN, 'soon'])('rejects %s as an interval', value => {
    const errors = validateRoutingSettings(SETTINGS, {
      ...validDraft,
      info_reminder_first_hours: value
    });
    expect(errors.info_reminder_first_hours).toBe('Must be a positive number');
  });

  it('rejects a final reminder that lands before the first', () => {
    const errors = validateRoutingSettings(SETTINGS, {
      ...validDraft,
      info_reminder_first_hours: 72,
      info_reminder_final_hours: 24
    });
    expect(errors.info_reminder_final_hours).toBeDefined();
  });

  it('rejects escalation before the final reminder', () => {
    // 1 day = 24 hours, which is before the 72-hour final notice.
    const errors = validateRoutingSettings(SETTINGS, { ...validDraft, info_escalation_days: 1 });
    expect(errors.info_escalation_days).toBeDefined();
  });

  it('rejects closure before escalation', () => {
    const errors = validateRoutingSettings(SETTINGS, {
      ...validDraft,
      info_escalation_days: 7,
      info_expiry_days: 5
    });
    expect(errors.info_expiry_days).toBeDefined();
  });

  it('accepts a compressed but correctly ordered schedule', () => {
    expect(
      validateRoutingSettings(SETTINGS, {
        ...validDraft,
        info_reminder_first_hours: 4,
        info_reminder_final_hours: 12,
        info_escalation_days: 1,
        info_expiry_days: 2
      })
    ).toEqual({});
  });
});

describe('dirty key detection', () => {
  const stored = [
    { key: 'default_cc', value: ['a@navgurukul.org'] },
    { key: 'info_expiry_days', value: 7 }
  ];

  it('reports nothing when the draft matches', () => {
    expect(findDirtyKeys(stored, { default_cc: ['a@navgurukul.org'], info_expiry_days: 7 })).toEqual([]);
  });

  it('detects a changed list even when the length is unchanged', () => {
    expect(
      findDirtyKeys(stored, { default_cc: ['b@navgurukul.org'], info_expiry_days: 7 })
    ).toEqual(['default_cc']);
  });

  it('treats list order as a change, since CC order is visible to recipients', () => {
    expect(
      findDirtyKeys([{ key: 'cc', value: ['a@x.org', 'b@x.org'] }], { cc: ['b@x.org', 'a@x.org'] })
    ).toEqual(['cc']);
  });
});

describe('email validation', () => {
  it.each([
    'a@b.co',
    'first.last@navgurukul.org',
    'team+travel@navgurukul.org'
  ])('accepts %s', value => expect(isValidEmail(value)).toBe(true));

  it.each(['', 'nope', 'a@b', 'a b@c.org', null, undefined, 42])(
    'rejects %s',
    value => expect(isValidEmail(value)).toBe(false)
  );

  it('tolerates surrounding whitespace from a paste', () => {
    expect(isValidEmail('  travel.team@navgurukul.org  ')).toBe(true);
  });
});
