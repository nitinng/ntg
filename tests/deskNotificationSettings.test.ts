/**
 * The notifications row decides where request traffic and the digest go. It is
 * edited by hand in the console, so every field has to degrade to a default
 * rather than throw — a malformed row must not stop the desk announcing itself.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings
} from '../utils/desk/notificationSettings';

describe('normalizeNotificationSettings', () => {
  it('starts on the same channel as SOS, so the split is a settings change', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.channelEmails).toEqual([
      'alert-team-automation-aaaawk4tlokditwloipugpaleq@navgurukul.slack.com'
    ]);
  });

  it('keeps a configured list, lower-cased and de-duplicated', () => {
    const result = normalizeNotificationSettings({
      channelEmails: ['SLA-Channel@navgurukul.slack.com', 'sla-channel@navgurukul.slack.com', 'nope']
    });
    expect(result.channelEmails).toEqual(['sla-channel@navgurukul.slack.com']);
  });

  it('falls back rather than muting the channel when the list is unusable', () => {
    expect(normalizeNotificationSettings({ channelEmails: [] }).channelEmails)
      .toEqual(DEFAULT_NOTIFICATION_SETTINGS.channelEmails);
    expect(normalizeNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('honours the switches that are actually set', () => {
    const result = normalizeNotificationSettings({
      enabled: false,
      notifyOnNewRequest: false,
      digestEnabled: true,
      digestAttachPdf: false,
      stalledAfterHours: 72
    });
    expect(result.enabled).toBe(false);
    expect(result.notifyOnNewRequest).toBe(false);
    expect(result.digestEnabled).toBe(true);
    expect(result.digestAttachPdf).toBe(false);
    expect(result.stalledAfterHours).toBe(72);
  });

  it('refuses a nonsense stalled threshold instead of marking everything stalled', () => {
    expect(normalizeNotificationSettings({ stalledAfterHours: 0 }).stalledAfterHours).toBe(48);
    expect(normalizeNotificationSettings({ stalledAfterHours: -5 }).stalledAfterHours).toBe(48);
    expect(normalizeNotificationSettings({ stalledAfterHours: 'soon' }).stalledAfterHours).toBe(48);
  });
});
