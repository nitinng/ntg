import { EmailConfig, EmailMessage, EmailProvider, EmailSendResult } from './types';
import { GmailProvider } from './gmailProvider';
import { SesProvider } from './sesProvider';
import { SmtpProvider } from './smtpProvider';
import { ResendProvider } from './resendProvider';

/**
 * In-memory Mock Email Provider for unit testing, dry-runs, and local development.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock' as const;
  public sentMessages: EmailMessage[] = [];
  public shouldFail: boolean = false;
  public failureIsTransient: boolean = false;
  public failureMessage: string = 'Mock provider simulated failure';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.shouldFail) {
      return {
        success: false,
        provider: 'mock',
        error: {
          code: 'MOCK_FAILURE',
          message: this.failureMessage,
          isTransient: this.failureIsTransient
        }
      };
    }

    this.sentMessages.push(message);
    return {
      success: true,
      messageId: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      provider: 'mock'
    };
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    return { ok: true, latencyMs: 5, message: 'Mock provider online' };
  }

  clear() {
    this.sentMessages = [];
    this.shouldFail = false;
  }
}

/**
 * Factory function to create an EmailProvider based on configuration.
 */
export const createEmailProvider = (config: EmailConfig): EmailProvider => {
  switch (config.providerType) {
    case 'gmail':
      if (!config.gmail) {
        throw new Error('Gmail configuration missing for EMAIL_PROVIDER=gmail');
      }
      return new GmailProvider(config.gmail);

    case 'ses':
      if (!config.ses) {
        throw new Error('SES configuration missing for EMAIL_PROVIDER=ses');
      }
      return new SesProvider(config.ses);

    case 'smtp':
      if (!config.smtp) {
        throw new Error('SMTP configuration missing for EMAIL_PROVIDER=smtp');
      }
      return new SmtpProvider(config.smtp);

    case 'resend':
      if (!config.resend) {
        throw new Error('Resend configuration missing for EMAIL_PROVIDER=resend');
      }
      return new ResendProvider(config.resend);

    case 'mock':
      return new MockEmailProvider();

    default:
      throw new Error(`Unsupported email provider type: ${(config as any).providerType}`);
  }
};
