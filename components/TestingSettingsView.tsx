import React, { useState } from 'react';
import { TestingSettings } from '../types';
import Card from './Card';
import Toggle from './Toggle';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface TestingSettingsViewProps {
  settings: TestingSettings;
  onUpdateSettings: (newSettings: TestingSettings) => void;
}

export const TestingSettingsView = ({ settings, onUpdateSettings }: TestingSettingsViewProps) => {
  const handleToggle = async (role: keyof TestingSettings) => {
    const updatedSettings = {
      ...settings,
      [role]: !settings[role]
    };
    
    // Optimistic UI update
    onUpdateSettings(updatedSettings);

    try {
      const { error } = await supabase.from('meetup_settings').upsert({
        setting_key: 'testing_mandatory_toggles',
        setting_value: updatedSettings as any,
        updated_at: new Date().toISOString()
      }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`${role.charAt(0).toUpperCase() + role.slice(1)} form validation toggle updated successfully.`);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to persist settings: ' + err.message);
      // Revert UI update if failed
      onUpdateSettings(settings);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Testing Settings</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Configure global testing settings to relax form validation rules during local verification.</p>
        </div>
      </div>

      <Card className="p-8 space-y-8 max-w-2xl border border-slate-200 dark:border-slate-800">
        <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Form Validation Toggles</h3>
          <p className="text-sm text-slate-500 font-medium">When turned ON, forms will require all mandatory fields (standard compliance). When turned OFF, validators are bypassed so you can submit partially empty forms for fast testing.</p>
        </div>

        <div className="space-y-6">
          {/* Admin Toggle */}
          <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-900/50">
            <div>
              <h4 className="text-md font-bold text-slate-800 dark:text-white">Admin Role Validation</h4>
              <p className="text-xs text-slate-500 mt-0.5">Enforces mandatory inputs on booking requests submitted by Admin users.</p>
            </div>
            <Toggle active={settings.admin} onChange={() => handleToggle('admin')} />
          </div>

          {/* PNC Toggle */}
          <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-900/50">
            <div>
              <h4 className="text-md font-bold text-slate-800 dark:text-white">PNC Role Validation</h4>
              <p className="text-xs text-slate-500 mt-0.5">Enforces mandatory inputs on self-booking and processing operations by PNC users.</p>
            </div>
            <Toggle active={settings.pnc} onChange={() => handleToggle('pnc')} />
          </div>

          {/* Employee Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <h4 className="text-md font-bold text-slate-800 dark:text-white">Employee Role Validation</h4>
              <p className="text-xs text-slate-500 mt-0.5">Enforces mandatory inputs on onboarding and request submissions by Employee users.</p>
            </div>
            <Toggle active={settings.employee} onChange={() => handleToggle('employee')} />
          </div>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl flex gap-3 text-sm text-amber-800 dark:text-amber-450 leading-relaxed font-medium">
          <i className="fa-solid fa-circle-info mt-0.5 text-amber-500"></i>
          <div>
            These toggles apply globally to the active user role filling out a booking request or recording tickets.
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TestingSettingsView;
