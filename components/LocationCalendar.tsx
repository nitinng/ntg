import React, { useState } from 'react';
import Card from './Card';

export const LocationCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const days = [];
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }

  for (let i = 1; i <= totalDays; i++) {
    days.push(i);
  }

  const getStatus = (day: number | null) => {
    if (!day) return null;
    if (day >= 15 && day <= 18) return 'booked';
    const date = new Date(year, month, day);
    if (date.getDay() === 0 || date.getDay() === 6) return 'tentative';
    return 'available';
  };

  return (
    <Card className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-calendar-days text-violet-500"></i>
            Availability Calendar
          </h4>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Reference Only • Confirm with Approvers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1))}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all"
          >
            <i className="fa-solid fa-chevron-left text-xs"></i>
          </button>
          <span className="text-sm font-black text-slate-700 dark:text-slate-300 min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1))}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all"
          >
            <i className="fa-solid fa-chevron-right text-xs"></i>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-xs font-black text-slate-400 text-center uppercase py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          const status = getStatus(day);
          return (
            <div
              key={idx}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all group ${!day ? 'opacity-0' : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700'
                }`}
            >
              {day && (
                <>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{day}</span>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${status === 'booked' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                    status === 'tentative' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}></div>

                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all scale-90 group-hover:scale-100 z-20 whitespace-nowrap">
                    {status === 'booked' ? 'Confirmed Workshop' : status === 'tentative' ? 'Tentative' : 'Available'}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
        {[
          { label: 'Available', color: 'bg-emerald-500' },
          { label: 'Confirmed Meetup', color: 'bg-rose-500' },
          { label: 'Tentative / Weekend', color: 'bg-amber-500' }
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${l.color}`}></div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{l.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default LocationCalendar;
