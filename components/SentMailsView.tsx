import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import Card from './Card';
import StatCard from './StatCard';

export interface EmailQueueRecord {
  id: string;
  recipient?: string;
  recipients?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  status: 'Pending' | 'Processing' | 'Sent' | 'Failed';
  created_at: string;
  processed_at?: string;
  sent_at?: string;
  available_at?: string;
  attempt_count?: number;
  retry_count?: number;
  last_error?: string;
  provider?: string;
  provider_message_id?: string;
  to_status?: string;
  idempotency_key?: string;
}

interface SentMailsViewProps {
  currentUser?: User | null;
  onTabChange?: (tab: string) => void;
  defaultSubTab?: 'logs' | 'test-email';
}

export const SentMailsView: React.FC<SentMailsViewProps> = ({
  currentUser,
  defaultSubTab = 'logs'
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'test-email'>(defaultSubTab);
  const [emails, setEmails] = useState<EmailQueueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailQueueRecord | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'preview' | 'html' | 'details'>('preview');

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'Sent' | 'Pending' | 'Processing' | 'Failed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'production' | 'test'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Available Templates for Test Sender
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');

  // Manual Trigger Worker Loading State
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Test Email State
  const [testRecipient, setTestRecipient] = useState('');
  const [testSubject, setTestSubject] = useState(`Travel Desk Delivery Test - ${new Date().toLocaleTimeString()}`);
  const [testBody, setTestBody] = useState(`
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #4f46e5; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Navgurukul Travel Desk</h1>
    <p style="color: #64748b; margin-top: 4px; font-size: 13px;">Automated Email Notification Test</p>
  </div>
  
  <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: 600;">✓ Email Delivery Operational</p>
    <p style="margin: 6px 0 0 0; color: #475569; font-size: 13px; line-height: 1.5;">This email confirms that the Navgurukul Travel Desk Gmail API email provider and Supabase Edge Function worker are connected and transmitting correctly.</p>
  </div>

  <div style="margin: 20px 0; font-size: 13px; color: #334155;">
    <p><strong>Environment:</strong> Production (Live)</p>
    <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Sent To:</strong> {{recipient}}</p>
  </div>

  <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
    Navgurukul Travel Desk System Notification • Do not reply directly to this automated test
  </div>
</div>
  `.trim());
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Fetch email queue records and templates
  const fetchEmailLogs = async () => {
    setLoading(true);
    try {
      const [queueRes, templateRes] = await Promise.all([
        supabase
          .from('email_queue')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('mail_templates')
          .select('id, name, subject, body, status_trigger, audience, status')
          .order('name', { ascending: true })
      ]);

      if (queueRes.error) throw queueRes.error;
      setEmails((queueRes.data as any) || []);

      if (!templateRes.error && templateRes.data) {
        setAvailableTemplates(templateRes.data);
      }
    } catch (err: any) {
      console.error('Error fetching email queue logs:', err);
      toast.error('Failed to load email logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailLogs();
  }, []);

  // Handle template selection change
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'custom') {
      setTestSubject(`Travel Desk Delivery Test - ${new Date().toLocaleTimeString()}`);
      return;
    }
    const t = availableTemplates.find(tpl => tpl.id === templateId);
    if (t) {
      setTestSubject(`[TEST] ${t.subject || t.name}`);
      let sampleBody = t.body || '';
      sampleBody = sampleBody
        .replace(/\{\{request_id\}\}/g, 'TRV-TEST-001')
        .replace(/\{\{submissionId\}\}/g, 'TRV-TEST-001')
        .replace(/\{\{requester_name\}\}/g, currentUser?.name || 'Test User')
        .replace(/\{\{requesterName\}\}/g, currentUser?.name || 'Test User')
        .replace(/\{\{origin\}\}/g, 'Pune')
        .replace(/\{\{destination\}\}/g, 'Bangalore')
        .replace(/\{\{departure_date\}\}/g, '2026-09-15')
        .replace(/\{\{travel_mode\}\}/g, 'Flight')
        .replace(/\{\{purpose\}\}/g, 'Annual Team Review')
        .replace(/\{\{estimated_cost\}\}/g, '4500')
        .replace(/\{\{portal_url\}\}/g, 'https://travel.navgurukul.org');
      setTestBody(sampleBody);
      toast.info(`Loaded "${t.name}" template with sample data`);
    }
  };

  // Filtered & Paginated Emails
  const filteredEmails = useMemo(() => {
    return emails.filter(e => {
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      const isTestMail = e.to_status === 'Test Email' || (e.idempotency_key && e.idempotency_key.startsWith('test-'));
      const matchesType = typeFilter === 'all' || (typeFilter === 'test' ? isTestMail : !isTestMail);

      const rec = Array.isArray(e.recipients) ? e.recipients.join(' ') : (e.recipient || '');
      const query = searchQuery.toLowerCase();
      const matchesSearch = !query ||
        rec.toLowerCase().includes(query) ||
        e.subject.toLowerCase().includes(query) ||
        (e.to_status && e.to_status.toLowerCase().includes(query)) ||
        (e.provider_message_id && e.provider_message_id.toLowerCase().includes(query));

      return matchesStatus && matchesType && matchesSearch;
    });
  }, [emails, statusFilter, typeFilter, searchQuery]);

  const totalPages = Math.ceil(filteredEmails.length / itemsPerPage) || 1;
  const paginatedEmails = useMemo(() => {
    return filteredEmails.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredEmails, currentPage]);

  // Aggregate Metrics
  const stats = useMemo(() => {
    const total = emails.length;
    const sent = emails.filter(e => e.status === 'Sent').length;
    const pending = emails.filter(e => e.status === 'Pending' || e.status === 'Processing').length;
    const failed = emails.filter(e => e.status === 'Failed').length;
    const successRate = total > 0 ? Math.round((sent / (total - pending || 1)) * 100) : 100;
    return { total, sent, pending, failed, successRate };
  }, [emails]);

  // 1-Click Trigger Delivery Worker Now via Supabase Edge Function
  const handleProcessQueueNow = async () => {
    setIsProcessingQueue(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-email-queue', {
        body: { batchSize: 25 }
      });

      if (error) throw error;

      const result = data?.results;
      if (result) {
        toast.success(`Queue processed: ${result.sent} sent, ${result.retried} retried, ${result.failed} failed.`);
      } else {
        toast.success('Triggered email delivery queue worker successfully.');
      }
      await fetchEmailLogs();
    } catch (err: any) {
      console.error('Failed to trigger process-email-queue:', err);
      toast.error('Worker trigger failed: ' + (err.message || 'Check Edge Function status in Supabase'));
    } finally {
      setIsProcessingQueue(false);
    }
  };

  // Retry an individual failed email
  const handleRetryEmail = async (emailId: string) => {
    setRetryingId(emailId);
    try {
      const { error } = await supabase
        .from('email_queue')
        .update({
          status: 'Pending',
          available_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', emailId);

      if (error) throw error;

      toast.info('Marked email as Pending. Processing now...');
      await handleProcessQueueNow();
    } catch (err: any) {
      toast.error('Failed to retry email: ' + err.message);
    } finally {
      setRetryingId(null);
    }
  };

  // Clear all queue items
  const [isClearingQueue, setIsClearingQueue] = useState(false);
  const handleClearQueue = async () => {
    if (!window.confirm('Are you sure you want to clear all outgoing email records from the queue? This will purge all old test/pending/sent logs.')) {
      return;
    }
    setIsClearingQueue(true);
    try {
      const { error } = await supabase
        .from('email_queue')
        .delete()
        .gt('created_at', '1970-01-01T00:00:00Z');

      if (error) throw error;

      toast.success('Outgoing email queue cleared successfully.');
      await fetchEmailLogs();
    } catch (err: any) {
      toast.error('Failed to clear queue: ' + err.message);
    } finally {
      setIsClearingQueue(false);
    }
  };

  // Quick fill "Send to Yourself"
  const handleFillSelfEmail = () => {
    if (currentUser?.email) {
      setTestRecipient(currentUser.email);
      toast.success(`Recipient set to ${currentUser.email}`);
    } else {
      toast.error('No logged-in user email found.');
    }
  };

  // Send Test Email
  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient || !testRecipient.includes('@')) {
      toast.error('Please enter a valid recipient email address.');
      return;
    }
    if (!testSubject) {
      toast.error('Please enter a test email subject.');
      return;
    }

    setIsSendingTest(true);
    try {
      const renderedHtml = testBody.replace(/{{recipient}}/g, testRecipient);

      // 1. Insert into email_queue
      const { data: queueData, error: queueError } = await supabase
        .from('email_queue')
        .insert([{
          recipients: [testRecipient.trim()],
          subject: testSubject,
          body: renderedHtml,
          status: 'Pending',
          to_status: 'Test Email',
          idempotency_key: `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        }])
        .select()
        .single();

      if (queueError) throw queueError;

      toast.info('Test email queued. Invoking Gmail delivery worker...');

      // 2. Trigger worker immediately for instant delivery
      const { data: workerData, error: workerErr } = await supabase.functions.invoke('process-email-queue', {
        body: { batchSize: 10 }
      });

      if (workerErr) {
        toast.warning('Email was queued, but worker invocation returned: ' + workerErr.message);
      } else {
        const sentCount = workerData?.results?.sent || 0;
        if (sentCount > 0) {
          toast.success(`🎉 Test email delivered successfully to ${testRecipient}!`);
        } else {
          toast.info('Test email queued for delivery.');
        }
      }

      await fetchEmailLogs();
      setActiveSubTab('logs');
    } catch (err: any) {
      console.error('Error sending test email:', err);
      toast.error('Test email failed: ' + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const getStatusBadge = (status: EmailQueueRecord['status']) => {
    switch (status) {
      case 'Sent':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
            <i className="fa-solid fa-circle-check text-xs"></i> Sent
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
            <i className="fa-solid fa-clock text-xs animate-pulse"></i> Pending
          </span>
        );
      case 'Processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40">
            <i className="fa-solid fa-spinner fa-spin text-xs"></i> Processing
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40">
            <i className="fa-solid fa-triangle-exclamation text-xs"></i> Failed
          </span>
        );
      default:
        return <span className="text-xs font-bold text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <i className="fa-solid fa-paper-plane text-indigo-600"></i>
            Outgoing Mails & Delivery
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Real-time tracking of queued, in-transit, and delivered automated notifications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {emails.length > 0 && (
            <button
              onClick={handleClearQueue}
              disabled={isClearingQueue}
              className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-3.5 py-2.5 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
              title="Clear all old logs from the database table"
            >
              <i className={`fa-solid fa-trash-can ${isClearingQueue ? 'fa-spin' : ''}`}></i>
              Clear Queue
            </button>
          )}
          <button
            onClick={fetchEmailLogs}
            disabled={loading}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm active:scale-95 transition-all flex items-center gap-2"
          >
            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`}></i>
            Refresh
          </button>
          <button
            onClick={handleProcessQueueNow}
            disabled={isProcessingQueue}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isProcessingQueue ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i> Processing Queue...
              </>
            ) : (
              <>
                <i className="fa-solid fa-bolt"></i> Trigger Worker Now
              </>
            )}
          </button>
        </div>
      </header>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Outgoing"
          value={stats.total}
          icon={<i className="fa-solid fa-envelope-open-text text-indigo-500"></i>}
          description="All time queue volume"
        />
        <StatCard
          title="Delivered Successfully"
          value={stats.sent}
          icon={<i className="fa-solid fa-circle-check text-emerald-500"></i>}
          description={`${stats.successRate}% delivery success rate`}
        />
        <StatCard
          title="In-Flight / Queued"
          value={stats.pending}
          icon={<i className="fa-solid fa-clock text-amber-500"></i>}
          description="Waiting for next worker cycle"
        />
        <StatCard
          title="Delivery Failures"
          value={stats.failed}
          icon={<i className="fa-solid fa-triangle-exclamation text-rose-500"></i>}
          description="Exceeded retry ceiling"
        />
      </div>

      {/* Subtabs: Sent Logs vs Send Test Email */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveSubTab('logs')}
          className={`py-4 px-6 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${
            activeSubTab === 'logs'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <i className="fa-solid fa-list-ul text-xs"></i>
          Delivery Logs & Queue ({filteredEmails.length})
        </button>
        <button
          onClick={() => setActiveSubTab('test-email')}
          className={`py-4 px-6 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${
            activeSubTab === 'test-email'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <i className="fa-solid fa-paper-plane text-xs"></i>
          Send Test Email
        </button>
      </div>

      {activeSubTab === 'logs' ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Controls: Search & Filter */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Search recipient, subject, or message ID..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-500 outline-none text-slate-700 dark:text-slate-200"
                />
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-bold text-slate-400 hover:text-rose-500"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Status & Type Filter Buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Type Filter */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {(['all', 'production', 'test'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setTypeFilter(t);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-bold capitalize transition-all ${
                      typeFilter === t
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {t === 'all' ? 'All Types' : t === 'production' ? 'Live Production' : 'Test Mails'}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="flex flex-wrap gap-1">
                {(['all', 'Sent', 'Pending', 'Processing', 'Failed'] as const).map(status => {
                  const count = status === 'all'
                    ? emails.length
                    : emails.filter(e => e.status === status).length;
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        setStatusFilter(status);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        statusFilter === status
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {status === 'all' ? 'All' : status} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Outgoing Mail Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-400 uppercase tracking-widest border-b dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Recipient</th>
                    <th className="px-6 py-4">Subject</th>
                    <th className="px-6 py-4">Provider</th>
                    <th className="px-6 py-4">Queued / Sent</th>
                    <th className="px-6 py-4">Attempts</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {paginatedEmails.map(item => {
                    const recipientList = Array.isArray(item.recipients) && item.recipients.length > 0
                      ? item.recipients
                      : item.recipient ? [item.recipient] : ['—'];
                    const isFailed = item.status === 'Failed';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                        onClick={() => setSelectedEmail(item)}
                      >
                        <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs">
                              {recipientList[0]?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 dark:text-white truncate max-w-[200px]">
                                {recipientList.join(', ')}
                              </p>
                              {item.template_name && (
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                  {item.template_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                          <div className="truncate max-w-[260px]" title={item.subject}>
                            {item.subject}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {item.provider || 'gmail'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                          {item.sent_at
                            ? new Date(item.sent_at).toLocaleString()
                            : new Date(item.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-slate-600 dark:text-slate-400">
                          {item.attempt_count || item.retry_count || 1} / 5
                        </td>
                        <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {isFailed && (
                              <button
                                onClick={() => handleRetryEmail(item.id)}
                                disabled={retryingId === item.id}
                                className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 rounded text-xs font-bold border border-rose-200 dark:border-rose-900 transition-all flex items-center gap-1"
                                title="Retry send"
                              >
                                <i className={`fa-solid fa-rotate-right text-xs ${retryingId === item.id ? 'fa-spin' : ''}`}></i>
                                Retry
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedEmail(item)}
                              className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 rounded text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <i className="fa-solid fa-eye text-xs"></i> View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedEmails.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-400 font-medium italic">
                        {loading ? 'Loading outgoing emails...' : 'No outgoing emails found for the selected criteria.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  <i className="fa-solid fa-chevron-left mr-1"></i> Previous
                </button>
                <span className="text-xs font-bold text-slate-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  Next <i className="fa-solid fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* --- SEND TEST EMAIL FORM --- */
        <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
          <Card className="p-8 space-y-6">
            <div className="flex items-center justify-between border-b dark:border-slate-800 pb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Send a Test Email</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Validate that the Gmail API provider and Edge Function worker are transmitting emails properly.
                </p>
              </div>
              <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-bold">
                Live Delivery Check
              </span>
            </div>

            <form onSubmit={handleSendTestEmail} className="space-y-5">
              {/* Template Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 block">
                  Select Mail Template to Test
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={e => handleSelectTemplate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-600 outline-none text-slate-900 dark:text-white transition-all font-medium"
                >
                  <option value="custom">-- Custom Test Email (Default Diagnostic HTML) --</option>
                  {availableTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status_trigger || 'General'} • {t.audience || 'employee'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Recipient Email Address <span className="text-rose-500">*</span>
                  </label>
                  {currentUser?.email && (
                    <button
                      type="button"
                      onClick={handleFillSelfEmail}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <i className="fa-solid fa-user-check"></i> Send to yourself ({currentUser.email})
                    </button>
                  )}
                </div>
                <input
                  type="email"
                  required
                  placeholder="e.g. employee@navgurukul.org"
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-600 outline-none text-slate-900 dark:text-white transition-all font-medium"
                />
              </div>

              {/* Subject Field */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 block">
                  Subject Line <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Email Subject"
                  value={testSubject}
                  onChange={e => setTestSubject(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:border-indigo-600 outline-none text-slate-900 dark:text-white transition-all font-medium"
                />
              </div>

              {/* Body Field */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 block">
                  HTML Body Content
                </label>
                <textarea
                  rows={8}
                  value={testBody}
                  onChange={e => setTestBody(e.target.value)}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:border-indigo-600 outline-none transition-all leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('logs')}
                  className="px-5 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingTest}
                  className="bg-indigo-600 text-white px-7 py-3 rounded-lg text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSendingTest ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin"></i> Transmitting Email...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane"></i> Send Test Mail Now
                    </>
                  )}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Detailed Email Inspector Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSelectedEmail(null)}></div>
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <header className="px-8 py-5 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white truncate max-w-md">
                    {selectedEmail.subject}
                  </h3>
                  {getStatusBadge(selectedEmail.status)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Queue ID: {selectedEmail.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </header>

            {/* Error Banner if Failed */}
            {selectedEmail.status === 'Failed' && (
              <div className="px-8 py-3 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/40 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-400 font-medium">
                  <i className="fa-solid fa-circle-exclamation text-rose-500"></i>
                  <span><strong>Failure Error:</strong> {selectedEmail.last_error || 'Delivery rejected by provider'}</span>
                </div>
                <button
                  onClick={() => handleRetryEmail(selectedEmail.id)}
                  disabled={retryingId === selectedEmail.id}
                  className="px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold hover:bg-rose-700 transition-all flex-shrink-0 flex items-center gap-1.5"
                >
                  <i className={`fa-solid fa-rotate-right ${retryingId === selectedEmail.id ? 'fa-spin' : ''}`}></i>
                  Retry Now
                </button>
              </div>
            )}

            {/* Metadata Bar */}
            <div className="px-8 py-4 bg-slate-50/50 dark:bg-slate-800/20 border-b dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Recipients</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                  {Array.isArray(selectedEmail.recipients) ? selectedEmail.recipients.join(', ') : selectedEmail.recipient}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Provider / Msg ID</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate font-mono">
                  {selectedEmail.provider || 'gmail'} {selectedEmail.provider_message_id ? `(${selectedEmail.provider_message_id})` : ''}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Queued At</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                  {new Date(selectedEmail.created_at).toLocaleTimeString()}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Sent At</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                  {selectedEmail.sent_at ? new Date(selectedEmail.sent_at).toLocaleTimeString() : '—'}
                </p>
              </div>
            </div>

            {/* Tabs for Preview / HTML / Raw Data */}
            <div className="flex border-b dark:border-slate-800 px-8 bg-white dark:bg-slate-900">
              <button
                onClick={() => setInspectorTab('preview')}
                className={`py-3 px-4 font-bold text-xs border-b-2 transition-all ${
                  inspectorTab === 'preview'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Rendered Preview
              </button>
              <button
                onClick={() => setInspectorTab('html')}
                className={`py-3 px-4 font-bold text-xs border-b-2 transition-all ${
                  inspectorTab === 'html'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Raw HTML
              </button>
              <button
                onClick={() => setInspectorTab('details')}
                className={`py-3 px-4 font-bold text-xs border-b-2 transition-all ${
                  inspectorTab === 'details'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Payload JSON
              </button>
            </div>

            {/* Inspector Content */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-slate-950/20">
              {inspectorTab === 'preview' ? (
                <div
                  className="p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm prose dark:prose-invert max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                />
              ) : inspectorTab === 'html' ? (
                <pre className="p-4 bg-slate-900 text-slate-200 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {selectedEmail.body}
                </pre>
              ) : (
                <pre className="p-4 bg-slate-900 text-emerald-400 rounded-lg text-xs font-mono overflow-x-auto">
                  {JSON.stringify(selectedEmail, null, 2)}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <footer className="px-8 py-4 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-end">
              <button
                onClick={() => setSelectedEmail(null)}
                className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default SentMailsView;
