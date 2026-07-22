import React, { useState } from 'react';
import { TravelRequest, PNCStatus } from '../types';

interface ManagerApprovalsViewProps {
  requests: TravelRequest[];
  onUpdate: (request: TravelRequest, newStatus: PNCStatus) => void;
  currentUser: any;
}

const ManagerApprovalModal = ({ request, onClose, onApprove, onReject }: any) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={onClose}></div>
    <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50 flex flex-col max-h-[90vh]">

      <div className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-slate-400 font-mono uppercase">{request.submissionId || request.id}</span>
            {request.hasViolation && <span className="text-xs font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-lg border border-rose-200">Policy Violation</span>}
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">Approval Request</h3>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><i className="fa-solid fa-xmark"></i></button>
      </div>

      <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
        {/* Traveler Info */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg flex items-center justify-center text-xl font-bold">
            {request.requesterName.charAt(0)}
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white">{request.requesterName}</h4>
            <p className="text-xs text-slate-500 font-medium">{request.requesterDepartment} • {request.requesterCampus}</p>
            <p className="text-xs text-slate-400 mt-0.5">{request.requesterEmail}</p>
          </div>
        </div>

        {/* Trip Details */}
        <div className="space-y-4">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800 pb-2">Trip Details</h4>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Route</p>
              <p className="font-bold text-slate-800 dark:text-white">{request.from} → {request.to}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Date</p>
              <p className="font-bold text-slate-800 dark:text-white">{new Date(request.dateOfTravel).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Mode</p>
              <p className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i className={`fa-solid ${request.mode === 'Flight' ? 'fa-plane' : request.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-indigo-500`}></i>
                {request.mode}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Trip Type</p>
              <p className="font-bold text-slate-800 dark:text-white">{request.tripType}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Purpose</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 italic">"{request.purpose}"</p>
          </div>
        </div>

        {/* Policy Violation Warning */}
        {request.hasViolation && (
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 p-4 rounded-lg flex gap-3">
            <i className="fa-solid fa-triangle-exclamation text-rose-500 mt-0.5"></i>
            <div>
              <h5 className="text-sm font-bold text-rose-700 dark:text-rose-400">Policy Violation Detected</h5>
              <p className="text-xs text-rose-600 dark:text-rose-300 mt-1">
                <span className="font-bold">Reason:</span> {request.violationDetails || 'Advance booking policy violation'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex gap-4">
        <button onClick={onReject} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 font-bold rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/10 hover:border-rose-200 transition-all uppercase tracking-wide text-xs">Reject</button>
        <button onClick={onApprove} className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all uppercase tracking-wide text-xs">Approve Request</button>
      </div>
    </div>
  </div>
);

export const ManagerApprovalsView = ({ requests, onUpdate }: ManagerApprovalsViewProps) => {
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Pending Approvals</h2>
        <p className="text-slate-500 text-sm mt-1">Review and action travel requests from your team.</p>
      </header>

      {requests.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 text-2xl">
            <i className="fa-solid fa-check-double"></i>
          </div>
          <h3 className="text-slate-900 dark:text-white font-bold">All Caught Up!</h3>
          <p className="text-slate-500 text-sm mt-1">You have no pending approvals at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((r: TravelRequest, idx: number) => {
            const themes = [
              {
                name: "Midnight Sapphire",
                grad: "from-indigo-50/50 to-white dark:from-indigo-900/40 dark:to-slate-900",
                badge: "text-indigo-600 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-500/10",
                iconBg: "text-indigo-900 dark:text-white",
                iconFg: "text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300",
                review: "text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300"
              },
              {
                name: "Deep Emerald",
                grad: "from-emerald-50/50 to-white dark:from-emerald-900/40 dark:to-slate-900",
                badge: "text-emerald-600 dark:text-emerald-400/80 bg-emerald-100 dark:bg-emerald-500/10",
                iconBg: "text-emerald-900 dark:text-white",
                iconFg: "text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
                review: "text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300"
              },
              {
                name: "Amber Sunrise",
                grad: "from-amber-50/50 to-white dark:from-amber-900/40 dark:to-slate-900",
                badge: "text-amber-600 dark:text-amber-400/80 bg-amber-100 dark:bg-amber-500/10",
                iconBg: "text-amber-900 dark:text-white",
                iconFg: "text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300",
                review: "text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300"
              },
              {
                name: "Stealth Obsidian",
                grad: "from-slate-100/50 to-white dark:from-slate-800 dark:to-slate-950",
                badge: "text-slate-700 dark:text-slate-300/80 bg-slate-200 dark:bg-slate-700/50",
                iconBg: "text-slate-800 dark:text-slate-700",
                iconFg: "text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200",
                review: "text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200"
              }
            ];
            const theme = themes[idx % 4];

            return (
              <div key={r.id} onClick={() => setSelectedRequest(r)} className="group relative bg-white dark:bg-slate-900 rounded-md flex flex-col sm:flex-row overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer shadow-sm hover:shadow-xl hover:shadow-slate-500/10 transition-all hover:-translate-y-1 duration-300">
                <div className={`flex-1 p-5 sm:p-6 relative overflow-hidden bg-gradient-to-br ${theme.grad} border-b sm:border-b-0 sm:border-r border-dashed border-slate-200 dark:border-slate-700`}>
                  <div className={`absolute -right-6 -bottom-6 opacity-[0.03] dark:opacity-[0.03] text-[8rem] pointer-events-none ${theme.iconBg}`}>
                    <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'}`}></i>
                  </div>
                  
                  <div className="flex justify-between items-center mb-5 relative z-10">
                    <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${theme.badge}`}>Option { (idx % 4) + 1 }: {theme.name}</span>
                    <span className="font-mono text-xs font-bold text-slate-500 tracking-wider">{r.submissionId || r.id}</span>
                  </div>

                  <div className="flex items-center justify-between mb-6 relative z-10">
                    <div className="text-left flex-1">
                      <p className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">{r.from.substring(0, 3)}</p>
                      <p className="text-xs sm:text-xs text-slate-500 dark:text-slate-400 font-bold truncate max-w-[80px] sm:max-w-[100px]">{r.from}</p>
                    </div>
                    
                    <div className="flex-[2] flex flex-col items-center justify-center px-2 sm:px-4">
                      <div className="w-full flex items-center opacity-60">
                        <div className="h-[2px] flex-1 bg-transparent border-t-[2px] border-dashed border-slate-300 dark:border-slate-600"></div>
                        <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'} ${theme.iconFg} mx-2 sm:mx-3 text-sm sm:text-lg group-hover:scale-125 transition-all duration-500`}></i>
                        <div className="h-[2px] flex-1 bg-transparent border-t-[2px] border-dashed border-slate-300 dark:border-slate-600"></div>
                      </div>
                    </div>

                    <div className="text-right flex-1">
                      <p className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">{r.to.substring(0, 3)}</p>
                      <p className="text-xs sm:text-xs text-slate-500 dark:text-slate-400 font-bold truncate max-w-[80px] sm:max-w-[100px]">{r.to}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-100 dark:border-slate-800/50 relative z-10">
                    <div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider mb-0.5">Passenger</p>
                      <p className="font-black text-sm text-slate-700 dark:text-slate-200 uppercase truncate max-w-[120px]">{r.requesterName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider mb-0.5">Class / Dept</p>
                      <p className="font-black text-sm text-slate-700 dark:text-slate-200 uppercase truncate max-w-[100px]">{r.requesterDepartment}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full sm:w-28 bg-slate-50 dark:bg-slate-900/50 flex flex-row sm:flex-col justify-between sm:justify-center items-center p-4 sm:p-0 relative overflow-hidden">
                  <div className="hidden sm:block absolute -left-3 top-[-10px] w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                  <div className="hidden sm:block absolute -left-3 bottom-[-10px] w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                  
                  <div className="block sm:hidden absolute left-[-10px] -top-3 w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                  <div className="block sm:hidden absolute right-[-10px] -top-3 w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>

                  <div className="flex flex-row sm:flex-col items-center w-full h-full justify-between sm:py-6 relative z-10">
                    <div className="w-full text-left sm:text-center shrink-0">
                      {r.hasViolation ? (
                        <div className="inline-block bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black px-2 py-1 rounded-md border border-rose-200 dark:border-rose-500/30 animate-pulse">POLICY<br className="hidden sm:block"/> REVIEW</div>
                      ) : (
                        <div className="inline-block bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-xs font-black px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-500/20">CLEAR</div>
                      )}
                    </div>
                    
                    <div className="hidden sm:flex w-full h-12 items-center justify-center opacity-20 gap-[2px] rotate-90 my-6">
                      {[...Array(14)].map((_, i) => (
                        <div key={i} className={`h-full bg-slate-800 dark:bg-white ${i % 3 === 0 ? 'w-1' : i % 2 === 0 ? 'w-[2px]' : 'w-[1px]'}`}></div>
                      ))}
                    </div>

                    <button className={`sm:mt-0 text-xs font-black uppercase ${theme.review} group-hover:translate-x-1 transition-all flex items-center gap-1.5 shrink-0`}>
                      Review <i className="fa-solid fa-arrow-right"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRequest && (
        <ManagerApprovalModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onApprove={() => { onUpdate(selectedRequest, PNCStatus.APPROVED); setSelectedRequest(null); }}
          onReject={() => { onUpdate(selectedRequest, PNCStatus.REJECTED_BY_MANAGER); setSelectedRequest(null); }}
        />
      )}
    </div>
  );
};

export default ManagerApprovalsView;
