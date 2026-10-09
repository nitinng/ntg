/**
 * Travel Desk lifecycle email triggers.
 *
 * Implements the model in "Travel Desk Stages- mails - Triggers.xlsx" (Final tab):
 * a mail is selected by the *event* that occurred, not by the stage the request
 * landed in. Several sheet rows share a destination stage while carrying different
 * copy - rows 2, 12 and 18 all reach "Approval Pending"; rows 33 and 37 both reach
 * "Cancelled by Employee" but differ on whether money is owed - so a stage key
 * cannot express the routing.
 *
 * Resolution order for a template is:
 *   1. exact (event, audience, contextKey)
 *   2. (event, audience, NULL)      - the fallback copy for that pair
 *   3. nothing, in which case no mail is sent and the absence is logged
 *
 * Silence is a first-class outcome here. Nineteen of the sheet's rows deliberately
 * send nothing; those events simply have no template and must not fall back to a
 * generic "your request was updated" mail.
 */

import { supabase } from '../supabaseClient';
import {
  TravelRequest,
  PNCStatus,
  Priority,
  PolicyConfig,
  TravelEvent,
  EmailAudience,
  EmailContextKey,
  EmailCcRule,
  EmailRoutingConfig
} from '../types';
import { resolveTemplateVariables } from './emailQueueUtils';
import { getDaysRemaining } from './policyUtils';

/** Matches getEffectiveBookingSlaHours' own fallback for the Critical tier. */
const DEFAULT_CRITICAL_SLA_HOURS = 4;

// ---------------------------------------------------------------------------
// Routing configuration
// ---------------------------------------------------------------------------

export const DEFAULT_ROUTING_CONFIG: EmailRoutingConfig = {
  defaultCc: ['travel.team@navgurukul.org'],
  financeCc: ['finance@navgurukul.org'],
  escalationOwners: ['pnc@navgurukul.org'],
  pncQueueCc: [],
  supportEmail: 'travel.team@navgurukul.org',
  portalUrl: 'https://ng-travel-desk.vercel.app',
  infoReminderFirstHours: 24,
  infoReminderFinalHours: 72,
  infoEscalationDays: 5,
  infoExpiryDays: 7,
  remindersEnabled: true
};

const SETTING_TO_CONFIG: Record<string, keyof EmailRoutingConfig> = {
  default_cc: 'defaultCc',
  finance_cc: 'financeCc',
  escalation_owners: 'escalationOwners',
  pnc_queue_cc: 'pncQueueCc',
  support_email: 'supportEmail',
  portal_url: 'portalUrl',
  info_reminder_first_hours: 'infoReminderFirstHours',
  info_reminder_final_hours: 'infoReminderFinalHours',
  info_escalation_days: 'infoEscalationDays',
  info_expiry_days: 'infoExpiryDays',
  reminders_enabled: 'remindersEnabled'
};

let routingCache: { value: EmailRoutingConfig; at: number } | null = null;
const ROUTING_CACHE_MS = 60_000;

/**
 * Reads the configurable routing defaults - the sheet's "system set defaults" CC,
 * the Finance list and the escalation owners it left undefined.
 *
 * Falls back to DEFAULT_ROUTING_CONFIG field by field, so a partially seeded table
 * still yields a usable config rather than blank recipients.
 */
export const getEmailRoutingConfig = async (
  options: { force?: boolean } = {}
): Promise<EmailRoutingConfig> => {
  if (!options.force && routingCache && Date.now() - routingCache.at < ROUTING_CACHE_MS) {
    return routingCache.value;
  }

  const config: EmailRoutingConfig = { ...DEFAULT_ROUTING_CONFIG };

  try {
    const { data, error } = await supabase
      .from('email_routing_settings')
      .select('key, value');

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const field = SETTING_TO_CONFIG[row.key];
        if (!field) continue;
        const value = row.value;
        if (value === null || value === undefined) continue;

        if (Array.isArray(value)) {
          (config as any)[field] = value.filter(Boolean);
        } else {
          (config as any)[field] = value;
        }
      }
    }
  } catch (err) {
    console.warn('Falling back to default email routing config:', err);
  }

  routingCache = { value: config, at: Date.now() };
  return config;
};

/** Drops the cached routing config so the next read sees fresh settings. */
export const invalidateRoutingConfigCache = () => {
  routingCache = null;
  policyCache = null;
};

let policyCache: { value: Partial<PolicyConfig>; at: number } | null = null;

/**
 * Reads the policy config the priority mail quotes its SLA target from.
 *
 * Kept separate from the routing config because it lives in `meetup_settings`
 * under `policy_config` (the same row App.tsx and CancellationModal read) and
 * is only needed for the one mail. Failure is non-fatal: the mail still goes
 * out, quoting the documented default rather than nothing.
 */
export const getPolicyConfig = async (): Promise<Partial<PolicyConfig>> => {
  if (policyCache && Date.now() - policyCache.at < ROUTING_CACHE_MS) {
    return policyCache.value;
  }

  let value: Partial<PolicyConfig> = {};
  try {
    const { data } = await supabase
      .from('meetup_settings')
      .select('setting_value')
      .eq('setting_key', 'policy_config')
      .single();
    const raw = (data as any)?.setting_value;
    if (raw && typeof raw === 'object') value = raw as Partial<PolicyConfig>;
  } catch (err) {
    console.warn('Could not read policy config for priority mail; using defaults:', err);
  }

  policyCache = { value, at: Date.now() };
  return value;
};

// ---------------------------------------------------------------------------
// Transition -> event
// ---------------------------------------------------------------------------

const S = PNCStatus;
const E = TravelEvent;

/**
 * Maps a stage transition onto the sheet's trigger event.
 *
 * `null` means the transition raises no event we mail on. That is different from
 * an event with no template: both stay silent, but only the latter is a gap worth
 * reporting, so they are distinguished here.
 */
export const deriveEventFromTransition = (
  fromStatus: PNCStatus | null,
  toStatus: PNCStatus
): TravelEvent | null => {
  switch (toStatus) {
    case S.NOT_STARTED:
      // Sheet rows 1, 10, 11, 16, 17: submission and edit are silent by design;
      // the policy re-evaluation that follows carries the notification.
      return fromStatus === null ? E.REQUEST_SUBMITTED : E.REQUEST_RESUBMITTED;

    case S.APPROVAL_PENDING:
      return E.POLICY_VIOLATION_DETECTED;

    case S.PROCESSING:
      if (fromStatus === S.ON_HOLD) return E.INFO_PROVIDED;
      if (fromStatus === S.APPROVED) return E.APPROVAL_COMPLETED;
      if (fromStatus === S.NOT_STARTED || fromStatus === null) return E.POLICY_EVALUATION_PASSED;
      return E.PNC_STARTED_PROCESSING;

    case S.APPROVED:
      return E.MANAGER_APPROVED;

    case S.REJECTED_BY_MANAGER:
      return E.MANAGER_REJECTED;

    case S.REJECTED_BY_PNC:
      return E.PNC_REJECTED;

    case S.ON_HOLD:
      return E.INFO_REQUESTED;

    case S.ON_HOLD_ESCALATED:
      return E.INFO_REQUEST_ESCALATED;

    case S.BOOKED:
      // Booked -> Booked is a booking maintenance edit. Only a material change mails
      // (sheet row 29); document swaps and cosmetic edits are silent (rows 30, 31).
      // The caller signals which by raising the event directly, so the self-loop
      // resolves to the silent default here.
      if (fromStatus === S.BOOKED) return E.BOOKING_DETAIL_EDITED;
      return E.BOOKING_CONFIRMED;

    case S.CANCELLATION_REQUESTED:
      return E.CANCELLATION_REQUESTED;

    case S.CANCELLED_BY_EMPLOYEE:
      // Before a manager has decided, this is the employee withdrawing (row 8/9).
      // Afterwards it is PNC completing a cancellation task (rows 33/37).
      return fromStatus === S.APPROVAL_PENDING || fromStatus === S.NOT_STARTED
        ? E.EMPLOYEE_CANCELLED_PRE_APPROVAL
        : E.CANCELLATION_PROCESSED_EMPLOYEE;

    case S.CANCELLED_BY_PNC:
      return E.PNC_CANCELLATION;

    case S.CANCELLED_BY_SYSTEM:
      return E.INFO_REQUEST_EXPIRED;

    case S.PARTIALLY_CANCELLED:
      return E.PARTIAL_CANCELLATION;

    case S.PENDING_REFUND:
      return E.REFUND_PROCESS_STARTED;

    case S.PARTIALLY_REFUNDED:
      return E.PARTIAL_REFUND_RECEIVED;

    case S.FULLY_REFUNDED:
      return E.REFUND_COMPLETED;

    case S.WRITTEN_OFF:
      return E.REFUND_WRITTEN_OFF;

    case S.DISPUTED:
      return E.REFUND_DISPUTED;

    case S.RECONCILED:
      // Reconciled straight from a cancellation means nothing was recoverable (row 39);
      // from a refund stage it is the end of reconciliation (rows 51, 52).
      return fromStatus === S.CANCELLED_BY_EMPLOYEE || fromStatus === S.CANCELLED_BY_PNC
        ? E.NO_REFUND_REQUIRED
        : E.REFUND_RECONCILIATION_COMPLETED;

    case S.CLOSED_RECORDED:
      return E.RETROACTIVE_BOOKING_RECORDED;

    case S.CLOSED:
      return E.TRIP_COMPLETED;

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Context derivation
// ---------------------------------------------------------------------------

/**
 * Events that land a request in the PNC work queue.
 *
 * Shared by the audience routing and the priority-context derivation so the two
 * cannot disagree about what counts as "new work for the desk".
 */
export const PNC_QUEUE_EVENTS: TravelEvent[] = [
  E.POLICY_EVALUATION_PASSED,
  E.APPROVAL_COMPLETED
];

const hasBooking = (request: TravelRequest): boolean =>
  Boolean(
    request.bookingReference ||
    request.pnr ||
    (request.travelLegs && request.travelLegs.some(leg => leg?.pnr)) ||
    request.ticketCost
  );

/**
 * Finds the stage a request was last rejected from, which is what separates sheet
 * rows 2 (first submission), 12 (resubmitted after a manager rejection) and 18
 * (resubmitted after a PNC rejection). All three land on "Approval Pending" with
 * the same event, so the prior rejection is the only honest discriminator.
 */
const deriveResubmissionContext = async (
  request: TravelRequest
): Promise<EmailContextKey | undefined> => {
  // A request that has never been resubmitted is a first submission by definition,
  // which saves a query on the common path.
  if (!request.resubmissionCount) return undefined;

  try {
    const { data } = await supabase
      .from('ticket_status_history')
      .select('to_status, created_at')
      .eq('ticket_id', request.id)
      .in('to_status', [S.REJECTED_BY_MANAGER, S.REJECTED_BY_PNC])
      .order('created_at', { ascending: false })
      .limit(1);

    const last = data?.[0]?.to_status;
    if (last === S.REJECTED_BY_MANAGER) return 'resubmit_after_manager_rejection';
    if (last === S.REJECTED_BY_PNC) return 'resubmit_after_pnc_rejection';
  } catch (err) {
    console.warn('Could not derive resubmission context, using default copy:', err);
  }
  return undefined;
};

/**
 * Context is derived per *audience*, not per event.
 *
 * The desk and the traveller read the same event for different reasons: a
 * resubmitted request is "here it is again" to the employee and "this one has
 * been round before" to PNC, and a Critical request needs flagging to the desk
 * but not to the traveller, who cannot act on an SLA. A single context per
 * event cannot express that -- and would collide outright, since a Critical
 * resubmission is both at once.
 */
export const deriveContextKey = async (
  event: TravelEvent,
  request: TravelRequest,
  fromStatus: PNCStatus | null,
  audience?: EmailAudience
): Promise<EmailContextKey | undefined> => {
  // Work arriving in the PNC queue is flagged by priority. Resolution falls
  // back to the context-less template, so a desk that has not seeded the
  // priority variant still gets the ordinary queue mail rather than silence.
  if (audience === 'pnc' && PNC_QUEUE_EVENTS.includes(event)) {
    if (request.priority === Priority.CRITICAL) return 'priority_critical';
    return undefined;
  }

  switch (event) {
    case E.POLICY_VIOLATION_DETECTED:
    case E.POLICY_EVALUATION_PASSED:
      return deriveResubmissionContext(request);

    case E.CANCELLATION_REQUESTED:
      return fromStatus === S.BOOKED || hasBooking(request) ? 'post_booking' : undefined;

    case E.CANCELLATION_PROCESSED_EMPLOYEE:
      // Both variants arrive from "Cancellation Requested", so the stage cannot tell
      // them apart - whether a ticket was ever issued is what decides the copy.
      return hasBooking(request) ? 'post_booking' : undefined;

    case E.NO_REFUND_REQUIRED:
      // Both cancellation routes end here, and the default copy is written for
      // an employee who cancelled themselves. Telling a traveller whose trip the
      // desk cancelled that "your cancellation is settled" reads as blame, so
      // the PNC route gets its own wording.
      return fromStatus === S.CANCELLED_BY_PNC ? 'pnc_cancellation' : undefined;

    case E.REFUND_COMPLETED:
    case E.REFUND_WRITTEN_OFF:
      return fromStatus === S.PARTIALLY_REFUNDED ? 'after_partial_refund' : undefined;

    case E.REFUND_RECONCILIATION_COMPLETED:
      return fromStatus === S.WRITTEN_OFF ? 'after_write_off' : undefined;

    default:
      return undefined;
  }
};

// ---------------------------------------------------------------------------
// Recipients and CC
// ---------------------------------------------------------------------------

const getPncEmails = async (config: EmailRoutingConfig): Promise<string[]> => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('email')
      .in('role', ['PNC', 'PNC Admin', 'Admin']);
    const fromProfiles = (data || []).map((u: any) => u.email).filter(Boolean) as string[];
    return dedupe([...fromProfiles, ...config.pncQueueCc]);
  } catch (err) {
    console.warn('Could not resolve PNC recipients:', err);
    return dedupe(config.pncQueueCc);
  }
};

const dedupe = (emails: (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    if (!email) continue;
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(email.trim());
  }
  return out;
};

export const resolveRecipients = async (
  audience: EmailAudience,
  request: TravelRequest,
  config: EmailRoutingConfig
): Promise<string[]> => {
  switch (audience) {
    case 'employee':
      return dedupe([request.requesterEmail]);
    case 'manager':
      return dedupe([request.approvingManagerEmail || request.managerEmail]);
    case 'pnc':
      return getPncEmails(config);
    case 'finance':
      return dedupe(config.financeCc);
    case 'escalation_owner':
      return dedupe(config.escalationOwners);
    default:
      return [];
  }
};

/** Whether a manager ever approved this request - gates the CC on sheet row 40. */
const wasManagerApproved = (request: TravelRequest): boolean =>
  Boolean(request.approvingManagerEmail && request.managerApprovalDate);

export const resolveCc = (
  ccRule: EmailCcRule,
  request: TravelRequest,
  config: EmailRoutingConfig,
  recipients: string[]
): string[] => {
  const managerEmail = request.approvingManagerEmail || request.managerEmail;
  let cc: (string | null | undefined)[];

  switch (ccRule) {
    case 'none':
      cc = [];
      break;
    case 'manager':
      cc = [managerEmail];
      break;
    case 'default_manager':
      cc = [...config.defaultCc, managerEmail];
      break;
    case 'default_manager_if_approved':
      cc = wasManagerApproved(request) ? [...config.defaultCc, managerEmail] : [...config.defaultCc];
      break;
    case 'default_finance':
      cc = [...config.defaultCc, ...config.financeCc];
      break;
    case 'default':
    default:
      cc = [...config.defaultCc];
      break;
  }

  // Never CC someone who is already a direct recipient - it reads as a duplicate
  // and, on the PNC mails, would copy the whole desk onto its own notification.
  const toSet = new Set(recipients.map(r => r.trim().toLowerCase()));
  return dedupe(cc).filter(email => !toSet.has(email.toLowerCase()));
};

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

export interface ResolvedTemplate {
  id: string;
  templateKey: string;
  name: string;
  subject: string;
  body: string;
  ccRule: EmailCcRule;
  contextKey: string | null;
}

/**
 * Picks the template for an (event, audience) pair, preferring the context-specific
 * row and falling back to the pair's default. Returns null when the sheet says this
 * combination sends nothing.
 */
export const resolveTemplate = async (
  event: TravelEvent,
  audience: EmailAudience,
  contextKey?: EmailContextKey
): Promise<ResolvedTemplate | null> => {
  try {
    const { data, error } = await supabase
      .from('mail_templates')
      .select('id, template_key, name, subject, body, cc_rule, context_key, is_active, is_draft, status')
      .eq('event', event)
      .eq('audience', audience);

    if (error || !Array.isArray(data) || data.length === 0) return null;

    const usable = data.filter(
      (t: any) => t.is_active !== false && !t.is_draft && t.status !== 'Draft' && t.status !== 'Archived'
    );
    if (usable.length === 0) return null;

    const exact = contextKey ? usable.find((t: any) => t.context_key === contextKey) : undefined;
    const fallback = usable.find((t: any) => !t.context_key);
    const chosen = exact || fallback;
    if (!chosen) return null;

    return {
      id: chosen.id,
      templateKey: chosen.template_key,
      name: chosen.name,
      subject: chosen.subject,
      body: chosen.body,
      ccRule: (chosen.cc_rule || 'default') as EmailCcRule,
      contextKey: chosen.context_key || null
    };
  } catch (err) {
    console.warn(`Could not resolve template for ${event}/${audience}:`, err);
    return null;
  }
};

/** Audiences to consider for an event, in the order the sheet lists them. */
export const AUDIENCES_FOR_EVENT: Partial<Record<TravelEvent, EmailAudience[]>> = {
  [E.POLICY_VIOLATION_DETECTED]: ['employee', 'manager'],
  // The desk is told when work reaches its queue. The employee mail is
  // unchanged; 'pnc' resolves through getPncEmails, the shared routing list.
  [E.POLICY_EVALUATION_PASSED]: ['employee', 'pnc'],
  // Silent to the employee and the manager, who have both just been told the
  // approval landed -- but this is the moment the request becomes the desk's.
  [E.APPROVAL_COMPLETED]: ['pnc'],
  [E.MANAGER_APPROVED]: ['employee'],
  [E.MANAGER_REJECTED]: ['employee'],
  [E.EMPLOYEE_CANCELLED_PRE_APPROVAL]: ['employee', 'manager'],
  [E.PNC_REJECTED]: ['employee'],
  [E.INFO_REQUESTED]: ['employee'],
  [E.INFO_PROVIDED]: ['pnc'],
  [E.INFO_REQUEST_REMINDER_24H]: ['employee'],
  [E.INFO_REQUEST_REMINDER_72H]: ['employee'],
  [E.INFO_REQUEST_ESCALATED]: ['escalation_owner'],
  [E.INFO_REQUEST_EXPIRED]: ['employee'],
  [E.BOOKING_CONFIRMED]: ['employee'],
  [E.BOOKING_UPDATED]: ['employee'],
  [E.CANCELLATION_REQUESTED]: ['employee', 'pnc'],
  [E.CANCELLATION_PROCESSED_EMPLOYEE]: ['employee'],
  [E.PNC_CANCELLATION]: ['employee'],
  [E.PARTIAL_CANCELLATION]: ['employee'],
  [E.SEGMENT_REFUND_COMPLETED]: ['employee'],
  // A ticket entering Pending Refund now notifies the traveller, whether the
  // employee cancelled (sheet P13) or PNC did (P15). Finance is copied via the
  // template's cc_rule rather than a second audience, so the mail stays one mail.
  [E.REFUND_PROCESS_STARTED]: ['employee'],
  [E.PARTIAL_REFUND_RECEIVED]: ['employee'],
  [E.REFUND_COMPLETED]: ['employee'],
  [E.REFUND_WRITTEN_OFF]: ['employee'],
  [E.REFUND_DISPUTED]: ['finance'],
  [E.REFUND_RECONCILIATION_COMPLETED]: ['employee'],
  [E.NO_REFUND_REQUIRED]: ['employee'],
  [E.RETROACTIVE_BOOKING_RECORDED]: ['employee']
};

/**
 * Every audience a mail can be addressed to. Ordered as the sheet lists them.
 */
export const ALL_AUDIENCES: EmailAudience[] = [
  'employee',
  'manager',
  'pnc',
  'finance',
  'escalation_owner'
];

/**
 * Events that send nothing to anyone.
 *
 * Silence used to be expressible only at this granularity, which stopped being
 * true once an event could be silent to one audience and not another:
 * APPROVAL_COMPLETED still tells the employee and the manager nothing -- they
 * were both just told the approval landed -- but it is the moment the request
 * becomes the desk's, so PNC is now mailed.
 *
 * This list and AUDIENCES_FOR_EVENT are two views of one decision, so they are
 * kept consistent by construction rather than by hand: an event belongs here
 * exactly when it has no audiences, and a test asserts that.
 */
export const SILENT_EVENTS: TravelEvent[] = [
  E.REQUEST_SUBMITTED,
  E.REQUEST_EDIT_STARTED,
  E.REQUEST_RESUBMITTED,
  E.PNC_STARTED_PROCESSING,
  E.TICKET_DOCUMENT_REPLACED,
  E.BOOKING_DETAIL_EDITED,
  E.CANCELLATION_REQUEST_ASSIGNED,
  E.CANCELLATION_CLOSED_PRE_BOOKING,
  E.SEGMENT_REFUND_PENDING,
  E.TRAVEL_DATE_REACHED,
  E.TRIP_COMPLETED,
  E.BOOKING_DOCUMENT_UPDATED
];

/**
 * Audiences this event deliberately does not mail.
 *
 * For a wholly silent event that is every audience; for a partly silent one it
 * is whatever AUDIENCES_FOR_EVENT leaves out. Stating it positively lets a test
 * assert intended silence instead of inferring it from an absent template,
 * which is how a missing template and a deliberate omission came to look alike.
 */
export const silentAudiencesFor = (event: TravelEvent): EmailAudience[] => {
  const mailed = AUDIENCES_FOR_EVENT[event] || [];
  return ALL_AUDIENCES.filter(audience => !mailed.includes(audience));
};

/**
 * Whether this event mails nothing at all, or nothing to a given audience.
 */
export const isSilent = (event: TravelEvent, audience?: EmailAudience): boolean => {
  const mailed = AUDIENCES_FOR_EVENT[event] || [];
  return audience ? !mailed.includes(audience) : mailed.length === 0;
};

// ---------------------------------------------------------------------------
// Queueing
// ---------------------------------------------------------------------------

export interface QueueEventOptions {
  /** Stage the request came from. Used to derive the context key. */
  fromStatus?: PNCStatus | null;
  /** Stage the request is now in. Recorded on the queue row for the Sent Mails view. */
  toStatus?: PNCStatus | null;
  /** Overrides the derived context key. */
  contextKey?: EmailContextKey;
  /** Extra template variables, e.g. { '{{days_on_hold}}': '4' }. */
  extraContext?: Record<string, any>;
  /** Restricts the send to these audiences. Defaults to every audience for the event. */
  audiences?: EmailAudience[];
  /** Distinguishes repeat sends of the same event on one ticket (reminder scans). */
  idempotencySuffix?: string;
  /** Skips the edge-function nudge; the reminder scan drains the queue itself. */
  skipWorkerTrigger?: boolean;
}

export interface QueueEventResult {
  event: TravelEvent;
  queued: { audience: EmailAudience; templateKey: string; recipients: string[] }[];
  skipped: { audience: EmailAudience; reason: string }[];
}

/**
 * Variables the desk's priority mail quotes.
 *
 * Only computed when a PNC queue mail is actually going out, so the ordinary
 * paths do not pay for a settings read. The SLA target falls back to the
 * documented default rather than rendering blank when the policy is unset.
 */
const priorityContext = async (
  request: TravelRequest,
  event: TravelEvent,
  audiences: EmailAudience[]
): Promise<Record<string, string>> => {
  if (!audiences.includes('pnc') || !PNC_QUEUE_EVENTS.includes(event)) return {};

  const policy = await getPolicyConfig();
  const slaHours =
    policy.urgencySlaHours?.[
      (request.priority || Priority.MEDIUM).toLowerCase() as 'critical' | 'high' | 'medium' | 'low'
    ];

  const daysRemaining = getDaysRemaining(request.dateOfTravel);

  return {
    '{{priority}}': request.priority || '',
    '{{sla_target_hours}}': String(slaHours ?? DEFAULT_CRITICAL_SLA_HOURS),
    '{{days_remaining}}': daysRemaining === null ? '' : String(daysRemaining)
  };
};

/**
 * Queues every mail the sheet attaches to `event` for this request.
 *
 * Never throws: a failure to mail must not roll back the workflow transition that
 * caused it, which is why every branch here degrades to a logged skip.
 */
export const queueEmailsForEvent = async (
  request: TravelRequest,
  event: TravelEvent,
  options: QueueEventOptions = {}
): Promise<QueueEventResult> => {
  const result: QueueEventResult = { event, queued: [], skipped: [] };

  try {
    const audiences = options.audiences || AUDIENCES_FOR_EVENT[event];
    if (!audiences || audiences.length === 0) {
      // Deliberate silence (sheet rows 1, 6, 10, 11, 16, 17, 20, 30, 31, 34, 36, 38,
      // 41, 42, 44, 54, 55, 58) rather than a missing template.
      return result;
    }

    const config = await getEmailRoutingConfig();
    const fromStatus = options.fromStatus ?? null;

    const extraContext = {
      '{{support_email}}': config.supportEmail,
      '{{portal_url}}': config.portalUrl,
      ...(await priorityContext(request, event, audiences)),
      ...(options.extraContext || {})
    };

    for (const audience of audiences) {
      // Derived per audience: the desk and the traveller read the same event
      // differently, so they can need different copy for it.
      const contextKey =
        options.contextKey ?? (await deriveContextKey(event, request, fromStatus, audience));

      const template = await resolveTemplate(event, audience, contextKey);
      if (!template) {
        result.skipped.push({ audience, reason: 'no active template' });
        continue;
      }

      const recipients = await resolveRecipients(audience, request, config);
      if (recipients.length === 0) {
        result.skipped.push({ audience, reason: 'no recipients' });
        continue;
      }

      const cc = resolveCc(template.ccRule, request, config, recipients);
      const subject = resolveTemplateVariables(template.subject, request, extraContext);
      const body = resolveTemplateVariables(template.body, request, extraContext);

      const idempotencyKey = [
        `ticket:${request.id}`,
        `event:${event}`,
        `aud:${audience}`,
        `ctx:${template.contextKey || 'default'}`,
        `to:${recipients.slice().sort().join(',')}`,
        options.idempotencySuffix ? `seq:${options.idempotencySuffix}` : null
      ]
        .filter(Boolean)
        .join('|');

      const { error } = await supabase.from('email_queue').insert({
        ticket_id: request.id,
        to_status: options.toStatus ?? null,
        event,
        audience,
        context_key: template.contextKey,
        template_key: template.templateKey,
        template_name: template.name,
        recipients,
        cc,
        subject,
        body,
        status: 'Pending',
        last_error: null,
        idempotency_key: idempotencyKey,
        retry_count: 0,
        attempt_count: 0
      });

      if (error) {
        // A unique violation on idempotency_key means this mail is already queued,
        // which is the mechanism working, not a failure.
        const duplicate = error.code === '23505' || /duplicate key/i.test(error.message || '');
        result.skipped.push({
          audience,
          reason: duplicate ? 'already queued' : `insert failed: ${error.message}`
        });
        if (!duplicate) console.warn(`Failed to queue ${event}/${audience}:`, error.message);
        continue;
      }

      result.queued.push({ audience, templateKey: template.templateKey, recipients });
    }

    if (result.queued.length > 0 && !options.skipWorkerTrigger) {
      void triggerWorker();
    }
  } catch (err) {
    console.error('Non-blocking error in queueEmailsForEvent:', err);
  }

  return result;
};

/** Nudges the edge-function worker so delivery does not wait for the next scan. */
export const triggerWorker = async (batchSize = 10): Promise<void> => {
  try {
    if (typeof supabase?.functions?.invoke !== 'function') return;
    await supabase.functions.invoke('process-email-queue', { body: { batchSize } });
  } catch (err) {
    console.warn('Non-blocking background worker trigger notice:', err);
  }
};
