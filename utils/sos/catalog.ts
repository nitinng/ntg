/**
 * The catalogue of failures the Travel Desk knows how to shout about.
 *
 * Every entry here is a real failure path that exists in this repository —
 * a `catch` that used to end in `console.error`, a queue row that can reach
 * `Failed`, a cron job that can stop running, an SMTP account that can be
 * demoted mid-send. The rule the desk now runs on is "no silent failures":
 * if one of these fires, an SOS is recorded in `public.sos_alerts` and pushed
 * to the automation Slack channel.
 *
 * The catalogue is the contract between the three places that raise alerts —
 * the browser (`raiseSos`), the Deno queue worker, and the database health
 * sweep — so all three agree on what a code means, how loud it is, and what
 * the on-call reader should do about it. `tests/sosCatalog.test.ts` keeps the
 * shapes honest, and the SOS console renders this list as the "what is
 * monitored" reference so the table in the UI can never drift from the code.
 *
 * Adding a failure: add the code here first, then raise it from the failing
 * path. Nothing else needs to change — the console, the Slack message and the
 * per-category settings are all driven off this table.
 */

/** How loud an alert is. Ordered; see `SEVERITY_RANK` in `alertRules`. */
export type SosSeverity = 'critical' | 'high' | 'warning' | 'info';

/**
 * The subsystem a failure belongs to. Alerting can be muted per category from
 * the SOS console, which is why these are coarse: a reader silences "meetup
 * noise", never one individual code.
 */
export type SosCategory =
  | 'email_transport'
  | 'email_delivery'
  | 'workflow'
  | 'finance'
  | 'auth'
  | 'storage'
  | 'data'
  | 'config'
  | 'scheduler'
  | 'platform';

/** Where the alert was raised from. */
export type SosSource = 'web' | 'worker' | 'database';

export interface SosCodeSpec {
  /** Stable machine key. Never renamed — history and dedupe hang off it. */
  code: string;
  category: SosCategory;
  /** Default loudness. A caller may raise it (never silently lower it). */
  severity: SosSeverity;
  /** One line, written to be read on a phone at 11pm. */
  title: string;
  /** What actually broke, in the reader's terms. */
  meaning: string;
  /** The first thing the on-call reader should check. */
  firstCheck: string;
  /** Where in the system it is raised from. */
  raisedBy: SosSource[];
}

export const SOS_CATEGORY_LABELS: Record<SosCategory, string> = {
  email_transport: 'Email Transport',
  email_delivery: 'Email Delivery',
  workflow: 'Request Workflow',
  finance: 'Finance & Advances',
  auth: 'Sign-in & Identity',
  storage: 'Documents & Storage',
  data: 'Data Loading',
  config: 'Configuration',
  scheduler: 'Scheduled Jobs',
  platform: 'Platform & Client'
};

export const SOS_SEVERITY_LABELS: Record<SosSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  warning: 'Warning',
  info: 'Info'
};

/**
 * Emoji prefix for the Slack line. Slack renders the channel-email body, so
 * the severity has to be legible in the first three characters of the subject.
 */
export const SOS_SEVERITY_ICONS: Record<SosSeverity, string> = {
  critical: '🚨',
  high: '🔴',
  warning: '🟠',
  info: '🔵'
};

const spec = (s: SosCodeSpec): SosCodeSpec => s;

/**
 * Every monitored failure, grouped by the subsystem that owns it.
 */
export const SOS_CODES: Record<string, SosCodeSpec> = {
  // ---------------------------------------------------------------------------
  // Email transport — the SMTP accounts themselves
  // ---------------------------------------------------------------------------
  SMTP_FAILOVER_PROMOTED: spec({
    code: 'SMTP_FAILOVER_PROMOTED',
    category: 'email_transport',
    severity: 'critical',
    title: 'SMTP account auto-promoted after repeated failures',
    meaning:
      'The active SMTP account failed its configured run of consecutive non-transient sends, so the worker promoted the backup account and is now sending as a different identity.',
    firstCheck:
      'Email Center → Provider: check the demoted account for an expired Google App Password, a revoked account, or a Workspace policy change. Mail is flowing on the backup until then.',
    raisedBy: ['worker']
  }),
  SMTP_SLOT_SEND_FAILED: spec({
    code: 'SMTP_SLOT_SEND_FAILED',
    category: 'email_transport',
    severity: 'high',
    title: 'SMTP account rejected a send and the backup took over',
    meaning:
      'A send failed on the account it was routed to. The worker retried the same mail on the other account immediately; this is the warning before a promotion.',
    firstCheck:
      'Read the SMTP error in the alert context. Three of these in a row on the same account trigger an automatic promotion.',
    raisedBy: ['worker']
  }),
  SMTP_QUOTA_EXHAUSTED: spec({
    code: 'SMTP_QUOTA_EXHAUSTED',
    category: 'email_transport',
    severity: 'critical',
    title: 'Both SMTP accounts have spent their daily quota',
    meaning:
      'Neither account can send again until the quota rolls over at IST midnight. Queued mail is held, not failed — but nothing leaves the desk until then.',
    firstCheck:
      'Email Center → Quota. If the volume is legitimate, add capacity (a third identity or SES); if it is a loop, find what is queueing in bulk.',
    raisedBy: ['worker']
  }),
  SMTP_SLOT_UNCONFIGURED: spec({
    code: 'SMTP_SLOT_UNCONFIGURED',
    category: 'email_transport',
    severity: 'high',
    title: 'Active SMTP account has no usable credentials',
    meaning:
      'The account marked active is missing a host, username or password, so routing silently fell through to the other slot.',
    firstCheck:
      'Email Center → Provider → the active slot. Credentials are blanked by the credential scrub migration on a fresh environment and have to be re-entered.',
    raisedBy: ['worker', 'web']
  }),
  EMAIL_PROVIDER_FALLBACK: spec({
    code: 'EMAIL_PROVIDER_FALLBACK',
    category: 'email_transport',
    severity: 'high',
    title: 'Outbound mail fell back to a secondary provider',
    meaning:
      'Both SMTP accounts refused the send, so the worker delivered it through the configured fallback transport (SES, Gmail API or Resend) instead.',
    firstCheck:
      'The mail went out, but not as the usual identity — check SPF/DKIM alignment for the fallback and fix the primary transport.',
    raisedBy: ['worker']
  }),
  EMAIL_PROVIDER_MISCONFIGURED: spec({
    code: 'EMAIL_PROVIDER_MISCONFIGURED',
    category: 'email_transport',
    severity: 'critical',
    title: 'Selected email provider is missing its configuration',
    meaning:
      'The active provider was selected in settings but its credentials or edge-function secrets are absent, so the worker cannot construct a transport at all.',
    firstCheck:
      'Email Center → Provider, and the edge function secrets (GMAIL_USER, SES_SMTP_USERNAME, RESEND_API_KEY) for the provider named in the context.',
    raisedBy: ['worker', 'web']
  }),
  EMAIL_CONNECTION_TEST_FAILED: spec({
    code: 'EMAIL_CONNECTION_TEST_FAILED',
    category: 'email_transport',
    severity: 'warning',
    title: 'Provider connection test failed',
    meaning:
      'An administrator ran Test Connection from the Email Center and the handshake did not complete.',
    firstCheck:
      'Usually credentials or a blocked port. The error text from the provider is in the alert context.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Email delivery — the queue and the worker that drains it
  // ---------------------------------------------------------------------------
  EMAIL_SEND_PERMANENT_FAILURE: spec({
    code: 'EMAIL_SEND_PERMANENT_FAILURE',
    category: 'email_delivery',
    severity: 'high',
    title: 'A queued email was abandoned after its final attempt',
    meaning:
      'The row is now Failed. Nobody will retry it, so whoever was supposed to be told about that request has not been told.',
    firstCheck:
      'Email Center → Delivery, filter Failed. A bad recipient address is a data fix; a transport error is an SMTP fix plus a requeue.',
    raisedBy: ['worker', 'database']
  }),
  EMAIL_QUEUE_STUCK: spec({
    code: 'EMAIL_QUEUE_STUCK',
    category: 'email_delivery',
    severity: 'critical',
    title: 'Mail has been sitting in the queue unsent',
    meaning:
      'Pending rows are older than the health threshold, which means the worker is not draining the queue — the usual cause is that nothing is invoking it.',
    firstCheck:
      'Invoke process-email-queue manually from the Email Center. If that drains it, the scheduled invocation is what broke.',
    raisedBy: ['database']
  }),
  EMAIL_QUEUE_BACKLOG: spec({
    code: 'EMAIL_QUEUE_BACKLOG',
    category: 'email_delivery',
    severity: 'high',
    title: 'Email queue backlog above the safe threshold',
    meaning:
      'The queue is growing faster than it drains. Mail is still moving, but the desk is behind and recipients are getting stale notifications.',
    firstCheck:
      'Check whether a bulk action (a sweep, a resend, a loop) queued the backlog, and whether quota is the real ceiling.',
    raisedBy: ['database']
  }),
  EMAIL_QUEUE_STALE_PROCESSING: spec({
    code: 'EMAIL_QUEUE_STALE_PROCESSING',
    category: 'email_delivery',
    severity: 'high',
    title: 'Queue rows stranded in Processing',
    meaning:
      'A worker claimed these rows and never came back — it timed out or crashed mid-send. They are reclaimed automatically, but a send may have gone out twice or not at all.',
    firstCheck:
      'Look for a worker crash alert at the same timestamp, and check the provider for duplicates of the stranded subjects.',
    raisedBy: ['database']
  }),
  EMAIL_QUEUE_POLL_FAILED: spec({
    code: 'EMAIL_QUEUE_POLL_FAILED',
    category: 'email_delivery',
    severity: 'high',
    title: 'Worker could not read the email queue',
    meaning:
      'The worker started but its query against email_queue errored, so this run sent nothing at all.',
    firstCheck:
      'Database availability, and the service-role key the edge function runs with.',
    raisedBy: ['worker']
  }),
  EMAIL_WORKER_CRASHED: spec({
    code: 'EMAIL_WORKER_CRASHED',
    category: 'email_delivery',
    severity: 'critical',
    title: 'Email worker crashed mid-run',
    meaning:
      'The edge function threw before finishing its batch. Anything it had claimed is stranded in Processing until the stale-claim window expires.',
    firstCheck:
      'The exception in the alert context, then the edge function logs for the same minute.',
    raisedBy: ['worker']
  }),
  EMAIL_WORKER_UNREACHABLE: spec({
    code: 'EMAIL_WORKER_UNREACHABLE',
    category: 'email_delivery',
    severity: 'high',
    title: 'App could not reach the email worker',
    meaning:
      'The browser queued a mail but the call that nudges the worker to drain it failed, so delivery waits for the next scheduled run.',
    firstCheck:
      'Edge function deployment status and the caller session — the invoke is authenticated and fails for a signed-out user.',
    raisedBy: ['web']
  }),
  EMAIL_ENQUEUE_FAILED: spec({
    code: 'EMAIL_ENQUEUE_FAILED',
    category: 'email_delivery',
    severity: 'high',
    title: 'A notification could not be queued',
    meaning:
      'The insert into email_queue was rejected, so the mail does not exist anywhere. Lifecycle mail is non-blocking by design, which is exactly why this would otherwise be invisible.',
    firstCheck:
      'The database error in the context. A permission error points at the recipient guard; a constraint error at the payload.',
    raisedBy: ['web']
  }),
  EMAIL_RECIPIENTS_BLOCKED: spec({
    code: 'EMAIL_RECIPIENTS_BLOCKED',
    category: 'email_delivery',
    severity: 'high',
    title: 'Recipient guard stripped every address off a mail',
    meaning:
      'The server-side allow-list found none of the requested recipients legitimate for that ticket and refused the row. Either the request data is wrong or someone is trying to relay through the desk.',
    firstCheck:
      'The ticket and the attempted recipients in the context. Genuine addresses mean the ticket is missing its requester or manager email.',
    raisedBy: ['web']
  }),
  EMAIL_TEMPLATE_MISSING: spec({
    code: 'EMAIL_TEMPLATE_MISSING',
    category: 'email_delivery',
    severity: 'warning',
    title: 'No active template for a lifecycle event',
    meaning:
      'An event fired with no active, non-draft template for its audience, so no mail was composed and the recipient heard nothing.',
    firstCheck:
      'Email Center → Templates: the event/audience pair in the context is missing, inactive or still a draft.',
    raisedBy: ['web']
  }),
  EMAIL_TEMPLATE_FALLBACK: spec({
    code: 'EMAIL_TEMPLATE_FALLBACK',
    category: 'email_delivery',
    severity: 'warning',
    title: 'Templates unreadable — bundled fallback copy in use',
    meaning:
      'The app could not read mail_templates and fell back to the copy compiled into the bundle. Mail still sends, but edits made in the Email Center are not being applied.',
    firstCheck:
      'Table availability and the staff read policy on mail_templates.',
    raisedBy: ['web']
  }),
  EMAIL_ROUTING_CONFIG_FALLBACK: spec({
    code: 'EMAIL_ROUTING_CONFIG_FALLBACK',
    category: 'email_delivery',
    severity: 'warning',
    title: 'Email routing settings unreadable — defaults in use',
    meaning:
      'Queue addresses, CC lists and the support address could not be read, so hardcoded defaults were used. Mail may be reaching the wrong desk.',
    firstCheck: 'email_routing_settings and its staff read policy.',
    raisedBy: ['web']
  }),
  EMAIL_TICKET_ATTACHMENT_FAILED: spec({
    code: 'EMAIL_TICKET_ATTACHMENT_FAILED',
    category: 'email_delivery',
    severity: 'warning',
    title: 'Ticket file could not be attached to a mail',
    meaning:
      'The mail went out without the ticket the traveller was promised, because the stored file could not be signed or fetched.',
    firstCheck: 'The storage object for that request, and the bucket policy.',
    raisedBy: ['worker']
  }),
  EMAIL_AUDIT_LOG_FAILED: spec({
    code: 'EMAIL_AUDIT_LOG_FAILED',
    category: 'email_delivery',
    severity: 'info',
    title: 'Email audit entry not recorded',
    meaning:
      'The action completed but its audit row did not write, leaving a gap in the trail rather than in the behaviour.',
    firstCheck: 'email_audit_logs write policy for the acting role.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Request workflow
  // ---------------------------------------------------------------------------
  REQUEST_UPDATE_FAILED: spec({
    code: 'REQUEST_UPDATE_FAILED',
    category: 'workflow',
    severity: 'high',
    title: 'A travel request update did not save',
    meaning:
      'A desk action — status change, booking detail, note — was rejected by the database. The screen said so, but nobody downstream knows the request is stuck.',
    firstCheck: 'The error in the context; most are row-level security refusing the write for that role.',
    raisedBy: ['web']
  }),
  STATUS_TRANSITION_BLOCKED: spec({
    code: 'STATUS_TRANSITION_BLOCKED',
    category: 'workflow',
    severity: 'high',
    title: 'A write was silently filtered out by row-level security',
    meaning:
      'The statement ran and matched no rows — the record exists but this account may not change it, or it has moved past the state that allows the change.',
    firstCheck: 'The acting role against the policy named in the context.',
    raisedBy: ['web']
  }),
  AUTO_ADVANCE_FAILED: spec({
    code: 'AUTO_ADVANCE_FAILED',
    category: 'workflow',
    severity: 'high',
    title: 'Approved request did not auto-advance to Processing',
    meaning:
      'The manager approval saved but the follow-on move to Processing did not, so the request is sitting in a state the desk queue does not pick up.',
    firstCheck: 'Reopen the request and move it on by hand; then read the error in the context.',
    raisedBy: ['web']
  }),
  ASSIGNMENT_FAILED: spec({
    code: 'ASSIGNMENT_FAILED',
    category: 'workflow',
    severity: 'high',
    title: 'Request could not be assigned to a desk member',
    meaning:
      'Auto-assignment failed, so the request is unowned and will age in the queue with no one accountable for it.',
    firstCheck: 'Whether any PNC accounts are available for assignment, then the error in the context.',
    raisedBy: ['web']
  }),
  BOOKING_RECORD_FAILED: spec({
    code: 'BOOKING_RECORD_FAILED',
    category: 'workflow',
    severity: 'critical',
    title: 'A completed booking failed to record',
    meaning:
      'The booking may already exist with the vendor while the desk has no record of it — the most expensive silent failure in the system.',
    firstCheck:
      'Confirm with the vendor before re-booking. The attempted payload is in the alert context.',
    raisedBy: ['web']
  }),
  CANCELLATION_FAILED: spec({
    code: 'CANCELLATION_FAILED',
    category: 'workflow',
    severity: 'high',
    title: 'A cancellation action did not save',
    meaning:
      'A cancellation request, approval or refund entry was rejected, so the traveller and the desk now disagree about the state of the trip.',
    firstCheck: 'The cancellation queue for that request, and the error in the context.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Finance
  // ---------------------------------------------------------------------------
  ADVANCE_DEDUCTION_FAILED: spec({
    code: 'ADVANCE_DEDUCTION_FAILED',
    category: 'finance',
    severity: 'critical',
    title: 'Advance deduction did not post',
    meaning:
      'A booking consumed an advance but the deduction did not write, so the employee’s outstanding balance is overstated and settlement will be wrong.',
    firstCheck: 'Advances → the employee in the context; reconcile the balance against the booking by hand.',
    raisedBy: ['web']
  }),
  ADVANCE_FETCH_FAILED: spec({
    code: 'ADVANCE_FETCH_FAILED',
    category: 'finance',
    severity: 'warning',
    title: 'Advance balances could not be loaded',
    meaning:
      'The screen rendered without advance data, so the desk may book against a balance it cannot see.',
    firstCheck: 'The advances table and its read policy for the acting role.',
    raisedBy: ['web']
  }),
  SETTLEMENT_WRITE_FAILED: spec({
    code: 'SETTLEMENT_WRITE_FAILED',
    category: 'finance',
    severity: 'high',
    title: 'Settlement entry did not save',
    meaning:
      'A settlement was calculated and accepted in the UI but not persisted, leaving the advance open.',
    firstCheck: 'Re-run the settlement; if it fails again, read the error in the context.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Sign-in and identity
  // ---------------------------------------------------------------------------
  AUTH_PROVIDER_FAILED: spec({
    code: 'AUTH_PROVIDER_FAILED',
    category: 'auth',
    severity: 'high',
    title: 'Sign-in failed at the identity provider',
    meaning:
      'Google or email sign-in returned an error. One is a user problem; a run of them is an outage nobody can report, because nobody can log in.',
    firstCheck: 'Supabase Auth settings, the OAuth client, and the allowed redirect URLs.',
    raisedBy: ['web']
  }),
  PROFILE_LOAD_FAILED: spec({
    code: 'PROFILE_LOAD_FAILED',
    category: 'auth',
    severity: 'high',
    title: 'Signed-in user has no loadable profile',
    meaning:
      'Authentication succeeded but the profile row could not be read, so the app cannot resolve a role and the user is stranded on a loading screen.',
    firstCheck: 'The profiles row for the user in the context, and the self-read policy.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Documents and storage
  // ---------------------------------------------------------------------------
  DOCUMENT_UPLOAD_FAILED: spec({
    code: 'DOCUMENT_UPLOAD_FAILED',
    category: 'storage',
    severity: 'high',
    title: 'A document upload failed',
    meaning:
      'An ID proof, passport photo, invoice or ticket did not reach storage, so verification or reimbursement is blocked on a file that is not there.',
    firstCheck: 'Bucket policy and size limits; the bucket and path are in the context.',
    raisedBy: ['web']
  }),
  SIGNED_URL_FAILED: spec({
    code: 'SIGNED_URL_FAILED',
    category: 'storage',
    severity: 'warning',
    title: 'Stored document could not be opened',
    meaning:
      'A signed URL could not be minted, so a document that exists cannot be viewed — verification queues stall on this.',
    firstCheck: 'The object path in the context against the private bucket policy.',
    raisedBy: ['web']
  }),
  VERIFICATION_UPDATE_FAILED: spec({
    code: 'VERIFICATION_UPDATE_FAILED',
    category: 'storage',
    severity: 'high',
    title: 'Verification decision did not save',
    meaning:
      'An approve/reject on a document was not recorded, so the employee stays blocked and the queue shows work that was already done.',
    firstCheck: 'The profile write policy for the acting role.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  DATA_LOAD_FAILED: spec({
    code: 'DATA_LOAD_FAILED',
    category: 'data',
    severity: 'high',
    title: 'Core application data failed to load',
    meaning:
      'Requests, users or departments could not be fetched, so the screen is rendering an empty or partial world.',
    firstCheck: 'Database reachability first, then the read policy for the acting role.',
    raisedBy: ['web']
  }),
  ANALYTICS_LOAD_FAILED: spec({
    code: 'ANALYTICS_LOAD_FAILED',
    category: 'data',
    severity: 'warning',
    title: 'Analytics or dashboard metrics failed to load',
    meaning:
      'Reporting figures could not be computed. Operations are unaffected, but the numbers on screen are not to be trusted.',
    firstCheck: 'The failing query in the context.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------
  SETTINGS_SAVE_FAILED: spec({
    code: 'SETTINGS_SAVE_FAILED',
    category: 'config',
    severity: 'high',
    title: 'A settings change did not persist',
    meaning:
      'Policy, feature-flag, routing or department configuration was accepted in the UI but not stored, so the system is still running the old rules.',
    firstCheck: 'Reload the screen to see which value actually survived, then read the error in the context.',
    raisedBy: ['web']
  }),
  TEMPLATE_SAVE_FAILED: spec({
    code: 'TEMPLATE_SAVE_FAILED',
    category: 'config',
    severity: 'high',
    title: 'A mail template edit did not save',
    meaning:
      'The editor reported success paths elsewhere, but the template row did not change — outgoing mail still carries the old copy.',
    firstCheck: 'mail_templates write policy and the template key in the context.',
    raisedBy: ['web']
  }),

  // ---------------------------------------------------------------------------
  // Scheduled jobs
  // ---------------------------------------------------------------------------
  CRON_JOB_FAILED: spec({
    code: 'CRON_JOB_FAILED',
    category: 'scheduler',
    severity: 'critical',
    title: 'A scheduled database job failed',
    meaning:
      'A pg_cron run ended in failure. Scheduled work — the auto-close sweep, reminder scans, this health sweep — did not happen and nothing retries it.',
    firstCheck: 'cron.job_run_details for the job named in the context.',
    raisedBy: ['database']
  }),
  CRON_JOB_MISSING: spec({
    code: 'CRON_JOB_MISSING',
    category: 'scheduler',
    severity: 'high',
    title: 'An expected scheduled job is not registered',
    meaning:
      'A job the system depends on is absent from the scheduler — usually because pg_cron was not enabled when its migration ran, so it was skipped with a notice.',
    firstCheck: 'Enable pg_cron under Database → Extensions and re-run the scheduling migration.',
    raisedBy: ['database']
  }),
  AUTO_CLOSE_SWEEP_STALLED: spec({
    code: 'AUTO_CLOSE_SWEEP_STALLED',
    category: 'scheduler',
    severity: 'high',
    title: 'Overnight auto-close sweep has not run',
    meaning:
      'Completed trips are not being closed, so requests accumulate in the desk queue and closure mail is not going out.',
    firstCheck: 'The auto-close-trips job in cron.job, then run scan_auto_close_trips() by hand.',
    raisedBy: ['database']
  }),

  // ---------------------------------------------------------------------------
  // Platform and client
  // ---------------------------------------------------------------------------
  CLIENT_UNCAUGHT_ERROR: spec({
    code: 'CLIENT_UNCAUGHT_ERROR',
    category: 'platform',
    severity: 'warning',
    title: 'Unhandled error in the browser',
    meaning:
      'A script error escaped every handler. The user saw a broken screen and, without this, nobody else ever would.',
    firstCheck: 'The stack and the route in the context; reproduce on the same screen.',
    raisedBy: ['web']
  }),
  CLIENT_UNHANDLED_REJECTION: spec({
    code: 'CLIENT_UNHANDLED_REJECTION',
    category: 'platform',
    severity: 'warning',
    title: 'Unhandled promise rejection in the browser',
    meaning:
      'An async operation failed with nothing awaiting it — typically a fire-and-forget write that quietly did not happen.',
    firstCheck: 'The reason in the context, and whichever background call it belongs to.',
    raisedBy: ['web']
  }),
  DATABASE_UNREACHABLE: spec({
    code: 'DATABASE_UNREACHABLE',
    category: 'platform',
    severity: 'critical',
    title: 'Database unreachable from the application',
    meaning:
      'Requests to Supabase are failing at the network level. Nothing in the desk works while this is true.',
    firstCheck: 'Supabase project status, then the proxy and DNS path described in supabaseClient.',
    raisedBy: ['web']
  }),
  SOS_NOTIFICATION_FAILED: spec({
    code: 'SOS_NOTIFICATION_FAILED',
    category: 'platform',
    severity: 'high',
    title: 'An SOS could not be pushed to Slack',
    meaning:
      'The alert was recorded but its Slack notification did not leave. Alerts delivered by email share the transport they often report on, which is exactly when this fires.',
    firstCheck:
      'Open the SOS console — every alert is there regardless of delivery. Configure the Slack webhook for a path that does not depend on email.',
    raisedBy: ['database', 'worker']
  }),
  DESK_NOTIFICATION_FAILED: spec({
    code: 'DESK_NOTIFICATION_FAILED',
    category: 'platform',
    severity: 'warning',
    title: 'A desk notification could not be queued',
    meaning:
      'A request was raised but the ping to the notifications channel was not queued, so the channel is missing traffic the desk thinks it announced.',
    firstCheck:
      'SOS → Settings: the notifications channel needs at least one address. The request itself was created normally.',
    raisedBy: ['database']
  }),
  DESK_REPORT_RENDER_FAILED: spec({
    code: 'DESK_REPORT_RENDER_FAILED',
    category: 'platform',
    severity: 'warning',
    title: 'Desk report could not be rendered',
    meaning:
      'The daily digest went out without its PDF. The headline numbers are in the message; the per-ticket breakdown is not.',
    firstCheck:
      'The error in the context, then re-send from SOS → Notifications → Send digest now.',
    raisedBy: ['worker']
  }),
  SOS_SELF_TEST: spec({
    code: 'SOS_SELF_TEST',
    category: 'platform',
    severity: 'info',
    title: 'SOS test alert',
    meaning: 'Someone pressed Send Test Alert in the SOS console. Nothing is wrong.',
    firstCheck: 'No action needed — this confirms the channel is wired up end to end.',
    raisedBy: ['web']
  })
};

export type SosCode = keyof typeof SOS_CODES;

/** Every code, ordered for display: loudest first, then by subsystem. */
export const SOS_CODE_LIST: SosCodeSpec[] = Object.values(SOS_CODES);

export const getSosSpec = (code: string): SosCodeSpec | undefined => SOS_CODES[code];

/** Codes grouped by category, for the "what is monitored" table. */
export const sosCodesByCategory = (): Array<{ category: SosCategory; label: string; codes: SosCodeSpec[] }> =>
  (Object.keys(SOS_CATEGORY_LABELS) as SosCategory[]).map(category => ({
    category,
    label: SOS_CATEGORY_LABELS[category],
    codes: SOS_CODE_LIST.filter(c => c.category === category)
  }));
