/**
 * Email & Notification Center
 *
 * Centralized administration center for outbound email notifications:
 * - Templates & Cadence
 * - Delivery Monitor & Outbox
 * - Email Setup (Gmail, SES, Resend, Custom SMTP)
 * - Usage & Quota
 * - Provider Health & Live Verification Testing
 * - Audit Trail
 */

import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { MailTemplatesView } from './MailTemplatesView';
import { SentMailsView } from './SentMailsView';
import { EmailSettingsView } from './EmailSettingsView';
import { PageBanner } from './PageBanner';
import {
  pingProviderConnection,
  dispatchLiveTestEmail,
  loadPerAccountUsage,
  loadEmailNotificationSettings,
  saveEmailNotificationSettings,
  triggerEmailWorker,
  logEmailAuditAction
} from '../utils/emailNotificationService';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { reportSos } from '../utils/sos/raiseSos';

interface EmailNotificationCenterProps {
  currentUser?: User | null;
  initialTab?: 'templates' | 'delivery' | 'routing' | 'setup' | 'quota';
  onNavigateToRequest?: (ticketId: string) => void;
}

export const EmailNotificationCenter: React.FC<EmailNotificationCenterProps> = ({
  currentUser,
  initialTab = 'templates',
  onNavigateToRequest
}) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'delivery' | 'routing' | 'setup' | 'quota'>(initialTab);
  const [templateSubTab, setTemplateSubTab] = useState<'templates' | 'cadence'>('templates');
  const [quotaSubTab, setQuotaSubTab] = useState<'today' | 'past'>('today');

  // Provider Settings State
  const [activeProvider, setActiveProvider] = useState<string>('smtp');
  const [selectedProviderCard, setSelectedProviderCard] = useState<string>('smtp');
  // Which of the two SMTP accounts is currently "active" (vs backup)
  const [activeSmtpSlot, setActiveSmtpSlot] = useState<'smtp' | 'smtp2'>('smtp');
  // Which account's form is being edited
  const [editingSmtpSlot, setEditingSmtpSlot] = useState<'smtp' | 'smtp2'>('smtp');
  // Whether the credentials guide is expanded
  const [showCredGuide, setShowCredGuide] = useState(false);
  const [providerConfig, setProviderConfig] = useState<any>({
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      username: 'nitin@navgurukul.org',
      password: '',
      senderEmail: 'nitin@navgurukul.org',
      senderName: 'Navgurukul Travel Desk',
      replyTo: 'nitin@navgurukul.org'
    },
    // Second SMTP account — acts as hot-standby backup
    smtp2: {
      host: 'smtp.gmail.com',
      port: 587,
      username: '',
      password: '',
      senderEmail: '',
      senderName: 'Navgurukul Travel Desk',
      replyTo: ''
    },
    ses: {
      region: 'ap-south-1',
      smtpEndpoint: 'email-smtp.ap-south-1.amazonaws.com:587',
      accessKeyId: '',
      secretAccessKey: '',
      configurationSet: 'travel-desk-production',
      senderEmail: 'travel@navgurukul.org',
      senderName: 'Navgurukul Travel Desk',
      replyTo: 'travel@navgurukul.org'
    },
    gmail: {
      senderEmail: 'travel@navgurukul.org',
      senderName: 'Navgurukul Travel Desk',
      clientId: '1047056012423-gae6c7fjmrc1puojk11t8qnjid',
      clientSecret: '',
      refreshToken: '',
      authorizedScope: 'https://www.googleapis.com/auth/gmail.send'
    },
    resend: {
      apiKey: '',
      senderEmail: 'travel@navgurukul.org',
      senderName: 'Navgurukul Travel Desk',
      replyTo: 'travel@navgurukul.org'
    }
  });

  const [quotaSettings, setQuotaSettings] = useState<any>({
    dailyQuota: 4000,
    // Gmail Workspace caps each mailbox separately; 4000 is the sum of the two.
    perAccountQuota: 2000,
    failoverAfterFailures: 3,
    warningThresholdPct: 80,
    criticalThresholdPct: 95,
    fallbackProvider: 'ses'
  });

  // Today's sends split by SMTP account. A pooled figure would hide one account
  // nearing its own cap while the combined total still looks healthy.
  const [slotUsage, setSlotUsage] = useState<{ smtp: number; smtp2: number; total: number }>({
    smtp: 0,
    smtp2: 0,
    total: 0
  });

  const [domainSecurity, setDomainSecurity] = useState<any>({
    domain: 'navgurukul.org',
    spf: { status: 'Valid', record: 'v=spf1 include:_spf.google.com ~all' },
    dkim: { status: 'Verified', selector: 'google._domainkey.navgurukul.org', keyLength: '2048-bit RSA' },
    dmarc: { status: 'Valid', policy: 'p=reject', record: 'v=DMARC1; p=reject; rua=mailto:travel@navgurukul.org' },
    mx: { status: 'Active', records: ['1 ASPMX.L.GOOGLE.COM', '5 ALT1.ASPMX.L.GOOGLE.COM'] }
  });

  // Health and Ping State
  const [pingLoading, setPingLoading] = useState(false);
  const [providerHealth, setProviderHealth] = useState<{
    ok: boolean;
    latencyMs: number;
    message: string;
    checkedAt: string;
  } | null>(null);

  // Health is tracked per SMTP account so testing Account B no longer discards
  // Account A's result.
  type SlotHealth = { ok: boolean; latencyMs: number; message: string; checkedAt: string };
  const [slotHealth, setSlotHealth] = useState<Partial<Record<'smtp' | 'smtp2', SlotHealth>>>({});
  const [slotPinging, setSlotPinging] = useState<'smtp' | 'smtp2' | null>(null);

  // Live Test Dispatch State
  const [testRecipient, setTestRecipient] = useState(currentUser?.email || 'nitin@navgurukul.org');
  const [testSending, setTestSending] = useState(false);

  // Stats State
  const [stats, setStats] = useState({
    sentToday: 0,
    deliveredToday: 0,
    failedToday: 0,
    bouncedToday: 0,
    pendingInQueue: 0,
    totalTemplates: 17
  });

  // Audit Logs Modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Past Usage Graph State
  const [pastUsageFilter, setPastUsageFilter] = useState<'7' | '14' | '30' | '90' | 'lifetime' | 'custom'>('14');
  const [customDateRange, setCustomDateRange] = useState({ start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
  const [pastUsageData, setPastUsageData] = useState<{ day: string, vol: number, delivered: number, failed: number }[]>([]);
  const [pastUsageStats, setPastUsageStats] = useState({ totalSent: 0, avgDaily: 0, deliveryRate: 100 });
  const [loadingPastUsage, setLoadingPastUsage] = useState(false);
  const [pastUsageToggles, setPastUsageToggles] = useState({ total: true, delivered: false, failed: false });

  const canEdit = currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    void initializeSettings();
    void fetchDeliveryMetrics();
  }, []);

  useEffect(() => {
    if (activeTab === 'quota' && quotaSubTab === 'past') {
      void fetchPastUsage();
    }
  }, [activeTab, quotaSubTab, pastUsageFilter, customDateRange]);

  const fetchPastUsage = async () => {
    setLoadingPastUsage(true);
    try {
      let startDate = new Date();
      let endDate = new Date();
      endDate.setHours(23,59,59,999);

      if (pastUsageFilter === 'lifetime') {
        const { data: oldest } = await supabase.from('email_queue').select('created_at').order('created_at', { ascending: true }).limit(1);
        if (oldest && oldest.length > 0) {
          startDate = new Date(oldest[0].created_at);
        } else {
          startDate.setDate(startDate.getDate() - 30);
        }
      } else if (pastUsageFilter === 'custom') {
        startDate = new Date(customDateRange.start);
        endDate = new Date(customDateRange.end);
        endDate.setHours(23,59,59,999);
      } else {
        startDate.setDate(startDate.getDate() - parseInt(pastUsageFilter) + 1);
      }
      startDate.setHours(0,0,0,0);

      const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      const { data, error } = await supabase
        .from('email_queue')
        .select('created_at, status')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) throw error;
      
      const records = data || [];
      const dailyMap: Record<string, { vol: number, delivered: number, failed: number }> = {};
      
      // Initialize map with all days in range
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dailyMap[dayStr] = { vol: 0, delivered: 0, failed: 0 };
      }

      let delivered = 0;
      let totalSent = 0;

      records.forEach(r => {
        totalSent++;
        if (r.status === 'Sent') delivered++;
        
        const d = new Date(r.created_at);
        const dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dailyMap[dayStr] !== undefined) {
          dailyMap[dayStr].vol++;
          if (r.status === 'Sent') dailyMap[dayStr].delivered++;
          if (r.status === 'Failed') dailyMap[dayStr].failed++;
        }
      });

      const chartData = Object.keys(dailyMap).map(day => ({
        day,
        ...dailyMap[day]
      }));

      setPastUsageData(chartData);
      setPastUsageStats({
        totalSent,
        avgDaily: Math.round(totalSent / totalDays),
        deliveryRate: totalSent > 0 ? (delivered / totalSent) * 100 : 100
      });

    } catch (err: any) {
      toast.error('Failed to load past usage data: ' + err.message);
    } finally {
      setLoadingPastUsage(false);
    }
  };

  const initializeSettings = async () => {
    const data = await loadEmailNotificationSettings();
    if (data.activeProvider) {
      const sanitized = ['smtp', 'ses'].includes(data.activeProvider) ? data.activeProvider : 'smtp';
      setActiveProvider(sanitized);
      setSelectedProviderCard(sanitized);
    }
    if (data.activeSmtpSlot) {
      setActiveSmtpSlot(data.activeSmtpSlot);
    }
    if (data.providerConfig) {
      setProviderConfig((prev: any) => ({ ...prev, ...data.providerConfig }));
    }
    if (data.quotaSettings) {
      setQuotaSettings((prev: any) => ({ ...prev, ...data.quotaSettings }));
    }
    if (data.domainSecurity) {
      setDomainSecurity(data.domainSecurity);
    }
  };

  const fetchDeliveryMetrics = async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const { data: queueRows } = await supabase
        .from('email_queue')
        .select('status, created_at')
        .gte('created_at', todayIso);

      const { count: pendingCount } = await supabase
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Pending');

      const { count: templateCount } = await supabase
        .from('mail_templates')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('is_draft', false);

      if (queueRows) {
        let sent = 0;
        let delivered = 0;
        let failed = 0;
        let bounced = 0;

        for (const row of queueRows) {
          if (row.status === 'Sent') sent++;
          else if (row.status === 'Delivered') delivered++;
          else if (row.status === 'Failed') failed++;
          else if (row.status === 'Bounced') bounced++;
        }

        const perAccount = await loadPerAccountUsage();
        setSlotUsage(perAccount);

        setStats({
          sentToday: sent + delivered,
          deliveredToday: delivered,
          failedToday: failed,
          bouncedToday: bounced,
          pendingInQueue: pendingCount || 0,
          totalTemplates: templateCount || 17
        });
      }
    } catch (err) {
      reportSos('ANALYTICS_LOAD_FAILED', err, { screen: 'email_center', dataset: 'metrics' });
    }
  };

  const handlePingProvider = async (providerToPing?: string) => {
    const p = providerToPing || activeProvider;
    setPingLoading(true);
    try {
      const configToPing = p === 'smtp'
        ? (providerConfig[editingSmtpSlot] || providerConfig.smtp)
        : providerConfig[p];
      const res = await pingProviderConnection(p, configToPing);
      setProviderHealth({
        ok: res.ok,
        latencyMs: res.latencyMs,
        message: res.message,
        checkedAt: new Date().toLocaleTimeString()
      });

      if (res.ok) {
        toast.success(`${p.toUpperCase()} Provider Online: ${res.latencyMs}ms latency`);
      } else {
        toast.error(`${p.toUpperCase()} Provider Check Failed: ${res.message}`);
      }
    } catch (err: any) {
      toast.error(`Connection check error: ${err.message}`);
    } finally {
      setPingLoading(false);
    }
  };

  /**
   * Tests one SMTP account's credentials without disturbing the other's result.
   * Sends the slot's in-form values so Account B can be verified before it is
   * saved or made active.
   */
  const handlePingSlot = async (slot: 'smtp' | 'smtp2') => {
    const cfg = providerConfig[slot];
    if (!cfg?.username || !cfg?.password) {
      toast.error(`${slot === 'smtp' ? 'Account A' : 'Account B'} needs a username and App Password before testing.`);
      return;
    }

    setSlotPinging(slot);
    try {
      const res = await pingProviderConnection('smtp', cfg);
      setSlotHealth((prev) => ({
        ...prev,
        [slot]: {
          ok: res.ok,
          latencyMs: res.latencyMs,
          message: res.message,
          checkedAt: new Date().toLocaleTimeString()
        }
      }));

      const label = slot === 'smtp' ? 'Account A' : 'Account B';
      if (res.ok) {
        toast.success(`${label} online: ${res.latencyMs}ms`);
      } else {
        toast.error(`${label} failed: ${res.message}`);
      }
    } catch (err: any) {
      toast.error(`Connection check error: ${err.message}`);
    } finally {
      setSlotPinging(null);
    }
  };

  const handleSaveProviderConfig = async () => {
    if (!canEdit) {
      toast.error('Only Administrators can modify email provider settings.');
      return;
    }

    try {
      await saveEmailNotificationSettings(
        {
          activeProvider,
          activeSmtpSlot,
          providerConfig,
          quotaSettings
        },
        currentUser ? { email: currentUser.email, name: currentUser.name } : undefined
      );

      toast.success('Email provider configuration successfully saved!');
      void handlePingProvider(activeProvider);
    } catch (err: any) {
      toast.error(`Failed to save settings: ${err.message}`);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testRecipient) {
      toast.error('Please enter a recipient email.');
      return;
    }

    setTestSending(true);
    try {
      const res = await dispatchLiveTestEmail(
        testRecipient,
        activeProvider,
        currentUser ? { email: currentUser.email, name: currentUser.name } : undefined
      );

      if (res.success) {
        toast.success(res.message);
        void fetchDeliveryMetrics();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(`Test email dispatch error: ${err.message}`);
    } finally {
      setTestSending(false);
    }
  };

  const openAuditLogs = async () => {
    setIsAuditModalOpen(true);
    setLoadingAudit(true);
    try {
      const { data } = await supabase
        .from('email_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      setAuditLogs(data || []);
    } catch (err) {
      reportSos('DATA_LOAD_FAILED', err, { screen: 'email_center', dataset: 'audit_logs' });
    } finally {
      setLoadingAudit(false);
    }
  };

  // Quota computations
  const perAccountQuota = quotaSettings.perAccountQuota || 2000;
  const dailyQuota = quotaSettings.dailyQuota || perAccountQuota * 2;
  const warnPct = quotaSettings.warningThresholdPct || 80;
  const critPct = quotaSettings.criticalThresholdPct || 95;

  // Quota is measured against actual sends (slotUsage), not rows created today,
  // so the bars agree with what the queue worker counts.
  const quotaUsedPct = Math.min(100, Math.round((slotUsage.total / dailyQuota) * 100));
  const isQuotaWarning = quotaUsedPct >= warnPct;
  const isQuotaCritical = quotaUsedPct >= critPct;

  /** Per-account figures — each Gmail mailbox has its own cap to watch. */
  const accountQuota = (slot: 'smtp' | 'smtp2') => {
    const used = slotUsage[slot] || 0;
    const pct = Math.min(100, Math.round((used / perAccountQuota) * 100));
    return {
      slot,
      label: slot === 'smtp' ? 'Account A' : 'Account B',
      sender: providerConfig[slot]?.senderEmail || providerConfig[slot]?.username || 'Not configured',
      isActive: activeSmtpSlot === slot,
      used,
      remaining: Math.max(0, perAccountQuota - used),
      pct,
      isWarning: pct >= warnPct && pct < critPct,
      isCritical: pct >= critPct
    };
  };
  const accountQuotas = [accountQuota('smtp'), accountQuota('smtp2')];
  const quotaBarClass = (a: { isCritical: boolean; isWarning: boolean }) =>
    a.isCritical ? 'bg-rose-500' : a.isWarning ? 'bg-amber-500' : 'bg-indigo-600';
  const quotaTextClass = (a: { isCritical: boolean; isWarning: boolean }) =>
    a.isCritical ? 'text-rose-500' : a.isWarning ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300';

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Banner */}
      <PageBanner
        title="Email & Notification Center"
        description="Centralized dispatch hub for Navgurukul Travel Desk lifecycle notifications, reminder cadence, multi-provider transport, and real-time delivery monitoring."
        icon="fa-envelope-open-text"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-sm ${
            providerHealth?.ok !== false
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
              : 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${providerHealth?.ok !== false ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {activeProvider.toUpperCase()} • {providerHealth?.latencyMs ? `${providerHealth.latencyMs}ms` : 'Active'}
          </span>

          <button
            onClick={() => handlePingProvider()}
            disabled={pingLoading}
            className="px-3.5 py-2 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 font-black text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <i className={`fa-solid fa-signal ${pingLoading ? 'fa-spin' : ''}`} />
            {pingLoading ? 'Testing...' : `Ping ${activeProvider.toUpperCase()}`}
          </button>

          <button
            onClick={openAuditLogs}
            className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-black flex items-center gap-1.5 border border-white/20 backdrop-blur-sm transition-all shadow-sm active:scale-95"
            title="View Audit Trail"
          >
            <i className="fa-solid fa-clock-rotate-left" />
            <span>Audit Trail</span>
          </button>
        </div>
      </PageBanner>

      {/* 2. Top-Level Section Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'templates'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fa-solid fa-file-lines" />
            <span>Templates & Cadence</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-all ${
              activeTab === 'templates'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              {stats.totalTemplates}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('delivery')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'delivery'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fa-solid fa-paper-plane" />
            <span>Delivery Monitor & Outbox</span>
            {stats.pendingInQueue > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white animate-pulse">
                {stats.pendingInQueue}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('routing')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'routing'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fa-solid fa-route" />
            <span>Email Routing & SLA</span>
          </button>

          <button
            onClick={() => setActiveTab('setup')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'setup'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fa-solid fa-sliders" />
            <span>Email Setup</span>
          </button>

          <button
            onClick={() => setActiveTab('quota')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'quota'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fa-solid fa-chart-column" />
            <span>Usage & Quota</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 flex items-center gap-1 font-mono">
              {accountQuotas.map((a, i) => (
                <React.Fragment key={a.slot}>
                  {i > 0 && <span className="text-slate-400">-</span>}
                  <span className={quotaTextClass(a)}>
                    {a.slot === 'smtp' ? 'A' : 'B'} {a.used}
                  </span>
                </React.Fragment>
              ))}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Section Content Rendering */}
      {/* ========================================================================= */}
      {/* SECTION A: TEMPLATES & CADENCE */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              onClick={() => setTemplateSubTab('templates')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all ${
                templateSubTab === 'templates'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <i className="fa-solid fa-envelope-open-text" />
              <span>Lifecycle Notification Templates</span>
            </button>
            <button
              onClick={() => setTemplateSubTab('cadence')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all ${
                templateSubTab === 'cadence'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <i className="fa-solid fa-clock" />
              <span>Reminder Schedules & Cadence</span>
            </button>
          </div>

          {templateSubTab === 'templates' ? (
            <MailTemplatesView currentUserRole={currentUser?.role} currentUser={currentUser} />
          ) : (
            <EmailSettingsView currentUser={currentUser} />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION B: DELIVERY MONITOR & OUTBOX */}
      {/* ========================================================================= */}
      {activeTab === 'delivery' && (
        <div className="space-y-6">
          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Sent Today</span>
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 block">{stats.sentToday}</span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Delivered</span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">{stats.deliveredToday}</span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">In Queue / Retrying</span>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 block">{stats.pendingInQueue}</span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Failed</span>
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1 block">{stats.failedToday}</span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Bounced</span>
              <span className="text-2xl font-bold text-slate-600 dark:text-slate-400 mt-1 block">{stats.bouncedToday}</span>
            </div>
          </div>

          <SentMailsView
            currentUser={currentUser}
            onTabChange={(tab: string) => {
              if (tab === 'dashboard' && onNavigateToRequest) {
                // Navigate
              }
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: EMAIL ROUTING & SLA */}
      {/* ========================================================================= */}
      {activeTab === 'routing' && (
        <div className="space-y-6">
          <EmailSettingsView currentUser={currentUser} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION C: EMAIL SETUP (GMAIL, SES, RESEND, SMTP) */}
      {/* ========================================================================= */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          {/* Provider Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Delivery Provider Infrastructure
              </h3>
              <span className="text-xs text-slate-500">
                Click a provider card to configure credentials and sender profile
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              {/* 1. Google Workspace / SMTP Relay (Primary) */}
              <div
                onClick={() => setSelectedProviderCard('smtp')}
                className={`relative p-5 rounded-xl border cursor-pointer transition-all ${
                  selectedProviderCard === 'smtp'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 font-bold flex items-center justify-center text-sm">
                      G
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Google Workspace / SMTP</h4>
                      <p className="text-[11px] text-slate-500">TLS Port 587 (App Password)</p>
                    </div>
                  </div>
                  {activeProvider === 'smtp' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]" title="Currently Active Provider">
                      <i className="fa-solid fa-check" />
                    </span>
                  )}
                </div>
                 <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                   Direct authenticated relay via smtp.gmail.com using your workspace email and App Password. Two accounts configured (A + B).
                 </p>
                 <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                   <span>Quota: 4,000 / day</span>
                   <span className={activeProvider === 'smtp' ? 'text-indigo-600 font-bold' : ''}>
                     {activeProvider === 'smtp' ? `● Active (Acct ${activeSmtpSlot === 'smtp' ? 'A' : 'B'})` : 'Standby'}
                   </span>
                 </div>
              </div>

              {/* 2. Amazon SES */}
              <div
                onClick={() => setSelectedProviderCard('ses')}
                className={`relative p-5 rounded-xl border cursor-pointer transition-all ${
                  selectedProviderCard === 'ses'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center text-xs">
                      SES
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Amazon SES</h4>
                      <p className="text-[11px] text-slate-500">ap-south-1 (Mumbai)</p>
                    </div>
                  </div>
                  {activeProvider === 'ses' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]" title="Currently Active Provider">
                      <i className="fa-solid fa-check" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                  High-throughput cloud delivery via AWS SES with 2048-bit DKIM for navgurukul.org.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Quota: 50,000 / day</span>
                  <span className={activeProvider === 'ses' ? 'text-indigo-600 font-bold' : ''}>
                    {activeProvider === 'ses' ? '● Active' : 'Standby Tier 1'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Form and Right Details Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Provider Form */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <i className="fa-solid fa-sliders text-indigo-600" />
                    {selectedProviderCard === 'smtp' && 'Custom SMTP Server Settings'}
                    {selectedProviderCard === 'ses' && 'Amazon Simple Email Service (SES) Credentials'}
                    {selectedProviderCard === 'gmail' && 'Google Workspace OAuth2 API Configuration'}
                    {selectedProviderCard === 'resend' && 'Resend Email API Settings'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure connection credentials and outbound sender headers.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canEdit && activeProvider !== selectedProviderCard && (
                    <button
                      onClick={() => setActiveProvider(selectedProviderCard)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold hover:bg-indigo-100 transition-all"
                    >
                      Make Active Provider
                    </button>
                  )}
                  {activeProvider === selectedProviderCard && (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-1.5">
                      <i className="fa-solid fa-circle-check" /> Active Transport
                    </span>
                  )}
                </div>
              </div>

              {!canEdit && (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <i className="fa-solid fa-lock" />
                  <span>Email provider setup and credentials are read-only for your role. Only Administrators can update credentials.</span>
                </div>
              )}

              {/* A. Custom SMTP Form — Dual Account (Primary + Backup) */}
              {selectedProviderCard === 'smtp' && (
                <div className="space-y-5">

                  {/* Info banner */}
                  <div className="p-3.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                    <strong>Direct TLS/STARTTLS Transport:</strong> Use Google Workspace Relay (<code>smtp.gmail.com</code> with an App Password), Amazon SES Outbound (<code>email-smtp.ap-south-1.amazonaws.com</code>), or any corporate MTA.
                  </div>

                  {/* Dual-account slot tabs */}
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mr-1">Account Slot:</span>
                    {(['smtp', 'smtp2'] as const).map((slot) => {
                      const isActive = activeSmtpSlot === slot;
                      const isEditing = editingSmtpSlot === slot;
                      const health = slotHealth[slot];
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setEditingSmtpSlot(slot)}
                          className={`relative px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border ${
                            isEditing
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          <i className={`fa-solid fa-server text-[10px] ${isEditing ? 'text-indigo-200' : 'text-slate-400'}`} />
                          {slot === 'smtp' ? 'Account A' : 'Account B'}
                          {isActive && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500 text-white tracking-wider">
                              Active
                            </span>
                          )}
                          {!isActive && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 tracking-wider">
                              Backup
                            </span>
                          )}
                          {health && (
                            <span
                              title={`${health.ok ? 'Reachable' : 'Failed'} at ${health.checkedAt}: ${health.message}`}
                              className={`ml-0.5 w-2 h-2 rounded-full ${health.ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            />
                          )}
                        </button>
                      );
                    })}

                    {/* Per-account credential test. Each slot keeps its own
                        result, so verifying B does not erase A's. */}
                    {(['smtp', 'smtp2'] as const).map((slot) => (
                      editingSmtpSlot === slot ? (
                        <button
                          key={`test-${slot}`}
                          type="button"
                          onClick={() => handlePingSlot(slot)}
                          disabled={slotPinging !== null}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-400 disabled:opacity-50 flex items-center gap-1.5 transition-all"
                        >
                          <i className={`fa-solid fa-wifi text-[10px] ${slotPinging === slot ? 'fa-spin' : ''}`} />
                          {slotPinging === slot ? 'Testing...' : `Test ${slot === 'smtp' ? 'A' : 'B'}`}
                        </button>
                      ) : null
                    ))}

                    {/* Toggle active slot */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={async () => {
                          const next = activeSmtpSlot === 'smtp' ? 'smtp2' : 'smtp';
                          const nextLabel = next === 'smtp' ? 'Account A' : 'Account B';

                          if (!providerConfig[next]?.username || !providerConfig[next]?.password) {
                            toast.error(`Configure ${nextLabel} credentials before activating it.`);
                            return;
                          }
                          // Promoting an untested account silently breaks every
                          // outbound email, so require a passing test first.
                          if (!slotHealth[next]?.ok) {
                            toast.error(`Run "Test ${next === 'smtp' ? 'A' : 'B'}" and get a pass before making ${nextLabel} active.`);
                            return;
                          }
                          setActiveSmtpSlot(next);
                          try {
                            await saveEmailNotificationSettings(
                              {
                                activeProvider,
                                activeSmtpSlot: next,
                                providerConfig,
                                quotaSettings
                              },
                              currentUser ? { email: currentUser.email, name: currentUser.name } : undefined
                            );
                          } catch (e) {
                            // non-blocking local toggle
                          }
                          toast.success(`Switched active SMTP to ${next === 'smtp' ? 'Account A' : 'Account B'}`);
                        }}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex items-center gap-1.5 transition-all"
                      >
                        <i className="fa-solid fa-arrow-right-arrow-left text-[10px]" />
                        Toggle Active / Backup
                      </button>
                    )}
                  </div>

                  {/* Role banner for the slot being edited */}
                  <div className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border ${
                    editingSmtpSlot === activeSmtpSlot
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    <i className={`fa-solid ${editingSmtpSlot === activeSmtpSlot ? 'fa-circle-check text-emerald-500' : 'fa-shield text-slate-400'}`} />
                    Editing: <strong className="ml-1">{editingSmtpSlot === 'smtp' ? 'Account A' : 'Account B'}</strong>
                    <span className="mx-1 text-slate-300 dark:text-slate-600">—</span>
                    {editingSmtpSlot === activeSmtpSlot ? 'currently the Active transport' : 'currently the Primary Backup'}
                  </div>

                  {/* Ingress warning for whichever slot is being edited */}
                  {providerConfig[editingSmtpSlot]?.host?.includes('mail-manager-smtp') && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                        <i className="fa-solid fa-triangle-exclamation text-amber-500 text-sm" />
                        <span>Ingress Endpoint Detected (Non-Relay)</span>
                      </div>
                      <p>
                        <code>{providerConfig[editingSmtpSlot].host}</code> is an AWS Mail Manager <strong>Ingress Endpoint</strong> and cannot relay outbound email. Use <code>smtp.gmail.com</code> with an App Password instead.
                      </p>
                    </div>
                  )}

                  {/* Form fields for the editing slot */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        SMTP Host / Endpoint
                      </label>
                      <input
                        type="text"
                        value={providerConfig[editingSmtpSlot]?.host || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: { ...providerConfig[editingSmtpSlot], host: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Port & Security
                      </label>
                      <input
                        type="number"
                        value={providerConfig[editingSmtpSlot]?.port || 587}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: { ...providerConfig[editingSmtpSlot], port: Number(e.target.value) }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        SMTP Username (Google Workspace Email)
                      </label>
                      <input
                        type="text"
                        value={providerConfig[editingSmtpSlot]?.username || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const current = providerConfig[editingSmtpSlot] || {};
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: {
                              ...current,
                              username: val,
                              senderEmail: current.senderEmail || val,
                              replyTo: current.replyTo || val
                            }
                          });
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="user@navgurukul.org"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        SMTP Password / App Password (16-char token)
                      </label>
                      <input
                        type="password"
                        value={providerConfig[editingSmtpSlot]?.password || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: { ...providerConfig[editingSmtpSlot], password: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="••••••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        From Email (Sender Address)
                      </label>
                      <input
                        type="email"
                        value={providerConfig[editingSmtpSlot]?.senderEmail || providerConfig[editingSmtpSlot]?.username || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: { ...providerConfig[editingSmtpSlot], senderEmail: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                        placeholder="travel@navgurukul.org"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        From Name (Display Name)
                      </label>
                      <input
                        type="text"
                        value={providerConfig[editingSmtpSlot]?.senderName || 'Navgurukul Travel Desk'}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: { ...providerConfig[editingSmtpSlot], senderName: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                        placeholder="Navgurukul Travel Desk"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Reply-To Email Address
                      </label>
                      <input
                        type="email"
                        value={providerConfig[editingSmtpSlot]?.replyTo || providerConfig[editingSmtpSlot]?.senderEmail || providerConfig[editingSmtpSlot]?.username || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            [editingSmtpSlot]: { ...providerConfig[editingSmtpSlot], replyTo: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                        placeholder="travel@navgurukul.org"
                      />
                    </div>
                  </div>

                  {/* ── Credentials Guide ─────────────────────────────────────── */}
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowCredGuide(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                        <i className="fa-solid fa-key" />
                        How to get a Gmail App Password (SMTP credentials)
                      </span>
                      <i className={`fa-solid fa-chevron-${showCredGuide ? 'up' : 'down'} text-indigo-500 text-[10px]`} />
                    </button>

                    {showCredGuide && (
                      <div className="px-4 py-4 bg-white dark:bg-slate-900 space-y-4 text-xs text-slate-700 dark:text-slate-300">
                        <p className="text-slate-500 dark:text-slate-400 italic">
                          Each Google Workspace account generates a unique 16-character App Password that serves as the SMTP auth token. Repeat for both Account A and Account B using different Workspace addresses.
                        </p>

                        {([
                          {
                            step: '1',
                            title: 'Enable 2-Step Verification',
                            body: 'Sign in to the Google account you want to use (e.g. nitin@navgurukul.org). Go to myaccount.google.com → Security → "How you sign in to Google" and turn on 2-Step Verification.',
                            url: 'https://myaccount.google.com/security',
                            urlLabel: 'Open Google Security Settings'
                          },
                          {
                            step: '2',
                            title: 'Open App Passwords',
                            body: 'In the same Security page, click App Passwords (only visible once 2-Step is active). If not visible, search "App Passwords" in the Google Account search bar at the top.',
                            url: 'https://myaccount.google.com/apppasswords',
                            urlLabel: 'Open App Passwords'
                          },
                          {
                            step: '3',
                            title: 'Create a new App Password',
                            body: 'In the App name field type a label like "NTG Travel Desk SMTP A". Click Create. Google shows a 16-character password (e.g. xxxx xxxx xxxx xxxx).',
                            url: null,
                            urlLabel: null
                          },
                          {
                            step: '4',
                            title: 'Fill in this form',
                            body: 'SMTP Host: smtp.gmail.com · Port: 587 · Username: full Workspace email · Password: the 16-char code (spaces optional).',
                            url: null,
                            urlLabel: null
                          },
                          {
                            step: '5',
                            title: 'Configure Account B (Backup)',
                            body: 'Switch to the Account B tab above. Use a different Workspace address, generate its own separate App Password ("NTG Travel Desk SMTP B"), and fill in the same fields. Then use "Toggle Active / Backup" to test before going live.',
                            url: null,
                            urlLabel: null
                          }
                        ] as { step: string; title: string; body: string; url: string | null; urlLabel: string | null }[]).map(({ step, title, body, url, urlLabel }) => (
                          <div key={step} className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                              {step}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">{title}</p>
                              <p className="leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 mt-1.5 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                                >
                                  <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
                                  {urlLabel}
                                </a>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 leading-relaxed">
                          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                          <strong>Security note:</strong> App Passwords grant full Gmail send access. Revoke them immediately at myaccount.google.com → Security → App Passwords if a credential is ever compromised.
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ── End Credentials Guide ──────────────────────────────────── */}

                </div>
              )}

              {/* B. Amazon SES Form */}
              {selectedProviderCard === 'ses' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-300 leading-relaxed flex items-center justify-between">
                    <div>
                      <strong>AWS Simple Email Service — Asia Pacific (Mumbai)</strong>
                      <p className="mt-0.5">Identity navgurukul.org is verified with 2048-bit DKIM keys in AWS SES ap-south-1.</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                      Verified Identity
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        AWS Region
                      </label>
                      <input
                        type="text"
                        value={providerConfig.ses.region}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            ses: { ...providerConfig.ses, region: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        SES SMTP Endpoint
                      </label>
                      <input
                        type="text"
                        value={providerConfig.ses.smtpEndpoint || 'email-smtp.ap-south-1.amazonaws.com:587'}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            ses: { ...providerConfig.ses, smtpEndpoint: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Configuration Set Name
                      </label>
                      <input
                        type="text"
                        value={providerConfig.ses.configurationSet || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            ses: { ...providerConfig.ses, configurationSet: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        AWS Access Key ID
                      </label>
                      <input
                        type="text"
                        value={providerConfig.ses.accessKeyId || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            ses: { ...providerConfig.ses, accessKeyId: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* C. Google Workspace Form */}
              {selectedProviderCard === 'gmail' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-900 dark:text-emerald-300 leading-relaxed">
                    <strong>Google Workspace OAuth2 API:</strong> Connects via Googleapis REST client using client credentials and offline refresh token.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Authorized Sender Email
                      </label>
                      <input
                        type="email"
                        value={providerConfig.gmail.senderEmail}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            gmail: { ...providerConfig.gmail, senderEmail: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        OAuth 2.0 Client ID
                      </label>
                      <input
                        type="text"
                        value={providerConfig.gmail.clientId}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            gmail: { ...providerConfig.gmail, clientId: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Authorized OAuth Scope
                    </label>
                    <input
                      type="text"
                      disabled
                      value={providerConfig.gmail.authorizedScope}
                      className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-500"
                    />
                  </div>
                </div>
              )}

              {/* D. Resend Form */}
              {selectedProviderCard === 'resend' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    <strong>Resend Developer API:</strong> Cloud transactional email delivery with edge webhooks.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Resend API Key
                    </label>
                    <input
                      type="password"
                      value={providerConfig.resend.apiKey || ''}
                      onChange={(e) =>
                        setProviderConfig({
                          ...providerConfig,
                          resend: { ...providerConfig.resend, apiKey: e.target.value }
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                      placeholder="re_••••••••••••••••"
                    />
                  </div>
                </div>
              )}

              {/* Common Sender Profile Section */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Default Sender Profile &amp; Routing
                  {selectedProviderCard === 'smtp' && (
                    <span className="ml-2 text-indigo-500 normal-case font-semibold">
                      ({editingSmtpSlot === 'smtp' ? 'Account A' : 'Account B'})
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      From Name
                    </label>
                    <input
                      type="text"
                      value={providerConfig[selectedProviderCard === 'smtp' ? editingSmtpSlot : selectedProviderCard]?.senderName || 'Navgurukul Travel Desk'}
                      onChange={(e) => {
                        const slot = selectedProviderCard === 'smtp' ? editingSmtpSlot : selectedProviderCard;
                        setProviderConfig({
                          ...providerConfig,
                          [slot]: {
                            ...providerConfig[slot],
                            senderName: e.target.value
                          }
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      From Email Address
                    </label>
                    <input
                      type="email"
                      value={providerConfig[selectedProviderCard === 'smtp' ? editingSmtpSlot : selectedProviderCard]?.senderEmail || 'travel@navgurukul.org'}
                      onChange={(e) => {
                        const slot = selectedProviderCard === 'smtp' ? editingSmtpSlot : selectedProviderCard;
                        setProviderConfig({
                          ...providerConfig,
                          [slot]: {
                            ...providerConfig[slot],
                            senderEmail: e.target.value
                          }
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Reply-To Address
                    </label>
                    <input
                      type="email"
                      value={providerConfig[selectedProviderCard === 'smtp' ? editingSmtpSlot : selectedProviderCard]?.replyTo || 'travel@navgurukul.org'}
                      onChange={(e) => {
                        const slot = selectedProviderCard === 'smtp' ? editingSmtpSlot : selectedProviderCard;
                        setProviderConfig({
                          ...providerConfig,
                          [slot]: {
                            ...providerConfig[slot],
                            replyTo: e.target.value
                          }
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handlePingProvider(selectedProviderCard)}
                  disabled={pingLoading}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  <i className={`fa-solid fa-wifi ${pingLoading ? 'fa-spin' : ''}`} />
                  Test Connection
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleSaveProviderConfig}
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
                  >
                    <i className="fa-solid fa-floppy-disk" />
                    Save Provider Configuration
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Domain Security & Live Verification Test */}
            <div className="space-y-6">
              {/* Domain Security Status */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <i className="fa-solid fa-shield-halved text-indigo-600" />
                    Domain Security Status
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">{domainSecurity.domain}</span>
                </div>

                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">SPF Record</span>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          ✓ {domainSecurity.spf.status}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[220px]">
                        {domainSecurity.spf.record}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">DKIM (2048-bit RSA)</span>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          ✓ {domainSecurity.dkim.status}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[220px]">
                        {domainSecurity.dkim.selector}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">DMARC Policy</span>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          ✓ Enforced ({domainSecurity.dmarc.policy})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[220px]">
                        {domainSecurity.dmarc.record}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Primary MX Exchange</span>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          ✓ Active
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[220px]">
                        {domainSecurity.mx.records?.[0] || '1 ASPMX.L.GOOGLE.COM'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Send Live Verification Test */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <i className="fa-solid fa-paper-plane text-indigo-600" />
                    Send Live Verification Test
                  </h4>
                  <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">
                    via {activeProvider.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Dispatches an operational test notification through the active provider to verify end-to-end transport and worker health.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    placeholder="e.g. nitin@navgurukul.org"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {['nitin@navgurukul.org', 'travel.team@navgurukul.org', 'finance@navgurukul.org'].map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => setTestRecipient(email)}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all font-mono"
                    >
                      {email.split('@')[0]}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={testSending}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  <i className={`fa-solid fa-paper-plane ${testSending ? 'animate-bounce' : ''}`} />
                  {testSending ? 'Transmitting Test...' : 'Dispatch Live Test Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION D: USAGE & QUOTA */}
      {/* ========================================================================= */}
      {activeTab === 'quota' && (
        <div className="space-y-6">
          <div className="flex bg-slate-100/50 dark:bg-slate-800/30 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/50 w-fit backdrop-blur-xl">
            <button
              onClick={() => setQuotaSubTab('today')}
              className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                quotaSubTab === 'today'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <i className="fa-solid fa-calendar-day" /> Today
            </button>
            <button
              onClick={() => setQuotaSubTab('past')}
              className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                quotaSubTab === 'past'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left" /> Past Usage
            </button>
          </div>

          {quotaSubTab === 'today' && (
            <div className="space-y-6 animate-in fade-in duration-500">
          {/* Daily Quota Progress Bar */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-chart-pie text-indigo-600" />
                  Daily Quota Consumption Progress
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each SMTP account carries its own {perAccountQuota.toLocaleString()} / day cap.
                  The pooled ceiling is {dailyQuota.toLocaleString()} across both.
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono text-slate-500">
                  Status: <strong>{slotUsage.total}</strong> of {dailyQuota} used ({dailyQuota - slotUsage.total} remaining)
                </span>
              </div>
            </div>

            {/* Per-account bars: a pooled bar would hide one mailbox hitting its
                own Gmail cap while the combined total still looks healthy. */}
            <div className="space-y-4">
              {accountQuotas.map((a) => (
                <div key={a.slot} className="space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{a.label}</span>
                      <span className="text-[11px] font-mono text-slate-400 truncate">{a.sender}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        a.isActive
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {a.isActive ? 'Active' : 'Backup'}
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold ${quotaTextClass(a)}`}>
                      {a.used.toLocaleString()} / {perAccountQuota.toLocaleString()}
                      <span className="text-slate-400 font-normal"> · {a.remaining.toLocaleString()} left</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${quotaBarClass(a)}`}
                      style={{ width: `${a.used > 0 ? Math.max(2, a.pct) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Combined</span>
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {slotUsage.total.toLocaleString()} / {dailyQuota.toLocaleString()}
                  <span className="text-slate-400 font-normal"> · {(dailyQuota - slotUsage.total).toLocaleString()} left</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-500 ${
                    isQuotaCritical ? 'bg-rose-500' : isQuotaWarning ? 'bg-amber-500' : 'bg-indigo-600'
                  }`}
                  style={{ width: `${slotUsage.total > 0 ? Math.max(2, quotaUsedPct) : 0}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>0% (0)</span>
              <span>25% ({Math.round(dailyQuota * 0.25)})</span>
              <span>50% ({Math.round(dailyQuota * 0.5)})</span>
              <span>75% ({Math.round(dailyQuota * 0.75)})</span>
              <span className="text-amber-500 font-bold">80% Warning ({Math.round(dailyQuota * 0.8)})</span>
              <span className="text-rose-500 font-bold">95% Critical ({Math.round(dailyQuota * 0.95)})</span>
              <span>100% ({dailyQuota})</span>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Daily Allowance</span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 block font-mono">
                {dailyQuota.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 mt-2 block">
                {perAccountQuota.toLocaleString()} per account x 2 (Resets at 00:00 IST)
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Used Today</span>
              <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1 block font-mono">
                {slotUsage.total}
              </span>
              <span className="text-xs text-slate-400 mt-2 block">
                A {slotUsage.smtp} · B {slotUsage.smtp2} — {quotaUsedPct}% of pooled allocation
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Remaining Left</span>
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block font-mono">
                {(dailyQuota - slotUsage.total).toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 mt-2 block">
                Ample headroom for pending dispatches
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Delivery Health</span>
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block font-mono">
                {stats.sentToday > 0 ? `${Math.round(((stats.sentToday - stats.failedToday) / stats.sentToday) * 100)}%` : '100%'}
              </span>
              <span className="text-xs text-slate-400 mt-2 block">
                {stats.failedToday} permanent failures • {stats.bouncedToday} bounces
              </span>
            </div>
          </div>

          {/* Multi-Provider Hierarchy Table */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fa-solid fa-layer-group text-indigo-600" />
              Multi-Provider Sending Quotas & Fallback Hierarchy
            </h3>
            <p className="text-xs text-slate-500">
              When the active transport reaches 95% capacity or experiences API unavailability, traffic automatically fails over to the standby provider.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-mono">
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Tier</th>
                    <th className="py-2.5 px-3">Daily Capacity</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Failover Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      Custom SMTP (Acct A + B)
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                        {activeProvider === 'smtp' ? `Active Primary (${activeSmtpSlot === 'smtp' ? 'A' : 'B'})` : 'Standby'}
                      </span>
                    </td>
                    <td className="py-3 px-3">4,000 / day</td>
                    <td className="py-3 px-3 text-emerald-600 font-bold">Operational</td>
                    <td className="py-3 px-3">Priority 1</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Amazon SES (ap-south-1)
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                        {activeProvider === 'ses' ? 'Active Primary' : 'Standby Tier 1'}
                      </span>
                    </td>
                    <td className="py-3 px-3">50,000 / day</td>
                    <td className="py-3 px-3 text-amber-600 dark:text-amber-400 font-bold">Not Operational</td>
                    <td className="py-3 px-3">Priority 2 (Failover)</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      Resend Cloud Email API
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {activeProvider === 'resend' ? 'Active Primary' : 'Standby Tier 2'}
                      </span>
                    </td>
                    <td className="py-3 px-3">50,000 / month</td>
                    <td className="py-3 px-3 text-slate-500">Configured</td>
                    <td className="py-3 px-3">Priority 3</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Google Workspace OAuth2
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {activeProvider === 'gmail' ? 'Active Primary' : 'Standby Tier 3'}
                      </span>
                    </td>
                    <td className="py-3 px-3">2,000 / day</td>
                    <td className="py-3 px-3 text-amber-500">Token Renewal Required</td>
                    <td className="py-3 px-3">Priority 4</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>
          )}

          {quotaSubTab === 'past' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {loadingPastUsage ? (
                <div className="py-12 text-center text-slate-400 animate-pulse">
                  <i className="fa-solid fa-spinner fa-spin text-2xl mb-2" />
                  <p className="text-xs">Loading historical data...</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Mails Sent ({pastUsageFilter}d)</span>
                      <span className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 block font-mono">{pastUsageStats.totalSent.toLocaleString()}</span>
                    </div>
                    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Average Daily Volume</span>
                      <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1 block font-mono">{pastUsageStats.avgDaily.toLocaleString()}</span>
                    </div>
                    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Avg Delivery Rate</span>
                      <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block font-mono">{pastUsageStats.deliveryRate.toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <i className="fa-solid fa-chart-column text-indigo-600" />
                          Day-to-Day Sending Volume
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Historical overview of outgoing email volume and quota utilization.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {pastUsageFilter === 'custom' && (
                          <div className="flex items-center gap-2 text-xs">
                            <input type="date" value={customDateRange.start} onChange={e => setCustomDateRange(prev => ({...prev, start: e.target.value}))} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none" />
                            <span className="text-slate-400">to</span>
                            <input type="date" value={customDateRange.end} onChange={e => setCustomDateRange(prev => ({...prev, end: e.target.value}))} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none" />
                          </div>
                        )}
                        <select
                          value={pastUsageFilter}
                          onChange={(e) => setPastUsageFilter(e.target.value as any)}
                          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        >
                          <option value="7">Last 7 Days</option>
                          <option value="14">Last 14 Days</option>
                          <option value="30">Last 30 Days</option>
                          <option value="90">Last 90 Days</option>
                          <option value="lifetime">Lifetime</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-5 pb-2 border-b border-slate-100 dark:border-slate-800/50">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">
                        <input type="checkbox" checked={pastUsageToggles.total} onChange={e => setPastUsageToggles(prev => ({...prev, total: e.target.checked}))} className="rounded text-amber-500 focus:ring-amber-500 bg-slate-100 border-slate-300" />
                        Total Attempted Trend
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">
                        <input type="checkbox" checked={pastUsageToggles.delivered} onChange={e => setPastUsageToggles(prev => ({...prev, delivered: e.target.checked}))} className="rounded text-emerald-500 focus:ring-emerald-500 bg-slate-100 border-slate-300" />
                        Delivered Trend
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">
                        <input type="checkbox" checked={pastUsageToggles.failed} onChange={e => setPastUsageToggles(prev => ({...prev, failed: e.target.checked}))} className="rounded text-rose-500 focus:ring-rose-500 bg-slate-100 border-slate-300" />
                        Failed Trend
                      </label>
                    </div>

                    {(() => {
                      const maxVol = Math.max(...pastUsageData.map(d => d.vol), 10);
                      const midVol = Math.round(maxVol / 2);
                      const totalDays = pastUsageData.length;
                      
                      const getInterval = (days: number) => {
                        if (days <= 7) return 1;
                        if (days <= 14) return 3;
                        if (days <= 30) return 7;
                        if (days <= 90) return 15;
                        if (days <= 180) return 30;
                        if (days <= 365) return 60;
                        return 120;
                      };
                      const interval = getInterval(totalDays);

                      const getTrendPoints = (key: 'vol' | 'delivered' | 'failed') => {
                        const trendData = pastUsageData.map((d, i, arr) => {
                          const window = arr.slice(Math.max(0, i - 2), i + 1);
                          return window.reduce((sum, item) => sum + item[key], 0) / window.length;
                        });
                        return trendData.map((avg, i) => {
                          const x = ((i + 0.5) / pastUsageData.length) * 100;
                          const y = maxVol > 0 ? 100 - (avg / maxVol * 100) : 100;
                          return `${x},${y}`;
                        }).join(' ');
                      };

                      return (
                        <div className="h-64 flex items-end gap-2 px-2 pb-6 border-b border-slate-100 dark:border-slate-800 relative pt-8">
                          {/* Y-axis labels */}
                          <div className="absolute left-0 top-8 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono pr-2 border-r border-slate-100 dark:border-slate-800">
                            <span>{maxVol}</span>
                            <span>{midVol}</span>
                            <span>0</span>
                          </div>
                          {/* Bars and Trendline */}
                          <div className="flex-1 flex items-end justify-between pl-8 h-full relative">
                            {pastUsageData.map((item, i) => (
                              <div key={i} className="flex flex-col justify-end items-center gap-1 group w-full px-0.5 h-full relative z-10">
                                <div 
                                  className="w-full bg-indigo-300 dark:bg-indigo-500/70 rounded-t-md relative hover:bg-indigo-400 dark:hover:bg-indigo-400/90 transition-colors" 
                                  style={{ height: `${maxVol > 0 ? (item.vol / maxVol) * 100 : 0}%`, minHeight: item.vol > 0 ? '4px' : '0' }}
                                >
                                  <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] px-2.5 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity font-mono pointer-events-none whitespace-nowrap z-30 flex flex-col items-center leading-tight shadow-xl">
                                    <span className="font-bold">{item.vol} total</span>
                                    <span className="text-[8.5px] text-slate-300 mt-0.5">{item.day}</span>
                                  </div>
                                </div>
                                {i % interval === 0 && (
                                  <span className="absolute -bottom-5 text-[10px] text-slate-500 font-medium whitespace-nowrap pointer-events-none">
                                    {item.day}
                                  </span>
                                )}
                              </div>
                            ))}
                            <svg className="absolute top-0 bottom-0 right-0 pointer-events-none z-20" style={{ left: '2rem', width: 'calc(100% - 2rem)', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                              {pastUsageToggles.total && <polyline points={getTrendPoints('vol')} fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-500 dark:text-amber-400" vectorEffect="non-scaling-stroke" strokeDasharray="6 6" />}
                              {pastUsageToggles.delivered && <polyline points={getTrendPoints('delivered')} fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500 dark:text-emerald-400" vectorEffect="non-scaling-stroke" />}
                              {pastUsageToggles.failed && <polyline points={getTrendPoints('failed')} fill="none" stroke="currentColor" strokeWidth="3" className="text-rose-500 dark:text-rose-400" vectorEffect="non-scaling-stroke" strokeDasharray="2 4" />}
                            </svg>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit Trail Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[90vw] h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <i className="fa-solid fa-clock-rotate-left text-indigo-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Email & Notification Center Audit Trail
                </h3>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {loadingAudit ? (
                <div className="py-12 text-center text-slate-400 animate-pulse">
                  <i className="fa-solid fa-spinner fa-spin text-2xl mb-2" />
                  <p className="text-xs">Loading audit records...</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <i className="fa-solid fa-inbox text-3xl mb-2 text-slate-300 dark:text-slate-700" />
                  <p className="text-sm font-medium">No recent audit log entries recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{log.action}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            by {log.actor_name || log.actor_email || 'System'}
                          </span>
                        </div>
                        {log.details && (
                          <pre className="mt-1 text-[11px] font-mono text-slate-500 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-lg">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-300 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
