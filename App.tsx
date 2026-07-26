
import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import {
  TravelRequest, PNCStatus, Priority, TravelMode, UserRole, User, TripType, ApprovalStatus, PolicyConfig, VerificationStatus, IdProofType, PaymentStatus, UserDocument, TravelModePolicy, MeetupAvailabilityRequest
} from './types';
import { mockUsers, initialRequests } from './mockData';
import { useNavigate, useLocation } from 'react-router-dom';
import StatusBadge from './components/StatusBadge';
import Input from './components/Input';
import NewRequestModal from './components/NewRequestModal';
import AuthView from './components/AuthView';
import Select from './components/Select';
import TextArea from './components/TextArea';

const MailTemplatesView = React.lazy(() => import('./components/MailTemplatesView'));
import PNCBookingModal from './components/PNCBookingModal';
const ChatView = React.lazy(() => import('./components/ChatView'));
import { supabase } from './supabaseClient';
import { Toaster, toast } from 'sonner';

import Card from './components/Card';
import StatCard from './components/StatCard';
import BarChart from './components/BarChart';
import Navbar from './components/Navbar';
import SidebarLink from './components/SidebarLink';
import Toggle from './components/Toggle';

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

const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const PNCDashboard = React.lazy(() => import('./components/PNCDashboard'));
const AdvanceManagement = React.lazy(() => import('./components/AdvanceManagement'));
const CancellationsDashboard = React.lazy(() => import('./components/CancellationsDashboard'));
const CancellationRequestsQueue = React.lazy(() => import('./components/CancellationRequestsQueue').then(module => ({ default: module.CancellationRequestsQueue })));
const FinanceDashboard = React.lazy(() => import('./components/FinanceDashboard'));
const ManagerApprovalsView = React.lazy(() => import('./components/ManagerApprovalsView'));
const PolicyManagement = React.lazy(() => import('./components/PolicyManagement'));
const LocationCalendar = React.lazy(() => import('./components/LocationCalendar'));
const RequestDetailOverlay = React.lazy(() => import('./components/RequestDetailOverlay'));

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
    const totalPax = availabilityRequests.reduce((sum, r) => sum + (r.teamSize || 0), 0);
    const approvalRate = availabilityRequests.length > 0
      ? Math.round((approved.length / availabilityRequests.length) * 100)
      : 0;

    const PncMeetupSubTabs = () => {
      const [activeSubTab, setActiveSubTab] = React.useState<'pending' | 'approved' | 'rejected'>('pending');
      const [selectedRequest, setSelectedRequest] = React.useState<MeetupAvailabilityRequest | null>(null);

      const subTabs = [
        { id: 'pending' as const, label: 'Pending', count: pending.length, icon: 'fa-clock-rotate-left', color: 'amber' },
        { id: 'approved' as const, label: 'Approved', count: approved.length, icon: 'fa-circle-check', color: 'emerald' },
        { id: 'rejected' as const, label: 'Rejected', count: rejected.length, icon: 'fa-circle-xmark', color: 'rose' },
      ];

      const activeData = activeSubTab === 'pending' ? pending : activeSubTab === 'approved' ? approved : rejected;

      const colorMap: Record<string, { tab: string, badge: string, dot: string, empty: string }> = {
        pending: {
          tab: 'border-amber-500 text-amber-600 dark:text-amber-400',
          badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          dot: 'bg-amber-500',
          empty: 'text-amber-400',
        },
        approved: {
          tab: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
          badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
          dot: 'bg-emerald-500',
          empty: 'text-emerald-400',
        },
        rejected: {
          tab: 'border-rose-500 text-rose-600 dark:text-rose-400',
          badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
          dot: 'bg-rose-500',
          empty: 'text-rose-400',
        },
      };

      return (
        <div className="space-y-6">
          {/* Sub-tab bar */}
          <div className="flex items-center gap-1 bg-slate-100/70 dark:bg-slate-800/50 p-1.5 rounded-lg w-fit">
            {subTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-200 ${activeSubTab === tab.id
                  ? 'bg-white dark:bg-slate-900 shadow-md ' + colorMap[tab.id].tab + ' border-b-2'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
              >
                <i className={`fa-solid ${tab.icon}`}></i>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-lg font-black ${activeSubTab === tab.id ? colorMap[tab.id].badge : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="animate-in fade-in duration-300">
            {activeData.length === 0 ? (
              <div className="py-16 text-center bg-white/50 dark:bg-slate-900/30 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800">
                <i className={`fa-solid ${subTabs.find(t => t.id === activeSubTab)?.icon} text-3xl mb-3 ${colorMap[activeSubTab].empty}`}></i>
                <p className="text-slate-400 text-xs font-bold italic tracking-wider">
                  No {activeSubTab} requests
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeData.map((r: MeetupAvailabilityRequest) => (
                  <Card key={r.id} onClick={() => setSelectedRequest(r)} className="p-5 hover:border-indigo-500/30 transition-all group cursor-pointer hover:shadow-lg hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">{r.fullName}</h4>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{r.department}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${colorMap[activeSubTab].dot}`}></div>
                        <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-black text-slate-500">
                          {r.teamSize} PAX
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        <i className="fa-solid fa-calendar-days text-indigo-500 w-4"></i>
                        <span>{new Date(r.startDate).toLocaleDateString()} - {new Date(r.endDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 p-2 rounded-lg">
                        <i className="fa-solid fa-envelope text-slate-400 w-4"></i>
                        <span className="truncate">{r.email}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase">Created: {new Date(r.createdAt).toLocaleDateString()}</span>
                      <i className="fa-solid fa-arrow-right text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all text-xs"></i>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Details Modal */}
          {selectedRequest && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
              <Card className="w-full max-w-2xl bg-white dark:bg-slate-900 p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="absolute top-6 right-6 w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors z-50"
                >
                  <i className="fa-solid fa-times"></i>
                </button>

                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-6 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${selectedRequest.status === 'Approved' ? 'bg-emerald-500' : selectedRequest.status === 'Rejected' ? 'bg-rose-500' : 'bg-amber-500'}`}>
                    <i className="fa-solid fa-map-location-dot"></i>
                  </div>
                  Request Details
                </h3>

                <div className="overflow-y-auto custom-scrollbar pr-2 space-y-6">
                  {/* Grid of details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i className="fa-solid fa-user text-indigo-400"></i> Requester Name</p>
                      <p className="font-black text-slate-800 dark:text-white truncate">{selectedRequest.fullName}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i className="fa-solid fa-building text-indigo-400"></i> Department / Team</p>
                      <p className="font-black text-slate-800 dark:text-white truncate">{selectedRequest.department || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i className="fa-solid fa-envelope text-indigo-400"></i> Email Address</p>
                      <p className="font-black text-slate-800 dark:text-white truncate">{selectedRequest.email}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i className="fa-solid fa-phone text-indigo-400"></i> Contact Number</p>
                      <p className="font-black text-slate-800 dark:text-white truncate">{selectedRequest.phone}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i className="fa-solid fa-calendar text-indigo-400"></i> Proposed Dates</p>
                      <p className="font-black text-slate-800 dark:text-white truncate">{new Date(selectedRequest.startDate).toLocaleDateString()} - {new Date(selectedRequest.endDate).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i className="fa-solid fa-users text-indigo-400"></i> Team Size / Status</p>
                      <p className="font-black text-slate-800 dark:text-white flex items-center justify-between">
                        <span>{selectedRequest.teamSize} PAX</span>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs uppercase font-black tracking-widest ${selectedRequest.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : selectedRequest.status === 'Rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>{selectedRequest.status}</span>
                      </p>
                    </div>
                  </div>

                  {selectedRequest.attendeeEmails && selectedRequest.attendeeEmails.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <i className="fa-solid fa-clipboard-user text-indigo-500"></i>
                        Attendees Confirmed
                      </h4>
                      <div className="flex flex-wrap gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                        {selectedRequest.attendeeEmails.map((email, idx) => (
                          <span key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm">{email}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRequest.timeline && selectedRequest.timeline.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <i className="fa-solid fa-clock-rotate-left text-indigo-500"></i>
                        Request History
                      </h4>
                      <div className="space-y-3">
                        {selectedRequest.timeline?.map((event, idx) => (
                          <div key={idx} className="flex gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                            <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm">
                              <i className={`fa-solid ${event.event.includes('Approved') || event.event.includes('Approved availability') ? 'fa-check text-emerald-500' : event.event.includes('Rejected') ? 'fa-xmark text-rose-500' : 'fa-clock text-amber-500'} text-xs`}></i>
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800 dark:text-white capitalize leading-tight">{event.event}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <p className="text-xs font-bold text-slate-500">{new Date(event.timestamp).toLocaleString()}</p>
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                <p className="text-xs font-bold text-slate-500 truncate max-w-[150px]" title={event.actor}>{event.actor}</p>
                              </div>
                              {event.details && <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm italic">&quot;{event.details}&quot;</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <button onClick={() => setSelectedRequest(null)} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 dark:shadow-white/10">
                    <i className="fa-solid fa-times"></i>
                    Close Details
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <header>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Igatpuri Meetup Dashboard</h2>
          <p className="text-slate-500 text-sm mt-1">Monitoring pending constraints and historical location reservations for the Igatpuri campus.</p>
        </header>

        {/* Separated Analytics Elements */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                <i className="fa-solid fa-inbox text-slate-500 dark:text-slate-400 group-hover:text-indigo-500 transition-colors text-xs"></i>
              </div>
              <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">Total<br />Requests</span>
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-white leading-none group-hover:text-indigo-600 transition-colors">{availabilityRequests.length}</p>
            <p className="text-xs text-slate-400 font-bold mt-1.5">All time</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/10 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/30 transition-colors border border-amber-100 dark:border-amber-800/50">
                <i className="fa-solid fa-hourglass-half text-amber-500 text-xs"></i>
              </div>
              <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">Pending<br />Review</span>
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-white leading-none group-hover:text-amber-500 transition-colors">{pending.length}</p>
            <p className="text-xs text-slate-400 font-bold mt-1.5 border-t border-slate-100 dark:border-slate-800 pt-1.5">Awaiting decision</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 transition-colors border border-emerald-100 dark:border-emerald-800/50">
                <i className="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
              </div>
              <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">Approved<br />Requests</span>
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-white leading-none group-hover:text-emerald-500 transition-colors">{approved.length}</p>
            <div className="flex items-center gap-2 mt-1.5 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${approvalRate}%` }}></div>
              </div>
              <span className="text-xs text-slate-400 font-bold">{approvalRate}%</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/10 flex items-center justify-center group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 transition-colors border border-violet-100 dark:border-violet-800/50">
                <i className="fa-solid fa-users text-violet-500 text-xs"></i>
              </div>
              <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">Total<br />PAX</span>
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-white leading-none group-hover:text-violet-500 transition-colors">{totalPax}</p>
            <p className="text-xs text-slate-400 font-bold mt-1.5 border-t border-slate-100 dark:border-slate-800 pt-1.5">Across all requests</p>
          </div>
        </div>

        {/* Sub-tabbed content */}
        <PncMeetupSubTabs />
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
        <div className="w-16 h-16 bg-violet-600 rounded-lg flex items-center justify-center text-white text-3xl shadow-xl shadow-violet-600/20">
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
                  <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center text-3xl shadow-inner group-hover:rotate-6 transition-transform">
                    <i className="fa-solid fa-hotel"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-emerald-200 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs font-black uppercase tracking-widest rounded-lg">Active Booking</span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">• {activeMeetup.teamSize} PAX</span>
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
                    <div onClick={() => setActiveStatModal('completion')} className="flex-1 md:flex-initial px-6 py-4 bg-white/50 dark:bg-slate-900/50 rounded-lg border border-emerald-100 dark:border-emerald-800/30 cursor-pointer hover:border-emerald-400 transition-all text-center">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Forms</p>
                      <p className="text-xl font-black text-emerald-600">{attendeeStats.filled}/{attendeeStats.total}</p>
                    </div>
                    <div onClick={() => setActiveStatModal('booking')} className="flex-1 md:flex-initial px-6 py-4 bg-white/50 dark:bg-slate-900/50 rounded-lg border border-emerald-100 dark:border-emerald-800/30 cursor-pointer hover:border-emerald-400 transition-all text-center">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Tickets</p>
                      <p className="text-xl font-black text-emerald-600">{attendeeStats.booked}/{attendeeStats.total}</p>
                    </div>
                  </div>
                ) : (
                  !requests.some(r => r.purpose === 'Igatpuri Meetup' && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER) && (
                    <button
                      onClick={() => onNewRequest({ startDate: activeMeetup.startDate, endDate: activeMeetup.endDate })}
                      className="w-full md:w-auto px-8 py-4 bg-emerald-600 text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition-all text-center"
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
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeStatModal === 'completion' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
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
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 group hover:border-slate-300 dark:hover:border-slate-600 transition-all">
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
                            <p className="text-xs text-slate-400 font-bold truncate">
                              {attendee.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {activeStatModal === 'completion' ? (
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${attendee.status === 'Filled'
                              ? 'bg-emerald-100 text-emerald-600'
                              : 'bg-amber-50 text-amber-600 border border-amber-100'
                              }`}>
                              {attendee.status === 'Filled' ? 'Form Filled' : 'Pending'}
                            </span>
                          ) : (
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${attendee.isBooked
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
                    className="w-full py-4 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all shadow-xl"
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
              <div onClick={() => onView(r)} className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 p-6 rounded-lg hover:shadow-xl hover:border-emerald-500/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden max-w-md bg-gradient-to-br from-emerald-50/10 to-transparent">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 -mr-10 -mt-10 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <span className="text-xs font-black text-emerald-500/60 font-mono tracking-tighter uppercase">{r.submissionId || r.id}</span>
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
                  <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600">
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
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 p-4 rounded-lg flex gap-4">
                      <i className="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-500 mt-1"></i>
                      <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                        <strong className="uppercase tracking-wide text-xs">Mandatory Step:</strong> Before submitting any travel request, you must get written confirmation of location availability.
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
                              } rounded-lg text-xs font-black uppercase tracking-wider transition-all disabled:cursor-default`}
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
                              className="px-6 py-2.5 bg-violet-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {isSavingAttendees ? <i className="fa-solid fa-circle-notch fa-spin mr-1"></i> : null}
                              Confirm {approvedRequest?.teamSize || ''} Attendees
                            </button>
                          </div>
                        ) : (
                          <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-lg">
                            <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-2">Confirmed Attendees ({attendeeEmails.length})</p>
                            <div className="flex flex-wrap gap-2">
                              {attendeeEmails.map((email, idx) => (
                                <span key={idx} className="px-2 py-1 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900/50 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400">
                                  {email}
                                </span>
                              ))}
                            </div>
                            {!isRequestSubmitted && (
                              <button
                                onClick={() => setIsAttendeesConfirmed(false)}
                                className="text-xs text-slate-400 font-bold hover:text-violet-600 mt-3 hover:underline transition-all block"
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
                          className="mt-4 w-full py-4 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
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
            <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white transition-all rounded-lg text-sm font-black shadow-lg shadow-indigo-600/20 relative z-10">
              Contact PNC Team
            </button>
          </Card>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Authorized Approvers</h4>
            {loading ? (
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg animate-pulse">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-1/2 mb-2"></div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-lg w-3/4"></div>
              </div>
            ) : approvers.length === 0 ? (
              <div className="p-6 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg border-dashed">
                <p className="text-xs text-slate-400 font-bold">No approvers listed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {approvers.map(a => (
                  <div key={a.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-bold">
                        {a.name ? a.name.charAt(0).toUpperCase() : <i className="fa-solid fa-user"></i>}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{a.name || 'Admin'}</p>
                        <p className="text-xs text-slate-400 font-medium truncate">{a.email}</p>
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

const UserRoleManagement = ({ users, onUpdateRole, currentUser }: { users: User[], onUpdateRole: (user: User, newRole: UserRole) => void, currentUser: User }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

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

  const handleInviteUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }
    setIsInviting(true);
    try {
      // Step 1: Send a magic link / signup invite via Supabase OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: newUserEmail.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin,
          data: { name: newUserName.trim() || undefined }
        }
      });
      if (otpError) throw otpError;

      toast.success(`Invite sent to ${newUserEmail.trim()}! They will receive a magic link to sign in.`);
      setNewUserName('');
      setNewUserEmail('');
      setIsAddUserModalOpen(false);
    } catch (err: any) {
      toast.error('Failed to send invite: ' + err.message);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">User Management</h2>
          <p className="text-slate-500 text-sm mt-1">Manage users, roles and system access permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 hover:text-indigo-600 transition-all shadow-sm"
            title="Refresh Data"
          >
            <i className="fa-solid fa-sync"></i>
          </button>
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg text-sm font-black shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <i className="fa-solid fa-user-plus"></i>
            Add User
          </button>
          <div className="relative w-full md:w-80">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
            />
          </div>
        </div>
      </header>

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-black text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                <th className="px-8 py-6">User Details</th>
                <th className="px-8 py-6">Status / Role</th>
                <th className="px-8 py-6 text-right">Update Access</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {paginatedUsers.map(user => {
                const isProtectedAdmin = user.email?.toLowerCase() === 'nitin@navgurukul.org';
                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-indigo-50 dark:bg-slate-800 rounded-lg flex items-center justify-center font-black text-indigo-600 border border-slate-100 dark:border-slate-700 shadow-sm group-hover:scale-105 transition-transform">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover rounded-lg" /> : user.name?.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-800 dark:text-white leading-tight">{user.name}</p>
                            {isProtectedAdmin && (
                              <span className="inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 select-none">
                                <i className="fa-solid fa-lock text-xs"></i>
                                FIXED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <StatusBadge type="status" value={user.role} />
                    </td>
                    <td className="px-8 py-5 text-right">
                      {isProtectedAdmin ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-lg text-xs font-black text-slate-400 dark:text-slate-500 select-none" title="This admin account is protected and cannot be changed">
                          <i className="fa-solid fa-lock text-xs"></i>
                          Protected Admin
                        </div>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => onUpdateRole(user, e.target.value as UserRole)}
                          className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-lg px-4 py-2 text-xs font-black text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={user.id === currentUser.id || (currentUser.role === UserRole.PNC && user.role !== UserRole.EMPLOYEE && user.role !== UserRole.PNC)}
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
                      )}
                    </td>
                  </tr>
                );
              })}
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
              className="w-10 h-10 rounded-lg flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${currentPage === page ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="w-10 h-10 rounded-lg flex items-center justify-center border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </Card>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsAddUserModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 z-10 overflow-hidden">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-xl shadow-lg shadow-indigo-600/20">
                    <i className="fa-solid fa-user-plus"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Add New User</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">Send an invitation to a new team member</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-user text-slate-400"></i>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    disabled={isInviting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Email Address <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-envelope text-slate-400"></i>
                  </div>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    disabled={isInviting}
                  />
                </div>
              </div>

              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-lg flex gap-3">
                <i className="fa-solid fa-circle-info text-indigo-500 mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-indigo-700 dark:text-indigo-400/80 leading-relaxed font-medium">
                  An invitation magic link will be sent to the user's email. They can click it to sign in and complete their profile. Their default role will be <span className="font-black">Employee</span>.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex gap-3 justify-end">
              <button
                onClick={() => { setIsAddUserModalOpen(false); setNewUserName(''); setNewUserEmail(''); }}
                className="px-6 py-2.5 text-sm font-black text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                disabled={isInviting}
              >
                Cancel
              </button>
              <button
                onClick={handleInviteUser}
                disabled={isInviting || !newUserEmail.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-lg shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i> Sending...</>
                ) : (
                  <><i className="fa-solid fa-paper-plane"></i> Send Invite</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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
    <h5 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{title}</h5>
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
      <header className="flex flex-col md:flex-row items-center gap-8 bg-white dark:bg-slate-900 p-8 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
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
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-lg transition-all shadow-sm active:scale-95"
                  title="Toggle Theme"
                >
                  {isDarkMode ? <i className="fa-solid fa-sun text-lg"></i> : <i className="fa-solid fa-moon text-lg"></i>}
                </button>
                <button
                  onClick={onLogout}
                  className="px-5 py-2.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-black uppercase tracking-widest rounded-lg transition-all shadow-sm active:scale-95 flex items-center gap-2"
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  Sign Out
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">Profile Completeness</span>
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
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                <i className="fa-solid fa-forward-step text-xl text-indigo-500"></i>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800 dark:text-white">Need to book travel immediately?</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">You can temporarily skip verification for {policy.temporaryUnlockDays} days. After this window, full verification will be required to maintain access.</p>
              </div>
            </div>
            <button onClick={onSkip} className="whitespace-nowrap px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 rounded-lg text-xs font-black uppercase hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 transition-all shadow-sm active:scale-95">Skip for Now</button>
          </div>
        )}

        {policy.isEnforcementEnabled && minDaysRemaining !== null && minDaysRemaining > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-5 flex items-start gap-4 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
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
          <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-lg p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
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
                <p className="text-xs text-slate-500 mt-1.5 uppercase font-black tracking-widest leading-none">Approval Required</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* A. Passport Photo */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-lg p-8 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="font-black text-slate-800 dark:text-white text-sm">A. Passport Photo</h5>
                  <p className="text-xs text-slate-500 mt-1">Clear headshot with plain background</p>
                </div>
                <StatusBadge type="status" value={formData.passportPhoto?.status || VerificationStatus.INCOMPLETE} />
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 p-6 min-h-[220px] group transition-all hover:border-indigo-400">
                {isUploading === 'passportPhoto' ? (
                  <div className="flex flex-col items-center gap-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-600"></i>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Uploading...</p>
                  </div>
                ) : formData.passportPhoto?.fileUrl ? (
                  <div className="relative group/preview">
                    <img src={formData.passportPhoto.fileUrl} className="w-40 h-40 rounded-lg object-cover shadow-2xl border-4 border-white dark:border-slate-800" />
                    <div className="absolute inset-0 bg-slate-900/40 rounded-lg opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                      <i className="fa-solid fa-eye text-white text-2xl"></i>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-slate-400">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-image-portrait"></i></div>
                    <p className="text-xs font-medium">No photo uploaded</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                {(!formData.passportPhoto?.fileUrl || formData.passportPhoto.status === VerificationStatus.REJECTED || formData.passportPhoto.status === VerificationStatus.PENDING || formData.passportPhoto.status === VerificationStatus.INCOMPLETE) && (
                  <label className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-lg font-bold text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'passportPhoto')} disabled={!!isUploading} />
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    {formData.passportPhoto?.fileUrl ? 'Replace Photo' : 'Upload Photo'}
                  </label>
                )}
              </div>
            </div>

            {/* B. Government ID */}
            <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-800/30 rounded-lg p-8 border border-slate-200/50 dark:border-slate-700/50">
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

                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 p-6 min-h-[160px] group transition-all hover:border-violet-400">
                  {isUploading === 'idProof' ? (
                    <div className="flex flex-col items-center gap-3">
                      <i className="fa-solid fa-circle-notch fa-spin text-3xl text-violet-600"></i>
                      <p className="text-xs font-bold text-violet-600 uppercase tracking-widest">Uploading...</p>
                    </div>
                  ) : formData.idProof?.fileUrl ? (
                    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 w-full">
                      <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center text-violet-600 shadow-sm"><i className="fa-solid fa-file-pdf text-xl"></i></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate">Document Uploaded</p>
                        <p className="text-xs text-slate-500 font-medium">Click to replace or view</p>
                      </div>
                      <i className="fa-solid fa-check-circle text-emerald-500"></i>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"><i className="fa-solid fa-address-card"></i></div>
                      <p className="text-xs font-medium">No document uploaded</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-center">
                  {(!formData.idProof?.fileUrl || formData.idProof.status === VerificationStatus.REJECTED || formData.idProof.status === VerificationStatus.PENDING || formData.idProof.status === VerificationStatus.INCOMPLETE) && (
                    <label className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3.5 rounded-lg font-bold text-sm shadow-xl shadow-violet-600/20 hover:bg-violet-700 active:scale-95 transition-all cursor-pointer">
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
          <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-4 rounded-lg font-black uppercase tracking-widest text-sm shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all">Save Profile Changes</button>
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
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="relative w-44 h-44 rounded-full flex-shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-5 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center flex-col">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{d.label}</span>
            <span className="text-xs text-slate-500 font-mono">({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PieChartInteractive = ({ data, isFinancial }: { data: { label: string, value: number, color: string }[], isFinancial?: boolean }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return <div className="h-72 flex items-center justify-center text-slate-400 text-sm italic">No data available.</div>;

  const cx = 140, cy = 140, outerR = 120, innerR = 60;
  const W = 280, H = 280;

  const fmtVal = (v: number) => isFinancial
    ? (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)
    : `${v}`;

  const slices: { d: string, color: string, label: string, value: number, pct: number, midAngle: number }[] = [];
  let startAngle = -Math.PI / 2;
  data.forEach((seg, i) => {
    const angle = (seg.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const midAngle = startAngle + angle / 2;
    const x1 = cx + outerR * Math.cos(startAngle), y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle), y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle), iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle), iy2 = cy + innerR * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
    slices.push({ d, color: seg.color, label: seg.label, value: seg.value, pct: Math.round((seg.value / total) * 100), midAngle });
    startAngle = endAngle;
  });

  const hovered = hoveredIdx !== null ? slices[hoveredIdx] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGGElement>, idx: number) => {
    const rect = (e.currentTarget.closest('svg') as SVGSVGElement).getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setHoveredIdx(idx);
  };

  return (
    <div className="relative flex items-center justify-center w-full h-72">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-72" onMouseLeave={() => setHoveredIdx(null)}>
        {slices.map((s, i) => {
          const isHov = hoveredIdx === i;
          const scale = isHov ? 1.04 : 1;
          const tX = cx + (cx - cx) * (scale - 1);
          const tY = cy + (cy - cy) * (scale - 1);
          return (
            <g key={i}
              style={{ cursor: 'pointer', transformOrigin: `${cx}px ${cy}px`, transform: `scale(${scale})`, transition: 'transform 0.18s ease' }}
              onMouseMove={(e) => handleMouseMove(e, i)}
              onMouseEnter={() => setHoveredIdx(i)}
            >
              <path d={s.d} fill={s.color} fillOpacity={isHov ? 1 : 0.82} stroke="white" strokeWidth="2" />
            </g>
          );
        })}
        {/* Center label */}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="currentColor" fontSize="22" fontWeight="800" className="text-slate-900 dark:text-white" style={{ fill: hoveredIdx !== null ? slices[hoveredIdx].color : '#1e293b' }}>
          {hoveredIdx !== null ? fmtVal(slices[hoveredIdx].value) : fmtVal(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700">
          {hoveredIdx !== null ? `${slices[hoveredIdx].pct}%` : 'Total'}
        </text>
        {/* Inline SVG tooltip */}
        {hovered && (() => {
          const tx = Math.min(Math.max(tooltipPos.x, 60), W - 60);
          const ty = tooltipPos.y > cy ? tooltipPos.y - 44 : tooltipPos.y + 10;
          return (
            <g>
              <rect x={tx - 58} y={ty} width={116} height={36} rx="8" fill="#1e293b" fillOpacity="0.93" />
              <text x={tx} y={ty + 14} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">{hovered.label}</text>
              <text x={tx} y={ty + 28} textAnchor="middle" fill={hovered.color} fontSize="11" fontWeight="800">{fmtVal(hovered.value)} ({hovered.pct}%)</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
};

const AnalyticsView = ({ requests, currentUser }: { requests: TravelRequest[], currentUser: User }) => {
  const [filters, setFilters] = useState<{
    campuses: string[];
    departments: string[];
    period: string;
    startDate: string;
    endDate: string;
  }>({
    campuses: [],
    departments: [],
    period: 'All Time',
    startDate: '',
    endDate: ''
  });
  const [campusDropOpen, setCampusDropOpen] = useState(false);
  const [deptDropOpen, setDeptDropOpen] = useState(false);
  const campusDropRef = useRef<HTMLDivElement>(null);
  const deptDropRef = useRef<HTMLDivElement>(null);

  // Close multi-select dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (campusDropRef.current && !campusDropRef.current.contains(e.target as Node)) setCampusDropOpen(false);
      if (deptDropRef.current && !deptDropRef.current.contains(e.target as Node)) setDeptDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [deptChartType, setDeptChartType] = useState<'bar' | 'line' | 'scatter' | 'bubble' | 'pie'>('bar');
  const [deptSort, setDeptSort] = useState<{ col: 'dept' | 'count' | 'avg' | 'total', dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' });

  const isFinancialView = currentUser.role === UserRole.FINANCE || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PNC;
  const isPNCView = currentUser.role === UserRole.PNC || currentUser.role === UserRole.ADMIN;
  const showComparison = filters.period !== 'All Time';

  const CHART_ICONS: Record<string, string> = { bar: 'fa-chart-bar', line: 'fa-chart-line', scatter: 'fa-braille', bubble: 'fa-circle-dot', pie: 'fa-chart-pie' };

  // Compute date range for current period
  const getCurrentRange = useMemo(() => {
    const now = new Date();
    if (filters.period === 'This Month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
    if (filters.period === 'Last Month') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    if (filters.period === 'Custom Date') {
      const start = filters.startDate ? new Date(filters.startDate) : null;
      const end = filters.endDate ? (() => { const d = new Date(filters.endDate); d.setHours(23, 59, 59, 999); return d; })() : null;
      return { start, end };
    }
    return { start: null, end: null };
  }, [filters]);

  // Compute date range for previous period (same duration, shifted back)
  const getPreviousRange = useMemo(() => {
    const now = new Date();
    if (filters.period === 'This Month') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    if (filters.period === 'Last Month') return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999) };
    if (filters.period === 'Custom Date' && filters.startDate && filters.endDate) {
      const s = new Date(filters.startDate);
      const e = new Date(filters.endDate); e.setHours(23, 59, 59, 999);
      const dur = e.getTime() - s.getTime();
      return { start: new Date(s.getTime() - dur - 1000), end: new Date(s.getTime() - 1000) };
    }
    return { start: null, end: null };
  }, [filters]);

  const applyFilters = (data: TravelRequest[], range: { start: Date | null, end: Date | null }) => {
    return data.filter(r => {
      const matchCampus = filters.campuses.length === 0 || filters.campuses.includes(r.requesterCampus || '');
      const matchDept = filters.departments.length === 0 || filters.departments.includes(r.requesterDepartment || '');
      const reqDate = new Date(r.timestamp);
      let matchDate = true;
      if (range.start) matchDate = matchDate && reqDate >= range.start;
      if (range.end) matchDate = matchDate && reqDate <= range.end;
      return matchCampus && matchDept && matchDate;
    });
  };

  const filteredData = useMemo(() => applyFilters(requests, getCurrentRange), [requests, filters]);
  const prevPeriodData = useMemo(() => showComparison ? applyFilters(requests, getPreviousRange) : [], [requests, filters, showComparison]);

  const computeChange = (curr: number, prev: number): { pct: string, up: boolean } | null => {
    if (!showComparison) return null;
    if (prev === 0 && curr === 0) return null;
    if (prev === 0) return { pct: '▲ New', up: true };
    const pct = ((curr - prev) / prev) * 100;
    return { pct: `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`, up: pct >= 0 };
  };

  // KPI Aggregations
  const totalRequests = filteredData.length;
  const prevTotalRequests = prevPeriodData.length;
  const totalBookings = filteredData.filter(r => r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED).length;
  const prevTotalBookings = prevPeriodData.filter(r => r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED).length;
  const openRequests = filteredData.filter(r => r.pncStatus !== PNCStatus.CLOSED && r.pncStatus !== PNCStatus.REJECTED_BY_PNC && r.pncStatus !== PNCStatus.REJECTED_BY_MANAGER && r.pncStatus !== PNCStatus.BOOKED).length;
  const totalSpend = Math.round(filteredData.reduce((acc, r) => acc + (r.ticketCost || 0), 0) * 100) / 100;
  const prevTotalSpend = Math.round(prevPeriodData.reduce((acc, r) => acc + (r.ticketCost || 0), 0) * 100) / 100;

  // Avg cost: only tickets that are CLOSED (i.e. actually booked & fulfilled)
  const bookedWithCost = filteredData.filter(r => r.pncStatus === PNCStatus.CLOSED && (r.ticketCost || 0) > 0);
  const prevBookedWithCost = prevPeriodData.filter(r => r.pncStatus === PNCStatus.CLOSED && (r.ticketCost || 0) > 0);
  const avgTicketCost = bookedWithCost.length > 0 ? Math.round(bookedWithCost.reduce((acc, r) => acc + (r.ticketCost || 0), 0) / bookedWithCost.length) : 0;
  const prevAvgTicketCost = prevBookedWithCost.length > 0 ? Math.round(prevBookedWithCost.reduce((acc, r) => acc + (r.ticketCost || 0), 0) / prevBookedWithCost.length) : 0;

  const avgProcessingTime = useMemo(() => {
    const closed = filteredData.filter(r => r.pncStatus === PNCStatus.CLOSED || r.pncStatus === PNCStatus.BOOKED);
    if (!closed.length) return 0;
    const total = closed.reduce((acc, r) => {
      const created = new Date(r.timestamp).getTime();
      const evt = r.timeline?.find(e => e.event === 'Status changed to: Closed' || e.event === 'Status changed to: Booked');
      return acc + ((evt ? new Date(evt.timestamp).getTime() : new Date().getTime()) - created);
    }, 0);
    return Math.round((total / closed.length) / (1000 * 60 * 60 * 24) * 10) / 10;
  }, [filteredData]);

  const reqChange = computeChange(totalRequests, prevTotalRequests);
  const bookingsChange = computeChange(totalBookings, prevTotalBookings);
  const spendChange = computeChange(totalSpend, prevTotalSpend);
  const avgCostChange = computeChange(avgTicketCost, prevAvgTicketCost);

  // Charts data
  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const d = r.requesterDepartment || 'Unknown';
      counts[d] = Math.round(((counts[d] || 0) + (isFinancialView ? (r.ticketCost || 0) : 1)) * 100) / 100;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [filteredData, isFinancialView]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => { counts[r.pncStatus] = (counts[r.pncStatus] || 0) + 1; });
    const colors: Record<string, string> = {
      [PNCStatus.NOT_STARTED]: '#cbd5e1', [PNCStatus.APPROVAL_PENDING]: '#fcd34d',
      [PNCStatus.APPROVED]: '#34d399', [PNCStatus.PROCESSING]: '#818cf8',
      [PNCStatus.BOOKED]: '#60a5fa', [PNCStatus.REJECTED_BY_MANAGER]: '#fda4af',
      [PNCStatus.REJECTED_BY_PNC]: '#f87171', [PNCStatus.CLOSED]: '#64748b',
    };
    return Object.entries(counts).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value, color: colors[label] || '#94a3b8' }));
  }, [filteredData]);

  // Department summary table — avg cost on CLOSED tickets only
  const deptSummary = useMemo(() => {
    const map: Record<string, { count: number, totalCost: number, closedCount: number, closedCost: number }> = {};
    filteredData.forEach(r => {
      const d = r.requesterDepartment || 'Unknown';
      if (!map[d]) map[d] = { count: 0, totalCost: 0, closedCount: 0, closedCost: 0 };
      map[d].count += 1;
      map[d].totalCost += r.ticketCost || 0;
      if (r.pncStatus === PNCStatus.CLOSED && (r.ticketCost || 0) > 0) {
        map[d].closedCount += 1;
        map[d].closedCost += r.ticketCost || 0;
      }
    });
    return Object.entries(map).map(([dept, s]) => ({
      dept,
      count: s.count,
      totalCost: Math.round(s.totalCost),
      avgCost: s.closedCount > 0 ? Math.round(s.closedCost / s.closedCount) : 0
    }));
  }, [filteredData]);

  const sortedDeptSummary = useMemo(() => {
    return [...deptSummary].sort((a, b) => {
      const dir = deptSort.dir === 'asc' ? 1 : -1;
      if (deptSort.col === 'dept') return dir * a.dept.localeCompare(b.dept);
      if (deptSort.col === 'count') return dir * (a.count - b.count);
      if (deptSort.col === 'avg') return dir * (a.avgCost - b.avgCost);
      return dir * (a.totalCost - b.totalCost);
    });
  }, [deptSummary, deptSort]);

  const toggleDeptSort = (col: typeof deptSort.col) => setDeptSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });

  const SortIcon = ({ col }: { col: typeof deptSort.col }) => (
    <i className={`fa-solid ml-1 text-xs ${deptSort.col === col ? (deptSort.dir === 'asc' ? 'fa-arrow-up text-indigo-500' : 'fa-arrow-down text-indigo-500') : 'fa-arrows-up-down text-slate-300'}`}></i>
  );

  const uniqueCampuses = Array.from(new Set(requests.map(r => r.requesterCampus).filter(Boolean))) as string[];
  const uniqueDepts = Array.from(new Set(requests.map(r => r.requesterDepartment).filter(Boolean))) as string[];
  const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  // Department chart renderer
  const renderDeptChart = () => {
    if (deptData.length === 0) return (
      <div className="h-80 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">No data for selected period.</div>
    );

    // Shared chart dimensions
    const W = 440, H = 300, PL = 52, PR = 12, PT = 16, PB = 32;
    const cW = W - PL - PR, cH = H - PT - PB;
    const max = Math.max(...deptData.map(d => d.value), 1);
    const NUM_Y = 4;
    const gridVals = Array.from({ length: NUM_Y + 1 }, (_, i) => ({
      val: Math.round((max / NUM_Y) * (NUM_Y - i)),
      y: PT + (i / NUM_Y) * cH
    }));
    const fmtVal = (v: number) => isFinancialView
      ? (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)
      : `${v}`;
    const svgClass = "w-full h-80";

    // Shared axes JSX (reused across all chart types)
    const axesJSX = (
      <>
        {gridVals.map((g, i) => (
          <g key={i}>
            <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={i === NUM_Y ? '0' : '4 3'} />
            <text x={PL - 5} y={g.y + 3} textAnchor="end" fill="#94a3b8" fontSize="8" fontWeight="600">{fmtVal(g.val)}</text>
          </g>
        ))}
        <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="#cbd5e1" strokeWidth="1.5" />
        <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke="#cbd5e1" strokeWidth="1.5" />
      </>
    );

    if (deptChartType === 'pie') return (
      <div className="h-80 flex items-center justify-center py-4">
        <PieChartInteractive data={deptData.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }))} isFinancial={isFinancialView} />
      </div>
    );

    if (deptChartType === 'bar') {
      const gap = cW / deptData.length;
      const barW = Math.max(10, gap * 0.55);
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          {axesJSX}
          {deptData.map((d, i) => {
            const bH = Math.max(2, (d.value / max) * cH);
            const x = PL + gap * i + (gap - barW) / 2;
            const y = PT + cH - bH;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={bH} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity="0.85" rx="3" />
                <line x1={x + barW / 2} y1={PT + cH} x2={x + barW / 2} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" />
                <text x={x + barW / 2} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{d.label.substring(0, 9)}</text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (deptChartType === 'line') {
      const pts = deptData.map((d, i) => ({
        x: PL + (deptData.length < 2 ? cW / 2 : (i / (deptData.length - 1)) * cW),
        y: PT + (1 - d.value / max) * cH,
        d
      }));
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const area = pts.length > 1 ? `${path} L ${pts[pts.length - 1].x} ${PT + cH} L ${pts[0].x} ${PT + cH} Z` : '';
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          <defs><linearGradient id="lgDeptArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient></defs>
          {axesJSX}
          {area && <path d={area} fill="url(#lgDeptArea)" />}
          <path d={path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={p.x} y1={PT + cH} x2={p.x} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" />
              <circle cx={p.x} cy={p.y} r="4.5" fill="#6366f1" stroke="white" strokeWidth="2" />
              <text x={p.x} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{p.d.label.substring(0, 9)}</text>
            </g>
          ))}
        </svg>
      );
    }

    if (deptChartType === 'scatter') {
      const SIDE_PAD = 28;
      const pts = deptData.map((d, i) => ({
        x: PL + SIDE_PAD + (deptData.length < 2 ? (cW - 2 * SIDE_PAD) / 2 : (i / (deptData.length - 1)) * (cW - 2 * SIDE_PAD)),
        y: PT + (1 - d.value / max) * cH,
        d, c: CHART_COLORS[i % CHART_COLORS.length]
      }));
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          {axesJSX}
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={p.x} y1={PT + cH} x2={p.x} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" />
              <circle cx={p.x} cy={p.y} r="9" fill={p.c} fillOpacity="0.75" stroke={p.c} strokeWidth="1.5" />
              <text x={p.x} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{p.d.label.substring(0, 9)}</text>
            </g>
          ))}
        </svg>
      );
    }

    if (deptChartType === 'bubble') {
      const minV = Math.min(...deptData.map(d => d.value));
      const rng = max - minV || 1;
      const SIDE_PAD = 28;
      const pts = deptData.map((d, i) => ({
        x: PL + SIDE_PAD + (deptData.length < 2 ? (cW - 2 * SIDE_PAD) / 2 : (i / (deptData.length - 1)) * (cW - 2 * SIDE_PAD)),
        y: PT + (1 - d.value / max) * cH,
        r: 14 + ((d.value - minV) / rng) * 36,
        d, c: CHART_COLORS[i % CHART_COLORS.length]
      }));
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className={svgClass}>
          {axesJSX}
          {pts.map((p, i) => (
            <g key={i}>
              <line x1={p.x} y1={PT + cH} x2={p.x} y2={PT + cH + 4} stroke="#cbd5e1" strokeWidth="1" />
              <circle cx={p.x} cy={p.y} r={p.r} fill={p.c} fillOpacity="0.55" stroke={p.c} strokeWidth="1.5" />
              <text x={p.x} y={H - 2} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">{p.d.label.substring(0, 9)}</text>
            </g>
          ))}
        </svg>
      );
    }
    return null;
  };




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
        <button onClick={() => {
          const csv = [['Request ID', 'Traveler', 'Department', 'Campus', 'Route', 'Date', 'Status', 'Cost', 'Vendor', 'Invoice'], ...filteredData.map(r => [r.submissionId || r.id, r.requesterName, r.requesterDepartment, r.requesterCampus, `${r.from} -> ${r.to}`, new Date(r.dateOfTravel).toLocaleDateString(), r.pncStatus, r.ticketCost || 0, r.vendorName || '', r.invoiceUrl || ''])].map(e => e.join(',')).join('\n');
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `travel_report_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
          toast.success('CSV exported!');
        }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
          <i className="fa-solid fa-download mr-2"></i>Export Report
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-start shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2"><i className="fa-solid fa-filter"></i> Filters</div>

        {/* Campus multi-select */}
        <div className="relative" ref={campusDropRef}>
          <button
            onClick={() => { setCampusDropOpen(v => !v); setDeptDropOpen(false); }}
            className={`flex items-center gap-2 min-w-[140px] bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 outline-none transition-all ${filters.campuses.length > 0 ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700'
              }`}
          >
            <i className="fa-solid fa-building text-slate-400 text-xs"></i>
            <span className="flex-1 text-left truncate">
              {filters.campuses.length === 0 ? 'All Campuses' : filters.campuses.length === 1 ? filters.campuses[0] : `${filters.campuses.length} Campuses`}
            </span>
            <i className={`fa-solid fa-chevron-${campusDropOpen ? 'up' : 'down'} text-xs text-slate-400`}></i>
          </button>
          {campusDropOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="p-2 border-b dark:border-slate-800 flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Campus</span>
                {filters.campuses.length > 0 && (
                  <button onClick={() => setFilters(f => ({ ...f, campuses: [] }))} className="text-xs font-bold text-rose-500 hover:text-rose-600">Clear</button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                {uniqueCampuses.map(c => {
                  const checked = filters.campuses.includes(c);
                  return (
                    <button key={c} onClick={() => setFilters(f => ({ ...f, campuses: checked ? f.campuses.filter(x => x !== c) : [...f.campuses, c] }))}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${checked ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                        }`}>
                        {checked && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                      </div>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Selected chips */}
          {filters.campuses.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {filters.campuses.map(c => (
                <span key={c} className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {c}
                  <button onClick={() => setFilters(f => ({ ...f, campuses: f.campuses.filter(x => x !== c) }))} className="hover:text-rose-500 transition-colors"><i className="fa-solid fa-xmark text-[8px]"></i></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Department multi-select */}
        <div className="relative" ref={deptDropRef}>
          <button
            onClick={() => { setDeptDropOpen(v => !v); setCampusDropOpen(false); }}
            className={`flex items-center gap-2 min-w-[160px] bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 outline-none transition-all ${filters.departments.length > 0 ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700'
              }`}
          >
            <i className="fa-solid fa-sitemap text-slate-400 text-xs"></i>
            <span className="flex-1 text-left truncate">
              {filters.departments.length === 0 ? 'All Departments' : filters.departments.length === 1 ? filters.departments[0] : `${filters.departments.length} Departments`}
            </span>
            <i className={`fa-solid fa-chevron-${deptDropOpen ? 'up' : 'down'} text-xs text-slate-400`}></i>
          </button>
          {deptDropOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="p-2 border-b dark:border-slate-800 flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Department</span>
                {filters.departments.length > 0 && (
                  <button onClick={() => setFilters(f => ({ ...f, departments: [] }))} className="text-xs font-bold text-rose-500 hover:text-rose-600">Clear</button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                {uniqueDepts.map(d => {
                  const checked = filters.departments.includes(d);
                  return (
                    <button key={d} onClick={() => setFilters(f => ({ ...f, departments: checked ? f.departments.filter(x => x !== d) : [...f.departments, d] }))}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${checked ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                        }`}>
                        {checked && <i className="fa-solid fa-check text-white text-[8px]"></i>}
                      </div>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Selected chips */}
          {filters.departments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {filters.departments.map(d => (
                <span key={d} className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {d}
                  <button onClick={() => setFilters(f => ({ ...f, departments: f.departments.filter(x => x !== d) }))} className="hover:text-rose-500 transition-colors"><i className="fa-solid fa-xmark text-[8px]"></i></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Period select */}
        <select className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
          <option value="All Time">All Time</option>
          <option value="This Month">This Month</option>
          <option value="Last Month">Last Month</option>
          <option value="Custom Date">Custom Date</option>
        </select>
        {filters.period === 'Custom Date' && (
          <div className="flex items-center gap-2">
            <input type="date" className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
            <span className="text-slate-400 font-bold">–</span>
            <input type="date" className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-slate-300" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
        )}

        {/* Clear all */}
        {(filters.campuses.length > 0 || filters.departments.length > 0) && (
          <button
            onClick={() => setFilters(f => ({ ...f, campuses: [], departments: [] }))}
            className="text-xs font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-xmark"></i> Clear All
          </button>
        )}

        {showComparison && (
          <div className="ml-auto flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-full">
            <i className="fa-solid fa-arrows-left-right"></i>
            vs previous {filters.period === 'Custom Date' ? 'period' : 'month'}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isPNCView ? (
          <>
            <StatCard title="Total Requests" value={totalRequests} icon={<i className="fa-solid fa-inbox"></i>} trend={reqChange?.pct} trendUp={reqChange?.up} description={showComparison ? `vs ${prevTotalRequests} prev period` : 'All time volume'} />
            <StatCard title="Total Tickets" value={totalBookings} icon={<i className="fa-solid fa-check-double"></i>} trend={bookingsChange?.pct} trendUp={bookingsChange?.up} description={showComparison ? `vs ${prevTotalBookings} prev period` : 'Successfully closed'} />
            <StatCard title="Open Requests" value={openRequests} icon={<i className="fa-solid fa-clock"></i>} description="Pending action" />
            <StatCard title="Avg Ticket Cost" value={avgTicketCost > 0 ? `₹${avgTicketCost.toLocaleString()}` : '—'} icon={<i className="fa-solid fa-calculator"></i>} trend={avgCostChange?.pct} trendUp={avgCostChange?.up} description={`${bookedWithCost.length} closed tickets`} />
          </>
        ) : (
          <>
            <StatCard title="Total Bookings" value={totalRequests} icon={<i className="fa-solid fa-ticket"></i>} trend={reqChange?.pct} trendUp={reqChange?.up} description={showComparison ? `vs ${prevTotalRequests} prev period` : 'Total requests in period'} />
            {isFinancialView && <StatCard title="Total Spend" value={`₹ ${totalSpend.toLocaleString()}`} icon={<i className="fa-solid fa-indian-rupee-sign"></i>} trend={spendChange?.pct} trendUp={spendChange?.up !== undefined ? !spendChange.up : undefined} description="Actual ticket cost" />}
            {isFinancialView && <StatCard title="Avg Ticket Cost" value={avgTicketCost > 0 ? `₹${avgTicketCost.toLocaleString()}` : '—'} icon={<i className="fa-solid fa-calculator"></i>} trend={avgCostChange?.pct} trendUp={avgCostChange?.up} description={`${bookedWithCost.length} closed tickets`} />}
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {isPNCView && (
          <Card className="p-6">
            <h4 className="font-bold text-slate-800 dark:text-white mb-6">Request Status Breakdown</h4>
            <DonutChart data={statusData} />
          </Card>
        )}
        <Card className="p-6 flex flex-col" style={{ minHeight: '420px' }}>
          <div className="flex justify-between items-center mb-5">
            <h4 className="font-bold text-slate-800 dark:text-white">{isFinancialView ? 'Spend by Department' : 'Volume by Department'}</h4>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              {(['bar', 'line', 'scatter', 'bubble', 'pie'] as const).map(type => (
                <button key={type} onClick={() => setDeptChartType(type)} title={type.charAt(0).toUpperCase() + type.slice(1)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all ${deptChartType === type ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  <i className={`fa-solid ${CHART_ICONS[type]}`}></i>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            {renderDeptChart()}
          </div>
        </Card>
      </div>

      {/* Department Summary Table */}
      <Card className="overflow-hidden">
        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h4 className="font-bold text-slate-800 dark:text-white">Tickets by Department</h4>
            <p className="text-xs text-slate-400 mt-0.5">Booking summary per department — click headers to sort</p>
          </div>
          <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-full">{filteredData.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('dept')}>Department <SortIcon col="dept" /></th>
                <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('count')}># Tickets <SortIcon col="count" /></th>
                {isFinancialView && <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('avg')}>Avg Cost <SortIcon col="avg" /></th>}
                {isFinancialView && <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => toggleDeptSort('total')}>Total Cost <SortIcon col="total" /></th>}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {sortedDeptSummary.map((row, i) => (
                <tr key={row.dept} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                      <span className="font-bold text-slate-800 dark:text-white">{row.dept}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-800 dark:text-white w-8">{row.count}</span>
                      <div className="flex-1 max-w-[100px] h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(row.count / (Math.max(...sortedDeptSummary.map(r => r.count)) || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                  </td>
                  {isFinancialView && <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">₹{row.avgCost.toLocaleString()}</td>}
                  {isFinancialView && <td className="px-6 py-4"><span className="font-bold text-slate-900 dark:text-white">₹{row.totalCost.toLocaleString()}</span></td>}
                </tr>
              ))}
              {sortedDeptSummary.length === 0 && (
                <tr><td colSpan={isFinancialView ? 4 : 2} className="px-6 py-12 text-center text-slate-400 text-sm">No data for the selected period.</td></tr>
              )}
            </tbody>
            {sortedDeptSummary.length > 0 && isFinancialView && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td className="px-6 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Totals</td>
                  <td className="px-6 py-3 font-black text-slate-800 dark:text-white">{sortedDeptSummary.reduce((a, r) => a + r.count, 0)}</td>
                  <td className="px-6 py-3 font-mono text-slate-500">₹{avgTicketCost.toLocaleString()}</td>
                  <td className="px-6 py-3 font-black text-indigo-600">₹{totalSpend.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Detailed Report Table */}
      <Card className="overflow-hidden">
        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h4 className="font-bold text-slate-800 dark:text-white">Detailed Report</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Request ID</th><th className="px-6 py-4">Traveler</th>
                <th className="px-6 py-4">Dept / Campus</th><th className="px-6 py-4">Route</th>
                <th className="px-6 py-4">Date</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {filteredData.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-xs">{r.submissionId || r.id}</td>
                  <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{r.requesterName}</td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{r.requesterDepartment} <span className="text-slate-300 mx-1">•</span> {r.requesterCampus}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.from} → {r.to}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString()}</td>
                  <td className="px-6 py-4"><StatusBadge type="pnc" value={r.pncStatus} /></td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-500">{(r.invoiceUrl || r.ticketUrl) ? (<a href={r.invoiceUrl || r.ticketUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">View <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i></a>) : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
        <header className="px-8 py-6 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Check Availability</h3>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">Igathpuri Campus Request</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 flex items-center justify-center">
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
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Start Date</label>
                <input
                  type="date"
                  required
                  min={minStartDate}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value, endDate: e.target.value > formData.endDate ? '' : formData.endDate })}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">End Date</label>
                <input
                  type="date"
                  required
                  min={minEndDate}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-4 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="bg-violet-50 dark:bg-violet-900/10 p-4 rounded-lg border border-violet-100 dark:border-violet-800/30 flex gap-3">
            <i className="fa-solid fa-circle-info text-violet-600 mt-0.5"></i>
            <p className="text-xs text-violet-700 dark:text-violet-400 leading-relaxed font-medium">
              Your request will be sent to the Igathpuri meetup approvers. Once approved, you can proceed with your travel booking.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
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
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}>
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
    temporaryUnlockDays: 7,
    tatApprovalHours: 24,
    tatProcessingHours: 48,
    tatBookingHours: 72,
    cancellationPncNgCover: 100,
    cancellationPncEmpCover: 0,
    cancellationEmpNgCover: 50,
    cancellationEmpEmpCover: 50
  });

  const [travelModePolicies, setTravelModePolicies] = useState<TravelModePolicy[]>([]);

  const [meetupAvailabilityRequests, setMeetupAvailabilityRequests] = useState<MeetupAvailabilityRequest[]>([]);
  const [isMeetupAvailabilityModalOpen, setIsMeetupAvailabilityModalOpen] = useState(false);
  const [isMeetupApprover, setIsMeetupApprover] = useState(false);
  const [isIgatpuriEnabled, setIsIgatpuriEnabled] = useState(true);
  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const [isEmailLoginEnabled, setIsEmailLoginEnabled] = useState(true);

  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Fetch Unread Chats
  useEffect(() => {
    if (!currentUser) return;
    const fetchUnread = async () => {
      let query = supabase.from('chat_threads').select('id, updated_at, last_read_employee, last_read_pnc, employee_id, status');

      if (currentUser.role === UserRole.EMPLOYEE) {
        query = query.eq('employee_id', currentUser.id);
      } else {
        query = query.neq('employee_id', currentUser.id);
      }

      const { data } = await query;
      if (data) {
        let count = 0;
        data.filter(t => t.status !== 'archived').forEach(t => {
          if (currentUser.role === UserRole.EMPLOYEE) {
            const lr = t.last_read_employee ? new Date(t.last_read_employee).getTime() : 0;
            if (new Date(t.updated_at).getTime() > lr) count++;
          } else {
            const lr = t.last_read_pnc ? new Date(t.last_read_pnc).getTime() : 0;
            if (new Date(t.updated_at).getTime() > lr) count++;
          }
        });
        setUnreadChatCount(count);
      }
    };
    fetchUnread();

    // Listen for real-time thread updates to instantly clear/update badges
    const globalSub = supabase
      .channel('chat_global_changes')
      .on('broadcast', { event: 'update_threads' }, () => {
        fetchUnread();
      })
      .subscribe();

    // Poll every 15s to keep badge updated across tabs without complex realtime logic in App
    const interval = setInterval(fetchUnread, 15000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(globalSub);
    };
  }, [currentUser]);

  // Handle Auth State
  // Fetch global settings (like email login toggle) regardless of session
  useEffect(() => {
    const fetchGlobalSettings = async () => {
      const { data, error } = await supabase
        .from('meetup_settings')
        .select('*')
        .in('setting_key', ['is_email_login_enabled']);

      if (!error && data) {
        const emailLoginSetting = data.find(s => s.setting_key === 'is_email_login_enabled');
        if (emailLoginSetting) {
          setIsEmailLoginEnabled(emailLoginSetting.setting_value === true || emailLoginSetting.setting_value === 'true');
        }
      }
    };
    fetchGlobalSettings();
  }, []);

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
      return;
    }

    lastSessionRef.current = sessionToken;

    const fetchData = async () => {
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
          role: (() => {
            const dbRole = profile.role as UserRole;
            const storedRole = sessionStorage.getItem('currentRole') as UserRole | null;
            // Only honour the stored role if it's a valid view-switch for this user's base role
            // e.g. a PNC user may have chosen to "view as Employee" — keep that choice.
            // But if there's no stored role, or it isn't accessible to this user, fall back to DB role.
            const validRolesForDbRole = (() => {
              if (dbRole === UserRole.ADMIN) return Object.values(UserRole);
              if (dbRole === UserRole.PNC) return [UserRole.EMPLOYEE, UserRole.PNC, UserRole.FINANCE];
              if (dbRole === UserRole.FINANCE) return [UserRole.EMPLOYEE, UserRole.FINANCE];
              return [UserRole.EMPLOYEE];
            })();
            if (storedRole && validRolesForDbRole.includes(storedRole)) return storedRole;
            return dbRole;
          })(),
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

        // Run subsequent queries in parallel
        const fetchTravelRequests = async () => {
          let query = supabase.from('travel_requests').select('*');
          if (mappedUser.role === UserRole.EMPLOYEE) {
            query = query.or(`requester_id.eq.${mappedUser.id},approving_manager_email.eq.${mappedUser.email}`);
          }
          const { data: reqs, error: reqsError } = await query.order('created_at', { ascending: false });
          if (reqsError) throw reqsError;
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
            costCenter: r.cost_center,
            budgetCode: r.budget_code,
            vendorName: r.vendor_name,
            ticketCost: r.ticket_cost,
            travelLegs: r.split_tickets || undefined,
            invoiceUrl: r.invoice_url,
            timeline: r.timeline || [],
            emergencyContactName: r.emergency_contact_name,
            emergencyContactPhone: r.emergency_contact_phone,
            emergencyContactRelation: r.emergency_contact_relation,
            bloodGroup: r.blood_group,
            medicalConditions: r.medical_conditions,
            hasViolation: r.has_violation,
            violationDetails: r.violation_reason,
            bookedBy: r.booked_by,
          }));
          setRequests(mappedReqs);
        };

        const fetchAllUsers = async () => {
          if (mappedUser.role === UserRole.ADMIN || mappedUser.role === UserRole.PNC) {
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
            } else {
              setUsers([mappedUser]);
            }
          } else {
            setUsers([mappedUser]);
          }
        };

        const fetchMeetups = async () => {
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
        };

        const fetchPolicies = async () => {
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
        };

        const fetchSettings = async () => {
          const { data: settingsData, error: settingsError } = await supabase
            .from('meetup_settings')
            .select('*')
            .in('setting_key', ['is_igatpuri_enabled', 'is_chat_enabled', 'is_email_login_enabled', 'policy_config']);

          if (!settingsError && settingsData) {
            const igatpuriSetting = settingsData.find(s => s.setting_key === 'is_igatpuri_enabled');
            if (igatpuriSetting) {
              setIsIgatpuriEnabled(igatpuriSetting.setting_value === true || igatpuriSetting.setting_value === 'true');
            }
            const chatSetting = settingsData.find(s => s.setting_key === 'is_chat_enabled');
            if (chatSetting) {
              setIsChatEnabled(chatSetting.setting_value === true || chatSetting.setting_value === 'true');
            }
            const emailLoginSetting = settingsData.find(s => s.setting_key === 'is_email_login_enabled');
            if (emailLoginSetting) {
              setIsEmailLoginEnabled(emailLoginSetting.setting_value === true || emailLoginSetting.setting_value === 'true');
            }
            const policySetting = settingsData.find(s => s.setting_key === 'policy_config');
            if (policySetting && policySetting.setting_value) {
              setPolicy(prev => ({ ...prev, ...policySetting.setting_value }));
            }
          }
        };

        await Promise.all([
          fetchTravelRequests(),
          fetchAllUsers(),
          fetchMeetups(),
          fetchPolicies(),
          fetchSettings()
        ]);
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

  // ─── Profile-only update (never touches the role column) ───────────────────
  const handleUpdateUser = async (updatedUser: User) => {
    // NOTE: This function intentionally does NOT update the `role` field.
    // Role changes must go through handleUpdateUserRole (Admin/PNC → Users tab only).
    const PROTECTED_ADMIN_EMAIL = 'nitin@navgurukul.org';
    const isProtected = updatedUser.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL;
    // Re-lock the protected admin's role in local state, just in case
    const finalUser = isProtected ? { ...updatedUser, role: UserRole.ADMIN } : updatedUser;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: finalUser.name,
          avatar: finalUser.avatar,
          department: finalUser.department,
          campus: finalUser.campus,
          manager_name: finalUser.managerName,
          manager_email: finalUser.managerEmail,
          passport_photo: finalUser.passportPhoto,
          id_proof: finalUser.idProof,
          phone: finalUser.phone,
          emergency_contact_name: finalUser.emergencyContactName,
          emergency_contact_phone: finalUser.emergencyContactPhone,
          emergency_contact_relation: finalUser.emergencyContactRelation,
          blood_group: finalUser.bloodGroup,
          medical_conditions: finalUser.medicalConditions,
          // ⚠️  role is intentionally omitted — use handleUpdateUserRole instead
          updated_at: new Date().toISOString()
        })
        .eq('id', finalUser.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === finalUser.id ? finalUser : u));
      if (currentUser?.id === finalUser.id) {
        setCurrentUser(finalUser);
      }
      toast.success("Profile updated in database");
    } catch (err: any) {
      toast.error("Update failed: " + err.message);
    }
  };

  // ─── Role-only update — callable only from PNC → Users or Admin → Users ────
  const handleUpdateUserRole = async (targetUser: User, newRole: UserRole) => {
    const callerRole = currentUser?.role;

    // 1. Only Admin or PNC (acting as PNC) can change roles
    if (callerRole !== UserRole.ADMIN && callerRole !== UserRole.PNC) {
      toast.error("Unauthorised: only Admin or PNC can change roles.");
      return;
    }

    // 2. Protected admin account is always locked
    const PROTECTED_ADMIN_EMAIL = 'nitin@navgurukul.org';
    if (targetUser.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL) {
      toast.error("The protected admin account cannot be re-assigned.");
      return;
    }

    // 3. PNC can only assign Employee or PNC roles
    if (callerRole === UserRole.PNC) {
      if (newRole !== UserRole.EMPLOYEE && newRole !== UserRole.PNC) {
        toast.error("PNC can only assign Employee or PNC roles.");
        return;
      }
    }

    // 4. Nobody can self-demote (prevents accidental lockout)
    if (targetUser.id === currentUser?.id) {
      toast.error("You cannot change your own role here. Use the DB directly.");
      return;
    }

    const updatedUser = { ...targetUser, role: newRole };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', targetUser.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === targetUser.id ? updatedUser : u));
      toast.success(`Role updated to ${newRole} for ${targetUser.name || targetUser.email}`);
    } catch (err: any) {
      toast.error("Role update failed: " + err.message);
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
            isIgatpuriEnabled={isIgatpuriEnabled}
          />
        );
      }
      if (currentUser.role === UserRole.ADMIN) {
        return <AdminDashboard requests={requests} users={users} onTabChange={handleTabChange} />;
      }
      if (currentUser.role === UserRole.PNC) {
        return <PNCDashboard requests={requests} onTabChange={handleTabChange} onView={setSelectedRequest} policies={travelModePolicies} policy={policy} />;
      }
      if (currentUser.role === UserRole.FINANCE) {
        return <AnalyticsView requests={requests} currentUser={currentUser} />;
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
            case 'advances':
        if (currentUser.role === UserRole.PNC || currentUser.role === UserRole.ADMIN) {
          return <AdvanceManagement currentUser={currentUser} users={users} onViewRequest={(id) => {
            const req = requests.find((r: TravelRequest) => r.id === id);
            if (req) {
              setSelectedRequest(req);
            }
          }} />;
        }
        return renderDashboard();
      case 'cancellations':
        return <CancellationsDashboard currentUser={currentUser} />;
      case 'cancellation-requests':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return (
          <CancellationRequestsQueue
            requests={requests.filter(r => r.pncStatus === PNCStatus.CANCELLATION_REQUESTED)}
            onView={setSelectedRequest}
          />
        );
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
          isChatEnabled={isChatEnabled}
          setIsChatEnabled={setIsChatEnabled}
          isEmailLoginEnabled={isEmailLoginEnabled}
          setIsEmailLoginEnabled={setIsEmailLoginEnabled}
          currentUser={currentUser}
        />;
      case 'role-management':
        if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.PNC) return renderDashboard();
        return <UserRoleManagement users={users} onUpdateRole={handleUpdateUserRole} currentUser={currentUser} />;
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
      case 'chat':
        if (!isChatEnabled) return renderDashboard();
        return <ChatView currentUser={currentUser} requests={requests} onViewRequest={setSelectedRequest} />;
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
    return <AuthView initialMode={isResettingPassword ? 'reset' : 'login'} onFinishReset={() => setIsResettingPassword(false)} isEmailLoginEnabled={isEmailLoginEnabled} />;
  }

  // If loading is finished but fetching the profile failed, show session logout/error
  if (!isLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/20 text-rose-600 rounded-lg flex items-center justify-center text-3xl mx-auto shadow-xl">
            <i className="fa-solid fa-cloud-bolt"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Connection Error</h2>
          <p className="text-slate-500 font-medium">We couldn't load your profile. This might be due to a database sync issue or incorrect permissions.</p>
          <div className="flex flex-col gap-3 pt-4">
            <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-black shadow-xl hover:bg-indigo-700 transition-all">Retry Connection</button>
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
        <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />
        <nav className="h-16 bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-8 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-600/20">N</div>
            <h1 className="font-bold tracking-tight text-slate-800 dark:text-white">Navgurukul Travel Desk</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-transparent hover:border-indigo-500/20 transition-all duration-300 shadow-sm"
              aria-label="Toggle Dark Mode"
            >
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'} text-lg`}></i>
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('activeTab'); sessionStorage.removeItem('currentRole'); supabase.auth.signOut(); }}
              className="text-xs font-bold text-slate-400 hover:text-rose-600 uppercase tracking-widest transition-all duration-300 px-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              Sign Out
            </button>
          </div>
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
      <Navbar currentUser={currentUser!} baseRole={baseRole} isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} onToggleRole={(r) => {
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
                <SidebarLink icon="fa-chart-pie" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
                <SidebarLink icon="fa-user" label="Profile" active={activeTab === 'profile'} onClick={() => handleTabChange('profile')} />
               <SidebarLink icon="fa-money-bill-transfer" label="Cancellations" active={activeTab === 'cancellations'} onClick={() => handleTabChange('cancellations')} />
                {isChatEnabled && <SidebarLink icon="fa-comments" label="Chat Support" active={activeTab === 'chat'} onClick={() => handleTabChange('chat')} badge={unreadChatCount > 0 ? " " : null} badgeColor="w-2.5 h-2.5 bg-rose-500 rounded-full flex-shrink-0" />}
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
                <SidebarLink icon="fa-wallet" label="Advances" active={activeTab === 'advances'} onClick={() => handleTabChange('advances')} />
               <SidebarLink icon="fa-money-bill-transfer" label="Cancellations" active={activeTab === 'cancellations'} onClick={() => handleTabChange('cancellations')} />
                <SidebarLink 
                  icon="fa-circle-exclamation" 
                  label="Cancel Queue" 
                  active={activeTab === 'cancellation-requests'} 
                  onClick={() => handleTabChange('cancellation-requests')} 
                  badge={requests.filter(r => r.pncStatus === PNCStatus.CANCELLATION_REQUESTED).length || null}
                  badgeColor="bg-rose-600 px-1.5 py-0.5"
                />
                {isChatEnabled && <SidebarLink icon="fa-comments" label="Chat Support" active={activeTab === 'chat'} onClick={() => handleTabChange('chat')} badge={unreadChatCount > 0 ? " " : null} badgeColor="w-2.5 h-2.5 bg-rose-500 rounded-full flex-shrink-0" />}
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
                <SidebarLink icon="fa-users-gear" label="Users" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
              </div>

            </>
          )}

          {currentUser.role === UserRole.FINANCE && (
            <>
              <div className="space-y-1">
                <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono transition-colors duration-300">FINANCE</p>
                <SidebarLink icon="fa-chart-simple" label="Analytics" active={activeTab === 'analytics' || activeTab === 'dashboard'} onClick={() => handleTabChange('analytics')} />
                <SidebarLink icon="fa-table-list" label="All Requests" active={activeTab === 'all-requests'} onClick={() => handleTabChange('all-requests')} />
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
                <SidebarLink icon="fa-users-gear" label="Users" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
              </div>

            </>
          )}
        </aside>

        <main className="app-main flex-1 p-8 overflow-auto transition-colors duration-300 bg-slate-50/50 dark:bg-slate-950">
          <Suspense fallback={<LoadingView />}>
            {renderContent()}
          </Suspense>
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
                timeline: inserted.timeline || [],
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
        <Suspense fallback={<LoadingView />}>
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
                    status_change_reason: updated.statusChangeReason || null,
                    ticket_cost: updated.ticketCost || null,
                    split_tickets: updated.travelLegs || null,
                    vendor_name: updated.vendorName || null,
                    invoice_url: updated.invoiceUrl || null,
                    timeline: newTimeline,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', updated.id);

                if (error) throw error;

                // Update local state
                const finalUpdated = { ...updated, timeline: newTimeline };
                setRequests(prev => prev.map(r => r.id === updated.id ? finalUpdated : r));
                setSelectedRequest(finalUpdated);
                toast.success("Request updated successfully");
              } catch (error: any) {
                console.error('Error updating request:', error);
                toast.error("Failed to update request: " + error.message);
              }
            }}
          />
        </Suspense>
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
                budget_code: data.budgetCode,
                vendor_name: data.vendorName,
                ticket_cost: parseFloat(data.ticketCost),
                split_tickets: data.travelLegs || null,
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
                  budgetCode: newRequest.budget_code,
                  vendorName: newRequest.vendor_name,
                  ticketCost: newRequest.ticket_cost,
                  travelLegs: newRequest.split_tickets || undefined,
                  pncStatus: PNCStatus.CLOSED,
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

const EmployeeDashboard = ({ requests, onNewRequest, onView, isWarningVisible, completeness, onViewProfile, user, meetupRequests = [], onNavigateToMeetup, isIgatpuriEnabled = false }: { requests: TravelRequest[], onNewRequest: (context?: any) => void, onView: (r: TravelRequest) => void, isWarningVisible: boolean, completeness: number, onViewProfile: () => void, user: User, meetupRequests: MeetupAvailabilityRequest[], onNavigateToMeetup: () => void, isIgatpuriEnabled?: boolean }) => {
  const [cancellationOwed, setCancellationOwed] = useState(0);
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

    if (r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED) {
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

    if (r.pncStatus === PNCStatus.BOOKED || r.pncStatus === PNCStatus.CLOSED) {
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
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Hey, <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">{user?.name?.split(' ')[0] || 'there'}!</span>
            </h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm md:text-base italic ml-1.5 border-l-2 border-indigo-200 dark:border-indigo-800 pl-3">
            "{welcomeNote}"
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
                { // Option 1: Midnight Sapphire
                  name: "Midnight Sapphire",
                  grad: "from-indigo-50/50 to-white dark:from-indigo-900/40 dark:to-slate-900",
                  badge: "text-indigo-600 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-500/10",
                  iconBg: "text-indigo-900 dark:text-white",
                  iconFg: "text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300",
                  review: "text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300",
                  shadow: "hover:shadow-indigo-500/10"
                },
                { // Option 2: Deep Emerald
                  name: "Deep Emerald",
                  grad: "from-emerald-50/50 to-white dark:from-emerald-900/40 dark:to-slate-900",
                  badge: "text-emerald-600 dark:text-emerald-400/80 bg-emerald-100 dark:bg-emerald-500/10",
                  iconBg: "text-emerald-900 dark:text-white",
                  iconFg: "text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
                  review: "text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300",
                  shadow: "hover:shadow-emerald-500/10"
                },
                { // Option 3: Amber Sunrise
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
          <div className="flex flex-wrap gap-2 bg-slate-150/40 dark:bg-slate-800/40 p-1.5 rounded-lg max-w-fit border border-slate-200/50 dark:border-slate-800/50">
            <button
              onClick={() => setPastRequestsTab('All')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                pastRequestsTab === 'All'
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
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    pastRequestsTab === status
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
                  <th className="px-8 py-6">Request ID</th>
                  <th className="px-8 py-6">Destination</th>
                  <th className="px-8 py-6">Travel Date</th>
                  <th className="px-8 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800 block md:table-row-group">
                {displayedClosedRequests.map((r: any) => {
                  const isMeetup = r.purpose === 'Igatpuri Meetup';
                  return (
                    <tr key={r.id} className="flex flex-col md:table-row hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group p-4 md:p-0">
                      <td className={`px-4 md:px-8 py-4 md:py-6 text-sm font-black uppercase tracking-widest ${isMeetup ? 'text-emerald-500' : 'text-indigo-500'} flex items-center justify-between md:table-cell gap-3`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMeetup ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-indigo-50 dark:bg-indigo-900/30'} group-hover:scale-110 transition-transform`}>
                            <i className={`fa-solid ${r.mode === 'Flight' ? 'fa-plane' : r.mode === 'Train' ? 'fa-train' : 'fa-bus'} text-sm`}></i>
                          </div>
                          {r.submissionId || r.id.substring(0, 8)}
                        </div>
                        <span className="md:hidden text-xs text-slate-400 font-bold">REQ ID</span>
                      </td>
                      <td className="px-4 md:px-8 py-3 md:py-6 flex items-center justify-between md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50">
                        <span className="md:hidden text-xs text-slate-400 font-bold uppercase tracking-widest">DESTINATION</span>
                        <div className="text-right md:text-left">
                          <p className={`text-sm font-black uppercase tracking-tight ${isMeetup ? 'text-emerald-600' : 'text-slate-800 dark:text-white'}`}>{r.to}</p>
                          {isMeetup && <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest mt-1"><i className="fa-solid fa-star mr-1"></i> Meetup</p>}
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-3 md:py-6 flex items-center justify-between md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50">
                        <span className="md:hidden text-xs text-slate-400 font-bold uppercase tracking-widest">TRAVEL DATE</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{new Date(r.dateOfTravel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </td>
                      <td className="px-4 md:px-8 py-3 md:py-6 flex items-center justify-between md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50">
                        <span className="md:hidden text-xs text-slate-400 font-bold uppercase tracking-widest">STATUS</span>
                        <StatusBadge type="pnc" value={r.pncStatus} />
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6 block md:table-cell border-t md:border-0 border-slate-100 dark:border-slate-800/50 md:text-right">
                        <button onClick={() => onView(r)} className={`w-full md:w-10 h-10 ${isMeetup ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600'} rounded-lg transition-all shadow-sm hover:shadow active:scale-95 border border-slate-200 dark:border-slate-700 hover:border-transparent flex items-center justify-center md:ml-auto group/btn`}>
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
        <div className="py-24 text-center text-slate-400 font-medium bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-800 shadow-sm transition-colors duration-300 italic">All caught up! No pending verifications.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all duration-300">
          {pending.map(u => (
            <div key={u.id} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg flex items-center gap-4 hover:shadow-lg hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all duration-300 cursor-pointer group">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-slate-800 rounded-lg flex items-center justify-center font-bold text-indigo-600 text-xl shadow-inner transition-colors duration-300 overflow-hidden">
                {u.avatar ? (
                  <img src={u.avatar} className="w-full h-full object-cover rounded-lg transition-all duration-300" />
                ) : u.passportPhoto?.fileUrl ? (
                  <img src={u.passportPhoto.fileUrl} className="w-full h-full object-cover rounded-lg transition-all duration-300" />
                ) : (
                  u.name.charAt(0)
                )}
              </div>
              <div className="flex-1 transition-colors duration-300">
                <h4 className="font-bold text-slate-800 dark:text-white transition-colors duration-300">{u.name}</h4>
                <p className="text-xs text-slate-500 font-medium transition-colors duration-300">Pending Docs: {[u.passportPhoto?.status === VerificationStatus.PENDING && 'Passport', u.idProof?.status === VerificationStatus.PENDING && 'ID Proof'].filter(Boolean).join(', ')}</p>
              </div>
              <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-xs font-bold active:scale-95 transition-all duration-300 shadow-lg shadow-indigo-600/10">Review Submission</button>
            </div>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedUser(null)}></div>
          <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <header className="px-10 py-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Review Submissions</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{selectedUser.name}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="text-xs font-medium text-slate-500">{selectedUser.email}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-3 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 border border-transparent hover:border-slate-100 dark:hover:border-slate-700"><i className="fa-solid fa-xmark text-xl"></i></button>
            </header>

            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Passport Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Passport Photo</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.passportPhoto?.fileUrl ? (
                    <>
                      <img src={selectedUser.passportPhoto.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.passportPhoto.fileUrl} target="_blank" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-indigo-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-camera text-4xl"></i><span className="text-xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.passportPhoto?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.passportStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
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
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.idProof?.fileUrl ? (
                    <>
                      <img src={selectedUser.idProof.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.idProof.fileUrl} target="_blank" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-violet-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-id-card text-4xl"></i><span className="text-xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.idProof?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.idStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
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
              <button onClick={() => setSelectedUser(null)} className="flex-1 py-4 text-slate-500 font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-sm">Cancel Review</button>
              <button
                onClick={handleSaveAll}
                className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-lg shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all text-sm uppercase tracking-widest"
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-lg space-y-8 shadow-sm transition-colors duration-300">
      <div className="flex items-center justify-between transition-colors duration-300">
        <div><h4 className="text-lg font-bold text-slate-800 dark:text-white transition-colors duration-300">Dark Mode</h4><p className="text-sm text-slate-500 font-medium transition-colors duration-300">Toggle application appearance for better viewing.</p></div>
        <Toggle active={isDarkMode} onChange={onToggleTheme} />
      </div>
      <div className="pt-8 border-t dark:border-slate-800 text-center text-xs font-bold text-slate-400 uppercase tracking-widest transition-colors duration-300">v2.5.0 Stable Build</div>
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
          <div className="w-16 h-16 rounded-lg overflow-hidden shadow-2xl shadow-indigo-600/30 relative z-10 bg-white dark:bg-slate-900">
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
          <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">Request ID</th><th className="px-6 py-5">Traveler</th><th className="px-6 py-5">Route</th><th className="px-6 py-5">Status</th></tr></thead>
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm transition-colors duration-300">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-700 transition-colors duration-300"><tr><th className="px-6 py-5">Request ID</th><th className="px-6 py-5">Destination</th><th className="px-6 py-5 text-right">Action</th></tr></thead>
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



export default App;
