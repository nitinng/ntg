
import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import {
  TravelRequest, PNCStatus, Priority, TravelMode, UserRole, User, TripType, ApprovalStatus, PolicyConfig, VerificationStatus, IdProofType, PaymentStatus, UserDocument, TravelModePolicy, MeetupAvailabilityRequest, Department, TestingSettings
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
import { queueEmailsForTransition } from './utils/emailQueueUtils';
import { calculateProfileCompleteness, isUserVerified, isAppLockedForUser } from './utils/verificationUtils';

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
const DepartmentManagement = React.lazy(() => import('./components/DepartmentManagement').then(module => ({ default: module.DepartmentManagement })));
const TestingSettingsView = React.lazy(() => import('./components/TestingSettingsView').then(module => ({ default: module.TestingSettingsView })));
const FinanceDashboard = React.lazy(() => import('./components/FinanceDashboard'));
const ManagerApprovalsView = React.lazy(() => import('./components/ManagerApprovalsView'));
const PolicyManagement = React.lazy(() => import('./components/PolicyManagement'));
const LocationCalendar = React.lazy(() => import('./components/LocationCalendar'));
const RequestDetailOverlay = React.lazy(() => import('./components/RequestDetailOverlay'));
const EmployeeGuideView = React.lazy(() => import('./components/EmployeeGuideView'));

import { mapDbRequest } from './services/requestMapper';
import { checkPolicyViolation } from './utils/policyUtils';

import IgathpuriAvailabilityModal from './components/IgathpuriAvailabilityModal';
import LoadingView from './components/LoadingView';
import EmployeeDashboard from './components/EmployeeDashboard';

const IgathpuriMeetupView = React.lazy(() => import('./components/IgathpuriMeetupView'));
const UserRoleManagement = React.lazy(() => import('./components/UserRoleManagement'));
const OnboardingView = React.lazy(() => import('./components/OnboardingView'));
const AnalyticsView = React.lazy(() => import('./components/AnalyticsView'));
const MeetupApprovalsView = React.lazy(() => import('./components/MeetupApprovalsView'));
const VerificationQueue = React.lazy(() => import('./components/VerificationQueue'));
const SettingsView = React.lazy(() => import('./components/SettingsView'));
const AdminQueueView = React.lazy(() => import('./components/AdminQueueView'));
const PastRequestsView = React.lazy(() => import('./components/PastRequestsView'));
const SentMailsView = React.lazy(() => import('./components/SentMailsView'));

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
  const [editingRequest, setEditingRequest] = useState<TravelRequest | null>(null);
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [testingSettings, setTestingSettings] = useState<TestingSettings>({
    admin: true,
    pnc: true,
    employee: true
  });

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
          const mappedReqs = reqs.map((r: any) => mapDbRequest(r));
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
            .in('setting_key', ['is_igatpuri_enabled', 'is_chat_enabled', 'is_email_login_enabled', 'policy_config', 'testing_mandatory_toggles']);

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
            const testingMandatorySetting = settingsData.find(s => s.setting_key === 'testing_mandatory_toggles');
            if (testingMandatorySetting && testingMandatorySetting.setting_value) {
              setTestingSettings(testingMandatorySetting.setting_value);
            }
          }
        };

        const fetchDepartments = async () => {
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('*')
            .order('name', { ascending: true });

          if (!deptError && deptData) {
            setDepartments(deptData.map((d: any) => ({
              id: d.id,
              name: d.name,
              hod_name: d.hod_name,
              created_at: d.created_at,
              updated_at: d.updated_at
            })));
          }
        };

        await Promise.all([
          fetchTravelRequests(),
          fetchAllUsers(),
          fetchMeetups(),
          fetchPolicies(),
          fetchSettings(),
          fetchDepartments()
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

  const isLocked = useMemo(() => {
    return isAppLockedForUser(currentUser, policy);
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
            isWarningVisible={!isUserVerified(currentUser, policy) && !policy.isEnforcementEnabled}
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
        return <MailTemplatesView currentUserRole={currentUser.role} currentUser={currentUser} />;
      case 'sent-mails':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <SentMailsView currentUser={currentUser} onTabChange={handleTabChange} />;
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
      case 'departments':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <DepartmentManagement departments={departments} setDepartments={setDepartments} />;
      case 'testing-settings':
        if (currentUser.role === UserRole.EMPLOYEE) return renderDashboard();
        return <TestingSettingsView settings={testingSettings} onUpdateSettings={setTestingSettings} />;
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
            <OnboardingView user={currentUser!} policy={policy} onUpdate={handleUpdateUser} isLock={false} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} onLogout={() => { sessionStorage.removeItem('activeTab'); sessionStorage.removeItem('currentRole'); setActiveTab('dashboard'); supabase.auth.signOut(); }} departments={departments} />
          </div>
        );
      case 'settings':
        return <SettingsView isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} />;
      case 'guide':
        return <EmployeeGuideView onTabChange={handleTabChange} policies={travelModePolicies} />;
      case 'approvals':
        if (currentUser.role === UserRole.EMPLOYEE) {
          const pendingApprovals = requests.filter(r => r.approvingManagerEmail === currentUser?.email && r.pncStatus === PNCStatus.APPROVAL_PENDING);
          return <ManagerApprovalsView
            requests={pendingApprovals}
            currentUser={currentUser}
            onUpdate={async (updatedReq: TravelRequest, newStatus: PNCStatus, rejectReason?: string) => {
              try {
                const reason = rejectReason || 'Manager Action';
                const newTimeline = [
                  ...updatedReq.timeline,
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    actor: currentUser.name,
                    event: `Status changed to: ${newStatus}`,
                    details: reason
                  }
                ];

                const { error } = await supabase
                  .from('travel_requests')
                  .update({
                    pnc_status: newStatus,
                    status_change_reason: reason,
                    timeline: newTimeline
                  })
                  .eq('id', updatedReq.id);

                if (error) throw error;

                const updated = {
                  ...updatedReq,
                  pncStatus: newStatus,
                  statusChangeReason: reason,
                  timeline: newTimeline
                };

                setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                toast.success(`Request ${newStatus === PNCStatus.APPROVED ? 'Approved' : 'Rejected'}`);

                // Queue emails
                await queueEmailsForTransition(updated, updatedReq.pncStatus, newStatus);

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
            <h1 className="font-bold tracking-tight text-slate-800 dark:text-white">NG Travel Desk</h1>
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
            departments={departments}
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

      <div className="flex-1 flex flex-col md:flex-row transition-colors duration-300">
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
                <SidebarLink icon="fa-book" label="Employee Guide" active={activeTab === 'guide'} onClick={() => handleTabChange('guide')} />
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
                <SidebarLink icon="fa-paper-plane" label="Sent Mails" active={activeTab === 'sent-mails'} onClick={() => handleTabChange('sent-mails')} />
                <SidebarLink icon="fa-id-card-clip" label="Verification" active={activeTab === 'verification'} onClick={() => handleTabChange('verification')} badge={users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING).length || null} />
                <SidebarLink icon="fa-shield-halved" label="Policies" active={activeTab === 'policies'} onClick={() => handleTabChange('policies')} />
                <SidebarLink icon="fa-users-gear" label="Users" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
                <SidebarLink icon="fa-building" label="Departments" active={activeTab === 'departments'} onClick={() => handleTabChange('departments')} />
                <SidebarLink icon="fa-sliders" label="Testing Settings" active={activeTab === 'testing-settings'} onClick={() => handleTabChange('testing-settings')} />
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
                <SidebarLink icon="fa-paper-plane" label="Sent Mails" active={activeTab === 'sent-mails'} onClick={() => handleTabChange('sent-mails')} />
                <SidebarLink icon="fa-id-card-clip" label="Verification" active={activeTab === 'verification'} onClick={() => handleTabChange('verification')} badge={users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING).length || null} />
                <SidebarLink icon="fa-shield-halved" label="Policies" active={activeTab === 'policies'} onClick={() => handleTabChange('policies')} />
                <SidebarLink icon="fa-users-gear" label="Users" active={activeTab === 'role-management'} onClick={() => handleTabChange('role-management')} />
                <SidebarLink icon="fa-building" label="Departments" active={activeTab === 'departments'} onClick={() => handleTabChange('departments')} />
                <SidebarLink icon="fa-sliders" label="Testing Settings" active={activeTab === 'testing-settings'} onClick={() => handleTabChange('testing-settings')} />
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
            setEditingRequest(null);
          }}
          currentUser={currentUser!}
          policies={travelModePolicies}
          meetupContext={meetupContext}
          departments={departments}
          testingSettings={testingSettings}
          isEditMode={!!editingRequest}
          initialData={editingRequest}
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

              if (editingRequest) {
                // Edit & Resubmit Flow
                const newResubmissionCount = (editingRequest.resubmissionCount || 0) + 1;

                const updatedPayload = {
                  requester_name: data.requesterName || currentUser!.name,
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

                  // Resubmission resets state to NOT_STARTED per life-cycle flow
                  pnc_status: PNCStatus.NOT_STARTED,
                  resubmission_count: newResubmissionCount,
                  status_change_reason: `Resubmission (Attempt ${newResubmissionCount})`,
                  cancelled_reason: null,
                  info_requested: null,
                  employee_response: null,
                  on_hold_since: null,
                  has_violation: isViolated,
                  violation_reason: isViolated ? (data.violationReason || 'Advance booking policy violation') : null,
                  timeline: [
                    ...editingRequest.timeline,
                    {
                      id: Date.now().toString(),
                      timestamp: new Date().toISOString(),
                      actor: currentUser!.name,
                      event: `Request Resubmitted`,
                      details: `Resubmitted request (Attempt ${newResubmissionCount})`
                    }
                  ],
                  updated_at: new Date().toISOString()
                };

                const { data: updatedRow, error: updateError } = await supabase
                  .from('travel_requests')
                  .update(updatedPayload)
                  .eq('id', editingRequest.id)
                  .select()
                  .single();

                if (updateError) throw updateError;

                const mappedUpdated = mapDbRequest(updatedRow);

                // Auto-advance logic:
                // From NOT_STARTED, if violation -> Approval Pending, else -> Processing
                const nextStatus = isViolated ? PNCStatus.APPROVAL_PENDING : PNCStatus.PROCESSING;
                const { data: autoAdvancedRow, error: autoAdvancedError } = await supabase
                  .from('travel_requests')
                  .update({
                    pnc_status: nextStatus,
                    status_change_reason: isViolated ? 'Auto-advanced due to policy violation' : 'Auto-advanced: no policy violation',
                    updated_at: new Date().toISOString(),
                    timeline: [
                      ...mappedUpdated.timeline,
                      {
                        id: (Date.now() + 1).toString(),
                        timestamp: new Date().toISOString(),
                        actor: 'System',
                        event: `Status changed to: ${nextStatus}`,
                        details: isViolated ? 'Auto-advanced due to policy violation' : 'Auto-advanced: no policy violation'
                      }
                    ]
                  })
                  .eq('id', editingRequest.id)
                  .select()
                  .single();

                if (autoAdvancedError) throw autoAdvancedError;

                const finalRequest = mapDbRequest(autoAdvancedRow);

                setRequests(prev => prev.map(r => r.id === editingRequest.id ? finalRequest : r));
                if (selectedRequest && selectedRequest.id === editingRequest.id) {
                  setSelectedRequest(finalRequest);
                }

                setIsNewRequestModalOpen(false);
                setEditingRequest(null);
                toast.success("Request resubmitted successfully!");

                // Queue emails
                await queueEmailsForTransition(mappedUpdated, null, PNCStatus.NOT_STARTED);
                await queueEmailsForTransition(finalRequest, PNCStatus.NOT_STARTED, nextStatus);

              } else {
                // Insert New Request Flow
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
                  booked_by: 'PNC'
                };

                const { data: inserted, error } = await supabase
                  .from('travel_requests')
                  .insert(newRequest)
                  .select()
                  .single();

                if (error) throw error;

                const mappedInserted = mapDbRequest(inserted);

                // Auto-advance logic:
                const nextStatus = isViolated ? PNCStatus.APPROVAL_PENDING : PNCStatus.PROCESSING;
                const { data: autoAdvancedRow, error: autoAdvancedError } = await supabase
                  .from('travel_requests')
                  .update({
                    pnc_status: nextStatus,
                    status_change_reason: isViolated ? 'Auto-advanced due to policy violation' : 'Auto-advanced: no policy violation',
                    updated_at: new Date().toISOString(),
                    timeline: [
                      ...mappedInserted.timeline,
                      {
                        id: (Date.now() + 1).toString(),
                        timestamp: new Date().toISOString(),
                        actor: 'System',
                        event: `Status changed to: ${nextStatus}`,
                        details: isViolated ? 'Auto-advanced due to policy violation' : 'Auto-advanced: no policy violation'
                      }
                    ]
                  })
                  .eq('id', inserted.id)
                  .select()
                  .single();

                if (autoAdvancedError) throw autoAdvancedError;

                const finalRequest = mapDbRequest(autoAdvancedRow);

                setRequests(prev => [finalRequest, ...prev]);
                setIsNewRequestModalOpen(false);
                toast.success("Travel request saved and auto-advanced");

                // Queue emails
                await queueEmailsForTransition(mappedInserted, null, PNCStatus.NOT_STARTED);
                await queueEmailsForTransition(finalRequest, PNCStatus.NOT_STARTED, nextStatus);
              }
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
            onEdit={(req) => {
              setSelectedRequest(null);
              setEditingRequest(req);
              setIsNewRequestModalOpen(true);
            }}
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
                    updated_at: new Date().toISOString(),
                    info_requested: updated.infoRequested || null,
                    employee_response: updated.employeeResponse || null,
                    on_hold_since: updated.onHoldSince || null,
                    resubmission_count: updated.resubmissionCount || 0,
                    cancelled_reason: updated.cancelledReason || null,
                    advance_id: updated.advanceId || null
                  })
                  .eq('id', updated.id);

                if (error) throw error;

                // Update local state
                const finalUpdated = mapDbRequest({
                  ...updated,
                  timeline: newTimeline
                });
                setRequests(prev => prev.map(r => r.id === updated.id ? finalUpdated : r));
                setSelectedRequest(finalUpdated);
                toast.success("Request updated successfully");

                // Queue emails if status changed
                if (statusChanged) {
                  await queueEmailsForTransition(finalUpdated, selectedRequest.pncStatus, updated.pncStatus);
                }
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
          departments={departments}
          testingSettings={testingSettings}
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


export default App;
