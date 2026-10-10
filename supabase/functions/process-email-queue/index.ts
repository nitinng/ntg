// Supabase Edge Function: process-email-queue
// Centralized outbound email processor supporting Multi-Provider transport:
// Custom SMTP (with STARTTLS/TLS), Amazon SES, Resend, and Google Workspace (OAuth2)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

export interface EmailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content, without a data: prefix. */
  content: string;
  contentType: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: 'smtp' | 'ses' | 'gmail' | 'resend' | 'mock';
  error?: {
    code: string;
    message: string;
    isTransient: boolean;
    statusCode?: number;
    rawError?: any;
  };
}

export interface EmailProvider {
  readonly name: 'smtp' | 'ses' | 'gmail' | 'resend' | 'mock';
  send(message: EmailMessage): Promise<EmailSendResult>;
  testConnection?(): Promise<{ ok: boolean; latencyMs: number; message: string }>;
}

const toBase64 = (str: string): string => {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
};

const toBase64Url = (str: string): string => {
  return toBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const buildRfc2822MimeMessage = (
  message: EmailMessage,
  defaultSender?: { email: string; name?: string }
): string => {
  const fromEmail = message.from || defaultSender?.email || 'travel@navgurukul.org';
  const fromName = defaultSender?.name || 'Navgurukul Travel Desk';
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const toHeader = Array.isArray(message.to) ? message.to.join(', ') : message.to;
  const ccHeader = message.cc && message.cc.length > 0 ? message.cc.join(', ') : '';
  const bccHeader = message.bcc && message.bcc.length > 0 ? message.bcc.join(', ') : '';

  const encodedSubject = `=?UTF-8?B?${toBase64(message.subject)}?=`;

  const attachments = message.attachments || [];
  const hasAttachments = attachments.length > 0;

  // A boundary must not occur in the body. Random + fixed prefix is what every
  // mail library does; base64 payloads cannot contain the '=_' sequence.
  const boundary = `=_NGTD_${crypto.randomUUID().replace(/-/g, '')}`;

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
    base64Body.replace(/(.{76})/g, '$1\r\n')
  ];

  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      // RFC 2045 caps encoded lines at 76 characters. Some strict MTAs reject
      // or silently truncate longer ones, which corrupts the attachment.
      attachment.content.replace(/(.{76})/g, '$1\r\n')
    );
  }

  parts.push(`--${boundary}--`, '');

  return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
};

// ---------------------------------------------------------------------------
// Ticket delivery: signed link, then the file itself
// ---------------------------------------------------------------------------
//
// The storage buckets became private on 8 Oct (20261008100200), so the stored
// invoice_url -- a getPublicUrl() result persisted back when the bucket was
// public -- now 404s. A link has to be signed, and signing has to happen HERE
// rather than when the mail is queued: a queued row can sit through retries,
// quota holds and an overnight backoff, so a URL minted at queue time could
// easily expire before the mail is ever sent. Signing at send time means the
// clock starts when the mail actually leaves.

/** How long a ticket link stays valid. */
//
// Seven days. The link has to outlive the gap between booking and travel for a
// trip booked a few days out, and travellers routinely open these on a phone
// days later. Shorter (hours) would break the ordinary case of opening the mail
// the next morning; much longer leaves a bearer URL alive in an inbox well past
// the trip, and the in-app download is the permanent route anyway. The
// attachment below means the link is a fallback for most recipients.
const TICKET_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Largest ticket we will attach, before base64.
 *
 * Base64 inflates by ~37%, so 7 MB becomes ~9.6 MB on the wire -- comfortably
 * inside the ~25 MB that Gmail, SES and Resend each accept, with room for the
 * HTML body. Anything larger falls back to the link rather than bouncing.
 */
const MAX_TICKET_ATTACHMENT_BYTES = 7 * 1024 * 1024;

const PUBLIC_MARKER = '/storage/v1/object/public/';
const SIGNED_MARKER = '/storage/v1/object/sign/';

/** Pull {bucket, path} out of a stored storage URL. Mirrors utils/storageUrls.ts. */
const parseStorageUrl = (url: string | null | undefined): { bucket: string; path: string } | null => {
  if (!url) return null;
  const marker = url.includes(PUBLIC_MARKER)
    ? PUBLIC_MARKER
    : url.includes(SIGNED_MARKER) ? SIGNED_MARKER : null;
  if (!marker) return null;

  const tail = url.split(marker)[1];
  if (!tail) return null;

  const clean = tail.split('?')[0];
  const slash = clean.indexOf('/');
  if (slash <= 0) return null;

  const bucket = clean.slice(0, slash);
  const path = decodeURIComponent(clean.slice(slash + 1));
  if (!bucket || !path) return null;

  return { bucket, path };
};

const contentTypeFor = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000; // chunked to avoid blowing the argument limit on apply()
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export interface TicketDelivery {
  url: string | null;
  attachment: EmailAttachment | null;
  /** Why the file is not attached, when it is not. For the queue row's log. */
  note?: string;
}

/**
 * Resolves the ticket for a queued mail: a freshly signed link, and the file
 * itself when it is small enough to attach.
 *
 * Never throws. A ticket that cannot be resolved must not stop the booking
 * confirmation going out -- the mail still carries the booking details, and the
 * traveller can always download from the portal.
 */
const resolveTicketDelivery = async (
  supabase: any,
  ticketId: string | null | undefined
): Promise<TicketDelivery> => {
  if (!ticketId) return { url: null, attachment: null, note: 'no ticket id on the queue row' };

  try {
    const { data: request, error } = await supabase
      .from('travel_requests')
      .select('invoice_url, submission_id')
      .eq('id', ticketId)
      .single();

    if (error || !request?.invoice_url) {
      return { url: null, attachment: null, note: 'no ticket uploaded for this request' };
    }

    const ref = parseStorageUrl(request.invoice_url);
    if (!ref) {
      // An externally hosted link is already usable as-is.
      return { url: request.invoice_url, attachment: null, note: 'ticket is an external link' };
    }

    // The function runs with the service role, so signing bypasses RLS. The
    // recipient list is derived from the ticket, so the link only reaches
    // people the mail was already addressed to.
    const { data: signed, error: signError } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, TICKET_LINK_TTL_SECONDS);

    const url = signError ? null : (signed?.signedUrl ?? null);
    if (!url) return { url: null, attachment: null, note: `could not sign ticket url: ${signError?.message || 'unknown'}` };

    // Now try to attach the file itself, falling back to the link on any problem.
    const { data: blob, error: dlError } = await supabase.storage
      .from(ref.bucket)
      .download(ref.path);

    if (dlError || !blob) {
      return { url, attachment: null, note: `attachment skipped: ${dlError?.message || 'download failed'}` };
    }

    const size = typeof blob.size === 'number' ? blob.size : 0;
    if (size > MAX_TICKET_ATTACHMENT_BYTES) {
      return {
        url,
        attachment: null,
        note: `attachment skipped: ${size} bytes exceeds the ${MAX_TICKET_ATTACHMENT_BYTES} byte limit`
      };
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const baseName = ref.path.split('/').pop() || 'ticket';
    const extension = baseName.includes('.') ? baseName.slice(baseName.lastIndexOf('.')) : '';
    const filename = `Ticket-${request.submission_id || 'travel'}${extension}`;

    return {
      url,
      attachment: {
        filename,
        content: bytesToBase64(bytes),
        contentType: contentTypeFor(baseName)
      }
    };
  } catch (err: any) {
    return { url: null, attachment: null, note: `ticket lookup failed: ${err?.message || err}` };
  }
};

/** Placeholder a template uses to ask for the signed ticket link. */
const TICKET_URL_PLACEHOLDER = '{{ticket_download_url}}';

/**
 * Substitutes the signed link into a rendered body.
 *
 * When there is no ticket the whole anchor is replaced with a plain sentence
 * rather than a dead link to nowhere.
 */
const applyTicketUrl = (html: string, url: string | null): string => {
  if (!html.includes(TICKET_URL_PLACEHOLDER)) return html;
  if (url) return html.split(TICKET_URL_PLACEHOLDER).join(url);
  return html.split(TICKET_URL_PLACEHOLDER).join('#no-ticket');
};

// ---------------------------------------------------------------------------
// 1. Deno-native Edge SMTP Provider (Port 587 STARTTLS / Port 465 SSL)
// ---------------------------------------------------------------------------
class EdgeSmtpProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private host: string;
  private port: number;
  private username?: string;
  private password?: string;
  private senderEmail: string;
  private senderName?: string;
  private replyTo?: string;

  constructor(config: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    senderEmail?: string;
    senderName?: string;
    replyTo?: string;
  }) {
    this.host = config.host;
    this.port = Number(config.port) || 587;
    this.username = config.username;
    this.password = config.password;
    this.senderEmail = config.senderEmail || 'travel@navgurukul.org';
    this.senderName = config.senderName || 'Navgurukul Travel Desk';
    this.replyTo = config.replyTo;
  }

  private async executeSmtpSession(
    onSession: (
      sendCommand: (cmd: string) => Promise<string>,
      sendData: (data: string) => Promise<string>
    ) => Promise<string | undefined>
  ): Promise<{ messageId?: string; latencyMs: number }> {
    const startTime = Date.now();
    // @ts-ignore: Deno.connect
    let conn: any = await Deno.connect({ hostname: this.host, port: this.port });
    let reader = conn.readable.getReader();
    let writer = conn.writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let buffer = '';

    const readReply = async (): Promise<string> => {
      while (true) {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SMTP timeout waiting for response')), 15000)
        );
        const { value, done } = await Promise.race([reader.read(), timeoutPromise]);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\r\n');
        // If there's an incomplete line at the end, keep it in buffer
        if (buffer.endsWith('\r\n')) {
          buffer = '';
        } else {
          buffer = lines.pop() || '';
        }

        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (/^\d{3}\s/.test(line)) {
            return line;
          }
        }
      }
      return '';
    };

    const sendCmd = async (cmd: string): Promise<string> => {
      await writer.write(encoder.encode(cmd + '\r\n'));
      const reply = await readReply();
      return reply;
    };

    try {
      // 1. Initial greeting
      const greeting = await readReply();
      if (!greeting.startsWith('220')) {
        throw new Error(`Invalid SMTP greeting from ${this.host}: ${greeting}`);
      }

      // 2. EHLO
      let ehloReply = await sendCmd('EHLO travel.navgurukul.org');

      // 3. STARTTLS if port 587 or advertised
      if (this.port === 587 || ehloReply.includes('STARTTLS')) {
        const startTlsReply = await sendCmd('STARTTLS');
        if (!startTlsReply.startsWith('220')) {
          throw new Error(`STARTTLS rejected: ${startTlsReply}`);
        }

        // Release reader & writer before upgrading connection
        reader.releaseLock();
        writer.releaseLock();

        // @ts-ignore: Deno.startTls
        conn = await Deno.startTls(conn, { hostname: this.host });
        reader = conn.readable.getReader();
        writer = conn.writable.getWriter();

        // Re-issue EHLO over TLS
        ehloReply = await sendCmd('EHLO travel.navgurukul.org');
      }

      // 4. Authenticate if username is provided
      if (this.username && this.password) {
        const authReply = await sendCmd('AUTH LOGIN');
        if (!authReply.startsWith('334')) {
          throw new Error(`AUTH LOGIN rejected: ${authReply}`);
        }

        const userB64 = toBase64(this.username);
        const userReply = await sendCmd(userB64);
        if (!userReply.startsWith('334')) {
          throw new Error(`SMTP username rejected: ${userReply}`);
        }

        const passB64 = toBase64(this.password);
        const passReply = await sendCmd(passB64);
        if (!passReply.startsWith('235')) {
          throw new Error(`SMTP authentication failed: ${passReply}`);
        }
      }

      // 5. Delegate payload
      const msgId = await onSession(
        sendCmd,
        async (dataStr: string) => {
          await writer.write(encoder.encode(dataStr + '\r\n.\r\n'));
          return await readReply();
        }
      );

      // 6. QUIT
      try {
        await sendCmd('QUIT');
      } catch {
        // Safe to ignore on disconnect
      }

      const latencyMs = Date.now() - startTime;
      return { messageId: msgId, latencyMs };
    } finally {
      try {
        reader.releaseLock();
      } catch {}
      try {
        writer.releaseLock();
      } catch {}
      try {
        conn.close();
      } catch {}
    }
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    if (this.host.includes('mail-manager-smtp')) {
      return {
        ok: false,
        latencyMs: 0,
        message: 'Ingress endpoint warning: AWS Mail Manager (*.mail-manager-smtp.amazonaws.com) does not relay outbound email to external inboxes. Use email-smtp.ap-south-1.amazonaws.com or smtp.gmail.com.'
      };
    }
    if (!this.password && this.host !== 'localhost') {
      return {
        ok: false,
        latencyMs: 0,
        message: `SMTP password / app password is required for ${this.host}. Please enter it in Provider Setup.`
      };
    }

    try {
      const res = await this.executeSmtpSession(async () => undefined);
      return {
        ok: true,
        latencyMs: res.latencyMs,
        message: `SMTP Connected & Authenticated as ${this.username || this.host} (${res.latencyMs}ms)`
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: 0,
        message: err.message || 'SMTP Connection failed'
      };
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.host.includes('mail-manager-smtp')) {
      return {
        success: false,
        provider: 'smtp',
        error: {
          code: 'INGRESS_NON_RELAY',
          message: 'AWS Mail Manager ingress endpoints (*.mail-manager-smtp.amazonaws.com) do not deliver outbound email to external recipients. Please configure Amazon SES Outbound (email-smtp.ap-south-1.amazonaws.com), Gmail SMTP (smtp.gmail.com), or Resend.',
          isTransient: false
        }
      };
    }
    if (!this.password && this.host !== 'localhost') {
      return {
        success: false,
        provider: 'smtp',
        error: {
          code: 'SMTP_AUTH_MISSING',
          message: `SMTP authentication credentials missing for host ${this.host}. Please configure credentials in Provider Setup.`,
          isTransient: false
        }
      };
    }

    try {
      const mime = buildRfc2822MimeMessage(message, {
        email: this.senderEmail,
        name: this.senderName
      });

      const recipients = [
        ...message.to,
        ...(message.cc || []),
        ...(message.bcc || [])
      ].map(e => e.trim()).filter(Boolean);

      const fromAddr = message.from || this.senderEmail;

      const res = await this.executeSmtpSession(async (sendCmd, sendData) => {
        const mailFromReply = await sendCmd(`MAIL FROM:<${fromAddr}>`);
        if (!mailFromReply.startsWith('250')) {
          throw new Error(`MAIL FROM failed: ${mailFromReply}`);
        }

        for (const rcpt of recipients) {
          const rcptReply = await sendCmd(`RCPT TO:<${rcpt}>`);
          if (!rcptReply.startsWith('250')) {
            throw new Error(`RCPT TO <${rcpt}> failed: ${rcptReply}`);
          }
        }

        const dataReply = await sendCmd('DATA');
        if (!dataReply.startsWith('354')) {
          throw new Error(`DATA start rejected: ${dataReply}`);
        }

        const commitReply = await sendData(mime);
        if (!commitReply.startsWith('250')) {
          throw new Error(`DATA end rejected: ${commitReply}`);
        }

        // e.g. "250 OK kmfnilvhsi481hr1btt21j0ehdlfd6tnhevim582"
        const parts = commitReply.split(/\s+/);
        return parts[parts.length - 1] || 'smtp-delivered';
      });

      return {
        success: true,
        messageId: res.messageId || `smtp-${Date.now()}`,
        provider: 'smtp'
      };
    } catch (err: any) {
      const isAuth = err.message?.includes('authentication failed') || err.message?.includes('rejected');
      return {
        success: false,
        provider: 'smtp',
        error: {
          code: isAuth ? 'SMTP_AUTH_ERROR' : 'SMTP_SEND_ERROR',
          message: err.message || 'SMTP delivery failure',
          isTransient: !isAuth
        }
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Resend API Provider
// ---------------------------------------------------------------------------
class EdgeResendProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private apiKey: string;
  private senderEmail: string;
  private senderName?: string;

  constructor(config: { apiKey: string; senderEmail?: string; senderName?: string }) {
    this.apiKey = config.apiKey;
    this.senderEmail = config.senderEmail || 'travel@navgurukul.org';
    this.senderName = config.senderName || 'Navgurukul Travel Desk';
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      const res = await fetch('https://api.resend.com/api_keys', {
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
      const from = this.senderName ? `${this.senderName} <${this.senderEmail}>` : this.senderEmail;
      const response = await fetch('https://api.resend.com/emails', {
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
          reply_to: message.replyTo,
          attachments: message.attachments?.length
            ? message.attachments.map(a => ({
                filename: a.filename,
                content: a.content,
                content_type: a.contentType
              }))
            : undefined
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

// ---------------------------------------------------------------------------
// 3. Google Workspace OAuth2 Provider
// ---------------------------------------------------------------------------
class EdgeGmailProvider implements EmailProvider {
  readonly name = 'gmail' as const;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private senderEmail: string;
  private senderName?: string;
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    senderEmail: string;
    senderName?: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
    this.senderEmail = config.senderEmail;
    this.senderName = config.senderName;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(`Google token refresh failed: ${JSON.stringify(data)} (HTTP ${response.status} ${response.statusText})`);
    }

    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    return this.cachedAccessToken!;
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      const token = await this.getAccessToken();
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        message: `Google OAuth2 token refreshed successfully (${latencyMs}ms)`
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: 0,
        message: err.message || 'Google OAuth token refresh failed'
      };
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const accessToken = await this.getAccessToken();
      const mime = buildRfc2822MimeMessage(message, {
        email: this.senderEmail,
        name: this.senderName
      });
      const raw = toBase64Url(mime);

      const sendEndpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
      const response = await fetch(sendEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const isTransient = response.status === 429 || response.status >= 500;
        return {
          success: false,
          provider: 'gmail',
          error: {
            code: `HTTP_${response.status}`,
            message: data.error?.message || response.statusText || 'Gmail API error',
            isTransient,
            statusCode: response.status,
            rawError: data
          }
        };
      }

      return {
        success: true,
        messageId: data.id || 'sent',
        provider: 'gmail'
      };
    } catch (err: any) {
      const isAuth = err.message?.includes('invalid_grant') || err.message?.includes('token refresh failed');
      return {
        success: false,
        provider: 'gmail',
        error: {
          code: isAuth ? 'GMAIL_AUTH_EXPIRED' : 'GMAIL_EXCEPTION',
          message: err.message || 'Exception during Gmail delivery',
          isTransient: !isAuth
        }
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Google Apps Script Web App Provider (100% Reliable Workspace Sender)
// ---------------------------------------------------------------------------
class EdgeAppsScriptProvider implements EmailProvider {
  readonly name = 'apps_script' as const;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const start = Date.now();
    try {
      if (!this.url) {
        return { ok: false, latencyMs: 0, message: 'APPS_SCRIPT_URL not configured in Supabase secrets' };
      }
      const parsed = new URL(this.url);
      const res = await fetch(this.url, { method: 'GET', redirect: 'follow' });
      const latencyMs = Date.now() - start;
      const text = await res.text();
      const isGoogleLogin = text.includes('accounts.google.com') || text.includes('ServiceLogin');
      return {
        ok: res.ok && !isGoogleLogin,
        latencyMs,
        message: isGoogleLogin 
          ? `Apps Script URL (${parsed.hostname}${parsed.pathname}) requires authentication (Web App permission must be set to 'Anyone')`
          : `Google Apps Script web service online (${latencyMs}ms): ${text.substring(0, 100)}`
      };
    } catch (e: any) {
      return { ok: false, latencyMs: 0, message: e.message || 'Google Apps Script ping failed' };
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      if (!this.url) {
        return {
          success: false,
          provider: 'apps_script',
          error: {
            code: 'CONFIG_MISSING',
            message: 'APPS_SCRIPT_URL not configured',
            isTransient: false
          }
        };
      }
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify({
          to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
          cc: message.cc?.join(', '),
          bcc: message.bcc?.join(', '),
          subject: message.subject,
          htmlBody: message.html || message.text,
          body: message.text || message.html
        })
      });
      const resText = await response.text();
      let resJson: any = {};
      try { resJson = JSON.parse(resText); } catch {}
      if (!response.ok || resJson.status === 'error' || resJson.success === false) {
        return {
          success: false,
          provider: 'apps_script',
          error: {
            code: 'APPS_SCRIPT_ERROR',
            message: resJson.error || resJson.message || `HTTP ${response.status}: ${resText.substring(0, 100)}`,
            isTransient: false
          }
        };
      }
      return {
        success: true,
        messageId: resJson.messageId || `apps-script-${Date.now()}`,
        provider: 'apps_script'
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'apps_script',
        error: {
          code: 'APPS_SCRIPT_EXCEPTION',
          message: err.message,
          isTransient: true
        }
      };
    }
  }
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
// This used to be Access-Control-Allow-Origin: '*', which let any website on the
// internet call this function from a visitor's browser. Echo back only origins
// we recognise. ALLOWED_ORIGINS is a comma-separated list; it falls back to the
// deployed portal so a missing variable fails closed rather than open.
const DEFAULT_ALLOWED_ORIGINS = ['https://ng-travel-desk.vercel.app'];

const allowedOrigins = (): string[] => {
  // @ts-ignore: Deno.env
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',')
    .map((o: string) => o.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
};

const buildCorsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin'
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------
// This function runs with the service role key, so until now anyone who could
// reach the URL acted with full database privileges. Supabase's default
// verify_jwt is not a gate here: the anon key is itself a valid JWT and is
// published in the client bundle, so "has a JWT" means "has read our
// JavaScript". Resolve a real end user instead, and separately recognise a
// machine caller holding a shared secret.
const STAFF_ROLES = ['Admin', 'PNC', 'PNC Admin', 'Finance'];

export interface CallerIdentity {
  /** A machine caller presenting QUEUE_WORKER_SECRET: cron jobs, provider webhooks. */
  viaSecret: boolean;
  /** The signed-in user, when the request carried a user access token. */
  userId: string | null;
  role: string | null;
  /** May supply provider credentials, ping providers, and receive webhooks. */
  isPrivileged: boolean;
}

const identifyCaller = async (req: Request, supabase: any): Promise<CallerIdentity> => {
  // @ts-ignore: Deno.env
  const workerSecret = Deno.env.get('QUEUE_WORKER_SECRET') || '';
  const presented = req.headers.get('x-worker-secret') || '';
  if (workerSecret && presented && presented === workerSecret) {
    return { viaSecret: true, userId: null, role: null, isPrivileged: true };
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return { viaSecret: false, userId: null, role: null, isPrivileged: false };

  // getUser() resolves a user access token. An anon or service key is a valid
  // JWT but carries no user, so this returns null for both -- which is exactly
  // the distinction we need.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { viaSecret: false, userId: null, role: null, isPrivileged: false };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  const role = profile?.role ?? null;
  return {
    viaSecret: false,
    userId: data.user.id,
    role,
    isPrivileged: !!role && STAFF_ROLES.includes(role)
  };
};

// ---------------------------------------------------------------------------
// 5. Central Edge Function Handler
// ---------------------------------------------------------------------------
// @ts-ignore: Deno global

// =============================================================================
// SLOT ROUTER — mirrored from utils/email/smtpSlotRouter.ts
// -----------------------------------------------------------------------------
// This worker is deliberately self-contained (supabase deploy only ships the
// functions directory), so the dual-SMTP routing rules are duplicated here.
// Keep both copies in step; utils/email/smtpSlotRouter.ts carries the tests.
// =============================================================================

type SmtpSlotName = 'smtp' | 'smtp2';

interface FailureStreak {
  slot: SmtpSlotName;
  count: number;
}

const otherSlot = (slot: SmtpSlotName): SmtpSlotName => (slot === 'smtp' ? 'smtp2' : 'smtp');

const pickSlot = (input: {
  activeSlot: SmtpSlotName;
  usage: Record<SmtpSlotName, number>;
  perAccountQuota: number;
  configured: Record<SmtpSlotName, boolean>;
}): { slot: SmtpSlotName | null; reason: string } => {
  const { activeSlot, usage, perAccountQuota, configured } = input;
  const backupSlot = otherSlot(activeSlot);
  const available = (slot: SmtpSlotName) =>
    configured[slot] && (usage[slot] || 0) < perAccountQuota;

  if (available(activeSlot)) return { slot: activeSlot, reason: 'active' };
  if (available(backupSlot)) {
    return {
      slot: backupSlot,
      reason: configured[activeSlot] ? 'active_at_quota' : 'active_unconfigured'
    };
  }
  return { slot: null, reason: 'all_at_quota' };
};

const nextStreakState = (input: {
  streak: FailureStreak | null | undefined;
  slot: SmtpSlotName;
  failed: boolean;
  isTransient: boolean;
  promoteAfter: number;
}): { streak: FailureStreak; promoteTo: SmtpSlotName | null } => {
  const { streak, slot, failed, isTransient, promoteAfter } = input;

  if (!failed) return { streak: { slot, count: 0 }, promoteTo: null };

  if (isTransient) {
    const count = streak?.slot === slot ? streak.count : 0;
    return { streak: { slot, count }, promoteTo: null };
  }

  const count = (streak?.slot === slot ? streak.count : 0) + 1;
  return { streak: { slot, count }, promoteTo: count >= promoteAfter ? otherSlot(slot) : null };
};

const IST_OFFSET_MINUTES = 330;

const shiftIstIso = (now: Date, days: number): string => {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return new Date(shifted.getTime() - IST_OFFSET_MINUTES * 60_000).toISOString();
};

const istDayStartIso = (now: Date = new Date()): string => shiftIstIso(now, 0);
const istNextDayStartIso = (now: Date = new Date()): string => shiftIstIso(now, 1);

// ===== MIRRORED REPORT BUILDER (start) =====
// Copied verbatim from utils/report/pdfBuilder.ts and utils/desk/digest.ts,
// minus their imports and export keywords. This function is deployed as a
// single self-contained file -- tsconfig.json excludes supabase/functions from
// the app build -- so shared code is mirrored here the way the SLOT ROUTER
// block above is.
//
// DO NOT EDIT THIS BLOCK BY HAND. Change the source files and re-mirror;
// tests/mirroredReportBuilder.test.ts fails while the two differ.

/**
 * A small, dependency-free PDF writer.
 *
 * The desk digest has to arrive in Slack as a document somebody can open, read
 * and forward — not as a wall of text in a message. That means producing a real
 * PDF from two places that cannot share a bundler: the browser (an admin
 * downloading today's report) and the Deno queue worker (the scheduled send).
 *
 * Pulling a PDF library into both was the obvious option and the wrong one: the
 * worker runs on a cold start with no package manager, and a CDN import is one
 * more thing that can be down at 7pm. The report is text in tables, so the
 * subset of PDF needed to express it is small enough to write out directly.
 *
 * What this supports, deliberately and no more: Helvetica headings, Courier
 * tables (fixed width, so columns line up without measuring glyphs), automatic
 * pagination, and page footers. Everything is WinAnsi; anything outside it is
 * transliterated rather than silently mangled, because a report with a broken
 * glyph reads as a broken report.
 *
 * MIRRORED into supabase/functions/process-email-queue/index.ts — see the PDF
 * BUILDER block there. Any change here must be copied over.
 */

interface PdfTable {
  columns: Array<{ header: string; width: number }>;
  rows: string[][];
  /** Shown in place of the table when there are no rows. */
  emptyText?: string;
}

interface PdfSection {
  heading: string;
  /** Free text under the heading, before any table. */
  paragraphs?: string[];
  table?: PdfTable;
}

interface PdfDocument {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  /** Printed at the foot of every page, with the page number. */
  footer?: string;
}

// US Letter at 72dpi, which every reader and printer handles without scaling.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const BODY_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FONT_HELVETICA = 'F1';
const FONT_HELVETICA_BOLD = 'F2';
const FONT_COURIER = 'F3';

/** Courier is exactly 0.6em wide, which is what lets columns align by counting characters. */
const COURIER_RATIO = 0.6;
const BODY_SIZE = 9;
const CHARS_PER_LINE = Math.floor(BODY_WIDTH / (BODY_SIZE * COURIER_RATIO));

/**
 * The widest a table row may be before it runs past the right margin.
 *
 * Exported because a table's columns are chosen by the caller, and a caller
 * that overruns this produces a report with text falling off the page —
 * `tests/deskDigest.test.ts` checks the digest's tables against it.
 */
const MAX_TABLE_CHARS = CHARS_PER_LINE;

/**
 * Reduces text to WinAnsi.
 *
 * The digest carries status names, emails and place names, plus whatever an
 * employee typed into a purpose field. Rather than emitting bytes the font
 * cannot render, the handful of characters that actually show up are mapped to
 * their ASCII equivalents and the rest becomes '?'.
 */
const toWinAnsi = (value: string): string => {
  const replacements: Record<string, string> = {
    '—': '-', '–': '-', '‑': '-', '→': '->', '←': '<-',
    '“': '"', '”': '"', '‘': "'", '’': "'", '•': '*', '·': '-',
    '₹': 'INR ', '×': 'x', '…': '...', ' ': ' '
  };

  return Array.from(value ?? '')
    .map(char => {
      if (replacements[char] !== undefined) return replacements[char];
      const code = char.codePointAt(0) ?? 63;
      if (code === 9) return '    ';
      if (code < 32) return ' ';
      if (code <= 126) return char;
      return '?';
    })
    .join('');
};

/** Escapes the three characters that mean something inside a PDF string literal. */
const pdfString = (value: string): string =>
  toWinAnsi(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Pads or truncates to an exact character count, so Courier columns line up. */
const fitCell = (value: string, width: number): string => {
  const text = toWinAnsi(value ?? '');
  if (width <= 0) return '';
  if (text.length === width) return text;
  if (text.length < width) return text + ' '.repeat(width - text.length);
  return width <= 1 ? text.slice(0, width) : text.slice(0, width - 1) + '>';
};

/** Greedy word wrap at a character count. Long words are broken rather than overflowing. */
const wrapText = (value: string, width: number): string[] => {
  const words = toWinAnsi(value ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }

    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }

  if (current) lines.push(current);
  return lines;
};

interface TextOp {
  font: string;
  size: number;
  text: string;
  /** Points below the previous line. */
  gap: number;
}

/** Lays the document out into pages of positioned text. */
const layout = (doc: PdfDocument): TextOp[][] => {
  const pages: TextOp[][] = [];
  let page: TextOp[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  const bottomLimit = MARGIN + 24; // room for the footer

  const push = (op: TextOp) => {
    if (y - op.gap < bottomLimit) {
      pages.push(page);
      page = [];
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= op.gap;
    page.push({ ...op, gap: y });
  };

  push({ font: FONT_HELVETICA_BOLD, size: 16, text: doc.title, gap: 20 });
  if (doc.subtitle) {
    push({ font: FONT_HELVETICA, size: 10, text: doc.subtitle, gap: 16 });
  }

  for (const section of doc.sections) {
    push({ font: FONT_HELVETICA_BOLD, size: 11, text: section.heading, gap: 26 });

    for (const paragraph of section.paragraphs || []) {
      for (const line of wrapText(paragraph, CHARS_PER_LINE)) {
        push({ font: FONT_COURIER, size: BODY_SIZE, text: line, gap: 12 });
      }
    }

    if (section.table) {
      const { columns, rows, emptyText } = section.table;

      if (rows.length === 0) {
        push({
          font: FONT_COURIER,
          size: BODY_SIZE,
          text: emptyText || 'None.',
          gap: 14
        });
        continue;
      }

      const header = columns.map(c => fitCell(c.header.toUpperCase(), c.width)).join(' ');
      push({ font: FONT_COURIER, size: BODY_SIZE, text: header, gap: 14 });
      push({
        font: FONT_COURIER,
        size: BODY_SIZE,
        text: columns.map(c => '-'.repeat(c.width)).join(' '),
        gap: 11
      });

      for (const row of rows) {
        const line = columns.map((c, i) => fitCell(row[i] ?? '', c.width)).join(' ');
        push({ font: FONT_COURIER, size: BODY_SIZE, text: line, gap: 11 });
      }
    }
  }

  pages.push(page);
  return pages;
};

const contentStream = (ops: TextOp[], footer: string, pageNumber: number, pageCount: number): string => {
  const parts = ops.map(
    op => `BT /${op.font} ${op.size} Tf ${MARGIN} ${op.gap.toFixed(2)} Td (${pdfString(op.text)}) Tj ET`
  );

  const footerText = `${footer ? `${footer}  ` : ''}Page ${pageNumber} of ${pageCount}`;
  parts.push(
    `BT /${FONT_HELVETICA} 8 Tf ${MARGIN} ${MARGIN - 12} Td (${pdfString(footerText)}) Tj ET`
  );

  return parts.join('\n');
};

/**
 * Renders the document and returns the raw PDF as a latin1 string.
 *
 * Offsets in the cross-reference table are byte offsets, and every byte written
 * here is latin1, so string length and byte length are the same number — which
 * is the only reason this can be assembled as a string at all.
 */
const buildPdfRaw = (doc: PdfDocument): string => {
  const pages = layout(doc);
  const pageCount = pages.length;

  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length; // 1-based object number
  };

  // 1 catalog, 2 page tree, 3-5 fonts: fixed so the page objects can reference them.
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('PAGES_PLACEHOLDER');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  const pageObjectNumbers: number[] = [];

  pages.forEach((ops, index) => {
    const stream = contentStream(ops, doc.footer || '', index + 1, pageCount);
    const contentNumber = addObject(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
    const pageNumber = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /${FONT_HELVETICA} 3 0 R /${FONT_HELVETICA_BOLD} 4 0 R /${FONT_COURIER} 5 0 R >> >> ` +
        `/Contents ${contentNumber} 0 R >>`
    );
    pageObjectNumbers.push(pageNumber);
  });

  objects[1] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map(n => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
};

/** Base64 of the rendered PDF, which is the form an email attachment takes. */
const buildPdfBase64 = (doc: PdfDocument): string => {
  const raw = buildPdfRaw(doc);

  if (typeof btoa === 'function') {
    return btoa(raw);
  }

  // Node (tests, and any server-side render).
  return Buffer.from(raw, 'latin1').toString('base64');
};

/**
 * The desk digest: what the travel desk did today.
 *
 * The data is assembled by `public.build_desk_digest()` — one query pass over
 * requests, ownership and status history — and this module turns it into the
 * report that goes to the notifications channel as a PDF attachment.
 *
 * The shape below is the contract with that function. The Slack message itself
 * is built in SQL, next to the data, so there is exactly one place that writes
 * it; this file owns only the document.
 */


interface DigestTotals {
  raised: number;
  booked: number;
  closed: number;
  cancelled: number;
  open: number;
  assigned: number;
  unassigned: number;
  claimed: number;
  moved: number;
  stalled: number;
  oldestOpenHours: number;
}

interface DigestRequestRow {
  ticket: string;
  status: string;
  requester: string;
  trip: string;
  travelDate?: string | null;
  priority?: string | null;
  owner?: string | null;
  ageHours?: number | null;
}

interface DigestOwnerRow {
  owner: string;
  assigned: number;
  booked: number;
  open: number;
}

interface DigestMovementRow {
  ticket: string;
  fromStatus?: string | null;
  toStatus: string;
  at: string;
  actor?: string | null;
}

interface DeskDigest {
  generatedAt: string;
  windowLabel: string;
  windowFrom: string;
  windowTo: string;
  totals: DigestTotals;
  byStatus: Array<{ status: string; count: number }>;
  byOwner: DigestOwnerRow[];
  raisedList: DigestRequestRow[];
  unassignedList: DigestRequestRow[];
  stalledList: DigestRequestRow[];
  movementList: DigestMovementRow[];
}

/** "3d 4h" — short enough for a table column, exact enough to act on. */
const formatAge = (hours?: number | null): string => {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const whole = Math.max(0, Math.round(hours));
  if (whole < 24) return `${whole}h`;
  const days = Math.floor(whole / 24);
  const rest = whole % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
};

const shortTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  // IST, because every reader of this report is on it.
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const summaryLine = (totals: DigestTotals): string =>
  [
    `raised=${totals.raised}`,
    `booked=${totals.booked}`,
    `closed=${totals.closed}`,
    `cancelled=${totals.cancelled}`,
    `open=${totals.open}`,
    `assigned=${totals.assigned}`,
    `unassigned=${totals.unassigned}`,
    `claimed=${totals.claimed}`,
    `moved=${totals.moved}`,
    `stalled=${totals.stalled}`
  ].join('  ');

/**
 * Turns a digest into the printable report.
 *
 * Ordered by what someone acting on it needs first: the numbers, then the work
 * nobody owns, then the work that has stopped moving, then the detail.
 */
const digestToPdfDocument = (digest: DeskDigest): PdfDocument => {
  const { totals } = digest;

  return {
    title: 'Travel Desk — Daily Report',
    subtitle: `${digest.windowLabel} (IST) · generated ${shortTime(digest.generatedAt)}`,
    footer: 'Navgurukul Travel Desk',
    sections: [
      {
        heading: 'Summary',
        paragraphs: [
          summaryLine(totals),
          `Oldest open request: ${formatAge(totals.oldestOpenHours)}.`,
          digest.byStatus.length
            ? `Open by status — ${digest.byStatus.map(s => `${s.status}=${s.count}`).join('  ')}`
            : 'No open requests.'
        ]
      },
      {
        heading: `Unassigned — nobody owns these (${digest.unassignedList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'Status', width: 18 },
            { header: 'Requester', width: 24 },
            { header: 'Trip', width: 24 },
            { header: 'Age', width: 6 }
          ],
          rows: digest.unassignedList.map(r => [
            r.ticket,
            r.status,
            r.requester,
            r.trip,
            formatAge(r.ageHours)
          ]),
          emptyText: 'Every open request has an owner.'
        }
      },
      {
        heading: `Stalled — no movement (${digest.stalledList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'Status', width: 18 },
            { header: 'Owner', width: 20 },
            { header: 'Requester', width: 20 },
            { header: 'Idle', width: 7 }
          ],
          rows: digest.stalledList.map(r => [
            r.ticket,
            r.status,
            r.owner || 'Unassigned',
            r.requester,
            formatAge(r.ageHours)
          ]),
          emptyText: 'Everything open has moved recently.'
        }
      },
      {
        heading: `Desk load by owner (${digest.byOwner.length})`,
        table: {
          columns: [
            { header: 'Owner', width: 30 },
            { header: 'Holding', width: 9 },
            { header: 'Open', width: 7 },
            { header: 'Booked', width: 8 }
          ],
          rows: digest.byOwner.map(o => [
            o.owner,
            String(o.assigned),
            String(o.open),
            String(o.booked)
          ]),
          emptyText: 'Nothing is assigned.'
        }
      },
      {
        heading: `Raised in this window (${digest.raisedList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'Requester', width: 20 },
            { header: 'Trip', width: 22 },
            { header: 'Travel', width: 9 },
            { header: 'Pri', width: 6 },
            { header: 'Owner', width: 14 }
          ],
          rows: digest.raisedList.map(r => [
            r.ticket,
            r.requester,
            r.trip,
            r.travelDate || '—',
            r.priority || '—',
            r.owner || 'Unassigned'
          ]),
          emptyText: 'No new requests in this window.'
        }
      },
      {
        heading: `Movement in this window (${digest.movementList.length})`,
        table: {
          columns: [
            { header: 'Ticket', width: 17 },
            { header: 'From', width: 18 },
            { header: 'To', width: 18 },
            { header: 'When', width: 14 },
            { header: 'By', width: 14 }
          ],
          rows: digest.movementList.map(m => [
            m.ticket,
            m.fromStatus || '—',
            m.toStatus,
            shortTime(m.at),
            m.actor || '—'
          ]),
          emptyText: 'Nothing moved in this window.'
        }
      }
    ]
  };
};

/** The attachment the notifications channel receives. */
const digestToPdfBase64 = (digest: DeskDigest): string =>
  buildPdfBase64(digestToPdfDocument(digest));

/** `travel-desk-report-2026-10-10.pdf` */
const digestFileName = (digest: DeskDigest): string => {
  const day = (digest.windowTo || digest.generatedAt || '').slice(0, 10) || 'report';
  return `travel-desk-report-${day}.pdf`;
};

// ===== MIRRORED REPORT BUILDER (end) =====

// =============================================================================
// SOS REPORTER
// =============================================================================
// This worker is the least observed part of the system: it runs with no user
// watching, and its failures -- a demoted SMTP account, a spent quota, a crash
// mid-batch -- used to end at a console line in the edge logs. Every one of
// them now goes through raise_sos_alert(), which records it and pushes it to
// the automation Slack channel.
//
// Reporting is best-effort and never throws: the worker's job is to deliver
// mail, and a failure to report a failure must not stop it. See
// supabase/migrations/20261010090000_sos_alert_system.sql for the rules the
// RPC applies, and utils/sos/catalog.ts for what each code means.

type SosSeverityName = 'critical' | 'high' | 'warning' | 'info';

interface SosReport {
  code: string;
  category: string;
  severity: SosSeverityName;
  title: string;
  message: string;
  context?: Record<string, any>;
  /** Extra dedupe identity: an account slot, a queue id, a template key. */
  dedupeKey?: string;
}

const createSosReporter = (supabase: any) => {
  return async (report: SosReport): Promise<void> => {
    try {
      console.warn(`[SOS ${report.severity}] ${report.code}: ${report.message}`);
      const { error } = await supabase.rpc('raise_sos_alert', {
        p_code: report.code,
        p_category: report.category,
        p_severity: report.severity,
        p_title: report.title,
        p_message: report.message.slice(0, 2000),
        p_context: report.context || {},
        p_source: 'worker',
        p_dedupe_key: report.dedupeKey || null
      });
      if (error) {
        // Deliberately terminal. Raising an alert about a failed alert is how
        // an alerting system takes itself down.
        console.error('[SOS] could not record alert:', error.message);
      }
    } catch (err: any) {
      console.error('[SOS] could not record alert:', err?.message || err);
    }
  };
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // @ts-ignore: Deno.env
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    // @ts-ignore: Deno.env
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const sos = createSosReporter(supabase);
    const url = new URL(req.url);
    const reqBody = await req.json().catch(() => ({}));

    // -------------------------------------------------------------------------
    // Authorization gate
    // -------------------------------------------------------------------------
    // Draining the queue is open to any signed-in user: an employee's own
    // lifecycle mail is queued from their browser and triggerWorker() nudges
    // this function straight afterwards, so requiring staff here would leave
    // their mail sitting unsent. The queue's contents are constrained
    // separately, by the recipient guard on email_queue.
    //
    // Everything else -- supplying provider credentials, pinging a provider,
    // accepting delivery webhooks -- is privileged and checked below.
    const caller = await identifyCaller(req, supabase);

    if (!caller.viaSecret && !caller.userId) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'This endpoint requires a signed-in user or a worker secret.'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load active provider and settings dynamically from email_routing_settings
    let activeProviderType = 'smtp';
    let activeSmtpSlot: SmtpSlotName = 'smtp';
    let providerConfig: any = {};
    let quotaSettings: any = {};
    let failureStreak: FailureStreak = { slot: 'smtp', count: 0 };

    try {
      const { data: routingRows } = await supabase
        .from('email_routing_settings')
        .select('key, value')
        .in('key', ['active_email_provider', 'active_smtp_slot', 'provider_config', 'quota_settings', 'smtp_failure_streak']);

      if (routingRows) {
        for (const row of routingRows) {
          if (row.key === 'active_email_provider' && row.value) {
            const rawVal = typeof row.value === 'string' ? row.value.replace(/"/g, '') : String(row.value);
            activeProviderType = rawVal.trim().toLowerCase();
          } else if (row.key === 'active_smtp_slot' && row.value) {
            const rawSlot = typeof row.value === 'string' ? row.value.replace(/"/g, '') : String(row.value);
            activeSmtpSlot = rawSlot.trim().toLowerCase() === 'smtp2' ? 'smtp2' : 'smtp';
          } else if (row.key === 'provider_config' && row.value) {
            providerConfig = row.value;
          } else if (row.key === 'quota_settings' && row.value) {
            quotaSettings = row.value;
          } else if (row.key === 'smtp_failure_streak' && row.value) {
            const raw = row.value as any;
            failureStreak = {
              slot: raw?.slot === 'smtp2' ? 'smtp2' : 'smtp',
              count: Number(raw?.count) || 0
            };
          }
        }
      }
    } catch (err: any) {
      console.warn('Could not query dynamic email routing settings:', err);
      // The worker carries on with defaults, which may point mail at the wrong
      // transport entirely -- exactly the kind of thing that used to be
      // invisible until someone noticed the mail had stopped.
      await sos({
        code: 'EMAIL_ROUTING_CONFIG_FALLBACK',
        category: 'email_delivery',
        severity: 'warning',
        title: 'Email routing settings unreadable — defaults in use',
        message: `The worker could not read email_routing_settings and is running on defaults: ${err?.message || err}`,
        context: { error: String(err?.message || err) },
        dedupeKey: 'worker-settings'
      });
    }

    // Override from request if explicitly testing a specific provider.
    //
    // Both of these are privileged. An unprivileged caller supplying
    // providerConfig could point outbound mail at an SMTP server they control
    // and receive the full contents of the pending queue -- traveller names,
    // itineraries, emergency contacts -- and could reach arbitrary hosts and
    // ports from Supabase's network. Ignore anything they send and fall back to
    // the stored configuration.
    const requestedOverride = caller.isPrivileged
      ? (reqBody?.provider || url.searchParams.get('provider'))
      : null;
    const requestProviderConfig = caller.isPrivileged ? reqBody?.providerConfig : undefined;
    const requestSmtpSlot = caller.isPrivileged ? reqBody?.activeSmtpSlot : undefined;

    const rawReqProvider = requestedOverride || activeProviderType;
    const requestedProvider = String(rawReqProvider).replace(/['"]/g, '').trim().toLowerCase();

    // Build Provider Instance
    const buildProvider = (type: string, customConfig?: any, slotOverride?: SmtpSlotName): EmailProvider => {
      const cleanType = String(type || '').replace(/['"]/g, '').trim().toLowerCase();
      let cfg = customConfig?.[cleanType] || customConfig || providerConfig?.[cleanType] || {};

      if (cleanType === 'smtp') {
        // slotOverride wins so the queue worker can address a specific account
        // (for per-email failover) regardless of which one is currently active.
        const slot: SmtpSlotName = slotOverride
          || ((requestSmtpSlot || activeSmtpSlot) === 'smtp2' ? 'smtp2' : 'smtp');
        cfg = customConfig?.[slot] || (customConfig?.username ? customConfig : undefined) || providerConfig?.[slot] || providerConfig?.smtp || {};
      } else if (cleanType === 'smtp2') {
        cfg = customConfig?.smtp2 || (customConfig?.username ? customConfig : undefined) || providerConfig?.smtp2 || {};
      }

      // 1. Google Apps Script Web App Provider
      if (cleanType === 'apps_script') {
        // @ts-ignore: Deno.env
        const scriptUrl = cfg.url || Deno.env.get('APPS_SCRIPT_URL') || '';
        return new EdgeAppsScriptProvider(scriptUrl);
      }

      // 2. SMTP Providers (Custom SMTP, AWS SES SMTP, Gmail SMTP)
      if (cleanType === 'smtp' || cleanType === 'smtp2' || cleanType === 'ses' || cleanType === 'gmail_smtp') {
        const isGmailSmtp = cleanType === 'gmail_smtp' || cfg.host === 'smtp.gmail.com';
        // Credentials come from the environment or the saved provider config.
        // Never bake them into source — this file lives in a public repo.
        // @ts-ignore: Deno.env
        const sesSmtpUser = Deno.env.get('SES_SMTP_USERNAME') || '';
        // @ts-ignore: Deno.env
        const sesSmtpPass = Deno.env.get('SES_SMTP_PASSWORD') || '';
        // @ts-ignore: Deno.env
        const gmailUser = Deno.env.get('GMAIL_USER') || '';
        // @ts-ignore: Deno.env
        const gmailAppPass = Deno.env.get('GMAIL_APP_PASSWORD') || '';

        let host = isGmailSmtp ? 'smtp.gmail.com' : (cfg.host || cfg.smtpEndpoint || 'smtp.gmail.com');
        let port = Number(cfg.port) || 587;
        if (typeof host === 'string' && host.includes(':')) {
          const [h, p] = host.split(':');
          host = h;
          if (p && !cfg.port) port = Number(p);
        }

        const username = cfg.username || (isGmailSmtp ? gmailUser : (cfg.accessKeyId || sesSmtpUser));
        const password = cfg.password || (isGmailSmtp ? gmailAppPass : (cfg.secretAccessKey || sesSmtpPass));
        const senderEmail = (cfg.senderEmail && String(cfg.senderEmail).trim()) || cfg.username || (isGmailSmtp ? gmailUser : 'travel@navgurukul.org');
        const senderName = cfg.senderName || 'Navgurukul Travel Desk';
        const replyTo = (cfg.replyTo && String(cfg.replyTo).trim()) || senderEmail;

        return new EdgeSmtpProvider({
          host,
          port,
          username,
          password,
          senderEmail,
          senderName,
          replyTo
        });
      }

      if (cleanType === 'resend') {
        // @ts-ignore: Deno.env
        const apiKey = cfg.apiKey || Deno.env.get('RESEND_API_KEY') || '';
        const senderEmail = cfg.senderEmail || 'travel@navgurukul.org';
        const senderName = cfg.senderName || 'Navgurukul Travel Desk';
        return new EdgeResendProvider({ apiKey, senderEmail, senderName });
      }

      if (cleanType === 'gmail') {
        // @ts-ignore: Deno.env
        const clientId = cfg.clientId || Deno.env.get('GMAIL_CLIENT_ID') || '';
        // @ts-ignore: Deno.env
        const clientSecret = cfg.clientSecret || Deno.env.get('GMAIL_CLIENT_SECRET') || '';
        // @ts-ignore: Deno.env
        const refreshToken = cfg.refreshToken || Deno.env.get('GMAIL_REFRESH_TOKEN') || '';
        // @ts-ignore: Deno.env
        const senderEmail = cfg.senderEmail || Deno.env.get('GMAIL_SENDER_EMAIL') || 'travel@navgurukul.org';
        // @ts-ignore: Deno.env
        const senderName = cfg.senderName || Deno.env.get('GMAIL_SENDER_NAME') || 'Navgurukul Travel Desk';

        return new EdgeGmailProvider({
          clientId,
          clientSecret,
          refreshToken,
          senderEmail,
          senderName
        });
      }

      // Default fallback: No dummy silent black hole!
      return {
        name: 'mock',
        async testConnection() {
          return {
            ok: false,
            latencyMs: 0,
            message: `Outbound email provider '${cleanType || 'none'}' is not configured. Please select and configure a provider in Email Center -> Provider Setup.`
          };
        },
        async send() {
          return {
            success: false,
            provider: 'mock',
            error: {
              code: 'PROVIDER_CONFIG_REQUIRED',
              message: `Outbound email transport '${cleanType || 'none'}' has no valid credentials configured. Please configure your email provider in Email Center -> Provider Setup.`,
              isTransient: false
            }
          };
        }
      };
    };

    let provider = buildProvider(requestedProvider, requestProviderConfig);

    // -------------------------------------------------------------------------
    // A. Health / Ping Connection Test Endpoint
    // -------------------------------------------------------------------------
    if (url.searchParams.get('ping') === 'true' || reqBody?.action === 'ping' || url.searchParams.get('testToken') === 'true') {
      // Connection tests dial an arbitrary host and port and report the result,
      // which is a server-side request forgery primitive in the wrong hands.
      if (!caller.isPrivileged) {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'Connection tests are restricted to Admin, PNC and Finance.'
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (typeof provider.testConnection === 'function') {
        const pingResult = await provider.testConnection();
        return new Response(JSON.stringify({
          success: pingResult.ok,
          provider: provider.name,
          ...pingResult
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true, provider: provider.name, message: 'Provider ready' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // -------------------------------------------------------------------------
    // B. Delivery Status Webhook Endpoint (Idempotent)
    // -------------------------------------------------------------------------
    if (url.pathname.endsWith('/webhook') || reqBody?.action === 'webhook') {
      // Delivery notifications rewrite queue rows by provider_message_id and
      // carry no proof of origin, so anyone able to reach this branch could mark
      // mail Delivered, Bounced or Failed at will. Require the shared secret
      // that the provider's webhook is configured with. If QUEUE_WORKER_SECRET
      // is unset the branch is closed entirely rather than left open.
      if (!caller.viaSecret) {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'Delivery webhooks must present the worker secret.'
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { messageId, eventType, timestamp, details } = reqBody;
      if (messageId) {
        let newStatus: string | null = null;
        const updates: any = {
          processed_at: new Date().toISOString()
        };

        if (eventType === 'delivered') {
          newStatus = 'Delivered';
          updates.delivered_at = timestamp || new Date().toISOString();
        } else if (eventType === 'bounced') {
          newStatus = 'Bounced';
          updates.bounced_at = timestamp || new Date().toISOString();
        } else if (eventType === 'complaint') {
          newStatus = 'Failed';
          updates.last_error = `Complaint received: ${JSON.stringify(details || {})}`;
        }

        if (newStatus) {
          updates.status = newStatus;
          updates.delivery_details = details || { event: eventType, receivedAt: new Date().toISOString() };

          await supabase
            .from('email_queue')
            .update(updates)
            .eq('provider_message_id', messageId);
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // -------------------------------------------------------------------------
    // C. Queue Batch Processing
    // -------------------------------------------------------------------------
    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // -------------------------------------------------------------------------
    // Dual SMTP account routing
    // -------------------------------------------------------------------------
    // Only applies when the active transport is custom SMTP; SES/Gmail/Resend
    // keep the single-provider path below.
    const perAccountQuota = Number(quotaSettings?.perAccountQuota) || 2000;
    const failoverAfterFailures = Number(quotaSettings?.failoverAfterFailures) || 3;

    // @ts-ignore: Deno.env
    const envGmailUser = Deno.env.get('GMAIL_USER') || '';
    // @ts-ignore: Deno.env
    const envGmailPass = Deno.env.get('GMAIL_APP_PASSWORD') || '';

    const hasCredentials = (slot: SmtpSlotName) => {
      const cfg = providerConfig?.[slot];
      if (cfg && String(cfg.username || '').trim() && String(cfg.password || '').trim()) return true;
      // Account A also resolves through the GMAIL_* env vars in buildProvider,
      // so an env-only deployment still counts as configured.
      return slot === 'smtp' && Boolean(envGmailUser && envGmailPass);
    };
    const slotConfigured: Record<SmtpSlotName, boolean> = {
      smtp: hasCredentials('smtp'),
      smtp2: hasCredentials('smtp2')
    };

    // With no SMTP account configured at all, keep the legacy single-provider
    // path rather than deferring the whole queue to tomorrow on a quota check.
    const slotRoutingEnabled =
      requestedProvider === 'smtp' && (slotConfigured.smtp || slotConfigured.smtp2);

    // The account marked active cannot send. Routing silently falls through to
    // the other slot, so mail still goes out -- as a different identity, which
    // nobody asked for and nobody would otherwise be told about.
    if (slotRoutingEnabled && !slotConfigured[activeSmtpSlot]) {
      await sos({
        code: 'SMTP_SLOT_UNCONFIGURED',
        category: 'email_transport',
        severity: 'high',
        title: 'Active SMTP account has no usable credentials',
        message: `Account ${activeSmtpSlot === 'smtp' ? 'A' : 'B'} is marked active but has no username or password configured, so sends are falling through to the backup account.`,
        context: { activeSlot: activeSmtpSlot, configured: slotConfigured },
        dedupeKey: activeSmtpSlot
      });
    }

    // Today's sends per account. Rows predating smtp_slot carry NULL and belong
    // to Account A, which was the only account sending at the time.
    const slotUsage: Record<SmtpSlotName, number> = { smtp: 0, smtp2: 0 };
    if (slotRoutingEnabled) {
      const dayStart = istDayStartIso();
      try {
        const { count: usedA } = await supabase
          .from('email_queue')
          .select('*', { count: 'exact', head: true })
          .in('status', ['Sent', 'Delivered'])
          .gte('sent_at', dayStart)
          .or('smtp_slot.eq.smtp,smtp_slot.is.null');
        const { count: usedB } = await supabase
          .from('email_queue')
          .select('*', { count: 'exact', head: true })
          .in('status', ['Sent', 'Delivered'])
          .gte('sent_at', dayStart)
          .eq('smtp_slot', 'smtp2');
        slotUsage.smtp = usedA || 0;
        slotUsage.smtp2 = usedB || 0;
      } catch (err) {
        console.warn('Could not read per-account SMTP usage:', err);
      }
    }

    const slotProviderCache: Partial<Record<SmtpSlotName, EmailProvider>> = {};
    const slotProvider = (slot: SmtpSlotName): EmailProvider => {
      if (!slotProviderCache[slot]) {
        slotProviderCache[slot] = buildProvider('smtp', undefined, slot);
      }
      return slotProviderCache[slot]!;
    };

    let pendingPromotion: SmtpSlotName | null = null;
    const initialStreak: FailureStreak = { ...failureStreak };

    const { data: queueItems, error: fetchErr } = await supabase
      .from('email_queue')
      .select('*')
      .or(`status.eq.Pending,and(status.eq.Processing,processed_at.lt.${staleIso})`)
      .lte('available_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(25);

    if (fetchErr) {
      // The worker ran and sent nothing at all. Without this the run looks
      // identical to an empty queue.
      await sos({
        code: 'EMAIL_QUEUE_POLL_FAILED',
        category: 'email_delivery',
        severity: 'high',
        title: 'Worker could not read the email queue',
        message: `Polling email_queue failed, so this run delivered nothing: ${fetchErr.message}`,
        context: { error: fetchErr.message, code: (fetchErr as any).code },
        dedupeKey: 'poll'
      });
      throw fetchErr;
    }

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      skipped: 0,
      errors: [] as any[]
    };

    for (const item of (queueItems || [])) {
      results.processed++;

      // Claim lock
      const { error: claimErr } = await supabase
        .from('email_queue')
        .update({ status: 'Processing', processed_at: new Date().toISOString() })
        .eq('id', item.id)
        .in('status', ['Pending', 'Processing']);

      if (claimErr) {
        results.skipped++;
        continue;
      }

      const attempt = (item.attempt_count || item.retry_count || 0) + 1;

      // Resolve the ticket only for mails that ask for it. Template-driven
      // rather than keyed on the event, so a future mail can carry the ticket
      // by adding the placeholder to its body and nothing else.
      let ticket: TicketDelivery = { url: null, attachment: null };
      if (typeof item.body === 'string' && item.body.includes(TICKET_URL_PLACEHOLDER)) {
        ticket = await resolveTicketDelivery(supabase, item.ticket_id);
        if (ticket.note) {
          console.log(`[email ${item.id}] ticket delivery: ${ticket.note}`);
        }
        // "no ticket uploaded" is a normal state; a failure to sign or fetch
        // one that exists means the traveller gets a mail promising a ticket
        // that is not attached to it.
        if (ticket.note && /^(could not sign|attachment skipped)/.test(ticket.note)) {
          await sos({
            code: 'EMAIL_TICKET_ATTACHMENT_FAILED',
            category: 'email_delivery',
            severity: 'warning',
            title: 'Ticket file could not be attached to a mail',
            message: `The ticket for this request could not be delivered with its mail: ${ticket.note}`,
            context: { queueId: item.id, ticketId: item.ticket_id, note: ticket.note },
            dedupeKey: String(item.ticket_id || item.id)
          });
        }
      }

      // A queue row carrying digest data becomes a PDF at send time: the
      // report cannot be built in SQL, and rendering it here means the
      // scheduled send and an admin's download come out of the same code.
      let reportAttachment: EmailAttachment | null = null;
      if (item.report_payload) {
        try {
          const digest = item.report_payload as DeskDigest;
          reportAttachment = {
            filename: digestFileName(digest),
            content: digestToPdfBase64(digest),
            contentType: 'application/pdf'
          };
        } catch (err: any) {
          // Send the summary without the attachment rather than holding the
          // whole digest back: the message carries the numbers that matter.
          await sos({
            code: 'DESK_REPORT_RENDER_FAILED',
            category: 'platform',
            severity: 'warning',
            title: 'Desk report could not be rendered',
            message: `The daily digest was sent without its PDF: ${err?.message || err}`,
            context: { queueId: item.id, error: String(err?.message || err) },
            dedupeKey: 'digest-pdf'
          });
        }
      }

      const attachments = [
        ...(ticket.attachment ? [ticket.attachment] : []),
        ...(reportAttachment ? [reportAttachment] : [])
      ];

      const payload = {
        to: item.recipients || [],
        cc: item.cc || [],
        bcc: item.bcc || [],
        subject: item.subject,
        html: applyTicketUrl(item.body, ticket.url),
        idempotencyKey: item.idempotency_key,
        // The link stays in the body even when the file is attached: a
        // recipient whose client strips attachments still has a way through,
        // and a forwarded mail keeps working.
        attachments: attachments.length ? attachments : undefined
      };

      let usedSlot: SmtpSlotName | null = null;
      let sendRes: any;

      if (slotRoutingEnabled) {
        const pick = pickSlot({
          activeSlot: activeSmtpSlot,
          usage: slotUsage,
          perAccountQuota,
          configured: slotConfigured
        });

        if (!pick.slot) {
          // Both accounts have spent their daily cap. Hold the item until the
          // quota rolls over instead of burning a retry attempt on it.
          //
          // Nothing leaves the desk until IST midnight, so this is as loud as
          // the transport alerts get.
          await sos({
            code: 'SMTP_QUOTA_EXHAUSTED',
            category: 'email_transport',
            severity: 'critical',
            title: 'Both SMTP accounts have spent their daily quota',
            message: `Account A has sent ${slotUsage.smtp} and Account B ${slotUsage.smtp2} against a cap of ${perAccountQuota} each. Queued mail is held until the quota rolls over at IST midnight.`,
            context: {
              accountA: slotUsage.smtp,
              accountB: slotUsage.smtp2,
              perAccountQuota,
              heldUntil: istNextDayStartIso(),
              reason: pick.reason
            },
            dedupeKey: 'quota'
          });

          await supabase
            .from('email_queue')
            .update({
              status: 'Pending',
              available_at: istNextDayStartIso(),
              processed_at: new Date().toISOString(),
              last_error: `Daily quota exhausted on both SMTP accounts (${perAccountQuota}/account)`
            })
            .eq('id', item.id);
          results.skipped++;
          continue;
        }

        usedSlot = pick.slot;
        sendRes = await slotProvider(usedSlot).send(payload);

        const streakUpdate = nextStreakState({
          streak: failureStreak,
          slot: usedSlot,
          failed: !sendRes.success,
          isTransient: sendRes.error?.isTransient ?? true,
          promoteAfter: failoverAfterFailures
        });
        failureStreak = streakUpdate.streak;
        if (streakUpdate.promoteTo) pendingPromotion = streakUpdate.promoteTo;

        // Any failure retries once on the other account before giving up.
        if (!sendRes.success) {
          const failedSlot = usedSlot;
          const backupSlot = otherSlot(usedSlot);
          let rescuedBy: SmtpSlotName | null = null;

          if (slotConfigured[backupSlot] && (slotUsage[backupSlot] || 0) < perAccountQuota) {
            console.warn(`SMTP ${usedSlot} failed (${sendRes.error?.message || 'unknown'}). Retrying on ${backupSlot}...`);
            const backupRes = await slotProvider(backupSlot).send(payload);
            if (backupRes.success) {
              sendRes = backupRes;
              usedSlot = backupSlot;
              rescuedBy = backupSlot;
            }
          }

          // The warning before a promotion: one account is refusing sends
          // while the other quietly carries the load.
          await sos({
            code: 'SMTP_SLOT_SEND_FAILED',
            category: 'email_transport',
            severity: 'high',
            title: 'SMTP account rejected a send and the backup took over',
            message: `Account ${failedSlot === 'smtp' ? 'A' : 'B'} rejected a send (${sendRes.error?.message || 'unknown error'}).${rescuedBy ? ` The mail went out on Account ${rescuedBy === 'smtp' ? 'A' : 'B'} instead.` : ' No backup account was available to carry it.'}`,
            context: {
              failedSlot,
              rescuedBy,
              queueId: item.id,
              transient: sendRes.error?.isTransient ?? true,
              errorCode: sendRes.error?.code,
              error: sendRes.error?.message,
              consecutiveFailures: failureStreak.count,
              promotesAfter: failoverAfterFailures
            },
            dedupeKey: failedSlot
          });
        }

        if (sendRes.success) {
          slotUsage[usedSlot] = (slotUsage[usedSlot] || 0) + 1;
        }
      } else {
        sendRes = await provider.send(payload);
      }

      // Cross-provider last resort: both SMTP accounts are out, try SES/Gmail.
      if (!sendRes.success && quotaSettings?.fallbackProvider && quotaSettings.fallbackProvider !== provider.name) {
        console.warn(`Primary provider ${provider.name} failed. Attempting failover to ${quotaSettings.fallbackProvider}...`);
        const primaryError = sendRes.error?.message;
        const fallbackProvider = buildProvider(quotaSettings.fallbackProvider);
        const fallbackRes = await fallbackProvider.send(payload);
        if (fallbackRes.success) {
          sendRes = fallbackRes;
          // A different transport carried it, so no SMTP account owns this send.
          usedSlot = null;
        }

        // Either way this is worth knowing: the mail went out as a different
        // sending identity, or the last transport available also refused it.
        await sos({
          code: fallbackRes.success ? 'EMAIL_PROVIDER_FALLBACK' : 'EMAIL_PROVIDER_MISCONFIGURED',
          category: 'email_transport',
          severity: fallbackRes.success ? 'high' : 'critical',
          title: fallbackRes.success
            ? 'Outbound mail fell back to a secondary provider'
            : 'Selected email provider is missing its configuration',
          message: fallbackRes.success
            ? `Both SMTP accounts refused this send, so it was delivered through ${quotaSettings.fallbackProvider} instead of the usual transport.`
            : `Every configured transport refused this send. Primary: ${provider.name}; fallback ${quotaSettings.fallbackProvider}: ${fallbackRes.error?.message || 'unknown error'}.`,
          context: {
            queueId: item.id,
            primaryProvider: provider.name,
            fallbackProvider: quotaSettings.fallbackProvider,
            primaryError,
            fallbackError: fallbackRes.error?.message
          },
          dedupeKey: String(quotaSettings.fallbackProvider)
        });
      }

      if (sendRes.success) {
        await supabase
          .from('email_queue')
          .update({
            status: 'Sent',
            provider: sendRes.provider,
            smtp_slot: usedSlot,
            provider_message_id: sendRes.messageId,
            sent_at: new Date().toISOString(),
            processed_at: new Date().toISOString(),
            attempt_count: attempt,
            last_error: null
          })
          .eq('id', item.id);
        results.sent++;
      } else {
        const isTransient = sendRes.error?.isTransient ?? true;
        const msg = sendRes.error?.message || 'Send error';
        results.errors.push({ id: item.id, error: sendRes.error, attempt });

        if (isTransient && attempt < 5) {
          const backoffSec = Math.min(3600, Math.pow(2, attempt) * 15);
          const nextAvailable = new Date(Date.now() + backoffSec * 1000).toISOString();
          await supabase
            .from('email_queue')
            .update({
              status: 'Pending',
              retry_count: (item.retry_count || 0) + 1,
              attempt_count: attempt,
              available_at: nextAvailable,
              processed_at: new Date().toISOString(),
              last_error: msg
            })
            .eq('id', item.id);
          results.retried++;
        } else {
          await supabase
            .from('email_queue')
            .update({
              status: 'Failed',
              attempt_count: attempt,
              processed_at: new Date().toISOString(),
              last_error: `Permanent failure: ${msg}`
            })
            .eq('id', item.id);
          results.failed++;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Persist failure streak and promote the backup account if it has tipped
    // -------------------------------------------------------------------------
    if (slotRoutingEnabled) {
      const streakChanged =
        failureStreak.slot !== initialStreak.slot || failureStreak.count !== initialStreak.count;

      if (streakChanged) {
        await supabase.from('email_routing_settings').upsert({
          key: 'smtp_failure_streak',
          value: failureStreak,
          label: 'SMTP Consecutive Failure Streak',
          description: 'Consecutive non-transient send failures on the active account. Reaching failoverAfterFailures promotes the backup.',
          value_type: 'json',
          group: 'provider',
          updated_at: new Date().toISOString(),
          updated_by: 'email-worker'
        }, { onConflict: 'key' });
      }

      if (pendingPromotion && pendingPromotion !== activeSmtpSlot) {
        console.warn(`Promoting SMTP ${pendingPromotion} to active after ${failoverAfterFailures} consecutive failures.`);

        // The sending identity of the whole desk just changed, without a human
        // deciding it. This is the alert the SOS system was built around.
        await sos({
          code: 'SMTP_FAILOVER_PROMOTED',
          category: 'email_transport',
          severity: 'critical',
          title: 'SMTP account auto-promoted after repeated failures',
          message: `Account ${activeSmtpSlot === 'smtp' ? 'A' : 'B'} failed ${failoverAfterFailures} consecutive non-transient sends, so Account ${pendingPromotion === 'smtp' ? 'A' : 'B'} has been promoted to active. Mail is now going out as the backup identity.`,
          context: {
            demoted: activeSmtpSlot,
            promoted: pendingPromotion,
            consecutiveFailures: failoverAfterFailures,
            usageToday: slotUsage,
            perAccountQuota
          },
          dedupeKey: `${activeSmtpSlot}->${pendingPromotion}`
        });

        await supabase.from('email_routing_settings').upsert({
          key: 'active_smtp_slot',
          value: pendingPromotion,
          label: 'Active SMTP Account Slot',
          description: 'Designates whether Account A (smtp) or Account B (smtp2) is the primary transport.',
          value_type: 'text',
          group: 'provider',
          updated_at: new Date().toISOString(),
          updated_by: 'email-worker'
        }, { onConflict: 'key' });

        // Reset the counter against the newly active account so the next
        // promotion needs its own full run of failures.
        await supabase.from('email_routing_settings').upsert({
          key: 'smtp_failure_streak',
          value: { slot: pendingPromotion, count: 0 },
          label: 'SMTP Consecutive Failure Streak',
          description: 'Consecutive non-transient send failures on the active account. Reaching failoverAfterFailures promotes the backup.',
          value_type: 'json',
          group: 'provider',
          updated_at: new Date().toISOString(),
          updated_by: 'email-worker'
        }, { onConflict: 'key' });

        await supabase.from('email_audit_logs').insert({
          action: 'Active SMTP Account Auto-Promoted',
          details: {
            from: activeSmtpSlot,
            to: pendingPromotion,
            consecutiveFailures: failoverAfterFailures
          },
          actor_email: 'email-worker',
          actor_name: 'Email Queue Worker',
          created_at: new Date().toISOString()
        });

        activeSmtpSlot = pendingPromotion;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      results,
      activeProvider: provider.name,
      activeSmtpSlot: slotRoutingEnabled ? activeSmtpSlot : null,
      slotUsage: slotRoutingEnabled ? slotUsage : null,
      perAccountQuota: slotRoutingEnabled ? perAccountQuota : null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    // The run died part-way through. Anything it had claimed is stranded in
    // Processing until the stale-claim window expires, so this is reported
    // even though the only caller is usually a background trigger that
    // discards the response.
    try {
      // @ts-ignore: Deno.env
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      // @ts-ignore: Deno.env
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (supabaseUrl && serviceRoleKey) {
        await createSosReporter(createClient(supabaseUrl, serviceRoleKey))({
          code: 'EMAIL_WORKER_CRASHED',
          category: 'email_delivery',
          severity: 'critical',
          title: 'Email worker crashed mid-run',
          message: `The queue worker threw before finishing its batch: ${err?.message || err}`,
          context: {
            error: String(err?.message || err),
            stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 4).join(' | ') : undefined
          },
          dedupeKey: String(err?.message || 'crash').slice(0, 120)
        });
      }
    } catch {
      // Reporting must never replace the error being reported.
    }

    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
