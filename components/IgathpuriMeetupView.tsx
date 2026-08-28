import React, { useState, useEffect } from 'react';
import { MeetupAvailabilityRequest, User, TravelRequest, UserRole, PNCStatus } from '../types';
import Card from './Card';
import StatusBadge from './StatusBadge';
import Input from './Input';
import LocationCalendar from './LocationCalendar';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface IgathpuriMeetupViewProps {
  onNewRequest: (context?: any) => void;
  onCheckAvailability: () => void;
  availabilityRequests: MeetupAvailabilityRequest[];
  currentUser: User | null;
  onViewProfile: () => void;
  requests: TravelRequest[];
  onView: (r: TravelRequest) => void;
}

export const IgathpuriMeetupView: React.FC<IgathpuriMeetupViewProps> = ({
  onNewRequest,
  onCheckAvailability,
  availabilityRequests,
  currentUser,
  onViewProfile,
  requests,
  onView
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

      const colorMap: Record<string, { tab: string; badge: string; dot: string; empty: string }> = {
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
  const [attendeeDetails, setAttendeeDetails] = useState<{ email: string; name?: string; status: string; isBooked: boolean }[]>([]);
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
    if (activeMeetup?.attendeeEmails && activeMeetup.attendeeEmails.length > 0) {
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

export default IgathpuriMeetupView;
