import React from 'react';
import Toggle from './Toggle';
import { PageBanner } from './PageBanner';

interface SettingsViewProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ isDarkMode, onToggleTheme }) => (
  <div className="max-w-2xl space-y-6 animate-in fade-in duration-500 transition-all duration-300">
    <PageBanner
      title="Application Settings"
      description="Configure your workspace visual theme, display options, and personal preferences."
      icon="fa-gear"
    />
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-lg space-y-8 shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between transition-colors duration-300">
        <div>
          <h4 className="text-lg font-bold text-slate-800 dark:text-white transition-colors duration-300">Dark Mode</h4>
          <p className="text-sm text-slate-500 font-medium transition-colors duration-300">Toggle application appearance for better viewing.</p>
        </div>
        <Toggle active={isDarkMode} onChange={onToggleTheme} />
      </div>
      <div className="pt-8 border-t dark:border-slate-800 text-center text-xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">v2.5.0 Stable Build</div>
    </div>
  </div>
);

export default SettingsView;
