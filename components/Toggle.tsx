import React from 'react';

export interface ToggleProps {
  active: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export const Toggle: React.FC<ToggleProps> = ({
  active,
  onChange,
  disabled = false,
  label,
  size = 'md'
}) => {
  const isSm = size === 'sm';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={onChange}
      className={`group relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 ${
        isSm ? 'h-5 w-9 p-0.5' : 'h-6 w-11 p-0.5'
      } ${
        active
          ? 'bg-indigo-600 dark:bg-indigo-500 shadow-sm shadow-indigo-600/30'
          : 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
      }`}
    >
      {label && <span className="sr-only">{label}</span>}
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${
          isSm
            ? `h-4 w-4 ${active ? 'translate-x-4' : 'translate-x-0'}`
            : `h-5 w-5 ${active ? 'translate-x-5' : 'translate-x-0'}`
        }`}
      />
    </button>
  );
};

export default Toggle;
