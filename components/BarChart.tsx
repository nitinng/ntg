import React from 'react';

interface BarChartProps {
  data: { label: string; value: number }[];
  color?: string;
}

export const BarChart = ({ data, color = 'bg-indigo-500' }: BarChartProps) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex justify-between h-40 gap-2 pt-4 items-stretch">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end group">
          <div className="relative w-full flex-1 flex items-end justify-center px-1">
            <div
              className={`w-full max-w-[2rem] rounded-t-md transition-all duration-500 group-hover:opacity-80 ${color}`}
              style={{ height: `${Math.max((d.value / max) * 100, 1)}%` }}
            ></div>
            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold bg-slate-800 text-white px-2 py-1 rounded-lg pointer-events-none whitespace-nowrap z-10">
              {d.value}
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-tight truncate w-full text-center block h-4">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

export default BarChart;
