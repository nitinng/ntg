import { CancellationRecord, RefundEntry, Advance, PolicyConfig } from '../types';
import { supabase } from '../supabaseClient';

export const calculateCancellationSplit = (
  originalFare: number,
  refunds: RefundEntry[],
  navgurukulCoverPercent: number,
  employeeCoverPercent: number
) => {
  const totalRefunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const rawNetUnrecoveredAmount = Math.max(0, originalFare - totalRefunded);
  
  // Round net unrecovered amount first
  const netUnrecoveredAmount = Math.round(rawNetUnrecoveredAmount);
  
  // Calculate employee split and round it
  const employeeOwedAmount = Math.round((netUnrecoveredAmount * employeeCoverPercent) / 100);
  
  // Derive org absorbed split by subtraction
  const orgAbsorbedAmount = netUnrecoveredAmount - employeeOwedAmount;

  return {
    netUnrecoveredAmount,
    employeeOwedAmount,
    orgAbsorbedAmount,
    totalRefunded: Math.round(totalRefunded)
  };
};

export const applyRefundToAdvance = async (
  advanceId: string,
  refundAmount: number,
  userEmail: string,
  ticketId: string,
  submissionId?: string
) => {
  const newChangelogEntry = {
    timestamp: new Date().toISOString(),
    user: userEmail,
    action: 'Refund Received',
    details: `Refund of ₹${refundAmount} added back for ticket ${submissionId || ticketId}.`,
    relatedTicketId: ticketId,
    relatedTicketSubmissionId: submissionId
  };

  const { data: newAmountLeft, error } = await supabase.rpc('update_advance_balance', {
    p_advance_id: advanceId,
    p_amount_delta: refundAmount,
    p_changelog_entry: newChangelogEntry
  });

  if (error) {
    throw new Error('Failed to apply refund to advance: ' + error.message);
  }

  return Number(newAmountLeft);
};

