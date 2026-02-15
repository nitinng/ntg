
import React from 'react';
import { PNCStatus, Priority, ApprovalStatus } from '../types';

interface BadgeProps {
  type: 'pnc' | 'priority' | 'approval';
  value: string;
}

const StatusBadge: React.FC<BadgeProps> = ({ type, value }) => {
  const getStyles = () => {
    if (type === 'priority') {
      switch (value) {
        case Priority.CRITICAL: return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50';
        case Priority.HIGH: return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50';
        case Priority.MEDIUM: return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50';
        case Priority.LOW: return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50';
        default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      }
    }
    
    if (type === 'pnc') {
      switch (value) {
        case PNCStatus.BOOKED_AND_CLOSED: return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50';
        case PNCStatus.REJECTED_PNC: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
        case PNCStatus.PROCESSING: return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50';
        case PNCStatus.NOT_STARTED: return 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-900/50 dark:text-slate-500 dark:border-slate-800';
        default: return 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50';
      }
    }

    if (type === 'approval') {
        switch (value) {
          case ApprovalStatus.APPROVED: return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
          case ApprovalStatus.PENDING: return 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50';
          default: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
        }
    }
    
    return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border transition-colors ${getStyles()}`}>
      {value}
    </span>
  );
};

export default StatusBadge;
