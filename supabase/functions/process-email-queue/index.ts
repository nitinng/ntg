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

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`
  ];

  if (ccHeader) headers.push(`Cc: ${ccHeader}`);
  if (bccHeader) headers.push(`Bcc: ${bccHeader}`);
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);

  const base64Body = toBase64(message.html || message.text || '');
  return `${headers.join('\r\n')}\r\n\r\n${base64Body}`;
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
    try {
      const res = await this.executeSmtpSession(async () => undefined);
      return {
        ok: true,
        latencyMs: res.latencyMs,
        message: `SMTP Connected & Authenticated successfully to ${this.host}:${this.port} (${res.latencyMs}ms)`
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// ---------------------------------------------------------------------------
// 4. Central Edge Function Handler
// ---------------------------------------------------------------------------
// @ts-ignore: Deno global
Deno.serve(async (req: Request) => {
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
    const url = new URL(req.url);
    const reqBody = await req.json().catch(() => ({}));

    // Load active provider and settings dynamically from email_routing_settings
    let activeProviderType = 'smtp';
    let providerConfig: any = {};
    let quotaSettings: any = {};

    try {
      const { data: routingRows } = await supabase
        .from('email_routing_settings')
        .select('key, value')
        .in('key', ['active_email_provider', 'provider_config', 'quota_settings']);

      if (routingRows) {
        for (const row of routingRows) {
          if (row.key === 'active_email_provider' && row.value) {
            activeProviderType = typeof row.value === 'string' ? row.value : String(row.value);
          } else if (row.key === 'provider_config' && row.value) {
            providerConfig = row.value;
          } else if (row.key === 'quota_settings' && row.value) {
            quotaSettings = row.value;
          }
        }
      }
    } catch (err) {
      console.warn('Could not query dynamic email routing settings:', err);
    }

    // Override from request if explicitly testing a specific provider
    const requestedProvider = reqBody?.provider || url.searchParams.get('provider') || activeProviderType;

    // Build Provider Instance
    const buildProvider = (type: string, customConfig?: any): EmailProvider => {
      const cfg = customConfig || providerConfig[type] || {};

      if (type === 'smtp' || type === 'ses' || type === 'gmail_smtp') {
        const isGmailSmtp = type === 'gmail_smtp' || cfg.host === 'smtp.gmail.com';
        // Use SMTP credentials (AWS Mail Manager or SES SMTP or Google Workspace SMTP Relay)
        // @ts-ignore: Deno.env
        const gmailUser = Deno.env.get('GMAIL_USER') || '';
        // @ts-ignore: Deno.env
        const gmailAppPass = Deno.env.get('GMAIL_APP_PASSWORD') || '';

        const host = isGmailSmtp ? 'smtp.gmail.com' : (cfg.host || cfg.smtpEndpoint || 'jc37vubwcvn9.hkph.mail-manager-smtp.amazonaws.com');
        const port = Number(cfg.port) || 587;
        const username = isGmailSmtp ? (cfg.username || gmailUser) : (cfg.username || cfg.accessKeyId || 'inp-xjixoqpi7g5fjchj7lbwkpmy');
        const password = isGmailSmtp ? (cfg.password || gmailAppPass) : (cfg.password || cfg.secretAccessKey || 'vZSR[99P*po=#bt-!?wiwwzP]nOF{W%U');
        const senderEmail = cfg.senderEmail || (isGmailSmtp ? gmailUser : 'travel@navgurukul.org');
        const senderName = cfg.senderName || 'Navgurukul Travel Desk';
        const replyTo = cfg.replyTo || senderEmail;

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

      if (type === 'resend') {
        // @ts-ignore: Deno.env
        const apiKey = cfg.apiKey || Deno.env.get('RESEND_API_KEY') || '';
        const senderEmail = cfg.senderEmail || 'travel@navgurukul.org';
        const senderName = cfg.senderName || 'Navgurukul Travel Desk';
        return new EdgeResendProvider({ apiKey, senderEmail, senderName });
      }

      if (type === 'gmail') {
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

      // Default fallback: SMTP
      return new EdgeSmtpProvider({
        host: 'jc37vubwcvn9.hkph.mail-manager-smtp.amazonaws.com',
        port: 587,
        username: 'inp-xjixoqpi7g5fjchj7lbwkpmy',
        password: 'vZSR[99P*po=#bt-!?wiwwzP]nOF{W%U'
      });
    };

    let provider = buildProvider(requestedProvider, reqBody?.providerConfig);

    // -------------------------------------------------------------------------
    // A. Health / Ping Connection Test Endpoint
    // -------------------------------------------------------------------------
    if (url.searchParams.get('ping') === 'true' || reqBody?.action === 'ping' || url.searchParams.get('testToken') === 'true') {
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

    const { data: queueItems, error: fetchErr } = await supabase
      .from('email_queue')
      .select('*')
      .or(`status.eq.Pending,and(status.eq.Processing,processed_at.lt.${staleIso})`)
      .lte('available_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(25);

    if (fetchErr) throw fetchErr;

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
      let sendRes = await provider.send({
        to: item.recipients || [],
        cc: item.cc || [],
        bcc: item.bcc || [],
        subject: item.subject,
        html: item.body,
        idempotencyKey: item.idempotency_key
      });

      // Provider failover protection: If primary fails due to auth/config and fallback exists
      if (!sendRes.success && quotaSettings?.fallbackProvider && quotaSettings.fallbackProvider !== provider.name) {
        console.warn(`Primary provider ${provider.name} failed. Attempting failover to ${quotaSettings.fallbackProvider}...`);
        const fallbackProvider = buildProvider(quotaSettings.fallbackProvider);
        const fallbackRes = await fallbackProvider.send({
          to: item.recipients || [],
          cc: item.cc || [],
          bcc: item.bcc || [],
          subject: item.subject,
          html: item.body,
          idempotencyKey: item.idempotency_key
        });
        if (fallbackRes.success) {
          sendRes = fallbackRes;
        }
      }

      if (sendRes.success) {
        await supabase
          .from('email_queue')
          .update({
            status: 'Sent',
            provider: sendRes.provider,
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

    return new Response(JSON.stringify({ success: true, results, activeProvider: provider.name }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
