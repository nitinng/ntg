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
  const [refundingRecord, setRefundingRecord] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
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
        travel_requests ( submission_id, purpose ),
        travel_legs ( from_location, to_location, travel_mode )
      `)
      .order('cancellation_date', { ascending: false });

    if (currentUser.role === UserRole.EMPLOYEE) {
      // Employees only see their own cancellations (enforced by RLS as well)
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load cancellations');
      console.error(error);
    } else {
      // Fetch active policy to sync any records that were created with stale defaults
      const { data: settingRow } = await supabase
        .from('meetup_settings')
        .select('setting_value')
        .eq('setting_key', 'policy_config')
        .single();
        
      let policyData: any = settingRow?.setting_value || {};
      if (typeof policyData === 'string') {
        try { policyData = JSON.parse(policyData); } catch (e) {}
      }

      const empNg = policyData?.cancellationEmpNgCover !== undefined ? Number(policyData.cancellationEmpNgCover) : 50;
      const empEmp = policyData?.cancellationEmpEmpCover !== undefined ? Number(policyData.cancellationEmpEmpCover) : 50;
      const pncNg = policyData?.cancellationPncNgCover !== undefined ? Number(policyData.cancellationPncNgCover) : 100;
      const pncEmp = policyData?.cancellationPncEmpCover !== undefined ? Number(policyData.cancellationPncEmpCover) : 0;

      // Deduplicate redundant cancellation records created from previous re-submissions
      const uniqueRecordsRaw: any[] = [];
      const seenKeys = new Set<string>();
      const duplicateIdsToDelete: string[] = [];

      for (const record of data || []) {
        const key = record.leg_id
          ? `${record.travel_request_id}_${record.leg_id}`
          : `${record.travel_request_id}_${record.original_fare}`;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueRecordsRaw.push(record);
        } else {
          duplicateIdsToDelete.push(record.id);
        }
      }

      if (duplicateIdsToDelete.length > 0) {
        // Clean up duplicate rows from database in background
        supabase.from('cancellation_records').delete().in('id', duplicateIdsToDelete).then(({ error: delErr }) => {
          if (delErr) console.error("Error cleaning up duplicate cancellation records:", delErr);
        });
      }

      const processedRecords = await Promise.all(uniqueRecordsRaw.map(async (record: any) => {
        const isEmpCancelled = (record.cancelled_by || 'Employee') === 'Employee';
        const targetEmpPercent = isEmpCancelled ? empEmp : pncEmp;
        const targetNgPercent = isEmpCancelled ? empNg : pncNg;

        if (record.policy_employee_cover_percent !== targetEmpPercent || record.policy_navgurukul_cover_percent !== targetNgPercent) {
          const netUnrecovered = Number(record.net_unrecovered_amount || 0);
          const newOwed = (netUnrecovered * targetEmpPercent) / 100;
          const newAbsorbed = (netUnrecovered * targetNgPercent) / 100;

          // Sync to database
          await supabase.from('cancellation_records').update({
            policy_employee_cover_percent: targetEmpPercent,
            policy_navgurukul_cover_percent: targetNgPercent,
            employee_owed_amount: newOwed,
            org_absorbed_amount: newAbsorbed
          }).eq('id', record.id);

          return {
            ...record,
            policy_employee_cover_percent: targetEmpPercent,
            policy_navgurukul_cover_percent: targetNgPercent,
            employee_owed_amount: newOwed,
            org_absorbed_amount: newAbsorbed
          };
        }
        return record;
      }));

      setCancellations(processedRecords);
    }
    setLoading(false);
  };


  const handleLogRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingRecord || !refundAmount || isNaN(Number(refundAmount))) return;
    setIsSubmitting(true);
    
    try {
      const amount = Number(refundAmount);
      
      // 1. Fetch existing refunds to calculate new split
      const { data: existingRefunds } = await supabase
        .from('refund_entries')
        .select('*')
        .eq('cancellation_record_id', refundingRecord.id);
        
      const allRefunds = [...(existingRefunds || []), { amount }];
      
      // 2. Calculate new splits
      const split = calculateCancellationSplit(
        refundingRecord.original_fare,
        allRefunds as RefundEntry[],
        refundingRecord.policy_navgurukul_cover_percent,
        refundingRecord.policy_employee_cover_percent
      );
      
      // 3. Update Cancellation Record
      await supabase.from('cancellation_records').update({
        net_unrecovered_amount: split.netUnrecoveredAmount,
        employee_owed_amount: split.employeeOwedAmount,
        org_absorbed_amount: split.orgAbsorbedAmount,
        status: split.netUnrecoveredAmount === 0 ? 'Fully Refunded' : 'Partially Refunded'
      }).eq('id', refundingRecord.id);
      
      // 4. Insert Refund Entry
      await supabase.from('refund_entries').insert({
        cancellation_record_id: refundingRecord.id,
        amount,
        date_received: new Date().toISOString()
      });
      
      // 5. Check if we need to apply to advance
      if (refundingRecord.travel_legs?.advance_id) {
        await applyRefundToAdvance(
          refundingRecord.travel_legs.advance_id,
          amount,
          currentUser?.email || 'System',
          refundingRecord.travel_request_id,
          refundingRecord.travel_requests?.submission_id
        );
      }
      
      toast.success('Refund logged successfully!');
      setRefundingRecord(null);
      setRefundAmount('');
      fetchCancellations();
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to log refund: ' + error.message);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cancellations.map(cancel => (
          <Card key={cancel.id} className="p-5 flex flex-col h-full">
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
                <p className="text-xs font-bold text-slate-500">Owed by Employee</p>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400">
                  ₹{Number(cancel.employee_owed_amount || 0).toLocaleString()}
                </p>
              </div>
            </div>
            
            <div className="space-y-2 mb-4 flex-grow">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {cancel.travel_requests?.submission_id || 'Unknown Request'}
              </p>
              {cancel.travel_legs && (
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {cancel.travel_legs.from_location} → {cancel.travel_legs.to_location}
                </p>
              )}

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
            {(currentUser?.role === UserRole.PNC || currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.FINANCE) && cancel.status !== 'Fully Refunded' && (
              <button 
                onClick={() => setRefundingRecord(cancel)}
                className="w-full mt-2 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Log Refund
              </button>
            )}
          </Card>
        ))}
        {cancellations.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 font-medium bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            No cancellation records found.
          </div>
        )}
      </div>

      {refundingRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-4">Log Refund</h3>
              <p className="text-sm text-slate-500 mb-6">Enter the refund amount received from the vendor for ticket {refundingRecord.travel_requests?.submission_id}.</p>
              <form onSubmit={handleLogRefund} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    className="w-full h-10 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 font-medium text-sm focus:border-indigo-500 outline-none"
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                    required
                    max={refundingRecord.net_unrecovered_amount}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setRefundingRecord(null)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">Save</button>
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
