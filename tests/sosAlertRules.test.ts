/**
 * The gate between "a failure happened" and "Slack was told".
 *
 * These rules decide what wakes somebody up, so each branch is pinned here:
 * the database mirrors them in raise_sos_alert(), and the two drifting apart
 * is the failure mode this suite exists to catch.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SOS_CHANNEL_EMAIL,
  DEFAULT_SOS_SETTINGS,
  SEVERITY_RANK,
  SosSettings,
  buildFingerprint,
  formatAlertHtml,
  formatAlertSubject,
  formatAlertText,
  normalizeSosSettings,
  shouldNotify
} from '../utils/sos/alertRules';
import { SosAlertInput } from '../utils/sos/alertRules';

const settings = (overrides: Partial<SosSettings> = {}): SosSettings => ({
  ...DEFAULT_SOS_SETTINGS,
  ...overrides
});

const alert: SosAlertInput = {
  code: 'SMTP_FAILOVER_PROMOTED',
  severity: 'critical',
  category: 'email_transport',
  title: 'SMTP account auto-promoted after repeated failures',
  message: 'Account B failed 3 consecutive sends; Account A has been promoted.',
  context: { demoted: 'smtp2', promoted: 'smtp', consecutiveFailures: 3 },
  source: 'worker'
};

describe('shouldNotify', () => {
  it('pushes a critical alert under default settings', () => {
    expect(shouldNotify({ severity: 'critical', category: 'email_transport', settings: settings() }))
      .toEqual({ notify: true, reason: 'delivered' });
  });

  it('records but does not push when alerting is switched off', () => {
    const result = shouldNotify({
      severity: 'critical',
      category: 'email_transport',
      settings: settings({ enabled: false })
    });
    expect(result).toEqual({ notify: false, reason: 'alerting_disabled' });
  });

  it('drops anything below the configured severity floor', () => {
    const result = shouldNotify({
      severity: 'warning',
      category: 'platform',
      settings: settings({ minSeverity: 'high' })
    });
    expect(result).toEqual({ notify: false, reason: 'below_min_severity' });
  });

  it('keeps pushing a severity that sits exactly on the floor', () => {
    expect(
      shouldNotify({ severity: 'high', category: 'platform', settings: settings({ minSeverity: 'high' }) }).notify
    ).toBe(true);
  });

  it('honours a muted area without touching the others', () => {
    const muted = settings({ mutedCategories: ['platform'] });
    expect(shouldNotify({ severity: 'critical', category: 'platform', settings: muted }))
      .toEqual({ notify: false, reason: 'category_muted' });
    expect(shouldNotify({ severity: 'critical', category: 'finance', settings: muted }).notify).toBe(true);
  });

  it('folds a repeat raised inside the dedupe window', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    const result = shouldNotify({
      severity: 'critical',
      category: 'email_transport',
      settings: settings({ dedupeWindowMinutes: 30 }),
      lastNotifiedAt: new Date('2026-10-10T09:45:00Z'),
      now
    });
    expect(result).toEqual({ notify: false, reason: 'duplicate_within_window' });
  });

  it('pages again once the window has passed, so a problem that comes back is not hidden', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    const result = shouldNotify({
      severity: 'critical',
      category: 'email_transport',
      settings: settings({ dedupeWindowMinutes: 30 }),
      lastNotifiedAt: new Date('2026-10-10T09:15:00Z'),
      now
    });
    expect(result.notify).toBe(true);
  });

  it('stops at the daily cap so a loop cannot flood the channel', () => {
    const result = shouldNotify({
      severity: 'critical',
      category: 'email_transport',
      settings: settings({ dailyNotificationCap: 50 }),
      notifiedToday: 50
    });
    expect(result).toEqual({ notify: false, reason: 'daily_cap_reached' });
  });

  it('reports having nowhere to send when neither destination is configured', () => {
    const result = shouldNotify({
      severity: 'critical',
      category: 'email_transport',
      settings: settings({ channelEmail: '', webhookUrl: '' })
    });
    expect(result).toEqual({ notify: false, reason: 'no_destination' });
  });

  it('ranks severities loudest first', () => {
    expect(SEVERITY_RANK.critical).toBeGreaterThan(SEVERITY_RANK.high);
    expect(SEVERITY_RANK.high).toBeGreaterThan(SEVERITY_RANK.warning);
    expect(SEVERITY_RANK.warning).toBeGreaterThan(SEVERITY_RANK.info);
  });
});

describe('normalizeSosSettings', () => {
  it('falls back to defaults for anything malformed rather than throwing', () => {
    const result = normalizeSosSettings({
      enabled: 'yes',
      minSeverity: 'catastrophic',
      mutedCategories: ['finance', 'not_a_category', 42],
      dedupeWindowMinutes: -5,
      dailyNotificationCap: 'lots',
      channelEmail: 'not-an-address'
    });

    expect(result.enabled).toBe(true);
    expect(result.minSeverity).toBe('warning');
    expect(result.mutedCategories).toEqual(['finance']);
    expect(result.dedupeWindowMinutes).toBe(DEFAULT_SOS_SETTINGS.dedupeWindowMinutes);
    expect(result.dailyNotificationCap).toBe(DEFAULT_SOS_SETTINGS.dailyNotificationCap);
    expect(result.channelEmail).toBe(DEFAULT_SOS_CHANNEL_EMAIL);
  });

  it('survives null, which is what an unreadable settings row looks like', () => {
    expect(normalizeSosSettings(null)).toEqual(DEFAULT_SOS_SETTINGS);
  });

  it('keeps values that are valid', () => {
    const result = normalizeSosSettings({
      enabled: false,
      channelEmail: '  ops-alerts@example.slack.com ',
      webhookUrl: ' https://hooks.slack.com/services/x ',
      minSeverity: 'critical',
      dedupeWindowMinutes: 5,
      dailyNotificationCap: 10
    });
    expect(result.enabled).toBe(false);
    expect(result.channelEmail).toBe('ops-alerts@example.slack.com');
    expect(result.webhookUrl).toBe('https://hooks.slack.com/services/x');
    expect(result.minSeverity).toBe('critical');
    expect(result.dedupeWindowMinutes).toBe(5);
  });
});

describe('buildFingerprint', () => {
  it('folds repeats of the same failure on the same subject together', () => {
    expect(buildFingerprint('SMTP_SLOT_SEND_FAILED', 'smtp2'))
      .toBe(buildFingerprint('SMTP_SLOT_SEND_FAILED', 'SMTP2'));
  });

  it('keeps the same failure on different subjects apart', () => {
    expect(buildFingerprint('SMTP_SLOT_SEND_FAILED', 'smtp'))
      .not.toBe(buildFingerprint('SMTP_SLOT_SEND_FAILED', 'smtp2'));
  });

  it('defaults to one bucket per code when no subject is given', () => {
    expect(buildFingerprint('EMAIL_QUEUE_STUCK')).toBe('EMAIL_QUEUE_STUCK:global');
  });
});

describe('message formatting', () => {
  it('leads the subject with the severity so it reads on a phone', () => {
    expect(formatAlertSubject(alert)).toContain('[CRITICAL]');
    expect(formatAlertSubject(alert, 4)).toContain('×4');
  });

  it('tells the reader what it means and what to check first', () => {
    const text = formatAlertText(alert, { occurrences: 3, portalUrl: 'https://desk.example.org/' });
    expect(text).toContain('What happened:');
    expect(text).toContain('Why it matters:');
    expect(text).toContain('First check:');
    expect(text).toContain('Occurrences: 3');
    expect(text).toContain('demoted: smtp2');
    expect(text).toContain('https://desk.example.org/?tab=sos');
  });

  it('escapes context that came from an error message', () => {
    const html = formatAlertHtml({
      ...alert,
      message: 'failed on <script>alert(1)</script>',
      context: { detail: '<img src=x onerror=1>' }
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('leaves out an empty context block rather than printing an empty list', () => {
    const text = formatAlertText({ ...alert, context: {} });
    expect(text).not.toContain('Context:');
  });
});
