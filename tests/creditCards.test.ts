import { describe, it, expect } from 'vitest';
import { CreditCard, CreditCardChangelogEntry } from '../types';

/**
 * Pure helper simulation of the update_credit_card_balance RPC.
 *
 * The card rail differs from the advance rail in exactly one way: an
 * adjustment can move the sanctioned balance itself. adjustLimit=false is a
 * booking or a refund (available balance moves, the sanctioned balance does
 * not); adjustLimit=true is a top-up or a cut by the desk (both move together,
 * so utilisation to date is unchanged).
 */
export const simulateCreditCardBalanceUpdate = (
  card: CreditCard,
  amountDelta: number,
  changelogEntry: CreditCardChangelogEntry,
  adjustLimit = false
): CreditCard => {
  const updatedAmountLeft = card.amount_left + amountDelta;
  if (updatedAmountLeft < 0) {
    throw new Error(`Insufficient card balance: Available ₹${card.amount_left}, attempted charge of ₹${Math.abs(amountDelta)}`);
  }

  return {
    ...card,
    amount_left: updatedAmountLeft,
    opening_balance: adjustLimit ? card.opening_balance + amountDelta : card.opening_balance,
    changelog: [...card.changelog, changelogEntry],
    updated_at: new Date().toISOString()
  };
};

/** Utilisation as every screen computes it. */
const utilised = (card: CreditCard) => card.opening_balance - card.amount_left;

describe('Credit Card Management & Invariant Testing', () => {
  const createMockCard = (overrides?: Partial<CreditCard>): CreditCard => ({
    id: 'card-100',
    card_code: 'CC-0001',
    last_four: '4321',
    bank_name: 'HDFC Bank',
    card_label: 'Ops Travel Card',
    approver_name: 'Finance Head',
    opening_balance: 100000,
    amount_left: 100000,
    is_active: true,
    changelog: [
      {
        timestamp: '2026-09-01T10:00:00.000Z',
        user: 'pnc@navgurukul.org',
        action: 'Created',
        details: 'Card xxxx-xxxx-xxxx-4321 (HDFC Bank) added with an opening balance of ₹100,000.'
      }
    ],
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...overrides
  });

  const entry = (
    action: CreditCardChangelogEntry['action'],
    details: string,
    extra?: Partial<CreditCardChangelogEntry>
  ): CreditCardChangelogEntry => ({
    timestamp: '2026-09-02T12:00:00.000Z',
    user: 'pnc@navgurukul.org',
    action,
    details,
    ...extra
  });

  it('charges a ticket to the card and records the changelog', () => {
    const card = createMockCard();
    const ticketCost = 7500;

    const updated = simulateCreditCardBalanceUpdate(
      card,
      -ticketCost,
      entry('Ticket Purchased', `Ticket TRV-1001 charged for ₹${ticketCost}.`, {
        relatedTicketId: 'req-1',
        relatedTicketSubmissionId: 'TRV-1001'
      })
    );

    expect(updated.amount_left).toBe(92500);
    expect(updated.changelog.length).toBe(2);
    expect(updated.changelog[1].action).toBe('Ticket Purchased');
    expect(updated.changelog[1].relatedTicketSubmissionId).toBe('TRV-1001');
    // A charge never moves the sanctioned balance.
    expect(updated.opening_balance).toBe(100000);
  });

  it('credits a refund back to the card without touching the sanctioned balance', () => {
    const card = createMockCard({ amount_left: 60000 });

    const updated = simulateCreditCardBalanceUpdate(
      card,
      5000,
      entry('Refund Received', 'Refund of ₹5000 credited back to the card for ticket TRV-1001.')
    );

    expect(updated.amount_left).toBe(65000);
    expect(updated.opening_balance).toBe(100000);
    expect(updated.changelog[updated.changelog.length - 1].action).toBe('Refund Received');
  });

  it('raises the sanctioned balance and the available balance together on a top-up', () => {
    const card = createMockCard({ amount_left: 40000 }); // ₹60,000 already utilised
    expect(utilised(card)).toBe(60000);

    const updated = simulateCreditCardBalanceUpdate(
      card,
      50000,
      entry('Limit Increased', 'Increased card balance by ₹50,000.'),
      true
    );

    expect(updated.opening_balance).toBe(150000);
    expect(updated.amount_left).toBe(90000);
    // The whole point of moving both: spend to date is unchanged by a top-up.
    expect(utilised(updated)).toBe(60000);
  });

  it('lowers both balances together on a reduction', () => {
    const card = createMockCard({ amount_left: 40000 });

    const updated = simulateCreditCardBalanceUpdate(
      card,
      -15000,
      entry('Limit Reduced', 'Reduced card balance by ₹15,000.'),
      true
    );

    expect(updated.opening_balance).toBe(85000);
    expect(updated.amount_left).toBe(25000);
    expect(utilised(updated)).toBe(60000);
  });

  it('prevents a charge that exceeds the available balance', () => {
    const card = createMockCard({ opening_balance: 10000, amount_left: 2000 });

    expect(() =>
      simulateCreditCardBalanceUpdate(card, -3500, entry('Ticket Purchased', 'Attempted charge of ₹3500.'))
    ).toThrow(/Insufficient card balance/);

    // Original balance preserved intact
    expect(card.amount_left).toBe(2000);
  });

  it('prevents a reduction larger than the unspent balance', () => {
    const card = createMockCard({ opening_balance: 50000, amount_left: 5000 });

    expect(() =>
      simulateCreditCardBalanceUpdate(card, -9000, entry('Limit Reduced', 'Reduced card balance by ₹9,000.'), true)
    ).toThrow(/Insufficient card balance/);
  });

  it('allows spending the card down to exactly zero', () => {
    const card = createMockCard({ opening_balance: 5000, amount_left: 5000 });

    const updated = simulateCreditCardBalanceUpdate(card, -5000, entry('Ticket Purchased', 'Full utilization'));
    expect(updated.amount_left).toBe(0);
    expect(utilised(updated)).toBe(5000);
  });

  it('keeps balances exact across a mixed run of charges, refunds and adjustments', () => {
    let card = createMockCard({ opening_balance: 50000, amount_left: 50000 });

    const operations: Array<{ delta: number; action: CreditCardChangelogEntry['action']; adjustLimit?: boolean }> = [
      { delta: -12000, action: 'Ticket Purchased' },
      { delta: -8000, action: 'Ticket Purchased' },
      { delta: 4000, action: 'Refund Received' },
      { delta: 20000, action: 'Limit Increased', adjustLimit: true },
      { delta: -15000, action: 'Ticket Purchased' },
      { delta: -5000, action: 'Limit Reduced', adjustLimit: true }
    ];

    for (const op of operations) {
      card = simulateCreditCardBalanceUpdate(
        card,
        op.delta,
        entry(op.action, `Delta ${op.delta}`),
        op.adjustLimit
      );
    }

    // Available: 50000 - 12000 - 8000 + 4000 + 20000 - 15000 - 5000 = 34000
    expect(card.amount_left).toBe(34000);
    // Sanctioned: 50000 + 20000 - 5000 = 65000
    expect(card.opening_balance).toBe(65000);
    // Charged net of refunds: 12000 + 8000 + 15000 - 4000 = 31000
    expect(utilised(card)).toBe(31000);
    expect(card.changelog.length).toBe(7);
  });

  it('only ever holds the last four digits of the card number', () => {
    const card = createMockCard();
    expect(card.last_four).toMatch(/^[0-9]{4}$/);
    expect(JSON.stringify(card)).not.toMatch(/[0-9]{12,}/);
  });
});
