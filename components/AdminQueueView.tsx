import React, { useState } from 'react';
import { TravelRequest, PNCStatus, TravelModePolicy } from '../types';
import StatusBadge from './StatusBadge';
import { checkPolicyViolation } from '../utils/policyUtils';

interface AdminQueueViewProps {
  requests: TravelRequest[];
  onView: (request: TravelRequest) => void;
  showAll?: boolean;
  policies?: TravelModePolicy[];
}

export const AdminQueueView: React.FC<AdminQueueViewProps> = ({
  requests,
  onView,
  showAll = false,
  policies = []
}) => {
  const [selectedFilter, setSelectedFilter] = useState<PNCStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Filter requests based on selected stage
  const filteredRequests = (selectedFilter === 'all'
    ? requests
    : requests.filter((r: TravelRequest) => r.pncStatus === selectedFilter)
  ).sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  // Pagination
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage) || 1;
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filter changes
  const handleFilterChange = (filter: PNCStatus | 'all') => {
    setSelectedFilter(filter);
    setCurrentPage(1);
  };

  // Get available stages (only active ones for queue, all for all-requests)
  const availableStages = showAll
    ? [
      { status: PNCStatus.NOT_STARTED, label: 'Not Started', color: 'slate' },
      { status: PNCStatus.APPROVAL_PENDING, label: 'Pending Approval', color: 'amber' },
      { status: PNCStatus.APPROVED, label: 'Approved', color: 'emerald' },
      { status: PNCStatus.PROCESSING, label: 'Processing', color: 'indigo' },
      { status: PNCStatus.BOOKED, label: 'Booked', color: 'blue' },
      { status: PNCStatus.REJECTED_BY_MANAGER, label: 'Rejected (Mgr)', color: 'rose' },
      { status: PNCStatus.REJECTED_BY_PNC, label: 'Rejected (PNC)', color: 'red' },
      { status: PNCStatus.CLOSED, label: 'Closed', color: 'slate' },
    ]
    : [
      { status: PNCStatus.NOT_STARTED, label: 'Not Started', color: 'slate' },
      { status: PNCStatus.APPROVAL_PENDING, label: 'Pending Approval', color: 'amber' },
      { status: PNCStatus.APPROVED, label: 'Approved', color: 'emerald' },
      { status: PNCStatus.PROCESSING, label: 'Processing', color: 'indigo' },
      { status: PNCStatus.BOOKED, label: 'Booked', color: 'blue' },
    ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{showAll ? 'All Requests' : 'Booking Queue'}</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Stage Filter - Dropdown for All Requests, Buttons for Queue */}
          {showAll ? (
            <div className="relative">
              <select
                value={selectedFilter}
                onChange={(e) => handleFilterChange(e.target.value as PNCStatus | 'all')}
                className="px-4 py-2 pr-10 rounded-lg text-xs font-bold uppercase tracking-wide bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-600 focus:border-indigo-600 focus:outline-none transition-all cursor-pointer appearance-none"
              >
                <option value="all">All Requests ({requests.length})</option>
                {availableStages.map(stage => {
                  const count = requests.filter((r: TravelRequest) => r.pncStatus === stage.status).length;
                  return (
                    <option key={stage.status} value={stage.status}>
                      {stage.label} ({count})
                    </option>
                  );
                })}
              </select>
              <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleFilterChange('all')}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${selectedFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
              >
                All ({requests.length})
              </button>
              {availableStages.map(stage => {
                const count = requests.filter((r: TravelRequest) => r.pncStatus === stage.status).length;
                return (
                  <button
                    key={stage.status}
                    onClick={() => handleFilterChange(stage.status)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${selectedFilter === stage.status
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    {stage.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Sort Buttons */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setSortOrder('newest')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortOrder === 'newest'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                }`}
            >
              <i className="fa-solid fa-arrow-down-short-wide mr-1.5"></i>
              Newest
            </button>
            <button
              onClick={() => setSortOrder('oldest')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortOrder === 'oldest'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                }`}
            >
              <i className="fa-solid fa-arrow-up-short-wide mr-1.5"></i>
              Oldest
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300">
            <tr>
              <th className="px-6 py-5">Request ID</th>
              <th className="px-6 py-5">Traveler</th>
              <th className="px-6 py-5">Route</th>
              <th className="px-6 py-5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-800 transition-colors duration-300">
            {paginatedRequests.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center text-slate-400 font-medium">
                  No requests found for this filter.
                </td>
              </tr>
            ) : (
              paginatedRequests.map((r: any) => {
                const isViolated = r.hasViolation || (policies.length > 0 ? checkPolicyViolation(r, policies) : false);
                return (
                  <tr key={r.id} onClick={() => onView(r)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors duration-300 group">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 transition-colors duration-300">{r.submissionId || r.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-white transition-colors duration-300">{r.requesterName}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors duration-300">{r.from} → {r.to}</td>
                    <td className="px-6 py-4 transition-colors duration-300 flex items-center gap-2">
                      <StatusBadge type="pnc" value={r.pncStatus} />
                      {isViolated && (
                        <div className="group/violation relative">
                          <i className="fa-solid fa-triangle-exclamation text-rose-500 animate-pulse"></i>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover/violation:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Policy Violation
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {filteredRequests.length > 0 && (
          <div className="px-6 py-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Items per page:</span>
              {[5, 10, 25].map(size => (
                <button
                  key={size}
                  onClick={() => {
                    setItemsPerPage(size);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${itemsPerPage === size
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                  {size}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 px-4">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminQueueView;
