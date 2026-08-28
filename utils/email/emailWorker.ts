import { EmailMessage, EmailProvider, EmailQueueItem } from './types';

export interface EmailWorkerOptions {
  batchSize?: number;
  maxRetries?: number;
  baseBackoffSeconds?: number;
  maxBackoffSeconds?: number;
  staleProcessingMinutes?: number;
  defaultSenderEmail?: string;
  defaultSenderName?: string;
}

export interface WorkerRunSummary {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  errors: Array<{ queueId: string; error: string }>;
}

/**
 * Computes exponential backoff delay in seconds: base * 2^(attempts-1) with jitter and a max ceiling.
 */
export const calculateBackoffSeconds = (
  attempt: number,
  baseSeconds: number = 10,
  maxSeconds: number = 3600
): number => {
  const exponential = Math.pow(2, Math.max(0, attempt - 1)) * baseSeconds;
  return Math.min(maxSeconds, Math.round(exponential));
};

/**
 * Core asynchronous email queue processor.
 * Designed to run in a serverless Edge Function, scheduled cron worker, or backend process.
 */
export const processEmailQueue = async (
  supabase: any,
  provider: EmailProvider,
  options: EmailWorkerOptions = {}
): Promise<WorkerRunSummary> => {
  const batchSize = options.batchSize || 10;
  const maxRetries = options.maxRetries || 5;
  const baseBackoffSeconds = options.baseBackoffSeconds || 15;
  const maxBackoffSeconds = options.maxBackoffSeconds || 3600;
  const staleProcessingMinutes = options.staleProcessingMinutes || 10;
  const now = new Date();

  const summary: WorkerRunSummary = {
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // 1. Fetch eligible pending or stale-processing items
  const staleCutoff = new Date(now.getTime() - staleProcessingMinutes * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  // Query pending items that are ready to be dispatched (available_at <= now)
  const { data: queueItems, error: fetchError } = await supabase
    .from('email_queue')
    .select('*')
    .or(`status.eq.Pending,and(status.eq.Processing,processed_at.lt.${staleCutoff})`)
    .lte('available_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (fetchError || !queueItems || queueItems.length === 0) {
    if (fetchError) {
      console.error('Error polling email_queue:', fetchError);
    }
    return summary;
  }

  // 2. Process each queue item atomically
  for (const item of queueItems as EmailQueueItem[]) {
    summary.processed++;

    // Atomic claim: Mark item as Processing to prevent concurrent worker double-sends
    const { error: claimError } = await supabase
      .from('email_queue')
      .update({
        status: 'Processing',
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id)
      .in('status', ['Pending', 'Processing']); // Safety check

    if (claimError) {
      // Another worker claimed this item
      summary.skipped++;
      continue;
    }

    const currentAttempt = (item.attempt_count || item.retry_count || 0) + 1;

    // Construct EmailMessage
    const emailMessage: EmailMessage = {
      to: item.recipients || [],
      cc: item.cc || [],
      bcc: item.bcc || [],
      subject: item.subject,
      html: item.body,
      from: options.defaultSenderEmail,
      idempotencyKey: item.idempotency_key || `ticket:${item.ticket_id}:to_status:${item.to_status}:${(item.recipients || []).join(',')}`
    };

    try {
      const result = await provider.send(emailMessage);

      if (result.success) {
        // Mark as Sent
        await supabase
          .from('email_queue')
          .update({
            status: 'Sent',
            provider: result.provider,
            provider_message_id: result.messageId,
            sent_at: new Date().toISOString(),
            processed_at: new Date().toISOString(),
            last_error: null,
            attempt_count: currentAttempt
          })
          .eq('id', item.id);

        summary.sent++;
      } else {
        const error = result.error;
        const isTransient = error?.isTransient ?? true;
        const errorMessage = error?.message || 'Unknown delivery failure';

        summary.errors.push({ queueId: item.id, error: errorMessage });

        if (isTransient && currentAttempt < maxRetries) {
          // Schedule transient retry with exponential backoff
          const backoffSec = calculateBackoffSeconds(currentAttempt, baseBackoffSeconds, maxBackoffSeconds);
          const nextAvailableAt = new Date(Date.now() + backoffSec * 1000).toISOString();

          await supabase
            .from('email_queue')
            .update({
              status: 'Pending',
              retry_count: (item.retry_count || 0) + 1,
              attempt_count: currentAttempt,
              available_at: nextAvailableAt,
              processed_at: new Date().toISOString(),
              last_error: errorMessage
            })
            .eq('id', item.id);

          summary.retried++;
        } else {
          // Permanent failure or max retries exceeded -> Mark as Failed
          await supabase
            .from('email_queue')
            .update({
              status: 'Failed',
              attempt_count: currentAttempt,
              processed_at: new Date().toISOString(),
              last_error: `Final failure after ${currentAttempt} attempts: ${errorMessage}`
            })
            .eq('id', item.id);

          summary.failed++;
        }
      }
    } catch (unexpectedError: any) {
      const errMessage = unexpectedError?.message || String(unexpectedError);
      summary.errors.push({ queueId: item.id, error: errMessage });

      if (currentAttempt < maxRetries) {
        const backoffSec = calculateBackoffSeconds(currentAttempt, baseBackoffSeconds, maxBackoffSeconds);
        const nextAvailableAt = new Date(Date.now() + backoffSec * 1000).toISOString();

        await supabase
          .from('email_queue')
          .update({
            status: 'Pending',
            retry_count: (item.retry_count || 0) + 1,
            attempt_count: currentAttempt,
            available_at: nextAvailableAt,
            processed_at: new Date().toISOString(),
            last_error: `Unexpected error: ${errMessage}`
          })
          .eq('id', item.id);

        summary.retried++;
      } else {
        await supabase
          .from('email_queue')
          .update({
            status: 'Failed',
            attempt_count: currentAttempt,
            processed_at: new Date().toISOString(),
            last_error: `Exceeded max retries: ${errMessage}`
          })
          .eq('id', item.id);

        summary.failed++;
      }
    }
  }

  return summary;
};
