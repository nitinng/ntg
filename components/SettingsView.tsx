import React, { useState } from 'react';
import Toggle from './Toggle';
import { PageBanner } from './PageBanner';
import { PolicyConfig, Priority, User } from '../types';
import Card from './Card';
import Input from './Input';
import { toast } from 'sonner';

interface SettingsViewProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  policy?: PolicyConfig;
  onUpdatePolicy?: (updates: Partial<PolicyConfig>) => Promise<void> | void;
  currentUser?: User;
}

const URGENCY_OPTIONS: {
  key: Priority;
  label: string;
  badgeClass: string;
  activeClass: string;
  icon: string;
  desc: string;
}[] = [
  {
    key: Priority.LOW,
    label: 'Low',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
    activeClass: 'ring-2 ring-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-500',
    icon: 'fa-gauge-simple',
    desc: 'Standard turnaround for travel planned well in advance.'
  },
  {
    key: Priority.MEDIUM,
    label: 'Medium',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800/60',
    activeClass: 'ring-2 ring-amber-500 bg-amber-50/80 dark:bg-amber-950/50 border-amber-500',
    icon: 'fa-clock',
    desc: 'Normal priority. Recommended default for standard bookings.'
  },
  {
    key: Priority.HIGH,
    label: 'High',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/60',
    activeClass: 'ring-2 ring-orange-500 bg-orange-50/80 dark:bg-orange-950/50 border-orange-500',
    icon: 'fa-bolt',
    desc: 'Expedited handling for upcoming trips requiring prompt action.'
  },
  {
    key: Priority.CRITICAL,
    label: 'Critical',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
    activeClass: 'ring-2 ring-rose-500 bg-rose-50/80 dark:bg-rose-950/50 border-rose-500',
    icon: 'fa-triangle-exclamation',
    desc: 'Emergency or immediate travel. Priority dispatch and booking queue.'
  }
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  onToggleTheme,
  policy,
  onUpdatePolicy
}) => {
  const currentDefault = policy?.defaultBookingUrgency || Priority.MEDIUM;
  const allowRequester = policy?.allowRequesterUrgency !== false;
  const autoEscalateDays = policy?.autoEscalateUrgentDays ?? 3;
  const slaHours = policy?.urgencySlaHours || {
    critical: 4,
    high: 12,
    medium: 24,
    low: 48
  };

  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleSelectDefaultUrgency = async (priority: Priority) => {
    if (!onUpdatePolicy) return;
    setSavingKey('defaultUrgency');
    try {
      await onUpdatePolicy({ defaultBookingUrgency: priority });
      toast.success(`Default booking urgency set to ${priority}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleAllowRequester = async () => {
    if (!onUpdatePolicy) return;
    const nextVal = !allowRequester;
    setSavingKey('allowRequester');
    try {
      await onUpdatePolicy({ allowRequesterUrgency: nextVal });
      toast.success(`Requester urgency selection ${nextVal ? 'enabled' : 'disabled'}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleUpdateAutoEscalateDays = async (val: number) => {
    if (!onUpdatePolicy) return;
    const clamped = Math.max(0, Math.min(30, val));
    await onUpdatePolicy({ autoEscalateUrgentDays: clamped });
    toast.success(`Auto-escalation threshold set to ${clamped} days`);
  };

  const handleUpdateSla = async (tier: 'critical' | 'high' | 'medium' | 'low', hours: number) => {
    if (!onUpdatePolicy) return;
    const updatedSla = {
      ...slaHours,
      [tier]: Math.max(1, hours)
    };
    await onUpdatePolicy({ urgencySlaHours: updatedSla });
    toast.success(`SLA target for ${tier.toUpperCase()} updated to ${hours}h`);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-500">
      <PageBanner
        title="Application Settings"
        description="Configure workspace appearance, booking urgency levels, SLA targets, and user preferences."
        icon="fa-gear"
      />

      {/* Appearance Settings */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b dark:border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm">
            <i className="fa-solid fa-palette"></i>
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">Workspace Appearance</h4>
            <p className="text-xs text-slate-500">Select light or pure neutral dark styling.</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            <span className="text-sm font-semibold text-slate-800 dark:text-white block">Dark Mode</span>
            <span className="text-xs text-slate-500 font-medium">Use high-contrast neutral dark theme aligned with PNC ELC.</span>
          </div>
          <Toggle active={isDarkMode} onChange={onToggleTheme} />
        </div>
      </Card>

      {/* Booking Urgency & Priority Settings */}
      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between pb-3 border-b dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm">
              <i className="fa-solid fa-bolt-lightning"></i>
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                Booking Urgency & Priority Configuration
              </h4>
              <p className="text-xs text-slate-500">
                Define default booking priority, employee selection rules, and response turnaround times (SLAs).
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
            Active: {currentDefault}
          </span>
        </div>

        {/* 1. Default Booking Urgency Selector */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            Default Booking Urgency Level
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {URGENCY_OPTIONS.map(opt => {
              const isSelected = currentDefault === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelectDefaultUrgency(opt.key)}
                  className={`p-3.5 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? opt.activeClass
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1.5 ${opt.badgeClass}`}>
                      <i className={`fa-solid ${opt.icon} text-[10px]`}></i>
                      {opt.label}
                    </span>
                    {isSelected && (
                      <i className="fa-solid fa-circle-check text-indigo-600 dark:text-indigo-400 text-xs"></i>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {opt.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Requester Control & Auto-Escalation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t dark:border-slate-800">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 flex items-center justify-between">
            <div className="pr-4">
              <span className="text-xs font-bold text-slate-800 dark:text-white block">
                Allow Requesters to Select Urgency
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                Display the urgency selector directly in the booking form.
              </span>
            </div>
            <Toggle active={allowRequester} onChange={handleToggleAllowRequester} />
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-2">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-white block">
                Auto-Escalate Imminent Trips
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                Automatically elevate requests to High urgency if travel date is within:
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="30"
                value={autoEscalateDays}
                onChange={e => handleUpdateAutoEscalateDays(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-1.5 text-xs font-bold rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">days of departure</span>
            </div>
          </div>
        </div>

        {/* 3. SLA Target Turnaround Times */}
        <div className="space-y-3 pt-2 border-t dark:border-slate-800">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Urgency SLA Turnaround Targets (Hours)
            </label>
            <span className="text-[11px] text-slate-400">Maximum expected booking turnaround</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                <i className="fa-solid fa-triangle-exclamation text-[10px]"></i> Critical SLA
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={slaHours.critical}
                  onChange={e => handleUpdateSla('critical', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-slate-400">hours</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-orange-600 dark:text-orange-400 mb-1 flex items-center gap-1">
                <i className="fa-solid fa-bolt text-[10px]"></i> High SLA
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={slaHours.high}
                  onChange={e => handleUpdateSla('high', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-slate-400">hours</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                <i className="fa-solid fa-clock text-[10px]"></i> Medium SLA
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={slaHours.medium}
                  onChange={e => handleUpdateSla('medium', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-slate-400">hours</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                <i className="fa-solid fa-gauge-simple text-[10px]"></i> Low SLA
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={slaHours.low}
                  onChange={e => handleUpdateSla('low', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-slate-400">hours</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">
        Navgurukul Travel Desk &bull; v2.5.0
      </div>
    </div>
  );
};

export default SettingsView;
