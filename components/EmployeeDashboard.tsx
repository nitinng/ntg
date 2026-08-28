import React, { useState, useEffect, useMemo } from 'react';
import { TravelRequest, User, MeetupAvailabilityRequest, PNCStatus, TripType } from '../types';
import StatusBadge from './StatusBadge';
import { supabase } from '../supabaseClient';

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

interface EmployeeDashboardProps {
  requests: TravelRequest[];
  onNewRequest: (context?: any) => void;
  onView: (r: TravelRequest) => void;
  isWarningVisible: boolean;
  completeness: number;
  onViewProfile: () => void;
  user: User;
  meetupRequests?: MeetupAvailabilityRequest[];
  onNavigateToMeetup: () => void;
  isIgatpuriEnabled?: boolean;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  requests,
  onNewRequest,
  onView,
  isWarningVisible: _isWarningVisible,
  completeness,
  onViewProfile,
  user,
  meetupRequests = [],
  onNavigateToMeetup: _onNavigateToMeetup,
  isIgatpuriEnabled = false
}) => {
  const [_cancellationOwed, setCancellationOwed] = useState(0);

  useEffect(() => {
    const fetchOwed = async () => {
      const { data } = await supabase
        .from('cancellation_records')
        .select('employee_owed_amount')
        .eq('status', 'Pending Refund');

      if (data) {
        const total = data.reduce((sum, r) => sum + (Number(r.employee_owed_amount) || 0), 0);
        setCancellationOwed(total);
      }
    };
    fetchOwed();
  }, []);

  const welcomeNote = useMemo(() => WELCOME_NOTES[Math.floor(Math.random() * WELCOME_NOTES.length)], []);

  const isTravelDatePassed = (r: TravelRequest) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let travelDate = new Date(r.dateOfTravel);
    if (r.tripType === TripType.ROUND_TRIP && r.returnDate) {
      travelDate = new Date(r.returnDate);
    }

    return travelDate < today;
  };

  const activeRequests = requests.filter((r: TravelRequest) => {
    const isCancelledOrRejected =
      r.pncStatus === PNCStatus.REJECTED_BY_PNC ||
      r.pncStatus === PNCStatus.REJECTED_BY_MANAGER ||
      r.pncStatus === PNCStatus.CANCELLED_BY_EMPLOYEE ||
      r.pncStatus === PNCStatus.CANCELLED_BY_PNC;

    if (isCancelledOrRejected) return false;
    if (r.pncStatus === PNCStatus.CLOSED) return false;

    if (r.pncStatus === PNCStatus.BOOKED) {
      return !isTravelDatePassed(r);
    }

    return true;
  });

  const closedRequests = requests.filter((r: TravelRequest) => {
    const isCancelledOrRejected =
      r.pncStatus === PNCStatus.REJECTED_BY_PNC ||
      r.pncStatus === PNCStatus.REJECTED_BY_MANAGER ||
      r.pncStatus === PNCStatus.CANCELLED_BY_EMPLOYEE ||
      r.pncStatus === PNCStatus.CANCELLED_BY_PNC;

    if (isCancelledOrRejected) return true;
    if (r.pncStatus === PNCStatus.CLOSED) return true;

    if (r.pncStatus === PNCStatus.BOOKED) {
      return isTravelDatePassed(r);
    }

    return false;
  });

  const [pastRequestsTab, setPastRequestsTab] = useState<string>('All');

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    closedRequests.forEach(r => {
      if (r.pncStatus) {
        statuses.add(r.pncStatus);
      }
    });
    return Array.from(statuses);
  }, [closedRequests]);

  useEffect(() => {
    if (pastRequestsTab !== 'All' && !availableStatuses.includes(pastRequestsTab)) {
      setPastRequestsTab('All');
    }
  }, [availableStatuses, pastRequestsTab]);

  const displayedClosedRequests = useMemo(() => {
    if (pastRequestsTab === 'All') return closedRequests;
    return closedRequests.filter(r => r.pncStatus === pastRequestsTab);
  }, [closedRequests, pastRequestsTab]);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 transition-all">
      {/* Header with gradient mesh background */}
      <header className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-slate-900 px-2 py-3 md:py-4 md:px-8 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-1000 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-fuchsia-500/5 dark:bg-fuchsia-500/10 rounded-full blur-3xl -ml-10 -mb-10 group-hover:scale-110 transition-transform duration-1000 pointer-events-none"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl md:text-4xl animate-bounce-slow origin-bottom">👋</span>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Hey, <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">{user?.name?.split(' ')[0] || 'there'}!</span>
            </h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm md:text-base italic ml-1.5 border-l-2 border-indigo-200 dark:border-indigo-800 pl-3">
            &quot;{welcomeNote}&quot;
          </p>
        </div>
        <button onClick={() => onNewRequest()} className="relative z-10 w-full md:w-auto bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-2 rounded-lg font-black shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:from-indigo-500 hover:to-violet-500 hover:-translate-y-1 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 group overflow-hidden">
          <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
          <i className="fa-solid fa-plane-departure group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"></i>
          <span>New Booking</span>
        </button>
      </header>

      {/* Chat Beta Banner */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10 border border-indigo-200/50 dark:border-indigo-500/20 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden group">
        <div className="absolute inset-0 w-full h-full bg-white/10 dark:bg-white/5 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-inner">
            <i className="fa-solid fa-flask text-xl group-hover:rotate-12 transition-transform"></i>
          </div>
          <div>
            <h4 className="font-black text-slate-800 dark:text-white text-md tracking-tight flex items-center gap-2">
              Chat Feature is in Beta
              <span className="bg-indigo-600 text-white text-2xs px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider shadow-sm">Beta</span>
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mt-0.5">We are currently testing the new chat functionality. You might experience occasional bugs or delays.</p>
          </div>
        </div>
      </div>

      {/* Quick Insights Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shadow-inner group-hover:rotate-12 transition-transform"><i className="fa-solid fa-clock"></i></div>
            <span className="text-3xl font-black text-slate-800 dark:text-white group-hover:text-amber-600 transition-colors">{activeRequests.length}</span>
          </div>
          <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest text-sm">Active Requests</h4>
          <p className="text-sm text-slate-500 mt-1 font-medium">Currently in progress</p>
        </div>

        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shadow-inner group-hover:-rotate-12 transition-transform"><i className="fa-solid fa-suitcase-rolling"></i></div>
            <span className="text-3xl font-black text-slate-800 dark:text-white group-hover:text-emerald-600 transition-colors">{closedRequests.length}</span>
          </div>
          <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest text-sm">Past Trips</h4>
          <p className="text-sm text-slate-500 mt-1 font-medium">Completed bookings</p>
        </div>

        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform"><i className="fa-solid fa-id-card-clip"></i></div>
            <span className="text-3xl font-black text-slate-800 dark:text-white group-hover:text-sky-600 transition-colors">{completeness}%</span>
          </div>
          <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest text-sm">Profile Status</h4>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full transition-all duration-1000" style={{ width: `${completeness}%` }}></div>
          </div>
        </div>
      </div>

      {completeness < 100 && (
        <div className="bg-gradient-to-br from-rose-500 via-rose-600 to-orange-500 p-8 rounded-lg shadow-2xl shadow-rose-500/20 dark:shadow-none relative overflow-hidden group border border-white/10">
          <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-125 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
            <i className="fa-solid fa-triangle-exclamation text-9xl"></i>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black uppercase tracking-[0.2em] text-white">Action Required</span>
              <div className="h-1.5 w-32 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all duration-1000" style={{ width: `${completeness}%` }}></div>
              </div>
              <span className="text-white/90 text-xs font-bold">{completeness}% Complete</span>
            </div>
            <h3 className="text-xl font-black text-white mb-3 tracking-tight">Profile Setup Pending</h3>
            <p className="text-rose-100 text-base mb-8 max-w-lg leading-relaxed font-medium">Your identity verification and background details are pending. Complete these now to avoid any delays in your upcoming travel approvals.</p>
            <button
              onClick={onViewProfile}
              className="bg-white text-rose-600 px-8 py-3.5 rounded-lg text-sm font-black uppercase tracking-widest hover:bg-rose-50 hover:-translate-y-1 transition-all shadow-xl active:scale-95 flex items-center gap-2 w-fit"
            >
              Finish Setup <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* Meetup Notification Card */}
      {isIgatpuriEnabled && meetupRequests.filter((mr: MeetupAvailabilityRequest) =>
        mr.isFinalized &&
        mr.attendeeEmails?.some(email => email.toLowerCase() === user?.email?.toLowerCase()) &&
        !requests.some(r => r.purpose === 'Igatpuri Meetup' && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER)
      ).map((mr: MeetupAvailabilityRequest) => (
        <div key={mr.id} className="bg-gradient-to-r from-emerald-500 to-teal-600 p-[2px] rounded-lg shadow-xl shadow-emerald-500/20 animate-in slide-in-from-top-4 duration-500 relative overflow-hidden group">
          <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-6 w-full md:w-auto">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center text-3xl shadow-inner border border-emerald-100 dark:border-emerald-800/50 group-hover:scale-110 transition-transform">
                <i className="fa-solid fa-map-location-dot"></i>
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Igatpuri Meetup Visit</h4>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  You have been added to a meetup request from <span className="text-emerald-600 underline cursor-pointer">{mr.fullName}</span>
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    <i className="fa-solid fa-calendar-day text-xs text-emerald-500"></i>
                    <span className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase">{new Date(mr.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(mr.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto">
              <p className="text-xs font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-full border border-emerald-100 dark:border-emerald-800/50 text-center">Action Required</p>
              <button
                onClick={() => onNewRequest({ startDate: mr.startDate, endDate: mr.endDate })}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-4 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:-translate-y-1 active:scale-95 transition-all w-full md:w-auto flex items-center justify-center gap-2"
              >
                Book Travel <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Active Bookings Section */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center shadow-inner border border-indigo-100 dark:border-indigo-800/50"><i className="fa-solid fa-ticket"></i></div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Active Bookings</h3>
          </div>
        </div>

        {activeRequests.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 transition-all">
            {activeRequests.map((r: TravelRequest, idx: number) => {
              const isMeetup = r.purpose === 'Igatpuri Meetup';
              const themes = [
                {
                  name: "Midnight Sapphire",
                  grad: "from-indigo-50/50 to-white dark:from-indigo-900/40 dark:to-slate-900",
                  badge: "text-indigo-600 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-500/10",
                  iconBg: "text-indigo-900 dark:text-white",
                  iconFg: "text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300",
                  review: "text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300",
                  shadow: "hover:shadow-indigo-500/10"
                },
                {
                  name: "Deep Emerald",
                  grad: "from-emerald-50/50 to-white dark:from-emerald-900/40 dark:to-slate-900",
                  badge: "text-emerald-600 dark:text-emerald-400/80 bg-emerald-100 dark:bg-emerald-500/10",
                  iconBg: "text-emerald-900 dark:text-white",
                  iconFg: "text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
                  review: "text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300",
                  shadow: "hover:shadow-emerald-500/10"
                },
                {
                  name: "Amber Sunrise",
                  grad: "from-amber-50/50 to-white dark:from-amber-900/40 dark:to-slate-900",
                  badge: "text-amber-600 dark:text-amber-400/80 bg-amber-100 dark:bg-amber-500/10",
                  iconBg: "text-amber-900 dark:text-white",
                  iconFg: "text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300",
                  review: "text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300",
                  shadow: "hover:shadow-amber-500/10"
                }
              ];
              const theme = themes[idx % 3];

              return (
                <div key={r.id} onClick={() => onView(r)} className={`group relative bg-white dark:bg-slate-900 rounded-md flex flex-col sm:flex-row overflow-hidden border border-slate-200 dark:border-slate-800 cursor-pointer shadow-sm hover:shadow-xl ${theme.shadow} transition-all hover:-translate-y-1 duration-300`}>
                  {/* Main Ticket Area */}
                  <div className={`flex-1 p-5 sm:p-6 relative overflow-hidden bg-gradient-to-br ${theme.grad} border-b sm:border-b-0 sm:border-r border-dashed border-slate-200 dark:border-slate-700`}>
                    <div className={`absolute -right-6 -bottom-6 opacity-[0.03] dark:opacity-[0.03] text-[8rem] pointer-events-none ${theme.iconBg}`}>
                      <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'}`}></i>
                    </div>

                    <div className="flex justify-between items-center mb-5 relative z-10">
                      <div className="flex items-center gap-3">
                        <span className={`text-2xs font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${theme.badge}`}>Boarding Pass</span>
                        {isMeetup && <span className="text-2xs font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"><i className="fa-solid fa-star mr-1"></i> Meetup</span>}
                      </div>
                      <StatusBadge type="pnc" value={r.pncStatus} />
                    </div>

                    <div className="flex items-center justify-between mb-6 relative z-10">
                      <div className="text-left flex-1">
                        <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">{r.from.substring(0, 3)}</p>
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
                        <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tighter uppercase">{r.to.substring(0, 3)}</p>
                        <p className="text-xs sm:text-xs text-slate-500 dark:text-slate-400 font-bold truncate max-w-[80px] sm:max-w-[100px]">{r.to}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-100 dark:border-slate-800/50 relative z-10">
                      <div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider mb-0.5">Date</p>
                        <p className="font-black text-sm text-slate-700 dark:text-slate-200 uppercase truncate">{new Date(r.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider mb-0.5">Req ID</p>
                        <p className="font-black text-sm text-slate-700 dark:text-slate-200 uppercase truncate">{r.submissionId || r.id.substring(0, 8)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tear-off Stub */}
                  <div className="w-full sm:w-28 bg-slate-50 dark:bg-slate-900/50 flex flex-row sm:flex-col justify-between sm:justify-center items-center p-4 sm:p-0 relative overflow-hidden">
                    <div className="hidden sm:block absolute -left-3 top-[-10px] w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                    <div className="hidden sm:block absolute -left-3 bottom-[-10px] w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                    <div className="block sm:hidden absolute left-[-10px] -top-3 w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>
                    <div className="block sm:hidden absolute right-[-10px] -top-3 w-6 h-6 bg-slate-50 dark:bg-slate-950 rounded-full z-20 shadow-inner"></div>

                    <div className="flex flex-row sm:flex-col items-center w-full h-full justify-between sm:py-6 relative z-10">
                      <div className="w-full text-left sm:text-center shrink-0">
                        {r.hasViolation ? (
                          <div className="inline-block bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-2xs font-black px-2 py-1 rounded-md border border-rose-200 dark:border-rose-500/30 animate-pulse">POLICY<br className="hidden sm:block" /> REVIEW</div>
                        ) : (
                          <div className="inline-block bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-2xs font-black px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-500/20">CLEAR</div>
                        )}
                      </div>

                      <div className="hidden sm:flex w-full h-12 items-center justify-center opacity-20 gap-[2px] rotate-90 my-6">
                        {[...Array(14)].map((_, i) => (
                          <div key={i} className={`h-full bg-slate-800 dark:bg-white ${i % 3 === 0 ? 'w-1' : i % 2 === 0 ? 'w-[2px]' : 'w-[1px]'}`}></div>
                        ))}
                      </div>

                      <button className={`sm:mt-0 text-xs font-black uppercase ${theme.review} group-hover:translate-x-1 transition-all flex items-center gap-1.5 shrink-0`}>
                        View <i className="fa-solid fa-arrow-right"></i>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-24 text-center space-y-6 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors">
            <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto text-slate-300 dark:text-slate-600 text-4xl shadow-sm border border-slate-100 dark:border-slate-800"><i className="fa-solid fa-ticket-simple"></i></div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-xl">No active travel requests</h3>
              <p className="text-slate-500 text-sm mt-2 font-medium">When you book travel, your digital tickets will appear here.</p>
            </div>
            <button onClick={() => onNewRequest()} className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-indigo-200 dark:hover:bg-indigo-900/50 hover:-translate-y-0.5 transition-all">Begin New Booking Request</button>
          </div>
        )}
      </div>

      {/* Past Requests Section */}
      <div className="space-y-6 pt-10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg flex items-center justify-center shadow-inner border border-slate-200 dark:border-slate-700"><i className="fa-solid fa-history"></i></div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Past Requests</h3>
        </div>

        {availableStatuses.length > 0 && (
          <div className="flex overflow-x-auto whitespace-nowrap flex-nowrap gap-2 bg-slate-150/40 dark:bg-slate-800/40 p-1.5 rounded-lg max-w-full border border-slate-200/50 dark:border-slate-800/50 custom-scrollbar">
            <button
              onClick={() => setPastRequestsTab('All')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shrink-0 ${pastRequestsTab === 'All'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
            >
              All ({closedRequests.length})
            </button>
            {availableStatuses.map(status => {
              const count = closedRequests.filter(r => r.pncStatus === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setPastRequestsTab(status)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shrink-0 ${pastRequestsTab === status
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm transition-all">
          <div className="overflow-x-hidden md:overflow-x-auto">
            <table className="w-full text-left border-collapse block md:table">
              <thead className="hidden md:table-header-group">
                <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-xs font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <th className="px-6 py-4">Request ID</th>
                  <th className="px-6 py-4">Destination</th>
                  <th className="px-6 py-4">Travel Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800 block md:table-row-group">
                {displayedClosedRequests.map((r: any) => {
                  const isMeetup = r.purpose === 'Igatpuri Meetup';
                  return (
                    <tr key={r.id} className="flex flex-col md:table-row hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group p-4 md:p-0">
                      <td className={`px-4 md:px-6 py-3 md:py-3.5 text-sm font-black uppercase tracking-widest ${isMeetup ? 'text-emerald-500' : 'text-indigo-500'} flex items-center justify-between md:table-cell gap-3`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMeetup ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-indigo-50 dark:bg-indigo-900/30'} group-hover:scale-110 transition-transform`}>
                            <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-sm`}></i>
                          </div>
                          {r.submissionId || r.id.substring(0, 8)}
                        </div>
                        <span className="md:hidden text-xs text-slate-400 font-bold">REQ ID</span>
                      </td>
                      <td className="px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50">
                        <span className="md:hidden text-xs text-slate-400 font-bold uppercase tracking-widest">DESTINATION</span>
                        <div className="text-right md:text-left">
                          <p className={`text-sm font-black uppercase tracking-tight ${isMeetup ? 'text-emerald-600' : 'text-slate-800 dark:text-white'}`}>{r.to}</p>
                          {isMeetup && <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest mt-1"><i className="fa-solid fa-star mr-1"></i> Meetup</p>}
                        </div>
                      </td>
                      <td className="px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50">
                        <span className="md:hidden text-xs text-slate-400 font-bold uppercase tracking-widest">TRAVEL DATE</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </td>
                      <td className="px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50">
                        <span className="md:hidden text-xs text-slate-400 font-bold uppercase tracking-widest">STATUS</span>
                        <StatusBadge type="pnc" value={r.pncStatus} />
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-3.5 block md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50 md:text-right">
                        <button onClick={() => onView(r)} className={`w-full md:w-8 h-8 ${isMeetup ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600'} rounded-lg transition-all shadow-sm hover:shadow active:scale-95 border border-slate-200 dark:border-slate-700 hover:border-transparent flex items-center justify-center md:ml-auto group/btn`}>
                          <span className="md:hidden mr-2 font-black text-xs uppercase tracking-widest">View Details</span>
                          <i className="fa-solid fa-arrow-right text-sm group-hover/btn:translate-x-0.5 transition-transform"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {closedRequests.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
              <i className="fa-solid fa-folder-open text-3xl opacity-50"></i>
              <p className="font-bold italic text-sm">No past travel requests found in your history.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
