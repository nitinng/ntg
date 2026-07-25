import React, { useState, useEffect } from 'react';
import { User, UserRole, PolicyConfig, TravelModePolicy } from '../types';
import Card from './Card';
import Input from './Input';
import Toggle from './Toggle';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

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

  useEffect(() => {
    const fetchData = async () => {
      setApproversLoading(true);
      try {
        const [approversRes, settingsRes] = await Promise.all([
          supabase
            .from('meetup_approvers')
            .select('*')
            .order('created_at', { ascending: true }),
          supabase
            .from('meetup_settings')
            .select('*')
            .in('setting_key', ['total_seats', 'is_capacity_enabled', 'is_calendar_enabled', 'is_igatpuri_enabled'])
        ]);

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
    (u.role === UserRole.PNC || u.role === UserRole.ADMIN) &&
    (u.name?.toLowerCase().includes(pncSearch.toLowerCase()) || u.email?.toLowerCase().includes(pncSearch.toLowerCase())) &&
    !meetupApprovers.some(a => a.email.toLowerCase() === u.email?.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Policy & System Settings</h2>
        <p className="text-slate-500 text-sm mt-1">Configure compliance rules, onboarding requirements, and global system toggles.</p>
      </header>

      {/* Global Module Controls */}
      {currentUser.role === UserRole.ADMIN && (
        <section className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Global Features & Access Control</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg flex items-center justify-center">
                    <i className="fa-solid fa-person-shelter"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white">Igathpuri Meetup</h4>
                </div>
                <Toggle active={isIgatpuriEnabled} onChange={handleToggleIgatpuri} />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">Enable or disable the Igathpuri Meetup booking and approval system for all users.</p>
            </Card>

            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center">
                    <i className="fa-solid fa-comments"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white">Chat Support</h4>
                </div>
                <Toggle active={isChatEnabled} onChange={handleToggleChat} />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">Enable or disable live chat support between Employees and PNC/Admin teams.</p>
            </Card>

            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center">
                    <i className="fa-solid fa-[#envelope] fa-envelope"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white">Email Password Login</h4>
                </div>
                <Toggle active={isEmailLoginEnabled} onChange={handleToggleEmailLogin} />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">Allow traditional email/password login alongside Google OAuth on the sign in page.</p>
            </Card>
          </div>
        </section>
      )}

      {/* Travel Notice Policies */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Advance Booking Deadlines</h3>
        <Card className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

      {/* Admin Policy Settings */}
      {currentUser.role === UserRole.ADMIN && (
        <section className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Approval & Verification Settings</h3>
          <Card className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Input
                label="Auto-approval Limit (₹)"
                type="number"
                value={policy.autoApproveBelowAmount}
                onChange={e => setPolicy({ ...policy, autoApproveBelowAmount: parseInt(e.target.value) || 0 })}
                onBlur={() => handleUpdatePolicy({ autoApproveBelowAmount: policy.autoApproveBelowAmount })}
              />

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-white text-sm">Enforce Profile Lock</h5>
                    <p className="text-xs text-slate-500 mt-0.5">Restrict unverified users from placing travel requests.</p>
                  </div>
                  <Toggle active={policy.isEnforcementEnabled} onChange={() => handleUpdatePolicy({ isEnforcementEnabled: !policy.isEnforcementEnabled })} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-8">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Turnaround Time (SLA) Targets</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </Card>
        </section>
      )}

      {/* Cancellation Policy (Admin & PNC) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === 'PNC') && (
        <section className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Cancellation Policy Splits</h3>
          <Card className="p-8 space-y-8">
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-4">When Cancelled by PNC</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
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

            <div className="border-t border-slate-100 dark:border-slate-800 pt-8">
              <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-4">When Cancelled by Employee</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
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
      {isIgatpuriEnabled && (
        <section className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Igathpuri Location Settings</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-users"></i>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white">Capacity Limit</h4>
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

              <Card className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-calendar-days"></i>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white">Availability Calendar</h4>
                  </div>
                  <Toggle active={isCalendarEnabled} onChange={handleToggleCalendar} />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">Toggle visibility of the interactive booking calendar for employees.</p>
              </Card>
            </div>

            {/* Approvers List */}
            <Card className="p-8 space-y-8">
              <div className="flex items-start gap-4 pb-6 border-b dark:border-slate-800">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center text-xl shadow-sm">
                  <i className="fa-solid fa-user-check"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">Meetup Approvers</h4>
                  <p className="text-sm text-slate-500 mt-1 font-medium">Individuals authorized to confirm location availability for groups.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Left: Add New */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest">Add Authorized Person</h5>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
                      </div>
                      <input
                        type="text"
                        placeholder="Search PNC/Admin users by name or email..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-11 pr-4 py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                        value={pncSearch}
                        onChange={e => setPncSearch(e.target.value)}
                      />

                      {pncSearch.trim() !== '' && filteredPncUsers.length > 0 && (
                        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                          {filteredPncUsers.map(user => (
                            <button
                              key={user.id}
                              onClick={() => handleAddApprover(user)}
                              className="w-full flex items-center gap-4 p-4 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all border-b last:border-0 border-slate-100 dark:border-slate-800 group text-left"
                            >
                              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-black flex-shrink-0">
                                {user.name ? user.name.charAt(0).toUpperCase() : <i className="fa-solid fa-user"></i>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user.name || 'Unnamed User'}</p>
                                <p className="text-xs text-slate-500 truncate">{user.email}</p>
                              </div>
                              <div className="flex-shrink-0">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${user.role === UserRole.ADMIN
                                  ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  }`}>{user.role}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {pncSearch.trim() !== '' && filteredPncUsers.length === 0 && (
                        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl p-4 text-center">
                          <p className="text-sm text-slate-500 font-medium">No users found for "{pncSearch}"</p>
                          <p className="text-xs text-slate-400 mt-1">Try a different name or email. Only PNC and Admin users can be added.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-5 bg-emerald-50/50 dark:bg-emerald-900/5 border border-emerald-100 dark:border-emerald-800/20 rounded-lg flex gap-4">
                    <i className="fa-solid fa-circle-info text-emerald-500 mt-1"></i>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400/80 leading-relaxed font-medium">
                      Approvers will receive notifications for location availability checks and can approve or deny requests directly from their workspace.
                    </p>
                  </div>
                </div>

                {/* Right: Current List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Approvers</h5>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-black">{meetupApprovers.filter(a => a.is_active).length} PERSONS</span>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {approversLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-4">
                        <i className="fa-solid fa-spinner fa-spin text-2xl text-emerald-500"></i>
                        <span className="text-xs font-black uppercase tracking-widest">Loading List...</span>
                      </div>
                    ) : meetupApprovers.length === 0 ? (
                      <div className="py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest italic">No approvers configured</p>
                      </div>
                    ) : (
                      meetupApprovers.map((a) => (
                        <div key={a.id} className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-300 group ${a.is_active ? 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-800/10 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black transition-all ${a.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                              {a.name?.charAt(0) || <i className="fa-solid fa-user"></i>}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800 dark:text-white leading-none">{a.name || 'Staff'}</p>
                              <p className="text-xs text-slate-400 font-medium mt-1.5">{a.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleToggleApprover(a.id, a.is_active)}
                              className={`p-2 rounded-lg transition-colors ${a.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                            >
                              <i className={`fa-solid ${a.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} text-lg`}></i>
                            </button>
                            <button onClick={() => handleDeleteApprover(a.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                              <i className="fa-solid fa-trash-can"></i>
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
