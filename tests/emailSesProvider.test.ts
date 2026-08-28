import { describe, it, expect, vi } from 'vitest';
import { SesProvider } from '../utils/email/sesProvider';
import { EmailMessage } from '../utils/email/types';

describe('SesProvider: Amazon SES API Delivery (Dormant / Prepared)', () => {
  const sampleMessage: EmailMessage = {
    to: ['employee@navgurukul.org'],
    subject: 'Travel Desk Notice',
    html: '<p>SES Delivery Test</p>'
  };

  it('constructs well-formed SES SendRawEmail request and parses MessageId from XML response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <SendRawEmailResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/">
          <SendRawEmailResult>
            <MessageId>0100018f-abcd-1234-ses-msg-id</MessageId>
          </SendRawEmailResult>
          <ResponseMetadata>
            <RequestId>req-123</RequestId>
          </ResponseMetadata>
        </SendRawEmailResponse>
      `
    });

    const provider = new SesProvider({
      region: 'ap-south-1',
      accessKeyId: 'aws-access-key-test',
      secretAccessKey: 'aws-secret-key-test',
      senderEmail: 'travel@navgurukul.org',
      fetchFn: mockFetch
    });

    const result = await provider.send(sampleMessage);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('ses');
    expect(result.messageId).toBe('0100018f-abcd-1234-ses-msg-id');

    expect(mockFetch).toHaveBeenCalledWith('https://email.ap-south-1.amazonaws.com/', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('Action=SendRawEmail')
    }));
  });

  it('classifies SES Throttling / 429 as transient retriable error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => `<ErrorResponse><Error><Code>Throttling</Code><Message>Maximum sending rate exceeded.</Message></Error></ErrorResponse>`
    });

    const provider = new SesProvider({
      region: 'ap-south-1',
      accessKeyId: 'aws-key',
      secretAccessKey: 'aws-secret',
      senderEmail: 'travel@navgurukul.org',
      fetchFn: mockFetch
    });

    const result = await provider.send(sampleMessage);
    expect(result.success).toBe(false);
    expect(result.error?.isTransient).toBe(true);
    expect(result.error?.code).toBe('THROTTLED');
  });
});
