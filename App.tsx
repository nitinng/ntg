
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TravelRequest, PNCStatus, Priority, TravelMode, UserRole, User, TripType, ApprovalStatus, PolicyConfig, VerificationStatus, IdProofType, PaymentStatus, UserDocument, TravelModePolicy, MeetupAvailabilityRequest
} from './types';
import { mockUsers, initialRequests } from './mockData';
import StatusBadge from './components/StatusBadge';
import Input from './components/Input';
import NewRequestModal from './components/NewRequestModal';
import AuthView from './components/AuthView';
import Select from './components/Select';
import TextArea from './components/TextArea';

import MailTemplatesView from './components/MailTemplatesView';
import PNCBookingModal from './components/PNCBookingModal';
import { supabase } from './supabaseClient';
import { Toaster, toast } from 'sonner';



// --- UI Utility Components ---

const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${className}`} {...props}>
    {children}
  </div>
);

const StatCard = ({ title, value, icon, description, trend, trendUp }: any) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <div className="text-indigo-600 dark:text-indigo-400 opacity-60 text-lg">{icon}</div>
    </div>
    <div className="flex items-baseline gap-2">
      <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</h3>
      {trend && (
        <span className={`text-2xs font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend}
        </span>
      )}
    </div>
    {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
  </Card>
);



// --- Chart Components (CSS based) ---

const BarChart = ({ data, color = 'bg-indigo-500' }: { data: { label: string, value: number }[], color?: string }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex justify-between h-40 gap-2 pt-4 items-stretch">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end group">
          <div className="relative w-full flex-1 flex items-end justify-center px-1">
            <div
              className={`w-full max-w-[2rem] rounded-t-sm transition-all duration-500 group-hover:opacity-80 ${color}`}
              style={{ height: `${Math.max((d.value / max) * 100, 1)}%` }}
            ></div>
            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold bg-slate-800 text-white px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10">
              {d.value}
            </div>
          </div>
          <span className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight truncate w-full text-center block h-4">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// --- Shared Components ---

const Navbar = ({ currentUser, baseRole, onToggleRole, onOpenProfile, onToggleSidebar, isSidebarOpen }: { currentUser: User, baseRole: UserRole | null, onToggleRole: (role: UserRole) => void, onOpenProfile: () => void, onToggleSidebar?: () => void, isSidebarOpen?: boolean }) => {
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.role-dropdown-container')) {
        setIsRoleDropdownOpen(false);
      }
    };
    if (isRoleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoleDropdownOpen]);

  const getVisibleRoles = () => {
    if (baseRole === UserRole.ADMIN) return Object.values(UserRole);
    if (baseRole === UserRole.PNC) return [UserRole.EMPLOYEE, UserRole.PNC, UserRole.FINANCE];
    if (baseRole === UserRole.FINANCE) return [UserRole.EMPLOYEE, UserRole.FINANCE];
    return [];
  };

  const visibleRoles = getVisibleRoles();

  return (
    <nav className="h-16 app-navbar bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300">
      <div className="flex items-center gap-2 md:gap-4">
        {onToggleSidebar && (
          <button onClick={onToggleSidebar} className="md:hidden w-8 h-8 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0">
            <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'} text-xl`}></i>
          </button>
        )}
        <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-600/20 flex-shrink-0">N</div>
        <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 hidden md:block tracking-tight whitespace-nowrap">Navgurukul Travel Desk</h1>
        {visibleRoles.length > 0 && (
          <>
            {/* Desktop standard role tabs */}
            <div className="ml-4 hidden md:flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors duration-300">
              {visibleRoles.map(role => (
                <button
                  key={role}
                  onClick={() => onToggleRole(role)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-300 ${currentUser.role === role ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Mobile custom dropdown */}
            <div className="ml-2 md:hidden relative role-dropdown-container">
              <button
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="flex items-center justify-between min-w-[100px] bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-[10px] sm:text-xs font-black uppercase tracking-widest py-1.5 pl-3.5 pr-2.5 rounded-full outline-none shadow-sm shadow-indigo-500/5 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all duration-300"
              >
                <span>{currentUser.role}</span>
                <div className="w-4 h-4 ml-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center transition-colors">
                  <i className={`fa-solid fa-chevron-${isRoleDropdownOpen ? 'up' : 'down'} text-[8px] text-indigo-500 dark:text-indigo-400 transition-transform`}></i>
                </div>
              </button>

              {/* Dropdown Menu */}
              {isRoleDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-[140px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/30 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-1.5 flex flex-col gap-0.5">
                    {visibleRoles.map(role => (
                      <button
                        key={role}
                        onClick={() => {
                          onToggleRole(role);
                          setIsRoleDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-between group ${currentUser.role === role
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                      >
                        {role}
                        {currentUser.role === role && (
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="text-right hidden sm:block">
            <p className="text-base font-bold text-slate-800 dark:text-white leading-none">{currentUser.name}</p>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter font-medium">{currentUser.role} View</p>
          </div>
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl overflow-hidden border-2 border-transparent hover:border-indigo-500/20 flex items-center justify-center transition-all"
          >
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : currentUser.passportPhoto?.fileUrl ? (
              <img src={currentUser.passportPhoto.fileUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              currentUser.name.charAt(0)
            )}
          </button>
        </div>
      </div>
    </nav >
  );
};

const SidebarLink = ({ icon, label, active, onClick, badge, badgeColor }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
    <i className={`fa-solid ${icon} w-5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`}></i>
    <span className="flex-1 text-left whitespace-nowrap">{label}</span>
    {badge && <span className={`text-2xs ${badgeColor || 'bg-rose-500 px-1.5 py-0.5'} text-white rounded-full font-bold`}>{badge}</span>}
  </button>
);

const Toggle = ({ active, onChange }: { active: boolean, onChange: () => void }) => (
  <button onClick={onChange} className={`w-11 h-6 rounded-full relative transition-all duration-300 active:scale-95 ${active ? 'bg-indigo-600 ring-2 ring-indigo-500/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${active ? 'right-1' : 'left-1'}`}></div>
  </button>
);

// --- Constants ---
const WELCOME_NOTES = [
  "Ready for your next adventure?",
  "Let's get you where you need to be.",
  "Your travel, our priority.",
  "Smooth travels start here.",
  "Where to next, explorer?",
  "Making every journey count.",
  "Safe travels and happy journeys!",
  "Your gateway to Navgurukul campuses."
];

// --- Shared Components ---

const AdminDashboard = ({ requests, users, onTabChange }: any) => {
  const pendingCount = requests.filter((r: TravelRequest) => r.approvalStatus === ApprovalStatus.PENDING).length;
  const criticalCount = requests.filter((r: TravelRequest) => r.priority === Priority.CRITICAL).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Admin Overview</h2>
          <p className="text-slate-500 text-sm mt-1">System-wide performance metrics and controls.</p>
        </div>
        <button onClick={() => onTabChange('requests')} className="bg-slate-900 dark:bg-slate-800 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all active:scale-95">View Queue</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Users" value={users.length} icon={<i className="fa-solid fa-users"></i>} description="Active accounts" />
        <StatCard title="Pending Approvals" value={pendingCount} icon={<i className="fa-solid fa-clock"></i>} description="Needs attention" />
        <StatCard title="Critical Trips" value={criticalCount} icon={<i className="fa-solid fa-triangle-exclamation"></i>} trendUp={false} description="High priority" />
      </div>

      <Card className="p-6">
        <h4 className="font-bold text-slate-800 dark:text-white mb-4">Recent Activity</h4>
        <div className="space-y-4">
          {requests.slice(0, 5).map((r: TravelRequest) => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{r.requesterName}</p>
                <p className="text-xs text-slate-500">{r.from} → {r.to}</p>
              </div>
              <StatusBadge type="pnc" value={r.pncStatus} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const PNCDashboard = ({ requests, onTabChange, onView, policies = [] }: any) => {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d' | 'thisMonth' | 'lastMonth'>('7d');
  const [selectedStage, setSelectedStage] = useState<PNCStatus | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Filter requests based on time period
  const getFilteredRequests = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
      className={`bg-white dark:bg-slate-900 border-2 ${color.border} rounded-2xl p-6 transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer group`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 ${color.bg} ${color.text} rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>
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
        <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl">
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
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/20">
            <i className="fa-solid fa-list-check"></i>
          </div>
          <div>
            <h4 className="font-black text-slate-900 dark:text-white text-lg">Process Queue</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Start working on pending bookings</p>
          </div>
        </div>
        <button
          onClick={() => onTabChange('requests')}
          className="bg-indigo-600 text-white px-8 py-3 rounded-xl text-sm font-black uppercase tracking-wide shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
        >
          Go to Queue <i className="fa-solid fa-arrow-right ml-2"></i>
        </button>
      </Card>

      {/* Stage Details Modal */}
      {selectedStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
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
                  className="w-10 h-10 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 flex items-center justify-center"
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
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${sortOrder === 'newest'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                      }`}
                  >
                    <i className="fa-solid fa-arrow-down-short-wide mr-1.5"></i>
                    Newest
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${sortOrder === 'oldest'
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
                        className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono text-sm font-black text-indigo-600">{req.submissionId || req.id}</span>
                              <StatusBadge type="priority" value={req.priority} />
                              {isViolated && (
                                <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 animate-pulse">
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
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
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

const FinanceDashboard = ({ requests }: any) => {
  const totalSpend = requests.reduce((acc: number, r: TravelRequest) => acc + (r.ticketCost || 0), 0);
  const pendingPayment = requests.filter((r: TravelRequest) => r.paymentStatus === PaymentStatus.PENDING).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Financial Overview</h2>
        <p className="text-slate-500 text-sm mt-1">Monitor budget utilization and travel spend.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Spend" value={`₹${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} />
        <StatCard title="Pending Invoices" value={pendingPayment} icon={<i className="fa-solid fa-file-invoice-dollar"></i>} trendUp={false} trend="Needs Action" />
        <StatCard title="Avg Ticket Cost" value={`₹${requests.length ? Math.round(totalSpend / requests.length) : 0}`} icon={<i className="fa-solid fa-calculator"></i>} />
      </div>
      <Card className="p-6">
        <h4 className="font-bold text-slate-800 dark:text-white mb-4">Cost Center Allocation</h4>
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-xl">
          Chart placeholder: Spend distribution by department
        </div>
      </Card>
    </div>
  );
};

const ManagerApprovalsView = ({ requests, onUpdate, currentUser }: any) => {
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Pending Approvals</h2>
        <p className="text-slate-500 text-sm mt-1">Review and action travel requests from your team.</p>
      </header>

      {requests.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 text-2xl">
            <i className="fa-solid fa-check-double"></i>
          </div>
          <h3 className="text-slate-900 dark:text-white font-bold">All Caught Up!</h3>
          <p className="text-slate-500 text-sm mt-1">You have no pending approvals at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((r: TravelRequest) => (
            <div key={r.id} onClick={() => setSelectedRequest(r)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl hover:shadow-lg hover:border-indigo-500/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 -mr-6 -mt-6 rounded-full group-hover:scale-150 transition-transform duration-700"></div>

              <div className="flex justify-between items-start mb-4 relative z-10">
                <span className="text-[10px] font-black text-indigo-500/60 font-mono tracking-tighter uppercase">{r.submissionId || r.id}</span>
                <div className="scale-90 origin-right">
                  {r.hasViolation && (
                    <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 animate-pulse">
                      <i className="fa-solid fa-triangle-exclamation"></i>
                      Policy
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-black text-lg mb-0.5 text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors uppercase tracking-tight leading-tight">{r.requesterName}</h4>
                <p className="text-xs text-slate-500 font-bold">{r.requesterDepartment}</p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400 mb-6">
                <span className="flex items-center gap-1"><i className="fa-solid fa-route text-indigo-400"></i> {r.from} → {r.to}</span>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center relative z-10">
                <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-indigo-500 transition-colors">
                  <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-xs`}></i>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{r.mode}</span>
                </div>
                <span className="text-indigo-600 text-xs font-black uppercase tracking-wider group-hover:translate-x-1 transition-transform">Review <i className="fa-solid fa-arrow-right ml-1"></i></span>
              </div>
            </div>
          ))}
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

const ManagerApprovalModal = ({ request, onClose, onApprove, onReject }: any) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={onClose}></div>
    <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50 flex flex-col max-h-[90vh]">

      <div className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-slate-400 font-mono uppercase">{request.submissionId || request.id}</span>
            {request.hasViolation && <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded border border-rose-200">Policy Violation</span>}
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">Approval Request</h3>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><i className="fa-solid fa-xmark"></i></button>
      </div>

      <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
        {/* Traveler Info */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold">
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
              <p className="text-[10px] font-bold text-slate-400 uppercase">Route</p>
              <p className="font-bold text-slate-800 dark:text-white">{request.from} → {request.to}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Date</p>
              <p className="font-bold text-slate-800 dark:text-white">{new Date(request.dateOfTravel).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Mode</p>
              <p className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i className={`fa-solid ${request.mode === 'Flight' ? 'fa-plane' : request.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-indigo-500`}></i>
                {request.mode}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Trip Type</p>
              <p className="font-bold text-slate-800 dark:text-white">{request.tripType}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Purpose</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 italic">"{request.purpose}"</p>
          </div>
        </div>

        {/* Policy Violation Warning */}
        {request.hasViolation && (
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 p-4 rounded-xl flex gap-3">
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
        <button onClick={onReject} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 font-bold rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/10 hover:border-rose-200 transition-all uppercase tracking-wide text-xs">Reject</button>
        <button onClick={onApprove} className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all uppercase tracking-wide text-xs">Approve Request</button>
      </div>
    </div>
  </div>
);

const LocationCalendar = () => {
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
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Reference Only • Confirm with Approvers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1))}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all"
          >
            <i className="fa-solid fa-chevron-left text-[10px]"></i>
          </button>
          <span className="text-sm font-black text-slate-700 dark:text-slate-300 min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1))}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all"
          >
            <i className="fa-solid fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-[10px] font-black text-slate-400 text-center uppercase py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          const status = getStatus(day);
          return (
            <div
              key={idx}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all group ${!day ? 'opacity-0' : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700'
                }`}
            >
              {day && (
                <>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{day}</span>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${status === 'booked' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                    status === 'tentative' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}></div>

                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all scale-90 group-hover:scale-100 z-20 whitespace-nowrap">
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
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{l.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const IgathpuriMeetupView = ({
  onNewRequest,
  onCheckAvailability,
  availabilityRequests,
  currentUser,
  onViewProfile,
  requests,
  onView
}: {
  onNewRequest: (context?: any) => void,
  onCheckAvailability: () => void,
  availabilityRequests: MeetupAvailabilityRequest[],
  currentUser: User | null,
  onViewProfile: () => void,
  requests: TravelRequest[],
  onView: (r: TravelRequest) => void
}) => {
  if (currentUser?.role === UserRole.PNC) {
    const pending = availabilityRequests.filter(r => r.status === 'Pending');
    const approved = availabilityRequests.filter(r => r.status === 'Approved');
    const rejected = availabilityRequests.filter(r => r.status === 'Rejected');

    const RequestList = ({ title, data, icon, colorClass }: any) => (
      <div className="space-y-4">
        <h3 className={`text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 ${colorClass}`}>
          <i className={`fa-solid ${icon}`}></i>
          {title} ({data.length})
        </h3>
        {data.length === 0 ? (
          <div className="py-8 text-center bg-white/50 dark:bg-slate-900/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-slate-400 text-xs font-bold italic tracking-wider">No requests in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((r: MeetupAvailabilityRequest) => (
              <Card key={r.id} className="p-5 hover:border-indigo-500/30 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">{r.fullName}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{r.department}</p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-[10px] font-black text-slate-500">
                    {r.teamSize} PAX
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <i className="fa-solid fa-calendar-days text-indigo-500 w-4"></i>
                    <span>{new Date(r.startDate).toLocaleDateString()} - {new Date(r.endDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 p-2 rounded-xl">
                    <i className="fa-solid fa-envelope text-slate-400 w-4"></i>
                    <span className="truncate">{r.email}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Created: {new Date(r.createdAt).toLocaleDateString()}</span>
                  <div className={`w-2 h-2 rounded-full ${r.status === 'Approved' ? 'bg-emerald-500' : r.status === 'Pending' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="relative py-8 px-10 bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-900/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 -mr-20 -mt-20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 -ml-16 -mb-16 rounded-full blur-3xl"></div>

          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4 border border-indigo-500/30">
              <i className="fa-solid fa-shield-halved"></i>
              PNC Operational View
            </span>
            <h2 className="text-4xl font-black text-white tracking-tight uppercase leading-none">Meetup Availability Control</h2>
            <p className="text-slate-400 text-sm mt-3 font-medium max-w-xl">
              Monitoring all pending and historical location reservation requests for the Igatpuri campus. This is a read-only tracking view for PNC operations.
            </p>
          </div>
        </header>

        <div className="space-y-16 pb-12">
          <RequestList
            title="Pending Requests"
            data={pending}
            icon="fa-clock-rotate-left"
            colorClass="text-amber-500"
          />

          <RequestList
            title="Approved History"
            data={approved}
            icon="fa-circle-check"
            colorClass="text-emerald-500"
          />

          <RequestList
            title="Rejected History"
            data={rejected}
            icon="fa-circle-xmark"
            colorClass="text-rose-500"
          />
        </div>
      </div>
    );
  }

  const [approvers, setApprovers] = useState<any[]>([]);
  const [totalSeats, setTotalSeats] = useState<number>(0);
  const [isCalendarEnabled, setIsCalendarEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [attendeeStats, setAttendeeStats] = useState({ filled: 0, booked: 0, total: 0 });
  const [attendeeDetails, setAttendeeDetails] = useState<{ email: string, name?: string, status: string, isBooked: boolean }[]>([]);
  const [activeStatModal, setActiveStatModal] = useState<'completion' | 'booking' | null>(null);

  // New step-based state
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [isAttendeesConfirmed, setIsAttendeesConfirmed] = useState(false);
  const [isRequestSubmitted, setIsRequestSubmitted] = useState(false);
  const [isSavingAttendees, setIsSavingAttendees] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Find if there's an approved availability request for this user
  const userRequests = availabilityRequests.filter(r => r.profileId === currentUser?.id);

  // Ongoing request for the stepper (not yet finalized)
  const ongoingRequest = userRequests.find(r => r.status === 'Approved' && !r.isFinalized);

  // Active meetup (finalized for requester OR you are an attendee)
  const activeMeetup = userRequests.find(r => r.status === 'Approved' && r.isFinalized) ||
    availabilityRequests.find(r => r.isFinalized && r.attendeeEmails?.some(email => email.toLowerCase() === currentUser?.email?.toLowerCase()));

  const approvedRequest = ongoingRequest; // Stepper uses this
  const pendingRequest = userRequests.find(r => r.status === 'Pending');
  const isAvailabilityApproved = !!approvedRequest;
  const isAvailabilityPending = !!pendingRequest;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [approversRes, settingsRes] = await Promise.all([
          supabase
            .from('meetup_approvers')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true }),
          supabase
            .from('meetup_settings')
            .select('*')
            .in('setting_key', ['total_seats', 'is_calendar_enabled'])
        ]);

        if (approversRes.error) throw approversRes.error;
        setApprovers(approversRes.data || []);

        if (!settingsRes.error && settingsRes.data) {
          const seats = settingsRes.data.find((s: any) => s.setting_key === 'total_seats');
          const calendar = settingsRes.data.find((s: any) => s.setting_key === 'is_calendar_enabled');

          if (seats) setTotalSeats(Number(seats.setting_value));
          if (calendar) setIsCalendarEnabled(calendar.setting_value === true || calendar.setting_value === 'true');
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (activeMeetup?.attendeeEmails?.length > 0) {
      const fetchStats = async () => {
        try {
          const { data, error } = await supabase
            .from('travel_requests')
            .select('requester_email, requester_name, pnc_status')
            .in('requester_email', activeMeetup.attendeeEmails)
            .eq('purpose', 'Igatpuri Meetup');

          if (!error && data) {
            const filledCount = data.length;
            const bookedCount = data.filter((r: any) =>
              r.pnc_status === PNCStatus.BOOKED || r.pnc_status === PNCStatus.CLOSED
            ).length;
            setAttendeeStats({ filled: filledCount, booked: bookedCount, total: activeMeetup.attendeeEmails.length });

            // Generate detailed list
            const details = activeMeetup.attendeeEmails.map(email => {
              const req = data.find((r: any) => r.requester_email.toLowerCase() === email.toLowerCase());
              return {
                email,
                name: req?.requester_name,
                status: req ? 'Filled' : 'Pending',
                isBooked: req ? (req.pnc_status === PNCStatus.BOOKED || req.pnc_status === PNCStatus.CLOSED) : false
              };
            });
            setAttendeeDetails(details);
          }
        } catch (err) {
          console.error('Error fetching attendee stats:', err);
        }
      };
      fetchStats();
    } else {
      setAttendeeStats({ filled: 0, booked: 0, total: 0 });
      setAttendeeDetails([]);
    }
  }, [activeMeetup?.id, activeMeetup?.attendeeEmails, isRequestSubmitted]);

  useEffect(() => {
    if (approvedRequest) {
      if (approvedRequest.attendeeEmails && approvedRequest.attendeeEmails.length > 0) {
        setAttendeeEmails(approvedRequest.attendeeEmails);
        setIsAttendeesConfirmed(true);
      } else if (attendeeEmails.length !== (approvedRequest.teamSize || 0)) {
        setAttendeeEmails(new Array(approvedRequest.teamSize || 0).fill(""));
      }
    } else {
      // Reset stepper local state if no ongoing request
      setIsAttendeesConfirmed(false);
      setIsRequestSubmitted(false);
      setAttendeeEmails([]);
    }
  }, [approvedRequest?.id]);

  const handleConfirmAttendees = async () => {
    if (!approvedRequest) return;

    // Validate all emails are provided
    if (attendeeEmails.some(email => !email.trim())) {
      toast.error("Please provide email addresses for all attendees");
      return;
    }

    setIsSavingAttendees(true);
    try {
      const { error } = await supabase
        .from('meetup_availability_requests')
        .update({
          attendee_emails: attendeeEmails,
          updated_at: new Date().toISOString()
        })
        .eq('id', approvedRequest.id);

      if (error) throw error;

      setIsAttendeesConfirmed(true);
      toast.success("Attendees confirmed successfully!");
    } catch (err: any) {
      toast.error("Failed to confirm attendees: " + err.message);
    } finally {
      setIsSavingAttendees(false);
    }
  };

  const handleFinalizeRequest = async () => {
    if (!approvedRequest) return;

    setIsFinalizing(true);
    try {
      const { error } = await supabase
        .from('meetup_availability_requests')
        .update({
          is_finalized: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', approvedRequest.id);

      if (error) throw error;

      setIsRequestSubmitted(true);
      toast.success("Request finalized! Attendees will be notified.");
    } catch (err: any) {
      toast.error("Failed to finalize request: " + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center gap-4">
        <div className="w-16 h-16 bg-violet-600 rounded-3xl flex items-center justify-center text-white text-3xl shadow-xl shadow-violet-600/20">
          <i className="fa-solid fa-person-shelter"></i>
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-all tracking-tight uppercase">Igathpuri Meetup</h2>
          <p className="text-slate-500 font-medium tracking-tight">Navgurukul Team Hub & Meetup Location</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          {/* Active Meetup Booking Card */}
          {activeMeetup && (
            <Card className="p-8 border-2 border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xl shadow-emerald-500/5 relative group overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 -mr-20 -mt-20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center text-3xl shadow-inner group-hover:rotate-6 transition-transform">
                    <i className="fa-solid fa-hotel"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-emerald-200 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded-lg">Active Booking</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">• {activeMeetup.teamSize} PAX</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">Igathpuri Campus Visit</h3>
                    <p className="text-sm font-bold text-slate-500 mt-1 flex items-center gap-2">
                      <i className="fa-solid fa-calendar-days text-emerald-500/50"></i>
                      {new Date(activeMeetup.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(activeMeetup.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Requester Stats or Participant CTA */}
                {activeMeetup.profileId === currentUser?.id ? (
                  <div className="flex gap-4 w-full md:w-auto">
                    <div onClick={() => setActiveStatModal('completion')} className="flex-1 md:flex-initial px-6 py-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 cursor-pointer hover:border-emerald-400 transition-all text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Forms</p>
                      <p className="text-xl font-black text-emerald-600">{attendeeStats.filled}/{attendeeStats.total}</p>
                    </div>
                    <div onClick={() => setActiveStatModal('booking')} className="flex-1 md:flex-initial px-6 py-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 cursor-pointer hover:border-emerald-400 transition-all text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tickets</p>
                      <p className="text-xl font-black text-emerald-600">{attendeeStats.booked}/{attendeeStats.total}</p>
                    </div>
                  </div>
                ) : (
                  !requests.some(r => r.purpose === 'Igatpuri Meetup' && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER) && (
                    <button
                      onClick={() => onNewRequest({ startDate: activeMeetup.startDate, endDate: activeMeetup.endDate })}
                      className="w-full md:w-auto px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition-all text-center"
                    >
                      Complete Your Travel Request <i className="fa-solid fa-arrow-right ml-2"></i>
                    </button>
                  )
                )}
              </div>
            </Card>
          )}

          {/* Stat Detail Modals */}
          {activeStatModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
              <Card className="w-full max-w-lg bg-white dark:bg-slate-900 p-8 shadow-2xl relative overflow-visible">
                <button
                  onClick={() => setActiveStatModal(null)}
                  className="absolute -top-3 -right-3 w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 shadow-lg transition-all z-50"
                >
                  <i className="fa-solid fa-times"></i>
                </button>

                <div className="space-y-6">
                  <header>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeStatModal === 'completion' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <i className={`fa-solid ${activeStatModal === 'completion' ? 'fa-file-invoice' : 'fa-ticket'}`}></i>
                      </div>
                      {activeStatModal === 'completion' ? 'Form Completion Status' : 'Ticket Booking Status'}
                    </h3>
                    <p className="text-xs text-slate-500 font-bold mt-2 uppercase tracking-widest">
                      Showing status for {activeMeetup?.teamSize || 0} attendees
                    </p>
                  </header>

                  <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {attendeeDetails.map((attendee, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${(activeStatModal === 'completion' ? attendee.status === 'Filled' : attendee.isBooked)
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-amber-100 text-amber-600'
                            }`}>
                            {attendee.name ? attendee.name.charAt(0).toUpperCase() : <i className="fa-solid fa-user"></i>}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 dark:text-white truncate max-w-[180px]">
                              {attendee.name || attendee.email.split('@')[0]}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold truncate">
                              {attendee.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {activeStatModal === 'completion' ? (
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${attendee.status === 'Filled'
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-amber-50 text-amber-600 border border-amber-100'
                              }`}>
                              {attendee.status === 'Filled' ? 'Form Filled' : 'Pending'}
                            </span>
                          ) : (
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${attendee.isBooked
                              ? 'bg-emerald-100 text-emerald-600'
                              : attendee.status === 'Pending'
                                ? 'bg-slate-100 text-slate-400'
                                : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                              }`}>
                              {attendee.isBooked ? 'Booked' : attendee.status === 'Pending' ? 'Form Pending' : 'Booking...'}
                            </span>
                          )}
                          <div className={`w-2 h-2 rounded-full ${(activeStatModal === 'completion' ? attendee.status === 'Filled' : attendee.isBooked)
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-amber-400'
                            }`}></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setActiveStatModal(null)}
                    className="w-full py-4 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-xl"
                  >
                    Close Details
                  </button>
                </div>
              </Card>
            </div>
          )}

          {/* Your Meetup Travel Booking */}
          {requests.filter(r =>
            r.purpose === 'Igatpuri Meetup' &&
            r.requesterEmail === currentUser?.email &&
            r.pncStatus !== PNCStatus.REJECTED_BY_PNC &&
            r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER
          ).map(r => (
            <div key={r.id} className="space-y-4 pt-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                <i className="fa-solid fa-plane-departure text-emerald-500"></i>
                Your Travel Booking
              </h4>
              <div onClick={() => onView(r)} className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 p-6 rounded-3xl hover:shadow-xl hover:border-emerald-500/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden max-w-md bg-gradient-to-br from-emerald-50/10 to-transparent">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 -mr-10 -mt-10 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <span className="text-[10px] font-black text-emerald-500/60 font-mono tracking-tighter uppercase">{r.submissionId || r.id}</span>
                  <StatusBadge type="pnc" value={r.pncStatus} />
                </div>
                <h4 className="font-black text-2xl mb-1 text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors uppercase tracking-tight leading-tight">{r.from} → {r.to}</h4>
                <p className="text-sm text-slate-500 mb-6 font-bold flex items-center gap-2">
                  <i className="fa-solid fa-calendar-day text-slate-300"></i>
                  {new Date(r.dateOfTravel).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <div className="pt-4 border-t border-emerald-100 dark:border-emerald-800 flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane-departure' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-base`}></i>
                    <span className="text-xs font-black uppercase tracking-widest">{r.mode}</span>
                  </div>
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-all"><i className="fa-solid fa-arrow-right text-xs"></i></div>
                </div>
              </div>
            </div>
          ))}

          {/* Show Guidelines and Process (Always shown, reset state derived from ongoingRequest) */}
          <div className="space-y-8">
            <div className="space-y-8">
              <Card className="p-8 space-y-6">
                <header className="flex items-center gap-3 border-b dark:border-slate-800 pb-6">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600">
                    <i className="fa-solid fa-book-open text-sm"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">Booking Guidelines</h3>
                </header>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                      About the Meetup
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                      The Navgurukul Igathpuri campus serves as a central hub for team meetups, workshops, and offsites.
                      Coordinate and confirm venue availability before finalizing travel plans.
                    </p>
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 p-4 rounded-2xl flex gap-4">
                      <i className="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-500 mt-1"></i>
                      <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                        <strong className="uppercase tracking-wide text-[10px]">Mandatory Step:</strong> Before submitting any travel request, you must get written confirmation of location availability.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                      Booking Process
                    </h4>
                    <div className="space-y-8 border-l-2 border-slate-100 dark:border-slate-800 ml-2 pl-6">
                      {/* Step 1 */}
                      <div className="relative">
                        <div className={`absolute -left-[33px] top-0 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 ${isAvailabilityApproved ? 'border-emerald-500 bg-emerald-500' : 'border-violet-500'} flex items-center justify-center transition-all`}>
                          {isAvailabilityApproved ? <i className="fa-solid fa-check text-[8px] text-white"></i> : <span className="text-[8px] font-black text-violet-600">1</span>}
                        </div>
                        <div className="flex justify-between items-start">
                          <div className="max-w-[70%]">
                            <h5 className="font-bold text-slate-800 dark:text-white text-sm">Check Availability</h5>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">Verify if the Igathpuri campus is available for your proposed dates.</p>
                          </div>
                          <button
                            onClick={onCheckAvailability}
                            disabled={isAvailabilityApproved || isAvailabilityPending}
                            className={`px-4 py-2 border-2 ${isAvailabilityApproved
                              ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
                              : isAvailabilityPending
                                ? 'border-amber-500 text-amber-600 bg-amber-50'
                                : 'border-violet-600 text-violet-600 hover:bg-violet-600 hover:text-white'
                              } rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:cursor-default`}
                          >
                            {isAvailabilityApproved ? 'Approved' : isAvailabilityPending ? 'Verifying Availability' : 'Check Now'}
                          </button>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="relative">
                        <div className={`absolute -left-[33px] top-0 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 ${isAttendeesConfirmed ? 'border-emerald-500 bg-emerald-500' : 'border-violet-500'} flex items-center justify-center transition-all`}>
                          {isAttendeesConfirmed ? <i className="fa-solid fa-check text-[8px] text-white"></i> : <span className="text-[8px] font-black text-violet-600">2</span>}
                        </div>
                        <h5 className="font-bold text-slate-800 dark:text-white text-sm">Confirm Attendees</h5>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Ensure you have the final count of team members traveling.</p>

                        {!isAttendeesConfirmed ? (
                          <div className="mt-4 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                              {attendeeEmails.map((email, idx) => (
                                <div key={idx}>
                                  <Input
                                    label={`Attendee ${idx + 1}`}
                                    value={email}
                                    onChange={(e) => {
                                      const newEmails = [...attendeeEmails];
                                      newEmails[idx] = e.target.value;
                                      setAttendeeEmails(newEmails);
                                    }}
                                    placeholder="Enter email..."
                                    disabled={!isAvailabilityApproved || isSavingAttendees}
                                  />
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={handleConfirmAttendees}
                              disabled={!isAvailabilityApproved || isSavingAttendees || attendeeEmails.some(e => !e.trim())}
                              className="px-6 py-2.5 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {isSavingAttendees ? <i className="fa-solid fa-circle-notch fa-spin mr-1"></i> : null}
                              Confirm {approvedRequest?.teamSize || ''} Attendees
                            </button>
                          </div>
                        ) : (
                          <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-2xl">
                            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Confirmed Attendees ({attendeeEmails.length})</p>
                            <div className="flex flex-wrap gap-2">
                              {attendeeEmails.map((email, idx) => (
                                <span key={idx} className="px-2 py-1 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 rounded-lg text-[10px] font-medium text-slate-600 dark:text-slate-400">
                                  {email}
                                </span>
                              ))}
                            </div>
                            {!isRequestSubmitted && (
                              <button
                                onClick={() => setIsAttendeesConfirmed(false)}
                                className="text-[10px] text-slate-400 font-bold hover:text-violet-600 mt-3 hover:underline transition-all block"
                              >
                                <i className="fa-solid fa-pen-to-square mr-1"></i>
                                Change Attendees
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Step 3 */}
                      <div className="relative">
                        <div className={`absolute -left-[33px] top-0 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 ${isRequestSubmitted ? 'border-emerald-500 bg-emerald-500' : 'border-violet-500'} flex items-center justify-center transition-all`}>
                          {isRequestSubmitted ? <i className="fa-solid fa-check text-[8px] text-white"></i> : <span className="text-[8px] font-black text-violet-600">3</span>}
                        </div>
                        <h5 className="font-bold text-slate-800 dark:text-white text-sm">Submit Request</h5>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Finalize your booking and add it to your travel requests.</p>
                        <button
                          onClick={handleFinalizeRequest}
                          disabled={!isAttendeesConfirmed || isRequestSubmitted || isFinalizing}
                          className="mt-4 w-full py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
                        >
                          {isFinalizing ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
                          {isRequestSubmitted ? <><i className="fa-solid fa-circle-check mr-2 text-emerald-400"></i>Submitted to active requests</> : 'Submit Request'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {isCalendarEnabled && <LocationCalendar />}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-2 border-indigo-100 dark:border-indigo-900/30 bg-white dark:bg-slate-900 shadow-xl shadow-indigo-600/5 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 dark:bg-indigo-900/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
            <h3 className="font-bold mb-4 flex items-center gap-2 relative z-10 text-indigo-600 dark:text-indigo-400">
              <i className="fa-solid fa-headset"></i>
              Need Assistance?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-bold leading-relaxed mb-6 block relative z-10">
              If you have queries regarding the <span className="text-slate-900 dark:text-white border-b-2 border-indigo-100 dark:border-indigo-800">Igathpuri meetup</span> logistics or coordination, please reach out to the PNC team on Slack.
            </p>
            <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white transition-all rounded-xl text-sm font-black shadow-lg shadow-indigo-600/20 relative z-10">
              Contact PNC Team
            </button>
          </Card>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Authorized Approvers</h4>
            {loading ? (
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl animate-pulse">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
              </div>
            ) : approvers.length === 0 ? (
              <div className="p-6 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl border-dashed">
                <p className="text-xs text-slate-400 font-bold">No approvers listed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {approvers.map(a => (
                  <div key={a.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-bold">
                        {a.name ? a.name.charAt(0).toUpperCase() : <i className="fa-solid fa-user"></i>}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{a.name || 'Admin'}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{a.email}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const PolicyManagement = ({ policy, setPolicy, travelModePolicies, setTravelModePolicies, users, isIgatpuriEnabled, setIsIgatpuriEnabled }: any) => {
  const handleUpdateMinAdvanceDays = async (mode: string, days: number) => {
    try {
      const { data, error } = await supabase
        .from('travel_mode_policies')
        .update({ min_advance_days: days, updated_at: new Date().toISOString() })
        .eq('travel_mode', mode)
        .select()
        .single();

      if (error) throw error;

      setTravelModePolicies(travelModePolicies.map((p: any) =>
        p.travelMode === mode ? { ...p, minAdvanceDays: days } : p
      ));
      toast.success(`${mode} policy updated`);
    } catch (err: any) {
      toast.error("Failed to update policy: " + err.message);
    }
  };

  // --- Meetup Approver State ---
  const [meetupApprovers, setMeetupApprovers] = useState<any[]>([]);
  const [pncSearch, setPncSearch] = useState('');
  const [isAddingApprover, setIsAddingApprover] = useState(false);
  const [approversLoading, setApproversLoading] = useState(true);
  const [totalSeats, setTotalSeats] = useState<number>(0);
  const [isCapacityEnabled, setIsCapacityEnabled] = useState(false);
  const [isCalendarEnabled, setIsCalendarEnabled] = useState(true);

  // Load approvers and settings from DB on mount
  useEffect(() => {
    const fetchData = async () => {
      setApproversLoading(true);
      try {
        const [approversRes, settingsRes] = await Promise.all([
          supabase
            .from('meetup_approvers')
            .select('*')
            .order('created_at', { ascending: true }),
          supabase
            .from('meetup_settings')
            .select('*')
            .in('setting_key', ['total_seats', 'is_capacity_enabled', 'is_calendar_enabled', 'is_igatpuri_enabled'])
        ]);

        if (approversRes.error) throw approversRes.error;
        let finalApprovers = approversRes.data || [];

        // Admin automatically gets added logic
        const admins = users.filter((u: any) => u.role === UserRole.ADMIN);
        const adminAddedPromises = admins.map(async (admin: any) => {
          const exists = finalApprovers.some(a => a.email.toLowerCase() === admin.email.toLowerCase());
          if (!exists) {
            const { data: newAdmin, error: insertError } = await supabase
              .from('meetup_approvers')
              .insert({ email: admin.email.toLowerCase(), name: admin.name || null, is_active: true })
              .select()
              .single();
            if (!insertError && newAdmin) {
              return newAdmin;
            }
          }
          return null;
        });

        const newAdmins = await Promise.all(adminAddedPromises);
        finalApprovers = [...finalApprovers, ...newAdmins.filter(a => a !== null)];
        setMeetupApprovers(finalApprovers);

        if (!settingsRes.error && settingsRes.data) {
          const seats = settingsRes.data.find((s: any) => s.setting_key === 'total_seats');
          const enabled = settingsRes.data.find((s: any) => s.setting_key === 'is_capacity_enabled');
          const calendar = settingsRes.data.find((s: any) => s.setting_key === 'is_calendar_enabled');
          const igatpuri = settingsRes.data.find((s: any) => s.setting_key === 'is_igatpuri_enabled');

          if (seats) setTotalSeats(Number(seats.setting_value));
          if (enabled) setIsCapacityEnabled(enabled.setting_value === true || enabled.setting_value === 'true');
          if (calendar) setIsCalendarEnabled(calendar.setting_value === true || calendar.setting_value === 'true');
          if (igatpuri) setIsIgatpuriEnabled(igatpuri.setting_value === true || igatpuri.setting_value === 'true');
        }
      } catch (err: any) {
        toast.error('Failed to load data: ' + err.message);
      } finally {
        setApproversLoading(false);
      }
    };
    fetchData();
  }, [users]);

  const handleUpdateSeats = async (val: number) => {
    setTotalSeats(val);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'total_seats',
          setting_value: val,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success("Total seats updated");
    } catch (err: any) {
      toast.error("Failed to update seats: " + err.message);
    }
  };

  const handleToggleCapacity = async () => {
    const newState = !isCapacityEnabled;
    setIsCapacityEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_capacity_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Capacity tracking ${newState ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleToggleCalendar = async () => {
    const newState = !isCalendarEnabled;
    setIsCalendarEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_calendar_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Availability calendar ${newState ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleToggleIgatpuri = async () => {
    const newState = !isIgatpuriEnabled;
    setIsIgatpuriEnabled(newState);
    try {
      const { error } = await supabase
        .from('meetup_settings')
        .upsert({
          setting_key: 'is_igatpuri_enabled',
          setting_value: newState,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
      toast.success(`Igatpuri Meetup ${newState ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
      setIsIgatpuriEnabled(!newState); // revert
    }
  };

  const handleAddApprover = async (userToAdd: any) => {
    setIsAddingApprover(true);
    try {
      const { data, error } = await supabase
        .from('meetup_approvers')
        .insert({ email: userToAdd.email.toLowerCase(), name: userToAdd.name || null })
        .select()
        .single();
      if (error) throw error;
      setMeetupApprovers(prev => [...prev, data]);
      setPncSearch('');
      toast.success('Meetup approver added');
    } catch (err: any) {
      if (err.code === '23505') {
        toast.error('This user is already an approver');
      } else {
        toast.error('Failed to add approver: ' + err.message);
      }
    } finally {
      setIsAddingApprover(false);
    }
  };

  const handleToggleApprover = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('meetup_approvers')
        .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setMeetupApprovers(prev => prev.map(a => a.id === id ? { ...a, is_active: !currentActive } : a));
      toast.success(`Approver ${!currentActive ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      toast.error('Failed to update approver: ' + err.message);
    }
  };

  const handleDeleteApprover = async (id: string) => {
    try {
      const { error } = await supabase.from('meetup_approvers').delete().eq('id', id);
      if (error) throw error;
      setMeetupApprovers(prev => prev.filter(a => a.id !== id));
      toast.success('Approver removed');
    } catch (err: any) {
      toast.error('Failed to remove approver: ' + err.message);
    }
  };

  const pncUsers = useMemo(() => {
    return users.filter((u: any) =>
      (u.role === UserRole.PNC || u.role === UserRole.ADMIN) &&
      !meetupApprovers.some(a => a.email.toLowerCase() === u.email.toLowerCase())
    );
  }, [users, meetupApprovers]);

  const filteredPncUsers = useMemo(() => {
    if (!pncSearch.trim()) return [];
    return pncUsers.filter((u: any) =>
      u.name?.toLowerCase().includes(pncSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(pncSearch.toLowerCase())
    );
  }, [pncUsers, pncSearch]);

  return (
    <div className="max-w-4xl space-y-12 animate-in fade-in duration-500 pb-20">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Policy Management</h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">Configure global system constraints and location-specific settings.</p>
      </header>

      {/* General Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b-2 border-slate-100 dark:border-slate-800 pb-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <i className="fa-solid fa-gears"></i>
          </div>
          <div>
            <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">General Policies</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Global travel constraints</p>
          </div>
        </div>

        <Card className="p-8 space-y-8">
          <div className="space-y-6">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-solid fa-calendar-day text-indigo-500"></i>
              Minimum Advance Booking (Days)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {travelModePolicies && travelModePolicies.length > 0 ? (
                travelModePolicies.map((p: any) => (
                  <div key={p.id} className="bg-slate-50/50 dark:bg-slate-800/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 transition-all duration-300 group">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-black text-xs text-slate-700 dark:text-slate-300 uppercase tracking-widest">{p.travelMode}</span>
                      <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-indigo-500 shadow-sm">
                        <i className={`fa-solid ${p.travelMode === 'Flight' ? 'fa-plane' :
                          p.travelMode === 'Train' ? 'fa-train' : 'fa-bus'
                          }`}></i>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="number"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-black focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={p.minAdvanceDays}
                        onChange={(e: any) => handleUpdateMinAdvanceDays(p.travelMode, parseInt(e.target.value) || 0)}
                        min="0"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-10 text-slate-400 font-bold text-sm">
                  <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Loading policies...
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6 pt-6 border-t dark:border-slate-800">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-solid fa-shield-check text-indigo-500"></i>
              Compliance & Limits
            </h4>
            <div className="max-w-xs">
              <Input
                label="Auto-approval Limit (₹)"
                type="number"
                value={policy.autoApproveBelowAmount}
                onChange={(e: any) => setPolicy({ ...policy, autoApproveBelowAmount: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </Card>
      </section>

      {/* User Profile Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b-2 border-slate-100 dark:border-slate-800 pb-3">
          <div className="w-10 h-10 bg-violet-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/20">
            <i className="fa-solid fa-user-shield"></i>
          </div>
          <div>
            <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">User Profile Settings</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Identity & Verification rules</p>
          </div>
        </div>

        <Card className="p-8 space-y-6">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Enforce Verification</p>
              <p className="text-xs text-slate-500 mt-1">Require documents before allowing travel bookings.</p>
            </div>
            <Toggle active={policy.isEnforcementEnabled} onChange={() => setPolicy({ ...policy, isEnforcementEnabled: !policy.isEnforcementEnabled })} />
          </div>

          {policy.isEnforcementEnabled && (
            <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/50 rounded-2xl p-6 space-y-4 animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-violet-600 shadow-sm flex-shrink-0">
                  <i className="fa-solid fa-clock-rotate-left"></i>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Temporary Unlock Duration</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Number of days a user can book travel after uploading documents but before they are approved by PNC.
                  </p>
                </div>
              </div>
              <div className="max-w-[200px] ml-14">
                <Input
                  label="Days Duration"
                  type="number"
                  min="1"
                  max="30"
                  value={policy.temporaryUnlockDays}
                  onChange={(e: any) => setPolicy({ ...policy, temporaryUnlockDays: parseInt(e.target.value) || 7 })}
                />
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Igatpuri Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b-2 border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <i className="fa-solid fa-campground"></i>
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-wider text-sm">Igatpuri Meetup</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Location-specific logistics</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isIgatpuriEnabled ? 'Enabled' : 'Disabled'}</span>
            <Toggle active={isIgatpuriEnabled} onChange={handleToggleIgatpuri} />
          </div>
        </div>

        <div className={`space-y-8 transition-all duration-500 ${isIgatpuriEnabled ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
          {/* Capacity & Calendar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                    <i className="fa-solid fa-chair"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white">Location Capacity</h4>
                </div>
                <Toggle active={isCapacityEnabled} onChange={handleToggleCapacity} />
              </div>
              {isCapacityEnabled && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <Input
                    label="Total Seats Available"
                    type="number"
                    min="0"
                    value={totalSeats}
                    onChange={(e) => handleUpdateSeats(Number(e.target.value))}
                  />
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed">System will alert if concurrent bookings exceed this limit.</p>
                </div>
              )}
            </Card>

            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-xl flex items-center justify-center">
                    <i className="fa-solid fa-calendar-days"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white">Availability Calendar</h4>
                </div>
                <Toggle active={isCalendarEnabled} onChange={handleToggleCalendar} />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">Toggle visibility of the interactive booking calendar for employees.</p>
            </Card>
          </div>

          {/* Approvers List */}
          <Card className="p-8 space-y-8">
            <div className="flex items-start gap-4 pb-6 border-b dark:border-slate-800">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center text-xl shadow-sm">
                <i className="fa-solid fa-user-check"></i>
              </div>
              <div>
                <h4 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">Meetup Approvers</h4>
                <p className="text-sm text-slate-500 mt-1 font-medium">Individuals authorized to confirm location availability for groups.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Left: Add New */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add Authorized Person</h5>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
                    </div>
                    <input
                      type="text"
                      placeholder="Search PNC/Admin users by name or email..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                      value={pncSearch}
                      onChange={e => setPncSearch(e.target.value)}
                    />

                    {/* Search Results Dropdown */}
                    {pncSearch.trim() !== '' && filteredPncUsers.length > 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                        {filteredPncUsers.map(user => (
                          <button
                            key={user.id}
                            onClick={() => handleAddApprover(user)}
                            className="w-full flex items-center gap-4 p-4 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all border-b last:border-0 border-slate-100 dark:border-slate-800 group text-left"
                          >
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-black flex-shrink-0">
                              {user.name ? user.name.charAt(0).toUpperCase() : <i className="fa-solid fa-user"></i>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user.name || 'Unnamed User'}</p>
                              <p className="text-xs text-slate-500 truncate">{user.email}</p>
                            </div>
                            <div className="flex-shrink-0">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${user.role === UserRole.ADMIN
                                  ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                }`}>{user.role}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No Results State */}
                    {pncSearch.trim() !== '' && filteredPncUsers.length === 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 text-center">
                        <p className="text-sm text-slate-500 font-medium">No users found for "{pncSearch}"</p>
                        <p className="text-xs text-slate-400 mt-1">Try a different name or email. Only PNC and Admin users can be added.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5 bg-emerald-50/50 dark:bg-emerald-900/5 border border-emerald-100 dark:border-emerald-800/20 rounded-2xl flex gap-4">
                  <i className="fa-solid fa-circle-info text-emerald-500 mt-1"></i>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400/80 leading-relaxed font-medium">
                    Approvers will receive notifications for location availability checks and can approve or deny requests directly from their workspace.
                  </p>
                </div>
              </div>

              {/* Right: Current List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Approvers</h5>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-black">{meetupApprovers.filter(a => a.is_active).length} PERSONS</span>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {approversLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-4">
                      <i className="fa-solid fa-spinner fa-spin text-2xl text-emerald-500"></i>
                      <span className="text-xs font-black uppercase tracking-widest">Loading List...</span>
                    </div>
                  ) : meetupApprovers.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] bg-slate-50/50 dark:bg-slate-900/50">
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest italic">No approvers configured</p>
                    </div>
                  ) : (
                    meetupApprovers.map((a) => (
                      <div key={a.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group ${a.is_active ? 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-800/10 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-all ${a.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                            {a.name?.charAt(0) || <i className="fa-solid fa-user"></i>}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 dark:text-white leading-none">{a.name || 'Staff'}</p>
                            <p className="text-xs text-slate-400 font-medium mt-1.5">{a.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleToggleApprover(a.id, a.is_active)}
                            className={`p-2 rounded-lg transition-colors ${a.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                          >
                            <i className={`fa-solid ${a.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} text-lg`}></i>
                          </button>
                          <button onClick={() => handleDeleteApprover(a.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
};

const UserRoleManagement = ({ users, onUpdateUser, currentUser }: { users: User[], onUpdateUser: (u: User) => void, currentUser: User }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Role Management</h2>
          <p className="text-slate-500 text-sm mt-1">Manage user roles and system access permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 hover:text-indigo-600 transition-all shadow-sm"
            title="Refresh Data"
          >
            <i className="fa-solid fa-sync"></i>
          </button>
          <div className="relative w-full md:w-80">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            />
          </div>
        </div>
      </header>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                <th className="px-8 py-6">User Details</th>
                <th className="px-8 py-6">Status / Role</th>
                <th className="px-8 py-6 text-right">Update Access</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {paginatedUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 bg-indigo-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center font-black text-indigo-600 border border-slate-100 dark:border-slate-700 shadow-sm group-hover:scale-105 transition-transform">
                        {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover rounded-2xl" /> : user.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white leading-tight">{user.name}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <StatusBadge type="status" value={user.role} />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <select
                      value={user.role}
                      onChange={(e) => onUpdateUser({ ...user, role: e.target.value as UserRole })}
                      className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-black text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={currentUser.role === UserRole.PNC && user.role !== UserRole.EMPLOYEE && user.role !== UserRole.PNC}
                    >
                      {Object.values(UserRole).filter(role => {
                        if (currentUser.role === UserRole.PNC) {
                          return role === UserRole.EMPLOYEE || role === UserRole.PNC;
                        }
                        return true;
                      }).map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination & Controls */}
        <div className="px-8 py-6 bg-slate-50/50 dark:bg-slate-800/30 border-t dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {filteredUsers.length > 0 ? (
                <>Showing <span className="text-slate-700 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of {filteredUsers.length}</>
              ) : "No users found"}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Rows</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 dark:text-white outline-none"
              >
                {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-xl text-xs font-black transition-all ${currentPage === page ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- Profile View Helpers ---
const Section = ({ title, children, icon }: { title: string, children: React.ReactNode, icon?: string }) => (
  <div className="space-y-6 pt-6 first:pt-0">
    <div className="flex items-center gap-3 border-b dark:border-slate-800 pb-3">
      {icon && <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center"><i className={`fa-solid ${icon}`}></i></div>}
      <h4 className="font-bold text-slate-800 dark:text-white text-lg">{title}</h4>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {children}
    </div>
  </div>
);

const SubHeader = ({ title }: { title: string }) => (
  <div className="md:col-span-2">
    <h5 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{title}</h5>
  </div>
);

const OnboardingView = ({ user, policy, onUpdate, isLock, onSkip, isDarkMode, onToggleTheme, onLogout }: any) => {
  const [formData, setFormData] = useState(user);

  // Sync internal state if prop changes (important for role toggles)
  useEffect(() => {
    setFormData(user);
  }, [user]);


  // Calculate profile completeness (excluding email)
  const calculateCompleteness = () => {
    let completed = 0;
    const total = 11; // 11 key fields for full profile

    if (formData.name && formData.name.trim() !== '') completed++;
    if (formData.department && formData.department.trim() !== '') completed++;
    if (formData.campus && formData.campus.trim() !== '') completed++;
    if (formData.managerName && formData.managerName.trim() !== '') completed++;
    if (formData.managerEmail && formData.managerEmail.trim() !== '') completed++;
    if (formData.passportPhoto?.fileUrl) completed++;
    if (formData.idProof?.fileUrl) completed++;
    if (formData.phone && formData.phone.trim() !== '') completed++;
    if (formData.emergencyContactName && formData.emergencyContactName.trim() !== '') completed++;
    if (formData.emergencyContactPhone && formData.emergencyContactPhone.trim() !== '') completed++;
    if (formData.bloodGroup && formData.bloodGroup.trim() !== '') completed++;

    return Math.round((completed / total) * 100);
  };

  const completeness = calculateCompleteness();

  const calculateDaysRemaining = (doc?: UserDocument) => {
    if (!doc?.uploadedAt || !doc?.fileUrl) return null;
    if (doc.status === VerificationStatus.APPROVED) return null;
    if (doc.status === VerificationStatus.REJECTED) return null;

    const uploadedDate = new Date(doc.uploadedAt);
    const now = new Date();
    const daysSinceUpload = (now.getTime() - uploadedDate.getTime()) / (1000 * 60 * 60 * 24);
    const daysRemaining = Math.max(0, policy.temporaryUnlockDays - daysSinceUpload);
    return Math.ceil(daysRemaining);
  };

  const minDaysRemaining = useMemo(() => {
    const pDays = calculateDaysRemaining(formData.passportPhoto);
    const iDays = calculateDaysRemaining(formData.idProof);
    if (pDays === null && iDays === null) return null;
    if (pDays === null) return iDays;
    if (iDays === null) return pDays;
    return Math.min(pDays, iDays);
  }, [formData.passportPhoto, formData.idProof, policy.temporaryUnlockDays]);

  const [isUploading, setIsUploading] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'avatar' | 'passportPhoto' | 'idProof') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Max size is 5MB.");
      return;
    }

    setIsUploading(field);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${field}_${Date.now()}.${fileExt}`;
      const filePath = `${formData.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-documents')
        .getPublicUrl(filePath);

      if (field === 'avatar') {
        setFormData({ ...formData, avatar: publicUrl });
      } else {
        const currentDoc = formData[field] || { status: VerificationStatus.INCOMPLETE };
        setFormData({
          ...formData,
          [field]: {
            ...currentDoc,
            fileUrl: publicUrl,
            status: VerificationStatus.PENDING,
            uploadedAt: new Date().toISOString()
          }
        });
      }
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')} uploaded!`);
    } catch (err: any) {
      console.error("Upload fail:", err);
      toast.error("Upload failed: " + (err.message || "Please check if 'user-documents' bucket exists."));
    } finally {
      setIsUploading(null);
    }
  };

  const handleSave = () => {
    const phoneRegex = /^\d{10}$/;
    if (formData.phone && !phoneRegex.test(formData.phone)) {
      toast.error("Contact Number must be exactly 10 digits");
      return;
    }
    if (formData.emergencyContactPhone && !phoneRegex.test(formData.emergencyContactPhone)) {
      toast.error("Emergency Contact Number must be exactly 10 digits");
      return;
    }

    onUpdate(formData);
    toast.success("Profile updated successfully");
  };

  const bloodGroupOptions = [
    { label: 'A+', value: 'A+' }, { label: 'A-', value: 'A-' },
    { label: 'B+', value: 'B+' }, { label: 'B-', value: 'B-' },
    { label: 'O+', value: 'O+' }, { label: 'O-', value: 'O-' },
    { label: 'AB+', value: 'AB+' }, { label: 'AB-', value: 'AB-' }
  ];

  return (
    <div className={`space-y-8 animate-in fade-in duration-500 pb-20 ${isLock ? 'w-full max-w-3xl mx-auto' : ''}`}>
      <header className="flex flex-col md:flex-row items-center gap-8 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative group">
          <div className={`w-32 h-32 bg-indigo-50 dark:bg-slate-800 rounded-full overflow-hidden border-4 border-white dark:border-slate-900 shadow-xl transition-all group-hover:brightness-90 flex items-center justify-center ${isUploading === 'avatar' ? 'animate-pulse' : ''}`}>
            {isUploading === 'avatar' ? (
              <i className="fa-solid fa-spinner fa-spin text-indigo-600 text-3xl"></i>
            ) : formData.avatar ? (
              <img src={formData.avatar} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{formData.name?.charAt(0) || 'U'}</span>
            )}
          </div>
          <label className="absolute bottom-1 right-1 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900 transform group-hover:scale-110 transition-all cursor-pointer">
            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'avatar')} disabled={!!isUploading} />
            <i className="fa-solid fa-camera text-sm"></i>
          </label>
        </div>

        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{isLock ? 'Getting Started' : 'Account Profile'}</h2>
              <p className="text-slate-500 text-sm font-medium">{isLock ? 'Please complete your profile to enable travel booking features.' : 'Maintain your personal, professional and identity information.'}</p>
            </div>
            {!isLock && (
              <div className="flex items-center gap-3 self-center md:self-start">
                <button
                  onClick={onToggleTheme}
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-xl transition-all shadow-sm active:scale-95"
                  title="Toggle Theme"
                >
                  {isDarkMode ? <i className="fa-solid fa-sun text-lg"></i> : <i className="fa-solid fa-moon text-lg"></i>}
                </button>
                <button
                  onClick={onLogout}
                  className="px-5 py-2.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2"
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  Sign Out
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Profile Completeness</span>
              <span className={`text-xs font-bold leading-none ${completeness === 100 ? 'text-emerald-500' : 'text-indigo-600'}`}>{completeness}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ease-out ${completeness === 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.4)]'}`}
                style={{ width: `${completeness}%` }}
              ></div>
            </div>
          </div>
        </div>
      </header>

      {/* Warnings & Notices */}
      <div className="space-y-4">
        {isLock && onSkip && policy.isEnforcementEnabled && !minDaysRemaining && (
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                <i className="fa-solid fa-forward-step text-xl text-indigo-500"></i>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800 dark:text-white">Need to book travel immediately?</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">You can temporarily skip verification for {policy.temporaryUnlockDays} days. After this window, full verification will be required to maintain access.</p>
              </div>
            </div>
            <button onClick={onSkip} className="whitespace-nowrap px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 rounded-xl text-xs font-black uppercase hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-all shadow-sm active:scale-95">Skip for Now</button>
          </div>
        )}

        {policy.isEnforcementEnabled && minDaysRemaining !== null && minDaysRemaining > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-5 flex items-start gap-4 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
              <i className="fa-solid fa-hourglass-half"></i>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-amber-800 dark:text-amber-400">Temporary Access Period Active</p>
              <p className="text-xs text-amber-700 dark:text-amber-500/80 mt-1 leading-relaxed">
                You have <span className="font-bold underline decoration-2">{minDaysRemaining} day{minDaysRemaining !== 1 ? 's' : ''}</span> remaining to use the travel desk while your documents are under review.
              </p>
            </div>
          </div>
        )}

        {policy.isEnforcementEnabled && minDaysRemaining === 0 && (
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
              <i className="fa-solid fa-lock"></i>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-rose-800 dark:text-rose-400">Temporary Access Expired</p>
              <p className="text-xs text-rose-700 dark:text-rose-500/80 mt-1 leading-relaxed">
                Your grace period has ended. Access to booking features will be restored automatically once your identity documents are approved by the PNC team.
              </p>
            </div>
          </div>
        )}
      </div>

      <Card className="p-8 md:p-12 space-y-12">
        {/* Personal Details */}
        <Section title="Personal Information" icon="fa-user-gear">
          <Input label="Full Name" value={formData.name || ''} onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Email Address" value={formData.email || ''} disabled placeholder="From authentication" />
          <Input label="Contact Number" value={formData.phone || ''} placeholder="10 digit mobile number" onChange={(e: any) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
        </Section>

        {/* Org Details */}
        <Section title="Professional Details" icon="fa-briefcase">
          <Input label="Department" value={formData.department || ''} onChange={(e: any) => setFormData({ ...formData, department: e.target.value })} />
          <Input label="Campus / Location" value={formData.campus || ''} onChange={(e: any) => setFormData({ ...formData, campus: e.target.value })} />
          <Input label="Approving Manager Name" value={formData.managerName || ''} onChange={(e: any) => setFormData({ ...formData, managerName: e.target.value })} />
          <Input label="Approving Manager Email" value={formData.managerEmail || ''} onChange={(e: any) => setFormData({ ...formData, managerEmail: e.target.value })} />
        </Section>

        {/* Emergency & Medical Information */}
        <Section title="Emergency & Health" icon="fa-heart-pulse">
          <Input label="Emergency Contact Name" value={formData.emergencyContactName || ''} onChange={(e: any) => setFormData({ ...formData, emergencyContactName: e.target.value })} />
          <Input label="Relationship" value={formData.emergencyContactRelation || ''} onChange={(e: any) => setFormData({ ...formData, emergencyContactRelation: e.target.value })} />
          <Input label="Emergency Contact Number" value={formData.emergencyContactPhone || ''} placeholder="10 digit mobile number" onChange={(e: any) => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <Select
            label="Blood Group"
            value={formData.bloodGroup || ''}
            options={bloodGroupOptions}
            onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
          />
          <div className="md:col-span-2">
            <TextArea
              label="Medical Conditions (Optional)"
              value={formData.medicalConditions || ''}
              placeholder="List any serious medical conditions, disabilities or allergies PNC should be aware of"
              onChange={(e) => setFormData({ ...formData, medicalConditions: e.target.value })}
            />
          </div>
        </Section>

        {/* Identity Verification */}
        <div className="space-y-8 pt-6">
          <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20"><i className="fa-solid fa-file-shield"></i></div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-lg leading-none">Identity Verification</h4>
                <p className="text-[10px] text-slate-500 mt-1.5 uppercase font-black tracking-widest leading-none">Approval Required</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* A. Passport Photo */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-sm">A. Passport Photo</h5>
                  <p className="text-xs text-slate-500 mt-1">Clear headshot with plain background</p>
                </div>
                <StatusBadge type="status" value={formData.passportPhoto?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-6 min-h-[220px] group transition-all hover:border-indigo-400">
                {isUploading === 'passportPhoto' ? (
                  <div className="flex flex-col items-center gap-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i>
                    <p className="text-2xs font-bold text-indigo-600 uppercase tracking-widest">Uploading...</p>
                  </div>
                ) : formData.passportPhoto?.fileUrl ? (
                  <div className="relative group/preview">
                    <img src={formData.passportPhoto.fileUrl} className="w-40 h-40 rounded-3xl object-cover shadow-2xl border-4 border-white dark:border-slate-800" />
                    <div className="absolute inset-0 bg-slate-900/40 rounded-3xl opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                      <i className="fa-solid fa-eye text-white text-2xl"></i>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-slate-400">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-image-portrait"></i></div>
                    <p className="text-xs font-medium">No photo uploaded</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                {(!formData.passportPhoto?.fileUrl || formData.passportPhoto.status === VerificationStatus.REJECTED || formData.passportPhoto.status === VerificationStatus.PENDING || formData.passportPhoto.status === VerificationStatus.INCOMPLETE) && (
                  <label className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'passportPhoto')} disabled={!!isUploading} />
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    {formData.passportPhoto?.fileUrl ? 'Replace Photo' : 'Upload Photo'}
                  </label>
                )}
              </div>
            </div>

            {/* B. Government ID */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-[2.5rem] p-8 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-sm">B. Government ID</h5>
                  <p className="text-xs text-slate-500 mt-1">Proof of identity (Aadhaar, Passport, etc.)</p>
                </div>
                <StatusBadge type="status" value={formData.idProof?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="space-y-6 flex-1 flex flex-col">
                <Select
                  label="ID Type"
                  value={formData.idProof?.type || ''}
                  options={Object.values(IdProofType).map(v => ({ label: v, value: v }))}
                  onChange={(e) => setFormData({ ...formData, idProof: { ...(formData.idProof || {}), type: e.target.value as IdProofType, status: formData.idProof?.status || VerificationStatus.INCOMPLETE } })}
                />

                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-6 min-h-[160px] group transition-all hover:border-violet-400">
                  {isUploading === 'idProof' ? (
                    <div className="flex flex-col items-center gap-3">
                      <i className="fa-solid fa-circle-notch fa-spin text-3xl text-violet-600"></i>
                      <p className="text-2xs font-bold text-violet-600 uppercase tracking-widest">Uploading...</p>
                    </div>
                  ) : formData.idProof?.fileUrl ? (
                    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full">
                      <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center text-violet-600 shadow-sm"><i className="fa-solid fa-file-pdf text-xl"></i></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate">Document Uploaded</p>
                        <p className="text-[10px] text-slate-500 font-medium">Click to replace or view</p>
                      </div>
                      <i className="fa-solid fa-check-circle text-emerald-500"></i>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-address-card"></i></div>
                      <p className="text-xs font-medium">No document uploaded</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-center">
                  {(!formData.idProof?.fileUrl || formData.idProof.status === VerificationStatus.REJECTED || formData.idProof.status === VerificationStatus.PENDING || formData.idProof.status === VerificationStatus.INCOMPLETE) && (
                    <label className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-violet-600/20 hover:bg-violet-700 active:scale-95 transition-all cursor-pointer">
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleFileChange(e, 'idProof')} disabled={!!isUploading} />
                      <i className="fa-solid fa-file-arrow-up"></i>
                      {formData.idProof?.fileUrl ? 'Replace ID' : 'Upload ID Document'}
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>


        <div className="pt-8 border-t dark:border-slate-800">
          <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-4 rounded-[1.25rem] font-black uppercase tracking-widest text-sm shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all">Save Profile Changes</button>
        </div>
      </Card>
    </div>
  );
};


// --- Analytics & Reporting Component ---

// --- Chart Components (CSS based) ---
const DonutChart = ({ data }: { data: { label: string, value: number, color: string }[] }) => {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  let accumulatedDeg = 0;

  const gradient = data.map(d => {
    const deg = (d.value / total) * 360;
    const str = `${d.color} ${accumulatedDeg}deg ${accumulatedDeg + deg}deg`;
    accumulatedDeg += deg;
    return str;
  }).join(', ');

  return (
    <div className="flex items-center gap-8">
      <div className="relative w-40 h-40 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-4 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center flex-col">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Requests</span>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{d.label}</span>
            <span className="text-xs text-slate-500 font-mono">({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const AnalyticsView = ({ requests, currentUser }: { requests: TravelRequest[], currentUser: User }) => {
  const [filters, setFilters] = useState({
    campus: 'All',
    department: 'All',
    period: 'All Time', // 'All Time' | 'This Month' | 'Last Month' | 'Custom Date'
    startDate: '',
    endDate: ''
  });
  const [widgets, setWidgets] = useState({
    spend: true,
    volume: true,
    status: true,
    table: true
  });

  // Filter Data Logic
  const filteredData = useMemo(() => {
    return requests.filter(r => {
      const matchCampus = filters.campus === 'All' || r.requesterCampus === filters.campus;
      const matchDept = filters.department === 'All' || r.requesterDepartment === filters.department;

      let matchDate = true;
      const reqDate = new Date(r.timestamp);
      const now = new Date();

      if (filters.period === 'This Month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        matchDate = reqDate >= startOfMonth;
      } else if (filters.period === 'Last Month') {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        matchDate = reqDate >= startOfLastMonth && reqDate <= endOfLastMonth;
      } else if (filters.period === 'Custom Date') {
        if (filters.startDate) {
          const start = new Date(filters.startDate);
          matchDate = matchDate && reqDate >= start;
        }
        if (filters.endDate) {
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          matchDate = matchDate && reqDate <= end;
        }
      }

      return matchCampus && matchDept && matchDate;
    });
  }, [requests, filters]);

  // Aggregations
  const totalRequests = filteredData.length;
  const totalBookings = filteredData.filter(r => r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED).length;
  const openRequests = filteredData.filter(r => r.pncStatus !== PNCStatus.CLOSED && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER && r.pncStatus !== PNCStatus.BOOKED).length;

  const avgProcessingTime = useMemo(() => {
    const closedReqs = filteredData.filter(r => r.pncStatus === PNCStatus.CLOSED || r.pncStatus === PNCStatus.BOOKED);
    if (closedReqs.length === 0) return 0;

    const totalTime = closedReqs.reduce((acc, r) => {
      // Find completion time from timeline or assume last update
      const created = new Date(r.timestamp).getTime();
      // Mock completion time spread over 1-3 days for demo if not real
      // In real app, check timeline for 'Booked' or 'Closed' event
      const completionEvent = r.timeline?.find(e => e.event === 'Status changed to: Closed' || e.event === 'Status changed to: Booked');
      const completed = completionEvent ? new Date(completionEvent.timestamp).getTime() : new Date().getTime();
      return acc + (completed - created);
    }, 0);

    return Math.round((totalTime / closedReqs.length) / (1000 * 60 * 60 * 24) * 10) / 10; // Days with 1 decimal
  }, [filteredData]);

  const totalSpend = Math.round(filteredData.reduce((acc, r) => acc + (r.ticketCost || 0), 0) * 100) / 100;


  // Charts Data Preparation
  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const d = r.requesterDepartment || 'Unknown';
      counts[d] = Math.round(((counts[d] || 0) + (currentUser.role === UserRole.FINANCE || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC ? (r.ticketCost || 0) : 1)) * 100) / 100;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [filteredData, currentUser.role]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      counts[r.pncStatus] = (counts[r.pncStatus] || 0) + 1;
    });

    // Map status to colors
    const colors: Record<string, string> = {
      [PNCStatus.NOT_STARTED]: '#cbd5e1', // slate-300
      [PNCStatus.APPROVAL_PENDING]: '#fcd34d', // amber-300
      [PNCStatus.APPROVED]: '#34d399', // emerald-400
      [PNCStatus.PROCESSING]: '#818cf8', // indigo-400
      [PNCStatus.BOOKED]: '#60a5fa', // blue-400
      [PNCStatus.REJECTED_BY_MANAGER]: '#fda4af', // rose-300
      [PNCStatus.REJECTED_BY_PNC]: '#f87171', // red-400
      [PNCStatus.CLOSED]: '#64748b', // slate-500
    };

    return Object.entries(counts).map(([label, value]) => ({
      label: label.replace(/_/g, ' '),
      value,
      color: colors[label] || '#94a3b8'
    }));
  }, [filteredData]);

  const uniqueCampuses = Array.from(new Set(requests.map(r => r.requesterCampus).filter(Boolean)));
  const uniqueDepts = Array.from(new Set(requests.map(r => r.requesterDepartment).filter(Boolean)));

  const isFinancialView = currentUser.role === UserRole.FINANCE || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC;
  const isPNCView = currentUser.role === UserRole.PNC || currentUser.role === UserRole.ADMIN;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">
            {currentUser.role === UserRole.EMPLOYEE ? 'My Travel Insights' : 'Analytics & Reporting'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {currentUser.role === UserRole.EMPLOYEE ? 'Track your personal travel history and spend.' : 'Data-driven insights for strategic decision making.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => {
            const csvContent = [
              ['Request ID', 'Traveler', 'Department', 'Campus', 'Route', 'Date', 'Status', 'Cost', 'Vendor', 'Invoice URL'],
              ...filteredData.map(r => [
                r.submissionId || r.id,
                r.requesterName,
                r.requesterDepartment,
                r.requesterCampus,
                `${r.from} -> ${r.to}`,
                new Date(r.dateOfTravel).toLocaleDateString(),
                r.pncStatus,
                r.ticketCost || 0,
                r.vendorName || '',
                r.invoiceUrl || ''
              ])
            ].map(e => e.join(",")).join("\n");

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `travel_report_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("CSV Export downloaded successfully!");
          }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
            <i className="fa-solid fa-download mr-2"></i>Export Report
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mr-2"><i className="fa-solid fa-filter"></i> Filters</div>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.campus} onChange={e => setFilters({ ...filters, campus: e.target.value })}>
          <option value="All">All Campuses</option>
          {uniqueCampuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })}>
          <option value="All">All Departments</option>
          {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
          <option value="All Time">All Time</option>
          <option value="This Month">This Month</option>
          <option value="Last Month">Last Month</option>
          <option value="Custom Date">Custom Date</option>
        </select>

        {filters.period === 'Custom Date' && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4">
            <input
              type="date"
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300"
              value={filters.startDate}
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
            />
            <span className="text-slate-400 font-bold">-</span>
            <input
              type="date"
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300"
              value={filters.endDate}
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isPNCView ? (
          <>
            <StatCard title="Total Requests" value={totalRequests} icon={<i className="fa-solid fa-inbox"></i>} trendUp={true} description="All time volume" />
            <StatCard title="Total Tickets" value={totalBookings} icon={<i className="fa-solid fa-check-double"></i>} trendUp={true} description="Successfully closed" />
            <StatCard title="Open Requests" value={openRequests} icon={<i className="fa-solid fa-clock"></i>} trendUp={false} description="Pending action" />
            <StatCard title="Avg Processing" value={`${avgProcessingTime} Days`} icon={<i className="fa-solid fa-stopwatch"></i>} description="Request to Close" />
          </>
        ) : (
          <>
            <StatCard title="Total Bookings" value={totalRequests} icon={<i className="fa-solid fa-ticket"></i>} trend="+5%" trendUp={true} description="Total requests in period" />
            {isFinancialView && (
              <StatCard title="Total Spend" value={`₹ ${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} trend="+12%" trendUp={false} description="Actual ticket cost" />
            )}
            <StatCard title="Avg Processing" value="1.2 Days" icon={<i className="fa-solid fa-stopwatch"></i>} description="Submit to Issue" />
            <StatCard title="Compliance Rate" value="94%" icon={<i className="fa-solid fa-check-circle"></i>} trend="-2%" trendUp={false} description="Adherence to policy" />
          </>
        )}
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {widgets.status && (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-bold text-slate-800 dark:text-white">Request Status Breakdown</h4>
            </div>
            {isPNCView ? (
              <DonutChart data={statusData} />
            ) : (
              <BarChart data={statusData} color="bg-amber-400" />
            )}
          </Card>
        )}

        {widgets.volume && (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h4 className="font-bold text-slate-800 dark:text-white">
                {isFinancialView ? 'Spend by Department' : 'Volume by Department'}
              </h4>
            </div>
            <BarChart data={deptData} color={isFinancialView ? 'bg-emerald-500' : 'bg-indigo-500'} />
          </Card>
        )}
      </div>

      {/* Master Data Table */}
      {widgets.table && (
        <Card className="overflow-hidden">
          <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
            <h4 className="font-bold text-slate-800 dark:text-white">Detailed Report</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-white dark:bg-slate-900 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Request ID</th>
                  <th className="px-6 py-4">Traveler</th>
                  <th className="px-6 py-4">Dept / Campus</th>
                  <th className="px-6 py-4">Route</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {filteredData.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-xs">{r.submissionId || r.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{r.requesterName}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {r.requesterDepartment} <span className="text-slate-300 mx-1">•</span> {r.requesterCampus}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.from} → {r.to}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString()}</td>
                    <td className="px-6 py-4"><StatusBadge type="pnc" value={r.pncStatus} /></td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      {(r.invoiceUrl || r.ticketUrl) ? (
                        <a href={r.invoiceUrl || r.ticketUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">
                          View Ticket <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                        </a>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </div>
  );
};



const IgathpuriAvailabilityModal = ({ onClose, currentUser, onSubmit }: { onClose: () => void, currentUser: User, onSubmit: (data: any) => void }) => {
  const [formData, setFormData] = useState({
    fullName: currentUser.name || '',
    email: currentUser.email || '',
    phone: currentUser.phone || '',
    department: currentUser.department || '',
    teamSize: '',
    startDate: '',
    endDate: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minStartDate = tomorrow.toISOString().split('T')[0];

  const minEndDate = formData.startDate
    ? new Date(new Date(formData.startDate).getTime() + 86400000).toISOString().split('T')[0]
    : minStartDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.teamSize || !formData.startDate || !formData.endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
        <header className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Check Availability</h3>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">Igathpuri Campus Request</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 flex items-center justify-center">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Full Name"
              value={formData.fullName}
              readOnly
              className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email Address"
                value={formData.email}
                readOnly
                className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
              />
              <Input
                label="Phone Number"
                value={formData.phone}
                readOnly
                className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
              />
            </div>
            <Input
              label="Department"
              value={formData.department}
              readOnly
              className="bg-slate-50 dark:bg-slate-800/50 opacity-70"
            />

            <div className="h-px bg-slate-100 dark:border-slate-800 my-2"></div>

            <Input
              label="Team Members Expected"
              type="number"
              placeholder="e.g. 10"
              value={formData.teamSize}
              onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Start Date</label>
                <input
                  type="date"
                  required
                  min={minStartDate}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value, endDate: e.target.value > formData.endDate ? '' : formData.endDate })}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">End Date</label>
                <input
                  type="date"
                  required
                  min={minEndDate}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="bg-violet-50 dark:bg-violet-900/10 p-4 rounded-2xl border border-violet-100 dark:border-violet-800/30 flex gap-3">
            <i className="fa-solid fa-circle-info text-violet-600 mt-0.5"></i>
            <p className="text-[10px] text-violet-700 dark:text-violet-400 leading-relaxed font-medium">
              Your request will be sent to the Igathpuri meetup approvers. Once approved, you can proceed with your travel booking.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-paper-plane mr-2"></i>}
            Submit Request
          </button>
        </form>
      </div>
    </div>
  );
};

const MeetupApprovalsView = ({ requests, onUpdate }: { requests: MeetupAvailabilityRequest[], onUpdate: (req: MeetupAvailabilityRequest, status: 'Approved' | 'Rejected') => void }) => {
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
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-slate-400 font-bold italic">No pending requests at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pending.map(r => (
              <Card key={r.id} className="p-6 space-y-4 hover:border-violet-500/50 transition-all group">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-lg text-slate-900 dark:text-white uppercase tracking-tight">{r.fullName}</h4>
                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">{r.department}</p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-[10px] font-black text-slate-500 uppercase">
                    {r.teamSize} Members
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {new Date(r.startDate).toLocaleDateString()} - {new Date(r.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Contact</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{r.phone}</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => onUpdate(r, 'Rejected')}
                    className="flex-1 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-rose-600 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-rose-50 transition-all"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => onUpdate(r, 'Approved')}
                    className="flex-[2] py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
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
                        <p className="text-[10px] text-slate-500 font-medium">{r.email}</p>
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
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right text-[10px] font-bold text-slate-400">
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

// Helper function to check if request violates advance booking policy
const checkPolicyViolation = (request: TravelRequest, policies: TravelModePolicy[]): boolean => {
  const policy = policies.find(p => p.travelMode === request.mode);
  if (!policy) return false;

  const requestDate = new Date(request.timestamp);
  const travelDate = new Date(request.dateOfTravel);

  const daysDifference = Math.floor((travelDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));

  return daysDifference < policy.minAdvanceDays;
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<TravelRequest[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('activeTab') || 'dashboard');

  useEffect(() => {
    sessionStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isPNCBookingModalOpen, setIsPNCBookingModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [baseRole, setBaseRole] = useState<UserRole | null>(null);
  const [meetupContext, setMeetupContext] = useState<any>(null);

  const [policy, setPolicy] = useState<PolicyConfig>({
    flightNoticeDays: 15,
    trainNoticeDays: 7,
    busNoticeDays: 7,
    autoApproveBelowAmount: 5000,
    isPassportRequired: true,
    isIdRequired: true,
    isEnforcementEnabled: true,
    temporaryUnlockDays: 7
  });

  const [travelModePolicies, setTravelModePolicies] = useState<TravelModePolicy[]>([]);

  const [meetupAvailabilityRequests, setMeetupAvailabilityRequests] = useState<MeetupAvailabilityRequest[]>([]);
  const [isMeetupAvailabilityModalOpen, setIsMeetupAvailabilityModalOpen] = useState(false);
  const [isMeetupApprover, setIsMeetupApprover] = useState(false);
  const [isIgatpuriEnabled, setIsIgatpuriEnabled] = useState(true);

  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Handle Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Clean up lingering '#' left by Supabase OAuth redirect
      if (window.location.href.includes('#')) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (window.location.href.includes('#')) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Prevent page reload on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Tab became VISIBLE - maintaining state, NOT reloading');
      } else {
        console.log('🙈 Tab became HIDDEN');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Track the last session to prevent unnecessary fetches on tab visibility changes
  const lastSessionRef = useRef<string | null>(null);

  // Fetch Profile and Data when session changes
  useEffect(() => {
    if (!session) {
      setCurrentUser(null);
      setRequests([]);
      setIsLoading(false);
      lastSessionRef.current = null;
      return;
    }

    // Check if this is actually a new session or just a tab visibility change
    const sessionToken = session.access_token;
    if (lastSessionRef.current === sessionToken) {
      console.log('⏭️ Session unchanged - skipping fetchData (tab visibility change)');
      return;
    }

    console.log('🆕 New session detected - fetching data');
    lastSessionRef.current = sessionToken;

    const fetchData = async () => {
      console.log('🔄 fetchData called - this should only happen on initial load or session change');
      setIsLoading(true);
      try {
        // 1. Fetch Profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) throw profileError;

        // Map snake_case to camelCase for local User type
        const mappedUser: User = {
          id: profile.id,
          name: profile.name || session.user.email?.split('@')[0],
          email: profile.email,
          role: (sessionStorage.getItem('currentRole') as UserRole) || UserRole.EMPLOYEE,
          department: profile.department,
          campus: profile.campus,
          managerName: profile.manager_name,
          managerEmail: profile.manager_email,
          passportPhoto: profile.passport_photo,
          idProof: profile.id_proof,
          avatar: profile.avatar || session.user.user_metadata.avatar_url,
          phone: profile.phone,
          emergencyContactName: profile.emergency_contact_name,
          emergencyContactPhone: profile.emergency_contact_phone,
          emergencyContactRelation: profile.emergency_contact_relation,
          bloodGroup: profile.blood_group,
          medicalConditions: profile.medical_conditions,
        };
        setCurrentUser(mappedUser);
        setBaseRole(profile.role as UserRole);

        // 2. Fetch Requests
        let query = supabase.from('travel_requests').select('*');

        // Employees see their own requests AND requests they need to approve
        if (mappedUser.role === UserRole.EMPLOYEE) {
          query = query.or(`requester_id.eq.${mappedUser.id},approving_manager_email.eq.${mappedUser.email}`);
        }

        const { data: reqs, error: reqsError } = await query.order('created_at', { ascending: false });
        if (reqsError) throw reqsError;

        // Map snake_case to camelCase for TravelRequest type
        const mappedReqs = reqs.map((r: any) => ({
          id: r.id,
          submissionId: r.submission_id,
          timestamp: r.created_at,
          requesterId: r.requester_id,
          requesterName: r.requester_name,
          requesterEmail: r.requester_email,
          requesterPhone: r.requester_phone,
          requesterDepartment: r.requester_department,
          requesterCampus: r.requester_campus,
          purpose: r.purpose,
          approvingManagerName: r.approving_manager_name,
          approvingManagerEmail: r.approving_manager_email,
          tripType: r.trip_type,
          mode: r.travel_mode,
          from: r.from_location,
          to: r.to_location,
          dateOfTravel: r.date_of_travel,
          preferredDepartureWindow: r.preferred_departure_window,
          returnDate: r.return_date,
          returnPreferredDepartureWindow: r.return_preferred_departure_window,
          numberOfTravelers: r.number_of_travelers,
          travellerNames: r.traveller_names,
          priority: r.priority,
          specialRequirements: r.special_requirements,
          approvalStatus: r.approval_status,
          pncStatus: r.pnc_status,
          ticketCost: r.ticket_cost,
          vendorName: r.vendor_name,
          invoiceUrl: r.invoice_url,
          timeline: r.timeline || [],
          emergencyContactName: r.emergency_contact_name,
          emergencyContactPhone: r.emergency_contact_phone,
          emergencyContactRelation: r.emergency_contact_relation,
          bloodGroup: r.blood_group,
          medicalConditions: r.medical_conditions,
          hasViolation: r.has_violation,
          violationDetails: r.violation_reason,
          bookedBy: r.booked_by, // 'PNC' or 'SELF'
        }));

        setRequests(mappedReqs);

        // 3. If Admin/PNC, fetch all users
        if (mappedUser.role === UserRole.ADMIN || mappedUser.role === UserRole.PNC) {
          const { data: allUsers, error: usersError } = await supabase.from('profiles').select('*');
          if (!usersError && allUsers) {
            console.log(`Fetched ${allUsers.length} users for role ${mappedUser.role}`);
            setUsers(allUsers.map((u: any) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              department: u.department,
              campus: u.campus,
              passportPhoto: u.passport_photo,
              idProof: u.id_proof,
              phone: u.phone,
              emergencyContactName: u.emergency_contact_name,
              emergencyContactPhone: u.emergency_contact_phone,
              emergencyContactRelation: u.emergency_contact_relation,
              bloodGroup: u.blood_group,
              medicalConditions: u.medical_conditions,
            })));
          } else {
            console.error("Users error:", usersError);
            // Fallback: at least include self
            setUsers([mappedUser]);
          }
        } else {
          // Non-admin only see themselves
          setUsers([mappedUser]);
        }

        // 5. Fetch Meetup Availability Requests
        const { data: meetupApprovers, error: approverError } = await supabase
          .from('meetup_approvers')
          .select('email')
          .eq('email', mappedUser.email.toLowerCase())
          .eq('is_active', true);

        const userIsApprover = !approverError && meetupApprovers && meetupApprovers.length > 0;
        setIsMeetupApprover(!!userIsApprover);

        let meetupQuery = supabase.from('meetup_availability_requests').select('*');
        if (!userIsApprover && mappedUser.role !== UserRole.PNC && mappedUser.role !== UserRole.ADMIN) {
          meetupQuery = meetupQuery.eq('profile_id', mappedUser.id);
        }

        const { data: mReqs, error: mReqsError } = await meetupQuery.order('created_at', { ascending: false });
        if (!mReqsError && mReqs) {
          setMeetupAvailabilityRequests(mReqs.map((r: any) => ({
            id: r.id,
            profileId: r.profile_id,
            fullName: r.full_name,
            email: r.email,
            phone: r.phone,
            department: r.department,
            teamSize: r.team_size,
            startDate: r.start_date,
            endDate: r.end_date,
            status: r.status as any,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            timeline: r.timeline || [],
            attendeeEmails: r.attendee_emails || [],
            isFinalized: r.is_finalized || false
          })));
        }

        // 6. Fetch Travel Mode Policies
        const { data: policiesData, error: policiesError } = await supabase
          .from('travel_mode_policies')
          .select('*')
          .order('travel_mode', { ascending: true });

        if (!policiesError && policiesData) {
          setTravelModePolicies(policiesData.map((p: any) => ({
            id: p.id,
            travelMode: p.travel_mode,
            minAdvanceDays: p.min_advance_days,
            description: p.description,
            createdAt: p.created_at,
            updatedAt: p.updated_at
          })));
        }

        // 7. Fetch Meetup Settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('meetup_settings')
          .select('*')
          .in('setting_key', ['is_igatpuri_enabled']);

        if (!settingsError && settingsData) {
          const igatpuriSetting = settingsData.find(s => s.setting_key === 'is_igatpuri_enabled');
          if (igatpuriSetting) {
            setIsIgatpuriEnabled(igatpuriSetting.setting_value === true || igatpuriSetting.setting_value === 'true');
          }
        }

      } catch (err: any) {
        toast.error("Failed to load data: " + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [session]);

  // Re-fetch all users if role changes to Admin/PNC and we only have self
  useEffect(() => {
    if ((currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.PNC) && users.length <= 1) {
      const fetchAllUsers = async () => {
        const { data: allUsers, error: usersError } = await supabase.from('profiles').select('*');
        if (!usersError && allUsers) {
          setUsers(allUsers.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            department: u.department,
            campus: u.campus,
            passportPhoto: u.passport_photo,
            idProof: u.id_proof,
            phone: u.phone,
            emergencyContactName: u.emergency_contact_name,
            emergencyContactPhone: u.emergency_contact_phone,
            emergencyContactRelation: u.emergency_contact_relation,
            bloodGroup: u.blood_group,
            medicalConditions: u.medical_conditions,
          })));
        }
      };
      fetchAllUsers();
    }
  }, [currentUser?.role]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // Calculate profile completeness (excluding email)
  // Fields: name, department, campus, managerName, managerEmail, passportPhoto, idProof = 7 fields
  const calculateProfileCompleteness = (user: User | null): number => {
    if (!user) return 0;
    let completed = 0;
    const total = 7;

    if (user.name && user.name.trim() !== '') completed++;
    if (user.department && user.department.trim() !== '') completed++;
    if (user.campus && user.campus.trim() !== '') completed++;
    if (user.managerName && user.managerName.trim() !== '') completed++;
    if (user.managerEmail && user.managerEmail.trim() !== '') completed++;
    if (user.passportPhoto?.fileUrl) completed++;
    if (user.idProof?.fileUrl) completed++;
    if (user.phone && user.phone.trim() !== '') completed++;
    if (user.emergencyContactName && user.emergencyContactName.trim() !== '') completed++;
    if (user.emergencyContactPhone && user.emergencyContactPhone.trim() !== '') completed++;
    if (user.bloodGroup && user.bloodGroup.trim() !== '') completed++;

    return Math.round((completed / 11) * 100);
  };

  const isUserVerified = (user: User | null) => {
    if (!user) return false;
    const passportOk = !policy.isPassportRequired || user.passportPhoto?.status === VerificationStatus.APPROVED;
    const idOk = !policy.isIdRequired || user.idProof?.status === VerificationStatus.APPROVED;

    // If already approved, return true
    if (passportOk && idOk) return true;

    // Check if user skipped verification and is still within the skip period
    if (user.skippedVerificationAt) {
      const now = new Date();
      const skippedDate = new Date(user.skippedVerificationAt);
      const daysSinceSkip = (now.getTime() - skippedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSkip <= policy.temporaryUnlockDays) {
        return true; // Still within skip period
      }
    }

    // Check for temporary unlock: if documents are uploaded and within the unlock period
    const now = new Date();
    const checkTemporaryUnlock = (doc?: UserDocument) => {
      if (!doc?.uploadedAt || !doc?.fileUrl) return false;
      if (doc.status === VerificationStatus.REJECTED) return false; // Rejected docs don't get temporary unlock

      const uploadedDate = new Date(doc.uploadedAt);
      const daysSinceUpload = (now.getTime() - uploadedDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpload <= policy.temporaryUnlockDays;
    };

    const passportTempUnlock = !policy.isPassportRequired || checkTemporaryUnlock(user.passportPhoto);
    const idTempUnlock = !policy.isIdRequired || checkTemporaryUnlock(user.idProof);

    return passportTempUnlock && idTempUnlock;
  };

  const isLocked = useMemo(() => {
    if (!currentUser) return false; // Don't lock if user isn't loaded yet
    if (currentUser.role === UserRole.ADMIN) return false;
    if (!policy.isEnforcementEnabled) return false;
    return !isUserVerified(currentUser);
  }, [currentUser, policy]);

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          department: updatedUser.department,
          campus: updatedUser.campus,
          manager_name: updatedUser.managerName,
          manager_email: updatedUser.managerEmail,
          passport_photo: updatedUser.passportPhoto,
          id_proof: updatedUser.idProof,
          phone: updatedUser.phone,
          emergency_contact_name: updatedUser.emergencyContactName,
          emergency_contact_phone: updatedUser.emergencyContactPhone,
          emergency_contact_relation: updatedUser.emergencyContactRelation,
          blood_group: updatedUser.bloodGroup,
          medical_conditions: updatedUser.medicalConditions,
          role: updatedUser.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', updatedUser.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (currentUser?.id === updatedUser.id) {
        setCurrentUser(updatedUser);
      }
      toast.success("Profile updated in database");
    } catch (err: any) {
      toast.error("Update failed: " + err.message);
    }
  };

  const handleMeetupAvailabilitySubmit = async (data: any) => {
    try {
      const { data: newReq, error } = await supabase
        .from('meetup_availability_requests')
        .insert({
          profile_id: currentUser!.id,
          full_name: data.fullName,
          email: data.email,
          phone: data.phone,
          department: data.department,
          team_size: parseInt(data.teamSize),
          start_date: data.startDate,
          end_date: data.endDate,
          status: 'Pending',
          timeline: [{
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            actor: currentUser!.name,
            event: 'Availability Request Submitted',
            details: `For ${data.teamSize} members`
          }]
        })
        .select()
        .single();

      if (error) throw error;

      const mapped: MeetupAvailabilityRequest = {
        id: newReq.id,
        profileId: newReq.profile_id,
        fullName: newReq.full_name,
        email: newReq.email,
        phone: newReq.phone,
        department: newReq.department,
        teamSize: newReq.team_size,
        startDate: newReq.start_date,
        endDate: newReq.end_date,
        status: newReq.status as any,
        createdAt: newReq.created_at,
        updatedAt: newReq.updated_at,
        timeline: newReq.timeline || []
      };

      setMeetupAvailabilityRequests(prev => [mapped, ...prev]);
      toast.success("Availability request submitted successfully!");
    } catch (err: any) {
      toast.error("Failed to submit request: " + err.message);
      throw err;
    }
  };

  const handleUpdateMeetupRequest = async (req: MeetupAvailabilityRequest, status: 'Approved' | 'Rejected') => {
    try {
      const { error } = await supabase
        .from('meetup_availability_requests')
        .update({
          status,
          timeline: [...req.timeline, {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            actor: currentUser!.name,
            event: `Request ${status}`,
            details: 'Action by Approver'
          }]
        })
        .eq('id', req.id);

      if (error) throw error;

      setMeetupAvailabilityRequests(prev => prev.map(r => r.id === req.id ? {
        ...r, status, updatedAt: new Date().toISOString(), timeline: [...r.timeline, {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          actor: currentUser!.name,
          event: `Request ${status}`,
          details: 'Action by Approver'
        }]
      } : r));

      toast.success(`Request ${status} successfully`);
    } catch (err: any) {
      toast.error("Failed to update request: " + err.message);
    }
  };

  const renderContent = () => {
    if (isLoading || !currentUser) return <LoadingView />;

    // Helper to render the appropriate dashboard based on role
    const renderDashboard = () => {
      if (currentUser.role === UserRole.EMPLOYEE) {
        const completeness = calculateProfileCompleteness(currentUser);
        return (
          <EmployeeDashboard
            requests={requests.filter(r => r.requesterId === currentUser.id)}
            onNewRequest={(context?: any) => {
              setMeetupContext(context);
              setIsNewRequestModalOpen(true);
            }}
            onView={setSelectedRequest}
            isWarningVisible={!isUserVerified(currentUser) && !policy.isEnforcementEnabled}
            completeness={completeness}
            onViewProfile={() => handleTabChange('profile')}
            user={currentUser}
            meetupRequests={meetupAvailabilityRequests}
            onNavigateToMeetup={() => handleTabChange('igathpuri-meetup')}
          />
        );
      }
      if (currentUser.role === UserRole.ADMIN) {
        return <AdminDashboard requests={requests} users={users} onTabChange={handleTabChange} />;
      }
      if (currentUser.role === UserRole.PNC) {
        return <PNCDashboard requests={requests} onTabChange={handleTabChange} onView={setSelectedRequest} policies={travelModePolicies} />;
      }
      if (currentUser.role === UserRole.FINANCE) {
        return <FinanceDashboard requests={requests} />;
      }
      return null;
    };

    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'analytics':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <AnalyticsView requests={requests} currentUser={currentUser} />;
      case 'past-requests':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <PastRequestsView requests={requests.filter(r => r.requesterId === currentUser.id)} onView={setSelectedRequest} />;
      case 'mail-templates':
        return <MailTemplatesView currentUserRole={currentUser.role} />;
      case 'requests':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        // Filter out rejected and closed requests from queue
        const activeRequests = requests.filter((r: TravelRequest) =>
          r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER &&
          r.pncStatus !== PNCStatus.REJECTED_BY_PNC &&
          r.pncStatus !== PNCStatus.CLOSED
        );
        return <AdminQueueView requests={activeRequests} onView={setSelectedRequest} policies={travelModePolicies} />;
      case 'all-requests':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <AdminQueueView requests={requests} onView={setSelectedRequest} showAll={true} policies={travelModePolicies} />;
      case 'verification':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <VerificationQueue users={users} onUpdateUser={handleUpdateUser} />;
      case 'policies':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <PolicyManagement
          policy={policy}
          setPolicy={setPolicy}
          travelModePolicies={travelModePolicies}
          setTravelModePolicies={setTravelModePolicies}
          users={users}
          isIgatpuriEnabled={isIgatpuriEnabled}
          setIsIgatpuriEnabled={setIsIgatpuriEnabled}
        />;
      case 'role-management':
        if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.PNC) return renderDashboard();
        return <UserRoleManagement users={users} onUpdateUser={handleUpdateUser} currentUser={currentUser} />;
      case 'profile':
        return (
          <div className="max-w-4xl mx-auto transition-all duration-300">
            <OnboardingView user={currentUser!} policy={policy} onUpdate={handleUpdateUser} isLock={false} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} onLogout={() => { sessionStorage.removeItem('activeTab'); sessionStorage.removeItem('currentRole'); setActiveTab('dashboard'); supabase.auth.signOut(); }} />
          </div>
        );
      case 'settings':
        return <SettingsView isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} />;
      case 'approvals':
        if (currentUser.role === UserRole.EMPLOYEE) {
          const pendingApprovals = requests.filter(r => r.approvingManagerEmail === currentUser?.email && r.pncStatus === PNCStatus.APPROVAL_PENDING);
          return <ManagerApprovalsView
            requests={pendingApprovals}
            currentUser={currentUser}
            onUpdate={async (updatedReq: TravelRequest, newStatus: PNCStatus) => {
              try {
                const { error } = await supabase
                  .from('travel_requests')
                  .update({
                    pnc_status: newStatus,
                    timeline: [...updatedReq.timeline, {
                      id: Date.now().toString(),
                      timestamp: new Date().toISOString(),
                      actor: currentUser.name,
                      event: `Status changed to: ${newStatus}`,
                      details: 'Manager Action'
                    }]
                  })
                  .eq('id', updatedReq.id);

                if (error) throw error;

                const updated = {
                  ...updatedReq,
                  pncStatus: newStatus,
                  timeline: [...updatedReq.timeline, {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    actor: currentUser.name,
                    event: `Status changed to: ${newStatus}`,
                    details: 'Manager Action'
                  }]
                };

                setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                toast.success(`Request ${newStatus === PNCStatus.APPROVED ? 'Approved' : 'Rejected'}`);
                if (pendingApprovals.length <= 1) handleTabChange('dashboard'); // Go back if no more
              } catch (e: any) {
                toast.error("Failed to update: " + e.message);
              }
            }}
          />;
        }
        return renderDashboard();
      case 'igathpuri-meetup':
        if (!isIgatpuriEnabled) return renderDashboard();
        return <IgathpuriMeetupView
          onNewRequest={(context?: any) => {
            setMeetupContext(context);
            setIsNewRequestModalOpen(true);
          }}
          onCheckAvailability={() => setIsMeetupAvailabilityModalOpen(true)}
          availabilityRequests={meetupAvailabilityRequests}
          currentUser={currentUser}
          onViewProfile={() => handleTabChange('profile')}
          requests={requests}
          onView={(r: TravelRequest) => {
            setSelectedRequest(r);
          }}
        />;
      case 'meetup-approvals':
        if (!isIgatpuriEnabled) return renderDashboard();
        return <MeetupApprovalsView
          requests={meetupAvailabilityRequests}
          onUpdate={handleUpdateMeetupRequest}
        />;
      default:
        return null;
    }
  };

  const handleSkipVerification = () => {
    const updatedUser = {
      ...currentUser,
      skippedVerificationAt: new Date().toISOString()
    };
    handleUpdateUser(updatedUser);
    toast.success(`Verification skipped. You have ${policy.temporaryUnlockDays} days to complete your profile.`);
  };

  if (!session || isResettingPassword) {
    return <AuthView initialMode={isResettingPassword ? 'reset' : 'login'} onFinishReset={() => setIsResettingPassword(false)} />;
  }

  // If loading is finished but fetching the profile failed, show session logout/error
  if (!isLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/20 text-rose-600 rounded-3xl flex items-center justify-center text-3xl mx-auto shadow-xl">
            <i className="fa-solid fa-cloud-bolt"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Connection Error</h2>
          <p className="text-slate-500 font-medium">We couldn't load your profile. This might be due to a database sync issue or incorrect permissions.</p>
          <div className="flex flex-col gap-3 pt-4">
            <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all">Retry Connection</button>
            <button onClick={() => { sessionStorage.removeItem('activeTab'); sessionStorage.removeItem('currentRole'); supabase.auth.signOut(); }} className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest transition-all">Sign Out & Try Again</button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <LoadingView />;

  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
        <Toaster position="top-right" richColors />
        <nav className="h-16 bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-8 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-600/20">N</div>
            <h1 className="font-bold tracking-tight text-slate-800 dark:text-white">Navgurukul Travel Desk</h1>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem('activeTab'); sessionStorage.removeItem('currentRole'); supabase.auth.signOut(); }}
            className="text-xs font-bold text-slate-400 hover:text-rose-600 uppercase tracking-widest transition-all duration-300 px-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
          >
            Sign Out
          </button>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-transparent to-transparent dark:from-indigo-900/10 transition-colors duration-300">
          <OnboardingView
            user={currentUser!}
            policy={policy}
            onUpdate={handleUpdateUser}
            isLock={true}
            onSkip={handleSkipVerification}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />
      <Navbar currentUser={currentUser!} baseRole={baseRole} isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} onToggleRole={(r) => {
        // Mock role toggle for demo, usually role is static from DB
        sessionStorage.setItem('currentRole', r);
        setCurrentUser(prev => prev ? { ...prev, role: r } : null);
        handleTabChange('dashboard');
      }} onOpenProfile={() => handleTabChange('profile')} />

      <div className="flex-1 flex flex-col md:flex-row transition-colors duration-300 relative">
        <aside className={`app-sidebar ${isSidebarOpen ? 'sidebar-open' : ''} w-full md:w-64 bg-white dark:bg-slate-900 border-r dark:border-slate-800 p-6 flex flex-col space-y-6 transition-colors duration-300 md:sticky md:top-16 md:h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar`}>
          {currentUser.role === UserRole.EMPLOYEE && (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">MY SPACE</p>
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
                {isIgatpuriEnabled && <SidebarLink icon="fa-person-shelter" label="Igathpuri Meetup" active={activeTab === 'igathpuri-meetup'} onClick={() => handleTabChange('igathpuri-meetup')} />}
                {requests.filter(r => r.approvingManagerEmail === currentUser?.email && r.pncStatus === PNCStatus.APPROVAL_PENDING).length > 0 && (
                  <SidebarLink
                    icon="fa-file-signature"
                    label="Approvals"
                    active={activeTab === 'approvals'}
                    onClick={() => handleTabChange('approvals')}
                    badge={requests.filter(r => r.approvingManagerEmail === currentUser?.email && r.pncStatus === PNCStatus.APPROVAL_PENDING).length}
                  />
                )}
                {isMeetupApprover && isIgatpuriEnabled && (
                  <SidebarLink
                    icon="fa-calendar-check"
                    label="Meetup Approvals"
                    active={activeTab === 'meetup-approvals'}
                    onClick={() => handleTabChange('meetup-approvals')}
                    badge={meetupAvailabilityRequests.filter(r => r.status === 'Pending').length || null}
                  />
                )}
              </div>

            </>
          )}

          {currentUser.role === UserRole.PNC && (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">OPERATIONS</p>
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
                <SidebarLink
                  icon="fa-calendar-plus"
                  label="Self Booking"
                  active={false}
                  onClick={() => setIsPNCBookingModalOpen(true)}
                  badge={<i className="fa-solid fa-plus text-xs"></i>}
                  badgeColor="bg-blue-600 w-5 h-5 flex items-center justify-center !p-0"
                />
                <SidebarLink icon="fa-list-check" label="Queue" active={activeTab === 'requests'} onClick={() => handleTabChange('requests')} />
                <SidebarLink icon="fa-table-list" label="All Requests" active={activeTab === 'all-requests'} onClick={() => handleTabChange('all-requests')} />
                <SidebarLink icon="fa-chart-simple" label="Analytics" active={activeTab === 'analytics'} onClick={() => handleTabChange('analytics')} />
              </div>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">EVENTS</p>
                {isIgatpuriEnabled && <SidebarLink icon="fa-person-shelter" label="Igathpuri Meetup" active={activeTab === 'igathpuri-meetup'} onClick={() => handleTabChange('igathpuri-meetup')} />}
                {isMeetupApprover && isIgatpuriEnabled && (
                  <SidebarLink
                    icon="fa-calendar-check"
                    label="Meetup Approvals"
                    active={activeTab === 'meetup-approvals'}
                    onClick={() => handleTabChange('meetup-approvals')}
                    badge={meetupAvailabilityRequests.filter(r => r.status === 'Pending').length || null}
                  />
                )}
              </div>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">CONFIGURATION</p>
                <SidebarLink icon="fa-envelope-open-text" label="Mail Templates" active={activeTab === 'mail-templates'} onClick={() => handleTabChange('mail-templates')} />
                <SidebarLink icon="fa-id-card-clip" label="Verification" active={activeTab === 'verification'} onClick={() => handleTabChange('verification')} badge={users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING).length || null} />
                <SidebarLink icon="fa-shield-halved" label="Policies" active={activeTab === 'policies'} onClick={() => handleTabChange('policies')} />
                <SidebarLink icon="fa-users-gear" label="Roles" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
              </div>

            </>
          )}

          {currentUser.role === UserRole.FINANCE && (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">OPERATIONS</p>
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
                <SidebarLink icon="fa-table-list" label="All Requests" active={activeTab === 'all-requests'} onClick={() => handleTabChange('all-requests')} />
                <SidebarLink icon="fa-chart-simple" label="Analytics" active={activeTab === 'analytics'} onClick={() => handleTabChange('analytics')} />
              </div>

            </>
          )}

          {currentUser.role === UserRole.ADMIN && (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">OPERATIONS</p>
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
                <SidebarLink icon="fa-chart-simple" label="Analytics" active={activeTab === 'analytics'} onClick={() => handleTabChange('analytics')} />
              </div>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">CONFIGURATION</p>
                <SidebarLink icon="fa-envelope-open-text" label="Mail Templates" active={activeTab === 'mail-templates'} onClick={() => handleTabChange('mail-templates')} />
                <SidebarLink icon="fa-id-card-clip" label="Verification" active={activeTab === 'verification'} onClick={() => handleTabChange('verification')} badge={users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING).length || null} />
                <SidebarLink icon="fa-shield-halved" label="Policies" active={activeTab === 'policies'} onClick={() => handleTabChange('policies')} />
                <SidebarLink icon="fa-users-gear" label="Roles" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
              </div>

            </>
          )}
        </aside>

        <main className="app-main flex-1 p-8 overflow-auto transition-colors duration-300 bg-slate-50/50 dark:bg-slate-950">
          {renderContent()}
        </main>
      </div>

      {isMeetupAvailabilityModalOpen && (
        <IgathpuriAvailabilityModal
          onClose={() => setIsMeetupAvailabilityModalOpen(false)}
          currentUser={currentUser!}
          onSubmit={handleMeetupAvailabilitySubmit}
        />
      )}

      {isNewRequestModalOpen && (
        <NewRequestModal
          onClose={() => {
            setIsNewRequestModalOpen(false);
            setMeetupContext(null);
          }}
          currentUser={currentUser!}
          policies={travelModePolicies}
          meetupContext={meetupContext}
          onSubmit={async (data: any) => {
            try {
              // Create temporary request object to check for violations
              const tempRequest: TravelRequest = {
                ...data,
                id: 'temp',
                timestamp: new Date().toISOString(),
                tripType: data.tripType,
                mode: data.mode,
                from: data.from,
                to: data.to,
                dateOfTravel: data.dateOfTravel,
              } as TravelRequest;

              const isViolated = checkPolicyViolation(tempRequest, travelModePolicies);

              const newRequest = {
                requester_id: currentUser!.id,
                requester_name: data.requesterName || currentUser!.name,
                requester_email: currentUser!.email,
                requester_phone: data.requesterPhone,
                requester_department: data.requesterDepartment || currentUser!.department,
                requester_campus: data.requesterCampus || currentUser!.campus,
                purpose: data.purpose,
                approving_manager_name: data.approvingManagerName,
                approving_manager_email: data.approvingManagerEmail,
                trip_type: data.tripType,
                travel_mode: data.mode,
                from_location: data.from,
                to_location: data.to,
                date_of_travel: data.dateOfTravel || null,
                preferred_departure_window: data.preferredDepartureWindow,
                return_date: data.returnDate || null,
                return_preferred_departure_window: data.returnPreferredDepartureWindow,
                number_of_travelers: data.numberOfTravelers,
                traveller_names: data.travellerNames,
                priority: data.priority || Priority.MEDIUM,
                special_requirements: data.specialRequirements,
                emergency_contact_name: data.emergencyContactName,
                emergency_contact_phone: data.emergencyContactPhone,
                emergency_contact_relation: data.emergencyContactRelation,
                blood_group: data.bloodGroup,
                medical_conditions: data.medicalConditions,
                approval_status: ApprovalStatus.PENDING,
                pnc_status: PNCStatus.NOT_STARTED,
                timeline: [{ id: '1', timestamp: new Date().toISOString(), actor: currentUser!.name, event: 'Request Created' }],
                has_violation: isViolated,
                violation_reason: isViolated ? (data.violationReason || 'Advance booking policy violation') : null,
                booked_by: 'PNC' // Standard requests are processed by PNC
              };

              const { data: inserted, error } = await supabase
                .from('travel_requests')
                .insert(newRequest)
                .select()
                .single();

              if (error) throw error;

              // Re-fetch or add to state
              setRequests(prev => [{
                id: inserted.id,
                submissionId: inserted.submission_id,
                timestamp: inserted.created_at,
                requesterId: inserted.requester_id,
                requesterName: inserted.requester_name,
                requesterEmail: inserted.requester_email,
                requesterPhone: inserted.requester_phone,
                requesterDepartment: inserted.requester_department,
                requesterCampus: inserted.requester_campus,
                purpose: inserted.purpose,
                approvingManagerName: inserted.approving_manager_name,
                approvingManagerEmail: inserted.approving_manager_email,
                tripType: inserted.trip_type,
                mode: inserted.travel_mode,
                from: inserted.from_location,
                to: inserted.to_location,
                dateOfTravel: inserted.date_of_travel,
                preferredDepartureWindow: inserted.preferred_departure_window,
                returnDate: inserted.return_date,
                returnPreferredDepartureWindow: inserted.return_preferred_departure_window,
                numberOfTravelers: inserted.number_of_travelers,
                travellerNames: inserted.traveller_names,
                priority: inserted.priority,
                specialRequirements: inserted.special_requirements,
                approvalStatus: inserted.approval_status,
                pncStatus: inserted.pnc_status,
                timeline: inserted.timeline,
                emergencyContactName: inserted.emergency_contact_name,
                emergencyContactPhone: inserted.emergency_contact_phone,
                emergencyContactRelation: inserted.emergency_contact_relation,
                bloodGroup: inserted.blood_group,
                medicalConditions: inserted.medical_conditions,
                hasViolation: inserted.has_violation,
                violationDetails: inserted.violation_reason,
                bookedBy: inserted.booked_by,
              }, ...prev]);

              setIsNewRequestModalOpen(false);
              toast.success("Travel request saved to Supabase");
            } catch (err: any) {
              toast.error("Submission failed: " + err.message);
            }
          }}
        />
      )}

      {selectedRequest && (
        <RequestDetailOverlay
          request={selectedRequest}
          role={currentUser.role}
          policies={travelModePolicies}
          onClose={() => setSelectedRequest(null)}
          onUpdate={async (updated: any) => {
            try {
              // Check if status actually changed
              const statusChanged = updated.pncStatus !== selectedRequest.pncStatus;

              // Create new timeline entry if status changed
              const newTimeline = statusChanged
                ? [
                  ...updated.timeline,
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    actor: currentUser.name,
                    event: `Status changed to: ${updated.pncStatus}`,
                    details: updated.statusChangeReason || undefined
                  }
                ]
                : updated.timeline;

              // Update in database
              const { error } = await supabase
                .from('travel_requests')
                .update({
                  pnc_status: updated.pncStatus,
                  timeline: newTimeline,
                  ticket_cost: updated.ticketCost,
                  vendor_name: updated.vendorName,
                  invoice_url: updated.invoiceUrl
                })
                .eq('id', updated.id);

              if (error) throw error;

              // Update local state
              const updatedRequest = { ...updated, timeline: newTimeline };
              setRequests(prev => prev.map(r => r.id === updated.id ? updatedRequest : r));
              setSelectedRequest(updatedRequest);

              toast.success(statusChanged ? "Status updated and logged to timeline" : "Request updated");
            } catch (error: any) {
              console.error('Error updating request:', error);
              toast.error("Failed to update request: " + error.message);
            }
          }}
        />
      )}

      {isPNCBookingModalOpen && (
        <PNCBookingModal
          onClose={() => setIsPNCBookingModalOpen(false)}
          currentUser={currentUser!}
          employees={users} // Pass all users for selection
          policies={travelModePolicies}
          onSubmit={async (data: any) => {
            try {
              let invoiceUrl = null;

              // Upload Ticket First
              if (data.invoiceFile) {
                const fileExt = data.invoiceFile.name.split('.').pop();
                const fileName = `pnc_self_booking_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                  .from('invoices')
                  .upload(fileName, data.invoiceFile);

                if (uploadError) throw uploadError;
                const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
                invoiceUrl = urlData.publicUrl;
              }

              const newRequest = {
                requester_id: data.requesterId,
                requester_name: data.requesterName,
                requester_email: data.requesterEmail,
                requester_phone: data.requesterPhone,
                requester_department: data.requesterDepartment,
                requester_campus: data.requesterCampus,

                purpose: data.purpose,
                approving_manager_name: data.approvingManagerName,
                approving_manager_email: data.approvingManagerEmail,

                trip_type: data.tripType,
                travel_mode: data.mode,
                from_location: data.from,
                to_location: data.to,
                date_of_travel: data.dateOfTravel,
                // preferred_departure_window is removed in this flow

                return_date: data.returnDate || null,

                number_of_travelers: 1,
                traveller_names: data.travellerNames,
                priority: Priority.MEDIUM, // Default

                approval_status: ApprovalStatus.APPROVED, // Auto-approved since PNC is booking
                pnc_status: PNCStatus.CLOSED, // Closed immediately as details are entered

                ticket_cost: parseFloat(data.ticketCost),
                vendor_name: data.vendorName,
                invoice_url: invoiceUrl,
                booked_by: 'SELF', // Booking handled by employee directly

                timeline: [
                  { id: '1', timestamp: new Date().toISOString(), actor: currentUser!.name, event: 'Travel Recorded (Self Booking)' },
                  { id: '2', timestamp: new Date().toISOString(), actor: currentUser!.name, event: 'Booking Details Uploaded' }
                ]
              };

              const { data: inserted, error } = await supabase
                .from('travel_requests')
                .insert(newRequest)
                .select()
                .single();

              if (error) throw error;

              toast.success("Past booking recorded successfully!");
              setIsPNCBookingModalOpen(false);

              // Refresh requests
              setRequests(prev => [
                // Map inserted record to local format (simplified mapping for immediate UI update)
                {
                  ...newRequest,
                  id: inserted.id,
                  submissionId: inserted.submission_id,
                  timestamp: inserted.created_at,
                  requesterId: newRequest.requester_id,
                  requesterName: newRequest.requester_name,
                  requesterEmail: newRequest.requester_email,
                  tripType: newRequest.trip_type,
                  mode: newRequest.travel_mode,
                  from: newRequest.from_location,
                  to: newRequest.to_location,
                  dateOfTravel: newRequest.date_of_travel,
                  pncStatus: PNCStatus.CLOSED,
                  ticketCost: newRequest.ticket_cost,
                  vendorName: newRequest.vendor_name,
                  invoiceUrl: newRequest.invoice_url
                } as any,
                ...prev
              ]);

            } catch (err: any) {
              console.error(err);
              toast.error("Failed to record booking: " + err.message);
            }
          }}
        />
      )}
    </div>
  );
};

// --- Shared Display Sub-components ---

const EmployeeDashboard = ({ requests, onNewRequest, onView, isWarningVisible, completeness, onViewProfile, user, meetupRequests = [], onNavigateToMeetup }: { requests: TravelRequest[], onNewRequest: (context?: any) => void, onView: (r: TravelRequest) => void, isWarningVisible: boolean, completeness: number, onViewProfile: () => void, user: User, meetupRequests: MeetupAvailabilityRequest[], onNavigateToMeetup: () => void }) => {
  const welcomeNote = useMemo(() => WELCOME_NOTES[Math.floor(Math.random() * WELCOME_NOTES.length)], []);
  const activeRequests = requests.filter((r: TravelRequest) =>
    r.pncStatus !== PNCStatus.BOOKED &&
    r.pncStatus !== PNCStatus.REJECTED_BY_PNC &&
    r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER &&
    r.pncStatus !== PNCStatus.CLOSED
  );
  const closedRequests = requests.filter((r: TravelRequest) =>
    r.pncStatus === PNCStatus.BOOKED ||
    r.pncStatus === PNCStatus.REJECTED_BY_PNC ||
    r.pncStatus === PNCStatus.REJECTED_BY_MANAGER ||
    r.pncStatus === PNCStatus.CLOSED
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-700 transition-all">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-4xl">👋</span>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Hey, {user?.name?.split(' ')[0] || 'there'}!
            </h2>
          </div>
          <p className="text-slate-500 font-medium text-lg italic ml-1.5 opacity-80 decoration-indigo-500/30">
            "{welcomeNote}"
          </p>
        </div>
        <button onClick={() => onNewRequest()} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3">
          <i className="fa-solid fa-plus-circle"></i>
          <span>New Booking</span>
        </button>
      </header>

      {completeness < 100 && (
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 rounded-2xl shadow-2xl shadow-indigo-200 dark:shadow-none relative overflow-hidden group border border-white/10">
          <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
            <i className="fa-solid fa-user-astronaut text-9xl"></i>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white">Action Required</span>
              <div className="h-1.5 w-32 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all duration-1000" style={{ width: `${completeness}%` }}></div>
              </div>
              <span className="text-white/80 text-xs font-bold">{completeness}% Complete</span>
            </div>
            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Profile Incomplete</h3>
            <p className="text-indigo-100/80 text-base mb-8 max-w-lg leading-relaxed font-medium">Your identity verification and background details are pending. Complete these now to avoid any delays in your upcoming travel approvals.</p>
            <button
              onClick={onViewProfile}
              className="bg-white text-indigo-700 px-8 py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-xl active:scale-95"
            >
              Finish Setup
            </button>
          </div>
        </div>
      )}

      {/* Meetup Notification Card */}
      {meetupRequests.filter((mr: MeetupAvailabilityRequest) =>
        mr.isFinalized &&
        mr.attendeeEmails?.some(email => email.toLowerCase() === user?.email?.toLowerCase()) &&
        !requests.some(r => r.purpose === 'Igatpuri Meetup' && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER)
      ).map((mr: MeetupAvailabilityRequest) => (
        <div key={mr.id} className="bg-gradient-to-r from-emerald-500 to-teal-600 p-1 rounded-3xl shadow-xl shadow-emerald-500/20 animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white dark:bg-slate-900 rounded-[1.4rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                <i className="fa-solid fa-map-location-dot"></i>
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Igatpuri Meetup Visit</h4>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  You have been added to a meetup request from <span className="text-emerald-600 underline">{mr.fullName}</span>
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    <i className="fa-solid fa-calendar-day text-[10px] text-emerald-500"></i>
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase">{new Date(mr.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(mr.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full mb-1">Fill in your details for your Igatpuri visit</p>
              <button
                onClick={() => onNewRequest({ startDate: mr.startDate, endDate: mr.endDate })}
                className="bg-emerald-600 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition-all w-full md:w-auto"
              >
                Book Now! <i className="fa-solid fa-plane-departure ml-2"></i>
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="space-y-6">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center"><i className="fa-solid fa-calendar-check"></i></div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Active Bookings</h3>
        </div>

        {activeRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 transition-all">
            {activeRequests.map((r: TravelRequest) => {
              const isMeetup = r.purpose === 'Igatpuri Meetup';
              return (
                <div key={r.id} onClick={() => onView(r)} className={`bg-white dark:bg-slate-900 border ${isMeetup ? 'border-emerald-200 dark:border-emerald-800 shadow-sm' : 'border-slate-200 dark:border-slate-800'} p-4 rounded-2xl hover:shadow-lg ${isMeetup ? 'hover:border-emerald-500/50' : 'hover:border-indigo-500/50'} hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden`}>
                  <div className={`absolute top-0 right-0 w-20 h-20 ${isMeetup ? 'bg-emerald-500/5' : 'bg-indigo-500/5'} -mr-6 -mt-6 rounded-full group-hover:scale-150 transition-transform duration-700`}></div>
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <span className={`text-[10px] font-black ${isMeetup ? 'text-emerald-500/60' : 'text-indigo-500/60'} font-mono tracking-tighter uppercase`}>{r.submissionId || r.id}</span>
                    <div className="scale-90 origin-right">
                      <StatusBadge type="pnc" value={r.pncStatus} />
                    </div>
                  </div>
                  <h4 className={`font-black text-lg mb-0.5 text-slate-900 dark:text-white ${isMeetup ? 'group-hover:text-emerald-600' : 'group-hover:text-indigo-600'} transition-colors uppercase tracking-tight leading-tight`}>{r.from} → {r.to}</h4>
                  <p className="text-xs text-slate-500 mb-3 font-bold flex items-center gap-1.5">
                    <i className="fa-solid fa-calendar-day text-[10px] text-slate-300"></i>
                    {new Date(r.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center relative z-10">
                    <div className={`flex items-center gap-1.5 text-slate-400 ${isMeetup ? 'group-hover:text-emerald-500' : 'group-hover:text-indigo-500'} transition-colors`}>
                      <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane-departure' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-xs`}></i>
                      <span className="text-[10px] font-bold uppercase tracking-wider">{r.mode}</span>
                    </div>
                    <div className={`w-6 h-6 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 ${isMeetup ? 'group-hover:bg-emerald-600' : 'group-hover:bg-indigo-600'} group-hover:text-white transition-all`}><i className="fa-solid fa-arrow-right text-[10px]"></i></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center space-y-5 bg-white/50 dark:bg-slate-900/30 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl transition-colors">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto text-slate-300 text-3xl shadow-inner"><i className="fa-solid fa-passport"></i></div>
            <div>
              <h3 className="font-black text-slate-500 dark:text-slate-400 text-lg">No active travel requests</h3>
              <p className="text-slate-400 text-sm mt-1">When you book travel, it will appear here.</p>
            </div>
            <button onClick={() => onNewRequest()} className="text-indigo-600 font-black text-xs uppercase tracking-widest hover:text-indigo-700 transition-colors">Begin New Booking Request</button>
          </div>
        )}
      </div>

      <div className="space-y-6 pt-6">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg flex items-center justify-center"><i className="fa-solid fa-history"></i></div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Past Requests</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b dark:border-slate-800">
                  <th className="px-8 py-6">Request ID</th>
                  <th className="px-8 py-6">Destination</th>
                  <th className="px-8 py-6">Travel Date</th>
                  <th className="px-8 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {closedRequests.map((r: any) => {
                  const isMeetup = r.purpose === 'Igatpuri Meetup';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className={`px-8 py-5 font-mono text-xs font-black ${isMeetup ? 'text-emerald-500' : 'text-indigo-500'} group-hover:scale-105 transition-transform origin-left flex items-center gap-2`}>
                        {isMeetup && <i className="fa-solid fa-star text-[8px] animate-pulse"></i>}
                        {r.submissionId || r.id}
                      </td>
                      <td className="px-8 py-5">
                        <p className={`font-bold ${isMeetup ? 'text-emerald-600' : 'text-slate-800 dark:text-white'}`}>{r.to}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{r.mode}</p>
                      </td>
                      <td className="px-8 py-5 text-sm font-bold text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString()}</td>
                      <td className="px-8 py-5"><StatusBadge type="pnc" value={r.pncStatus} /></td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => onView(r)} className={`w-10 h-10 ${isMeetup ? 'hover:bg-emerald-50 text-emerald-300 hover:text-emerald-600' : 'hover:bg-white dark:hover:bg-slate-700 text-slate-300 hover:text-indigo-600'} rounded-full transition-all shadow-sm hover:shadow active:scale-95 border border-transparent hover:border-slate-100 dark:hover:border-slate-600`}>
                          <i className="fa-solid fa-arrow-right-long text-sm"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {closedRequests.length === 0 && (
            <div className="py-16 text-center text-slate-400 font-bold italic opacity-60">No past travel requests found in your history.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const VerificationQueue = ({ users, onUpdateUser }: { users: User[], onUpdateUser: (u: User) => void }) => {
  const pending = users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Track individual statuses and reasons in local state for the modal
  const [reviewState, setReviewState] = useState({
    passportStatus: VerificationStatus.PENDING,
    passportReason: '',
    idStatus: VerificationStatus.PENDING,
    idReason: ''
  });

  useEffect(() => {
    if (selectedUser) {
      setReviewState({
        passportStatus: selectedUser.passportPhoto?.status || VerificationStatus.PENDING,
        passportReason: selectedUser.passportPhoto?.rejectionReason || '',
        idStatus: selectedUser.idProof?.status || VerificationStatus.PENDING,
        idReason: selectedUser.idProof?.rejectionReason || ''
      });
    }
  }, [selectedUser]);

  const handleSaveAll = () => {
    if (!selectedUser) return;
    const updated = { ...selectedUser };

    if (updated.passportPhoto) {
      updated.passportPhoto = {
        ...updated.passportPhoto,
        status: reviewState.passportStatus,
        rejectionReason: reviewState.passportStatus === VerificationStatus.REJECTED ? reviewState.passportReason : ''
      };
    }

    if (updated.idProof) {
      updated.idProof = {
        ...updated.idProof,
        status: reviewState.idStatus,
        rejectionReason: reviewState.idStatus === VerificationStatus.REJECTED ? reviewState.idReason : ''
      };
    }

    onUpdateUser(updated);
    setSelectedUser(null);
    toast.success("Verification updates saved for " + selectedUser.name);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Verification Queue</h2>
      {pending.length === 0 ? (
        <div className="py-24 text-center text-slate-400 font-medium bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-sm transition-colors duration-300 italic">All caught up! No pending verifications.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all duration-300">
          {pending.map(u => (
            <div key={u.id} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl flex items-center gap-4 hover:shadow-lg hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all duration-300 cursor-pointer group">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-indigo-600 text-xl shadow-inner transition-colors duration-300 overflow-hidden">
                {u.avatar ? (
                  <img src={u.avatar} className="w-full h-full object-cover rounded-2xl transition-all duration-300" />
                ) : u.passportPhoto?.fileUrl ? (
                  <img src={u.passportPhoto.fileUrl} className="w-full h-full object-cover rounded-2xl transition-all duration-300" />
                ) : (
                  u.name.charAt(0)
                )}
              </div>
              <div className="flex-1 transition-colors duration-300">
                <h4 className="font-bold text-slate-800 dark:text-white transition-colors duration-300">{u.name}</h4>
                <p className="text-xs text-slate-500 font-medium transition-colors duration-300">Pending Docs: {[u.passportPhoto?.status === VerificationStatus.PENDING && 'Passport', u.idProof?.status === VerificationStatus.PENDING && 'ID Proof'].filter(Boolean).join(', ')}</p>
              </div>
              <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all duration-300 shadow-lg shadow-indigo-600/10">Review Submission</button>
            </div>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedUser(null)}></div>
          <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <header className="px-10 py-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Review Submissions</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{selectedUser.name}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="text-xs font-medium text-slate-500">{selectedUser.email}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-3 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 border border-transparent hover:border-slate-100 dark:hover:border-slate-700"><i className="fa-solid fa-xmark text-xl"></i></button>
            </header>

            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Passport Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Passport Photo</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.passportPhoto?.fileUrl ? (
                    <>
                      <img src={selectedUser.passportPhoto.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.passportPhoto.fileUrl} target="_blank" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-indigo-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-camera text-4xl"></i><span className="text-2xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.passportPhoto?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.passportStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                        placeholder="Rejection reason (visible to user)..."
                        rows={3}
                        value={reviewState.passportReason}
                        onChange={(e) => setReviewState({ ...reviewState, passportReason: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ID Proof Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">2. Government ID ({selectedUser.idProof?.type || 'Not Set'})</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.idProof?.fileUrl ? (
                    <>
                      <img src={selectedUser.idProof.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.idProof.fileUrl} target="_blank" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-violet-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-id-card text-4xl"></i><span className="text-2xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.idProof?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-xl font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.idStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                        placeholder="Rejection reason (visible to user)..."
                        rows={3}
                        value={reviewState.idReason}
                        onChange={(e) => setReviewState({ ...reviewState, idReason: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-10 border-t dark:border-slate-800 flex gap-4 bg-slate-50/30 dark:bg-slate-800/20">
              <button onClick={() => setSelectedUser(null)} className="flex-1 py-4 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-sm">Cancel Review</button>
              <button
                onClick={handleSaveAll}
                className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all text-sm uppercase tracking-widest"
              >
                Save Decisions & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsView = ({ isDarkMode, onToggleTheme }: any) => (
  <div className="max-w-xl space-y-8 animate-in fade-in duration-500 transition-all duration-300">
    <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Settings</h2>
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl space-y-8 shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between transition-colors duration-300">
        <div><h4 className="text-lg font-bold text-slate-800 dark:text-white transition-colors duration-300">Dark Mode</h4><p className="text-sm text-slate-500 font-medium transition-colors duration-300">Toggle application appearance for better viewing.</p></div>
        <Toggle active={isDarkMode} onChange={onToggleTheme} />
      </div>
      <div className="pt-8 border-t dark:border-slate-800 text-center text-2xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">v2.5.0 Stable Build</div>
    </div>
  </div>
);

// --- Simplified Skeletons/Wizards ---

const LoadingView = () => {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % 5);
    }, 750);
    return () => clearInterval(timer);
  }, []);

  const renderContent = () => {
    switch (slideIndex) {
      case 0:
        return (
          <div className="w-full h-full flex items-center justify-center bg-rose-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-heart text-2xl"></i>
          </div>
        );
      case 1:
        return (
          <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-white animate-in slide-in-from-right duration-500">
            <span className="font-black text-2xl">N</span>
          </div>
        );
      case 2:
        return (
          <div className="w-full h-full flex items-center justify-center bg-sky-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-plane text-2xl"></i>
          </div>
        );
      case 3:
        return (
          <div className="w-full h-full flex items-center justify-center bg-emerald-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-train text-2xl"></i>
          </div>
        );
      case 4:
        return (
          <div className="w-full h-full flex items-center justify-center bg-amber-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-bus text-2xl"></i>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 animate-in fade-in duration-500">
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          {/* Spinning Rings */}
          <div className="absolute -inset-4 rounded-full border-4 border-slate-200 dark:border-slate-800"></div>
          <div className={`absolute -inset-4 rounded-full border-4 border-t-transparent animate-spin transition-colors duration-500 ${slideIndex === 0 ? 'border-rose-500' :
            slideIndex === 1 ? 'border-indigo-600' :
              slideIndex === 2 ? 'border-sky-500' :
                slideIndex === 3 ? 'border-emerald-500' :
                  'border-amber-500'
            }`}></div>

          {/* Icon Slider Window */}
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-2xl shadow-indigo-600/30 relative z-10 bg-white dark:bg-slate-900">
            {renderContent()}
          </div>
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Navgurukul Travel Desk</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading...</p>
        </div>
      </div>
    </div>
  );
};

const AdminQueueView = ({ requests, onView, showAll = false, policies = [] }: any) => {
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
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
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
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${sortOrder === 'newest'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                }`}
            >
              <i className="fa-solid fa-arrow-down-short-wide mr-1.5"></i>
              Newest
            </button>
            <button
              onClick={() => setSortOrder('oldest')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${sortOrder === 'oldest'
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

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">Request ID</th><th className="px-6 py-5">Traveler</th><th className="px-6 py-5">Route</th><th className="px-6 py-5">Status</th></tr></thead>
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
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/violation:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
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

const PastRequestsView = ({ requests, onView }: any) => {
  const closedRequests = requests.filter((r: any) =>
    r.pncStatus === PNCStatus.BOOKED ||
    r.pncStatus === PNCStatus.REJECTED_BY_PNC ||
    r.pncStatus === PNCStatus.REJECTED_BY_MANAGER ||
    r.pncStatus === PNCStatus.CLOSED
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Past Requests</h2>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-2xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">Request ID</th><th className="px-6 py-5">Destination</th><th className="px-6 py-5 text-right">Action</th></tr></thead>
          <tbody className="divide-y dark:divide-slate-800 transition-colors duration-300">
            {closedRequests.map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-300">
                <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 transition-colors duration-300">{r.submissionId || r.id}</td>
                <td className="px-6 py-4 font-bold text-slate-800 dark:text-white transition-colors duration-300">{r.to}</td>
                <td className="px-6 py-4 text-right pr-6 transition-colors duration-300"><button onClick={() => onView(r)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors duration-300 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-circle-info text-lg"></i></button></td>
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



const RequestDetailOverlay = ({ request, role, onClose, onUpdate, policies = [] }: any) => {
  const isPolicyViolated = request.hasViolation || (policies.length > 0 ? checkPolicyViolation(request, policies) : false);
  const [status, setStatus] = useState(request.pncStatus);
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  // Booking Details State
  const [ticketCost, setTicketCost] = useState(request.ticketCost || '');
  const [vendorName, setVendorName] = useState(request.vendorName || '');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Helper for file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const handleUpdate = async () => {
    try {
      let finalStatus = status;



      setIsUploading(true);
      let invoiceUrl = request.invoiceUrl;

      if (invoiceFile && status === PNCStatus.BOOKED) {
        const fileExt = invoiceFile.name.split('.').pop();
        const fileName = `${request.id}_invoice_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, invoiceFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('invoices').getPublicUrl(fileName);
        invoiceUrl = data.publicUrl;
      }

      // Auto-close if all details are present
      if (status === PNCStatus.BOOKED && ticketCost && vendorName && invoiceUrl) {
        finalStatus = PNCStatus.CLOSED;
        toast.success("All booking details verified. Request automatically closed!");
      }

      await onUpdate({
        ...request,
        pncStatus: finalStatus,
        statusChangeReason: finalStatus === PNCStatus.CLOSED ? (statusChangeReason || 'Auto-closed after booking details completed') : statusChangeReason,
        ticketCost: status === PNCStatus.BOOKED ? parseFloat(ticketCost) : request.ticketCost,
        vendorName: status === PNCStatus.BOOKED ? vendorName : request.vendorName,
        invoiceUrl: status === PNCStatus.BOOKED ? invoiceUrl : request.invoiceUrl
      });

      setIsUploading(false);
    } catch (error: any) {
      setIsUploading(false);
      console.error("Update failed:", error);
      toast.error("Failed to update request: " + error.message);
    }
  };

  const InfoRow = ({ label, value, icon, fullWidth = false }: any) => (
    <div className={`${fullWidth ? 'col-span-2' : ''} space-y-1`}>
      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
        {icon && <span className="opacity-50">{icon}</span>}
        {label}
      </p>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate-none h-auto min-h-[1.25rem]">
        {value || '—'}
      </p>
    </div>
  );

  const SectionHeader = ({ title, icon }: any) => (
    <div className="flex items-center gap-2 pb-2 border-b dark:border-slate-800 mb-4 mt-6 first:mt-0">
      <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
      <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">{title}</h4>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end transition-all duration-300">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-all duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 h-full flex flex-col animate-in slide-in-from-right transition-all duration-300 shadow-2xl border-l border-white/10">

        {/* Header */}
        <header className="px-6 py-4 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
            <h3 className="text-lg font-black font-mono text-indigo-600 tracking-tight">{request.submissionId || request.id}</h3>
            <StatusBadge type="pnc" value={request.pncStatus} />
            <StatusBadge type="priority" value={request.priority} />
            {isPolicyViolated && (
              <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-3 py-1 rounded-full text-xs font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 animate-pulse">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Policy Violation
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-9 h-9 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 flex items-center justify-center">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar space-y-10">

          {/* Main Stats Header */}
          <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-600/20 relative overflow-hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-wide mb-1 opacity-75">{request.mode}</p>
                <h4 className="text-xl font-black tracking-tight">{request.from} → {request.to}</h4>
              </div>
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10">
                <p className="text-indigo-100 text-[9px] font-bold uppercase tracking-wider mb-0.5">Departure</p>
                <p className="text-sm font-black">{new Date(request.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-8">
            {/* Traveler & Org Details */}
            <div className="col-span-2">
              <SectionHeader title="Traveler Details" icon={<i className="fa-solid fa-user-circle"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Full Name" value={request.requesterName} icon={<i className="fa-solid fa-signature"></i>} />
                <InfoRow label="Email Address" value={request.requesterEmail} icon={<i className="fa-solid fa-envelope"></i>} />
                <InfoRow label="Phone Number" value={request.requesterPhone} icon={<i className="fa-solid fa-phone"></i>} />
                <InfoRow label="Dept / Campus" value={`${request.requesterDepartment || '—'} / ${request.requesterCampus || '—'}`} icon={<i className="fa-solid fa-building"></i>} />
              </div>
            </div>

            {/* Trip Specifics */}
            <div className="col-span-2">
              <SectionHeader title="Logistics & Preferences" icon={<i className="fa-solid fa-route"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Trip Type" value={request.tripType} icon={<i className="fa-solid fa-arrows-left-right"></i>} />
                <InfoRow label="Travel Mode" value={request.mode} icon={<i className="fa-solid fa-train"></i>} />
                <InfoRow label="Preferred Window" value={request.preferredDepartureWindow} icon={<i className="fa-solid fa-clock"></i>} />
                <InfoRow label="Traveling Staff" value={request.travellerNames} icon={<i className="fa-solid fa-users"></i>} />

                {request.tripType === TripType.ROUND_TRIP && (
                  <>
                    <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
                    <InfoRow label="Return Date" value={request.returnDate ? new Date(request.returnDate).toLocaleDateString() : '—'} icon={<i className="fa-solid fa-calendar"></i>} />
                    <InfoRow label="Return Window" value={request.returnPreferredDepartureWindow} icon={<i className="fa-solid fa-clock"></i>} />
                  </>
                )}

                <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
                <InfoRow label="Travel Purpose" value={request.purpose} fullWidth icon={<i className="fa-solid fa-bullseye"></i>} />
                <InfoRow label="Special Requirements" value={request.specialRequirements} fullWidth icon={<i className="fa-solid fa-hand-holding-heart"></i>} />

                <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
                <div className="col-span-2 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <i className={`fa-solid ${isPolicyViolated ? 'fa-triangle-exclamation text-rose-500' : 'fa-check-circle text-emerald-500'} opacity-70`}></i>
                    Policy Compliance
                  </p>
                  <p className={`text-sm font-bold ${isPolicyViolated ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {isPolicyViolated ? (request.violationDetails || 'Advance booking policy violation') : 'No Violation'}
                  </p>
                </div>
              </div>
            </div>

            {/* Booking Details (If Booked) */}
            {(request.pncStatus === PNCStatus.BOOKED || request.pncStatus === PNCStatus.CLOSED) && (
              <div className="col-span-2">
                <SectionHeader title="Booking Confirmation" icon={<i className="fa-solid fa-check-circle"></i>} />
                <div className="grid grid-cols-2 gap-y-6 bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/20">
                  <InfoRow label="Ticket Cost" value={`₹ ${request.ticketCost}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} />
                  <InfoRow label="Vendor" value={request.vendorName} icon={<i className="fa-solid fa-shop"></i>} />
                  {request.invoiceUrl ? (
                    <div className="col-span-2">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                        <i className="fa-solid fa-file-invoice opacity-50"></i> Ticket
                      </p>
                      <a href={request.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                        View Ticket <i className="fa-solid fa-external-link-alt text-[10px]"></i>
                      </a>
                    </div>
                  ) : (
                    <InfoRow label="Ticket" value="Not Uploaded" icon={<i className="fa-solid fa-file-invoice"></i>} />
                  )}
                </div>
              </div>
            )}


            {/* Manager Details */}
            <div className="col-span-2">
              <SectionHeader title="Professional Oversight" icon={<i className="fa-solid fa-user-tie"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Approving Manager" value={request.approvingManagerName} icon={<i className="fa-solid fa-id-badge"></i>} />
                <InfoRow label="Manager Email" value={request.approvingManagerEmail} icon={<i className="fa-solid fa-at"></i>} />
              </div>
            </div>

            {/* Emergency & Medical */}
            <div className="col-span-2">
              <SectionHeader title="Emergency & Health" icon={<i className="fa-solid fa-heart-pulse"></i>} />
              <div className="grid grid-cols-2 gap-y-6">
                <InfoRow label="Emergency Contact" value={`${request.emergencyContactName || '—'} (${request.emergencyContactRelation || '—'})`} icon={<i className="fa-solid fa-contact-book"></i>} />
                <InfoRow label="Contact Phone" value={request.emergencyContactPhone} icon={<i className="fa-solid fa-mobile-screen"></i>} />
                <InfoRow label="Blood Group" value={request.bloodGroup} icon={<i className="fa-solid fa-droplet"></i>} />
                <InfoRow label="Medical Conditions" value={request.medicalConditions} icon={<i className="fa-solid fa-notes-medical"></i>} />
              </div>
            </div>

            {/* Timeline / History */}
            <div className="col-span-2 pt-6">
              <SectionHeader title="Process Timeline" icon={<i className="fa-solid fa-clock-rotate-left"></i>} />
              <div className="space-y-6 ml-1 flex flex-col">
                {request.timeline?.map((event: any, idx: number) => (
                  <div key={idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-500/10 z-10"></div>
                      {idx !== request.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-100 dark:bg-slate-800"></div>}
                    </div>
                    <div className="pb-6">
                      <p className="text-xs font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">{event.event}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-indigo-500/60 font-mono tracking-tighter">{new Date(event.timestamp).toLocaleString()}</span>
                        <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">by {event.actor}</span>
                      </div>
                      {event.details && <p className="text-xs text-slate-500 mt-2 font-medium">{event.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20">
          {role === UserRole.PNC ? (
            <div className="space-y-3">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Update Status</label>

              <div className="relative">
                <select
                  className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all appearance-none cursor-pointer shadow-sm"
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                >
                  {Object.values(PNCStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <i className="fa-solid fa-chevron-down text-xs"></i>
                </div>
              </div>

              {/* Conditional Inputs for Booked Status */}
              {status === PNCStatus.BOOKED && (
                <div className="space-y-3 animate-in slide-in-from-top-2 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Ticket Cost (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-medium text-sm focus:border-indigo-600 outline-none"
                        value={ticketCost}
                        onChange={e => setTicketCost(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Vendor Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Indigo"
                        className="w-full h-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-lg px-3 font-medium text-sm focus:border-indigo-600 outline-none"
                        value={vendorName}
                        onChange={e => setVendorName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Upload Ticket</label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.png,.jpeg"
                      onChange={handleFileChange}
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowNotes(!showNotes)}
                className="w-full text-left px-4 py-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-2"
              >
                <i className={`fa-solid fa-chevron-${showNotes ? 'up' : 'down'} text-[10px]`}></i>
                {showNotes ? 'Hide' : 'Add'} Notes / Reason (Optional)
              </button>

              {showNotes && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <textarea
                    className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 font-medium text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all shadow-sm resize-none"
                    rows={3}
                    placeholder="Add context for this status change (e.g., reason for rejection, booking details, etc.)"
                    value={statusChangeReason}
                    onChange={e => setStatusChangeReason(e.target.value)}
                  />
                </div>
              )}

              <button
                onClick={handleUpdate}
                disabled={isUploading}
                className="w-full bg-indigo-600 text-white h-11 rounded-xl font-bold uppercase tracking-wide text-[11px] shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Processing...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check mr-2"></i> Update & Log
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="text-xs font-bold text-slate-400 italic">This request is currently in the </span>
              <StatusBadge type="pnc" value={request.pncStatus} />
              <span className="text-xs font-bold text-slate-400 italic"> stage.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
