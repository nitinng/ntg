import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailQueue, calculateBackoffSeconds } from '../utils/email/emailWorker';
import { MockEmailProvider } from '../utils/email/providerFactory';
import { EmailQueueItem } from '../utils/email/types';

describe('Email Worker: Exponential Backoff Calculation', () => {
  it('computes exponential backoff correctly with ceiling', () => {
    // attempt 1: 15 * 2^0 = 15s
    expect(calculateBackoffSeconds(1, 15, 3600)).toBe(15);
    // attempt 2: 15 * 2^1 = 30s
    expect(calculateBackoffSeconds(2, 15, 3600)).toBe(30);
    // attempt 3: 15 * 2^2 = 60s
    expect(calculateBackoffSeconds(3, 15, 3600)).toBe(60);
    // attempt 4: 15 * 2^3 = 120s
    expect(calculateBackoffSeconds(4, 15, 3600)).toBe(120);
    // attempt 10: clamped to ceiling of 3600s
    expect(calculateBackoffSeconds(10, 15, 3600)).toBe(3600);
  });
});

describe('Email Worker: processEmailQueue End-to-End Delivery Loop', () => {
  let mockProvider: MockEmailProvider;
  let inMemoryQueue: EmailQueueItem[];
  let mockSupabase: any;

  beforeEach(() => {
    mockProvider = new MockEmailProvider();

    inMemoryQueue = [
      {
        id: 'queue-item-1',
        ticket_id: 'req-1',
        to_status: 'Approved',
        recipients: ['employee@navgurukul.org'],
        subject: 'Your Request is Approved',
        body: '<p>Approved!</p>',
        status: 'Pending',
        retry_count: 0,
        attempt_count: 0,
        created_at: new Date().toISOString(),
        available_at: new Date(Date.now() - 1000).toISOString()
      },
      {
        id: 'queue-item-2',
        ticket_id: 'req-2',
        to_status: 'Approval Pending',
        recipients: ['manager@navgurukul.org'],
        subject: 'Approval Needed',
        body: '<p>Please approve</p>',
        status: 'Pending',
        retry_count: 0,
        attempt_count: 0,
        created_at: new Date().toISOString(),
        available_at: new Date(Date.now() - 1000).toISOString()
      }
    ];

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'email_queue') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockImplementation(async (limitCount: number) => {
                      const items = inMemoryQueue
                        .filter(i => i.status === 'Pending' || i.status === 'Processing')
                        .slice(0, limitCount);
                      return { data: items, error: null };
                    })
                  })
                })
              })
            }),
            update: vi.fn((updates: Partial<EmailQueueItem>) => {
              return {
                eq: vi.fn((field: string, val: string) => {
                  return {
                    in: vi.fn((inField: string, inVals: string[]) => {
                      const target = inMemoryQueue.find(i => (i as any)[field] === val);
                      if (target) {
                        Object.assign(target, updates);
                      }
                      return Promise.resolve({ error: null });
                    }),
                    then: (resolve: any) => {
                      const target = inMemoryQueue.find(i => (i as any)[field] === val);
                      if (target) {
                        Object.assign(target, updates);
                      }
                      return resolve({ error: null });
                    }
                  };
                })
              };
            })
          };
        }
        return {};
      })
    };
  });

  it('processes pending queue items, dispatches via provider, and marks them as Sent', async () => {
    const summary = await processEmailQueue(mockSupabase, mockProvider, { batchSize: 10 });

    expect(summary.processed).toBe(2);
    expect(summary.sent).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.retried).toBe(0);

    // Verify all queue items in DB are marked as Sent
    expect(inMemoryQueue[0].status).toBe('Sent');
    expect(inMemoryQueue[0].provider).toBe('mock');
    expect(inMemoryQueue[0].sent_at).toBeDefined();

    expect(inMemoryQueue[1].status).toBe('Sent');
    expect(mockProvider.sentMessages.length).toBe(2);
  });

  it('schedules transient failure for retry with backoff delay', async () => {
    mockProvider.shouldFail = true;
    mockProvider.failureIsTransient = true;
    mockProvider.failureMessage = 'Simulated Google 429 Rate Limit';

    const summary = await processEmailQueue(mockSupabase, mockProvider, {
      batchSize: 10,
      maxRetries: 3,
      baseBackoffSeconds: 20
    });

    expect(summary.processed).toBe(2);
    expect(summary.sent).toBe(0);
    expect(summary.retried).toBe(2);
    expect(summary.failed).toBe(0);

    // Should remain in 'Pending' for next retry window
    expect(inMemoryQueue[0].status).toBe('Pending');
    expect(inMemoryQueue[0].retry_count).toBe(1);
    expect(inMemoryQueue[0].last_error).toContain('Simulated Google 429');
    expect(new Date(inMemoryQueue[0].available_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it('marks permanent failure as Failed immediately without wasting retry quota', async () => {
    mockProvider.shouldFail = true;
    mockProvider.failureIsTransient = false;
    mockProvider.failureMessage = 'Malformed email address (400 Bad Request)';

    const summary = await processEmailQueue(mockSupabase, mockProvider, {
      batchSize: 10,
      maxRetries: 3
    });

    expect(summary.processed).toBe(2);
    expect(summary.sent).toBe(0);
    expect(summary.retried).toBe(0);
    expect(summary.failed).toBe(2);

    expect(inMemoryQueue[0].status).toBe('Failed');
    expect(inMemoryQueue[0].last_error).toContain('Final failure after 1 attempts: Malformed email address');
  });

  it('marks item as Failed when maximum retry attempts are exhausted', async () => {
    inMemoryQueue[0].retry_count = 3;
    inMemoryQueue[0].attempt_count = 3;

    mockProvider.shouldFail = true;
    mockProvider.failureIsTransient = true; // Even if transient, maxRetries reached

    const summary = await processEmailQueue(mockSupabase, mockProvider, {
      batchSize: 1,
      maxRetries: 3
    });

    expect(summary.processed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(inMemoryQueue[0].status).toBe('Failed');
  });
});
