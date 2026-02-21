import React from 'react';

interface SelectProps {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
}

const Select = ({
    label,
    value,
    onChange,
    options,
    placeholder = 'Select an option...',
    disabled = false,
    required = false
}: SelectProps) => {
    return (
        <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                {label} {required && <span className="text-rose-500">*</span>}
            </label>
            <div className="relative">
                <select
                    value={value ?? ''}
                    onChange={onChange}
                    disabled={disabled}
                    className={`w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium transition-all focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none appearance-none cursor-pointer ${disabled
                        ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50'
                        : 'hover:border-slate-300 dark:hover:border-slate-700 text-slate-900 dark:text-white'
                        }`}
                >
                    {placeholder && <option value="" disabled>{placeholder}</option>}
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <i className="fa-solid fa-chevron-down text-[10px]"></i>
                </div>
            </div>
        </div>
    );
};

export default Select;
