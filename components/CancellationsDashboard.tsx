import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CancellationRecord, User, UserRole, RefundEntry } from '../types';
import Card from './Card';
import { toast } from 'sonner';
import { calculateCancellationSplit, applyRefundToAdvance } from '../utils/cancellation';

interface CancellationsDashboardProps {
  currentUser: User | null;
}

const CancellationsDashboard: React.FC<CancellationsDashboardProps> = ({ currentUser }) => {
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingRecord, setSettlingRecord] = useState<any | null>(null);
  const [vendorRefund, setVendorRefund] = useState<string>('');
  const [employeePayment, setEmployeePayment] = useState<string>('');
  const [settleStatus, setSettleStatus] = useState<string>('Reconciled');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCancellations();
  }, [currentUser]);

  const fetchCancellations = async () => {
    if (!currentUser) return;
    setLoading(true);

    let query = supabase
      .from('cancellation_records')
      .select(`
        *,
        travel_requests ( submission_id, purpose, split_tickets, advance_id, requester_name )
      `)
      .order('cancellation_date', { ascending: false });

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load cancellations');
      console.error(error);
    } else {
      setCancellations(data || []);
    }
    setLoading(false);
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingRecord) return;
    setIsSubmitting(true);

    try {
      const vRefund = Number(vendorRefund) || 0;
      const empPaid = Number(employeePayment) || 0;
      const totalRecovered = vRefund + empPaid;

      // 1. Calculate new splits
      const newNetUnrecovered = Math.max(0, settlingRecord.original_fare - vRefund);
      const newOrgAbsorbed = Math.max(0, settlingRecord.original_fare - vRefund - empPaid);
      const newEmployeeOwed = settleStatus === 'Pending Refund'
        ? Math.max(0, newNetUnrecovered - newOrgAbsorbed)
        : 0;

      // 2. Update Cancellation Record
      const { error: cancelError } = await supabase.from('cancellation_records').update({
        net_unrecovered_amount: newNetUnrecovered,
        employee_owed_amount: newEmployeeOwed,
        org_absorbed_amount: newOrgAbsorbed,
        status: settleStatus
      }).eq('id', settlingRecord.id);

      if (cancelError) throw cancelError;

      // 3. Insert Refund Entry
      if (totalRecovered > 0) {
        const { error: refundError } = await supabase.from('refund_entries').insert({
          cancellation_record_id: settlingRecord.id,
          amount: totalRecovered,
          date_received: new Date().toISOString(),
          notes: notes || `Settle cancellation. Vendor: ₹${vRefund}, Employee: ₹${empPaid}.`
        });
        if (refundError) throw refundError;
      }

      // 4. Apply refund to advance
      const advId = settlingRecord.advance_id || settlingRecord.travel_requests?.advance_id;
      if (advId && totalRecovered > 0) {
        await applyRefundToAdvance(
          advId,
          totalRecovered,
          currentUser?.email || 'System',
          settlingRecord.travel_request_id,
          settlingRecord.travel_requests?.submission_id
        );
      }

      toast.success('Cancellation settled successfully!');
      setSettlingRecord(null);
      setVendorRefund('');
      setEmployeePayment('');
      setSettleStatus('Reconciled');
      setNotes('');
      fetchCancellations();
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to settle cancellation: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Pending Refund': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
      case 'Partially Refunded': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      case 'Fully Refunded': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      case 'Written Off': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800';
      case 'Reconciled': return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800';
      case 'Disputed': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const getLegDetails = (cancel: any) => {
    if (!cancel.leg_id) return null;
    const legs = cancel.travel_requests?.split_tickets;
    if (Array.isArray(legs)) {
      const leg = legs.find((l: any) => l.id === cancel.leg_id);
      if (leg) {
        return {
          fromLocation: leg.fromLocation || leg.origin || '',
          toLocation: leg.toLocation || leg.destination || '',
          travelMode: leg.travelMode || leg.travel_mode || ''
        };
      }
    }
    return null;
  };

  const groupedCancellations = React.useMemo(() => {
    const groups: { [employeeName: string]: { [ticketId: string]: any[] } } = {};

    cancellations.forEach(cancel => {
      const empName = cancel.travel_requests?.requester_name || 'Unknown Employee';
      const ticketId = cancel.travel_requests?.submission_id || cancel.travel_request_id || 'Unknown Ticket';

      if (!groups[empName]) {
        groups[empName] = {};
      }
      if (!groups[empName][ticketId]) {
        groups[empName][ticketId] = [];
      }
      groups[empName][ticketId].push(cancel);
    });

    return groups;
  }, [cancellations]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading cancellations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Cancellations</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Track cancellation refunds and reconciliation.</p>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(groupedCancellations).map(([employeeName, tickets]) => (
          <div key={employeeName} className="space-y-4 bg-slate-50/50 dark:bg-slate-900/30 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
            <div className="flex justify-between items-center pb-2 border-b border-slate-250 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                <i className="fa-solid fa-user text-indigo-500"></i> {employeeName}
              </h3>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {Object.keys(tickets).length} Booking(s)
              </span>
            </div>

            <div className="space-y-6">
              {Object.entries(tickets).map(([ticketId, records]) => (
                <div key={ticketId} className="space-y-3">
                  <div className="flex items-center gap-2 pl-1">
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-2.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30">
                      Ticket ID: {ticketId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {records.map(cancel => (
                      <Card key={cancel.id} className="p-5 flex flex-col h-full border border-slate-200 dark:border-slate-800/80 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${getStatusColor(cancel.status)}`}>
                              {cancel.status}
                            </span>
                            <p className="text-xs font-bold text-slate-400 mt-2">
                              {new Date(cancel.cancellation_date).toLocaleDateString()} • Cancelled by <span className="text-slate-600 dark:text-slate-300">{cancel.cancelled_by || 'Employee'}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-500">Owed by {employeeName}</p>
                            <p className="text-xl font-black text-rose-600 dark:text-rose-400">
                              ₹{Number(cancel.employee_owed_amount || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-2 mb-4 flex-grow">
                          {(() => {
                            const legDetails = getLegDetails(cancel);
                            if (legDetails) {
                              return (
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-350">
                                  {legDetails.fromLocation} → {legDetails.toLocation} ({legDetails.travelMode})
                                </p>
                              );
                            }
                            return (
                              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 italic">
                                Full ticket cancellation
                              </p>
                            );
                          })()}

                          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t dark:border-slate-800">
                            <div>
                              <p className="text-xs font-bold text-slate-500">Original Fare</p>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">₹{Number(cancel.original_fare || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-500">Net Unrecovered</p>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">₹{Number(cancel.net_unrecovered_amount || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-500">Emp Split</p>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{cancel.policy_employee_cover_percent}%</p>
                            </div>
                          </div>
                        </div>
                        {(currentUser?.role === UserRole.PNC || currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.FINANCE) && 
                         cancel.status !== 'Fully Refunded' && 
                         cancel.status !== 'Reconciled' && 
                         cancel.status !== 'Written Off' && (
                          <button 
                            onClick={() => {
                              setSettlingRecord(cancel);
                              setSettleStatus('Reconciled');
                            }}
                            className="w-full mt-2 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
                          >
                            Settle
                          </button>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {cancellations.length === 0 && (
          <div className="py-12 text-center text-slate-500 font-medium bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            No cancellation records found.
          </div>
        )}
      </div>

      {settlingRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-4">Settle Cancellation</h3>
              <p className="text-sm text-slate-500 mb-6">Record refund amounts and settle ticket cancellation for {settlingRecord.travel_requests?.submission_id}.</p>
              <form onSubmit={handleSettle} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Vendor Refund (₹)</label>
                    <input
                      type="number"
                      className="w-full h-10 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 font-medium text-sm focus:border-indigo-500 outline-none"
                      value={vendorRefund}
                      onChange={e => setVendorRefund(e.target.value)}
                      placeholder="0"
                      min="0"
                      max={settlingRecord.original_fare}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Employee Payment (₹)</label>
                    <input
                      type="number"
                      className="w-full h-10 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 font-medium text-sm focus:border-indigo-500 outline-none"
                      value={employeePayment}
                      onChange={e => setEmployeePayment(e.target.value)}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Settlement Status</label>
                  <select
                    className="w-full h-10 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 font-medium text-sm focus:border-indigo-500 outline-none"
                    value={settleStatus}
                    onChange={e => setSettleStatus(e.target.value)}
                  >
                    <option value="Reconciled">Reconciled (Settled)</option>
                    <option value="Fully Refunded">Fully Refunded</option>
                    <option value="Written Off">Written Off</option>
                    <option value="Pending Refund">Pending Refund (Keep Active)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Notes / Audit Trail</label>
                  <textarea
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 font-medium text-sm focus:border-indigo-500 outline-none resize-none"
                    rows={3}
                    placeholder="Enter settlement notes or details..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => {
                    setSettlingRecord(null);
                    setVendorRefund('');
                    setEmployeePayment('');
                    setSettleStatus('Reconciled');
                    setNotes('');
                  }} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">Settle</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CancellationsDashboard;
