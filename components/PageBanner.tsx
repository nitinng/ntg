import React from 'react';

interface PageBannerProps {
  title: string;
  description?: string;
  icon?: string;
  gradient?: string;
  children?: React.ReactNode;
}

export const PageBanner: React.FC<PageBannerProps> = ({
  title,
  description,
  icon = 'fa-plane',
  gradient = 'from-indigo-700 via-indigo-600 to-indigo-500 dark:from-indigo-950 dark:via-indigo-900 dark:to-indigo-800',
  children
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden relative">
      <div className={`bg-gradient-to-r ${gradient} text-white px-4 py-7 md:py-8 md:px-8 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        {icon && (
          <div className="absolute right-0 top-0 text-[8rem] opacity-5 pointer-events-none transform translate-x-4 -translate-y-4">
            <i className={`fa-solid ${icon}`}></i>
          </div>
        )}
        <div className="relative z-10">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight mb-1">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-indigo-100 dark:text-indigo-200/90 max-w-2xl font-medium leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {children && (
          <div className="relative z-10 flex items-center gap-3">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageBanner;
