import { CancellationRecord, RefundEntry, Advance, PolicyConfig } from '../types';
import { supabase } from '../supabaseClient';

export const calculateCancellationSplit = (
  originalFare: number,
  refunds: RefundEntry[],
  navgurukulCoverPercent: number,
  employeeCoverPercent: number
) => {
  const totalRefunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const netUnrecoveredAmount = Math.max(0, originalFare - totalRefunded);

  const employeeOwedAmount = (netUnrecoveredAmount * employeeCoverPercent) / 100;
  const orgAbsorbedAmount = (netUnrecoveredAmount * navgurukulCoverPercent) / 100;

  // Rounding to nearest integer to avoid currency fraction mismatches
  return {
    netUnrecoveredAmount: Math.round(netUnrecoveredAmount),
    employeeOwedAmount: Math.round(employeeOwedAmount),
    orgAbsorbedAmount: Math.round(orgAbsorbedAmount),
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
  // Fetch the latest advance balance
  const { data: advance, error: fetchError } = await supabase
    .from('advances')
    .select('*')
    .eq('id', advanceId)
    .single();

  if (fetchError || !advance) {
    throw new Error('Failed to fetch advance to apply refund');
  }

  const newAmountLeft = advance.amount_left + refundAmount;
  
  const newChangelogEntry = {
    timestamp: new Date().toISOString(),
    user: userEmail,
    action: 'Refund Received',
    details: `Refund of ₹${refundAmount} added back for ticket ${submissionId || ticketId}. Active balance: ₹${newAmountLeft}.`,
    relatedTicketId: ticketId,
    relatedTicketSubmissionId: submissionId
  };

  const { error: updateError } = await supabase
    .from('advances')
    .update({
      amount_left: newAmountLeft,
      changelog: [...(advance.changelog || []), newChangelogEntry]
    })
    .eq('id', advanceId);

  if (updateError) {
    throw new Error('Failed to apply refund to advance');
  }

  return newAmountLeft;
};
