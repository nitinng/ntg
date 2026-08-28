import { describe, it, expect } from 'vitest';
import { buildRfc2822MimeMessage, buildGmailRawPayload, toBase64Url, toBase64 } from '../utils/email/mimeBuilder';
import { EmailMessage } from '../utils/email/types';

describe('Email MIME Builder: buildRfc2822MimeMessage & toBase64Url', () => {
  it('encodes base64url properly without +, / or trailing = padding', () => {
    const text = 'Hello world from Navgurukul Travel Desk! Special chars: ? & = +';
    const base64Url = toBase64Url(text);

    expect(base64Url).not.toContain('+');
    expect(base64Url).not.toContain('/');
    expect(base64Url).not.toContain('=');
  });

  it('constructs well-formed RFC 2822 MIME message with all headers and UTF-8 base64 body', () => {
    const message: EmailMessage = {
      to: ['employee@navgurukul.org'],
      cc: ['manager@navgurukul.org'],
      bcc: ['audit@navgurukul.org'],
      subject: 'Travel Request Confirmed - TRV-1001',
      html: '<h1>Booking Confirmed</h1><p>Enjoy your trip to Pune!</p>',
      from: 'travel@navgurukul.org',
      replyTo: 'pnc@navgurukul.org'
    };

    const mime = buildRfc2822MimeMessage(message, {
      email: 'travel@navgurukul.org',
      name: 'Navgurukul Travel Desk'
    });

    expect(mime).toContain('To: employee@navgurukul.org');
    expect(mime).toContain('Cc: manager@navgurukul.org');
    expect(mime).toContain('Bcc: audit@navgurukul.org');
    expect(mime).toContain('Reply-To: pnc@navgurukul.org');
    expect(mime).toContain('MIME-Version: 1.0');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    expect(mime).toContain('Subject: =?UTF-8?B?');
  });

  it('handles multiple recipients formatted as comma-separated lists', () => {
    const message: EmailMessage = {
      to: ['user1@navgurukul.org', 'user2@navgurukul.org'],
      cc: ['cc1@navgurukul.org', 'cc2@navgurukul.org'],
      subject: 'Group Booking Update',
      html: '<p>Group travel update</p>'
    };

    const mime = buildRfc2822MimeMessage(message);
    expect(mime).toContain('To: user1@navgurukul.org, user2@navgurukul.org');
    expect(mime).toContain('Cc: cc1@navgurukul.org, cc2@navgurukul.org');
  });

  it('builds raw base64url payload for Gmail API', () => {
    const message: EmailMessage = {
      to: ['test@navgurukul.org'],
      subject: 'Test Subject',
      html: '<p>Test Body</p>'
    };

    const payload = buildGmailRawPayload(message);
    expect(payload).toHaveProperty('raw');
    expect(typeof payload.raw).toBe('string');
    expect(payload.raw.length).toBeGreaterThan(10);
    expect(payload.raw).not.toContain('+');
    expect(payload.raw).not.toContain('/');
  });
});
