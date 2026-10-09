import React from 'react';
import Toggle from './Toggle';
import { PageBanner } from './PageBanner';
import { PolicyConfig, Priority, User } from '../types';
import Card from './Card';
import { toast } from 'sonner';
import { APP_VERSION } from '../utils/changelog';

interface SettingsViewProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  policy?: PolicyConfig;
  onUpdatePolicy?: (updates: Partial<PolicyConfig>) => Promise<void> | void;
  currentUser?: User;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  onToggleTheme,
  policy,
  onUpdatePolicy
}) => {
  const allowRequester = policy?.allowRequesterUrgency === true;
  const enableUrgencySla = policy?.enableUrgencySla === true;
  const criticalDays = policy?.urgencyThresholds?.criticalDays ?? 2;
  const highDays = policy?.urgencyThresholds?.highDays ?? 10;
  const mediumDays = policy?.urgencyThresholds?.mediumDays ?? 20;

  const tatApproval = policy?.tatApprovalHours ?? 24;
  const tatProcessing = policy?.tatProcessingHours ?? 48;
  const tatBooking = policy?.tatBookingHours ?? 72;

  const slaHours = policy?.urgencySlaHours || {
    critical: 4,
    high: 12,
    medium: 24,
    low: 48
  };

  const handleUpdateTat = async (key: 'tatApprovalHours' | 'tatProcessingHours' | 'tatBookingHours', val: number) => {
    if (!onUpdatePolicy) return;
    await onUpdatePolicy({ [key]: Math.max(1, val) });
    toast.success('Generic SLA target updated');
  };

  const handleToggleUrgencySla = async () => {
    if (!onUpdatePolicy) return;
    const nextVal = !enableUrgencySla;
    await onUpdatePolicy({ enableUrgencySla: nextVal });
    toast.success(`Urgency-based SLA ${nextVal ? 'enabled' : 'disabled'}`);
  };

  const handleUpdateThreshold = async (key: 'criticalDays' | 'highDays' | 'mediumDays', val: number) => {
    if (!onUpdatePolicy) return;
    const current = {
      criticalDays,
      highDays,
      mediumDays,
      [key]: Math.max(1, val)
    };
    await onUpdatePolicy({ urgencyThresholds: current });
    toast.success('Urgency threshold updated');
  };

  const handleToggleAllowRequester = async () => {
    if (!onUpdatePolicy) return;
    const nextVal = !allowRequester;
    await onUpdatePolicy({ allowRequesterUrgency: nextVal });
    toast.success(`Requester manual urgency override ${nextVal ? 'enabled' : 'disabled'}`);
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
        description="Configure workspace appearance, generic turnaround SLAs, urgency SLA overrides, and dynamic booking rules."
        icon="fa-gear"
      />

      {/* Appearance Settings */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b dark:border-neutral-800">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm">
            <i className="fa-solid fa-palette"></i>
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-neutral-100">Workspace Appearance</h4>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Select light or pure neutral dark styling.</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            <span className="text-sm font-semibold text-slate-800 dark:text-neutral-100 block">Dark Mode</span>
            <span className="text-xs text-slate-500 dark:text-neutral-400 font-medium">Use high-contrast neutral dark theme aligned with PNC ELC.</span>
          </div>
          <Toggle active={isDarkMode} onChange={onToggleTheme} />
        </div>
      </Card>

      {/* SLA & Turnaround Configuration */}
      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between pb-3 border-b dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm">
              <i className="fa-solid fa-stopwatch"></i>
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-neutral-100">
                Turnaround Time (SLA) & Urgency Policies
              </h4>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Configure generic turnaround SLAs, urgency-specific overrides, and automated dynamic urgency progression.
              </p>
            </div>
          </div>
        </div>

        {/* 1. Generic Turnaround Time (SLA) Targets */}
        <div className="space-y-3">
          <div>
            <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <i className="fa-solid fa-clock text-indigo-500"></i>
              1. Generic Turnaround Time (SLA) Targets
            </h4>
            <p className="text-2xs text-slate-500 dark:text-neutral-400 mt-0.5">
              Baseline fulfillment SLAs applied uniformly across travel requests.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/40">
              <label className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 block mb-1.5">
                Manager Approval TAT
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={tatApproval}
                  onChange={e => handleUpdateTat('tatApprovalHours', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-2xs text-slate-400 font-medium">hrs</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/40">
              <label className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 block mb-1.5">
                PNC Processing TAT
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={tatProcessing}
                  onChange={e => handleUpdateTat('tatProcessingHours', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-2xs text-slate-400 font-medium">hrs</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/40">
              <label className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 block mb-1.5">
                Ticketing Fulfillment TAT
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={tatBooking}
                  onChange={e => handleUpdateTat('tatBookingHours', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-2xs text-slate-400 font-medium">hrs</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Urgency-based SLA Toggle */}
        <div className="border-t border-slate-100 dark:border-neutral-800 pt-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/40">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <h5 className="font-bold text-slate-800 dark:text-neutral-200 text-xs">
                  2. Enable Urgency-based SLA Targets
                </h5>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                  enableUrgencySla
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}>
                  {enableUrgencySla ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-2xs text-slate-500 dark:text-neutral-400 mt-1 leading-relaxed">
                When enabled, ticketing turnaround SLAs are customized per urgency tier (Critical, High, Medium, Low) instead of using the generic ticketing TAT ({tatBooking}h).
              </p>
            </div>
            <Toggle
              active={enableUrgencySla}
              onChange={handleToggleUrgencySla}
            />
          </div>
        </div>

        {/* 3. Dynamic Booking Urgency Tiers */}
        <div className="border-t border-slate-100 dark:border-neutral-800 pt-4 space-y-4">
          <div>
            <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <i className="fa-solid fa-clock-rotate-left text-indigo-500"></i>
              3. Dynamic Booking Urgency Tiers
            </h4>
            <p className="text-2xs text-slate-500 dark:text-neutral-400 mt-0.5">
              Urgency is automatically assigned based on departure countdown and dynamically advances as travel nears.
            </p>
          </div>

          {/* 4 Dynamic Urgency Tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Critical */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/60 flex flex-col justify-between transition-all hover:border-slate-300 dark:hover:border-neutral-700">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
                    Critical
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400">
                    &lt; {criticalDays}d
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-snug">
                  Emergency departure requiring immediate ticketing turnaround.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-neutral-400">Threshold</span>
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-slate-400">&lt;</span>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={criticalDays}
                      onChange={e => handleUpdateThreshold('criticalDays', parseInt(e.target.value) || 1)}
                      className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <span className="text-2xs text-slate-400">days</span>
                  </div>
                </div>
                {enableUrgencySla ? (
                  <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                    <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Urgency SLA</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={slaHours.critical}
                        onChange={e => handleUpdateSla('critical', parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-neutral-800 text-rose-700 dark:text-rose-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                      <span className="text-2xs text-slate-400">hrs</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                    <span>SLA Rule</span>
                    <span className="font-mono">Generic ({tatBooking}h)</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. High */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/60 flex flex-col justify-between transition-all hover:border-slate-300 dark:hover:border-neutral-700">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <i className="fa-solid fa-bolt text-[10px]"></i>
                    High
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400">
                    {criticalDays} – {highDays}d
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-snug">
                  Expedited handling for trips departing within the upcoming week.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-neutral-400">Threshold</span>
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-slate-400">&le;</span>
                    <input
                      type="number"
                      min="2"
                      max="30"
                      value={highDays}
                      onChange={e => handleUpdateThreshold('highDays', parseInt(e.target.value) || 10)}
                      className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-2xs text-slate-400">days</span>
                  </div>
                </div>
                {enableUrgencySla ? (
                  <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Urgency SLA</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={slaHours.high}
                        onChange={e => handleUpdateSla('high', parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-neutral-800 text-amber-700 dark:text-amber-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="text-2xs text-slate-400">hrs</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                    <span>SLA Rule</span>
                    <span className="font-mono">Generic ({tatBooking}h)</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Medium */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/60 flex flex-col justify-between transition-all hover:border-slate-300 dark:hover:border-neutral-700">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    <i className="fa-solid fa-clock text-[10px]"></i>
                    Medium
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400">
                    {highDays} – {mediumDays}d
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-snug">
                  Standard turnaround for travel planned 2–3 weeks in advance.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-neutral-400">Threshold</span>
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-slate-400">&le;</span>
                    <input
                      type="number"
                      min="10"
                      max="60"
                      value={mediumDays}
                      onChange={e => handleUpdateThreshold('mediumDays', parseInt(e.target.value) || 20)}
                      className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <span className="text-2xs text-slate-400">days</span>
                  </div>
                </div>
                {enableUrgencySla ? (
                  <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                    <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">Urgency SLA</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={slaHours.medium}
                        onChange={e => handleUpdateSla('medium', parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-neutral-800 text-sky-700 dark:text-sky-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <span className="text-2xs text-slate-400">hrs</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                    <span>SLA Rule</span>
                    <span className="font-mono">Generic ({tatBooking}h)</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Low */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/60 flex flex-col justify-between transition-all hover:border-slate-300 dark:hover:border-neutral-700">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <i className="fa-solid fa-calendar-check text-[10px]"></i>
                    Low
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400">
                    &gt; {mediumDays}d
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-snug">
                  Advance travel planned well ahead with comfortable ticketing buffer.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-neutral-400">Threshold</span>
                  <span className="text-2xs font-mono text-slate-500 dark:text-neutral-400 font-semibold">&gt; {mediumDays} days</span>
                </div>
                {enableUrgencySla ? (
                  <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Urgency SLA</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={slaHours.low}
                        onChange={e => handleUpdateSla('low', parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-neutral-800 text-emerald-700 dark:text-emerald-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="text-2xs text-slate-400">hrs</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                    <span>SLA Rule</span>
                    <span className="font-mono">Generic ({tatBooking}h)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Escalation Rule Explainer */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/70 dark:bg-neutral-900/40 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
              <i className="fa-solid fa-arrow-trend-up text-xs"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-slate-800 dark:text-neutral-200">Automated Dynamic Progression</h5>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                A booking created with 22 days to travel starts at <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">Low</strong>. As days elapse and travel nears, it automatically advances to <strong className="text-sky-600 dark:text-sky-400 font-semibold">Medium</strong> (&le; 20d), <strong className="text-amber-600 dark:text-amber-400 font-semibold">High</strong> (&le; 10d), and <strong className="text-rose-600 dark:text-rose-400 font-semibold">Critical</strong> (&lt; 2d).
              </p>
            </div>
          </div>

          {/* Requester Manual Override Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/40 dark:bg-neutral-900/30">
            <div className="pr-4">
              <h5 className="font-bold text-slate-800 dark:text-neutral-200 text-xs">Allow Requesters to Manually Override Urgency</h5>
              <p className="text-2xs text-slate-500 dark:text-neutral-400 mt-0.5">
                When enabled, employees can override the dynamic urgency in the booking modal. When disabled, tickets strictly follow the automated timeline.
              </p>
            </div>
            <Toggle
              active={allowRequester}
              onChange={handleToggleAllowRequester}
            />
          </div>
        </div>
      </Card>

      <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">
        Navgurukul Travel Desk &bull; {APP_VERSION}
      </div>
    </div>
  );
};

export default SettingsView;
