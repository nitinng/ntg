import { EmailMessage, EmailProvider, EmailSendResult, SmtpProviderConfig } from './types';

export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private config: SmtpProviderConfig;
  private edgeFunctionUrl?: string;

  constructor(config: SmtpProviderConfig, edgeFunctionUrl?: string) {
    this.config = config;
    // Kept only so a caller can point at a non-default deployment. Requests
    // normally go through supabase.functions.invoke(), which attaches the
    // caller's access token -- the edge function now requires one, and both
    // calls below supply provider credentials, which it only honours for
    // Admin/PNC/Finance.
    this.edgeFunctionUrl = edgeFunctionUrl;
  }

  /**
   * POST to the worker with the signed-in user's token attached.
   *
   * The Supabase client is imported lazily: this module is reached from
   * providerFactory, which the provider unit tests import directly, and a
   * top-level import would construct the client -- and demand its environment
   * variables -- at module load.
   */
  private async callWorker(body: Record<string, unknown>): Promise<any> {
    const { supabase } = await import('../../supabaseClient');

    if (this.edgeFunctionUrl) {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(this.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify(body)
      });
      return await res.json().catch(() => ({}));
    }

    const { data, error } = await supabase.functions.invoke('process-email-queue', { body });
    if (error) throw error;
    return data ?? {};
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      const data = await this.callWorker({
        action: 'ping',
        provider: 'smtp',
        providerConfig: this.config
      });

      const latencyMs = Date.now() - start;

      if (data.success) {
        return {
          ok: true,
          latencyMs: data.latencyMs || latencyMs,
          message: data.message || `SMTP connection verified (${data.latencyMs || latencyMs}ms)`
        };
      }

      return {
        ok: false,
        latencyMs,
        message: data.message || data.error || 'SMTP connection failed'
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
      const data = await this.callWorker({
        action: 'send_direct',
        provider: 'smtp',
        providerConfig: this.config,
        message
      });

      if (!data.success) {
        return {
          success: false,
          provider: 'smtp',
          error: {
            code: data.error?.code || 'SMTP_WORKER_ERROR',
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
