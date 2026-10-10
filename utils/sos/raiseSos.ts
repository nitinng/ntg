/**
 * The browser-side entry point for "no silent failures".
 *
 * Any `catch` in the app that used to end at `console.error` calls `raiseSos`
 * instead: the failure is recorded in `public.sos_alerts` and, if it clears
 * the notification rules, pushed to the automation Slack channel.
 *
 * Three properties matter more than anything else here:
 *
 *  1. **It never throws.** It is called from inside error handlers. A reporting
 *     failure must not replace the failure being reported.
 *  2. **It never blocks.** Callers may `void raiseSos(...)`; the UI path does
 *     not wait on alerting.
 *  3. **It never recurses.** A failure to report is logged to the console and
 *     stops there, rather than raising an alert about the alert.
 */

import { supabase } from '../../supabaseClient';
import { getSosSpec, SosCategory, SosSeverity } from './catalog';
import { buildFingerprint } from './alertRules';

export interface RaiseSosOptions {
  /** What happened, in the reader's words. Defaults to the catalogue title. */
  message?: string;
  /** The error object, if there is one. Message and stack are extracted. */
  error?: unknown;
  /** Anything that identifies the failing thing: ids, slots, routes, counts. */
  context?: Record<string, any>;
  /** Raise the loudness above the catalogue default (never lowers it). */
  severity?: SosSeverity;
  /** Extra dedupe identity — a ticket id, an account slot, a queue id. */
  dedupeKey?: string | null;
}

export interface RaiseSosResult {
  recorded: boolean;
  notified: boolean;
  alertId?: string;
  suppressionReason?: string;
}

/**
 * Short in-memory throttle, keyed by fingerprint.
 *
 * The database dedupes properly, with a configurable window shared by every
 * client. This only stops one tab in a render loop from issuing the same RPC
 * hundreds of times a second before the database ever sees it.
 */
const CLIENT_THROTTLE_MS = 15_000;
const recentlyRaised = new Map<string, number>();

const throttled = (fingerprint: string, now: number): boolean => {
  const last = recentlyRaised.get(fingerprint);
  if (last && now - last < CLIENT_THROTTLE_MS) return true;
  recentlyRaised.set(fingerprint, now);

  // Keep the map from growing without bound in a long-lived session.
  if (recentlyRaised.size > 200) {
    for (const [key, at] of recentlyRaised) {
      if (now - at > CLIENT_THROTTLE_MS) recentlyRaised.delete(key);
    }
  }
  return false;
};

/** Pulls a readable message out of whatever was thrown. */
export const describeError = (error: unknown): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const candidate = error as any;
  return (
    candidate.message ||
    candidate.error_description ||
    candidate.details ||
    candidate.hint ||
    (() => {
      try {
        return JSON.stringify(candidate).slice(0, 400);
      } catch {
        return String(candidate);
      }
    })()
  );
};

/** Error fields worth carrying into the alert context. */
const errorContext = (error: unknown): Record<string, any> => {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as any;
  const out: Record<string, any> = {};
  if (candidate.code) out.errorCode = candidate.code;
  if (candidate.status) out.status = candidate.status;
  if (candidate.details) out.details = String(candidate.details).slice(0, 400);
  if (candidate.hint) out.hint = String(candidate.hint).slice(0, 400);
  if (candidate.name && candidate.name !== 'Error') out.errorName = candidate.name;
  if (typeof candidate.stack === 'string') out.stack = candidate.stack.split('\n').slice(0, 4).join(' | ');
  return out;
};

/**
 * Records a failure and pushes it to Slack if the rules allow.
 *
 * @param code  a key from the SOS catalogue. An unknown code is still recorded
 *              (losing the alert would be worse than recording a vague one),
 *              but it is flagged in the context so the catalogue gets fixed.
 */
export const raiseSos = async (code: string, options: RaiseSosOptions = {}): Promise<RaiseSosResult> => {
  try {
    const spec = getSosSpec(code);
    const severity: SosSeverity = options.severity || spec?.severity || 'warning';
    const category: SosCategory = spec?.category || 'platform';
    const errorMessage = describeError(options.error);
    const message =
      options.message ||
      (errorMessage ? `${spec?.title || code}: ${errorMessage}` : spec?.title || code);

    const context: Record<string, any> = {
      ...(options.context || {}),
      ...errorContext(options.error),
      ...(errorMessage && !options.message ? {} : errorMessage ? { error: errorMessage } : {}),
      ...(spec ? {} : { unknownCode: true }),
      ...(typeof window !== 'undefined'
        ? { route: `${window.location.pathname}${window.location.search}` }
        : {})
    };

    const fingerprint = buildFingerprint(code, options.dedupeKey);
    if (throttled(fingerprint, Date.now())) {
      return { recorded: false, notified: false, suppressionReason: 'client_throttled' };
    }

    // Always leave a local trace as well: a developer reading the console
    // should see the same thing the channel sees.
    console.error(`[SOS ${severity}] ${code}`, message, context);

    const { data, error } = await supabase.rpc('raise_sos_alert', {
      p_code: code,
      p_category: category,
      p_severity: severity,
      p_title: spec?.title || code,
      p_message: String(message).slice(0, 2000),
      p_context: context,
      p_source: 'web',
      p_dedupe_key: options.dedupeKey || null
    });

    if (error) {
      // Deliberately terminal: reporting a reporting failure is how an
      // alerting system takes itself down.
      console.error('[SOS] alert could not be recorded:', error.message);
      return { recorded: false, notified: false, suppressionReason: 'rpc_failed' };
    }

    const result = (Array.isArray(data) ? data[0] : data) || {};
    return {
      recorded: true,
      notified: Boolean(result.notified),
      alertId: result.alert_id,
      suppressionReason: result.suppression_reason
    };
  } catch (err: any) {
    console.error('[SOS] alert could not be recorded:', err?.message || err);
    return { recorded: false, notified: false, suppressionReason: 'exception' };
  }
};

/**
 * `catch` shorthand: report the failure and keep the thrown error flowing.
 *
 * ```ts
 * catch (err) {
 *   reportSos('REQUEST_UPDATE_FAILED', err, { ticketId: request.id });
 *   toast.error(...);
 * }
 * ```
 */
export const reportSos = (
  code: string,
  error: unknown,
  context?: Record<string, any>,
  options: Omit<RaiseSosOptions, 'error' | 'context'> = {}
): void => {
  void raiseSos(code, { ...options, error, context });
};

/**
 * Catches what every try/catch in the app misses.
 *
 * Installed once at startup. Both handlers are rate-limited by the fingerprint
 * throttle above, so a tight loop of the same error cannot flood the channel.
 */
export const installGlobalSosHandlers = (): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    void raiseSos('CLIENT_UNCAUGHT_ERROR', {
      message: event.message || 'Uncaught error in the browser',
      context: {
        source: `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`,
        stack: event.error?.stack?.split('\n').slice(0, 4).join(' | ')
      },
      dedupeKey: `${event.message}|${event.filename}:${event.lineno}`
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = describeError(event.reason);
    void raiseSos('CLIENT_UNHANDLED_REJECTION', {
      message: reason || 'Unhandled promise rejection',
      context: { reason },
      dedupeKey: reason.slice(0, 120)
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
};
