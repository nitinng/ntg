import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

export const Card = ({ children, className = "", ...props }: CardProps) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden transition-all duration-300 ${className}`} {...props}>
    {children}
  </div>
);

export default Card;
