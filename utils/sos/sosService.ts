/**
 * Data access for the SOS console.
 *
 * Reads and triage writes go straight at `sos_alerts` under row-level
 * security — staff may read the feed, Admin and PNC Admin may acknowledge and
 * resolve. Raising an alert is deliberately not here: that only ever happens
 * through `raiseSos`, which goes through the database RPC so the dedupe and
 * notification rules cannot be bypassed.
 */

import { supabase } from '../../supabaseClient';
import { SosCategory, SosSeverity } from './catalog';
import { DEFAULT_SOS_SETTINGS, normalizeSosSettings, SosSettings } from './alertRules';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  DeskNotificationSettings,
  normalizeNotificationSettings
} from '../desk/notificationSettings';
import { DeskDigest, digestFileName, digestToPdfBase64 } from '../desk/digest';
import { raiseSos } from './raiseSos';

export type SosStatus = 'Open' | 'Acknowledged' | 'Resolved';
export type SosNotificationStatus = 'Pending' | 'Queued' | 'Suppressed' | 'Failed';

export interface SosAlert {
  id: string;
  code: string;
  category: SosCategory;
  severity: SosSeverity;
  title: string;
  message: string;
  context: Record<string, any>;
  source: 'web' | 'worker' | 'database';
  fingerprint: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: SosStatus;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  notificationStatus: SosNotificationStatus;
  notificationReason?: string | null;
  notifiedAt?: string | null;
  emailQueueId?: string | null;
  raisedByEmail?: string | null;
  createdAt: string;
}

export interface SosAlertFilters {
  status?: SosStatus | 'all';
  severity?: SosSeverity | 'all';
  category?: SosCategory | 'all';
  search?: string;
  limit?: number;
}

const mapAlert = (row: any): SosAlert => ({
  id: row.id,
  code: row.code,
  category: row.category,
  severity: row.severity,
  title: row.title,
  message: row.message,
  context: row.context || {},
  source: row.source,
  fingerprint: row.fingerprint,
  occurrences: row.occurrences ?? 1,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  status: row.status,
  acknowledgedBy: row.acknowledged_by,
  acknowledgedAt: row.acknowledged_at,
  resolvedBy: row.resolved_by,
  resolvedAt: row.resolved_at,
  resolutionNote: row.resolution_note,
  notificationStatus: row.notification_status,
  notificationReason: row.notification_reason,
  notifiedAt: row.notified_at,
  emailQueueId: row.email_queue_id,
  raisedByEmail: row.raised_by_email,
  createdAt: row.created_at
});

export const fetchSosAlerts = async (filters: SosAlertFilters = {}): Promise<SosAlert[]> => {
  let query = supabase
    .from('sos_alerts')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(filters.limit || 200);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity);
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map(mapAlert);
  const search = (filters.search || '').trim().toLowerCase();
  if (!search) return rows;

  return rows.filter(
    alert =>
      alert.code.toLowerCase().includes(search) ||
      alert.title.toLowerCase().includes(search) ||
      alert.message.toLowerCase().includes(search)
  );
};

export interface SosSummary {
  openCritical: number;
  open: number;
  last24h: number;
  undelivered: number;
}

/**
 * Headline figures for the console.
 *
 * `undelivered` counts alerts whose Slack push failed — the number that says
 * the channel cannot be trusted as the only place anyone is looking.
 */
export const fetchSosSummary = async (): Promise<SosSummary> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [openCritical, open, last24h, undelivered] = await Promise.all([
    supabase.from('sos_alerts').select('*', { count: 'exact', head: true })
      .eq('status', 'Open').eq('severity', 'critical'),
    supabase.from('sos_alerts').select('*', { count: 'exact', head: true }).eq('status', 'Open'),
    supabase.from('sos_alerts').select('*', { count: 'exact', head: true }).gte('last_seen_at', since),
    supabase.from('sos_alerts').select('*', { count: 'exact', head: true }).eq('notification_status', 'Failed')
  ]);

  return {
    openCritical: openCritical.count || 0,
    open: open.count || 0,
    last24h: last24h.count || 0,
    undelivered: undelivered.count || 0
  };
};

export const acknowledgeSosAlert = async (id: string, actorEmail: string): Promise<void> => {
  const { error } = await supabase
    .from('sos_alerts')
    .update({ status: 'Acknowledged', acknowledged_by: actorEmail, acknowledged_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
};

export const resolveSosAlert = async (id: string, actorEmail: string, note?: string): Promise<void> => {
  const { error } = await supabase
    .from('sos_alerts')
    .update({
      status: 'Resolved',
      resolved_by: actorEmail,
      resolved_at: new Date().toISOString(),
      resolution_note: note?.trim() || null
    })
    .eq('id', id);
  if (error) throw error;
};

/** Reopen an alert that was resolved too eagerly. */
export const reopenSosAlert = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('sos_alerts')
    .update({ status: 'Open', resolved_by: null, resolved_at: null, resolution_note: null })
    .eq('id', id);
  if (error) throw error;
};

const readSettingsRow = async (key: string): Promise<any | null> => {
  const { data, error } = await supabase
    .from('sos_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  return error || !data ? null : data.value;
};

const writeSettingsRow = async (key: string, value: any, actorEmail: string): Promise<void> => {
  const { error } = await supabase
    .from('sos_settings')
    .update({ value, updated_at: new Date().toISOString(), updated_by: actorEmail })
    .eq('key', key);
  if (error) throw error;
};

export const fetchSosSettings = async (): Promise<SosSettings> => {
  const { data, error } = await supabase
    .from('sos_settings')
    .select('value')
    .eq('key', 'alerting')
    .maybeSingle();

  // Settings that cannot be read must not stop the console from rendering the
  // alerts, which is the part that matters in an incident.
  if (error || !data) return { ...DEFAULT_SOS_SETTINGS };
  return normalizeSosSettings(data.value);
};

export const saveSosSettings = async (settings: SosSettings, actorEmail: string): Promise<void> =>
  writeSettingsRow('alerting', normalizeSosSettings(settings), actorEmail);

export const fetchNotificationSettings = async (): Promise<DeskNotificationSettings> => {
  const value = await readSettingsRow('notifications');
  return value ? normalizeNotificationSettings(value) : { ...DEFAULT_NOTIFICATION_SETTINGS };
};

export const saveNotificationSettings = async (
  settings: DeskNotificationSettings,
  actorEmail: string
): Promise<void> =>
  writeSettingsRow('notifications', normalizeNotificationSettings(settings), actorEmail);

/**
 * Builds the digest for a window without sending it.
 *
 * Used by the console to show today's figures and to download the same PDF the
 * channel receives, so an admin can check the report before it goes out.
 */
export const fetchDeskDigest = async (from?: string, to?: string): Promise<DeskDigest> => {
  const { data, error } = await supabase.rpc('build_desk_digest', {
    p_from: from ?? null,
    p_to: to ?? null
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as DeskDigest;
};

/** Queues the digest to the notifications channel now, outside its schedule. */
export const sendDeskDigestNow = async (): Promise<{ sent: boolean; reason?: string }> => {
  const { data, error } = await supabase.rpc('send_desk_digest', { p_from: null, p_to: null });
  if (error) throw error;
  const result = (Array.isArray(data) ? data[0] : data) || {};
  return { sent: Boolean(result.sent), reason: result.reason };
};

/** Hands the browser the same PDF the channel is sent. */
export const downloadDigestPdf = (digest: DeskDigest): void => {
  const base64 = digestToPdfBase64(digest);
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

  const link = document.createElement('a');
  link.href = url;
  link.download = digestFileName(digest);
  link.click();

  URL.revokeObjectURL(url);
};

/**
 * Sends a test alert to the channel.
 *
 * Raised at whatever the configured minimum severity is, so the test exercises
 * the real delivery path rather than being filtered out by the threshold it is
 * supposed to be verifying.
 */
export const sendSosTestAlert = async (actorEmail: string): Promise<{ delivered: boolean; reason?: string }> => {
  const settings = await fetchSosSettings();
  const result = await raiseSos('SOS_SELF_TEST', {
    severity: settings.minSeverity,
    message: `Test alert sent from the SOS console by ${actorEmail}. If this reached the channel, alerting is wired up end to end.`,
    context: { triggeredBy: actorEmail, channels: settings.channelEmails.join(', ') },
    // Unique each time: a test must never be folded into an earlier one.
    dedupeKey: `test-${Date.now()}`
  });

  return { delivered: result.notified, reason: result.suppressionReason };
};
