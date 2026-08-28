import { EmailMessage, EmailProvider, EmailSendResult, GmailProviderConfig } from './types';
import { buildGmailRawPayload } from './mimeBuilder';

export class GmailProvider implements EmailProvider {
  readonly name = 'gmail' as const;
  private config: GmailProviderConfig;
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0; // Unix timestamp in ms
  private fetchImpl: typeof fetch;

  constructor(config: GmailProviderConfig) {
    if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.senderEmail) {
      throw new Error('GmailProvider requires clientId, clientSecret, refreshToken, and senderEmail');
    }
    this.config = config;
    this.fetchImpl = config.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (null as any));
  }

  /**
   * Retrieves a valid access token, exchanging the refresh token if expired.
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Use cached token if valid with at least 60 seconds safety buffer
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: 'refresh_token'
    });

    try {
      const response = await this.fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const data = await response.json();

      if (!response.ok || !data.access_token) {
        const errorDescription = data.error_description || data.error || response.statusText;
        const isAuthRevoked = data.error === 'invalid_grant' || response.status === 400 || response.status === 401;
        
        const error = new Error(`Failed to refresh Google OAuth access token: ${errorDescription}`);
        (error as any).isTransient = !isAuthRevoked;
        (error as any).statusCode = response.status;
        (error as any).code = data.error || 'AUTH_REFRESH_FAILED';
        throw error;
      }

      this.cachedAccessToken = data.access_token;
      // Default expiry is typically 3600 seconds (1 hour)
      const expiresInSec = data.expires_in || 3600;
      this.tokenExpiresAt = now + expiresInSec * 1000;

      return this.cachedAccessToken!;
    } catch (err: any) {
      if (err.isTransient !== undefined) throw err;
      // Network failure during token refresh is transient
      const networkError = new Error(`Network failure during Google OAuth refresh: ${err.message}`);
      (networkError as any).isTransient = true;
      (networkError as any).code = 'AUTH_NETWORK_ERROR';
      throw networkError;
    }
  }

  /**
   * Sends an email via the Gmail API messages.send endpoint.
   */
  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const accessToken = await this.getAccessToken();
      const payload = buildGmailRawPayload(message, {
        email: this.config.senderEmail,
        name: this.config.senderName
      });

      const sendEndpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
      const response = await this.fetchImpl(sendEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const statusCode = response.status;
        const errorMessage = data.error?.message || response.statusText || 'Gmail API send error';
        const errorReason = data.error?.errors?.[0]?.reason || '';

        // Classify errors: transient vs permanent
        // 429 = Rate limited / quota exceeded (transient)
        // 5xx = Google server error (transient)
        // 400 = Malformed message / bad recipient address (permanent)
        // 401 / 403 (with invalid credential or insufficient scope) = permanent unless temporary quota
        const isTransient = statusCode === 429 || statusCode >= 500 || errorReason === 'rateLimitExceeded' || errorReason === 'userRateLimitExceeded';

        return {
          success: false,
          provider: 'gmail',
          error: {
            code: errorReason || `HTTP_${statusCode}`,
            message: errorMessage,
            isTransient,
            statusCode,
            rawError: data
          }
        };
      }

      return {
        success: true,
        messageId: data.id || data.threadId || 'sent',
        provider: 'gmail'
      };
    } catch (err: any) {
      const isTransient = err.isTransient !== undefined ? err.isTransient : true;
      return {
        success: false,
        provider: 'gmail',
        error: {
          code: err.code || 'GMAIL_SEND_EXCEPTION',
          message: err.message || 'Unknown exception during Gmail delivery',
          isTransient,
          statusCode: err.statusCode,
          rawError: err
        }
      };
    }
  }
}
