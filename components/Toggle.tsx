import React from 'react';

interface ToggleProps {
  active: boolean;
  onChange: () => void;
}

export const Toggle = ({ active, onChange }: ToggleProps) => (
  <button onClick={onChange} className={`w-11 h-6 rounded-full relative transition-all duration-200 active:scale-95 ${active ? 'bg-indigo-600 ring-2 ring-indigo-500/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-200 ${active ? 'right-1' : 'left-1'}`}></div>
  </button>
);

export default Toggle;
