import { describe, it, expect } from 'vitest';
import { Advance, AdvanceChangelogEntry } from '../types';

/**
 * Pure helper simulation of advance balance updates matching the DB update_advance_balance RPC behavior.
 */
export const simulateAdvanceBalanceUpdate = (
  advance: Advance,
  amountDelta: number,
  changelogEntry: AdvanceChangelogEntry
): Advance => {
  const updatedAmountLeft = advance.amount_left + amountDelta;
  if (updatedAmountLeft < 0) {
    throw new Error(`Insufficient advance balance: Available ₹${advance.amount_left}, attempted deduction of ₹${Math.abs(amountDelta)}`);
  }

  return {
    ...advance,
    amount_left: updatedAmountLeft,
    changelog: [...advance.changelog, changelogEntry],
    updated_at: new Date().toISOString()
  };
};

describe('Advance Management & Invariant Testing', () => {
  const createMockAdvance = (overrides?: Partial<Advance>): Advance => ({
    id: 'adv-100',
    advance_code: 'ADV-2026-001',
    amount_received: 25000,
    amount_left: 25000,
    received_from: 'Navgurukul Operations',
    received_on: '2026-09-01',
    is_settled: false,
    changelog: [
      {
        timestamp: '2026-09-01T10:00:00.000Z',
        user: 'pnc@navgurukul.org',
        action: 'Created',
        details: 'Initial advance created with amount ₹25,000'
      }
    ],
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...overrides
  });

  it('allocates ticket cost against advance properly and records changelog', () => {
    const advance = createMockAdvance();
    const ticketCost = 4500;
    const changelog: AdvanceChangelogEntry = {
      timestamp: '2026-09-02T12:00:00.000Z',
      user: 'pnc@navgurukul.org',
      action: 'Ticket Purchased',
      details: `Allocated ₹${ticketCost} for ticket TRV-1001`,
      relatedTicketId: 'req-1',
      relatedTicketSubmissionId: 'TRV-1001'
    };

    const updated = simulateAdvanceBalanceUpdate(advance, -ticketCost, changelog);

    expect(updated.amount_left).toBe(20500);
    expect(updated.changelog.length).toBe(2);
    expect(updated.changelog[1].action).toBe('Ticket Purchased');
    expect(updated.changelog[1].relatedTicketSubmissionId).toBe('TRV-1001');
  });

  it('re-credits refund to advance properly and maintains changelog', () => {
    const advance = createMockAdvance({
      amount_received: 20000,
      amount_left: 12000
    });
    const refundAmount = 3000;
    const changelog: AdvanceChangelogEntry = {
      timestamp: '2026-09-05T14:00:00.000Z',
      user: 'finance@navgurukul.org',
      action: 'Refund Received',
      details: `Refund of ₹${refundAmount} credited back for ticket TRV-1001`,
      relatedTicketId: 'req-1',
      relatedTicketSubmissionId: 'TRV-1001'
    };

    const updated = simulateAdvanceBalanceUpdate(advance, refundAmount, changelog);

    expect(updated.amount_left).toBe(15000);
    expect(updated.changelog[updated.changelog.length - 1].action).toBe('Refund Received');
  });

  it('prevents impossible negative balance when deduction exceeds amount_left', () => {
    const advance = createMockAdvance({
      amount_received: 10000,
      amount_left: 2000
    });
    const excessCost = 3500;
    const changelog: AdvanceChangelogEntry = {
      timestamp: '2026-09-02T12:00:00.000Z',
      user: 'pnc@navgurukul.org',
      action: 'Ticket Purchased',
      details: `Attempted allocation of ₹${excessCost}`
    };

    expect(() => simulateAdvanceBalanceUpdate(advance, -excessCost, changelog)).toThrow(
      /Insufficient advance balance/
    );
    // Original balance preserved intact
    expect(advance.amount_left).toBe(2000);
  });

  it('allows reducing balance to exactly zero without error', () => {
    const advance = createMockAdvance({
      amount_received: 5000,
      amount_left: 5000
    });
    const exactCost = 5000;
    const changelog: AdvanceChangelogEntry = {
      timestamp: '2026-09-02T12:00:00.000Z',
      user: 'pnc@navgurukul.org',
      action: 'Ticket Purchased',
      details: 'Full utilization'
    };

    const updated = simulateAdvanceBalanceUpdate(advance, -exactCost, changelog);
    expect(updated.amount_left).toBe(0);
  });

  it('handles multiple sequential allocations and refunds with exact balance preservation', () => {
    let currentAdvance = createMockAdvance({ amount_received: 50000, amount_left: 50000 });

    const operations = [
      { delta: -12000, action: 'Ticket Purchased' as const },
      { delta: -8000, action: 'Ticket Purchased' as const },
      { delta: 4000, action: 'Refund Received' as const },
      { delta: -15000, action: 'Ticket Purchased' as const },
      { delta: 2500, action: 'Refund Received' as const }
    ];

    for (const op of operations) {
      currentAdvance = simulateAdvanceBalanceUpdate(currentAdvance, op.delta, {
        timestamp: new Date().toISOString(),
        user: 'pnc@navgurukul.org',
        action: op.action,
        details: `Delta ${op.delta}`
      });
    }

    // 50000 - 12000 - 8000 + 4000 - 15000 + 2500 = 21500
    expect(currentAdvance.amount_left).toBe(21500);
    expect(currentAdvance.changelog.length).toBe(6);
  });
});
