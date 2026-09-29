import { describe, it, expect } from 'vitest';
import {
  pickSlot,
  nextStreakState,
  istDayStartIso,
  istNextDayStartIso
} from '../utils/email/smtpSlotRouter';

const configured = { smtp: true, smtp2: true };
const PER_ACCOUNT = 2000;

describe('pickSlot', () => {
  it('uses the active slot when it is under its per-account cap', () => {
    const res = pickSlot({
      activeSlot: 'smtp',
      usage: { smtp: 20, smtp2: 30 },
      perAccountQuota: PER_ACCOUNT,
      configured
    });
    expect(res.slot).toBe('smtp');
    expect(res.reason).toBe('active');
  });

  it('falls back to the backup slot when the active slot is at its cap', () => {
    const res = pickSlot({
      activeSlot: 'smtp',
      usage: { smtp: 2000, smtp2: 30 },
      perAccountQuota: PER_ACCOUNT,
      configured
    });
    expect(res.slot).toBe('smtp2');
    expect(res.reason).toBe('active_at_quota');
  });

  it('returns no slot when both accounts are at their caps', () => {
    const res = pickSlot({
      activeSlot: 'smtp',
      usage: { smtp: 2000, smtp2: 2000 },
      perAccountQuota: PER_ACCOUNT,
      configured
    });
    expect(res.slot).toBeNull();
    expect(res.reason).toBe('all_at_quota');
  });

  it('skips an unconfigured backup and keeps the active slot at quota as unavailable', () => {
    const res = pickSlot({
      activeSlot: 'smtp',
      usage: { smtp: 2000, smtp2: 0 },
      perAccountQuota: PER_ACCOUNT,
      configured: { smtp: true, smtp2: false }
    });
    expect(res.slot).toBeNull();
    expect(res.reason).toBe('all_at_quota');
  });

  it('uses the backup when the active slot has no credentials configured', () => {
    const res = pickSlot({
      activeSlot: 'smtp',
      usage: { smtp: 0, smtp2: 0 },
      perAccountQuota: PER_ACCOUNT,
      configured: { smtp: false, smtp2: true }
    });
    expect(res.slot).toBe('smtp2');
    expect(res.reason).toBe('active_unconfigured');
  });

  it('honours smtp2 as the active slot and falls back to smtp', () => {
    const res = pickSlot({
      activeSlot: 'smtp2',
      usage: { smtp: 10, smtp2: 2000 },
      perAccountQuota: PER_ACCOUNT,
      configured
    });
    expect(res.slot).toBe('smtp');
    expect(res.reason).toBe('active_at_quota');
  });
});

describe('nextStreakState', () => {
  it('resets the streak to zero on a successful send', () => {
    const res = nextStreakState({
      streak: { slot: 'smtp', count: 2 },
      slot: 'smtp',
      failed: false,
      isTransient: false,
      promoteAfter: 3
    });
    expect(res.streak).toEqual({ slot: 'smtp', count: 0 });
    expect(res.promoteTo).toBeNull();
  });

  it('does not count transient failures toward promotion', () => {
    const res = nextStreakState({
      streak: { slot: 'smtp', count: 2 },
      slot: 'smtp',
      failed: true,
      isTransient: true,
      promoteAfter: 3
    });
    expect(res.streak.count).toBe(2);
    expect(res.promoteTo).toBeNull();
  });

  it('increments the streak on a non-transient failure', () => {
    const res = nextStreakState({
      streak: { slot: 'smtp', count: 1 },
      slot: 'smtp',
      failed: true,
      isTransient: false,
      promoteAfter: 3
    });
    expect(res.streak.count).toBe(2);
    expect(res.promoteTo).toBeNull();
  });

  it('promotes the backup slot once the streak reaches the threshold', () => {
    const res = nextStreakState({
      streak: { slot: 'smtp', count: 2 },
      slot: 'smtp',
      failed: true,
      isTransient: false,
      promoteAfter: 3
    });
    expect(res.streak.count).toBe(3);
    expect(res.promoteTo).toBe('smtp2');
  });

  it('restarts the count when the failing slot differs from the tracked slot', () => {
    const res = nextStreakState({
      streak: { slot: 'smtp', count: 2 },
      slot: 'smtp2',
      failed: true,
      isTransient: false,
      promoteAfter: 3
    });
    expect(res.streak).toEqual({ slot: 'smtp2', count: 1 });
    expect(res.promoteTo).toBeNull();
  });
});

describe('istDayStartIso', () => {
  it('returns the most recent IST midnight for a morning IST timestamp', () => {
    // 2026-09-29T03:00Z is 08:30 IST on the 29th
    expect(istDayStartIso(new Date('2026-09-29T03:00:00Z')))
      .toBe('2026-09-28T18:30:00.000Z');
  });

  it('keeps the same IST day late in the IST evening', () => {
    // 2026-09-29T17:00Z is 22:30 IST on the 29th
    expect(istDayStartIso(new Date('2026-09-29T17:00:00Z')))
      .toBe('2026-09-28T18:30:00.000Z');
  });

  it('rolls over exactly at IST midnight', () => {
    // 2026-09-29T18:30Z is 00:00 IST on the 30th
    expect(istDayStartIso(new Date('2026-09-29T18:30:00Z')))
      .toBe('2026-09-29T18:30:00.000Z');
  });
});

describe('istNextDayStartIso', () => {
  it('returns the next IST midnight, used to defer quota-blocked sends', () => {
    expect(istNextDayStartIso(new Date('2026-09-29T03:00:00Z')))
      .toBe('2026-09-29T18:30:00.000Z');
  });
});
