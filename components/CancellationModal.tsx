import React, { useState, useMemo } from 'react';
import { TravelRequest, TravelLeg, UserRole, PNCStatus } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { calculateCancellationSplit } from '../utils/cancellation';

interface CancellationModalProps {
  request: TravelRequest;
  legs: TravelLeg[];
  onClose: () => void;
  onSuccess: () => void;
  role: UserRole;
}

const CancellationModal: React.FC<CancellationModalProps> = ({ request, legs, onClose, onSuccess, role }) => {
  const activeLegs = useMemo(() => legs.filter(l => l.status !== 'Cancelled'), [legs]);
  const [selectedLegIds, setSelectedLegIds] = useState<Set<string>>(
    activeLegs.length === 1 ? new Set([activeLegs[0].id]) : new Set()
  );
  const [cancelledBy, setCancelledBy] = useState<'Employee' | 'Org'>('Employee');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Per-leg refund tracking: { [legId]: { received: boolean, amount: string } }
  const [refundData, setRefundData] = useState<Record<string, { received: boolean; amount: string }>>({});

  const updateRefund = (legId: string, field: 'received' | 'amount', value: boolean | string) => {
    setRefundData(prev => ({
      ...prev,
      [legId]: {
        ...prev[legId],
        received: prev[legId]?.received ?? false,
        amount: prev[legId]?.amount ?? '',
        [field]: value,
        // Clear amount when unchecking
        ...(field === 'received' && !value ? { amount: '' } : {})
      }
    }));
  };

  const allSelected = activeLegs.length > 0 && selectedLegIds.size === activeLegs.length;

  const toggleLeg = (id: string) => {
    setSelectedLegIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedLegIds(new Set());
    } else {
      setSelectedLegIds(new Set(activeLegs.map(l => l.id)));
    }
  };

  const selectedTotal = useMemo(
    () => activeLegs.filter(l => selectedLegIds.has(l.id)).reduce((s, l) => s + (Number(l.ticketCost) || 0), 0),
    [activeLegs, selectedLegIds]
  );

  const totalRefund = useMemo(
    () => Object.entries(refundData)
      .filter(([id, d]) => selectedLegIds.has(id) && d.received && d.amount)
      .reduce((s, [, d]) => s + (parseFloat(d.amount) || 0), 0),
    [refundData, selectedLegIds]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    // For non-split (single ticket, no legs array), handle the simple case
    if (activeLegs.length === 0 && legs.length === 0) {
      // No legs — cancel the whole booking
      setIsSubmitting(true);
      try {
        const originalFare = request.ticketCost || 0;
        const { data: settingRow } = await supabase.from('meetup_settings').select('setting_value').eq('setting_key', 'policy_config').single();
        let policyData: any = settingRow?.setting_value || {};
        if (typeof policyData === 'string') {
          try { policyData = JSON.parse(policyData); } catch (e) {}
        }
        const ngCoverPercent = cancelledBy === 'Employee'
          ? (policyData?.cancellationEmpNgCover !== undefined ? Number(policyData.cancellationEmpNgCover) : 50)
          : (policyData?.cancellationPncNgCover !== undefined ? Number(policyData.cancellationPncNgCover) : 100);
        const empCoverPercent = cancelledBy === 'Employee'
          ? (policyData?.cancellationEmpEmpCover !== undefined ? Number(policyData.cancellationEmpEmpCover) : 50)
          : (policyData?.cancellationPncEmpCover !== undefined ? Number(policyData.cancellationPncEmpCover) : 0);

        const newPncStatus = cancelledBy === 'Employee' ? PNCStatus.CANCELLED_BY_EMPLOYEE : PNCStatus.CANCELLED_BY_PNC;
        const newTimeline = [
          ...(request.timeline || []),
          {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            actor: role === UserRole.EMPLOYEE ? (request.requesterName || 'Employee') : 'PNC',
            event: `Ticket Cancelled (${cancelledBy})`,
            details: reason
          }
        ];

        const split = calculateCancellationSplit(
          originalFare,
          [],
          ngCoverPercent,
          empCoverPercent
        );

        const { error: cancelError } = await supabase.from('cancellation_records').insert({
          travel_request_id: request.id,
          leg_id: null,
          cancelled_by: cancelledBy,
          cancellation_date: new Date().toISOString(),
          policy_navgurukul_cover_percent: ngCoverPercent,
          policy_employee_cover_percent: empCoverPercent,
          original_fare: originalFare,
          net_unrecovered_amount: split.netUnrecoveredAmount,
          employee_owed_amount: split.employeeOwedAmount,
          org_absorbed_amount: split.orgAbsorbedAmount,
          status: 'Pending Refund',
          advance_id: request.advanceId || null
        });
        if (cancelError) throw cancelError;

        // Update travel_requests in database
        await supabase.from('travel_requests').update({
          pnc_status: newPncStatus,
          booking_status: 'Cancelled',
          cancelled_reason: reason,
          status_change_reason: reason,
          timeline: newTimeline,
          updated_at: new Date().toISOString()
        }).eq('id', request.id);

        toast.success('Cancellation processed successfully');
        onSuccess();
      } catch (error: any) {
        console.error(error);
        toast.error('Failed to process cancellation: ' + error.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (selectedLegIds.size === 0) {
      toast.error('Please select at least one leg to cancel');
      return;
    }

    setIsSubmitting(true);

    try {
      // Fetch active policy once
      const { data: settingRow } = await supabase.from('meetup_settings').select('setting_value').eq('setting_key', 'policy_config').single();
      let policyData: any = settingRow?.setting_value || {};
      if (typeof policyData === 'string') {
        try { policyData = JSON.parse(policyData); } catch (e) {}
      }

      const ngCoverPercent = cancelledBy === 'Employee'
        ? (policyData?.cancellationEmpNgCover !== undefined ? Number(policyData.cancellationEmpNgCover) : 50)
        : (policyData?.cancellationPncNgCover !== undefined ? Number(policyData.cancellationPncNgCover) : 100);

      const empCoverPercent = cancelledBy === 'Employee'
        ? (policyData?.cancellationEmpEmpCover !== undefined ? Number(policyData.cancellationEmpEmpCover) : 50)
        : (policyData?.cancellationPncEmpCover !== undefined ? Number(policyData.cancellationPncEmpCover) : 0);

      // Create one cancellation record per selected leg
      const selectedLegs = activeLegs.filter(l => selectedLegIds.has(l.id));
      const records = selectedLegs.map(leg => {
        const legRefund = refundData[leg.id];
        const refundAmt = (legRefund?.received && legRefund?.amount) ? parseFloat(legRefund.amount) || 0 : 0;
        const refundEntries = refundAmt > 0 ? [{ amount: refundAmt } as any] : [];

        const split = calculateCancellationSplit(
          leg.ticketCost,
          refundEntries,
          ngCoverPercent,
          empCoverPercent
        );

        return {
          travel_request_id: request.id,
          leg_id: leg.id,
          cancelled_by: cancelledBy,
          cancellation_date: new Date().toISOString(),
          policy_navgurukul_cover_percent: ngCoverPercent,
          policy_employee_cover_percent: empCoverPercent,
          original_fare: leg.ticketCost,
          net_unrecovered_amount: split.netUnrecoveredAmount,
          employee_owed_amount: split.employeeOwedAmount,
          org_absorbed_amount: split.orgAbsorbedAmount,
          status: split.netUnrecoveredAmount === 0 ? 'Fully Refunded' : refundAmt > 0 ? 'Partially Refunded' : 'Pending Refund',
          advance_id: leg.advanceId || request.advanceId || null
        };
      });

      const { error: cancelError } = await supabase.from('cancellation_records').insert(records);
      if (cancelError) throw cancelError;

      // Update split_tickets JSONB array in travel_requests table
      const updatedLegs = legs.map(leg => {
        if (selectedLegIds.has(leg.id)) {
          return {
            ...leg,
            status: 'Cancelled',
            cancelledBy: cancelledBy,
            cancellationReason: reason,
            cancelledAt: new Date().toISOString()
          };
        }
        return leg;
      });

      const allLegsCancelled = updatedLegs.every(l => l.status === 'Cancelled');
      const newPncStatus = allLegsCancelled
        ? (cancelledBy === 'Employee' ? PNCStatus.CANCELLED_BY_EMPLOYEE : PNCStatus.CANCELLED_BY_PNC)
        : PNCStatus.BOOKED;
      const newBookingStatus = allLegsCancelled ? 'Cancelled' : 'Partially Cancelled';

      const updatedTimeline = [
        ...(request.timeline || []),
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          actor: role === UserRole.EMPLOYEE ? (request.requesterName || 'Employee') : 'PNC',
          event: `Leg(s) Cancelled (${cancelledBy})`,
          details: `${selectedLegs.length} leg(s) cancelled. Reason: ${reason}`
        }
      ];

      const { error: updateError } = await supabase.from('travel_requests').update({
        pnc_status: newPncStatus,
        booking_status: newBookingStatus,
        cancelled_reason: reason,
        status_change_reason: reason,
        split_tickets: updatedLegs,
        timeline: updatedTimeline,
        updated_at: new Date().toISOString()
      }).eq('id', request.id);

      if (updateError) throw updateError;

      toast.success(`${selectedLegs.length} leg${selectedLegs.length > 1 ? 's' : ''} cancelled successfully`);
      onSuccess();
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to process cancellation: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Fixed header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Process Cancellation</h3>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form id="cancellation-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Leg Checklist */}
            {activeLegs.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                  Select Legs to Cancel
                </label>
                <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden">
                  {/* Select All header */}
                  {activeLegs.length > 1 && (
                    <label className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b-2 border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </span>
                      <span className="ml-auto text-xs font-bold text-slate-400">
                        {selectedLegIds.size} of {activeLegs.length}
                      </span>
                    </label>
                  )}

                  {/* Individual legs */}
                  {activeLegs.map((leg, idx) => {
                    const isSelected = selectedLegIds.has(leg.id);
                    const legRefund = refundData[leg.id];
                    return (
                      <div
                        key={leg.id}
                        className={`${idx < activeLegs.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}
                          ${isSelected
                            ? 'bg-rose-50 dark:bg-rose-900/10'
                            : 'bg-white dark:bg-slate-900'
                          }`}
                      >
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          {/* Cancel checkbox + route info */}
                          <label className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleLeg(leg.id)}
                              className="w-4 h-4 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <p className={`text-sm font-bold truncate ${isSelected ? 'text-rose-700 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                <i className={`fa-solid ${leg.travelMode === 'Flight' ? 'fa-plane' : leg.travelMode === 'Train' ? 'fa-train' : 'fa-bus'} mr-1.5 text-xs opacity-60`}></i>
                                {leg.fromLocation} → {leg.toLocation}
                              </p>
                              {leg.vendorName && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{leg.vendorName}</p>
                              )}
                            </div>
                          </label>

                          {/* Fare */}
                          <span className={`text-sm font-black tabular-nums whitespace-nowrap shrink-0 ${isSelected ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                            ₹{Number(leg.ticketCost).toLocaleString()}
                          </span>

                          {/* Inline refund controls (visible when selected) */}
                          {isSelected && (
                            <div className="flex items-center gap-2 shrink-0 ml-2 pl-3 border-l-2 border-rose-200 dark:border-rose-800/40">
                              <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={legRefund?.received || false}
                                  onChange={e => updateRefund(leg.id, 'received', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  Refund
                                </span>
                              </label>

                              {legRefund?.received && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-400">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={leg.ticketCost}
                                    step="0.01"
                                    placeholder="Amt"
                                    value={legRefund.amount}
                                    onChange={e => updateRefund(leg.id, 'amount', e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    className="w-24 h-7 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-md px-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 focus:border-emerald-500 outline-none tabular-nums"
                                  />
                                  {legRefund.amount && parseFloat(legRefund.amount) > 0 && (
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                      parseFloat(legRefund.amount) >= leg.ticketCost
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    }`}>
                                      {parseFloat(legRefund.amount) >= leg.ticketCost ? 'Full' : 'Partial'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Summary footer */}
                  {selectedLegIds.size > 0 && (
                    <div className="px-4 py-2.5 bg-rose-50 dark:bg-rose-900/15 border-t-2 border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">
                          Cancellation Total
                        </span>
                        <span className="text-base font-black text-rose-600 dark:text-rose-400 tabular-nums">
                          ₹{selectedTotal.toLocaleString()}
                        </span>
                      </div>
                      {totalRefund > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                            <i className="fa-solid fa-arrow-rotate-left mr-1 opacity-60"></i>
                            Refund Received
                          </span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            − ₹{totalRefund.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {totalRefund > 0 && (
                        <div className="flex justify-between items-center pt-1 border-t border-rose-200 dark:border-rose-800/30">
                          <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                            Net Loss
                          </span>
                          <span className="text-base font-black text-slate-800 dark:text-slate-200 tabular-nums">
                            ₹{Math.max(0, selectedTotal - totalRefund).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Cancelled By (Fault)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancelledBy('Employee')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold border-2 transition-all ${cancelledBy === 'Employee' ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-900/20' : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700'}`}
                >
                  Employee
                </button>
                <button
                  type="button"
                  onClick={() => setCancelledBy('Org')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold border-2 transition-all ${cancelledBy === 'Org' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20' : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700'}`}
                >
                  Organization
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Reason</label>
              <textarea
                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-medium focus:border-indigo-500 outline-none resize-none"
                rows={2}
                placeholder="Why is this ticket being cancelled?"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
          </form>
        </div>

        {/* Sticky footer with buttons */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              Go Back
            </button>
            <button
              type="submit"
              form="cancellation-form"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-200 dark:shadow-none transition-all disabled:opacity-50"
            >
              {isSubmitting
                ? 'Processing...'
                : selectedLegIds.size > 1
                  ? `Cancel ${selectedLegIds.size} Legs`
                  : 'Confirm Cancellation'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancellationModal;
