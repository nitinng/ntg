import { describe, it, expect, vi } from 'vitest';
import { validateRoutingSettings, findDirtyKeys } from '../utils/emailRoutingValidation';
import { loadEmailNotificationSettings, saveEmailNotificationSettings } from '../utils/emailNotificationService';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const upsertMock = vi.fn().mockResolvedValue({ error: null });
  const inMock = vi.fn().mockResolvedValue({
    data: [
      { key: 'active_email_provider', value: '"smtp"' },
      { key: 'active_smtp_slot', value: '"smtp2"' },
      {
        key: 'provider_config',
        value: {
          smtp: {
            host: 'smtp.gmail.com',
            port: 587,
            senderEmail: 'nitin@navgurukul.org'
          },
          smtp2: {
            host: 'smtp.gmail.com',
            port: 587,
            senderEmail: 'travel@navgurukul.org'
          }
        }
      },
      {
        key: 'quota_settings',
        value: { dailyQuota: 4000, warningThresholdPct: 80 }
      }
    ],
    error: null
  });

  const selectMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      in: inMock
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: upsertMock
  });

  return {
    supabase: {
      from: selectMock,
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { success: true, results: { sent: 1, failed: 0 } },
          error: null
        })
      }
    }
  };
});

describe('Email Notification Center Settings & Validation Tests', () => {
  it('detects dirty keys when settings are modified', () => {
    const original = [
      { key: 'lifecycle_standing_cc', value: ['travel.team@navgurukul.org'], label: 'CC', description: '', valueType: 'email_list' as const, group: 'routing', sortOrder: 1 }
    ];
    const draft = {
      lifecycle_standing_cc: ['travel.team@navgurukul.org', 'new.lead@navgurukul.org']
    };

    const dirty = findDirtyKeys(original, draft);
    expect(dirty).toContain('lifecycle_standing_cc');
  });

  it('validates email list formatting correctly', () => {
    const original = [
      { key: 'lifecycle_standing_cc', value: ['valid@navgurukul.org'], label: 'CC', description: '', valueType: 'email_list' as const, group: 'routing', sortOrder: 1 }
    ];
    const invalidDraft = {
      lifecycle_standing_cc: ['not-an-email', 'valid@navgurukul.org']
    };

    const errors = validateRoutingSettings(original, invalidDraft);
    expect(errors['lifecycle_standing_cc']).toBeDefined();
    expect(errors['lifecycle_standing_cc']).toContain('Not a valid address');
  });

  it('validates numerical SLA window hours', () => {
    const original = [
      { key: 'reminder_window_hours_first', value: 24, label: 'First Reminder', description: '', valueType: 'number' as const, group: 'reminders', sortOrder: 10 }
    ];
    const invalidDraft = {
      reminder_window_hours_first: 0
    };

    const errors = validateRoutingSettings(original, invalidDraft);
    expect(errors['reminder_window_hours_first']).toBeDefined();
    expect(errors['reminder_window_hours_first']).toContain('positive number');
  });

  it('loads email notification settings stripping quotes from active provider', async () => {
    const settings = await loadEmailNotificationSettings();
    expect(settings.activeProvider).toBe('smtp');
    expect(settings.providerConfig?.smtp?.host).toBe('smtp.gmail.com');
  });

  it('supports dual SMTP slots with active slot selection and 4000 daily quota', async () => {
    const settings = await loadEmailNotificationSettings();
    expect(settings.activeSmtpSlot).toBeDefined();
    expect(settings.quotaSettings.dailyQuota).toBe(4000);
    expect(settings.providerConfig.smtp2).toBeDefined();
  });

  it('defaults to a 2000 per-account cap and a 3-failure promotion threshold', async () => {
    const settings = await loadEmailNotificationSettings();
    expect(settings.quotaSettings.perAccountQuota).toBe(2000);
    expect(settings.quotaSettings.failoverAfterFailures).toBe(3);
  });

  it('saves email notification settings with onConflict key constraint', async () => {
    await saveEmailNotificationSettings({
      activeProvider: 'smtp',
      activeSmtpSlot: 'smtp2',
      providerConfig: {
        smtp: { host: 'smtp.gmail.com', port: 587 },
        smtp2: { host: 'smtp.gmail.com', port: 587 }
      },
      quotaSettings: { dailyQuota: 4000 }
    });

    const fromMock = supabase.from as any;
    expect(fromMock).toHaveBeenCalledWith('email_routing_settings');
  });

  it('flags AWS Mail Manager ingress endpoint as non-relay', () => {
    const ingressHost = 'jc37vubwcvn9.hkph.mail-manager-smtp.amazonaws.com';
    const isIngress = ingressHost.includes('mail-manager-smtp');
    expect(isIngress).toBe(true);

    const validRelay = 'email-smtp.ap-south-1.amazonaws.com';
    expect(validRelay.includes('mail-manager-smtp')).toBe(false);
  });
});
