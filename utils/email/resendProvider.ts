import { EmailMessage, EmailProvider, EmailSendResult, ResendProviderConfig } from './types';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private apiKey: string;
  private senderEmail: string;
  private senderName?: string;
  private fetchFn: typeof fetch;

  constructor(config: ResendProviderConfig) {
    this.apiKey = config.apiKey;
    this.senderEmail = config.senderEmail || 'travel@navgurukul.org';
    this.senderName = config.senderName || 'Navgurukul Travel Desk';
    this.fetchFn = config.fetchFn || fetch;
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      const res = await this.fetchFn('https://api.resend.com/api_keys', {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { ok: true, latencyMs, message: `Resend API verified (${latencyMs}ms)` };
      }
      return { ok: false, latencyMs, message: `Resend HTTP ${res.status}: ${res.statusText}` };
    } catch (e: any) {
      return { ok: false, latencyMs: 0, message: e.message || 'Resend ping failed' };
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const from = this.senderName ? `"${this.senderName}" <${this.senderEmail}>` : this.senderEmail;
      const response = await this.fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: message.to,
          cc: message.cc?.length ? message.cc : undefined,
          bcc: message.bcc?.length ? message.bcc : undefined,
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          provider: 'resend',
          error: {
            code: `HTTP_${response.status}`,
            message: data.message || response.statusText,
            isTransient: response.status >= 500
          }
        };
      }

      return {
        success: true,
        messageId: data.id,
        provider: 'resend'
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'resend',
        error: {
          code: 'RESEND_EXCEPTION',
          message: err.message,
          isTransient: true
        }
      };
    }
  }
}
