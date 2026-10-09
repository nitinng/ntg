import { EmailMessage } from './types';

/**
 * Base64 URL-safe encoder (replaces + with -, / with _, and strips padding =).
 */
export const toBase64Url = (str: string): string => {
  let base64 = '';
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(str, 'utf-8').toString('base64');
  } else if (typeof btoa !== 'undefined') {
    // Browser / Edge / Deno environment
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    throw new Error('No base64 encoding implementation found in runtime environment');
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Standard base64 encoder.
 */
export const toBase64 = (str: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  } else if (typeof btoa !== 'undefined') {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary);
  }
  throw new Error('No base64 encoding implementation found');
};

/**
 * Builds an RFC 2822 compliant MIME email string.
 */
export const buildRfc2822MimeMessage = (
  message: EmailMessage,
  defaultSender?: { email: string; name?: string }
): string => {
  const fromEmail = message.from || defaultSender?.email || 'noreply@navgurukul.org';
  const fromName = defaultSender?.name || 'Navgurukul Travel Desk';
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const toHeader = Array.isArray(message.to) ? message.to.join(', ') : message.to;
  const ccHeader = message.cc && message.cc.length > 0 ? message.cc.join(', ') : '';
  const bccHeader = message.bcc && message.bcc.length > 0 ? message.bcc.join(', ') : '';

  // Encode subject to UTF-8 Quoted-Printable or Base64 MIME header format if needed
  const encodedSubject = `=?UTF-8?B?${toBase64(message.subject)}?=`;

  const attachments = message.attachments || [];
  const hasAttachments = attachments.length > 0;

  // A boundary must not occur anywhere in the body. Base64 payloads cannot
  // contain the '=_' sequence, so this prefix is safe by construction.
  const boundary = `=_NGTD_${randomBoundarySuffix()}`;

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`
  ];

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  } else {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
  }

  if (ccHeader) headers.push(`Cc: ${ccHeader}`);
  if (bccHeader) headers.push(`Bcc: ${bccHeader}`);
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);

  if (message.headers) {
    for (const [key, value] of Object.entries(message.headers)) {
      headers.push(`${key}: ${value}`);
    }
  }

  const base64Body = toBase64(message.html || message.text || '');

  if (!hasAttachments) {
    return `${headers.join('\r\n')}\r\n\r\n${base64Body}`;
  }

  const parts: string[] = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    // Wrapped for the same reason as the attachment below: RFC 2045 caps
    // encoded lines at 76 characters, and RFC 5322 makes 998 octets a hard
    // limit that a long HTML body can breach on a single unwrapped line.
    wrapBase64(base64Body)
  ];

  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      // RFC 2045 caps encoded lines at 76 characters. Strict MTAs reject or
      // silently truncate longer ones, which corrupts the attachment.
      wrapBase64(attachment.content)
    );
  }

  parts.push(`--${boundary}--`, '');

  return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
};

/** Splits a base64 string into RFC 2045 compliant 76-character lines. */
export const wrapBase64 = (content: string): string =>
  content.replace(/(.{76})/g, '$1\r\n');

const randomBoundarySuffix = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
};

/**
 * Builds the raw base64url-encoded payload required by Gmail API messages.send.
 */
export const buildGmailRawPayload = (
  message: EmailMessage,
  defaultSender?: { email: string; name?: string }
): { raw: string } => {
  const mime = buildRfc2822MimeMessage(message, defaultSender);
  return {
    raw: toBase64Url(mime)
  };
};
