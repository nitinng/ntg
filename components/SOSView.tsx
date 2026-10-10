import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Card from './Card';
import { PageBanner } from './PageBanner';
import { Toggle } from './Toggle';
import { User, UserRole } from '../types';
import {
  SOS_CATEGORY_LABELS,
  SOS_SEVERITY_ICONS,
  SOS_SEVERITY_LABELS,
  SosCategory,
  SosSeverity,
  getSosSpec,
  sosCodesByCategory
} from '../utils/sos/catalog';
import { SosSettings, formatAlertText, parseChannelEmails } from '../utils/sos/alertRules';
import { DeskNotificationSettings } from '../utils/desk/notificationSettings';
import { DeskDigest, formatAge } from '../utils/desk/digest';
import {
  SosAlert,
  SosStatus,
  acknowledgeSosAlert,
  downloadDigestPdf,
  fetchDeskDigest,
  fetchNotificationSettings,
  fetchSosAlerts,
  fetchSosSettings,
  fetchSosSummary,
  reopenSosAlert,
  resolveSosAlert,
  saveNotificationSettings,
  saveSosSettings,
  sendDeskDigestNow,
  sendSosTestAlert,
  SosSummary
} from '../utils/sos/sosService';

/**
 * SOS — the one screen that answers "has anything failed, and did anyone hear
 * about it?", and where the desk's two Slack channels are configured.
 *
 * Alerting pushes to Slack, but the channel is a notification, not a record:
 * alerts suppressed by a threshold, folded into a repeat, or lost because the
 * email transport was the thing that broke are all here regardless. That is
 * the point of the screen — the channel can be missed, this cannot.
 *
 * Admin only, by request: it reads every failure across the desk, including
 * context quoting other people's requests, and its settings decide where that
 * goes. Row-level security enforces the same thing, so a narrower role sees an
 * empty feed rather than a partial one.
 */

/** One address per line. A textarea beats chips when the list is pasted. */
const ChannelEmailsField = ({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint: string;
  value: string[];
  onChange: (next: string[]) => void;
}) => (
  <div className="space-y-2">
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
      {label}
    </label>
    <textarea
      rows={Math.max(2, value.length + 1)}
      value={value.join('\n')}
      onChange={e => onChange(parseChannelEmails(e.target.value))}
      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
      placeholder="channel-name-xxxx@workspace.slack.com"
    />
    <p className="text-[11px] text-slate-400">
      {hint} One address per line — {value.length || 'no'} configured.
    </p>
  </div>
);

interface SOSViewProps {
  currentUser: User;
}

const SEVERITY_STYLES: Record<SosSeverity, { chip: string; bar: string }> = {
  critical: {
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900',
    bar: 'bg-rose-500'
  },
  high: {
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-900',
    bar: 'bg-orange-500'
  },
  warning: {
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    bar: 'bg-amber-500'
  },
  info: {
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-900',
    bar: 'bg-sky-500'
  }
};

const STATUS_STYLES: Record<SosStatus, string> = {
  Open: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  Acknowledged: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  Resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
};

const relativeTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return '—';
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/** How the Slack push ended, in words the reader can act on. */
const deliveryLabel = (alert: SosAlert): { text: string; tone: string; icon: string } => {
  switch (alert.notificationStatus) {
    case 'Queued':
      return { text: 'Pushed to Slack', tone: 'text-emerald-600 dark:text-emerald-400', icon: 'fa-paper-plane' };
    case 'Failed':
      return { text: `Not delivered — ${alert.notificationReason || 'send failed'}`, tone: 'text-rose-600 dark:text-rose-400', icon: 'fa-triangle-exclamation' };
    case 'Suppressed':
      return { text: `Recorded only — ${alert.notificationReason || 'suppressed'}`, tone: 'text-slate-500 dark:text-slate-400', icon: 'fa-bell-slash' };
    default:
      return { text: 'Pending', tone: 'text-slate-500 dark:text-slate-400', icon: 'fa-clock' };
  }
};

export const SOSView = ({ currentUser }: SOSViewProps) => {
  // Admin only — and the database agrees, so this is a UI nicety rather than
  // the control.
  const canTriage = currentUser.role === UserRole.ADMIN;

  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [summary, setSummary] = useState<SosSummary>({ openCritical: 0, open: 0, last24h: 0, undelivered: 0 });
  const [settings, setSettings] = useState<SosSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<SosSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  const [notifSettings, setNotifSettings] = useState<DeskNotificationSettings | null>(null);
  const [draftNotif, setDraftNotif] = useState<DeskNotificationSettings | null>(null);
  const [digest, setDigest] = useState<DeskDigest | null>(null);
  const [isSendingDigest, setIsSendingDigest] = useState(false);

  const [statusFilter, setStatusFilter] = useState<SosStatus | 'all'>('Open');
  const [severityFilter, setSeverityFilter] = useState<SosSeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<SosCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rows, stats] = await Promise.all([
        fetchSosAlerts({ status: statusFilter, severity: severityFilter, category: categoryFilter, search }),
        fetchSosSummary()
      ]);
      setAlerts(rows);
      setSummary(stats);
    } catch (err: any) {
      // Never raise an SOS from the SOS console: a console that cannot load is
      // a read problem, and alerting about it would only fill the feed it
      // cannot show.
      toast.error(err.message || 'Could not load SOS alerts');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, severityFilter, categoryFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const [alerting, notifications] = await Promise.all([
        fetchSosSettings(),
        fetchNotificationSettings()
      ]);
      setSettings(alerting);
      setDraftSettings(alerting);
      setNotifSettings(notifications);
      setDraftNotif(notifications);
    })();
  }, []);

  // Today's figures, so an admin can see what the channel will be told before
  // it is told. Loaded only when the settings panel is open — it is a scan over
  // the desk, not something to run on every render of the alert feed.
  useEffect(() => {
    if (!showSettings || digest) return;
    void (async () => {
      try {
        setDigest(await fetchDeskDigest());
      } catch (err: any) {
        toast.error(err.message || 'Could not build the digest preview');
      }
    })();
  }, [showSettings, digest]);

  const handleAcknowledge = async (alert: SosAlert) => {
    try {
      await acknowledgeSosAlert(alert.id, currentUser.email);
      toast.success('Alert acknowledged');
      void load();
    } catch (err: any) {
      toast.error(err.message || 'Could not acknowledge this alert');
    }
  };

  const handleResolve = async (alert: SosAlert) => {
    const note = window.prompt('What fixed it? (optional, kept with the alert)') ?? undefined;
    try {
      await resolveSosAlert(alert.id, currentUser.email, note);
      toast.success('Alert resolved');
      void load();
    } catch (err: any) {
      toast.error(err.message || 'Could not resolve this alert');
    }
  };

  const handleReopen = async (alert: SosAlert) => {
    try {
      await reopenSosAlert(alert.id);
      toast.success('Alert reopened');
      void load();
    } catch (err: any) {
      toast.error(err.message || 'Could not reopen this alert');
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await sendSosTestAlert(currentUser.email);
      if (result.delivered) {
        toast.success('Test alert pushed — check the Slack channel');
      } else {
        toast.warning(`Test alert recorded but not pushed: ${result.reason || 'suppressed'}`);
      }
      void load();
    } catch (err: any) {
      toast.error(err.message || 'Could not send the test alert');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!draftSettings) return;
    setIsSaving(true);
    try {
      await saveSosSettings(draftSettings, currentUser.email);
      setSettings(draftSettings);
      toast.success('Alerting settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Could not save alerting settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!draftNotif) return;
    setIsSaving(true);
    try {
      await saveNotificationSettings(draftNotif, currentUser.email);
      setNotifSettings(draftNotif);
      toast.success('Notification settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Could not save notification settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendDigest = async () => {
    setIsSendingDigest(true);
    try {
      const result = await sendDeskDigestNow();
      if (result.sent) {
        toast.success('Digest queued to the notifications channel');
      } else {
        toast.warning(`Digest not sent: ${result.reason || 'disabled'}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not send the digest');
    } finally {
      setIsSendingDigest(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const current = digest || (await fetchDeskDigest());
      setDigest(current);
      downloadDigestPdf(current);
    } catch (err: any) {
      toast.error(err.message || 'Could not build the report');
    }
  };

  const toggleMutedCategory = (category: SosCategory) => {
    if (!draftSettings) return;
    const muted = draftSettings.mutedCategories.includes(category)
      ? draftSettings.mutedCategories.filter(c => c !== category)
      : [...draftSettings.mutedCategories, category];
    setDraftSettings({ ...draftSettings, mutedCategories: muted });
  };

  const catalogue = useMemo(() => sosCodesByCategory().filter(group => group.codes.length > 0), []);
  const monitoredCount = useMemo(() => catalogue.reduce((sum, g) => sum + g.codes.length, 0), [catalogue]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageBanner
        title="SOS"
        description="Every failure the system can detect, recorded here and pushed to the automation Slack channel. Nothing fails silently."
        icon="fa-tower-broadcast"
        gradient="from-rose-700 via-rose-600 to-orange-500 dark:from-rose-950 dark:via-rose-900 dark:to-orange-900"
      >
        <button
          onClick={handleTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold border border-white/20 backdrop-blur-sm transition-all active:scale-95 disabled:opacity-50"
        >
          <i className={`fa-solid ${isTesting ? 'fa-spinner fa-spin' : 'fa-vial'}`}></i>
          Send Test Alert
        </button>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-rose-700 hover:bg-rose-50 rounded-lg text-sm font-black shadow-lg transition-all active:scale-95"
        >
          <i className="fa-solid fa-rotate"></i>
          Refresh
        </button>
      </PageBanner>

      {/* Headline figures. "Undelivered" is the one that says the channel is
          not enough on its own right now. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Open Critical</p>
          <p className={`text-3xl font-black mt-1 ${summary.openCritical > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {summary.openCritical}
          </p>
          <p className="text-xs text-slate-400 mt-1">Needs someone now</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Open Alerts</p>
          <p className="text-3xl font-black mt-1 text-slate-900 dark:text-white">{summary.open}</p>
          <p className="text-xs text-slate-400 mt-1">Unacknowledged and unresolved</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Last 24 Hours</p>
          <p className="text-3xl font-black mt-1 text-slate-900 dark:text-white">{summary.last24h}</p>
          <p className="text-xs text-slate-400 mt-1">Raised or repeated</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Undelivered</p>
          <p className={`text-3xl font-black mt-1 ${summary.undelivered > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'}`}>
            {summary.undelivered}
          </p>
          <p className="text-xs text-slate-400 mt-1">Recorded but never reached Slack</p>
        </Card>
      </div>

      {/* Where each stream goes, and the caveat that matters: mail-delivered
          alerts share a transport with the email failures they report. */}
      {settings && (
        <Card className="p-4 border-l-4 border-l-rose-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <i className="fa-brands fa-slack text-xl text-slate-400 mt-0.5"></i>
              <div className="space-y-1.5">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {settings.enabled ? 'SOS alerting is on' : 'SOS alerting is off — failures are recorded but nothing is pushed'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">
                    {settings.webhookUrl
                      ? 'Slack webhook (independent of email)'
                      : settings.channelEmails.join(', ') || 'no address configured'}
                  </p>
                </div>
                {notifSettings && (
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {notifSettings.enabled
                        ? 'Request notifications are on'
                        : 'Request notifications are off'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">
                      {notifSettings.channelEmails.join(', ') || 'no address configured'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                {SOS_SEVERITY_LABELS[settings.minSeverity]} and above
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                repeats folded for {settings.dedupeWindowMinutes}m
              </span>
              {canTriage && (
                <button
                  onClick={() => setShowSettings(v => !v)}
                  className="px-3 py-1.5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold transition-all active:scale-95"
                >
                  <i className="fa-solid fa-sliders mr-1.5"></i>
                  {showSettings ? 'Hide' : 'Settings'}
                </button>
              )}
            </div>
          </div>

          {!settings.webhookUrl && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
              <i className="fa-solid fa-circle-info mr-1.5"></i>
              Alerts reach Slack by email, through the channel address — which means an email outage is
              exactly when they may not arrive. Every alert is recorded here regardless. Configure a Slack
              webhook for a delivery path that does not depend on mail.
            </p>
          )}
        </Card>
      )}

      {/* Settings */}
      {showSettings && canTriage && draftSettings && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              SOS Alerting — failures
            </h2>
            <Toggle
              active={draftSettings.enabled}
              onChange={() => setDraftSettings({ ...draftSettings, enabled: !draftSettings.enabled })}
              label="Push alerts to Slack"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <ChannelEmailsField
              label="SOS Channel Addresses"
              hint="Slack → channel → Integrations → Send emails to this channel."
              value={draftSettings.channelEmails}
              onChange={channelEmails => setDraftSettings({ ...draftSettings, channelEmails })}
            />
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Slack Webhook URL <span className="text-slate-400 normal-case font-medium">(optional, preferred)</span>
              </label>
              <input
                value={draftSettings.webhookUrl}
                onChange={e => setDraftSettings({ ...draftSettings, webhookUrl: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
                placeholder="https://hooks.slack.com/services/..."
              />
              <p className="text-[11px] text-slate-400">Delivers without using the email system an alert may be reporting on.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Minimum Severity
              </label>
              <select
                value={draftSettings.minSeverity}
                onChange={e => setDraftSettings({ ...draftSettings, minSeverity: e.target.value as SosSeverity })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              >
                {(['critical', 'high', 'warning', 'info'] as SosSeverity[]).map(s => (
                  <option key={s} value={s}>{SOS_SEVERITY_LABELS[s]} and above</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Repeat Window (minutes)
              </label>
              <input
                type="number"
                min={1}
                value={draftSettings.dedupeWindowMinutes}
                onChange={e => setDraftSettings({ ...draftSettings, dedupeWindowMinutes: Number(e.target.value) || 1 })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Daily Push Cap
              </label>
              <input
                type="number"
                min={1}
                value={draftSettings.dailyNotificationCap}
                onChange={e => setDraftSettings({ ...draftSettings, dailyNotificationCap: Number(e.target.value) || 1 })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Muted Areas <span className="normal-case font-medium text-slate-400">(still recorded, never pushed)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SOS_CATEGORY_LABELS) as SosCategory[]).map(category => {
                const muted = draftSettings.mutedCategories.includes(category);
                return (
                  <button
                    key={category}
                    onClick={() => toggleMutedCategory(category)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                      muted
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700 line-through'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                    }`}
                  >
                    {SOS_CATEGORY_LABELS[category]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setDraftSettings(settings)}
              className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Reset
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <i className={`fa-solid ${isSaving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} mr-2`}></i>
              Save Settings
            </button>
          </div>
        </Card>
      )}

      {/* Desk notifications — the other channel: request traffic and the
          end-of-day report, kept separate so muting one never mutes the other. */}
      {showSettings && canTriage && draftNotif && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Desk Notifications — request traffic
            </h2>
            <Toggle
              active={draftNotif.enabled}
              onChange={() => setDraftNotif({ ...draftNotif, enabled: !draftNotif.enabled })}
              label="Post request traffic"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <ChannelEmailsField
              label="Notifications Channel Addresses"
              hint="Currently the same channel as SOS. Point it at the SLA channel when that exists."
              value={draftNotif.channelEmails}
              onChange={channelEmails => setDraftNotif({ ...draftNotif, channelEmails })}
            />
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Slack Webhook URL <span className="text-slate-400 normal-case font-medium">(optional)</span>
              </label>
              <input
                value={draftNotif.webhookUrl}
                onChange={e => setDraftNotif({ ...draftNotif, webhookUrl: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
                placeholder="https://hooks.slack.com/services/..."
              />
              <p className="text-[11px] text-slate-400">
                Reserved for request traffic. The digest's PDF is only ever delivered by mail.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Ping on every request</span>
              <Toggle
                active={draftNotif.notifyOnNewRequest}
                onChange={() => setDraftNotif({ ...draftNotif, notifyOnNewRequest: !draftNotif.notifyOnNewRequest })}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Daily digest</span>
              <Toggle
                active={draftNotif.digestEnabled}
                onChange={() => setDraftNotif({ ...draftNotif, digestEnabled: !draftNotif.digestEnabled })}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Attach PDF report</span>
              <Toggle
                active={draftNotif.digestAttachPdf}
                onChange={() => setDraftNotif({ ...draftNotif, digestAttachPdf: !draftNotif.digestAttachPdf })}
                size="sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Stalled after (hours)
              </label>
              <input
                type="number"
                min={1}
                value={draftNotif.stalledAfterHours}
                onChange={e => setDraftNotif({ ...draftNotif, stalledAfterHours: Number(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* What the channel would be told right now. */}
          <div className="p-4 rounded-lg bg-slate-900 dark:bg-black">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Today so far
            </p>
            {digest ? (
              <pre className="text-[11px] text-slate-200 font-mono whitespace-pre-wrap">
{`raised=${digest.totals.raised}  booked=${digest.totals.booked}  closed=${digest.totals.closed}  cancelled=${digest.totals.cancelled}
open=${digest.totals.open}  assigned=${digest.totals.assigned}  unassigned=${digest.totals.unassigned}  claimed=${digest.totals.claimed}
moved=${digest.totals.moved}  stalled=${digest.totals.stalled}  oldest_open=${formatAge(digest.totals.oldestOpenHours)}`}
              </pre>
            ) : (
              <p className="text-[11px] text-slate-400 font-mono">Building…</p>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleSendDigest()}
                disabled={isSendingDigest}
                className="px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              >
                <i className={`fa-solid ${isSendingDigest ? 'fa-spinner fa-spin' : 'fa-paper-plane'} mr-2`}></i>
                Send digest now
              </button>
              <button
                onClick={() => void handleDownloadReport()}
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold transition-all active:scale-95"
              >
                <i className="fa-solid fa-file-pdf mr-2"></i>
                Download report
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDraftNotif(notifSettings)}
                className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Reset
              </button>
              <button
                onClick={() => void handleSaveNotifications()}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <i className={`fa-solid ${isSaving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} mr-2`}></i>
                Save Notifications
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            The digest is sent on a schedule by the database (pg_cron job <code>desk-daily-digest</code>, 19:30 IST).
            Changing the time means editing that job — see docs/sos-alerts.md.
          </p>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, title or message…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as SosStatus | 'all')}
            className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          >
            <option value="Open">Open</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="Resolved">Resolved</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value as SosSeverity | 'all')}
            className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          >
            <option value="all">All severities</option>
            {(['critical', 'high', 'warning', 'info'] as SosSeverity[]).map(s => (
              <option key={s} value={s}>{SOS_SEVERITY_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as SosCategory | 'all')}
            className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          >
            <option value="all">All areas</option>
            {(Object.keys(SOS_CATEGORY_LABELS) as SosCategory[]).map(c => (
              <option key={c} value={c}>{SOS_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* The feed */}
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading && (
          <div className="p-10 text-center text-slate-400 text-sm">
            <i className="fa-solid fa-spinner fa-spin mr-2"></i> Loading alerts…
          </div>
        )}

        {!isLoading && alerts.length === 0 && (
          <div className="p-12 text-center">
            <i className="fa-solid fa-circle-check text-4xl text-emerald-500 mb-3"></i>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Nothing to report</p>
            <p className="text-xs text-slate-400 mt-1">
              No alerts match this filter. {monitoredCount} failure types are being watched.
            </p>
          </div>
        )}

        {!isLoading && alerts.map(alert => {
          const spec = getSosSpec(alert.code);
          const delivery = deliveryLabel(alert);
          const isOpen = expandedId === alert.id;

          return (
            <div key={alert.id} className="relative">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${SEVERITY_STYLES[alert.severity].bar}`} />
              <div className="p-4 pl-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : alert.id)}
                    className="flex-1 text-left group"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${SEVERITY_STYLES[alert.severity].chip}`}>
                        {SOS_SEVERITY_ICONS[alert.severity]} {SOS_SEVERITY_LABELS[alert.severity]}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_STYLES[alert.status]}`}>
                        {alert.status}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-400">{alert.code}</span>
                      {alert.occurrences > 1 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          ×{alert.occurrences}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {alert.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{alert.message}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                      <span><i className="fa-solid fa-layer-group mr-1"></i>{SOS_CATEGORY_LABELS[alert.category]}</span>
                      <span><i className="fa-solid fa-location-crosshairs mr-1"></i>{alert.source}</span>
                      <span><i className="fa-solid fa-clock mr-1"></i>{relativeTime(alert.lastSeenAt)}</span>
                      <span className={delivery.tone}><i className={`fa-solid ${delivery.icon} mr-1`}></i>{delivery.text}</span>
                    </div>
                  </button>

                  {canTriage && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {alert.status === 'Open' && (
                        <button
                          onClick={() => void handleAcknowledge(alert)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-all active:scale-95"
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== 'Resolved' ? (
                        <button
                          onClick={() => void handleResolve(alert)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-all active:scale-95"
                        >
                          Resolve
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleReopen(alert)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all active:scale-95"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {spec && (
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Why it matters</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{spec.meaning}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
                          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1">First check</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{spec.firstCheck}</p>
                        </div>
                      </div>
                    )}

                    {Object.keys(alert.context || {}).length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Context</p>
                        <div className="rounded-lg bg-slate-900 dark:bg-black p-3 overflow-x-auto">
                          <pre className="text-[11px] text-slate-200 font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(alert.context, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Exactly what the channel was sent, so a reader can tell
                        whether the alert was actionable without going to Slack. */}
                    <details className="group">
                      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <i className="fa-brands fa-slack mr-1.5"></i>
                        Message sent to the channel
                      </summary>
                      <pre className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono">
                        {formatAlertText(
                          {
                            code: alert.code,
                            severity: alert.severity,
                            category: alert.category,
                            title: alert.title,
                            message: alert.message,
                            context: alert.context,
                            source: alert.source
                          },
                          { occurrences: alert.occurrences, firstSeenAt: alert.firstSeenAt }
                        )}
                      </pre>
                    </details>

                    <div className="flex flex-wrap gap-4 text-[11px] text-slate-400">
                      <span>First seen {new Date(alert.firstSeenAt).toLocaleString()}</span>
                      <span>Last seen {new Date(alert.lastSeenAt).toLocaleString()}</span>
                      {alert.raisedByEmail && <span>Reported by {alert.raisedByEmail}</span>}
                      {alert.acknowledgedBy && <span>Acknowledged by {alert.acknowledgedBy}</span>}
                      {alert.resolvedBy && <span>Resolved by {alert.resolvedBy}</span>}
                      {alert.resolutionNote && <span className="text-emerald-600 dark:text-emerald-400">“{alert.resolutionNote}”</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* What is watched. Rendered from the same catalogue the code raises
          against, so the table cannot drift from reality. */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setShowCatalog(v => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="text-left">
            <p className="text-sm font-black text-slate-900 dark:text-white">Monitored Failures</p>
            <p className="text-xs text-slate-400">
              {monitoredCount} failure types across {catalogue.length} areas, each wired to this channel.
            </p>
          </div>
          <i className={`fa-solid fa-chevron-${showCatalog ? 'up' : 'down'} text-slate-400`}></i>
        </button>

        {showCatalog && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {catalogue.map(group => (
              <div key={group.category} className="p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.codes.map(code => (
                    <div key={code.code} className="flex items-start gap-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border flex-shrink-0 mt-0.5 ${SEVERITY_STYLES[code.severity].chip}`}>
                        {SOS_SEVERITY_LABELS[code.severity]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {code.title}
                          <span className="ml-2 font-mono text-[10px] text-slate-400">{code.code}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{code.meaning}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SOSView;
