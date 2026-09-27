
import React from 'react';
import { PNCStatus, Priority, ApprovalStatus, VerificationStatus } from '../types';

interface BadgeProps {
  type: 'pnc' | 'priority' | 'approval' | 'status';
  value: string;
}

const StatusBadge: React.FC<BadgeProps> = ({ type, value }) => {
  const getStyles = () => {
    if (type === 'priority') {
      switch (value) {
        case Priority.CRITICAL: return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
        case Priority.HIGH: return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
        case Priority.MEDIUM: return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20';
        case Priority.LOW: return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
        default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      }
    }

    if (type === 'pnc') {
      switch (value) {
        case PNCStatus.NOT_STARTED: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
        case PNCStatus.APPROVAL_PENDING: return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50';
        case PNCStatus.REJECTED_BY_MANAGER: return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50';
        case PNCStatus.APPROVED: return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
        case PNCStatus.PROCESSING: return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50';
        case PNCStatus.BOOKED: return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50';
        case PNCStatus.REJECTED_BY_PNC: return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50';
        case PNCStatus.CLOSED: return 'bg-slate-500 text-white border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';
        default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      }
    }

    if (type === 'approval') {
      switch (value) {
        case ApprovalStatus.APPROVED: return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
        case ApprovalStatus.PENDING: return 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50';
        default: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      }
    }

    if (type === 'status') {
      switch (value) {
        case VerificationStatus.APPROVED: return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50';
        case VerificationStatus.PENDING: return 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50';
        case VerificationStatus.REJECTED: return 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50';
        default: return 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-900/50 dark:text-slate-500 dark:border-slate-800';
      }
    }

    return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  };

  const getIcon = () => {
    if (type === 'priority') {
      switch (value) {
        case Priority.CRITICAL: return <i className="fa-solid fa-triangle-exclamation mr-1 text-[10px]"></i>;
        case Priority.HIGH: return <i className="fa-solid fa-bolt mr-1 text-[10px]"></i>;
        case Priority.MEDIUM: return <i className="fa-solid fa-clock mr-1 text-[10px]"></i>;
        case Priority.LOW: return <i className="fa-solid fa-calendar-check mr-1 text-[10px]"></i>;
        default: return null;
      }
    }
    if (type === 'status') {
      switch (value) {
        case VerificationStatus.APPROVED: return <i className="fa-solid fa-circle-check mr-1"></i>;
        case VerificationStatus.PENDING: return <i className="fa-solid fa-clock mr-1"></i>;
        case VerificationStatus.REJECTED: return <i className="fa-solid fa-circle-xmark mr-1"></i>;
        default: return null;
      }
    }
    return null;
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs uppercase font-bold border transition-colors ${getStyles()}`}>
      {getIcon()}
      {value}
    </span>
  );
};

export default StatusBadge;
