/**
 * Settings for the desk's routine traffic — request pings and the daily digest.
 *
 * Kept apart from the SOS settings on purpose: alerting and routine traffic end
 * up in different channels as soon as a team grows, and muting one must never
 * mute the other. Both start on the same Slack address, so splitting them later
 * is a settings change rather than a deployment.
 *
 * Mirrored by the `notifications` row in `public.sos_settings`; the defaults
 * here are what the console falls back to when that row cannot be read.
 */

import { DEFAULT_SOS_CHANNEL_EMAIL, parseChannelEmails } from '../sos/alertRules';

export interface DeskNotificationSettings {
  /** Master switch for request pings and the digest alike. */
  enabled: boolean;
  /** Every address the notifications channel posts to. */
  channelEmails: string[];
  /** Posted to directly when set, bypassing the email queue. */
  webhookUrl: string;
  /** Announce each request as it is raised. */
  notifyOnNewRequest: boolean;
  /** Send the end-of-day summary. */
  digestEnabled: boolean;
  /** Attach the full per-ticket breakdown as a PDF. */
  digestAttachPdf: boolean;
  /** How long an open request may sit without movement before it counts as stalled. */
  stalledAfterHours: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: DeskNotificationSettings = {
  enabled: true,
  channelEmails: [DEFAULT_SOS_CHANNEL_EMAIL],
  webhookUrl: '',
  notifyOnNewRequest: true,
  digestEnabled: true,
  digestAttachPdf: true,
  stalledAfterHours: 48
};

/** Merges a stored row over the defaults, dropping anything malformed. */
export const normalizeNotificationSettings = (raw: any): DeskNotificationSettings => {
  const value = raw && typeof raw === 'object' ? raw : {};

  const bool = (candidate: any, fallback: boolean): boolean =>
    typeof candidate === 'boolean' ? candidate : fallback;

  const channelEmails = parseChannelEmails(
    value.channelEmails !== undefined ? value.channelEmails : value.channelEmail
  );

  return {
    enabled: bool(value.enabled, DEFAULT_NOTIFICATION_SETTINGS.enabled),
    channelEmails: channelEmails.length ? channelEmails : DEFAULT_NOTIFICATION_SETTINGS.channelEmails,
    webhookUrl: typeof value.webhookUrl === 'string' ? value.webhookUrl.trim() : '',
    notifyOnNewRequest: bool(value.notifyOnNewRequest, DEFAULT_NOTIFICATION_SETTINGS.notifyOnNewRequest),
    digestEnabled: bool(value.digestEnabled, DEFAULT_NOTIFICATION_SETTINGS.digestEnabled),
    digestAttachPdf: bool(value.digestAttachPdf, DEFAULT_NOTIFICATION_SETTINGS.digestAttachPdf),
    stalledAfterHours:
      typeof value.stalledAfterHours === 'number' &&
      Number.isFinite(value.stalledAfterHours) &&
      value.stalledAfterHours > 0
        ? Math.floor(value.stalledAfterHours)
        : DEFAULT_NOTIFICATION_SETTINGS.stalledAfterHours
  };
};
