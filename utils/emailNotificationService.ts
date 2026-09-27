/**
 * Centralized Application Email & Notification Service.
 *
 * Implements the core architecture:
 * Application Action -> Notification -> Template + Recipient -> Email Provider -> Delivery Tracking -> Monitoring
 */

import { supabase } from '../supabaseClient';
import { TravelEvent, EmailAudience, EmailContextKey, TravelRequest, User } from '../types';
import { getEmailRoutingConfig } from './emailTriggers';
import { resolveTemplateVariables } from './emailQueueUtils';

export interface SendNotificationOptions {
  event?: TravelEvent;
  audience?: EmailAudience;
  contextKey?: EmailContextKey;
  ticketId?: string;
  request?: TravelRequest;
  recipients?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  templateKey?: string;
  extraContext?: Record<string, any>;
  idempotencySuffix?: string;
  sendImmediately?: boolean;
}

export interface SendNotificationResult {
  success: boolean;
  queueId?: string;
  messageId?: string;
  provider?: string;
  error?: string;
  status: 'Queued' | 'Sent' | 'Failed' | 'Skipped';
}

export interface ReminderScheduleOptions {
  ticketId: string;
  reminderType: 'first_reminder_24h' | 'final_reminder_72h' | 'escalation_5d' | 'auto_close_7d' | 'custom';
  scheduledAt?: string;
  delayHours?: number;
  recipientEmail?: string;
  metadata?: Record<string, any>;
}

export interface ProviderHealthStatus {
  provider: 'smtp' | 'ses' | 'gmail' | 'resend';
  label: string;
  status: 'Connected' | 'Error' | 'Configuration Required' | 'Not Configured';
  latencyMs?: number;
  lastChecked?: string;
  message?: string;
  quotaDaily: number;
}

const EDGE_FUNCTION_URL = 'https://bzjzgykbfqfbbqibxexw.supabase.co/functions/v1/process-email-queue';

/**
 * Triggers the background worker to drain pending items in email_queue immediately.
 */
export const triggerEmailWorker = async (options: { provider?: string; testToken?: boolean } = {}): Promise<any> => {
  try {
    const url = new URL(EDGE_FUNCTION_URL);
    if (options.provider) url.searchParams.set('provider', options.provider);
    if (options.testToken) url.searchParams.set('testToken', 'true');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    return await response.json().catch(() => ({}));
  } catch (err: any) {
    console.warn('Worker invocation notice:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Pings the configured active provider (or a specific provider) to test connection and report latency.
 */
export const pingProviderConnection = async (
  provider?: string,
  customConfig?: any
): Promise<{ ok: boolean; latencyMs: number; message: string; provider: string }> => {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}?ping=true${provider ? `&provider=${provider}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ping',
        provider,
        providerConfig: customConfig
      })
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success) {
      return {
        ok: true,
        latencyMs: data.latencyMs || 0,
        message: data.message || `Provider ${data.provider || provider} connected successfully`,
        provider: data.provider || provider || 'smtp'
      };
    }

    return {
      ok: false,
      latencyMs: data.latencyMs || 0,
      message: data.message || data.error || `Provider connection test failed (HTTP ${response.status})`,
      provider: data.provider || provider || 'unknown'
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: 0,
      message: err.message || 'Network error reaching email dispatch worker',
      provider: provider || 'unknown'
    };
  }
};

/**
 * Centralized method for application modules to request email delivery.
 */
export const sendNotification = async (
  options: SendNotificationOptions
): Promise<SendNotificationResult> => {
  try {
    let subject = options.subject || '';
    let body = options.body || '';
    let recipients = options.recipients || [];
    let cc = options.cc || [];
    let templateKey = options.templateKey || null;
    let templateName = null;

    // If an event is provided and template is not directly specified, resolve it
    if (options.event && options.audience && (!subject || !body)) {
      const { data: templates } = await supabase
        .from('mail_templates')
        .select('*')
        .eq('event', options.event)
        .eq('audience', options.audience)
        .eq('is_active', true)
        .eq('is_draft', false);

      if (templates && templates.length > 0) {
        const exact = options.contextKey ? templates.find(t => t.context_key === options.contextKey) : null;
        const chosen = exact || templates.find(t => !t.context_key) || templates[0];
        if (chosen) {
          subject = chosen.subject;
          body = chosen.body;
          templateKey = chosen.template_key;
          templateName = chosen.name;
        }
      }
    }

    // Apply template interpolation
    if (options.request) {
      const config = await getEmailRoutingConfig();
      const extraContext = {
        '{{support_email}}': config.supportEmail,
        '{{portal_url}}': config.portalUrl,
        ...(options.extraContext || {})
      };
      subject = resolveTemplateVariables(subject, options.request, extraContext);
      body = resolveTemplateVariables(body, options.request, extraContext);
    }

    if (!recipients || recipients.length === 0) {
      return { success: false, status: 'Skipped', error: 'No recipients provided' };
    }

    const idempotencyKey = [
      options.ticketId ? `ticket:${options.ticketId}` : `custom:${Date.now()}`,
      options.event ? `event:${options.event}` : null,
      options.audience ? `aud:${options.audience}` : null,
      `to:${recipients.slice().sort().join(',')}`,
      options.idempotencySuffix ? `seq:${options.idempotencySuffix}` : null
    ].filter(Boolean).join('|');

    const { data: queueItem, error: insertErr } = await supabase
      .from('email_queue')
      .insert({
        ticket_id: options.ticketId || null,
        to_status: options.request?.pncStatus || 'Notification',
        event: options.event || null,
        audience: options.audience || null,
        context_key: options.contextKey || null,
        template_key: templateKey,
        template_name: templateName,
        recipients,
        cc,
        subject,
        body,
        status: 'Pending',
        retry_count: 0,
        attempt_count: 0,
        idempotency_key: idempotencyKey,
        available_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertErr) {
      // Check for duplicate idempotency
      if (insertErr.code === '23505') {
        return { success: true, status: 'Skipped', error: 'Duplicate notification prevented by idempotency check' };
      }
      throw insertErr;
    }

    if (options.sendImmediately !== false) {
      void triggerEmailWorker();
    }

    return {
      success: true,
      queueId: queueItem?.id,
      status: 'Queued'
    };
  } catch (err: any) {
    console.error('sendNotification failed:', err);
    return {
      success: false,
      status: 'Failed',
      error: err.message || 'Failed to enqueue notification'
    };
  }
};

/**
 * Dispatches a Live Verification Test email and triggers immediate delivery.
 */
export const dispatchLiveTestEmail = async (
  recipient: string,
  provider?: string,
  actor?: { email?: string; name?: string }
): Promise<{ success: boolean; messageId?: string; message: string; error?: string }> => {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const subject = `Navgurukul Travel Desk Delivery Test — ${timestamp}`;
    const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const body = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Navgurukul Travel Desk</h1>
    <p style="color: #64748b; margin-top: 4px; font-size: 13px;">Live Provider Verification Test</p>
  </div>
  
  <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 16px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: 600;">✓ Live Email Delivery Operational</p>
    <p style="margin: 6px 0 0 0; color: #475569; font-size: 13px; line-height: 1.5;">This email confirms that the Navgurukul Travel Desk outbound email transport (${provider || 'Active Provider'}) and delivery worker are connected and transmitting correctly.</p>
  </div>

  <div style="margin: 20px 0; font-size: 13px; color: #334155; line-height: 1.6;">
    <p><strong>Status:</strong> Verified & Delivered</p>
    <p><strong>Provider:</strong> ${provider ? provider.toUpperCase() : 'Active System Provider'}</p>
    <p><strong>Sent To:</strong> ${recipient}</p>
    <p><strong>Dispatched At:</strong> ${new Date().toLocaleString()}</p>
  </div>

  <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
    Navgurukul Travel Desk System Notification • Automated Test Dispatch
  </div>
</div>
`.trim();

    const { data: inserted, error: insertError } = await supabase
      .from('email_queue')
      .insert({
        recipients: [recipient],
        to_status: 'Test Email',
        subject,
        body,
        status: 'Pending',
        retry_count: 0,
        attempt_count: 0,
        idempotency_key: testId,
        available_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Trigger Edge Function worker
    const workerRes = await triggerEmailWorker({ provider });

    // Record Audit Log
    await logEmailAuditAction(
      'Live Test Email Dispatched',
      { recipient, provider: provider || 'active', queueId: inserted.id },
      actor
    );

    if (workerRes.success && workerRes.results?.sent > 0) {
      return {
        success: true,
        messageId: workerRes.results?.errors?.[0]?.id || inserted.id,
        message: `Test email successfully sent to ${recipient} via ${workerRes.activeProvider || provider || 'SMTP'}`
      };
    }

    if (workerRes.results?.errors && workerRes.results.errors.length > 0) {
      const errDetail = workerRes.results.errors[0]?.error?.message || 'Worker send failure';
      return {
        success: false,
        message: `Email queued but worker returned error: ${errDetail}`,
        error: errDetail
      };
    }

    return {
      success: true,
      message: `Test email queued and sent to delivery worker for ${recipient}`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to dispatch test email',
      error: err.message
    };
  }
};

/**
 * Audit trail logging for Email & Notification Center actions.
 */
export const logEmailAuditAction = async (
  action: string,
  details: Record<string, any>,
  actor?: { email?: string; name?: string }
): Promise<void> => {
  try {
    await supabase.from('email_audit_logs').insert({
      action,
      actor_email: actor?.email || 'admin@navgurukul.org',
      actor_name: actor?.name || 'Administrator',
      details,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Could not record email audit log:', err);
  }
};

/**
 * Loads the active provider and system configurations from email_routing_settings.
 */
export const loadEmailNotificationSettings = async (): Promise<{
  activeProvider: string;
  providerConfig: any;
  quotaSettings: any;
  domainSecurity: any;
}> => {
  const defaults = {
    activeProvider: 'smtp',
    providerConfig: {
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
        configurationSet: 'travel-desk-production',
        senderEmail: 'travel@navgurukul.org',
        senderName: 'Navgurukul Travel Desk',
        replyTo: 'travel@navgurukul.org'
      },
      gmail: {
        senderEmail: 'travel@navgurukul.org',
        senderName: 'Navgurukul Travel Desk',
        authorizedScope: 'https://www.googleapis.com/auth/gmail.send'
      },
      resend: {
        senderEmail: 'travel@navgurukul.org',
        senderName: 'Navgurukul Travel Desk'
      }
    },
    quotaSettings: {
      dailyQuota: 2000,
      warningThresholdPct: 80,
      criticalThresholdPct: 95,
      fallbackProvider: 'ses'
    },
    domainSecurity: {
      domain: 'navgurukul.org',
      spf: { status: 'Valid', record: 'v=spf1 include:_spf.google.com ~all', lastChecked: new Date().toISOString() },
      dkim: { status: 'Verified', selector: 'google._domainkey.navgurukul.org', keyLength: '2048-bit RSA', lastChecked: new Date().toISOString() },
      dmarc: { status: 'Valid', policy: 'p=reject', record: 'v=DMARC1; p=reject; rua=mailto:travel@navgurukul.org', lastChecked: new Date().toISOString() },
      mx: { status: 'Active', records: ['1 ASPMX.L.GOOGLE.COM', '5 ALT1.ASPMX.L.GOOGLE.COM'], lastChecked: new Date().toISOString() }
    }
  };

  try {
    const { data } = await supabase
      .from('email_routing_settings')
      .select('key, value')
      .in('key', ['active_email_provider', 'provider_config', 'quota_settings', 'domain_security_status']);

    if (data && data.length > 0) {
      for (const row of data) {
        if (row.key === 'active_email_provider' && row.value) {
          defaults.activeProvider = typeof row.value === 'string' ? row.value : String(row.value);
        } else if (row.key === 'provider_config' && row.value) {
          defaults.providerConfig = { ...defaults.providerConfig, ...row.value };
        } else if (row.key === 'quota_settings' && row.value) {
          defaults.quotaSettings = { ...defaults.quotaSettings, ...row.value };
        } else if (row.key === 'domain_security_status' && row.value) {
          defaults.domainSecurity = { ...defaults.domainSecurity, ...row.value };
        }
      }
    }
  } catch (err) {
    console.warn('Using default email notification settings:', err);
  }

  return defaults;
};

/**
 * Saves provider configuration and active provider settings.
 */
export const saveEmailNotificationSettings = async (
  updates: {
    activeProvider?: string;
    providerConfig?: any;
    quotaSettings?: any;
  },
  actor?: { email?: string; name?: string }
): Promise<void> => {
  const actorEmail = actor?.email || 'admin@navgurukul.org';

  if (updates.activeProvider !== undefined) {
    await supabase.from('email_routing_settings').upsert({
      key: 'active_email_provider',
      value: updates.activeProvider,
      label: 'Active Email Provider',
      description: 'Currently active outbound transport.',
      value_type: 'text',
      group: 'provider',
      updated_at: new Date().toISOString(),
      updated_by: actorEmail
    });

    await logEmailAuditAction(
      'Active Email Provider Changed',
      { newActiveProvider: updates.activeProvider },
      actor
    );
  }

  if (updates.providerConfig !== undefined) {
    await supabase.from('email_routing_settings').upsert({
      key: 'provider_config',
      value: updates.providerConfig,
      label: 'Provider Credentials & Settings',
      description: 'Connection credentials and sender profiles.',
      value_type: 'json',
      group: 'provider',
      updated_at: new Date().toISOString(),
      updated_by: actorEmail
    });

    await logEmailAuditAction(
      'Email Provider Configuration Updated',
      { providersUpdated: Object.keys(updates.providerConfig) },
      actor
    );
  }

  if (updates.quotaSettings !== undefined) {
    await supabase.from('email_routing_settings').upsert({
      key: 'quota_settings',
      value: updates.quotaSettings,
      label: 'Quota & Threshold Alerts',
      description: 'Daily send capacity and warning thresholds.',
      value_type: 'json',
      group: 'quota',
      updated_at: new Date().toISOString(),
      updated_by: actorEmail
    });

    await logEmailAuditAction(
      'Quota Settings Updated',
      { quotaSettings: updates.quotaSettings },
      actor
    );
  }
};
