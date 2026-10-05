/**
 * Helpers for Supabase writes that chain `.select()` and expect exactly one row back.
 *
 * Using `.single()` on such a write makes PostgREST raise PGRST116
 * ("Cannot coerce the result to a single JSON object") whenever the statement
 * matched zero rows. The most common cause is row-level security silently
 * filtering the write out, but the surfaced message says nothing about
 * permissions, which makes the failure very hard to read in the UI.
 *
 * Pair `.maybeSingle()` with `requireWrittenRow()` instead: a genuine database
 * error is rethrown untouched, and an empty result becomes an explicit,
 * actionable message.
 */

export interface SupabaseWriteResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export class WriteBlockedError extends Error {
  constructor(public readonly context: string) {
    super(
      `${context} did not affect any row. This usually means row-level security ` +
      `blocked the write — your account may not have permission to change this ` +
      `record, or it is no longer in a state that allows this change.`
    );
    this.name = 'WriteBlockedError';
  }
}

/**
 * Unwrap a `.maybeSingle()` write result, or throw with a readable reason.
 *
 * @param result  the `{ data, error }` returned by the Supabase client
 * @param context short description of the write, e.g. "Saving the travel request"
 */
export function requireWrittenRow<T>(result: SupabaseWriteResult<T>, context: string): T {
  if (result.error) throw result.error;
  if (!result.data) throw new WriteBlockedError(context);
  return result.data;
}
