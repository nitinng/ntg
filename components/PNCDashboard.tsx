import React, { useState } from 'react';
import { TravelRequest, PNCStatus, TravelModePolicy } from '../types';
import StatusBadge from './StatusBadge';
import Card from './Card';
import { checkPolicyViolation } from '../utils/policyUtils';

interface PNCDashboardProps {
  requests: TravelRequest[];
  onTabChange: (tab: string) => void;
  onView: (request: TravelRequest) => void;
  policies?: TravelModePolicy[];
}

export const PNCDashboard = ({ requests, onTabChange, onView, policies = [] }: PNCDashboardProps) => {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d' | 'thisMonth' | 'lastMonth'>('7d');
  const [selectedStage, setSelectedStage] = useState<PNCStatus | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Filter requests based on time period
  const getFilteredRequests = () => {
    const now = new Date();

    return requests.filter((r: TravelRequest) => {
      const requestDate = new Date(r.timestamp);

      switch (timeFilter) {
        case '24h':
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          return requestDate >= yesterday;

        case '7d':
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return requestDate >= sevenDaysAgo;

        case '30d':
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return requestDate >= thirtyDaysAgo;

        case 'thisMonth':
          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          return requestDate >= thisMonthStart;

        case 'lastMonth':
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          return requestDate >= lastMonthStart && requestDate <= lastMonthEnd;

        default:
          return true;
      }
    });
  };

  const filteredRequests = getFilteredRequests();

  // Count requests by status
  const statusCounts = {
    [PNCStatus.NOT_STARTED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.NOT_STARTED).length,
    [PNCStatus.APPROVAL_PENDING]: filteredRequests.filter(r => r.pncStatus === PNCStatus.APPROVAL_PENDING).length,
    [PNCStatus.REJECTED_BY_MANAGER]: filteredRequests.filter(r => r.pncStatus === PNCStatus.REJECTED_BY_MANAGER).length,
    [PNCStatus.APPROVED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.APPROVED).length,
    [PNCStatus.PROCESSING]: filteredRequests.filter(r => r.pncStatus === PNCStatus.PROCESSING).length,
    [PNCStatus.BOOKED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.BOOKED).length,
    [PNCStatus.REJECTED_BY_PNC]: filteredRequests.filter(r => r.pncStatus === PNCStatus.REJECTED_BY_PNC).length,
    [PNCStatus.CLOSED]: filteredRequests.filter(r => r.pncStatus === PNCStatus.CLOSED).length,
  };

  const timeFilterOptions = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
  ];

  const StageCard = ({ status, count, icon, color, onClick }: any) => (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 border-2 ${color.border} rounded-lg p-6 transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer group`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 ${color.bg} ${color.text} rounded-lg flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <div className={`px-5 py-2 ${color.bg} ${color.text} rounded-full text-xl font-black min-w-[3.5rem] text-center`}>
          {count}
        </div>
      </div>
      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{status}</h3>
      <p className="text-xs text-slate-500 mt-1 font-medium">
        {count === 0 ? 'No requests' : count === 1 ? '1 request' : `${count} requests`}
      </p>
    </div>
  );

  // Get requests for selected stage
  const getStageRequests = () => {
    if (!selectedStage) return [];
    const filtered = filteredRequests.filter(r => r.pncStatus === selectedStage);

    // Sort by timestamp
    return filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  };

  const stageRequests = getStageRequests();
  const totalPages = Math.ceil(stageRequests.length / itemsPerPage);
  const paginatedRequests = stageRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleStageClick = (stage: PNCStatus) => {
    setSelectedStage(stage);
    setCurrentPage(1);
  };

  const handleCloseModal = () => {
    setSelectedStage(null);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">PNC Operations</h2>
          <p className="text-slate-500 text-sm mt-1">Manage transport bookings and fulfillment steps.</p>
        </div>

        {/* Time Filter Buttons */}
        <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg">
          {timeFilterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setTimeFilter(option.value as any)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${timeFilter === option.value
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {/* Stage Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StageCard
          status={PNCStatus.NOT_STARTED}
          count={statusCounts[PNCStatus.NOT_STARTED]}
          icon={<i className="fa-solid fa-circle-dot"></i>}
          onClick={() => handleStageClick(PNCStatus.NOT_STARTED)}
          color={{
            bg: 'bg-slate-100 dark:bg-slate-800',
            text: 'text-slate-600 dark:text-slate-400',
            border: 'border-slate-200 dark:border-slate-700'
          }}
        />
        <StageCard
          status={PNCStatus.APPROVAL_PENDING}
          count={statusCounts[PNCStatus.APPROVAL_PENDING]}
          icon={<i className="fa-solid fa-clock"></i>}
          onClick={() => handleStageClick(PNCStatus.APPROVAL_PENDING)}
          color={{
            bg: 'bg-amber-100 dark:bg-amber-900/30',
            text: 'text-amber-700 dark:text-amber-400',
            border: 'border-amber-200 dark:border-amber-800/50'
          }}
        />
        <StageCard
          status={PNCStatus.PROCESSING}
          count={statusCounts[PNCStatus.PROCESSING]}
          icon={<i className="fa-solid fa-spinner fa-spin"></i>}
          onClick={() => handleStageClick(PNCStatus.PROCESSING)}
          color={{
            bg: 'bg-indigo-100 dark:bg-indigo-900/30',
            text: 'text-indigo-700 dark:text-indigo-400',
            border: 'border-indigo-200 dark:border-indigo-800/50'
          }}
        />
        <StageCard
          status={PNCStatus.BOOKED}
          count={statusCounts[PNCStatus.BOOKED]}
          icon={<i className="fa-solid fa-ticket"></i>}
          onClick={() => handleStageClick(PNCStatus.BOOKED)}
          color={{
            bg: 'bg-blue-100 dark:bg-blue-900/30',
            text: 'text-blue-700 dark:text-blue-400',
            border: 'border-blue-200 dark:border-blue-800/50'
          }}
        />
        <StageCard
          status={PNCStatus.REJECTED_BY_MANAGER}
          count={statusCounts[PNCStatus.REJECTED_BY_MANAGER]}
          icon={<i className="fa-solid fa-user-xmark"></i>}
          onClick={() => handleStageClick(PNCStatus.REJECTED_BY_MANAGER)}
          color={{
            bg: 'bg-rose-100 dark:bg-rose-900/30',
            text: 'text-rose-700 dark:text-rose-400',
            border: 'border-rose-200 dark:border-rose-800/50'
          }}
        />
        <StageCard
          status={PNCStatus.APPROVED}
          count={statusCounts[PNCStatus.APPROVED]}
          icon={<i className="fa-solid fa-circle-check"></i>}
          onClick={() => handleStageClick(PNCStatus.APPROVED)}
          color={{
            bg: 'bg-emerald-100 dark:bg-emerald-900/30',
            text: 'text-emerald-700 dark:text-emerald-400',
            border: 'border-emerald-200 dark:border-emerald-800/50'
          }}
        />
        <StageCard
          status={PNCStatus.REJECTED_BY_PNC}
          count={statusCounts[PNCStatus.REJECTED_BY_PNC]}
          icon={<i className="fa-solid fa-ban"></i>}
          onClick={() => handleStageClick(PNCStatus.REJECTED_BY_PNC)}
          color={{
            bg: 'bg-red-100 dark:bg-red-900/30',
            text: 'text-red-700 dark:text-red-400',
            border: 'border-red-200 dark:border-red-800/50'
          }}
        />
        <StageCard
          status={PNCStatus.CLOSED}
          count={statusCounts[PNCStatus.CLOSED]}
          icon={<i className="fa-solid fa-flag-checkered"></i>}
          onClick={() => handleStageClick(PNCStatus.CLOSED)}
          color={{
            bg: 'bg-slate-500 dark:bg-slate-700',
            text: 'text-white',
            border: 'border-slate-600 dark:border-slate-600'
          }}
        />
      </div>

      {/* Quick Action Card */}
      <Card className="p-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900 border-2 border-indigo-100 dark:border-indigo-900/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/20">
            <i className="fa-solid fa-list-check"></i>
          </div>
          <div>
            <h4 className="font-black text-slate-900 dark:text-white text-lg">Process Queue</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Start working on pending bookings</p>
          </div>
        </div>
        <button
          onClick={() => onTabChange('requests')}
          className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-sm font-black uppercase tracking-wide shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
        >
          Go to Queue <i className="fa-solid fa-arrow-right ml-2"></i>
        </button>
      </Card>

      {/* Stage Details Modal */}
      {selectedStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">{selectedStage}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Showing {paginatedRequests.length} of {stageRequests.length} requests
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="w-10 h-10 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 flex items-center justify-center"
                >
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>

              {/* Sort Options */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sort by:</span>
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

            {/* Modal Content */}
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {paginatedRequests.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-inbox text-2xl text-slate-400"></i>
                  </div>
                  <p className="text-slate-500 font-medium">No requests in this stage</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedRequests.map((req: TravelRequest) => {
                    const isViolated = req.hasViolation || (policies.length > 0 ? checkPolicyViolation(req, policies) : false);
                    return (
                      <div
                        key={req.id}
                        className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono text-sm font-black text-indigo-600">{req.submissionId || req.id}</span>
                              <StatusBadge type="priority" value={req.priority} />
                              {isViolated && (
                                <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-lg text-xs font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 animate-pulse">
                                  <i className="fa-solid fa-triangle-exclamation"></i>
                                  Policy
                                </div>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-900 dark:text-white mb-1">{req.requesterName}</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <i className="fa-solid fa-route text-xs mr-2"></i>
                              {req.from} → {req.to}
                            </p>
                            <p className="text-xs text-slate-500 mt-2">
                              <i className="fa-solid fa-calendar text-xs mr-2"></i>
                              {new Date(req.dateOfTravel).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onView(req);
                              handleCloseModal();
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer with Pagination */}
            {stageRequests.length > 0 && (
              <div className="px-8 py-5 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
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
      )}
    </div>
  );
};

export default PNCDashboard;
