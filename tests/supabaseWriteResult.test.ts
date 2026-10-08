import { describe, it, expect } from 'vitest';
import { requireWrittenRow, WriteBlockedError } from '../utils/supabaseWriteResult';

describe('requireWrittenRow', () => {
  it('returns the row when the write affected one row', () => {
    const row = { id: 'req-1', pnc_status: 'Processing' };
    expect(requireWrittenRow({ data: row, error: null }, 'Saving the travel request')).toBe(row);
  });

  it('rethrows a genuine database error untouched', () => {
    const error = { message: 'duplicate key value violates unique constraint', code: '23505' };
    expect(() => requireWrittenRow({ data: null, error }, 'Saving the travel request')).toThrow(
      'duplicate key value violates unique constraint'
    );
  });

  it('prefers the database error over the empty-result message', () => {
    const error = { message: 'boom', code: 'XXXXX' };
    try {
      requireWrittenRow({ data: null, error }, 'Saving the travel request');
      throw new Error('expected requireWrittenRow to throw');
    } catch (e: any) {
      expect(e).toBe(error);
      expect(e).not.toBeInstanceOf(WriteBlockedError);
    }
  });

  it('explains an RLS-filtered write instead of surfacing a coercion error', () => {
    // What .maybeSingle() returns where .single() would have raised PGRST116
    // ("Cannot coerce the result to a single JSON object").
    expect(() => requireWrittenRow({ data: null, error: null }, 'Auto-advancing the new request'))
      .toThrow(WriteBlockedError);

    try {
      requireWrittenRow({ data: null, error: null }, 'Auto-advancing the new request');
    } catch (e: any) {
      expect(e.message).toContain('Auto-advancing the new request');
      expect(e.message).toContain('row-level security');
      expect(e.context).toBe('Auto-advancing the new request');
    }
  });

  it('treats a falsy-but-present row as a blocked write', () => {
    expect(() => requireWrittenRow({ data: null, error: null }, 'Resubmitting the travel request'))
      .toThrow(/did not affect any row/);
  });
});
