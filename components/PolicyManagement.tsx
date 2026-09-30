import React, { useState, useEffect } from 'react';
import { User, UserRole, PolicyConfig, TravelModePolicy, Priority } from '../types';
import Card from './Card';
import Input from './Input';
import Toggle from './Toggle';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { PageBanner } from './PageBanner';

interface PolicyManagementProps {
  policy: PolicyConfig;
  setPolicy: (policy: PolicyConfig) => void;
  travelModePolicies: TravelModePolicy[];
  setTravelModePolicies: (policies: TravelModePolicy[]) => void;
  users: User[];
  isIgatpuriEnabled: boolean;
  setIsIgatpuriEnabled: (enabled: boolean) => void;
  isChatEnabled: boolean;
  setIsChatEnabled: (enabled: boolean) => void;
  isEmailLoginEnabled: boolean;
  setIsEmailLoginEnabled: (enabled: boolean) => void;
  currentUser: User;
}

export const PolicyManagement = ({
  policy,
  setPolicy,
  travelModePolicies,
  setTravelModePolicies,
  users,
  isIgatpuriEnabled,
  setIsIgatpuriEnabled,
  isChatEnabled,
  setIsChatEnabled,
  isEmailLoginEnabled,
  setIsEmailLoginEnabled,
  currentUser
}: PolicyManagementProps) => {
  const handleUpdateMinAdvanceDays = async (mode: string, days: number) => {
    try {
      const { error } = await supabase
        .from('travel_mode_policies')
        .update({ min_advance_days: days, updated_at: new Date().toISOString() })
        .eq('travel_mode', mode)
        .select()
        .single();

      if (error) throw error;

      setTravelModePolicies(travelModePolicies.map((p: any) =>
        p.travelMode === mode ? { ...p, minAdvanceDays: days } : p
      ));
      toast.success(`${mode} policy updated`);
    } catch (err: any) {
      toast.error("Failed to update policy: " + err.message);
    }
  };

  const handleUpdatePolicy = async (updates: Partial<any>) => {
    const newPolicy = { ...policy, ...updates };
    setPolicy(newPolicy);
    try {
      const { error } = await supabase.from('meetup_settings').upsert({
        setting_key: 'policy_config',
        setting_value: newPolicy as any,
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });
      if (error) throw error;

      // Sync specific SLA TAT target hours changes to the dedicated public.sla_configs table
      if (updates.tatApprovalHours !== undefined) {
        await supabase.from('sla_configs').upsert({
          stage: 'Approval Pending',
          target_hours: updates.tatApprovalHours,
          escalation_hours: updates.tatApprovalHours * 2,
          owner_role: 'Manager'
        }, { onConflict: 'stage' });
      }
      if (updates.tatProcessingHours !== undefined) {
        await supabase.from('sla_configs').upsert({
          stage: 'Processing',
          target_hours: updates.tatProcessingHours,
          escalation_hours: updates.tatProcessingHours * 2,
          owner_role: 'PNC'
        }, { onConflict: 'stage' });
      }
      if (updates.tatBookingHours !== undefined) {
        await supabase.from('sla_configs').upsert({
          stage: 'Booked',
          target_hours: updates.tatBookingHours,
          escalation_hours: updates.tatBookingHours * 2,
          owner_role: 'PNC'
        }, { onConflict: 'stage' });
      }

      toast.success("Policy saved successfully");
    } catch (err: any) {
      toast.error("Failed to save policy: " + err.message);
    }
  };

  // --- Meetup Approver State ---
  const [meetupApprovers, setMeetupApprovers] = useState<any[]>([]);
  const [pncSearch, setPncSearch] = useState('');
  const [isAddingApprover, setIsAddingApprover] = useState(false);
  const [approversLoading, setApproversLoading] = useState(true);
  const [totalSeats, setTotalSeats] = useState<number>(0);
  const [isCapacityEnabled, setIsCapacityEnabled] = useState(false);
  const [isCalendarEnabled, setIsCalendarEnabled] = useState(true);

  // --- Global Email CC State ---
  const [globalCcList, setGlobalCcList] = useState<string[]>(['travel.team@navgurukul.org', 'nitin.s@navgurukul.org']);
  const [newCcInput, setNewCcInput] = useState('');
  const [isSavingCc, setIsSavingCc] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setApproversLoading(true);
      try {
        const [approversRes, settingsRes, ccRes] = await Promise.all([
          supabase
            .from('meetup_approvers')
            .select('*')
            .order('created_at', { ascending: true }),
          supabase
            .from('meetup_settings')
            .select('*')
            .in('setting_key', ['total_seats', 'is_capacity_enabled', 'is_calendar_enabled', 'is_igatpuri_enabled']),
          supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'global_email_cc')
            .maybeSingle()
        ]);

        if (ccRes?.data?.setting_value && Array.isArray(ccRes.data.setting_value)) {
          setGlobalCcList(ccRes.data.setting_value);
        }

        if (approversRes.error) throw approversRes.error;
        let finalApprovers = approversRes.data || [];

        const admins = users.filter((u: any) => u.role === UserRole.ADMIN);
        const adminAddedPromises = admins.map(async (admin: any) => {
          const exists = finalApprovers.some(a => a.email.toLowerCase() === admin.email.toLowerCase());
          if (!exists) {
            const { data: newAdmin, error: insertError } = await supabase
              .from('meetup_approvers')
              .insert({ email: admin.email.toLowerCase(), name: admin.name || null, is_active: true })
              .select()
              .single();
            if (!insertError && newAdmin) {
              return newAdmin;
            }
          }
          return null;
        });

        const newAdmins = await Promise.all(adminAddedPromises);
        finalApprovers = [...finalApprovers, ...newAdmins.filter(a => a !== null)];
        setMeetupApprovers(finalApprovers);

        if (!settingsRes.error && settingsRes.data) {
          const seats = settingsRes.data.find((s: any) => s.setting_key === 'total_seats');
          const enabled = settingsRes.data.find((s: any) => s.setting_key === 'is_capacity_enabled');
          const calendar = settingsRes.data.find((s: any) => s.setting_key === 'is_calendar_enabled');
          const igatpuri = settingsRes.data.find((s: any) => s.setting_key === 'is_igatpuri_enabled');

          if (seats) setTotalSeats(Number(seats.setting_value));
          if (enabled) setIsCapacityEnabled(enabled.setting_value === true || enabled.setting_value === 'true');
          if (calendar) setIsCalendarEnabled(calendar.setting_value === true || calendar.setting_value === 'true');
          if (igatpuri) setIsIgatpuriEnabled(igatpuri.setting_value === true || igatpuri.setting_value === 'true');
        }
      } catch (err: any) {
        toast.error('Failed to load data: ' + err.message);
      } finally {
        setApproversLoading(false);
      }
    };

    fetchData();
  }, [users]);

  const handleUpdateSeats = async (val: number) => {
    setTotalSeats(val);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'total_seats',
          setting_value: val,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success("Total seats updated");
    } catch (err: any) {
      toast.error("Failed to update seats: " + err.message);
    }
  };

  const handleToggleCapacity = async () => {
    const newState = !isCapacityEnabled;
    setIsCapacityEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_capacity_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Capacity tracking ${newState ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleToggleCalendar = async () => {
    const newState = !isCalendarEnabled;
    setIsCalendarEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_calendar_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Availability calendar ${newState ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleToggleIgatpuri = async () => {
    const newState = !isIgatpuriEnabled;
    setIsIgatpuriEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_igatpuri_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Igathpuri Meetup module ${newState ? 'enabled' : 'disabled'} globally`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
      setIsIgatpuriEnabled(!newState);
    }
  };

  const handleToggleChat = async () => {
    const newState = !isChatEnabled;
    setIsChatEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_chat_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Chat Support module ${newState ? 'enabled' : 'disabled'} globally`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
      setIsChatEnabled(!newState);
    }
  };

  const handleToggleEmailLogin = async () => {
    const newState = !isEmailLoginEnabled;
    setIsEmailLoginEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_email_login_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Email Login ${newState ? 'enabled' : 'disabled'} globally`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
      setIsEmailLoginEnabled(!newState);
    }
  };

  const handleAddCc = async () => {
    const trimmed = newCcInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (globalCcList.includes(trimmed)) {
      toast.error('This email is already in the CC list');
      return;
    }

    const updated = [...globalCcList, trimmed];
    setIsSavingCc(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          setting_key: 'global_email_cc',
          setting_value: updated,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      setGlobalCcList(updated);
      setNewCcInput('');
      toast.success(`Added ${trimmed} to global CC list`);
    } catch (err: any) {
      toast.error('Failed to update CC settings: ' + err.message);
    } finally {
      setIsSavingCc(false);
    }
  };

  const handleRemoveCc = async (emailToRemove: string) => {
    const updated = globalCcList.filter(e => e !== emailToRemove);
    setIsSavingCc(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          setting_key: 'global_email_cc',
          setting_value: updated,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      setGlobalCcList(updated);
      toast.success(`Removed ${emailToRemove} from global CC list`);
    } catch (err: any) {
      toast.error('Failed to update CC settings: ' + err.message);
    } finally {
      setIsSavingCc(false);
    }
  };

  const handleAddApprover = async (userToAdd: any) => {
    setIsAddingApprover(true);
    try {
      const { data, error } = await supabase
        .from('meetup_approvers')
        .insert({ email: userToAdd.email.toLowerCase(), name: userToAdd.name || null })
        .select()
        .single();
      if (error) throw error;
      setMeetupApprovers(prev => [...prev, data]);
      setPncSearch('');
      toast.success('Meetup approver added');
    } catch (err: any) {
      if (err.code === '23505') {
        toast.error('This user is already an approver');
      } else {
        toast.error('Failed to add approver: ' + err.message);
      }
    } finally {
      setIsAddingApprover(false);
    }
  };

  const handleToggleApprover = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('meetup_approvers')
        .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setMeetupApprovers(prev => prev.map(a => a.id === id ? { ...a, is_active: !currentActive } : a));
      toast.success(`Approver ${!currentActive ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      toast.error('Failed to update approver: ' + err.message);
    }
  };

  const handleDeleteApprover = async (id: string) => {
    try {
      const { error } = await supabase.from('meetup_approvers').delete().eq('id', id);
      if (error) throw error;
      setMeetupApprovers(prev => prev.filter(a => a.id !== id));
      toast.success('Approver removed');
    } catch (err: any) {
      toast.error('Failed to remove approver: ' + err.message);
    }
  };

  const filteredPncUsers = users.filter(u =>
    (u.role === UserRole.PNC || u.role === UserRole.PNC_ADMIN || u.role === UserRole.ADMIN) &&
    (u.name?.toLowerCase().includes(pncSearch.toLowerCase()) || u.email?.toLowerCase().includes(pncSearch.toLowerCase())) &&
    !meetupApprovers.some(a => a.email.toLowerCase() === u.email?.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-12">
      <PageBanner
        title="Policy & System Settings"
        description="Configure compliance rules, minimum advance notice, TAT thresholds, and global system toggles."
        icon="fa-shield-halved"
      />

      {/* Global Module Controls */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC_ADMIN) && (
        <section className="space-y-3">
          <h3 className="text-2xs font-bold text-slate-400 uppercase tracking-widest px-1">Global Features & Access Control</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {currentUser.role === UserRole.ADMIN && (
              <Card className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg flex items-center justify-center text-xs">
                      <i className="fa-solid fa-person-shelter"></i>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Igathpuri Meetup</h4>
                  </div>
                  <Toggle active={isIgatpuriEnabled} onChange={handleToggleIgatpuri} />
                </div>
                <p className="text-2xs text-slate-500 leading-relaxed font-medium">Enable or disable the Igathpuri Meetup booking and approval system for all users.</p>
              </Card>
            )}

            <Card className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center text-xs">
                    <i className="fa-solid fa-comments"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Chat Support</h4>
                </div>
                <Toggle active={isChatEnabled} onChange={handleToggleChat} />
              </div>
              <p className="text-2xs text-slate-500 leading-relaxed font-medium">Enable or disable live chat support between Employees and PNC/Admin teams.</p>
            </Card>

            {currentUser.role === UserRole.ADMIN && (
              <Card className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center text-xs">
                      <i className="fa-solid fa-envelope"></i>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Email Password Login</h4>
                  </div>
                  <Toggle active={isEmailLoginEnabled} onChange={handleToggleEmailLogin} />
                </div>
                <p className="text-2xs text-slate-500 leading-relaxed font-medium">Allow traditional email/password login alongside Google OAuth on the sign in page.</p>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Travel Notice Policies */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC_ADMIN) && (
        <section className="space-y-3">
          <h3 className="text-2xs font-bold text-slate-400 uppercase tracking-widest px-1">Advance Booking Deadlines</h3>
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {travelModePolicies.map(p => (
                <Input
                  key={p.id}
                  label={`${p.travelMode} Notice Days`}
                  type="number"
                  value={p.minAdvanceDays}
                  onChange={e => handleUpdateMinAdvanceDays(p.travelMode, parseInt(e.target.value) || 0)}
                />
              ))}
            </div>
          </Card>
        </section>
      )}

      {/* Admin Policy Settings */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC_ADMIN) && (
        <section className="space-y-3">
          <h3 className="text-2xs font-bold text-slate-400 uppercase tracking-widest px-1">Approval & Verification Settings</h3>
          <Card className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
              <Input
                label="Auto-approval Limit (₹)"
                type="number"
                value={policy.autoApproveBelowAmount}
                onChange={e => setPolicy({ ...policy, autoApproveBelowAmount: parseInt(e.target.value) || 0 })}
                onBlur={() => handleUpdatePolicy({ autoApproveBelowAmount: policy.autoApproveBelowAmount })}
              />

              <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <h5 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Enforce Profile Lock</h5>
                  <p className="text-2xs text-slate-500 mt-0.5">Restrict unverified users from placing travel requests.</p>
                </div>
                <Toggle active={policy.isEnforcementEnabled} onChange={() => handleUpdatePolicy({ isEnforcementEnabled: !policy.isEnforcementEnabled })} />
              </div>
            </div>

            {/* 1. Generic Turnaround Time (SLA) Targets */}
            <div className="border-t border-slate-100 dark:border-neutral-800 pt-5 space-y-3">
              <div>
                <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <i className="fa-solid fa-stopwatch text-indigo-500"></i>
                  1. Generic Turnaround Time (SLA) Targets
                </h4>
                <p className="text-2xs text-slate-500 dark:text-neutral-400 mt-0.5">
                  Base turnaround SLAs applied across standard travel approvals and fulfillment.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <Input
                  label="Manager Approval TAT (Hours)"
                  type="number"
                  value={policy.tatApprovalHours || 24}
                  onChange={e => setPolicy({ ...policy, tatApprovalHours: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleUpdatePolicy({ tatApprovalHours: policy.tatApprovalHours })}
                />
                <Input
                  label="PNC Processing TAT (Hours)"
                  type="number"
                  value={policy.tatProcessingHours || 48}
                  onChange={e => setPolicy({ ...policy, tatProcessingHours: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleUpdatePolicy({ tatProcessingHours: policy.tatProcessingHours })}
                />
                <Input
                  label="Ticketing Fulfillment TAT (Hours)"
                  type="number"
                  value={policy.tatBookingHours || 72}
                  onChange={e => setPolicy({ ...policy, tatBookingHours: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleUpdatePolicy({ tatBookingHours: policy.tatBookingHours })}
                />
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
                      policy.enableUrgencySla
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400'
                    }`}>
                      {policy.enableUrgencySla ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    When enabled, ticketing turnaround SLAs are customized per urgency tier (Critical, High, Medium, Low) instead of using the generic ticketing TAT ({policy.tatBookingHours || 72}h).
                  </p>
                </div>
                <Toggle
                  active={policy.enableUrgencySla === true}
                  onChange={() => handleUpdatePolicy({ enableUrgencySla: !policy.enableUrgencySla })}
                />
              </div>
            </div>

            {/* 3. Dynamic Booking Urgency Tiers & Auto-Escalation */}
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
                        &lt; {policy.urgencyThresholds?.criticalDays ?? 2}d
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
                          value={policy.urgencyThresholds?.criticalDays ?? 2}
                          onChange={e => handleUpdatePolicy({
                            urgencyThresholds: {
                              criticalDays: parseInt(e.target.value) || 1,
                              highDays: policy.urgencyThresholds?.highDays ?? 10,
                              mediumDays: policy.urgencyThresholds?.mediumDays ?? 20
                            }
                          })}
                          className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                        <span className="text-2xs text-slate-400">days</span>
                      </div>
                    </div>
                    {policy.enableUrgencySla ? (
                      <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                        <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Urgency SLA</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={policy.urgencySlaHours?.critical ?? 4}
                            onChange={e => handleUpdatePolicy({
                              urgencySlaHours: {
                                critical: parseInt(e.target.value) || 1,
                                high: policy.urgencySlaHours?.high ?? 12,
                                medium: policy.urgencySlaHours?.medium ?? 24,
                                low: policy.urgencySlaHours?.low ?? 48
                              }
                            })}
                            className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-neutral-800 text-rose-700 dark:text-rose-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                          <span className="text-2xs text-slate-400">hrs</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                        <span>SLA Rule</span>
                        <span className="font-mono">Generic ({policy.tatBookingHours || 72}h)</span>
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
                        {policy.urgencyThresholds?.criticalDays ?? 2} – {policy.urgencyThresholds?.highDays ?? 10}d
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
                          value={policy.urgencyThresholds?.highDays ?? 10}
                          onChange={e => handleUpdatePolicy({
                            urgencyThresholds: {
                              criticalDays: policy.urgencyThresholds?.criticalDays ?? 2,
                              highDays: parseInt(e.target.value) || 10,
                              mediumDays: policy.urgencyThresholds?.mediumDays ?? 20
                            }
                          })}
                          className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <span className="text-2xs text-slate-400">days</span>
                      </div>
                    </div>
                    {policy.enableUrgencySla ? (
                      <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Urgency SLA</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={policy.urgencySlaHours?.high ?? 12}
                            onChange={e => handleUpdatePolicy({
                              urgencySlaHours: {
                                critical: policy.urgencySlaHours?.critical ?? 4,
                                high: parseInt(e.target.value) || 1,
                                medium: policy.urgencySlaHours?.medium ?? 24,
                                low: policy.urgencySlaHours?.low ?? 48
                              }
                            })}
                            className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-neutral-800 text-amber-700 dark:text-amber-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <span className="text-2xs text-slate-400">hrs</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                        <span>SLA Rule</span>
                        <span className="font-mono">Generic ({policy.tatBookingHours || 72}h)</span>
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
                        {policy.urgencyThresholds?.highDays ?? 10} – {policy.urgencyThresholds?.mediumDays ?? 20}d
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
                          value={policy.urgencyThresholds?.mediumDays ?? 20}
                          onChange={e => handleUpdatePolicy({
                            urgencyThresholds: {
                              criticalDays: policy.urgencyThresholds?.criticalDays ?? 2,
                              highDays: policy.urgencyThresholds?.highDays ?? 10,
                              mediumDays: parseInt(e.target.value) || 20
                            }
                          })}
                          className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                        <span className="text-2xs text-slate-400">days</span>
                      </div>
                    </div>
                    {policy.enableUrgencySla ? (
                      <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                        <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">Urgency SLA</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={policy.urgencySlaHours?.medium ?? 24}
                            onChange={e => handleUpdatePolicy({
                              urgencySlaHours: {
                                critical: policy.urgencySlaHours?.critical ?? 4,
                                high: policy.urgencySlaHours?.high ?? 12,
                                medium: parseInt(e.target.value) || 1,
                                low: policy.urgencySlaHours?.low ?? 48
                              }
                            })}
                            className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-neutral-800 text-sky-700 dark:text-sky-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <span className="text-2xs text-slate-400">hrs</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                        <span>SLA Rule</span>
                        <span className="font-mono">Generic ({policy.tatBookingHours || 72}h)</span>
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
                        &gt; {policy.urgencyThresholds?.mediumDays ?? 20}d
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-snug">
                      Advance travel planned well ahead with comfortable ticketing buffer.
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-neutral-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-600 dark:text-neutral-400">Threshold</span>
                      <span className="text-2xs font-mono text-slate-500 dark:text-neutral-400 font-semibold">&gt; {policy.urgencyThresholds?.mediumDays ?? 20} days</span>
                    </div>
                    {policy.enableUrgencySla ? (
                      <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200/80 dark:border-neutral-800/80">
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Urgency SLA</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={policy.urgencySlaHours?.low ?? 48}
                            onChange={e => handleUpdatePolicy({
                              urgencySlaHours: {
                                critical: policy.urgencySlaHours?.critical ?? 4,
                                high: policy.urgencySlaHours?.high ?? 12,
                                medium: policy.urgencySlaHours?.medium ?? 24,
                                low: parseInt(e.target.value) || 1
                              }
                            })}
                            className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-neutral-800 text-emerald-700 dark:text-emerald-300 shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-2xs text-slate-400">hrs</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 dark:text-neutral-500 flex items-center justify-between pt-0.5">
                        <span>SLA Rule</span>
                        <span className="font-mono">Generic ({policy.tatBookingHours || 72}h)</span>
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
                  active={policy.allowRequesterUrgency === true}
                  onChange={() => handleUpdatePolicy({ allowRequesterUrgency: !policy.allowRequesterUrgency })}
                />
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Global Email CC Configuration */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC_ADMIN) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-2xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-solid fa-at text-indigo-500"></i>
              Global Transactional Email CC
            </h3>
            <span className="text-2xs text-slate-400 font-mono">
              {globalCcList.length} configured
            </span>
          </div>

          <Card className="p-5 space-y-4">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Centrally Configured CC Recipients</h4>
              <p className="text-2xs text-slate-500 mt-0.5">
                All automated transactional lifecycle emails (approvals, booking confirmations, cancellations) copy these addresses automatically.
              </p>
            </div>

            {/* Add New CC Email */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
              <div className="flex-1">
                <Input
                  label="Add CC Email Address"
                  type="email"
                  placeholder="e.g. audit.team@navgurukul.org"
                  value={newCcInput}
                  onChange={e => setNewCcInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCc();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddCc}
                disabled={isSavingCc || !newCcInput.trim()}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 h-[40px] whitespace-nowrap"
              >
                <i className="fa-solid fa-plus text-2xs"></i> Add Address
              </button>
            </div>

            {/* CC List */}
            <div className="space-y-2 pt-1">
              <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Active CC List</p>
              {globalCcList.length === 0 ? (
                <p className="text-2xs text-slate-400 italic py-3 text-center border border-dashed rounded-lg">
                  No global CC addresses configured.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {globalCcList.map(email => (
                    <div
                      key={email}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[9px]">
                          @
                        </div>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate text-2xs">{email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCc(email)}
                        disabled={isSavingCc}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors opacity-80 group-hover:opacity-100"
                        title="Remove CC address"
                      >
                        <i className="fa-solid fa-trash-can text-2xs"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* Cancellation Policy Splits */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC_ADMIN) && (
        <section className="space-y-3">
          <h3 className="text-2xs font-bold text-slate-400 uppercase tracking-widest px-1">Cancellation Policy Splits</h3>
          <Card className="p-5 space-y-5">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white mb-3">When Cancelled by PNC</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <Input
                  label="NavGurukul Coverage (%)"
                  type="number"
                  value={policy.cancellationPncNgCover || 0}
                  onChange={e => {
                    let val = parseInt(e.target.value) || 0;
                    val = val > 100 ? 100 : val < 0 ? 0 : val;
                    setPolicy({ ...policy, cancellationPncNgCover: val, cancellationPncEmpCover: 100 - val });
                  }}
                  onBlur={() => handleUpdatePolicy({ cancellationPncNgCover: policy.cancellationPncNgCover, cancellationPncEmpCover: 100 - policy.cancellationPncNgCover })}
                />
                <Input
                  label="Employee Coverage (%)"
                  type="number"
                  value={policy.cancellationPncEmpCover || 0}
                  onChange={e => {
                    let val = parseInt(e.target.value) || 0;
                    val = val > 100 ? 100 : val < 0 ? 0 : val;
                    setPolicy({ ...policy, cancellationPncEmpCover: val, cancellationPncNgCover: 100 - val });
                  }}
                  onBlur={() => handleUpdatePolicy({ cancellationPncNgCover: 100 - policy.cancellationPncEmpCover, cancellationPncEmpCover: policy.cancellationPncEmpCover })}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white mb-3">When Cancelled by Employee</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <Input
                  label="NavGurukul Coverage (%)"
                  type="number"
                  value={policy.cancellationEmpNgCover || 0}
                  onChange={e => {
                    let val = parseInt(e.target.value) || 0;
                    val = val > 100 ? 100 : val < 0 ? 0 : val;
                    setPolicy({ ...policy, cancellationEmpNgCover: val, cancellationEmpEmpCover: 100 - val });
                  }}
                  onBlur={() => handleUpdatePolicy({ cancellationEmpNgCover: policy.cancellationEmpNgCover, cancellationEmpEmpCover: 100 - policy.cancellationEmpNgCover })}
                />
                <Input
                  label="Employee Coverage (%)"
                  type="number"
                  value={policy.cancellationEmpEmpCover || 0}
                  onChange={e => {
                    let val = parseInt(e.target.value) || 0;
                    val = val > 100 ? 100 : val < 0 ? 0 : val;
                    setPolicy({ ...policy, cancellationEmpEmpCover: val, cancellationEmpNgCover: 100 - val });
                  }}
                  onBlur={() => handleUpdatePolicy({ cancellationEmpNgCover: 100 - policy.cancellationEmpEmpCover, cancellationEmpEmpCover: policy.cancellationEmpEmpCover })}
                />
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Igathpuri Meetup Configuration */}
      {isIgatpuriEnabled && currentUser.role === UserRole.ADMIN && (
        <section className="space-y-3">
          <h3 className="text-2xs font-bold text-slate-400 uppercase tracking-widest px-1">Igathpuri Location Settings</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center text-xs">
                      <i className="fa-solid fa-users"></i>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Capacity Limit</h4>
                  </div>
                  <Toggle active={isCapacityEnabled} onChange={handleToggleCapacity} />
                </div>
                {isCapacityEnabled && (
                  <Input
                    label="Maximum Occupancy"
                    type="number"
                    value={totalSeats}
                    onChange={e => handleUpdateSeats(parseInt(e.target.value) || 0)}
                  />
                )}
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg flex items-center justify-center text-xs">
                      <i className="fa-solid fa-calendar-days"></i>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Availability Calendar</h4>
                  </div>
                  <Toggle active={isCalendarEnabled} onChange={handleToggleCalendar} />
                </div>
                <p className="text-2xs text-slate-500 leading-relaxed font-medium">Toggle visibility of the interactive booking calendar for employees.</p>
              </Card>
            </div>

            {/* Approvers List */}
            <Card className="p-5 space-y-5">
              <div className="flex items-start gap-3 pb-4 border-b dark:border-slate-800">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center text-base shadow-2xs shrink-0">
                  <i className="fa-solid fa-user-check"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white text-sm sm:text-base tracking-tight">Meetup Approvers</h4>
                  <p className="text-2xs text-slate-500 mt-0.5 font-medium">Individuals authorized to confirm location availability for groups.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Add New */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h5 className="text-2xs font-bold text-slate-400 uppercase tracking-widest">Add Authorized Person</h5>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <i className="fa-solid fa-magnifying-glass text-slate-400 text-xs"></i>
                      </div>
                      <input
                        type="text"
                        placeholder="Search PNC/Admin users by name or email..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                        value={pncSearch}
                        onChange={e => setPncSearch(e.target.value)}
                      />

                      {pncSearch.trim() !== '' && filteredPncUsers.length > 0 && (
                        <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                          {filteredPncUsers.map(user => (
                            <button
                              key={user.id}
                              onClick={() => handleAddApprover(user)}
                              className="w-full flex items-center gap-3 p-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all border-b last:border-0 border-slate-100 dark:border-slate-800 group text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-black flex-shrink-0">
                                {user.name ? user.name.charAt(0).toUpperCase() : <i className="fa-solid fa-user"></i>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{user.name || 'Unnamed User'}</p>
                                <p className="text-2xs text-slate-500 truncate">{user.email}</p>
                              </div>
                              <div className="flex-shrink-0">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${user.role === UserRole.ADMIN
                                  ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  }`}>{user.role}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {pncSearch.trim() !== '' && filteredPncUsers.length === 0 && (
                        <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-3 text-center">
                          <p className="text-xs text-slate-500 font-medium">No users found for "{pncSearch}"</p>
                          <p className="text-2xs text-slate-400 mt-0.5">Try a different name or email. Only PNC and Admin users can be added.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-900/5 border border-emerald-100 dark:border-emerald-800/20 rounded-lg flex gap-3">
                    <i className="fa-solid fa-circle-info text-emerald-500 mt-0.5 text-xs shrink-0"></i>
                    <p className="text-2xs text-emerald-700 dark:text-emerald-400/80 leading-relaxed font-medium">
                      Approvers will receive notifications for location availability checks and can approve or deny requests directly from their workspace.
                    </p>
                  </div>
                </div>

                {/* Right: Current List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-2xs font-bold text-slate-400 uppercase tracking-widest">Active Approvers</h5>
                    <span className="text-2xs bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded font-bold">{meetupApprovers.filter(a => a.is_active).length} persons</span>
                  </div>

                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1.5 custom-scrollbar">
                    {approversLoading ? (
                      <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                        <i className="fa-solid fa-spinner fa-spin text-lg text-emerald-500"></i>
                        <span className="text-2xs font-bold uppercase tracking-widest">Loading List...</span>
                      </div>
                    ) : meetupApprovers.length === 0 ? (
                      <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest italic">No approvers configured</p>
                      </div>
                    ) : (
                      meetupApprovers.map((a) => (
                        <div key={a.id} className={`flex items-center justify-between p-2.5 rounded-lg border transition-all duration-200 group ${a.is_active ? 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-2xs' : 'bg-slate-50/50 dark:bg-slate-800/10 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition-all ${a.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                              {a.name?.charAt(0) || <i className="fa-solid fa-user text-3xs"></i>}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight">{a.name || 'Staff'}</p>
                              <p className="text-2xs text-slate-400 font-medium">{a.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleToggleApprover(a.id, a.is_active)}
                              className={`p-1.5 rounded transition-colors ${a.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                            >
                              <i className={`fa-solid ${a.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} text-base`}></i>
                            </button>
                            <button onClick={() => handleDeleteApprover(a.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded">
                              <i className="fa-solid fa-trash-can text-2xs"></i>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
};

export default PolicyManagement;
