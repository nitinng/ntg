/**
 * Booking mails carry the ticket. Two things have to hold: the MIME has to be
 * well-formed enough that a strict MTA accepts it, and a failure anywhere in
 * the ticket path must degrade to the link rather than losing the mail.
 */

import { describe, it, expect } from 'vitest';
import { buildRfc2822MimeMessage, wrapBase64, toBase64 } from '../utils/email/mimeBuilder';
import { EmailMessage, EmailAttachment } from '../utils/email/types';

const base = (overrides?: Partial<EmailMessage>): EmailMessage => ({
  to: ['employee@navgurukul.org'],
  subject: 'Booking Confirmed - TRV-1001',
  html: '<p>Your ticket is attached.</p>',
  from: 'travel@navgurukul.org',
  ...overrides
});

const pdf = (content = toBase64('pretend-pdf-bytes')): EmailAttachment => ({
  filename: 'Ticket-TRV-1001.pdf',
  content,
  contentType: 'application/pdf'
});

describe('messages without attachments are unchanged', () => {
  it('stays a single-part text/html message', () => {
    const mime = buildRfc2822MimeMessage(base());

    // Every existing mail goes through this path, so it must not become
    // multipart just because the capability now exists.
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).not.toContain('multipart/mixed');
    expect(mime).not.toContain('Content-Disposition');
  });
});

describe('messages with an attachment', () => {
  it('becomes multipart/mixed with a declared boundary', () => {
    const mime = buildRfc2822MimeMessage(base({ attachments: [pdf()] }));

    const match = /Content-Type: multipart\/mixed; boundary="([^"]+)"/.exec(mime);
    expect(match).not.toBeNull();

    const boundary = match![1];
    // Opening part, attachment part, and the terminating delimiter.
    expect(mime).toContain(`--${boundary}\r\n`);
    expect(mime.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('keeps the HTML body as the first part', () => {
    const mime = buildRfc2822MimeMessage(base({ attachments: [pdf()] }));
    const bodyIndex = mime.indexOf(toBase64('<p>Your ticket is attached.</p>'));
    const attachmentIndex = mime.indexOf('Content-Disposition: attachment');

    expect(bodyIndex).toBeGreaterThan(-1);
    // A client showing the first part must show the message, not the file.
    expect(bodyIndex).toBeLessThan(attachmentIndex);
  });

  it('declares the attachment with its filename and type', () => {
    const mime = buildRfc2822MimeMessage(base({ attachments: [pdf()] }));

    expect(mime).toContain('Content-Type: application/pdf; name="Ticket-TRV-1001.pdf"');
    expect(mime).toContain('Content-Disposition: attachment; filename="Ticket-TRV-1001.pdf"');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
  });

  it('never emits an encoded body line longer than 76 characters', () => {
    // Strict MTAs reject or silently truncate longer lines, which corrupts the
    // file on arrival -- the failure mode that looks like "the PDF won't open".
    // Headers are exempt: RFC 5322 allows them up to 998 octets, and the
    // multipart Content-Type with its boundary legitimately exceeds 76.
    const long = toBase64('x'.repeat(5000));
    const mime = buildRfc2822MimeMessage(base({ attachments: [pdf(long)] }));

    const bodyLines = mime.split('\r\n\r\n').slice(1).join('\r\n\r\n').split('\r\n');
    expect(bodyLines.length).toBeGreaterThan(10);
    for (const line of bodyLines) {
      expect(line.length, `over-long line: ${line.slice(0, 40)}...`).toBeLessThanOrEqual(76);
    }
  });

  it('wraps the HTML body too, not just the attachment', () => {
    // A long booking confirmation on one unwrapped line can breach the hard
    // 998-octet limit in RFC 5322. Pre-existing, but fixed here since the
    // builder is being changed anyway.
    const mime = buildRfc2822MimeMessage(
      base({ html: `<p>${'word '.repeat(600)}</p>`, attachments: [pdf()] })
    );

    const bodyLines = mime.split('\r\n\r\n').slice(1).join('\r\n\r\n').split('\r\n');
    for (const line of bodyLines) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  it('keeps cc, bcc and reply-to headers alongside the attachment', () => {
    const mime = buildRfc2822MimeMessage(
      base({
        cc: ['manager@navgurukul.org'],
        bcc: ['audit@navgurukul.org'],
        replyTo: 'pnc@navgurukul.org',
        attachments: [pdf()]
      })
    );

    expect(mime).toContain('Cc: manager@navgurukul.org');
    expect(mime).toContain('Bcc: audit@navgurukul.org');
    expect(mime).toContain('Reply-To: pnc@navgurukul.org');
  });

  it('supports more than one attachment', () => {
    const mime = buildRfc2822MimeMessage(
      base({
        attachments: [pdf(), { ...pdf(), filename: 'Ticket-TRV-1001-return.pdf' }]
      })
    );

    expect(mime).toContain('filename="Ticket-TRV-1001.pdf"');
    expect(mime).toContain('filename="Ticket-TRV-1001-return.pdf"');
    expect(mime.match(/Content-Disposition: attachment/g)).toHaveLength(2);
  });

  it('gives each message a distinct boundary', () => {
    const boundaryOf = (mime: string) =>
      /boundary="([^"]+)"/.exec(mime)?.[1];

    const first = boundaryOf(buildRfc2822MimeMessage(base({ attachments: [pdf()] })));
    const second = boundaryOf(buildRfc2822MimeMessage(base({ attachments: [pdf()] })));

    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('uses a boundary that cannot occur in base64 content', () => {
    const mime = buildRfc2822MimeMessage(base({ attachments: [pdf()] }));
    const boundary = /boundary="([^"]+)"/.exec(mime)![1];

    // '=' only ever appears as trailing base64 padding, never followed by '_'.
    expect(boundary).toContain('=_');
  });
});

describe('wrapBase64', () => {
  it('leaves short content alone', () => {
    expect(wrapBase64('abc')).toBe('abc');
  });

  it('breaks at exactly 76 characters', () => {
    const wrapped = wrapBase64('a'.repeat(200));
    const lines = wrapped.split('\r\n');
    expect(lines[0]).toHaveLength(76);
    expect(lines[1]).toHaveLength(76);
    expect(lines[2]).toHaveLength(48);
  });
});

describe('the edge function keeps the same MIME logic', () => {
  // supabase/functions is excluded from tsconfig (tsconfig.json "exclude"), so
  // `npm run typecheck` never sees the edge function, and it has no runtime
  // tests because it imports from esm.sh and calls Deno.serve at module scope.
  // Its MIME builder is therefore a hand-kept copy of the one tested above.
  //
  // This caught a real defect: the body wrap was written with a doubled escape
  // ('$1\\r\\n'), which would have inserted the literal characters \r\n into
  // the base64 body of every multipart message instead of a line break.
  const normalise = (source: string): string => {
    const start = source.indexOf('const attachments = message.attachments || [];');
    const returnAt = source.indexOf('return `${headers.join', start);
    const end = source.indexOf('};', returnAt);
    return source
      .slice(start, end)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  it('is byte-for-byte equivalent to the tested builder', async () => {
    const { readFileSync } = await import('node:fs');
    const WRAP = `replace(/(.{76})/g, '$1\\r\\n')`;

    const tested = normalise(readFileSync('utils/email/mimeBuilder.ts', 'utf8'))
      .replace('wrapBase64(base64Body)', 'BODYWRAP')
      .replace('wrapBase64(attachment.content)', 'ATTWRAP')
      .replace('`=_NGTD_${randomBoundarySuffix()}`', 'BOUNDARY')
      // The edge copy has never supported custom headers; not part of this change.
      .replace(/if \(message\.headers\) \{.*?\} \}/, '')
      .replace(/\s+/g, ' ')
      .trim();

    const edge = normalise(
      readFileSync('supabase/functions/process-email-queue/index.ts', 'utf8')
    )
      .replace(`base64Body.${WRAP}`, 'BODYWRAP')
      .replace(`attachment.content.${WRAP}`, 'ATTWRAP')
      .replace("`=_NGTD_${crypto.randomUUID().replace(/-/g, '')}`", 'BOUNDARY')
      .replace(/\s+/g, ' ')
      .trim();

    expect(edge).toBe(tested);
  });

  it('emits real line breaks, not the literal characters', async () => {
    const { readFileSync } = await import('node:fs');
    const edge = readFileSync('supabase/functions/process-email-queue/index.ts', 'utf8');

    // A doubled escape here corrupts every attachment, and nothing else in the
    // pipeline would notice.
    expect(edge).not.toContain(String.raw`'$1\\r\\n'`);
    expect(edge.match(/replace\(\/\(\.\{76\}\)\/g/g)).toHaveLength(2);
  });
});
