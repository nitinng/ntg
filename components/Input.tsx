import React from 'react';

interface InputProps {
    label?: string;
    value: string | number;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    min?: string;
    max?: string;
    readOnly?: boolean;
    className?: string;
    error?: string;
}

const Input = ({
    label,
    value,
    onChange = () => { },
    onBlur,
    onKeyDown,
    type = 'text',
    placeholder = '',
    disabled = false,
    required = false,
    min,
    max,
    readOnly = false,
    className = '',
    error
}: InputProps) => {
    return (
        <div className={`space-y-1.5 ${className}`}>
            {label && (
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {label} {required && <span className="text-rose-500">*</span>}
                </label>
            )}
            <input
                type={type}
                value={value ?? ''}
                onChange={onChange}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                min={min}
                max={max}
                className={`w-full px-4 py-3 bg-white dark:bg-slate-900 border rounded-md text-sm font-medium transition-all focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 ${
                    error
                        ? 'border-rose-500 text-rose-900 dark:text-rose-100 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500'
                        : 'border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'
                } ${disabled || readOnly
                    ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50'
                    : 'hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
            />
            {error && (
                <p className="text-xs text-rose-500 font-medium ml-1 flex items-center gap-1.5 animate-in fade-in duration-200">
                    <i className="fa-solid fa-circle-exclamation text-xs"></i>
                    {error}
                </p>
            )}
        </div>
    );
};

export default Input;
