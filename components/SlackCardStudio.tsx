import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import Card from './Card';
import { Toggle } from './Toggle';
import {
  SosSeverity,
  SosCategory,
  SOS_SEVERITY_ICONS,
  SOS_SEVERITY_LABELS,
  SOS_CATEGORY_LABELS,
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
  formatSlackRequestResolved,
  formatSlackNotificationTest
} from '../utils/desk/slackNotification';
import { formatSlackDigestPayload } from '../utils/desk/slackDigest';
import { sendSosTestAlert, sendNotificationTest } from '../utils/sos/sosService';

export type CardCategory = 'sos' | 'notifications';

export interface SlackCardStudioProps {
  currentUser?: any;
  defaultCategory?: CardCategory;
}

interface SosPreset {
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
}

const SOS_PRESETS: SosPreset[] = [
  {
    id: 'db_pool',
    label: '🔴 Critical: DB Pool Exhaustion',
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
    label: '🟠 High / Error: SMTP Quota / Auth Failure',
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
    label: '🟡 Warning: Bundle Chunk Load Failure',
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
    label: '🔵 Info: SOS Connectivity Test',
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
  }
];

interface NotificationPreset {
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

const NOTIFICATION_PRESETS: NotificationPreset[] = [
  {
    id: 'urgent_req',
    label: '🚨 Urgent: Pune ➔ Bengaluru Flight',
    ticket: 'TRV-O-261014-001',
    who: 'Nitin Sudarshan',
    dept: 'CEO Office',
    campus: 'Remote',
    trip: 'Pune ➔ Bengaluru',
    date: '16 Oct 2026',
    mode: 'Flight (One-way)',
    priority: 'Urgent',
    manager: 'abhishek@navgurukul.org',
    status: 'Pending PNC',
    note: 'Board meeting attendance required at Bengaluru HQ.'
  },
  {
    id: 'normal_req',
    label: '✈️ Normal: Delhi ➔ Dharamshala Train',
    ticket: 'TRV-R-261014-002',
    who: 'Pooja Sharma',
    dept: 'Academics',
    campus: 'Dharamshala Campus',
    trip: 'Delhi ➔ Dharamshala',
    date: '20 Oct 2026',
    mode: 'Train · 3AC (Round-trip)',
    priority: 'Normal',
    manager: 'nitin.s@navgurukul.org',
    status: 'Pending Manager Approval'
  },
  {
    id: 'approved_req',
    label: '✅ Status Update: Approved by Manager',
    ticket: 'TRV-O-261014-003',
    who: 'Rohan Verma',
    dept: 'Operations',
    campus: 'Pune Campus',
    trip: 'Pune ➔ Mumbai',
    date: '18 Oct 2026',
    mode: 'Cab · Sedan',
    priority: 'Normal',
    manager: 'anuradha@navgurukul.org',
    status: 'Approved by Manager',
    note: 'Approved. Vendor quotes can be secured.'
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

  // SOS state
  const [selectedSosPresetId, setSelectedSosPresetId] = useState<string>(SOS_PRESETS[0].id);
  const [sosOverride, setSosOverride] = useState<SosPreset>(SOS_PRESETS[0]);
  const [sosResolved, setSosResolved] = useState<boolean>(false);
  const [sosFullStack, setSosFullStack] = useState<boolean>(false);

  // Notification state
  const [selectedNotifPresetId, setSelectedNotifPresetId] = useState<string>(NOTIFICATION_PRESETS[0].id);
  const [notifOverride, setNotifOverride] = useState<NotificationPreset>(NOTIFICATION_PRESETS[0]);
  const [notifResolved, setNotifResolved] = useState<boolean>(false);

  // Live test sending state
  const [isSendingLiveTest, setIsSendingLiveTest] = useState<boolean>(false);

  const handleSelectSosPreset = (id: string) => {
    const found = SOS_PRESETS.find(p => p.id === id);
    if (found) {
      setSelectedSosPresetId(id);
      setSosOverride({ ...found });
      setSosResolved(false);
      setSosFullStack(false);
    }
  };

  const handleSelectNotifPreset = (id: string) => {
    const found = NOTIFICATION_PRESETS.find(p => p.id === id);
    if (found) {
      setSelectedNotifPresetId(id);
      setNotifOverride({ ...found });
      setNotifResolved(Boolean(found.isResolved));
    }
  };

  // SOS Card payload generator
  const generatedSosPayload = useMemo(() => {
    if (sosResolved) {
      return formatAlertResolvedSlackPayload(
        sosOverride.title,
        currentUser?.name || 'Nitin Sudarshan',
        'Just now'
      );
    }

    return formatAlertSlackPayload(
      {
        code: sosOverride.code,
        severity: sosOverride.severity,
        category: sosOverride.category,
        title: sosOverride.title,
        message: sosOverride.message,
        source: (sosOverride.service.includes('worker') ? 'worker' : sosOverride.service.includes('db') ? 'database' : 'web') as any,
        context: {
          stack: sosFullStack ? sosOverride.stackSnippet : sosOverride.stackSnippet.split('\n').slice(0, 3).join('\n'),
          route: sosOverride.route,
          userEmail: sosOverride.userEmail
        }
      },
      {
        occurrences: sosOverride.occurrences,
        environment: sosOverride.environment,
        service: sosOverride.service,
        portalUrl: 'https://ng-travel-desk.vercel.app'
      }
    );
  }, [sosOverride, sosResolved, sosFullStack, currentUser]);

  // Notification Card payload generator
  const generatedNotifPayload = useMemo(() => {
    if (notifResolved) {
      return formatSlackRequestResolved(
        notifOverride.ticket,
        notifOverride.trip,
        'PNC Desk Team',
        notifOverride.status.includes('Booked') ? 'Booked' : 'Completed'
      );
    }

    if (notifOverride.id === 'approved_req') {
      return formatSlackStatusChange(
        notifOverride.ticket,
        notifOverride.trip,
        notifOverride.status,
        notifOverride.manager,
        {
          traveler: notifOverride.who,
          date: notifOverride.date,
          priority: notifOverride.priority,
          note: notifOverride.note
        }
      );
    }

    return formatSlackNewRequest(
      {
        submission_id: notifOverride.ticket,
        requester_name: notifOverride.who,
        requester_department: notifOverride.dept,
        requester_campus: notifOverride.campus,
        from_location: notifOverride.trip.split('➔')[0]?.trim() || 'Pune',
        to_location: notifOverride.trip.split('➔')[1]?.trim() || 'Bengaluru',
        date_of_travel: notifOverride.date,
        travel_mode: notifOverride.mode,
        priority: notifOverride.priority,
        approving_manager_email: notifOverride.manager,
        pnc_status: notifOverride.status
      },
      'https://ng-travel-desk.vercel.app'
    );
  }, [notifOverride, notifResolved]);

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
  const sosSpec = getSosSpec(sosOverride.code);
  const simpleTerms = getSosSimpleTerms(sosOverride.code, sosOverride.message);
  const whatToCheck = getSosWhatToCheck(sosOverride.code);
  const diagnosticSteps = getSosDiagnosticSteps(sosOverride.code, {
    route: sosOverride.route,
    userEmail: sosOverride.userEmail,
    source: sosOverride.service
  });

  // Current Card Accent Colors
  const sosColor = SLACK_SEVERITY_COLORS[sosOverride.severity] || '#64748B';
  const sosPill = SLACK_SEVERITY_PILLS[sosOverride.severity] || ':warning: Warning';

  const notifColor =
    notifOverride.status === 'Booked' ? '#10B981' :
    notifOverride.priority.toLowerCase() === 'urgent' ? '#E24B4A' :
    notifOverride.priority.toLowerCase() === 'high' ? '#EF9F27' :
    notifOverride.status.includes('Approved') ? '#3B82F6' : '#176AE6';

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-500/30 border border-indigo-400/40 text-indigo-200">
              <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i> Card Design Studio
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-purple-500/20 text-purple-200 border border-purple-400/30">
              Slack Block Kit & Workflow
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Slack Card Design Studio & Visual Simulator
          </h1>
          <p className="text-sm text-indigo-200/90 max-w-2xl">
            Preview, test, and tune the scannable Slack card designs for both <strong className="text-white">SOS Alerts</strong> and <strong className="text-white">Travel Desk Notifications</strong>.
            Inspect the colored left bar, 4-field triage grid, truncated stack trace, collapsed resolved state, and Block Kit JSON payloads.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyJson}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <i className="fa-regular fa-copy"></i>
            Copy Block Kit JSON
          </button>
          <button
            onClick={handleSendLiveTest}
            disabled={isSendingLiveTest}
            className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <i className={`fa-solid ${isSendingLiveTest ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
            Send Live to Slack
          </button>
        </div>
      </div>

      {/* Main Mode Navigation (SOS vs Notifications) & Settings Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-2 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-950 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setCategory('sos')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
              category === 'sos'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-tower-broadcast"></i>
            SOS Error Alert Cards
          </button>
          <button
            onClick={() => setCategory('notifications')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
              category === 'notifications'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-bell"></i>
            Travel Desk Notifications
          </button>
        </div>

        {/* View Mode & Theme Controls */}
        <div className="flex items-center gap-3 px-2">
          {/* Theme switcher */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setSlackTheme('dark')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                slackTheme === 'dark'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="fa-solid fa-moon text-indigo-400"></i> Slack Dark
            </button>
            <button
              onClick={() => setSlackTheme('light')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                slackTheme === 'light'
                  ? 'bg-amber-100 text-amber-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="fa-solid fa-sun text-amber-500"></i> Slack Light
            </button>
          </div>

          {/* Delivery format switcher */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setDeliveryMode('block_kit')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                deliveryMode === 'block_kit'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Slack App incoming webhook rendering Block Kit cards with colored sidebars"
            >
              Block Kit Card
            </button>
            <button
              onClick={() => setDeliveryMode('workflow')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                deliveryMode === 'workflow'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Slack Workflow Builder webhook rendering formatted plain-text variables"
            >
              Workflow Text
            </button>
          </div>
        </div>
      </div>

      {/* Preset Selector Bar */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <i className="fa-solid fa-sliders text-indigo-500"></i>
          Select Scenario Preset:
        </p>
        <div className="flex flex-wrap gap-2">
          {category === 'sos' ? (
            SOS_PRESETS.map(preset => {
              const active = selectedSosPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectSosPreset(preset.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })
          ) : (
            NOTIFICATION_PRESETS.map(preset => {
              const active = selectedNotifPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectNotifPreset(preset.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Two-Column Layout: Left = Authentic Slack Simulator, Right = Triage & Customizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Authentic Slack UI Simulator (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <i className="fa-brands fa-slack text-indigo-500 text-base"></i>
              Slack Channel Simulator
              <span className="text-[10px] font-mono text-slate-400 font-normal">
                ({category === 'sos' ? '#alerts-sos' : '#alert-team-automation'})
              </span>
            </h2>

            {/* Quick interactive status toggle */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium text-[11px]">Preview State:</span>
              <button
                onClick={() => category === 'sos' ? setSosResolved(false) : setNotifResolved(false)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                  !(category === 'sos' ? sosResolved : notifResolved)
                    ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                    : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
              >
                Active Card
              </button>
              <button
                onClick={() => category === 'sos' ? setSosResolved(true) : setNotifResolved(true)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                  (category === 'sos' ? sosResolved : notifResolved)
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
              >
                Collapsed / Resolved
              </button>
            </div>
          </div>

          {/* Authentic Slack Window Container */}
          <div
            className={`rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
              slackTheme === 'dark'
                ? 'bg-[#1A1D21] border-[#2C3136] text-[#D1D2D3]'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            {/* Slack Channel Header Bar */}
            <div
              className={`px-4 py-3 border-b flex items-center justify-between text-xs font-bold select-none ${
                slackTheme === 'dark'
                  ? 'bg-[#1F2328] border-[#2C3136] text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-slate-400 font-mono text-sm">#</span>
                <span className="tracking-wide">
                  {category === 'sos' ? 'alerts-sos' : 'alert-team-automation'}
                </span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-200/50 dark:bg-slate-800 text-slate-500">
                  <i className="fa-solid fa-lock text-[9px] mr-1"></i> internal
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <span><i className="fa-solid fa-user-group mr-1"></i> 18</span>
                <i className="fa-solid fa-magnifying-glass"></i>
              </div>
            </div>

            {/* Message Thread Body */}
            <div className="p-4 sm:p-5 space-y-4">
              {/* Message Item */}
              <div className="flex items-start gap-3">
                {/* Bot Avatar */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-black text-sm shadow-sm ${
                    category === 'sos' ? 'bg-rose-600' : 'bg-indigo-600'
                  }`}
                >
                  <i className={`fa-solid ${category === 'sos' ? 'fa-tower-broadcast' : 'fa-paper-plane'}`}></i>
                </div>

                {/* Message Content Area */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Bot Name, APP badge, Timestamp */}
                  <div className="flex items-baseline gap-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white">
                      {category === 'sos' ? 'Travel Desk Alert' : 'Travel Desk Notification'}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      APP
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Today at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Fallback line / notification snippet */}
                  <p className="text-xs text-slate-400 font-mono">
                    {category === 'sos'
                      ? `${SOS_SEVERITY_ICONS[sosOverride.severity]} ${sosOverride.severity.toUpperCase()} — ${sosOverride.title}`
                      : `✈️ TRAVEL DESK NOTIFICATION · ${notifOverride.status.toUpperCase()}`}
                  </p>

                  {/* RENDERING OPTION 1: Slack App Block Kit Attachment Card */}
                  {deliveryMode === 'block_kit' && (
                    <div
                      className={`relative rounded-lg p-4 space-y-3 transition-all ${
                        slackTheme === 'dark' ? 'bg-[#222529]' : 'bg-slate-50'
                      }`}
                      style={{
                        borderLeft: `4px solid ${
                          (category === 'sos' ? sosResolved : notifResolved)
                            ? '#64748B'
                            : (category === 'sos' ? sosColor : notifColor)
                        }`
                      }}
                    >
                      {/* === SOS CARD: Active State === */}
                      {category === 'sos' && !sosResolved && (
                        <>
                          {/* Header Line / Severity Pill */}
                          <div className="flex items-center justify-between">
                            <p className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{sosPill}</span>
                              <span className="text-slate-400 font-normal">—</span>
                              <span>{sosOverride.title}</span>
                            </p>
                          </div>

                          {/* 4-Field Scannable Triage Grid */}
                          <div
                            className={`grid grid-cols-2 gap-3 p-3 rounded-lg text-xs ${
                              slackTheme === 'dark' ? 'bg-[#1A1D21]' : 'bg-white border border-slate-200'
                            }`}
                          >
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Service</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                                {sosOverride.service}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Environment</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                                {sosOverride.environment}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Occurrences</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                {sosOverride.occurrences > 1 ? `${sosOverride.occurrences} in recent window` : '1st occurrence'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Impact</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate" title={sosOverride.impact}>
                                {sosOverride.impact}
                              </p>
                            </div>
                          </div>

                          {/* Truncated Stack Trace / Log Box */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>Log snippet (cut to 3 lines):</span>
                              <button
                                onClick={() => setSosFullStack(v => !v)}
                                className="text-indigo-400 hover:underline font-bold"
                              >
                                {sosFullStack ? 'Truncate snippet' : 'View full trace'}
                              </button>
                            </div>
                            <pre
                              className={`p-3 rounded-lg font-mono text-[11px] leading-relaxed overflow-x-auto ${
                                slackTheme === 'dark' ? 'bg-[#121417] text-slate-200' : 'bg-slate-900 text-slate-100'
                              }`}
                            >
                              <code>{sosFullStack ? sosOverride.stackSnippet : sosOverride.stackSnippet.split('\n').slice(0, 3).join('\n')}</code>
                            </pre>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              onClick={() => {
                                setSosResolved(true);
                                toast.success('Alert acknowledged and collapsed!');
                              }}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                            >
                              <i className="fa-solid fa-check"></i>
                              Acknowledge
                            </button>
                            <a
                              href="#logs"
                              onClick={e => { e.preventDefault(); toast.info('Navigating to SOS console logs...'); }}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-all flex items-center gap-1.5"
                            >
                              <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                              View logs
                            </a>
                            {(sosOverride.code.startsWith('EMAIL_') || sosOverride.code.startsWith('SMTP_')) && (
                              <button
                                onClick={() => toast.success('Queue retry triggered!')}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-all active:scale-95 flex items-center gap-1.5"
                              >
                                <i className="fa-solid fa-rotate-right"></i>
                                Retry
                              </button>
                            )}
                          </div>

                          {/* Footer Context line */}
                          <p className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-200/50 dark:border-slate-800">
                            `{sosOverride.code}` · Travel Desk SOS
                          </p>
                        </>
                      )}

                      {/* === SOS CARD: Collapsed Resolved State === */}
                      {category === 'sos' && sosResolved && (
                        <div className="flex items-center justify-between gap-3 py-1">
                          <div className="space-y-0.5">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                              <span className="text-emerald-500 font-bold">✅ Resolved</span>
                              <span className="text-slate-400 font-normal">—</span>
                              <span>{sosOverride.title}</span>
                            </p>
                            <p className="text-[11px] text-slate-400 italic">
                              Handled by {currentUser?.name || 'Nitin Sudarshan'} · Just now
                            </p>
                          </div>
                          <button
                            onClick={() => setSosResolved(false)}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition-all"
                          >
                            Reopen Card
                          </button>
                        </div>
                      )}

                      {/* === NOTIFICATION CARD: Active State === */}
                      {category === 'notifications' && !notifResolved && (
                        <>
                          {/* Header Line */}
                          <div className="flex items-center justify-between">
                            <p className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <span>✈️ New Travel Request — {notifOverride.ticket}</span>
                            </p>
                          </div>

                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <span>*Status:* 🟡 <strong>{notifOverride.status}</strong></span>
                            <span className="mx-2 text-slate-400">|</span>
                            <span>*Priority:* <strong>{notifOverride.priority === 'Urgent' ? '🚨 Urgent' : notifOverride.priority === 'High' ? '🔴 High' : '⚡ Normal'}</strong></span>
                          </div>

                          {/* 4-Field Scannable Triage Grid for Notifications */}
                          <div
                            className={`grid grid-cols-2 gap-3 p-3 rounded-lg text-xs ${
                              slackTheme === 'dark' ? 'bg-[#1A1D21]' : 'bg-white border border-slate-200'
                            }`}
                          >
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">👤 Traveler</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                {notifOverride.who}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">🏢 Dept / Campus</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                {notifOverride.dept} ({notifOverride.campus})
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">🛫 Trip Route</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                                {notifOverride.trip}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">📅 Travel Date & Mode</p>
                              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                {notifOverride.date} · {notifOverride.mode}
                              </p>
                            </div>
                          </div>

                          {/* Note / purpose */}
                          {notifOverride.note && (
                            <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-bold text-indigo-700 dark:text-indigo-300 mr-1.5">Note:</span>
                              {notifOverride.note}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              onClick={() => toast.info(`Viewing request ${notifOverride.ticket}`)}
                              className="px-4 py-2 rounded-lg text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                            >
                              View in Travel Desk →
                            </button>
                            <button
                              onClick={() => {
                                setNotifResolved(true);
                                toast.success(`Request ${notifOverride.ticket} marked booked/completed!`);
                              }}
                              className="px-3.5 py-2 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-all flex items-center gap-1.5"
                            >
                              <i className="fa-solid fa-ticket text-emerald-500"></i>
                              Mark Booked
                            </button>
                          </div>

                          {/* Footer Context */}
                          <p className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-200/50 dark:border-slate-800">
                            `{notifOverride.ticket}` · Navgurukul Travel Desk • Automated Notification
                          </p>
                        </>
                      )}

                      {/* === NOTIFICATION CARD: Collapsed Booked State === */}
                      {category === 'notifications' && notifResolved && (
                        <div className="flex items-center justify-between gap-3 py-1">
                          <div className="space-y-0.5">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                              <span className="text-emerald-500 font-bold">✅ Booked</span>
                              <span className="text-slate-400 font-normal">—</span>
                              <span>`{notifOverride.ticket}` ({notifOverride.trip})</span>
                            </p>
                            <p className="text-[11px] text-slate-400 italic">
                              Handled by PNC Desk Team · Completed
                            </p>
                          </div>
                          <button
                            onClick={() => setNotifResolved(false)}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition-all"
                          >
                            Reopen Request
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* RENDERING OPTION 2: Slack Workflow Builder Plain Text Format */}
                  {deliveryMode === 'workflow' && (
                    <div
                      className={`p-4 rounded-lg font-mono text-xs whitespace-pre-wrap leading-relaxed border ${
                        slackTheme === 'dark'
                          ? 'bg-[#121417] text-slate-200 border-[#2C3136]'
                          : 'bg-white text-slate-800 border-slate-200'
                      }`}
                    >
                      {category === 'sos' ? (
                        [
                          `${SOS_SEVERITY_ICONS[sosOverride.severity]}  ${sosOverride.severity.toUpperCase()}  ·  ${sosOverride.title}`,
                          '',
                          `Service        ${sosOverride.service}`,
                          `Environment    ${sosOverride.environment}`,
                          `Occurrences    ${sosOverride.occurrences > 1 ? `${sosOverride.occurrences} times` : 'First occurrence'}`,
                          `Impact         ${sosOverride.impact}`,
                          '',
                          sosOverride.stackSnippet.split('\n').slice(0, 3).join('\n'),
                          '',
                          `View logs: https://ng-travel-desk.vercel.app/?tab=sos`
                        ].join('\n')
                      ) : (
                        [
                          `✈️  TRAVEL DESK NOTIFICATION · NEW REQUEST`,
                          `Request ID: ${notifOverride.ticket}  •  Status: ${notifOverride.status}`,
                          '',
                          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                          `Traveler:          ${notifOverride.who}`,
                          `Dept / Campus:     ${notifOverride.dept} (${notifOverride.campus})`,
                          `Trip Route:        ${notifOverride.trip}`,
                          `Travel Date:       ${notifOverride.date}`,
                          `Mode:              ${notifOverride.mode}`,
                          `Priority:          ${notifOverride.priority}`,
                          `Approving Manager: ${notifOverride.manager}`,
                          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                          '',
                          `Action: View in Travel Desk → https://ng-travel-desk.vercel.app/?tab=requests`,
                          `_Navgurukul Travel Desk • Automated Notification_`
                        ].join('\n')
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Design Principles Summary Box */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs space-y-2">
            <p className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-2">
              <i className="fa-solid fa-compass-drafting text-indigo-500"></i>
              Why this card design succeeds in Slack:
            </p>
            <div className="grid sm:grid-cols-3 gap-3 text-slate-600 dark:text-slate-300">
              <div className="space-y-1">
                <strong className="text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span> 1. Scannable Left Bar
                </strong>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Engineers triage directly from channel lists without opening or reading full text.
                </p>
              </div>
              <div className="space-y-1">
                <strong className="text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 2. Consistent 4-Field Grid
                </strong>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Always shows Service, Env, Occurrences, and Impact in the identical layout every time.
                </p>
              </div>
              <div className="space-y-1">
                <strong className="text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 3. Collapsed Resolved State
                </strong>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Collapses to a 1-line checkmark when handled, avoiding channel alert fatigue.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Triage Details, Live Tweaks & Payload Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Section 1: Detailed Triage & Diagnostic Checklist (User Request Feature!) */}
          {category === 'sos' && (
            <div className="space-y-3.5">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i className="fa-solid fa-stethoscope text-indigo-500"></i>
                Triage & Root Cause Intelligence
              </h2>

              {/* 1. What the issue is in simple terms */}
              <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 space-y-1.5">
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                  <i className="fa-solid fa-lightbulb text-amber-500"></i>
                  What the issue is (in simple terms)
                </p>
                <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {simpleTerms}
                </p>
                {sosSpec?.meaning && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-2 border-t border-amber-200/60 dark:border-amber-900/50">
                    <strong className="text-slate-800 dark:text-slate-300">Why it matters:</strong> {sosSpec.meaning}
                  </p>
                )}
              </div>

              {/* 2. What to check (Triage checklist) */}
              <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-400 flex items-center gap-1.5">
                  <i className="fa-solid fa-list-check text-indigo-500"></i>
                  What to check (Triage checklist)
                </p>
                <ul className="space-y-2">
                  {whatToCheck.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200 leading-snug">
                      <span className="w-4 h-4 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-[9px] flex-shrink-0 mt-0.5 font-black">
                        <i className="fa-solid fa-check"></i>
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 3. Detailed Diagnostics & Reproduction Steps */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-2.5">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i className="fa-solid fa-route text-sky-500"></i>
                  Detailed Diagnostics & Investigation Path
                </p>
                <ol className="space-y-2 pl-0.5">
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

          {/* Section 2: Interactive Field Customizer / Input Playground */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="fa-solid fa-pen-ruler text-indigo-500"></i>
                Tune Fields & Test Inputs
              </span>
              <span className="text-[10px] font-mono text-slate-400">Live Reaction</span>
            </h2>

            {category === 'sos' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Alert Title
                  </label>
                  <input
                    type="text"
                    value={sosOverride.title}
                    onChange={e => setSosOverride({ ...sosOverride, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Severity
                    </label>
                    <select
                      value={sosOverride.severity}
                      onChange={e => setSosOverride({ ...sosOverride, severity: e.target.value as SosSeverity })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="critical">🔴 Critical</option>
                      <option value="high">🟠 Error / High</option>
                      <option value="warning">🟡 Warning</option>
                      <option value="info">🔵 Info</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Occurrences
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={sosOverride.occurrences}
                      onChange={e => setSosOverride({ ...sosOverride, occurrences: Number(e.target.value) || 1 })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Service
                    </label>
                    <input
                      type="text"
                      value={sosOverride.service}
                      onChange={e => setSosOverride({ ...sosOverride, service: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Environment
                    </label>
                    <input
                      type="text"
                      value={sosOverride.environment}
                      onChange={e => setSosOverride({ ...sosOverride, environment: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Impact
                  </label>
                  <input
                    type="text"
                    value={sosOverride.impact}
                    onChange={e => setSosOverride({ ...sosOverride, impact: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Traveler
                    </label>
                    <input
                      type="text"
                      value={notifOverride.who}
                      onChange={e => setNotifOverride({ ...notifOverride, who: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Ticket ID
                    </label>
                    <input
                      type="text"
                      value={notifOverride.ticket}
                      onChange={e => setNotifOverride({ ...notifOverride, ticket: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Trip Route
                    </label>
                    <input
                      type="text"
                      value={notifOverride.trip}
                      onChange={e => setNotifOverride({ ...notifOverride, trip: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Priority
                    </label>
                    <select
                      value={notifOverride.priority}
                      onChange={e => setNotifOverride({ ...notifOverride, priority: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <input
                    type="text"
                    value={notifOverride.status}
                    onChange={e => setNotifOverride({ ...notifOverride, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Block Kit JSON Payload Inspector */}
          <div className="p-4 rounded-2xl bg-slate-900 text-slate-200 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                <i className="fa-solid fa-code mr-1.5 text-indigo-400"></i>
                Slack Payload JSON Inspector
              </span>
              <button
                onClick={handleCopyJson}
                className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 transition-colors"
              >
                Copy JSON
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-black/60 text-[11px] text-emerald-400 max-h-60 overflow-y-auto leading-relaxed border border-slate-800">
              <code>{activeJson}</code>
            </pre>
            <p className="text-[10px] text-slate-400">
              Paste directly into Slack’s official <a href="https://app.slack.com/block-kit-builder" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">Block Kit Builder</a> to test interactive menus and multi-user team previews.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlackCardStudio;
