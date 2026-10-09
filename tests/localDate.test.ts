/**
 * The same-day booking block is enforced by a date `min` on the travel-date
 * picker. Computing that bound with toISOString() reads the UTC calendar, so in
 * any timezone ahead of UTC the bound slips by a day during the small hours and
 * the block silently lifts. These tests pin the local-calendar behaviour.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  formatLocalDate,
  parseLocalDate,
  todayLocal,
  addDaysLocal,
  earliestBookableDate
} from '../utils/utils';

// CI runs in UTC, where the bug is invisible because local and UTC agree. Pin
// the suite to IST so the 00:00-05:30 window is actually exercised, and restore
// afterwards so the setting cannot leak into other files sharing this worker.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

afterEach(() => {
  vi.useRealTimers();
});

/** 01:00 IST on 9 Oct 2026 is still 19:30 UTC on 8 Oct -- the window where the bug bit. */
const ONE_AM_IST = new Date('2026-10-08T19:30:00.000Z');

describe('local calendar dates at 01:00 IST', () => {
  it('reports the local day, not the UTC day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(ONE_AM_IST);

    // Guard: this test is only meaningful while the environment really is IST.
    expect(new Date().getTimezoneOffset()).toBe(-330);

    expect(todayLocal()).toBe('2026-10-09');
    // The behaviour being replaced, shown failing for the same instant.
    expect(new Date().toISOString().split('T')[0]).toBe('2026-10-08');
  });

  it('still blocks same-day booking at 01:00 IST', () => {
    vi.useFakeTimers();
    vi.setSystemTime(ONE_AM_IST);

    // The earliest selectable date must be strictly after today, or the picker
    // would accept a booking for today.
    expect(earliestBookableDate()).toBe('2026-10-10');
    expect(earliestBookableDate() > todayLocal()).toBe(true);
  });

  it('is unaffected at midday, when UTC and IST agree on the date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T06:30:00.000Z')); // 12:00 IST
    expect(todayLocal()).toBe('2026-10-09');
    expect(earliestBookableDate()).toBe('2026-10-10');
  });
});

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD at local midnight, not UTC midnight', () => {
    const parsed = parseLocalDate('2026-10-09')!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9); // zero-based: October
    expect(parsed.getDate()).toBe(9);
    expect(parsed.getHours()).toBe(0);
  });

  it('round-trips through formatLocalDate without drifting a day', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-10-09', '2026-12-31']) {
      expect(formatLocalDate(parseLocalDate(day)!)).toBe(day);
    }
  });

  it('returns null for a non-date rather than the epoch', () => {
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate('not a date')).toBeNull();
  });

  it('accepts a full ISO timestamp by reading its date part', () => {
    expect(formatLocalDate(parseLocalDate('2026-10-09T18:30:00.000Z')!)).toBe('2026-10-09');
  });
});

describe('addDaysLocal', () => {
  it('shifts whole calendar days in both directions', () => {
    expect(addDaysLocal('2026-10-09', 1)).toBe('2026-10-10');
    expect(addDaysLocal('2026-10-09', -2)).toBe('2026-10-07');
    expect(addDaysLocal('2026-10-09', 0)).toBe('2026-10-09');
  });

  it('crosses month and year boundaries', () => {
    expect(addDaysLocal('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysLocal('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles a leap day', () => {
    expect(addDaysLocal('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysLocal('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('passes a blank or malformed bound through instead of "Invalid Date"', () => {
    // These feed a date input's min/max, where "Invalid Date" removes the bound.
    expect(addDaysLocal('', 1)).toBe('');
    expect(addDaysLocal(null, 1)).toBe('');
    expect(addDaysLocal('garbage', 1)).toBe('garbage');
  });
});
