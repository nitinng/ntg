import React, { useState } from 'react';
import { TravelRequest } from '../types';
import Card from './Card';

interface CancellationRequestsQueueProps {
  requests: TravelRequest[];
  onView: (request: TravelRequest) => void;
}

export const CancellationRequestsQueue: React.FC<CancellationRequestsQueueProps> = ({ requests, onView }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Filter requests by search term (traveler name, ID, or route)
  const filtered = requests.filter(r => 
    r.requesterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.submissionId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.to.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'Flight': return 'fa-plane text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30';
      case 'Train': return 'fa-train text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30';
      case 'Bus': return 'fa-bus text-amber-500 bg-amber-50 dark:bg-amber-900/30';
      default: return 'fa-ticket text-slate-500 bg-slate-50 dark:bg-slate-900/30';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Cancellation Requests</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">Review and process tickets requested for cancellation by employees.</p>
        </div>

        <div className="w-full sm:w-64 relative">
          <input
            type="text"
            placeholder="Search request ID, name, route..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full h-10 pl-10 pr-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium focus:border-indigo-600 outline-none transition-all"
          />
          <i className="fa-solid fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
        </div>
      </div>

      {paginated.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginated.map(request => (
            <Card key={request.id} className="p-5 flex flex-col h-full hover:shadow-lg transition-all border border-slate-200 dark:border-slate-800/80">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${getModeIcon(request.mode)}`}>
                    <i className={`fa-solid ${request.mode === 'Flight' ? 'fa-plane' : request.mode === 'Train' ? 'fa-train' : 'fa-bus'}`}></i>
                  </div>
                  <div>
                    <h3 className="font-black text-slate-950 dark:text-white leading-tight tracking-tight">
                      {request.submissionId || request.id.substring(0, 8)}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                      {request.requesterCampus || 'Unknown Campus'}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-900/10 dark:text-rose-400 dark:border-rose-800/50">
                  Pending PNC Action
                </span>
              </div>

              <div className="space-y-3 flex-grow">
                <div>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Traveler</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{request.requesterName}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Route</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5 truncate">{request.from} → {request.to}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Travel Date</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {new Date(request.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {request.cancelledReason && (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Reason</p>
                    <p className="text-xs text-slate-650 dark:text-slate-400 mt-0.5 font-medium italic">"{request.cancelledReason}"</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => onView(request)}
                className="w-full mt-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-colors shadow-md shadow-rose-200 dark:shadow-none"
              >
                Process Cancellation
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-6 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-250 dark:border-slate-800 rounded-2xl">
          <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/10 text-rose-500 rounded-full flex items-center justify-center mx-auto text-2xl border border-rose-100 dark:border-rose-900/30">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg">All caught up!</h3>
            <p className="text-slate-500 text-sm mt-1.5 font-medium">No pending cancellation requests in the queue.</p>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-4">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase transition-all"
          >
            Previous
          </button>
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase transition-all"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
