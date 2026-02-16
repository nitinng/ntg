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
        <div className="space-y-2.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <textarea
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                rows={rows}
                className={`w-full px-4 py-2.5 border rounded-lg text-base transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${disabled
                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500'
                    }`}
            />
        </div>
    );
};

export default TextArea;
