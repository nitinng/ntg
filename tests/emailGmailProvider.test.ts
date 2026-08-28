import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailProvider } from '../utils/email/gmailProvider';
import { EmailMessage } from '../utils/email/types';

describe('GmailProvider: OAuth2 Token Exchange & API Delivery', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const createProvider = () => new GmailProvider({
    clientId: 'google-client-id-123',
    clientSecret: 'google-client-secret-456',
    refreshToken: 'google-refresh-token-789',
    senderEmail: 'travel@navgurukul.org',
    senderName: 'Navgurukul Travel Desk',
    fetchFn: mockFetch
  });

  const sampleMessage: EmailMessage = {
    to: ['recipient@navgurukul.org'],
    subject: 'Booking Complete',
    html: '<p>Your tickets have been confirmed.</p>'
  };

  it('exchanges refresh token for access token and caches it for subsequent calls', async () => {
    // 1. First fetch: Token refresh
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'mock-access-token-xyz',
        expires_in: 3600,
        token_type: 'Bearer'
      })
    });

    // 2. Second fetch: Gmail API messages.send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'gmail-msg-id-001',
        threadId: 'gmail-thread-id-001'
      })
    });

    const provider = createProvider();
    const result = await provider.send(sampleMessage);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('gmail-msg-id-001');
    expect(result.provider).toBe('gmail');

    // Verify token refresh call
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://oauth2.googleapis.com/token', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('grant_type=refresh_token')
    }));

    // Verify Gmail send call
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer mock-access-token-xyz'
      })
    }));

    // 3. Third call: Token should be cached (no new token refresh needed)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'gmail-msg-id-002' })
    });

    const secondResult = await provider.send(sampleMessage);
    expect(secondResult.success).toBe(true);
    // Total fetch calls = 3 (1 token + 2 sends)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('classifies 429 rate-limiting as a transient retriable error', async () => {
    // Token refresh succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token', expires_in: 3600 })
    });

    // Gmail send returns 429 Too Many Requests
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({
        error: {
          code: 429,
          message: 'User-rate limit exceeded. Retry later.',
          errors: [{ reason: 'rateLimitExceeded' }]
        }
      })
    });

    const provider = createProvider();
    const result = await provider.send(sampleMessage);

    expect(result.success).toBe(false);
    expect(result.error?.isTransient).toBe(true);
    expect(result.error?.statusCode).toBe(429);
    expect(result.error?.message).toContain('User-rate limit exceeded');
  });

  it('classifies 400 Bad Request as a permanent non-retriable error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token', expires_in: 3600 })
    });

    // Gmail send returns 400 Bad Request (e.g. invalid recipient address)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        error: {
          code: 400,
          message: 'Invalid To header: malformed email address'
        }
      })
    });

    const provider = createProvider();
    const result = await provider.send(sampleMessage);

    expect(result.success).toBe(false);
    expect(result.error?.isTransient).toBe(false);
    expect(result.error?.statusCode).toBe(400);
  });

  it('handles token refresh revocation (invalid_grant) as a permanent failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.'
      })
    });

    const provider = createProvider();
    const result = await provider.send(sampleMessage);

    expect(result.success).toBe(false);
    expect(result.error?.isTransient).toBe(false);
    expect(result.error?.message).toContain('Token has been expired or revoked');
  });
});
