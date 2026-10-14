import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CreditCard, CreditCardChangelogEntry, User, UserRole } from '../types';
import Card from './Card';
import Input from './Input';
import PageBanner from './PageBanner';
import TextArea from './TextArea';
import { toast } from 'sonner';
import { reportSos } from '../utils/sos/raiseSos';

interface CreditCardManagementProps {
  currentUser: User | null;
  users: User[];
  onViewRequest?: (requestId: string) => void;
}

/** xxxx-xxxx-xxxx-1234 — we never hold more of the number than the tail. */
export const maskedCardNumber = (lastFour: string) => `xxxx-xxxx-xxxx-${lastFour || '____'}`;

/**
 * Credit cards, the twin of Advance Management. A card holds a sanctioned
 * balance that bookings draw down and refunds restore; unlike an advance, the
 * balance itself can be increased or reduced later, which is what the Adjust
 * Balance action records.
 */
const CreditCardManagement: React.FC<CreditCardManagementProps> = ({ currentUser, users, onViewRequest }) => {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [cardToDeactivate, setCardToDeactivate] = useState<CreditCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
  const [adjustingCard, setAdjustingCard] = useState<CreditCard | null>(null);
  const [adjustForm, setAdjustForm] = useState({ direction: 'increase', amount: '', reason: '' });
  const [isAdjusting, setIsAdjusting] = useState(false);

  const [formData, setFormData] = useState({
    last_four: '',
    bank_name: '',
    card_label: '',
    approver_name: '',
    approver_id: '',
    opening_balance: '',
    comments: ''
  });

  const [exportFilters, setExportFilters] = useState({
    startDate: '',
    endDate: '',
    status: 'all' // 'all', 'active', 'inactive'
  });

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load credit cards');
      reportSos('CREDIT_CARD_FETCH_FAILED', error, { screen: 'credit_card_management' });
    } else {
      setCards(data || []);
    }
    setLoading(false);
  };

  const handleOpenModal = (card?: CreditCard) => {
    if (card) {
      setSelectedCard(card);
      setFormData({
        last_four: card.last_four,
        bank_name: card.bank_name,
        card_label: card.card_label || '',
        approver_name: card.approver_name,
        approver_id: card.approver_id || '',
        opening_balance: card.opening_balance.toString(),
        comments: card.comments || ''
      });
    } else {
      setSelectedCard(null);
      setFormData({
        last_four: '',
        bank_name: '',
        card_label: '',
        approver_name: '',
        approver_id: '',
        opening_balance: '',
        comments: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCard(null);
  };

  const handleOpenHistory = (card: CreditCard) => {
    setSelectedCard(card);
    setIsHistoryModalOpen(true);
  };

  const handleApproverChange = (value: string) => {
    // The select carries a user id for staff, or the free-text sentinel for an
    // approver who has no account on the desk.
    if (value === '__other__') {
      setFormData({ ...formData, approver_id: '', approver_name: '' });
      return;
    }
    const picked = users.find(u => u.id === value);
    setFormData({
      ...formData,
      approver_id: value,
      approver_name: picked ? (picked.name || picked.email) : formData.approver_name
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!/^[0-9]{4}$/.test(formData.last_four)) {
      toast.error('Enter exactly the last 4 digits of the card number.');
      return;
    }
    if (!formData.approver_name.trim()) {
      toast.error('Please name the approver for this card.');
      return;
    }

    const openingBalance = Number(formData.opening_balance);
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error('Enter a valid opening balance.');
      return;
    }

    const payload: any = {
      last_four: formData.last_four,
      bank_name: formData.bank_name,
      card_label: formData.card_label || null,
      approver_name: formData.approver_name.trim(),
      approver_id: formData.approver_id || null,
      comments: formData.comments || null,
    };

    if (selectedCard) {
      // Editing details never silently moves money: the opening balance is
      // read-only here and changes only through Adjust Balance, which writes a
      // changelog entry and shifts the available balance with it.
      const newChangelogEntry: CreditCardChangelogEntry = {
        timestamp: new Date().toISOString(),
        user: currentUser.name || currentUser.email,
        action: 'Edited',
        details: 'Updated card details.'
      };

      const { error } = await supabase
        .from('credit_cards')
        .update({
          ...payload,
          changelog: [...(selectedCard.changelog || []), newChangelogEntry],
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCard.id);

      if (error) {
        toast.error('Failed to update credit card');
      } else {
        toast.success('Credit card updated successfully');
        fetchCards();
        handleCloseModal();
      }
    } else {
      const newChangelogEntry: CreditCardChangelogEntry = {
        timestamp: new Date().toISOString(),
        user: currentUser.name || currentUser.email,
        action: 'Created',
        details: `Card ${maskedCardNumber(formData.last_four)} (${formData.bank_name}) added with an opening balance of ₹${openingBalance.toLocaleString()}.`
      };

      const { error } = await supabase
        .from('credit_cards')
        .insert([{
          ...payload,
          opening_balance: openingBalance,
          amount_left: openingBalance,
          is_active: true,
          changelog: [newChangelogEntry]
        }]);

      if (error) {
        toast.error('Failed to add credit card');
      } else {
        toast.success('Credit card added successfully');
        fetchCards();
        handleCloseModal();
      }
    }
  };

  const handleOpenAdjust = (card: CreditCard) => {
    setAdjustingCard(card);
    setAdjustForm({ direction: 'increase', amount: '', reason: '' });
  };

  const executeAdjustBalance = async () => {
    if (!adjustingCard || !currentUser) return;

    const amount = Number(adjustForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter an amount greater than zero.');
      return;
    }

    const isIncrease = adjustForm.direction === 'increase';
    const delta = isIncrease ? amount : -amount;

    if (!isIncrease && amount > adjustingCard.amount_left) {
      toast.error(`Cannot reduce by ₹${amount.toLocaleString()} — only ₹${adjustingCard.amount_left.toLocaleString()} is unspent on this card.`);
      return;
    }

    const changelogEntry: CreditCardChangelogEntry = {
      timestamp: new Date().toISOString(),
      user: currentUser.name || currentUser.email,
      action: isIncrease ? 'Limit Increased' : 'Limit Reduced',
      details: `${isIncrease ? 'Increased' : 'Reduced'} card balance by ₹${amount.toLocaleString()}.${adjustForm.reason ? ` Reason: ${adjustForm.reason}` : ''}`
    };

    setIsAdjusting(true);
    // p_adjust_limit moves the sanctioned balance alongside the available one,
    // so utilisation to date is untouched by a top-up or a cut.
    const { error } = await supabase.rpc('update_credit_card_balance', {
      p_card_id: adjustingCard.id,
      p_amount_delta: delta,
      p_changelog_entry: changelogEntry,
      p_adjust_limit: true
    });
    setIsAdjusting(false);

    if (error) {
      toast.error('Failed to adjust card balance');
      reportSos('CREDIT_CARD_DEDUCTION_FAILED', error, {
        cardId: adjustingCard.id,
        amount: delta,
        step: 'manual_balance_adjustment'
      });
    } else {
      toast.success(`Card balance ${isIncrease ? 'increased' : 'reduced'} by ₹${amount.toLocaleString()}`);
      setAdjustingCard(null);
      fetchCards();
    }
  };

  const confirmDeactivateCard = (card: CreditCard) => {
    setCardToDeactivate(card);
  };

  const executeToggleActive = async (card: CreditCard, makeActive: boolean) => {
    const { error } = await supabase
      .from('credit_cards')
      .update({ is_active: makeActive, updated_at: new Date().toISOString() })
      .eq('id', card.id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(makeActive ? 'Card reactivated' : 'Card marked as Inactive');
      fetchCards();
    }
    setCardToDeactivate(null);
  };

  const handleExportReconciliation = () => {
    let filtered = cards;

    if (exportFilters.startDate) {
      filtered = filtered.filter(c => new Date(c.created_at) >= new Date(exportFilters.startDate));
    }
    if (exportFilters.endDate) {
      filtered = filtered.filter(c => new Date(c.created_at) <= new Date(exportFilters.endDate));
    }
    if (exportFilters.status === 'active') {
      filtered = filtered.filter(c => c.is_active);
    } else if (exportFilters.status === 'inactive') {
      filtered = filtered.filter(c => !c.is_active);
    }

    if (filtered.length === 0) {
      toast.error('No credit cards found matching these filters.');
      return;
    }

    const headers = [
      'Card Code',
      'Card Number',
      'Bank',
      'Approver',
      'Opening Balance (Rs)',
      'Total Spent (Rs)',
      'Remaining Balance (Rs)',
      'Status',
      'Expense Date',
      'Ticket ID',
      'Expense Amount (Rs)',
      'Expense Details'
    ];

    const rows: string[][] = [];

    filtered.forEach(card => {
      const totalSpent = card.opening_balance - card.amount_left;
      const baseRow = [
        card.card_code || card.id,
        maskedCardNumber(card.last_four),
        card.bank_name,
        card.approver_name,
        card.opening_balance.toString(),
        totalSpent.toString(),
        card.amount_left.toString(),
        card.is_active ? 'Active' : 'Inactive'
      ];

      const movements = card.changelog?.filter(entry =>
        entry.action === 'Ticket Purchased' ||
        entry.action === 'Refund Received' ||
        entry.action === 'Limit Increased' ||
        entry.action === 'Limit Reduced'
      ) || [];

      if (movements.length === 0) {
        rows.push([...baseRow, '', '', '', '']);
      } else {
        movements.forEach(entry => {
          const match = entry.details.match(/₹([0-9,.]+)/);
          let amount = match ? match[1].replace(/,/g, '') : '';

          if ((entry.action === 'Refund Received' || entry.action === 'Limit Increased') && amount) {
            amount = `+${amount}`;
          } else if (amount) {
            amount = `-${amount}`;
          }

          rows.push([
            ...baseRow,
            new Date(entry.timestamp).toLocaleDateString(),
            entry.relatedTicketSubmissionId || entry.relatedTicketId || '',
            amount,
            entry.details
          ]);
        });
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `credit_card_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsExportModalOpen(false);
    toast.success('Report exported successfully');
  };

  const totalCards = cards.length;
  const totalLimit = cards.reduce((sum, c) => sum + Number(c.opening_balance || 0), 0);
  const totalSpent = cards.reduce((sum, c) => sum + (Number(c.opening_balance || 0) - Number(c.amount_left || 0)), 0);
  const totalAvailable = cards.reduce((sum, c) => sum + Number(c.amount_left || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageBanner
        title="Credit Card Management"
        description="Register desk credit cards, track balances, top them up or cut them back, and reconcile every booking charged to a card."
        icon="fa-credit-card"
      >
        <button
          onClick={() => setIsExportModalOpen(true)}
          className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <i className="fa-solid fa-file-csv"></i> Export Report
        </button>
        <button
          onClick={() => handleOpenModal()}
          className="bg-white text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
        >
          <i className="fa-solid fa-plus"></i> Add Card
        </button>
      </PageBanner>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <i className="fa-solid fa-credit-card text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cards Registered</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{totalCards}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-emerald-200 dark:border-emerald-900/50">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <i className="fa-solid fa-sack-dollar text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Balance</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">₹{totalLimit.toLocaleString()}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-rose-200 dark:border-rose-900/50">
          <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <i className="fa-solid fa-arrow-up text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Spent</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">₹{totalSpent.toLocaleString()}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-blue-200 dark:border-blue-900/50">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <i className="fa-solid fa-wallet text-xl"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Available Now</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">₹{totalAvailable.toLocaleString()}</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-black uppercase text-xs tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4">Card</th>
                <th className="px-6 py-4">Bank</th>
                <th className="px-6 py-4">Approver</th>
                <th className="px-6 py-4">Card Code</th>
                <th className="px-6 py-4">Opening Balance</th>
                <th className="px-6 py-4">Available</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>Loading credit cards...</p>
                  </td>
                </tr>
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <i className="fa-solid fa-credit-card text-3xl mb-3 text-slate-300 dark:text-slate-600"></i>
                    <p className="font-medium text-slate-400 uppercase tracking-widest text-xs">No credit cards registered</p>
                  </td>
                </tr>
              ) : (
                cards.map(card => (
                  <tr key={card.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-mono font-bold text-slate-900 dark:text-white">{maskedCardNumber(card.last_four)}</p>
                      {card.card_label && <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{card.card_label}</p>}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-300">
                      {card.bank_name}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {card.approver_name}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">
                      {card.card_code || card.id.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        ₹{Number(card.opening_balance).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold">
                      <span className={`px-2.5 py-1 rounded-md text-xs border ${Number(card.amount_left) > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50'}`}>
                        ₹{Number(card.amount_left).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${card.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                        {card.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenAdjust(card)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors tooltip-trigger"
                        title="Increase / Reduce Balance"
                      >
                        <i className="fa-solid fa-scale-balanced"></i>
                      </button>
                      <button
                        onClick={() => handleOpenHistory(card)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors tooltip-trigger"
                        title="View History"
                      >
                        <i className="fa-solid fa-clock-rotate-left"></i>
                      </button>
                      <button
                        onClick={() => handleOpenModal(card)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors tooltip-trigger"
                        title="Edit Card"
                      >
                        <i className="fa-solid fa-pen-to-square"></i>
                      </button>
                      {card.is_active ? (
                        <button
                          onClick={() => confirmDeactivateCard(card)}
                          className="p-2 rounded-lg transition-colors tooltip-trigger text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                          title="Mark as Inactive"
                        >
                          <i className="fa-solid fa-ban"></i>
                        </button>
                      ) : (
                        <button
                          onClick={() => executeToggleActive(card, true)}
                          className="p-2 rounded-lg transition-colors tooltip-trigger text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          title="Reactivate Card"
                        >
                          <i className="fa-solid fa-rotate-left"></i>
                        </button>
                      )}
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
          <Card className="w-[90vw] h-[90vh] bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {selectedCard ? 'Edit Credit Card' : 'Add New Credit Card'}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Card Number (last 4 digits only)</label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-black text-slate-400 tracking-widest select-none">xxxx-xxxx-xxxx-</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="1234"
                    value={formData.last_four}
                    onChange={(e) => setFormData({ ...formData, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    className="w-24 h-11 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-mono text-lg font-black tracking-widest text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  />
                </div>
                <p className="text-xs text-slate-400 font-medium">The full card number is never stored.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Bank Name"
                  type="text"
                  required
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="e.g. HDFC Bank"
                />
                <Input
                  label="Card Label (Optional)"
                  type="text"
                  value={formData.card_label}
                  onChange={(e) => setFormData({ ...formData, card_label: e.target.value })}
                  placeholder="e.g. Ops Travel Card"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Approver</label>
                  <select
                    className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-4 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                    value={formData.approver_id || (formData.approver_name ? '__other__' : '')}
                    onChange={(e) => handleApproverChange(e.target.value)}
                  >
                    <option value="">Select Approver</option>
                    {users
                      .filter(u => u.role === UserRole.PNC || u.role === UserRole.PNC_ADMIN || u.role === UserRole.ADMIN || u.role === UserRole.FINANCE)
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    <option value="__other__">Someone else (type a name)</option>
                  </select>
                </div>
                <Input
                  label="Approver Name"
                  type="text"
                  required
                  value={formData.approver_name}
                  onChange={(e) => setFormData({ ...formData, approver_name: e.target.value, approver_id: '' })}
                  placeholder="e.g. Finance Head"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {selectedCard ? (
                  <>
                    <Input
                      label="Opening Balance (₹)"
                      type="number"
                      value={formData.opening_balance}
                      onChange={() => { }}
                      readOnly
                    />
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Available Balance (₹)</label>
                      <div className="h-11 flex items-center px-4 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-200">
                        ₹{Number(selectedCard.amount_left).toLocaleString()}
                      </div>
                    </div>
                  </>
                ) : (
                  <Input
                    label="Opening Balance (₹)"
                    type="number"
                    required
                    value={formData.opening_balance}
                    onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                    placeholder="e.g. 100000"
                  />
                )}
              </div>

              {selectedCard && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 flex items-start gap-3 border border-indigo-100 dark:border-indigo-800/30">
                  <i className="fa-solid fa-circle-info text-indigo-600 mt-0.5"></i>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 font-medium">
                    To increase or reduce this card's balance, close this dialog and use <strong>Increase / Reduce Balance</strong>. That path records the change in the card's history so reconciliation stays honest.
                  </p>
                </div>
              )}

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
                  {selectedCard ? 'Save Changes' : 'Add Card'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustingCard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                <i className="fa-solid fa-scale-balanced text-indigo-600"></i> Adjust Card Balance
              </h3>
              <button onClick={() => setAdjustingCard(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/40">
                <p className="font-mono font-bold text-slate-900 dark:text-white">{maskedCardNumber(adjustingCard.last_four)}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                  {adjustingCard.bank_name} • Balance ₹{Number(adjustingCard.opening_balance).toLocaleString()} • Available ₹{Number(adjustingCard.amount_left).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAdjustForm({ ...adjustForm, direction: 'increase' })}
                  className={`py-3 rounded-lg font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${adjustForm.direction === 'increase' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-emerald-300'}`}
                >
                  <i className="fa-solid fa-arrow-up"></i> Increase
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustForm({ ...adjustForm, direction: 'reduce' })}
                  className={`py-3 rounded-lg font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 ${adjustForm.direction === 'reduce' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-rose-300'}`}
                >
                  <i className="fa-solid fa-arrow-down"></i> Reduce
                </button>
              </div>

              <Input
                label="Amount (₹)"
                type="number"
                required
                value={adjustForm.amount}
                onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                placeholder="e.g. 25000"
              />

              <TextArea
                label="Reason (Optional)"
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                placeholder="e.g. Quarterly top-up approved by Finance"
                rows={2}
              />

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                <button
                  onClick={() => setAdjustingCard(null)}
                  className="px-5 py-2.5 rounded-lg font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeAdjustBalance}
                  disabled={isAdjusting}
                  className="px-5 py-2.5 rounded-lg font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all disabled:opacity-60 flex items-center gap-2"
                >
                  {isAdjusting ? <><i className="fa-solid fa-spinner fa-spin"></i> Saving...</> : <><i className="fa-solid fa-check"></i> Apply Adjustment</>}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-[90vw] h-[90vh] bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-indigo-600"></i> History: {maskedCardNumber(selectedCard.last_four)}
                </h3>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {(!selectedCard.changelog || selectedCard.changelog.length === 0) ? (
                <div className="text-center py-8 text-slate-500">
                  <p>No history available for this card.</p>
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-700 before:to-transparent">
                  {selectedCard.changelog.map((entry, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-slate-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${
                        entry.action === 'Created' ? 'bg-emerald-500' :
                        entry.action === 'Ticket Purchased' ? 'bg-rose-500' :
                        entry.action === 'Refund Received' ? 'bg-teal-500' :
                        entry.action === 'Limit Increased' ? 'bg-sky-500' :
                        entry.action === 'Limit Reduced' ? 'bg-amber-500' : 'bg-indigo-500'
                      }`}>
                        <i className={`fa-solid ${
                          entry.action === 'Created' ? 'fa-plus' :
                          entry.action === 'Ticket Purchased' ? 'fa-ticket' :
                          entry.action === 'Refund Received' ? 'fa-arrow-rotate-left' :
                          entry.action === 'Limit Increased' ? 'fa-arrow-up' :
                          entry.action === 'Limit Reduced' ? 'fa-arrow-down' : 'fa-pen'
                        } text-white text-xs`}></i>
                      </div>

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

      {/* Deactivate Confirmation Modal */}
      {cardToDeactivate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl p-8 flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 mx-auto flex items-center justify-center mb-4">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Mark card as Inactive?</h3>
            <p className="text-slate-500 text-sm mb-6">
              {maskedCardNumber(cardToDeactivate.last_four)} will stop appearing as a payment option on the booking screen.
              Its history and ₹{Number(cardToDeactivate.amount_left).toLocaleString()} available balance are kept, and you can reactivate it later.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setCardToDeactivate(null)}
                className="px-6 py-2.5 rounded-lg font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeToggleActive(cardToDeactivate, false)}
                className="px-6 py-2.5 rounded-lg font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 transition-all"
              >
                Yes, deactivate
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
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
                      <option value="all">All Cards (Active & Inactive)</option>
                      <option value="active">Active Only</option>
                      <option value="inactive">Inactive Only</option>
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
                  The exported CSV flattens the data: one row per card movement — ticket charges, refunds and balance adjustments — alongside the card's details.
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

export default CreditCardManagement;
