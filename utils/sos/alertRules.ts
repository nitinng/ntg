/**
 * Pure decision logic for SOS alerting: what gets raised, what gets through to
 * Slack, and what the Slack message says.
 *
 * Kept free of imports beyond the catalogue so the same rules can run in the
 * browser, in the Deno queue worker and in tests. The database mirrors the
 * dedupe and threshold rules in `raise_sos_alert()` — see the SOS migration;
 * a change here has to be copied there.
 */

import {
  SOS_SEVERITY_ICONS,
  SOS_CATEGORY_LABELS,
  SosCategory,
  SosSeverity,
  getSosSpec
} from './catalog';

/** Loudest first. Used for the "only notify at or above" threshold. */
export const SEVERITY_RANK: Record<SosSeverity, number> = {
  critical: 4,
  high: 3,
  warning: 2,
  info: 1
};

/**
 * The Slack channel that receives automation alerts.
 *
 * This is a Slack channel email address: mail sent to it is posted into
 * #alert-team-automation. Using mail rather than a webhook means alerting
 * works with no extra credentials — at the cost of sharing a transport with
 * the thing it most often reports on, which is why `webhookUrl` exists and
 * why every alert is recorded in the database whether or not it is delivered.
 */
export const DEFAULT_SOS_CHANNEL_EMAIL =
  'alert-team-automation-aaaawk4tlokditwloipugpaleq@navgurukul.slack.com';

/**
 * Pulls a list of addresses out of whatever the settings row holds.
 *
 * The column has carried a single string, an array, and (from the console) a
 * textarea's worth of comma- and newline-separated text. All three parse the
 * same way, so changing the shape never silently empties the channel.
 */
export const parseChannelEmails = (raw: any): string[] => {
  const candidates: string[] = Array.isArray(raw)
    ? raw.map(v => String(v ?? ''))
    : typeof raw === 'string'
      ? raw.split(/[\s,;]+/)
      : [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of candidates) {
    const address = candidate.trim().toLowerCase();
    if (!address || !address.includes('@') || seen.has(address)) continue;
    seen.add(address);
    out.push(address);
  }

  return out;
};

export interface SosSettings {
  /** Master switch. Off records alerts but pushes nothing. */
  enabled: boolean;
  /**
   * Every address the SOS channel posts to. A list rather than one address
   * because a second team always arrives, and an on-call inbox alongside the
   * Slack channel is the usual first request.
   */
  channelEmails: string[];
  /**
   * Optional Slack incoming webhook. Preferred when set, because it does not
   * travel through the email system an alert may be reporting on.
   */
  webhookUrl: string;
  /** Only severities at or above this rank are pushed. */
  minSeverity: SosSeverity;
  /** Categories that are allowed to notify. Absent means allowed. */
  mutedCategories: SosCategory[];
  /**
   * Repeats of the same fingerprint inside this window are folded into the
   * existing alert and not re-notified.
   */
  dedupeWindowMinutes: number;
  /** Hard ceiling on notifications per IST day, so a loop cannot flood Slack. */
  dailyNotificationCap: number;
}

export const DEFAULT_SOS_SETTINGS: SosSettings = {
  enabled: true,
  channelEmails: [DEFAULT_SOS_CHANNEL_EMAIL],
  webhookUrl: '',
  minSeverity: 'warning',
  mutedCategories: [],
  dedupeWindowMinutes: 30,
  dailyNotificationCap: 200
};

/**
 * Merges stored settings over the defaults, dropping anything malformed.
 *
 * Settings come out of a jsonb column that an administrator can edit, so a
 * missing or wrong-typed key must degrade to the default rather than throw
 * inside an error path — an alerting system that crashes while reporting a
 * crash is worse than no alerting at all.
 */
export const normalizeSosSettings = (raw: any): SosSettings => {
  const value = raw && typeof raw === 'object' ? raw : {};
  const severity: SosSeverity =
    typeof value.minSeverity === 'string' && value.minSeverity in SEVERITY_RANK
      ? value.minSeverity
      : DEFAULT_SOS_SETTINGS.minSeverity;

  const muted = Array.isArray(value.mutedCategories)
    ? value.mutedCategories.filter((c: any): c is SosCategory => typeof c === 'string' && c in SOS_CATEGORY_LABELS)
    : [];

  const positiveNumber = (candidate: any, fallback: number): number =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
      ? Math.floor(candidate)
      : fallback;

  // `channelEmail` is the pre-20261010120000 shape; reading it keeps a settings
  // row that predates the migration working rather than muting the channel.
  const channelEmails = parseChannelEmails(
    value.channelEmails !== undefined ? value.channelEmails : value.channelEmail
  );

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SOS_SETTINGS.enabled,
    channelEmails: channelEmails.length ? channelEmails : DEFAULT_SOS_SETTINGS.channelEmails,
    webhookUrl: typeof value.webhookUrl === 'string' ? value.webhookUrl.trim() : DEFAULT_SOS_SETTINGS.webhookUrl,
    minSeverity: severity,
    mutedCategories: muted,
    dedupeWindowMinutes: positiveNumber(value.dedupeWindowMinutes, DEFAULT_SOS_SETTINGS.dedupeWindowMinutes),
    dailyNotificationCap: positiveNumber(value.dailyNotificationCap, DEFAULT_SOS_SETTINGS.dailyNotificationCap)
  };
};

export interface SosAlertInput {
  code: string;
  severity: SosSeverity;
  category: SosCategory;
  title: string;
  message: string;
  context?: Record<string, any> | null;
  source: 'web' | 'worker' | 'database';
  /** Extra identity for dedupe — a ticket id, an SMTP slot, a queue id. */
  dedupeKey?: string | null;
}

/**
 * Identity used to fold repeats together.
 *
 * Deliberately coarse: the code plus whatever the caller considers the subject
 * of the failure. A hundred failed sends on one account must read as one
 * recurring alert, not a hundred pages.
 */
export const buildFingerprint = (code: string, dedupeKey?: string | null): string =>
  `${code}:${(dedupeKey || 'global').toString().trim().toLowerCase().slice(0, 180)}`;

export type SuppressionReason =
  | 'delivered'
  | 'alerting_disabled'
  | 'below_min_severity'
  | 'category_muted'
  | 'duplicate_within_window'
  | 'daily_cap_reached'
  | 'no_destination';

/**
 * Decides whether an alert that is being recorded should also be pushed.
 *
 * Recording is unconditional — the console shows everything. This gate only
 * controls the Slack push, so a muted category still leaves a trail.
 */
export const shouldNotify = (input: {
  severity: SosSeverity;
  category: SosCategory;
  settings: SosSettings;
  /** When this fingerprint last produced a notification, if ever. */
  lastNotifiedAt?: string | Date | null;
  /** Notifications already pushed in the current IST day. */
  notifiedToday?: number;
  now?: Date;
}): { notify: boolean; reason: SuppressionReason } => {
  const { severity, category, settings } = input;
  const now = input.now || new Date();

  if (!settings.enabled) return { notify: false, reason: 'alerting_disabled' };
  if (settings.channelEmails.length === 0 && !settings.webhookUrl) {
    return { notify: false, reason: 'no_destination' };
  }
  if (SEVERITY_RANK[severity] < SEVERITY_RANK[settings.minSeverity]) {
    return { notify: false, reason: 'below_min_severity' };
  }
  if (settings.mutedCategories.includes(category)) {
    return { notify: false, reason: 'category_muted' };
  }

  if (input.lastNotifiedAt) {
    const last = input.lastNotifiedAt instanceof Date ? input.lastNotifiedAt : new Date(input.lastNotifiedAt);
    const ageMinutes = (now.getTime() - last.getTime()) / 60_000;
    if (Number.isFinite(ageMinutes) && ageMinutes < settings.dedupeWindowMinutes) {
      return { notify: false, reason: 'duplicate_within_window' };
    }
  }

  if ((input.notifiedToday || 0) >= settings.dailyNotificationCap) {
    return { notify: false, reason: 'daily_cap_reached' };
  }

  return { notify: true, reason: 'delivered' };
};

/** `[CRITICAL] Travel Desk SOS — SMTP account auto-promoted...` */
export const formatAlertSubject = (alert: SosAlertInput, occurrences = 1): string => {
  const icon = SOS_SEVERITY_ICONS[alert.severity];
  const repeat = occurrences > 1 ? ` (×${occurrences})` : '';
  return `${icon} [${alert.severity.toUpperCase()}] Travel Desk SOS — ${alert.title}${repeat}`;
};

const formatContextLines = (context?: Record<string, any> | null): string[] => {
  if (!context || typeof context !== 'object') return [];
  return Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 20)
    .map(([k, v]) => {
      const rendered =
        typeof v === 'object' ? JSON.stringify(v).slice(0, 500) : String(v).slice(0, 500);
      return `${k}: ${rendered}`;
    });
};

/**
 * Plain-text body for the Slack channel email.
 *
 * Slack renders the email body in the channel and strips most styling, so the
 * message is written to be readable as text: what broke, what it means, and
 * the first thing to check.
 */
export const formatAlertText = (
  alert: SosAlertInput,
  options: { occurrences?: number; firstSeenAt?: string; portalUrl?: string; environment?: string } = {}
): string => {
  const spec = getSosSpec(alert.code);
  const lines: string[] = [];

  lines.push(`${SOS_SEVERITY_ICONS[alert.severity]} ${alert.severity.toUpperCase()} — ${alert.title}`);
  lines.push('');
  lines.push(`What happened: ${alert.message}`);
  if (spec?.meaning) lines.push(`Why it matters: ${spec.meaning}`);
  if (spec?.firstCheck) lines.push(`First check: ${spec.firstCheck}`);
  lines.push('');
  lines.push(`Code: ${alert.code}`);
  lines.push(`Area: ${SOS_CATEGORY_LABELS[alert.category]}`);
  lines.push(`Raised by: ${alert.source}`);
  if (options.environment) lines.push(`Environment: ${options.environment}`);
  if ((options.occurrences || 1) > 1) {
    lines.push(`Occurrences: ${options.occurrences}${options.firstSeenAt ? ` since ${options.firstSeenAt}` : ''}`);
  }

  const contextLines = formatContextLines(alert.context);
  if (contextLines.length) {
    lines.push('');
    lines.push('Context:');
    contextLines.forEach(l => lines.push(`  • ${l}`));
  }

  if (options.portalUrl) {
    lines.push('');
    lines.push(`Open the SOS console: ${options.portalUrl.replace(/\/$/, '')}/?tab=sos`);
  }

  return lines.join('\n');
};

/**
 * HTML body for the same message.
 *
 * Slack's email-to-channel bridge prefers the text part but falls back to
 * HTML, and the SOS console renders this when previewing what was sent.
 */
export const formatAlertHtml = (
  alert: SosAlertInput,
  options: { occurrences?: number; firstSeenAt?: string; portalUrl?: string; environment?: string } = {}
): string => {
  const escape = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const colors: Record<SosSeverity, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    warning: '#d97706',
    info: '#2563eb'
  };

  const spec = getSosSpec(alert.code);
  const contextRows = formatContextLines(alert.context)
    .map(line => `<li style="margin:2px 0;font-family:monospace;font-size:12px;">${escape(line)}</li>`)
    .join('');

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;">
  <div style="border-left:4px solid ${colors[alert.severity]};padding:12px 16px;background:#f8fafc;">
    <p style="margin:0;font-size:15px;font-weight:700;color:${colors[alert.severity]};">
      ${SOS_SEVERITY_ICONS[alert.severity]} ${escape(alert.severity.toUpperCase())} — ${escape(alert.title)}
    </p>
    <p style="margin:8px 0 0 0;font-size:13px;color:#334155;">${escape(alert.message)}</p>
  </div>
  ${spec?.meaning ? `<p style="font-size:13px;color:#475569;"><strong>Why it matters:</strong> ${escape(spec.meaning)}</p>` : ''}
  ${spec?.firstCheck ? `<p style="font-size:13px;color:#475569;"><strong>First check:</strong> ${escape(spec.firstCheck)}</p>` : ''}
  <p style="font-size:12px;color:#64748b;">
    <strong>Code:</strong> ${escape(alert.code)} &nbsp;•&nbsp;
    <strong>Area:</strong> ${escape(SOS_CATEGORY_LABELS[alert.category])} &nbsp;•&nbsp;
    <strong>Raised by:</strong> ${escape(alert.source)}
    ${options.environment ? ` &nbsp;•&nbsp; <strong>Environment:</strong> ${escape(options.environment)}` : ''}
    ${(options.occurrences || 1) > 1 ? ` &nbsp;•&nbsp; <strong>Occurrences:</strong> ${options.occurrences}` : ''}
  </p>
  ${contextRows ? `<ul style="padding-left:18px;color:#334155;">${contextRows}</ul>` : ''}
  ${
    options.portalUrl
      ? `<p style="font-size:12px;"><a href="${escape(options.portalUrl.replace(/\/$/, ''))}/?tab=sos">Open the SOS console</a></p>`
      : ''
  }
</div>`.trim();
};

export const SLACK_SEVERITY_COLORS: Record<SosSeverity, string> = {
  critical: '#E24B4A',
  high: '#EF9F27',
  warning: '#64748B',
  info: '#3B82F6'
};

export const SLACK_SEVERITY_PILLS: Record<SosSeverity, string> = {
  critical: ':red_circle: Critical',
  high: ':large_orange_circle: Error',
  warning: ':warning: Warning',
  info: ':information_source: Info'
};

export interface FormatAlertSlackOptions {
  occurrences?: number;
  firstSeenAt?: string;
  portalUrl?: string;
  environment?: string;
  alertId?: string;
  service?: string;
}

export interface SlackBlockKitPayload {
  text: string;
  attachments: Array<{
    color: string;
    blocks: any[];
  }>;
}

/**
 * Builds a Slack Block Kit alert card enclosed in a legacy attachments wrapper
 * for the colored sidebar, consistent 4-field triage grid, truncated stack trace,
 * and quick-action buttons.
 */
export const formatAlertSlackPayload = (
  alert: SosAlertInput,
  options: FormatAlertSlackOptions = {}
): SlackBlockKitPayload => {
  const color = SLACK_SEVERITY_COLORS[alert.severity] || '#64748B';
  const pill = SLACK_SEVERITY_PILLS[alert.severity] || ':warning: Warning';
  const occurrences = options.occurrences || 1;
  const env = options.environment || 'production';
  const service =
    options.service ||
    (alert.source === 'worker'
      ? 'travel-desk-worker'
      : alert.source === 'database'
      ? 'travel-desk-db'
      : 'travel-desk-web');

  // Compute impact / affected details
  const ctx = alert.context || {};
  let impact = 'Single session';
  if (ctx.userEmail || ctx.email) {
    impact = String(ctx.userEmail || ctx.email);
  } else if (ctx.ticketId || ctx.ticket) {
    impact = `Ticket ${ctx.ticketId || ctx.ticket}`;
  } else if (ctx.route) {
    impact = String(ctx.route);
  } else if (occurrences > 1) {
    impact = `~${occurrences} occurrences`;
  }

  // Extract clean 2-3 lines of error or stack trace
  let snippet = '';
  if (typeof ctx.stack === 'string' && ctx.stack.trim()) {
    snippet = ctx.stack
      .split(/[\n|]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('\n  ');
  } else if (typeof ctx.error === 'string' && ctx.error.trim()) {
    snippet = ctx.error.split('\n').slice(0, 3).join('\n');
  } else if (alert.message) {
    snippet = alert.message.split('\n').slice(0, 3).join('\n');
  } else {
    snippet = `${alert.code}: ${alert.title}`;
  }

  // Cap snippet length to prevent Slack API payload errors
  if (snippet.length > 350) {
    snippet = snippet.slice(0, 347) + '...';
  }

  const basePortal = options.portalUrl ? options.portalUrl.replace(/\/+$/, '') : 'https://ng-travel-desk.vercel.app';
  const logsUrl = `${basePortal}/?tab=sos${options.alertId ? `&alertId=${encodeURIComponent(options.alertId)}` : ''}`;

  // Notification / fallback line. The card itself lives in the attachment —
  // mrkdwn here would print literally in a Workflow Builder message.
  const topLevelText = `${SOS_SEVERITY_ICONS[alert.severity]} ${alert.severity.toUpperCase()} — ${alert.title}`;

  const actionElements: any[] = [
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Acknowledge', emoji: true },
      style: 'primary',
      action_id: 'ack',
      value: options.alertId || alert.code
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: 'View logs', emoji: true },
      url: logsUrl
    }
  ];

  // If error is a retryable queue/worker item, add retry button
  if (
    alert.code.startsWith('EMAIL_') ||
    alert.code.startsWith('SMTP_') ||
    alert.code === 'AUTO_ADVANCE_FAILED'
  ) {
    actionElements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Retry', emoji: true },
      action_id: 'retry',
      value: options.alertId || alert.code
    });
  }

  return {
    text: topLevelText,
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${pill} — ${alert.title}*`
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Service*\n${service}` },
              { type: 'mrkdwn', text: `*Environment*\n${env}` },
              {
                type: 'mrkdwn',
                text: `*Occurrences*\n${occurrences > 1 ? `${occurrences} in recent window` : '1 occurrence'}`
              },
              { type: 'mrkdwn', text: `*Impact*\n${impact}` }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`${snippet}\`\`\``
            }
          },
          {
            type: 'actions',
            elements: actionElements
          }
        ]
      }
    ]
  };
};

/**
 * Returns a collapsed single-line card when an alert is resolved or acknowledged.
 */
export const formatAlertResolvedSlackPayload = (
  alertTitle: string,
  resolvedBy: string,
  resolvedAt?: string
) => ({
  replace_original: true,
  attachments: [
    {
      color: '#64748B',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:white_check_mark: *Resolved* — ${alertTitle}\n_Handled by ${resolvedBy} · ${resolvedAt || 'Just now'}_`
          }
        }
      ]
    }
  ]
});

