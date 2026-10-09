/**
 * Settling a cancellation has to move the *ticket*, not just the cancellation
 * record, or the refund mails never fire. These cover the planner that decides
 * how, including the cases where the settled outcome is not directly reachable
 * from the stage the ticket is actually in.
 */

import { describe, it, expect } from 'vitest';
import { PNCStatus, TravelEvent } from '../types';
import { isValidStatusTransition } from '../utils/workflow';
import {
  SETTLEMENT_OPTIONS,
  settlementStatusToPncStatus,
  planSettlementTransition
} from '../utils/settlement';
import { deriveEventFromTransition } from '../utils/emailTriggers';

const amounts = (vendorRefund: number, originalFare = 10000) => ({ vendorRefund, originalFare });

/** Walks a plan and asserts every hop is one the state machine permits. */
const assertWalkable = (from: PNCStatus, path: PNCStatus[]) => {
  let current = from;
  for (const next of path) {
    expect(isValidStatusTransition(current, next)).toBe(true);
    current = next;
  }
  return current;
};

describe('settlement vocabulary', () => {
  it('maps every offered outcome to a ticket stage', () => {
    // The form renders from SETTLEMENT_OPTIONS, so an unmapped outcome would be
    // selectable and then silently do nothing.
    for (const option of SETTLEMENT_OPTIONS) {
      expect(settlementStatusToPncStatus(option.value)).not.toBeNull();
    }
  });

  it('offers the two outcomes that were previously unreachable', () => {
    const values = SETTLEMENT_OPTIONS.map(o => o.value);
    expect(values).toContain('Partially Refunded');
    expect(values).toContain('Disputed');
  });

  it('rejects an unknown outcome rather than guessing', () => {
    expect(settlementStatusToPncStatus('Refunded Maybe')).toBeNull();
  });
});

describe('settling from Cancelled by Employee', () => {
  const from = PNCStatus.CANCELLED_BY_EMPLOYEE;

  // The four Settle outcomes that carry money.
  it.each([
    ['Fully Refunded', PNCStatus.FULLY_REFUNDED, TravelEvent.REFUND_COMPLETED],
    ['Partially Refunded', PNCStatus.PARTIALLY_REFUNDED, TravelEvent.PARTIAL_REFUND_RECEIVED],
    ['Written Off', PNCStatus.WRITTEN_OFF, TravelEvent.REFUND_WRITTEN_OFF],
    ['Disputed', PNCStatus.DISPUTED, TravelEvent.REFUND_DISPUTED]
  ])('routes %s through Pending Refund and mails both hops', (_label, target, finalEvent) => {
    const plan = planSettlementTransition(from, target as PNCStatus, amounts(4000));

    expect(plan.blockedReason).toBeUndefined();
    // Pending Refund is not a detour: it is where the employee's refund
    // notification comes from, so skipping it would lose that mail.
    expect(plan.path).toEqual([PNCStatus.PENDING_REFUND, target]);
    expect(assertWalkable(from, plan.path)).toBe(target);

    expect(deriveEventFromTransition(from, PNCStatus.PENDING_REFUND))
      .toBe(TravelEvent.REFUND_PROCESS_STARTED);
    expect(deriveEventFromTransition(PNCStatus.PENDING_REFUND, target as PNCStatus))
      .toBe(finalEvent);
  });

  it('reconciles directly when nothing was recoverable', () => {
    const plan = planSettlementTransition(from, PNCStatus.RECONCILED, amounts(0));
    expect(plan.path).toEqual([PNCStatus.RECONCILED]);
    expect(deriveEventFromTransition(from, PNCStatus.RECONCILED))
      .toBe(TravelEvent.NO_REFUND_REQUIRED);
  });
});

describe('settling from Cancelled by PNC', () => {
  const from = PNCStatus.CANCELLED_BY_PNC;

  it('raises the refund-start mail on the desk-cancellation route too', () => {
    const plan = planSettlementTransition(from, PNCStatus.FULLY_REFUNDED, amounts(9000));
    expect(plan.path).toEqual([PNCStatus.PENDING_REFUND, PNCStatus.FULLY_REFUNDED]);
    expect(deriveEventFromTransition(from, PNCStatus.PENDING_REFUND))
      .toBe(TravelEvent.REFUND_PROCESS_STARTED);
  });

  it('reconciles directly, and that reconciliation is distinguishable', () => {
    const plan = planSettlementTransition(from, PNCStatus.RECONCILED, amounts(0));
    expect(plan.path).toEqual([PNCStatus.RECONCILED]);
    expect(deriveEventFromTransition(from, PNCStatus.RECONCILED))
      .toBe(TravelEvent.NO_REFUND_REQUIRED);
  });
});

describe('settling from Pending Refund', () => {
  const from = PNCStatus.PENDING_REFUND;

  it.each([
    ['Fully Refunded', PNCStatus.FULLY_REFUNDED],
    ['Partially Refunded', PNCStatus.PARTIALLY_REFUNDED],
    ['Written Off', PNCStatus.WRITTEN_OFF],
    ['Disputed', PNCStatus.DISPUTED]
  ])('moves straight to %s', (_label, target) => {
    const plan = planSettlementTransition(from, target as PNCStatus, amounts(4000));
    expect(plan.path).toEqual([target]);
  });

  // Reconciliation has no direct edge from Pending Refund by design: a ticket
  // cannot be reconciled before its refund has an outcome. The amounts say which.
  it('reconciles via a full refund when the vendor returned the whole fare', () => {
    const plan = planSettlementTransition(from, PNCStatus.RECONCILED, amounts(10000, 10000));
    expect(plan.path).toEqual([PNCStatus.FULLY_REFUNDED, PNCStatus.RECONCILED]);
    expect(assertWalkable(from, plan.path)).toBe(PNCStatus.RECONCILED);
  });

  it('reconciles via a partial refund when the vendor returned some of it', () => {
    const plan = planSettlementTransition(from, PNCStatus.RECONCILED, amounts(4000, 10000));
    expect(plan.path).toEqual([PNCStatus.PARTIALLY_REFUNDED, PNCStatus.RECONCILED]);
    expect(assertWalkable(from, plan.path)).toBe(PNCStatus.RECONCILED);
  });

  it('reconciles via a write-off when nothing came back', () => {
    const plan = planSettlementTransition(from, PNCStatus.RECONCILED, amounts(0, 10000));
    expect(plan.path).toEqual([PNCStatus.WRITTEN_OFF, PNCStatus.RECONCILED]);
    expect(assertWalkable(from, plan.path)).toBe(PNCStatus.RECONCILED);
  });
});

describe('settling from a partial or disputed state', () => {
  it('lets a part-refunded ticket reconcile without a fictitious write-off', () => {
    const plan = planSettlementTransition(
      PNCStatus.PARTIALLY_REFUNDED, PNCStatus.RECONCILED, amounts(4000)
    );
    expect(plan.path).toEqual([PNCStatus.RECONCILED]);
  });

  it('lets a resolved dispute close directly', () => {
    expect(planSettlementTransition(PNCStatus.DISPUTED, PNCStatus.RECONCILED, amounts(0)).path)
      .toEqual([PNCStatus.RECONCILED]);
    expect(planSettlementTransition(PNCStatus.DISPUTED, PNCStatus.WRITTEN_OFF, amounts(0)).path)
      .toEqual([PNCStatus.WRITTEN_OFF]);
  });
});

describe('plans that cannot be walked', () => {
  it('is a no-op when the ticket is already at the settled stage', () => {
    const plan = planSettlementTransition(
      PNCStatus.FULLY_REFUNDED, PNCStatus.FULLY_REFUNDED, amounts(10000)
    );
    expect(plan.path).toEqual([]);
    expect(plan.blockedReason).toBeUndefined();
  });

  it('explains itself rather than writing a status the workflow forbids', () => {
    // A closed ticket is terminal. The settlement record still saves; the
    // caller surfaces this instead of silently corrupting the ticket.
    const plan = planSettlementTransition(PNCStatus.CLOSED, PNCStatus.FULLY_REFUNDED, amounts(100));
    expect(plan.path).toEqual([]);
    expect(plan.blockedReason).toContain('cannot be settled');
  });

  it('reports a request with no current stage', () => {
    const plan = planSettlementTransition(null, PNCStatus.RECONCILED, amounts(0));
    expect(plan.path).toEqual([]);
    expect(plan.blockedReason).toBeTruthy();
  });

  it('never returns a path with a hop the state machine rejects', () => {
    // Property check across every start stage and every offered outcome.
    for (const from of Object.values(PNCStatus)) {
      for (const option of SETTLEMENT_OPTIONS) {
        const target = settlementStatusToPncStatus(option.value)!;
        const plan = planSettlementTransition(from, target, amounts(4000));
        if (plan.path.length > 0) {
          expect(assertWalkable(from, plan.path)).toBe(target);
        }
      }
    }
  });
});
