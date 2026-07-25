import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Advance, AdvanceChangelogEntry, User, UserRole } from '../types';
import Card from './Card';
import Input from './Input';
import TextArea from './TextArea';
import { toast } from 'sonner';

interface AdvanceManagementProps {
  currentUser: User | null;
  users: User[];
  onViewRequest?: (requestId: string) => void;
}

const AdvanceManagement: React.FC<AdvanceManagementProps> = ({ currentUser, users, onViewRequest }) => {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [advanceToSettle, setAdvanceToSettle] = useState<Advance | null>(null);
  const [selectedAdvance, setSelectedAdvance] = useState<Advance | null>(null);
  const [formData, setFormData] = useState({
    amount_received: '',
    amount_left: '',
    received_from: '',
    received_by: '',
    received_on: new Date().toISOString().split('T')[0],
    receipt_id: '',
    comments: ''
  });

  const [exportFilters, setExportFilters] = useState({
    startDate: '',
    endDate: '',
    status: 'all' // 'all', 'active', 'settled'
  });

  useEffect(() => {
    fetchAdvances();
  }, []);

  const fetchAdvances = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('advances')
      .select('*')
      .order('received_on', { ascending: false });

    if (error) {
      toast.error('Failed to load advances');
      console.error(error);
    } else {
      setAdvances(data || []);
    }
    setLoading(false);
  };

  const handleOpenModal = (advance?: Advance) => {
    if (advance) {
      setSelectedAdvance(advance);
      setFormData({
        amount_received: advance.amount_received.toString(),
        amount_left: advance.amount_left.toString(),
        received_from: advance.received_from,
        received_by: advance.received_by || '',
        received_on: advance.received_on,
        receipt_id: advance.receipt_id || '',
        comments: advance.comments || ''
      });
    } else {
      setSelectedAdvance(null);
      setFormData({
        amount_received: '',
        amount_left: '',
        received_from: '',
        received_by: '',
        received_on: new Date().toISOString().split('T')[0],
        receipt_id: '',
        comments: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAdvance(null);
  };

  const handleOpenHistory = (advance: Advance) => {
    setSelectedAdvance(advance);
    setIsHistoryModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const newChangelogEntry: AdvanceChangelogEntry = {
      timestamp: new Date().toISOString(),
      user: currentUser.name || currentUser.email,
      action: selectedAdvance ? 'Edited' : 'Created',
      details: selectedAdvance
        ? 'Updated advance details.'
        : 'Initial entry created.'
    };

    const payload: any = {
      amount_received: Number(formData.amount_received),
      received_from: formData.received_from,
      received_by: formData.received_by || null,
      received_on: formData.received_on,
      receipt_id: formData.receipt_id || null,
      comments: formData.comments || null,
    };

    if (selectedAdvance) {
      const { error } = await supabase
        .from('advances')
        .update({
          ...payload,
          changelog: [...(selectedAdvance.changelog || []), newChangelogEntry],
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedAdvance.id);

      if (error) {
        toast.error('Failed to update advance');
      } else {
        toast.success('Advance updated successfully');
        fetchAdvances();
        handleCloseModal();
      }
    } else {
      const { error } = await supabase
        .from('advances')
        .insert([{
          ...payload,
          amount_left: Number(formData.amount_received),
          changelog: [newChangelogEntry]
        }]);

      if (error) {
        toast.error('Failed to add advance');
      } else {
        toast.success('Advance added successfully');
        fetchAdvances();
        handleCloseModal();
      }
    }
  };

  const confirmSettleAdvance = (adv: Advance) => {
    setAdvanceToSettle(adv);
  };

  const executeSettleAdvance = async () => {
    if (!advanceToSettle) return;

    const { error } = await supabase
      .from('advances')
      .update({ is_settled: true })
      .eq('id', advanceToSettle.id);
    
    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success('Advance marked as Settled');
      fetchAdvances();
    }
    setAdvanceToSettle(null);
  };

  const handleExportReconciliation = () => {
    // 1. Filter advances
    let filtered = advances;
    
    if (exportFilters.startDate) {
      filtered = filtered.filter(a => new Date(a.received_on) >= new Date(exportFilters.startDate));
    }
    if (exportFilters.endDate) {
      filtered = filtered.filter(a => new Date(a.received_on) <= new Date(exportFilters.endDate));
    }
    if (exportFilters.status === 'active') {
      filtered = filtered.filter(a => !a.is_settled);
    } else if (exportFilters.status === 'settled') {
      filtered = filtered.filter(a => a.is_settled);
    }

    if (filtered.length === 0) {
      toast.error('No advances found matching these filters.');
      return;
    }

    // 2. Generate CSV
    const headers = [
      'Advance ID',
      'Date Received',
      'Received From',
      'Received By',
      'Total Advance (Rs)',
      'Total Spent (Rs)',
      'Remaining Balance (Rs)',
      'Status',
      'Expense Date',
      'Ticket ID',
      'Expense Amount (Rs)',
      'Expense Details'
    ];

    const rows: string[][] = [];

    filtered.forEach(adv => {
      const receivedBy = users.find(u => u.id === adv.received_by)?.name || 'Unknown';
      const totalSpent = adv.amount_received - adv.amount_left;
      const status = adv.is_settled ? 'Settled' : 'Active';

      const baseRow = [
        adv.advance_code || adv.id,
        new Date(adv.received_on).toLocaleDateString(),
        adv.received_from,
        receivedBy,
        adv.amount_received.toString(),
        totalSpent.toString(),
        adv.amount_left.toString(),
        status
      ];

      // Extract ticket purchase expenses
      const expenses = adv.changelog?.filter(entry => entry.action === 'Ticket Purchased') || [];

      if (expenses.length === 0) {
        // Just advance details, no expenses
        rows.push([...baseRow, '', '', '', '']);
      } else {
        // One row per expense
        expenses.forEach(exp => {
          // Attempt to extract amount from details e.g. "purchased for Rs500" or similar
          // Alternatively, we calculate it if we stored it, but we can just put it in details,
          // wait, we have `cost` in the changelog details string: "purchased for ₹1000"
          const match = exp.details.match(/for ₹([0-9.]+)/);
          const amount = match ? match[1] : '';
          
          rows.push([
            ...baseRow,
            new Date(exp.timestamp).toLocaleDateString(),
            exp.relatedTicketSubmissionId || exp.relatedTicketId || '',
            amount,
            exp.details
          ]);
        });
      }
    });

    // 3. Download
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reconciliation_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsExportModalOpen(false);
    toast.success('Report exported successfully');
  };

  const totalAdvances = advances.length;
  const amountReceived = advances.reduce((sum, adv) => sum + adv.amount_received, 0);
  const amountSpent = advances.reduce((sum, adv) => sum + (adv.amount_received - adv.amount_left), 0);
  const amountSettled = advances.filter(adv => adv.is_settled).reduce((sum, adv) => sum + adv.amount_received, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Advances</h2>
          <p className="text-slate-500 text-sm mt-1">Manage funds received from Finance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <i className="fa-solid fa-file-csv"></i> Export Report
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            <i className="fa-solid fa-plus"></i> Add Advance
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <i className="fa-solid fa-list-ol text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Advances Taken</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{totalAdvances}</p>
          </div>
        </Card>
        
        <Card className="p-5 flex items-center gap-4 border-emerald-200 dark:border-emerald-900/50">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <i className="fa-solid fa-arrow-down text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Received</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">₹{amountReceived.toLocaleString()}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-rose-200 dark:border-rose-900/50">
          <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <i className="fa-solid fa-arrow-up text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Spent</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">₹{amountSpent.toLocaleString()}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-blue-200 dark:border-blue-900/50">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <i className="fa-solid fa-check-double text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Settled</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">₹{amountSettled.toLocaleString()}</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-black uppercase text-xs tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4">Received On</th>
                <th className="px-6 py-4">From</th>
                <th className="px-6 py-4">To (PNC)</th>
                <th className="px-6 py-4">Amount Received</th>
                <th className="px-6 py-4">Amount Left</th>
                <th className="px-6 py-4">Receipt ID</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>Loading advances...</p>
                  </td>
                </tr>
              ) : advances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <i className="fa-solid fa-wallet text-3xl mb-3 text-slate-300 dark:text-slate-600"></i>
                    <p className="font-medium text-slate-400 uppercase tracking-widest text-xs">No advances recorded</p>
                  </td>
                </tr>
              ) : (
                advances.map(adv => (
                  <tr key={adv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      {new Date(adv.received_on).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-300">
                      {adv.received_from}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">
                      {adv.advance_code || adv.id.substring(0,8)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        ₹{adv.amount_received.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold">
                      <span className={`px-2.5 py-1 rounded-md text-xs border ${adv.amount_left > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50'}`}>
                        ₹{adv.amount_left.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      {adv.receipt_id || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${adv.is_settled ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50'}`}>
                        {adv.is_settled ? 'Settled' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {!adv.is_settled && (
                        <button
                          onClick={() => confirmSettleAdvance(adv)}
                          className="p-2 rounded-lg transition-colors tooltip-trigger text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          title="Mark as Settled"
                        >
                          <i className="fa-solid fa-check-double"></i>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenHistory(adv)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors tooltip-trigger"
                        title="View History"
                      >
                        <i className="fa-solid fa-clock-rotate-left"></i>
                      </button>
                      <button
                        onClick={() => handleOpenModal(adv)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors tooltip-trigger"
                        title="Edit Advance"
                      >
                        <i className="fa-solid fa-pen-to-square"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {selectedAdvance ? 'Edit Advance' : 'Add New Advance'}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Amount Received (₹)"
                  type="number"
                  required
                  value={formData.amount_received}
                  onChange={(e) => setFormData({ ...formData, amount_received: e.target.value })}
                  placeholder="e.g. 50000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Received From"
                  type="text"
                  required
                  value={formData.received_from}
                  onChange={(e) => setFormData({ ...formData, received_from: e.target.value })}
                  placeholder="e.g. Finance Team"
                />
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Received By (PNC)</label>
                  <select
                    required
                    className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                    value={formData.received_by}
                    onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
                  >
                    <option value="">Select PNC User</option>
                    {users.filter(u => u.role === UserRole.PNC || u.role === UserRole.ADMIN).map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Received On"
                  type="date"
                  required
                  value={formData.received_on}
                  onChange={(e) => setFormData({ ...formData, received_on: e.target.value })}
                />
                <Input
                  label="Receipt / Transaction ID (Optional)"
                  type="text"
                  value={formData.receipt_id}
                  onChange={(e) => setFormData({ ...formData, receipt_id: e.target.value })}
                  placeholder="e.g. TXN-12345"
                />
              </div>

              <TextArea
                label="Comments (Optional)"
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                placeholder="Add any relevant notes..."
                rows={3}
              />

              <div className="pt-4 flex justify-end gap-3 border-t dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all"
                >
                  {selectedAdvance ? 'Save Changes' : 'Add Advance'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && selectedAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-indigo-600"></i> History: {selectedAdvance.advance_code || selectedAdvance.id.substring(0,8)}
                </h3>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {(!selectedAdvance.changelog || selectedAdvance.changelog.length === 0) ? (
                <div className="text-center py-8 text-slate-500">
                  <p>No history available for this record.</p>
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-700 before:to-transparent">
                  {selectedAdvance.changelog.map((entry, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      {/* Timeline Dot */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-slate-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${entry.action === 'Created' ? 'bg-emerald-500' : entry.action === 'Ticket Purchased' ? 'bg-rose-500' : 'bg-indigo-500'}`}>
                        <i className={`fa-solid ${entry.action === 'Created' ? 'fa-plus' : entry.action === 'Ticket Purchased' ? 'fa-ticket' : 'fa-pen'} text-white text-xs`}></i>
                      </div>
                      
                      {/* Content Card */}
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm group-hover:border-indigo-300 dark:group-hover:border-indigo-700 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{entry.action}</span>
                          <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">by {entry.user}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                          {entry.details}
                        </p>
                        
                        {entry.relatedTicketId && entry.relatedTicketSubmissionId && (
                          <div 
                            onClick={() => {
                              if (onViewRequest) onViewRequest(entry.relatedTicketId!);
                            }}
                            className="mt-3 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-between cursor-pointer group/card"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 flex items-center justify-center">
                                <i className="fa-solid fa-plane-departure text-xs"></i>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">Ticket {entry.relatedTicketSubmissionId}</p>
                                <p className="text-2xs text-slate-500 font-medium">Click to view details</p>
                              </div>
                            </div>
                            <i className="fa-solid fa-arrow-right text-indigo-400 group-hover/card:text-indigo-600 group-hover/card:-translate-x-1 transition-all"></i>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Settle Confirmation Modal */}
      {advanceToSettle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 mx-auto flex items-center justify-center mb-4">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Mark as Settled?</h3>
            <p className="text-slate-500 text-sm mb-6">
              Are you sure you want to mark this advance (₹{advanceToSettle.amount_received.toLocaleString()}) as settled? 
              This will remove it from the active advances list for any future ticket purchases. 
              <strong>This action cannot be undone.</strong>
            </p>
            <div className="flex justify-center gap-3">
              <button 
                onClick={() => setAdvanceToSettle(null)}
                className="px-6 py-2.5 rounded-lg font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeSettleAdvance}
                className="px-6 py-2.5 rounded-lg font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 transition-all"
              >
                Yes, mark settled
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Export Reconciliation Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fa-solid fa-file-export text-indigo-600"></i> Export Report
              </h3>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Start Date (Optional)</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                    value={exportFilters.startDate}
                    onChange={e => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">End Date (Optional)</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                    value={exportFilters.endDate}
                    onChange={e => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Status</label>
                  <div className="relative">
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all appearance-none cursor-pointer"
                      value={exportFilters.status}
                      onChange={e => setExportFilters({ ...exportFilters, status: e.target.value })}
                    >
                      <option value="all">All Advances (Active & Settled)</option>
                      <option value="active">Active Only</option>
                      <option value="settled">Settled Only</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <i className="fa-solid fa-chevron-down text-xs"></i>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 flex items-start gap-3 border border-indigo-100 dark:border-indigo-800/30">
                <i className="fa-solid fa-circle-info text-indigo-600 mt-0.5"></i>
                <p className="text-xs text-indigo-800 dark:text-indigo-300 font-medium">
                  The exported CSV will flatten the data, showing one row per ticket purchase alongside its associated advance details. This format is optimized for reconciliation in Excel.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleExportReconciliation}
                  className="px-5 py-2.5 rounded-lg font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all flex items-center gap-2"
                >
                  <i className="fa-solid fa-download"></i> Download CSV
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdvanceManagement;
