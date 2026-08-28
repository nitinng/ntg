/**
 * Provider-agnostic Email Message representation.
 */
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

/**
 * Standardized result returned by all email providers.
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: 'gmail' | 'ses' | 'mock';
  error?: {
    code: string;
    message: string;
    isTransient: boolean; // Whether the error can be retried
    statusCode?: number;
    rawError?: any;
  };
}

/**
 * Common interface that all email providers (Gmail, SES, Mock) must implement.
 */
export interface EmailProvider {
  readonly name: 'gmail' | 'ses' | 'mock';
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Configuration options for Gmail API provider.
 */
export interface GmailProviderConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string; // The authorized Google Workspace email (e.g. travel@navgurukul.org)
  senderName?: string; // e.g. "Navgurukul Travel Desk"
  fetchFn?: typeof fetch;
}

/**
 * Configuration options for Amazon SES provider.
 */
export interface SesProviderConfig {
  region: string; // e.g. "ap-south-1" (Mumbai) or "us-east-1"
  accessKeyId: string;
  secretAccessKey: string;
  senderEmail: string; // e.g. "travel@navgurukul.org"
  senderName?: string;
  fetchFn?: typeof fetch;
}

/**
 * Unified provider selection configuration.
 */
export interface EmailConfig {
  providerType: 'gmail' | 'ses' | 'mock';
  gmail?: GmailProviderConfig;
  ses?: SesProviderConfig;
}

/**
 * Database record representation in public.email_queue.
 */
export interface EmailQueueItem {
  id: string;
  ticket_id: string;
  to_status: string;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  status: 'Pending' | 'Processing' | 'Sent' | 'Failed';
  retry_count: number;
  attempt_count?: number;
  last_error?: string | null;
  idempotency_key?: string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  created_at: string;
  processed_at?: string | null;
  sent_at?: string | null;
  available_at?: string | null;
}
