import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  SosSeverity,
  SosCategory,
  SOS_SEVERITY_ICONS,
  getSosSpec,
  getSosSimpleTerms,
  getSosWhatToCheck,
  getSosDiagnosticSteps
} from '../utils/sos/catalog';
import {
  formatAlertSlackPayload,
  formatAlertResolvedSlackPayload,
  SLACK_SEVERITY_COLORS,
  SLACK_SEVERITY_PILLS
} from '../utils/sos/alertRules';
import {
  formatSlackNewRequest,
  formatSlackStatusChange,
  formatSlackRequestResolved
} from '../utils/desk/slackNotification';
import { sendSosTestAlert, sendNotificationTest } from '../utils/sos/sosService';
import { BlockKitPreview } from './slack/BlockKitPreview';

export type CardCategory = 'sos' | 'notifications';

export interface SlackCardStudioProps {
  currentUser?: any;
  defaultCategory?: CardCategory;
}

interface SosScenario {
  id: string;
  label: string;
  severity: SosSeverity;
  category: SosCategory;
  code: string;
  title: string;
  message: string;
  service: string;
  environment: string;
  occurrences: number;
  impact: string;
  stackSnippet: string;
  route?: string;
  userEmail?: string;
  isResolved?: boolean;
}

const SOS_SCENARIOS: SosScenario[] = [
  {
    id: 'db_pool',
    label: '🔴 Critical: DB Pool Exhausted',
    severity: 'critical',
    category: 'data',
    code: 'DB_POOL_EXHAUSTED',
    title: 'Database connection pool exhausted',
    message: 'remaining connection slots are reserved for non-replication superuser connections',
    service: 'travel-desk-db',
    environment: 'production',
    occurrences: 14,
    impact: 'Multiple concurrent requests failing',
    stackSnippet: 'PostgresError: remaining connection slots are reserved\n  at /app/server/db/pool.ts:48:12\n  at async handleRequest (/app/server/routes/attendance.ts:24:9)',
    route: '/api/v1/attendance',
    userEmail: 'multiple@navgurukul.org'
  },
  {
    id: 'smtp_auth',
    label: '🟠 High: SMTP Quota / Auth Failure',
    severity: 'high',
    category: 'email_transport',
    code: 'SMTP_AUTH_FAILED',
    title: 'SMTP account authentication failed',
    message: '535 5.7.8 Username and Password not accepted',
    service: 'travel-desk-worker',
    environment: 'production',
    occurrences: 3,
    impact: 'nitin.s@navgurukul.org (booking notifications paused)',
    stackSnippet: 'SmtpTransportError: 535 5.7.8 Username and Password not accepted\n  at SmtpClient.authenticate (/worker/smtp.ts:112:15)\n  at EmailQueue.sendWithSlot (/worker/queue.ts:89:7)',
    route: '/worker/email-queue',
    userEmail: 'nitin.s@navgurukul.org'
  },
  {
    id: 'chunk_fail',
    label: '🟡 Warning: Stale Chunk Load',
    severity: 'warning',
    category: 'platform',
    code: 'WEB_BUNDLE_CHUNK_FAILED',
    title: 'Stale chunk load error after deployment',
    message: 'Failed to fetch dynamically imported module: assets/SOSView-9c45c6d.js',
    service: 'travel-desk-web',
    environment: 'production',
    occurrences: 5,
    impact: '1 user (auto-recovered on reload)',
    stackSnippet: 'TypeError: Failed to fetch dynamically imported module\n  at loadRoute (bundle.js:142:18)\n  at navigateTo (/src/App.tsx:865:10)',
    route: '/?tab=sos',
    userEmail: 'employee@navgurukul.org'
  },
  {
    id: 'sos_test',
    label: '🔵 Info: SOS Connectivity Pulse',
    severity: 'info',
    category: 'platform',
    code: 'SOS_TEST_ALERT',
    title: 'SOS test alert',
    message: 'Dispatched manually from the Alerts & Notices console to verify Slack routing.',
    service: 'travel-desk-web',
    environment: 'production',
    occurrences: 1,
    impact: 'admin@navgurukul.org',
    stackSnippet: 'SOS_TEST_ALERT: manual test pulse triggered\n  at SOSView.handleTestAlert (/src/components/SOSView.tsx:512:7)',
    route: '/?tab=sos',
    userEmail: 'admin@navgurukul.org'
  },
  {
    id: 'sos_resolved',
    label: '✅ Resolved: Single-line Collapsed',
    severity: 'critical',
    category: 'data',
    code: 'DB_POOL_EXHAUSTED',
    title: 'Database connection pool exhausted',
    message: 'Resolved after scaling pool size.',
    service: 'travel-desk-db',
    environment: 'production',
    occurrences: 14,
    impact: 'Resolved',
    stackSnippet: '',
    isResolved: true
  }
];

interface NotificationScenario {
  id: string;
  label: string;
  ticket: string;
  who: string;
  dept: string;
  campus: string;
  trip: string;
  date: string;
  mode: string;
  priority: string;
  manager: string;
  status: string;
  note?: string;
  isResolved?: boolean;
}

const NOTIFICATION_SCENARIOS: NotificationScenario[] = [
  {
    id: 'flight_req',
    label: '✈️ Flight Request',
    ticket: 'TRV-O-261014-001',
    who: 'Nitin Sudarshan',
    dept: 'CEO Office',
    campus: 'Remote',
    trip: 'Pune ➔ Bengaluru',
    date: '15 Oct 2026',
    mode: 'Flight · Indigo 6E-204 (One-way)',
    priority: 'Urgent',
    manager: 'abhishek@navgurukul.org',
    status: 'Pending PNC',
    note: 'Executive quarterly review attendance (1 day to departure · <2d policy).'
  },
  {
    id: 'train_req',
    label: '🚆 Train Request',
    ticket: 'TRV-R-261014-002',
    who: 'Pooja Sharma',
    dept: 'Academics',
    campus: 'Dharamshala Campus',
    trip: 'Delhi ➔ Dharamshala',
    date: '20 Oct 2026',
    mode: 'Train · Vande Bharat 3AC (Round-trip)',
    priority: 'High',
    manager: 'nitin.s@navgurukul.org',
    status: 'Pending Manager Approval',
    note: 'Cohort curriculum orientation (6 days to departure · 2-10d policy).'
  },
  {
    id: 'bus_req',
    label: '🚌 Bus Request',
    ticket: 'TRV-B-261014-005',
    who: 'Rohan Verma',
    dept: 'Operations',
    campus: 'Pune Campus',
    trip: 'Pune ➔ Goa',
    date: '28 Oct 2026',
    mode: 'Bus · Volvo Multi-Axle AC Sleeper',
    priority: 'Normal',
    manager: 'anuradha@navgurukul.org',
    status: 'Pending PNC',
    note: 'Campus operational meetup coordination (14 days to departure · 10-20d policy).'
  },
  {
    id: 'approved_req',
    label: '🚕 Cab Status Update: Approved',
    ticket: 'TRV-O-261014-003',
    who: 'Priyanka Das',
    dept: 'Partnerships',
    campus: 'Mumbai Campus',
    trip: 'Mumbai ➔ Pune',
    date: '18 Oct 2026',
    mode: 'Cab · Sedan',
    priority: 'Normal',
    manager: 'anuradha@navgurukul.org',
    status: 'Approved by Manager',
    note: 'Approved. Cab vendor quotes can be secured.'
  },
  {
    id: 'booked_req',
    label: '🎫 Completed: Ticket Booked (Collapsed)',
    ticket: 'TRV-O-261012-009',
    who: 'Amit Kumar',
    dept: 'Tech Team',
    campus: 'Sarjapur Campus',
    trip: 'Bengaluru ➔ Hyderabad',
    date: '15 Oct 2026',
    mode: 'Flight · Indigo 6E-204',
    priority: 'High',
    manager: 'abhishek@navgurukul.org',
    status: 'Booked',
    isResolved: true
  }
];

export const SlackCardStudio: React.FC<SlackCardStudioProps> = ({
  currentUser,
  defaultCategory = 'sos'
}) => {
  const [category, setCategory] = useState<CardCategory>(defaultCategory);
  const [slackTheme, setSlackTheme] = useState<'dark' | 'light'>('dark');
  const [deliveryMode, setDeliveryMode] = useState<'block_kit' | 'workflow'>('block_kit');

  // Scenario selections
  const [selectedSosId, setSelectedSosId] = useState<string>(SOS_SCENARIOS[0].id);
  const [selectedNotifId, setSelectedNotifId] = useState<string>(NOTIFICATION_SCENARIOS[0].id);

  // Trace expansion toggle
  const [showFullStack, setShowFullStack] = useState<boolean>(false);

  // Live test state
  const [isSendingLiveTest, setIsSendingLiveTest] = useState<boolean>(false);

  const activeSos = useMemo(() => {
    return SOS_SCENARIOS.find(s => s.id === selectedSosId) || SOS_SCENARIOS[0];
  }, [selectedSosId]);

  const activeNotif = useMemo(() => {
    return NOTIFICATION_SCENARIOS.find(s => s.id === selectedNotifId) || NOTIFICATION_SCENARIOS[0];
  }, [selectedNotifId]);

  // Generate Block Kit payload directly from code utilities
  const generatedSosPayload = useMemo(() => {
    if (activeSos.isResolved) {
      return formatAlertResolvedSlackPayload(
        activeSos.title,
        currentUser?.name || 'Nitin Sudarshan',
        'Just now'
      );
    }

    return formatAlertSlackPayload(
      {
        code: activeSos.code,
        severity: activeSos.severity,
        category: activeSos.category,
        title: activeSos.title,
        message: activeSos.message,
        source: (activeSos.service.includes('worker') ? 'worker' : activeSos.service.includes('db') ? 'database' : 'web') as any,
        context: {
          stack: showFullStack ? activeSos.stackSnippet : activeSos.stackSnippet.split('\n').slice(0, 3).join('\n'),
          route: activeSos.route,
          userEmail: activeSos.userEmail
        }
      },
      {
        occurrences: activeSos.occurrences,
        environment: activeSos.environment,
        service: activeSos.service,
        portalUrl: 'https://ng-travel-desk.vercel.app'
      }
    );
  }, [activeSos, showFullStack, currentUser]);

  const generatedNotifPayload = useMemo(() => {
    if (activeNotif.isResolved) {
      return formatSlackRequestResolved(
        activeNotif.ticket,
        activeNotif.trip,
        'PNC Desk Team',
        activeNotif.status.includes('Booked') ? 'Booked' : 'Completed'
      );
    }

    if (activeNotif.id === 'approved_req') {
      return formatSlackStatusChange(
        activeNotif.ticket,
        activeNotif.trip,
        activeNotif.status,
        activeNotif.manager,
        {
          traveler: activeNotif.who,
          date: activeNotif.date,
          priority: activeNotif.priority,
          note: activeNotif.note
        }
      );
    }

    return formatSlackNewRequest(
      {
        submission_id: activeNotif.ticket,
        requester_name: activeNotif.who,
        requester_department: activeNotif.dept,
        requester_campus: activeNotif.campus,
        from_location: activeNotif.trip.split('➔')[0]?.trim() || 'Pune',
        to_location: activeNotif.trip.split('➔')[1]?.trim() || 'Bengaluru',
        date_of_travel: activeNotif.date,
        travel_mode: activeNotif.mode,
        priority: activeNotif.priority,
        approving_manager_email: activeNotif.manager,
        pnc_status: activeNotif.status
      },
      'https://ng-travel-desk.vercel.app'
    );
  }, [activeNotif]);

  const activeJson = useMemo(() => {
    return JSON.stringify(category === 'sos' ? generatedSosPayload : generatedNotifPayload, null, 2);
  }, [category, generatedSosPayload, generatedNotifPayload]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(activeJson);
    toast.success('Slack Block Kit JSON copied to clipboard!');
  };

  const handleSendLiveTest = async () => {
    const actorEmail = currentUser?.email || 'admin@navgurukul.org';
    try {
      setIsSendingLiveTest(true);
      if (category === 'sos') {
        const res = await sendSosTestAlert(actorEmail);
        if (res.recorded) {
          toast.success(res.delivered ? 'Test SOS alert sent to configured Slack channel!' : 'SOS test recorded (Slack channel disabled in settings).');
        } else {
          toast.error(res.reason || 'Could not dispatch SOS test.');
        }
      } else {
        const res = await sendNotificationTest(actorEmail);
        if (res.delivered) {
          toast.success('Test notification sent to configured Slack channel!');
        } else {
          toast.error(res.reason || 'Could not dispatch notification test.');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch live test.');
    } finally {
      setIsSendingLiveTest(false);
    }
  };

  // Triage details for the current SOS alert
  const sosSpec = getSosSpec(activeSos.code);
  const simpleTerms = getSosSimpleTerms(activeSos.code, activeSos.message);
  const whatToCheck = getSosWhatToCheck(activeSos.code);
  const diagnosticSteps = getSosDiagnosticSteps(activeSos.code, {
    route: activeSos.route,
    userEmail: activeSos.userEmail,
    source: activeSos.service
  });

  const sosColor = SLACK_SEVERITY_COLORS[activeSos.severity] || '#64748B';
  const sosPill = SLACK_SEVERITY_PILLS[activeSos.severity] || ':warning: Warning';

  const notifColor =
    activeNotif.status === 'Booked' ? '#10B981' :
    activeNotif.priority.toLowerCase() === 'urgent' ? '#E24B4A' :
    activeNotif.priority.toLowerCase() === 'high' ? '#EF9F27' :
    activeNotif.status.includes('Approved') ? '#3B82F6' : '#176AE6';

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 text-white shadow-lg border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <i className="fa-solid fa-eye mr-1.5"></i> Card Previews
            </span>
            <span className="text-xs text-slate-400">
              Direct rendering of production Slack card layouts
            </span>
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">
            Slack Card Design Showcase
          </h1>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyJson}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95 flex items-center gap-2"
          >
            <i className="fa-regular fa-copy"></i>
            Copy Block Kit JSON
          </button>
          <button
            onClick={handleSendLiveTest}
            disabled={isSendingLiveTest}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <i className={`fa-solid ${isSendingLiveTest ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
            Send Live to Slack
          </button>
        </div>
      </div>

      {/* Mode Navigation & Slack Environment Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-950 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setCategory('sos')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
              category === 'sos'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-tower-broadcast"></i>
            SOS Error Cards
          </button>
          <button
            onClick={() => setCategory('notifications')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
              category === 'notifications'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-bell"></i>
            Desk Notification Cards
          </button>
        </div>

        {/* Theme and Format Switchers */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setSlackTheme('dark')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                slackTheme === 'dark'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="fa-solid fa-moon text-indigo-400"></i> Dark
            </button>
            <button
              onClick={() => setSlackTheme('light')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                slackTheme === 'light'
                  ? 'bg-amber-100 text-amber-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="fa-solid fa-sun text-amber-500"></i> Light
            </button>
          </div>

          <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setDeliveryMode('block_kit')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                deliveryMode === 'block_kit'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Slack App incoming webhook (/services/...) with colored left bar"
            >
              Block Kit
            </button>
            <button
              onClick={() => setDeliveryMode('workflow')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                deliveryMode === 'workflow'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Workflow Builder fallback text (/triggers/...)"
            >
              Workflow Text
            </button>
          </div>
        </div>
      </div>

      {/* Scenario Pill Buttons */}
      <div className="space-y-1.5">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Select Card Design:
        </p>
        <div className="flex flex-wrap gap-2">
          {category === 'sos' ? (
            SOS_SCENARIOS.map(s => {
              const active = selectedSosId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSosId(s.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {s.label}
                </button>
              );
            })
          ) : (
            NOTIFICATION_SCENARIOS.map(s => {
              const active = selectedNotifId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedNotifId(s.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {s.label}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Two-Column View: Authentic Slack Card on the left, Triage & JSON on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Authentic Slack Card Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>
              Slack View ({category === 'sos' ? '#alert-team-automation' : '#alert-traveldesk-notifications'})
            </span>
            <span className="font-normal font-mono text-[11px] text-slate-400">
              {deliveryMode === 'block_kit' ? 'Block Kit Attachment' : 'Plain Text'}
            </span>
          </div>

          <div
            className={`rounded-xl overflow-hidden border ${
              slackTheme === 'dark' ? 'border-[#2C3136]' : 'border-slate-200'
            }`}
          >
            {/* Slack Header */}
            <div
              className={`px-4 py-2.5 border-b flex items-center justify-between text-xs font-bold ${
                slackTheme === 'dark'
                  ? 'bg-[#1F2328] border-[#2C3136] text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono">#</span>
                <span>{category === 'sos' ? 'alert-team-automation' : 'alert-traveldesk-notifications'}</span>
              </div>
              <span className="text-slate-400 text-[11px] font-normal">
                <i className="fa-solid fa-lock text-[9px] mr-1"></i> internal
              </span>
            </div>

            {/* The frame is the simulated channel. What sits inside it is drawn
                with only what Slack's API can express -- see BlockKitPreview. */}
            <BlockKitPreview
              payload={category === 'sos' ? generatedSosPayload : generatedNotifPayload}
              theme={slackTheme}
              appName={category === 'sos' ? 'Travel Desk Alert' : 'Travel Desk Notification'}
              asWorkflowText={deliveryMode !== 'block_kit'}
            />
          </div>
        </div>

        {/* Right Column: Triage Info & Block Kit JSON Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {category === 'sos' && (
            <div className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i className="fa-solid fa-stethoscope text-indigo-500"></i>
                Triage Details for this Alert
              </h2>

              {/* In Simple Terms */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 space-y-1">
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  <i className="fa-solid fa-lightbulb text-amber-500 mr-1.5"></i>
                  What it is (in simple terms)
                </p>
                <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {simpleTerms}
                </p>
                {sosSpec?.meaning && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-1.5 border-t border-amber-200/60 dark:border-amber-900/40">
                    <strong>Why it matters:</strong> {sosSpec.meaning}
                  </p>
                )}
              </div>

              {/* What to check */}
              <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-400">
                  <i className="fa-solid fa-list-check text-indigo-500 mr-1.5"></i>
                  What to check (Triage Checklist)
                </p>
                <ul className="space-y-1.5">
                  {whatToCheck.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200 leading-snug">
                      <span className="w-4 h-4 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-[9px] flex-shrink-0 mt-0.5 font-black">
                        ✓
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Diagnostic steps */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <i className="fa-solid fa-route text-sky-500 mr-1.5"></i>
                  Diagnostic Steps & Log Path
                </p>
                <ol className="space-y-1.5">
                  {diagnosticSteps.map((step, idx) => (
                    <li key={idx} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Block Kit JSON Inspector */}
          <div className="p-4 rounded-2xl bg-slate-900 text-slate-200 space-y-2.5 font-mono text-xs border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                <i className="fa-solid fa-code mr-1.5 text-indigo-400"></i>
                Block Kit Payload JSON
              </span>
              <button
                onClick={handleCopyJson}
                className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 transition-colors"
              >
                Copy JSON
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-black/60 text-[11px] text-emerald-400 max-h-64 overflow-y-auto leading-relaxed border border-slate-800">
              <code>{activeJson}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlackCardStudio;
