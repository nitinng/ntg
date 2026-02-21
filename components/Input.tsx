import React from 'react';

interface InputProps {
    label?: string;
    value: string | number;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    min?: string;
    max?: string;
    readOnly?: boolean;
    className?: string;
}

const Input = ({
    label,
    value,
    onChange = () => { },
    type = 'text',
    placeholder = '',
    disabled = false,
    required = false,
    min,
    max,
    readOnly = false,
    className = ''
}: InputProps) => {
    return (
        <div className={`space-y-2 ${className}`}>
            {label && (
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {label} {required && <span className="text-rose-500">*</span>}
                </label>
            )}
            <input
                type={type}
                value={value ?? ''}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                min={min}
                max={max}
                className={`w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium transition-all focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 ${disabled || readOnly
                    ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50'
                    : 'hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
            />
        </div>
    );
};

export default Input;
