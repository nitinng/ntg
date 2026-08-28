import React, { useState } from 'react';
import { User } from '../types';
import Input from './Input';
import { toast } from 'sonner';

interface IgathpuriAvailabilityModalProps {
  onClose: () => void;
  currentUser: User;
  onSubmit: (data: any) => void;
}

export const IgathpuriAvailabilityModal: React.FC<IgathpuriAvailabilityModalProps> = ({
  onClose,
  currentUser,
  onSubmit
}) => {
  const [formData, setFormData] = useState({
    fullName: currentUser.name || '',
    email: currentUser.email || '',
    phone: currentUser.phone || '',
    department: currentUser.department || '',
    teamSize: '',
    startDate: '',
    endDate: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minStartDate = tomorrow.toISOString().split('T')[0];

  const minEndDate = formData.startDate
    ? new Date(new Date(formData.startDate).getTime() + 86400000).toISOString().split('T')[0]
    : minStartDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.teamSize || !formData.startDate || !formData.endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
        <header className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Check Availability</h3>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">Igathpuri Campus Request</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 flex items-center justify-center">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Full Name"
              value={formData.fullName}
              readOnly
              className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email Address"
                value={formData.email}
                readOnly
                className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
              />
              <Input
                label="Phone Number"
                value={formData.phone}
                readOnly
                className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
              />
            </div>
            <Input
              label="Department"
              value={formData.department}
              readOnly
              className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
            />

            <div className="h-px bg-slate-100 dark:border-slate-800 my-2"></div>

            <Input
              label="Team Members Expected"
              type="number"
              placeholder="e.g. 10"
              value={formData.teamSize}
              onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Start Date</label>
                <input
                  type="date"
                  required
                  min={minStartDate}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value, endDate: e.target.value > formData.endDate ? '' : formData.endDate })}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">End Date</label>
                <input
                  type="date"
                  required
                  min={minEndDate}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="bg-violet-50 dark:bg-violet-900/10 p-4 rounded-lg border border-violet-100 dark:border-violet-800/30 flex gap-3">
            <i className="fa-solid fa-circle-info text-violet-600 mt-0.5"></i>
            <p className="text-xs text-violet-700 dark:text-violet-400 leading-relaxed font-medium">
              Your request will be sent to the Igathpuri meetup approvers. Once approved, you can proceed with your travel booking.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-paper-plane mr-2"></i>}
            Submit Request
          </button>
        </form>
      </div>
    </div>
  );
};

export default IgathpuriAvailabilityModal;
