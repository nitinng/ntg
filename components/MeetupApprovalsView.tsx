import React from 'react';
import { MeetupAvailabilityRequest } from '../types';
import Card from './Card';

interface MeetupApprovalsViewProps {
  requests: MeetupAvailabilityRequest[];
  onUpdate: (req: MeetupAvailabilityRequest, status: 'Approved' | 'Rejected') => void;
}

export const MeetupApprovalsView: React.FC<MeetupApprovalsViewProps> = ({ requests, onUpdate }) => {
  const pending = requests.filter(r => r.status === 'Pending');
  const history = requests.filter(r => r.status !== 'Pending');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Meetup Approvals</h2>
        <p className="text-slate-500 text-sm mt-1">Review and action Igathpuri location availability requests.</p>
      </header>

      <div className="space-y-6">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <i className="fa-solid fa-clock text-amber-500"></i>
          Pending Requests ({pending.length})
        </h3>

        {pending.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-slate-400 font-bold italic">No pending requests at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pending.map(r => (
              <Card key={r.id} className="p-6 space-y-4 hover:border-violet-500/50 transition-all group">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-lg text-slate-900 dark:text-white uppercase tracking-tight">{r.fullName}</h4>
                    <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">{r.department}</p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs font-black text-slate-500 uppercase">
                    {r.teamSize} Members
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {new Date(r.startDate).toLocaleDateString()} - {new Date(r.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Contact</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{r.phone}</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => onUpdate(r, 'Rejected')}
                    className="flex-1 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-rose-600 font-black uppercase tracking-widest text-xs rounded-lg hover:bg-rose-50 transition-all"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => onUpdate(r, 'Approved')}
                    className="flex-[2] py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-lg shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    Approve Availability
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-6 pt-8">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i className="fa-solid fa-history text-slate-400"></i>
              Recent Actions
            </h3>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-8 py-5">Requestor</th>
                    <th className="px-8 py-5">Team Size</th>
                    <th className="px-8 py-5">Dates</th>
                    <th className="px-8 py-5">Status</th>
                    <th className="px-8 py-5 text-right">Processed On</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {history.map(r => (
                    <tr key={r.id}>
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold text-slate-800 dark:text-white">{r.fullName}</p>
                        <p className="text-xs text-slate-500 font-medium">{r.email}</p>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                          {r.teamSize} Members
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400 italic">
                          {new Date(r.startDate).toLocaleDateString()} → {new Date(r.endDate).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right text-xs font-bold text-slate-400">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetupApprovalsView;
