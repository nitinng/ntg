import React from 'react';

interface TextAreaProps {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    rows?: number;
}

const TextArea = ({
    label,
    value,
    onChange,
    placeholder = '',
    disabled = false,
    required = false,
    rows = 3
}: TextAreaProps) => {
    return (
        <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                {label} {required && <span className="text-rose-500">*</span>}
            </label>
            <textarea
                value={value ?? ''}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                rows={rows}
                className={`w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium transition-all focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 ${disabled
                    ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50'
                    : 'hover:border-slate-300 dark:hover:border-slate-700 text-slate-900 dark:text-white'
                    }`}
            />
        </div>
    );
};

export default TextArea;
