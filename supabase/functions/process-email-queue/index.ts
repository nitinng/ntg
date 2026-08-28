// Supabase Edge Function: process-email-queue
// Processes pending records from public.email_queue and dispatches via Gmail API (or SES)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// Minimal Deno-compatible types and classes for standalone Edge Function deployment
interface EmailMessage {
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

interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: 'gmail' | 'ses' | 'mock';
  error?: {
    code: string;
    message: string;
    isTransient: boolean;
    statusCode?: number;
    rawError?: any;
  };
}

interface EmailProvider {
  readonly name: 'gmail' | 'ses' | 'mock';
  send(message: EmailMessage): Promise<EmailSendResult>;
}

const toBase64Url = (str: string): string => {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const toBase64 = (str: string): string => {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
};

const buildRfc2822MimeMessage = (
  message: EmailMessage,
  defaultSender?: { email: string; name?: string }
): string => {
  const fromEmail = message.from || defaultSender?.email || 'noreply@navgurukul.org';
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

    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new Error(`Google token refresh failed: ${data.error_description || data.error || response.statusText}`);
    }

    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    return this.cachedAccessToken!;
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
      return {
        success: false,
        provider: 'gmail',
        error: {
          code: 'GMAIL_EXCEPTION',
          message: err.message || 'Exception during Gmail delivery',
          isTransient: true
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

// Global handler for Deno/Supabase Edge Function
// @ts-ignore: Deno global
Deno.serve(async (req: Request) => {
  // CORS preflight check
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    // @ts-ignore: Deno.env
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    // @ts-ignore: Deno.env
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    // @ts-ignore: Deno.env
    const emailProviderType = Deno.env.get('EMAIL_PROVIDER') || 'gmail';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let provider: EmailProvider;

    if (emailProviderType === 'gmail') {
      // @ts-ignore: Deno.env
      const clientId = Deno.env.get('GMAIL_CLIENT_ID') || '';
      // @ts-ignore: Deno.env
      const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET') || '';
      // @ts-ignore: Deno.env
      const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN') || '';
      // @ts-ignore: Deno.env
      const senderEmail = Deno.env.get('GMAIL_SENDER_EMAIL') || 'travel@navgurukul.org';
      // @ts-ignore: Deno.env
      const senderName = Deno.env.get('GMAIL_SENDER_NAME') || 'Navgurukul Travel Desk';

      if (!clientId || !clientSecret || !refreshToken) {
        return new Response(JSON.stringify({
          error: 'Gmail credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) not configured in Edge Function secrets'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      provider = new EdgeGmailProvider({
        clientId,
        clientSecret,
        refreshToken,
        senderEmail,
        senderName
      });
    } else {
      return new Response(JSON.stringify({ error: `Provider ${emailProviderType} not configured` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process up to 25 items in batch
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
      skipped: 0
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
      const sendRes = await provider.send({
        to: item.recipients || [],
        cc: item.cc || [],
        bcc: item.bcc || [],
        subject: item.subject,
        html: item.body,
        idempotencyKey: item.idempotency_key
      });

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

    return new Response(JSON.stringify({ success: true, results }), {
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
