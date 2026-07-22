import React from 'react';
import Card from './Card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: string;
  trendUp?: boolean;
}

export const StatCard = ({ title, value, icon, description, trend, trendUp }: StatCardProps) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <div className="text-indigo-600 dark:text-indigo-400 opacity-60 text-lg">{icon}</div>
    </div>
    <div className="flex items-baseline gap-2">
      <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</h3>
      {trend && (
        <span className={`text-xs font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend}
        </span>
      )}
    </div>
    {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
  </Card>
);

export default StatCard;
