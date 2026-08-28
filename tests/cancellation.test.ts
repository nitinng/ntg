import { describe, it, expect, vi } from 'vitest';
import { calculateCancellationSplit, applyRefundToAdvance } from '../utils/cancellation';
import { RefundEntry } from '../types';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn()
  }
}));

describe('Cancellation Utilities: calculateCancellationSplit', () => {
  it('calculates 50/50 split correctly when no refund has been received', () => {
    const originalFare = 10000;
    const refunds: RefundEntry[] = [];
    const result = calculateCancellationSplit(originalFare, refunds, 50, 50);

    expect(result.totalRefunded).toBe(0);
    expect(result.netUnrecoveredAmount).toBe(10000);
    expect(result.employeeOwedAmount).toBe(5000);
    expect(result.orgAbsorbedAmount).toBe(5000);
    expect(result.employeeOwedAmount + result.orgAbsorbedAmount).toBe(result.netUnrecoveredAmount);
  });

  it('calculates 100% org cover (0% employee cover) for PNC/Org cancellations', () => {
    const originalFare = 8500;
    const refunds: RefundEntry[] = [
      { id: 'ref-1', cancellationRecordId: 'c-1', amount: 3000, dateReceived: '2026-09-10' }
    ];
    const result = calculateCancellationSplit(originalFare, refunds, 100, 0);

    expect(result.totalRefunded).toBe(3000);
    expect(result.netUnrecoveredAmount).toBe(5500);
    expect(result.employeeOwedAmount).toBe(0);
    expect(result.orgAbsorbedAmount).toBe(5500);
    expect(result.employeeOwedAmount + result.orgAbsorbedAmount).toBe(result.netUnrecoveredAmount);
  });

  it('calculates partial refund scenario with fractional percentages properly rounded', () => {
    const originalFare = 5677;
    const refunds: RefundEntry[] = [
      { id: 'ref-1', cancellationRecordId: 'c-1', amount: 1234, dateReceived: '2026-09-10' },
      { id: 'ref-2', cancellationRecordId: 'c-1', amount: 500, dateReceived: '2026-09-12' }
    ];
    // Total refund = 1734. Net unrecovered = 5677 - 1734 = 3943
    // Employee 50% = 1971.5 -> rounded to 1972
    // Org = 3943 - 1972 = 1971
    const result = calculateCancellationSplit(originalFare, refunds, 50, 50);

    expect(result.totalRefunded).toBe(1734);
    expect(result.netUnrecoveredAmount).toBe(3943);
    expect(result.employeeOwedAmount).toBe(1972);
    expect(result.orgAbsorbedAmount).toBe(1971);
    // Invariant: employee + org must strictly equal net unrecovered
    expect(result.employeeOwedAmount + result.orgAbsorbedAmount).toBe(result.netUnrecoveredAmount);
  });

  it('handles full refund (100% refunded) scenario without negative values', () => {
    const originalFare = 6000;
    const refunds: RefundEntry[] = [
      { id: 'ref-1', cancellationRecordId: 'c-1', amount: 6000, dateReceived: '2026-09-10' }
    ];
    const result = calculateCancellationSplit(originalFare, refunds, 50, 50);

    expect(result.totalRefunded).toBe(6000);
    expect(result.netUnrecoveredAmount).toBe(0);
    expect(result.employeeOwedAmount).toBe(0);
    expect(result.orgAbsorbedAmount).toBe(0);
  });

  it('handles over-refunded scenario gracefully without producing negative unrecovered amounts', () => {
    const originalFare = 4000;
    const refunds: RefundEntry[] = [
      { id: 'ref-1', cancellationRecordId: 'c-1', amount: 4500, dateReceived: '2026-09-10' }
    ];
    const result = calculateCancellationSplit(originalFare, refunds, 50, 50);

    expect(result.totalRefunded).toBe(4500);
    expect(result.netUnrecoveredAmount).toBe(0);
    expect(result.employeeOwedAmount).toBe(0);
    expect(result.orgAbsorbedAmount).toBe(0);
  });

  it('satisfies financial non-negativity invariants for all fields', () => {
    const testCases = [
      { fare: 0, refunds: [], ng: 50, emp: 50 },
      { fare: 100, refunds: [{ id: '1', cancellationRecordId: 'c', amount: 10, dateReceived: '' }], ng: 70, emp: 30 },
      { fare: 9999, refunds: [{ id: '1', cancellationRecordId: 'c', amount: 3333, dateReceived: '' }], ng: 0, emp: 100 },
      { fare: 15432, refunds: [{ id: '1', cancellationRecordId: 'c', amount: 15432, dateReceived: '' }], ng: 100, emp: 0 }
    ];

    for (const tc of testCases) {
      const res = calculateCancellationSplit(tc.fare, tc.refunds, tc.ng, tc.emp);
      expect(res.totalRefunded).toBeGreaterThanOrEqual(0);
      expect(res.netUnrecoveredAmount).toBeGreaterThanOrEqual(0);
      expect(res.employeeOwedAmount).toBeGreaterThanOrEqual(0);
      expect(res.orgAbsorbedAmount).toBeGreaterThanOrEqual(0);
      expect(res.employeeOwedAmount + res.orgAbsorbedAmount).toBe(res.netUnrecoveredAmount);
    }
  });
});

describe('Cancellation Utilities: applyRefundToAdvance', () => {
  it('calls update_advance_balance RPC with correct payload and returns new balance', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: 4500,
      error: null
    });

    const newBalance = await applyRefundToAdvance(
      'adv-123',
      1500,
      'admin@navgurukul.org',
      'req-999',
      'TRV-999'
    );

    expect(supabase.rpc).toHaveBeenCalledWith('update_advance_balance', expect.objectContaining({
      p_advance_id: 'adv-123',
      p_amount_delta: 1500,
      p_changelog_entry: expect.objectContaining({
        user: 'admin@navgurukul.org',
        action: 'Refund Received',
        relatedTicketId: 'req-999',
        relatedTicketSubmissionId: 'TRV-999'
      })
    }));
    expect(newBalance).toBe(4500);
  });

  it('throws descriptive error if RPC call fails', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection failed' }
    });

    await expect(
      applyRefundToAdvance('adv-123', 500, 'admin@navgurukul.org', 'req-1')
    ).rejects.toThrow('Failed to apply refund to advance: Database connection failed');
  });
});
