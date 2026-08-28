import React from 'react';
import { TravelRequest, PNCStatus } from '../types';

interface PastRequestsViewProps {
  requests: TravelRequest[];
  onView: (request: TravelRequest) => void;
}

export const PastRequestsView: React.FC<PastRequestsViewProps> = ({ requests, onView }) => {
  const closedRequests = requests.filter((r: any) =>
    r.pncStatus === PNCStatus.BOOKED ||
    r.pncStatus === PNCStatus.REJECTED_BY_PNC ||
    r.pncStatus === PNCStatus.REJECTED_BY_MANAGER ||
    r.pncStatus === PNCStatus.CLOSED
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Past Requests</h2>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300">
            <tr>
              <th className="px-6 py-5">Request ID</th>
              <th className="px-6 py-5">Destination</th>
              <th className="px-6 py-5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-800 transition-colors duration-300">
            {closedRequests.map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-300">
                <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 transition-colors duration-300">{r.submissionId || r.id}</td>
                <td className="px-6 py-4 font-bold text-slate-800 dark:text-white transition-colors duration-300">{r.to}</td>
                <td className="px-6 py-4 text-right pr-6 transition-colors duration-300">
                  <button onClick={() => onView(r)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors duration-300 text-slate-300 hover:text-indigo-600">
                    <i className="fa-solid fa-circle-info text-lg"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedRequests.length === 0 && (
          <div className="py-20 text-center text-slate-400 font-medium transition-colors duration-300">No past travel requests found.</div>
        )}
      </div>
    </div>
  );
};

export default PastRequestsView;
