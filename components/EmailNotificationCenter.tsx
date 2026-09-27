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
import {
  pingProviderConnection,
  dispatchLiveTestEmail,
  loadEmailNotificationSettings,
  saveEmailNotificationSettings,
  triggerEmailWorker,
  logEmailAuditAction
} from '../utils/emailNotificationService';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface EmailNotificationCenterProps {
  currentUser?: User | null;
  initialTab?: 'templates' | 'delivery' | 'setup' | 'quota';
  onNavigateToRequest?: (ticketId: string) => void;
}

export const EmailNotificationCenter: React.FC<EmailNotificationCenterProps> = ({
  currentUser,
  initialTab = 'setup',
  onNavigateToRequest
}) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'delivery' | 'setup' | 'quota'>(initialTab);
  const [templateSubTab, setTemplateSubTab] = useState<'templates' | 'cadence'>('templates');

  // Provider Settings State
  const [activeProvider, setActiveProvider] = useState<string>('smtp');
  const [selectedProviderCard, setSelectedProviderCard] = useState<string>('smtp');
  const [providerConfig, setProviderConfig] = useState<any>({
    smtp: {
      host: 'jc37vubwcvn9.hkph.mail-manager-smtp.amazonaws.com',
      port: 587,
      username: 'inp-xjixoqpi7g5fjchj7lbwkpmy',
      password: 'vZSR[99P*po=#bt-!?wiwwzP]nOF{W%U',
      senderEmail: 'travel@navgurukul.org',
      senderName: 'Navgurukul Travel Desk',
      replyTo: 'travel@navgurukul.org'
    },
    ses: {
      region: 'ap-south-1',
      smtpEndpoint: 'email-smtp.ap-south-1.amazonaws.com:587',
      accessKeyId: 'AKIA6GB5ELC7NAV24GUR',
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
    dailyQuota: 2000,
    warningThresholdPct: 80,
    criticalThresholdPct: 95,
    fallbackProvider: 'ses'
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

  const canEdit = currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    void initializeSettings();
    void fetchDeliveryMetrics();
  }, []);

  const initializeSettings = async () => {
    const data = await loadEmailNotificationSettings();
    if (data.activeProvider) {
      setActiveProvider(data.activeProvider);
      setSelectedProviderCard(data.activeProvider);
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
      console.warn('Metrics query notice:', err);
    }
  };

  const handlePingProvider = async (providerToPing?: string) => {
    const p = providerToPing || activeProvider;
    setPingLoading(true);
    try {
      const res = await pingProviderConnection(p, providerConfig[p]);
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

  const handleSaveProviderConfig = async () => {
    if (!canEdit) {
      toast.error('Only Administrators can modify email provider settings.');
      return;
    }

    try {
      await saveEmailNotificationSettings(
        {
          activeProvider,
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
      console.warn('Audit logs fetch notice:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Quota computations
  const dailyQuota = quotaSettings.dailyQuota || 2000;
  const quotaUsedPct = Math.min(100, Math.round((stats.sentToday / dailyQuota) * 100));
  const isQuotaWarning = quotaUsedPct >= (quotaSettings.warningThresholdPct || 80);
  const isQuotaCritical = quotaUsedPct >= (quotaSettings.criticalThresholdPct || 95);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 md:p-8 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shadow-inner flex-shrink-0 text-xl">
              <i className="fa-solid fa-envelope-open-text" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                  Email & Notification Center
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                  providerHealth?.ok !== false
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${providerHealth?.ok !== false ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {activeProvider.toUpperCase()} • {providerHealth?.latencyMs ? `${providerHealth.latencyMs}ms` : 'Active'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-400 max-w-2xl leading-relaxed">
                Centralized dispatch hub for Navgurukul Travel Desk lifecycle notifications, reminder cadence, multi-provider transport, and real-time delivery monitoring.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => handlePingProvider()}
              disabled={pingLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <i className={`fa-solid fa-signal ${pingLoading ? 'fa-spin' : ''}`} />
              {pingLoading ? 'Testing...' : `Ping ${activeProvider.toUpperCase()} API`}
            </button>

            <button
              onClick={openAuditLogs}
              className="px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-all"
              title="View Audit Trail"
            >
              <i className="fa-solid fa-clock-rotate-left" />
              <span>Audit Trail</span>
            </button>
          </div>
        </div>
      </div>

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
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-900/30 text-indigo-200 border border-indigo-500/20">
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
            onClick={() => setActiveTab('setup')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'setup'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fa-solid fa-sliders" />
            <span>Email Setup</span>
            <span className="text-[10px] text-slate-400 lowercase font-normal">(gmail, ses, resend, smtp)</span>
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
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              isQuotaCritical
                ? 'bg-rose-500 text-white'
                : isQuotaWarning
                ? 'bg-amber-500 text-white'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}>
              {stats.sentToday} / {dailyQuota}
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* 1. Google Workspace */}
              <div
                onClick={() => setSelectedProviderCard('gmail')}
                className={`relative p-5 rounded-xl border cursor-pointer transition-all ${
                  selectedProviderCard === 'gmail'
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
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Google Workspace</h4>
                      <p className="text-[11px] text-slate-500">OAuth2 REST API</p>
                    </div>
                  </div>
                  {activeProvider === 'gmail' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]" title="Currently Active Provider">
                      <i className="fa-solid fa-check" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                  Googleapis OAuth 2.0 client with automated token renewal for workspace sender accounts.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Quota: 2,000 / day</span>
                  <span className={activeProvider === 'gmail' ? 'text-indigo-600 font-bold' : ''}>
                    {activeProvider === 'gmail' ? '● Active' : 'Standby'}
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

              {/* 3. Resend */}
              <div
                onClick={() => setSelectedProviderCard('resend')}
                className={`relative p-5 rounded-xl border cursor-pointer transition-all ${
                  selectedProviderCard === 'resend'
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold flex items-center justify-center text-xs">
                      R
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Resend</h4>
                      <p className="text-[11px] text-slate-500">Cloud Email API</p>
                    </div>
                  </div>
                  {activeProvider === 'resend' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]" title="Currently Active Provider">
                      <i className="fa-solid fa-check" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                  Developer transactional API with open/click webhooks and edge delivery.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Quota: 50,000 / mo</span>
                  <span className={activeProvider === 'resend' ? 'text-indigo-600 font-bold' : ''}>
                    {activeProvider === 'resend' ? '● Active' : 'Standby Tier 2'}
                  </span>
                </div>
              </div>

              {/* 4. Custom SMTP */}
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
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs">
                      SMTP
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Custom SMTP</h4>
                      <p className="text-[11px] text-slate-500">TLS Port 587 / 465</p>
                    </div>
                  </div>
                  {activeProvider === 'smtp' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]" title="Currently Active Provider">
                      <i className="fa-solid fa-check" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                  AWS Mail Manager, Google Workspace SMTP relay, or corporate mail server transport.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Quota: 2,000 / day</span>
                  <span className={activeProvider === 'smtp' ? 'text-indigo-600 font-bold' : ''}>
                    {activeProvider === 'smtp' ? '● Active' : 'Standby'}
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
                  {activeProvider !== selectedProviderCard && (
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

              {/* A. Custom SMTP Form */}
              {selectedProviderCard === 'smtp' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                    <strong>Direct TLS/STARTTLS Transport:</strong> Supports AWS Mail Manager SMTP endpoint, Google Workspace Relay (smtp.gmail.com), or any corporate MTA.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        SMTP Host / Endpoint
                      </label>
                      <input
                        type="text"
                        value={providerConfig.smtp.host}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            smtp: { ...providerConfig.smtp, host: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="e.g. jc37vubwcvn9.hkph.mail-manager-smtp.amazonaws.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Port & Security
                      </label>
                      <input
                        type="number"
                        value={providerConfig.smtp.port}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            smtp: { ...providerConfig.smtp, port: Number(e.target.value) }
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
                        SMTP Username
                      </label>
                      <input
                        type="text"
                        value={providerConfig.smtp.username || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            smtp: { ...providerConfig.smtp, username: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="e.g. inp-xjixoqpi7g5fjchj7lbwkpmy"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        SMTP Password / Auth Token
                      </label>
                      <input
                        type="password"
                        value={providerConfig.smtp.password || ''}
                        onChange={(e) =>
                          setProviderConfig({
                            ...providerConfig,
                            smtp: { ...providerConfig.smtp, password: e.target.value }
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                        placeholder="••••••••••••••••"
                      />
                    </div>
                  </div>
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
                  Default Sender Profile & Routing
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      From Name
                    </label>
                    <input
                      type="text"
                      value={providerConfig[selectedProviderCard]?.senderName || 'Navgurukul Travel Desk'}
                      onChange={(e) =>
                        setProviderConfig({
                          ...providerConfig,
                          [selectedProviderCard]: {
                            ...providerConfig[selectedProviderCard],
                            senderName: e.target.value
                          }
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      From Email Address
                    </label>
                    <input
                      type="email"
                      value={providerConfig[selectedProviderCard]?.senderEmail || 'travel@navgurukul.org'}
                      onChange={(e) =>
                        setProviderConfig({
                          ...providerConfig,
                          [selectedProviderCard]: {
                            ...providerConfig[selectedProviderCard],
                            senderEmail: e.target.value
                          }
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Reply-To Address
                    </label>
                    <input
                      type="email"
                      value={providerConfig[selectedProviderCard]?.replyTo || 'travel@navgurukul.org'}
                      onChange={(e) =>
                        setProviderConfig({
                          ...providerConfig,
                          [selectedProviderCard]: {
                            ...providerConfig[selectedProviderCard],
                            replyTo: e.target.value
                          }
                        })
                      }
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
                <button
                  type="button"
                  onClick={handleSaveProviderConfig}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <i className="fa-solid fa-floppy-disk" />
                  Save Provider Configuration
                </button>
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
          {/* Daily Quota Progress Bar */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-chart-pie text-indigo-600" />
                  Daily Quota Consumption Progress
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current dispatch count against the {activeProvider.toUpperCase()} daily limit ({dailyQuota} emails / 24h cycle).
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono text-slate-500">
                  Status: <strong>{stats.sentToday}</strong> of {dailyQuota} used ({dailyQuota - stats.sentToday} remaining)
                </span>
              </div>
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-500 ${
                  isQuotaCritical ? 'bg-rose-500' : isQuotaWarning ? 'bg-amber-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${Math.max(2, quotaUsedPct)}%` }}
              />
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
                Provider: {activeProvider.toUpperCase()} (Resets at 00:00 UTC)
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Used Today</span>
              <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1 block font-mono">
                {stats.sentToday}
              </span>
              <span className="text-xs text-slate-400 mt-2 block">
                {quotaUsedPct}% of daily allocation consumed
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Remaining Left</span>
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block font-mono">
                {(dailyQuota - stats.sentToday).toLocaleString()}
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
                      Custom SMTP / AWS Mail Manager
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                        {activeProvider === 'smtp' ? 'Active Primary' : 'Standby'}
                      </span>
                    </td>
                    <td className="py-3 px-3">2,000 / day</td>
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
                    <td className="py-3 px-3 text-emerald-600 font-bold">Operational</td>
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

      {/* Audit Trail Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
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
