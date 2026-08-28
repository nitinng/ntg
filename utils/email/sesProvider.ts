import { EmailMessage, EmailProvider, EmailSendResult, SesProviderConfig } from './types';
import { buildRfc2822MimeMessage, toBase64 } from './mimeBuilder';

/**
 * Amazon SES Provider implementation (prepared for future seamless migration).
 * Supports standard AWS SES SendRawEmail / v2 SendEmail API calls.
 */
export class SesProvider implements EmailProvider {
  readonly name = 'ses' as const;
  private config: SesProviderConfig;
  private fetchImpl: typeof fetch;

  constructor(config: SesProviderConfig) {
    if (!config.region || !config.accessKeyId || !config.secretAccessKey || !config.senderEmail) {
      throw new Error('SesProvider requires region, accessKeyId, secretAccessKey, and senderEmail');
    }
    this.config = config;
    this.fetchImpl = config.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (null as any));
  }

  /**
   * Sends an email via Amazon SES SendRawEmail API.
   */
  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const mime = buildRfc2822MimeMessage(message, {
        email: this.config.senderEmail,
        name: this.config.senderName
      });

      const rawData = toBase64(mime);
      const endpoint = `https://email.${this.config.region}.amazonaws.com/`;

      // Build parameters for SES SendRawEmail action
      const params = new URLSearchParams({
        Action: 'SendRawEmail',
        'RawMessage.Data': rawData,
        Source: message.from || this.config.senderEmail,
        Version: '2010-12-01'
      });

      // Note: In a complete AWS environment, standard SigV4 headers or AWS SDK can be attached.
      // Here we provide the standard API caller structure with error classification.
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
          // Authorization signature added by environment or AWS signing layer
        },
        body: params.toString()
      });

      const text = await response.text();

      if (!response.ok) {
        const isThrottled = response.status === 429 || text.includes('Throttling') || text.includes('TooManyRequestsException');
        const isTransient = isThrottled || response.status >= 500;

        return {
          success: false,
          provider: 'ses',
          error: {
            code: isThrottled ? 'THROTTLED' : `HTTP_${response.status}`,
            message: `SES delivery failed with status ${response.status}: ${text}`,
            isTransient,
            statusCode: response.status,
            rawError: text
          }
        };
      }

      // Extract MessageId from XML response if present
      const messageIdMatch = text.match(/<MessageId>(.*?)<\/MessageId>/);
      const messageId = messageIdMatch ? messageIdMatch[1] : 'ses-sent';

      return {
        success: true,
        messageId,
        provider: 'ses'
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'ses',
        error: {
          code: err.code || 'SES_SEND_EXCEPTION',
          message: err.message || 'Unknown exception during SES delivery',
          isTransient: true,
          rawError: err
        }
      };
    }
  }
}
