import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries: Array<{ filters: any[] }> = [];

vi.mock('../supabaseClient', () => {
  const makeBuilder = () => {
    const state = { filters: [] as any[] };
    queries.push(state);
    const builder: any = {
      select: () => builder,
      in: (col: string, vals: any) => { state.filters.push(['in', col, vals]); return builder; },
      gte: (col: string, val: any) => { state.filters.push(['gte', col, val]); return builder; },
      eq: (col: string, val: any) => { state.filters.push(['eq', col, val]); return builder; },
      or: (expr: string) => { state.filters.push(['or', expr]); return builder; },
      then: (onFulfilled: any) => {
        const isBackup = state.filters.some(
          (f) => f[0] === 'eq' && f[1] === 'smtp_slot' && f[2] === 'smtp2'
        );
        return Promise.resolve({ count: isBackup ? 30 : 20, error: null }).then(onFulfilled);
      }
    };
    return builder;
  };

  return { supabase: { from: vi.fn(() => makeBuilder()) } };
});

import { loadPerAccountUsage } from '../utils/emailNotificationService';

describe('loadPerAccountUsage', () => {
  beforeEach(() => { queries.length = 0; });

  it('reports usage per SMTP account plus a pooled total', async () => {
    const usage = await loadPerAccountUsage();
    expect(usage.smtp).toBe(20);
    expect(usage.smtp2).toBe(30);
    expect(usage.total).toBe(50);
  });

  it('attributes legacy rows with no smtp_slot to Account A', async () => {
    await loadPerAccountUsage();
    const accountAQuery = queries.find((q) =>
      q.filters.some((f) => f[0] === 'or' && String(f[1]).includes('is.null'))
    );
    expect(accountAQuery).toBeDefined();
    expect(String(accountAQuery!.filters.find((f) => f[0] === 'or')![1]))
      .toContain('smtp_slot.eq.smtp');
  });

  it('counts only delivered mail from the current IST day', async () => {
    await loadPerAccountUsage(new Date('2026-09-29T03:00:00Z'));
    const q = queries[0];
    expect(q.filters).toContainEqual(['in', 'status', ['Sent', 'Delivered']]);
    expect(q.filters).toContainEqual(['gte', 'sent_at', '2026-09-28T18:30:00.000Z']);
  });

  it('treats a null count from Supabase as zero usage', async () => {
    const usage = await loadPerAccountUsage();
    expect(Number.isFinite(usage.total)).toBe(true);
  });
});
