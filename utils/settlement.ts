/**
 * Turning a cancellation settlement into a ticket status move.
 *
 * `cancellation_records.status` and `travel_requests.pnc_status` are separate
 * columns that happen to share a vocabulary. The Settle action wrote only the
 * former, so the ticket never left the stage it was in -- and because the mail
 * pipeline keys on *ticket* status transitions, the Fully Refunded, Partially
 * Refunded and Written Off mails could never fire, however the record was
 * settled.
 *
 * The two are not freely interchangeable, though: the ticket is governed by the
 * state machine in ./workflow, and a record can legitimately be settled from a
 * stage the target status is not directly reachable from. A ticket sitting at
 * "Cancelled by Employee" cannot jump straight to "Fully Refunded"; it has to
 * pass through "Pending Refund", which is also where the employee's refund
 * notification comes from. So rather than writing the status directly (and
 * skipping the mail) or refusing the settlement, this plans the short path the
 * workflow does allow and lets the caller walk it one hop at a time, raising
 * the mail for each.
 */

import { PNCStatus } from '../types';
import { ALLOWED_TRANSITIONS, isValidStatusTransition } from './workflow';

/**
 * The settlement outcomes the Settle form offers, in the order it lists them.
 *
 * The form renders straight from this, so an outcome cannot be offered without
 * a ticket stage to map it to -- which is how "Partially Refunded" and
 * "Disputed" came to be reachable states with no way to reach them.
 */
export const SETTLEMENT_OPTIONS = [
  { value: 'Reconciled', label: 'Reconciled (Settled)' },
  { value: 'Fully Refunded', label: 'Fully Refunded' },
  { value: 'Partially Refunded', label: 'Partially Refunded' },
  { value: 'Written Off', label: 'Written Off' },
  { value: 'Disputed', label: 'Disputed' },
  { value: 'Pending Refund', label: 'Pending Refund (Keep Active)' }
] as const;

export type SettlementStatus = (typeof SETTLEMENT_OPTIONS)[number]['value'];

/** Just the values, for callers that only need the vocabulary. */
export const SETTLEMENT_STATUSES: readonly SettlementStatus[] =
  SETTLEMENT_OPTIONS.map(option => option.value);

/**
 * The ticket stage a settlement outcome corresponds to.
 *
 * The two vocabularies coincide today, which is precisely why the missing link
 * went unnoticed. Going through an explicit map means a future divergence
 * surfaces here as a compile error rather than as silently unsent mail.
 */
const SETTLEMENT_TO_PNC_STATUS: Record<SettlementStatus, PNCStatus> = {
  'Reconciled': PNCStatus.RECONCILED,
  'Fully Refunded': PNCStatus.FULLY_REFUNDED,
  'Partially Refunded': PNCStatus.PARTIALLY_REFUNDED,
  'Written Off': PNCStatus.WRITTEN_OFF,
  'Disputed': PNCStatus.DISPUTED,
  'Pending Refund': PNCStatus.PENDING_REFUND
};

export const settlementStatusToPncStatus = (status: string): PNCStatus | null =>
  SETTLEMENT_TO_PNC_STATUS[status as SettlementStatus] ?? null;

export interface SettlementAmounts {
  /** What the vendor returned. */
  vendorRefund: number;
  /** What the ticket originally cost. */
  originalFare: number;
}

/**
 * Which refund outcome a "Reconciled" settlement implies.
 *
 * "Reconciled" says the money loop is closed, not how it closed, but the
 * workflow deliberately has no Pending Refund -> Reconciled edge: a ticket
 * cannot be reconciled before its refund has an outcome. The amounts on the
 * settlement are what distinguish them, so they pick the intermediate stage
 * rather than the operator being asked to state it twice.
 */
const reconciliationOutcome = (amounts: SettlementAmounts): PNCStatus => {
  const { vendorRefund, originalFare } = amounts;
  if (originalFare > 0 && vendorRefund >= originalFare) return PNCStatus.FULLY_REFUNDED;
  if (vendorRefund > 0) return PNCStatus.PARTIALLY_REFUNDED;
  return PNCStatus.WRITTEN_OFF;
};

export interface SettlementPlan {
  /** Stages to move through, in order. Empty when the ticket is already there. */
  path: PNCStatus[];
  /** Set when no permitted path exists, for the caller to surface. */
  blockedReason?: string;
}

/**
 * Plans the ticket moves for a settlement.
 *
 * Returns the stages to apply in order. Each hop is a real transition, so the
 * caller raises the normal mail for each and the employee sees the refund
 * story in the order it happened rather than only its conclusion.
 */
export const planSettlementTransition = (
  fromStatus: PNCStatus | null | undefined,
  targetStatus: PNCStatus,
  amounts: SettlementAmounts
): SettlementPlan => {
  if (!fromStatus) {
    return { path: [], blockedReason: 'The linked request has no current stage.' };
  }

  // Already settled at this stage: the record still updates, nothing to re-mail.
  if (fromStatus === targetStatus) return { path: [] };

  if (isValidStatusTransition(fromStatus, targetStatus)) {
    return { path: [targetStatus] };
  }

  // Reconciliation needs an outcome first (see reconciliationOutcome).
  if (targetStatus === PNCStatus.RECONCILED) {
    const outcome = reconciliationOutcome(amounts);
    if (
      outcome !== fromStatus &&
      isValidStatusTransition(fromStatus, outcome) &&
      isValidStatusTransition(outcome, PNCStatus.RECONCILED)
    ) {
      return { path: [outcome, PNCStatus.RECONCILED] };
    }
  }

  // Everything else that is settleable reaches its outcome through Pending
  // Refund, which is also the stage the employee refund mail is attached to.
  if (
    fromStatus !== PNCStatus.PENDING_REFUND &&
    isValidStatusTransition(fromStatus, PNCStatus.PENDING_REFUND) &&
    isValidStatusTransition(PNCStatus.PENDING_REFUND, targetStatus)
  ) {
    return { path: [PNCStatus.PENDING_REFUND, targetStatus] };
  }

  const reachable = (ALLOWED_TRANSITIONS[fromStatus] || []).join(', ') || 'nothing';
  return {
    path: [],
    blockedReason:
      `A ticket at "${fromStatus}" cannot be settled as "${targetStatus}". ` +
      `From here it can only move to: ${reachable}.`
  };
};
