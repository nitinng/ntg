import { describe, it, expect } from 'vitest';
import { DEFAULT_GLOBAL_CC } from '../utils/emailQueueUtils';

describe('Global Email CC Configuration Logic', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it('contains valid default global CC addresses', () => {
    expect(DEFAULT_GLOBAL_CC).toContain('travel.team@navgurukul.org');
    expect(DEFAULT_GLOBAL_CC).toContain('nitin.s@navgurukul.org');
    DEFAULT_GLOBAL_CC.forEach(email => {
      expect(emailRegex.test(email)).toBe(true);
    });
  });

  it('validates email format and rejects invalid addresses', () => {
    expect(emailRegex.test('valid.user@navgurukul.org')).toBe(true);
    expect(emailRegex.test('invalid-email')).toBe(false);
    expect(emailRegex.test('missing-domain@')).toBe(false);
    expect(emailRegex.test('@no-username.com')).toBe(false);
    expect(emailRegex.test('')).toBe(false);
  });

  it('prevents duplicate CC entries', () => {
    const currentList = ['travel.team@navgurukul.org', 'nitin.s@navgurukul.org'];
    const newEmail = 'travel.team@navgurukul.org';

    const isDuplicate = currentList.includes(newEmail.toLowerCase());
    expect(isDuplicate).toBe(true);
  });

  it('correctly appends new valid CC address and removes existing address', () => {
    let currentList = ['travel.team@navgurukul.org', 'nitin.s@navgurukul.org'];
    const newEmail = 'audit.desk@navgurukul.org';

    // Add
    currentList = [...currentList, newEmail];
    expect(currentList).toHaveLength(3);
    expect(currentList).toContain('audit.desk@navgurukul.org');

    // Remove
    currentList = currentList.filter(e => e !== 'nitin.s@navgurukul.org');
    expect(currentList).toHaveLength(2);
    expect(currentList).not.toContain('nitin.s@navgurukul.org');
    expect(currentList).toContain('audit.desk@navgurukul.org');
  });
});
