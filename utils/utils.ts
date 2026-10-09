import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calendar-date helpers that stay in the *viewer's* timezone.
 *
 * `new Date().toISOString().split('T')[0]` is UTC, so for every timezone ahead
 * of UTC it names the wrong day during the small hours. In IST (UTC+5:30),
 * between 00:00 and 05:30 local it yields *yesterday* — which is how
 * NewRequestModal's "earliest bookable date is tomorrow" silently became
 * "today" for anyone opening the form before breakfast, re-admitting the
 * same-day bookings the minimum is there to block.
 *
 * Parsing is the other half of the same bug: `new Date('2026-10-09')` is parsed
 * as UTC midnight by spec, so formatting it back through a local formatter can
 * shift the day for timezones behind UTC. `parseLocalDate` therefore builds the
 * date from its parts, and every helper below round-trips through local time.
 */

/** `YYYY-MM-DD` for a Date, read in local time. */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses `YYYY-MM-DD` as local midnight rather than UTC midnight.
 * Returns null for anything that is not a calendar date, so callers can tell
 * "no date" from "the epoch".
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Today's calendar date in the viewer's timezone, as `YYYY-MM-DD`. */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/**
 * Shifts a `YYYY-MM-DD` string by whole days, staying on the local calendar.
 * Falls back to the input when it is not a parseable date, so a blank or
 * malformed bound passes through rather than becoming "Invalid Date".
 */
export function addDaysLocal(base: string | null | undefined, days: number): string {
  const date = parseLocalDate(base);
  if (!date) return base || '';
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

/** The earliest date a traveller may pick: tomorrow, local time. */
export function earliestBookableDate(): string {
  return addDaysLocal(todayLocal(), 1);
}
