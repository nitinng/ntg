import React from 'react';

interface SidebarLinkProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  badgeColor?: string;
}

export const SidebarLink = ({ icon, label, active, onClick, badge, badgeColor }: SidebarLinkProps) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
    <i className={`fa-solid ${icon} w-5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`}></i>
    <span className="flex-1 text-left whitespace-nowrap">{label}</span>
    {badge && (
      <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full leading-none shrink-0 text-white shadow-2xs ${badgeColor || 'bg-rose-500'}`}>
        {badge}
      </span>
    )}
  </button>
);

export default SidebarLink;
