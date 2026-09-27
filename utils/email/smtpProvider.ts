import { EmailMessage, EmailProvider, EmailSendResult, SmtpProviderConfig } from './types';

export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private config: SmtpProviderConfig;
  private edgeFunctionUrl: string;

  constructor(config: SmtpProviderConfig, edgeFunctionUrl?: string) {
    this.config = config;
    this.edgeFunctionUrl = edgeFunctionUrl || 'https://bzjzgykbfqfbbqibxexw.supabase.co/functions/v1/process-email-queue';
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.edgeFunctionUrl}?ping=true&provider=smtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ping',
          provider: 'smtp',
          providerConfig: this.config
        })
      });

      const data = await res.json().catch(() => ({}));
      const latencyMs = Date.now() - start;

      if (res.ok && data.success) {
        return {
          ok: true,
          latencyMs: data.latencyMs || latencyMs,
          message: data.message || `SMTP connection verified (${data.latencyMs || latencyMs}ms)`
        };
      }

      return {
        ok: false,
        latencyMs,
        message: data.message || data.error || `SMTP connection failed (HTTP ${res.status})`
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: 0,
        message: err.message || 'SMTP connection failed'
      };
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const res = await fetch(this.edgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_direct',
          provider: 'smtp',
          providerConfig: this.config,
          message
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return {
          success: false,
          provider: 'smtp',
          error: {
            code: data.error?.code || `HTTP_${res.status}`,
            message: data.error?.message || data.error || 'SMTP delivery failure',
            isTransient: data.error?.isTransient ?? true
          }
        };
      }

      return {
        success: true,
        messageId: data.messageId || `smtp-${Date.now()}`,
        provider: 'smtp'
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'smtp',
        error: {
          code: 'SMTP_CLIENT_EXCEPTION',
          message: err.message,
          isTransient: true
        }
      };
    }
  }
}
