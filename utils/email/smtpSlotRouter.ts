/**
 * Pure routing logic for the dual SMTP account setup (Account A = `smtp`,
 * Account B = `smtp2`).
 *
 * Kept free of imports so the Deno edge worker can mirror it verbatim —
 * see the SLOT ROUTER block in supabase/functions/process-email-queue/index.ts.
 * Any change here must be copied there.
 */

export type SmtpSlot = 'smtp' | 'smtp2';

export type PickReason =
  | 'active'
  | 'active_at_quota'
  | 'active_unconfigured'
  | 'all_at_quota';

export interface SlotUsage {
  smtp: number;
  smtp2: number;
}

export interface SlotConfigured {
  smtp: boolean;
  smtp2: boolean;
}

export interface FailureStreak {
  slot: SmtpSlot;
  count: number;
}

export const otherSlot = (slot: SmtpSlot): SmtpSlot =>
  slot === 'smtp' ? 'smtp2' : 'smtp';

/**
 * Chooses which SMTP account should carry the next send.
 *
 * The active account wins while it is configured and under its own daily cap.
 * Gmail Workspace enforces the cap per account, so a pooled total is not
 * enough — each slot is checked against `perAccountQuota` separately.
 */
export const pickSlot = (input: {
  activeSlot: SmtpSlot;
  usage: SlotUsage;
  perAccountQuota: number;
  configured: SlotConfigured;
}): { slot: SmtpSlot | null; reason: PickReason } => {
  const { activeSlot, usage, perAccountQuota, configured } = input;
  const backupSlot = otherSlot(activeSlot);

  const available = (slot: SmtpSlot) =>
    configured[slot] && (usage[slot] || 0) < perAccountQuota;

  if (available(activeSlot)) {
    return { slot: activeSlot, reason: 'active' };
  }

  if (available(backupSlot)) {
    const reason: PickReason = configured[activeSlot]
      ? 'active_at_quota'
      : 'active_unconfigured';
    return { slot: backupSlot, reason };
  }

  return { slot: null, reason: 'all_at_quota' };
};

/**
 * Advances the consecutive-failure counter used to auto-promote the backup.
 *
 * Only non-transient failures (bad credentials, quota rejection, config
 * errors) count — a transient blip is already handled by the queue's
 * exponential backoff and must not repoint the sending identity.
 */
export const nextStreakState = (input: {
  streak: FailureStreak | null | undefined;
  slot: SmtpSlot;
  failed: boolean;
  isTransient: boolean;
  promoteAfter: number;
}): { streak: FailureStreak; promoteTo: SmtpSlot | null } => {
  const { streak, slot, failed, isTransient, promoteAfter } = input;

  if (!failed) {
    return { streak: { slot, count: 0 }, promoteTo: null };
  }

  if (isTransient) {
    const count = streak?.slot === slot ? streak.count : 0;
    return { streak: { slot, count }, promoteTo: null };
  }

  const count = (streak?.slot === slot ? streak.count : 0) + 1;
  const promoteTo = count >= promoteAfter ? otherSlot(slot) : null;

  return { streak: { slot, count }, promoteTo };
};

/** Minutes IST runs ahead of UTC. */
const IST_OFFSET_MINUTES = 330;

const shiftIso = (now: Date, days: number): string => {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return new Date(shifted.getTime() - IST_OFFSET_MINUTES * 60_000).toISOString();
};

/**
 * Start of the current IST day as a UTC ISO string.
 *
 * Quota counting must agree between the browser (local time) and the Deno
 * worker (UTC), so both anchor on IST rather than on their own clock.
 */
export const istDayStartIso = (now: Date = new Date()): string => shiftIso(now, 0);

/** Start of the next IST day — when a quota-blocked send becomes eligible again. */
export const istNextDayStartIso = (now: Date = new Date()): string => shiftIso(now, 1);
