# SOS — no silent failures

Every failure the Travel Desk can detect is recorded in `public.sos_alerts` and
pushed to the automation Slack channel. The rule is simple: **nothing fails
quietly**. A toast the user dismisses, a `console.error` nobody reads and a
`catch` that returns early are all failures somebody should hear about.

This document is the operator's view: where alerts go, what is watched, how to
change it, and what to do when the channel itself goes quiet.

---

## The shape of it

```
   browser            queue worker          database sweep
  raiseSos()           sos({...})          scan_sos_health()
       \                   |                     /
        \                  v                    /
         ----------> raise_sos_alert() <--------
                            |
              records in public.sos_alerts  (always)
                            |
                   notification rules
                            |
                   email_queue -> Slack channel address
```

| Piece | Where | What it does |
| --- | --- | --- |
| Catalogue | `utils/sos/catalog.ts` | Every failure code: area, severity, what it means, what to check first. |
| Rules | `utils/sos/alertRules.ts` | Dedupe, severity floor, muted areas, daily cap, message formatting. |
| Client | `utils/sos/raiseSos.ts` | `raiseSos` / `reportSos`, plus the global `error` and `unhandledrejection` handlers. |
| Console | `components/SOSView.tsx` | The **SOS** screen: feed, triage, settings, monitored-failure reference. |
| Database | `supabase/migrations/20261010090000_sos_alert_system.sql` | Tables, `raise_sos_alert()`, the recipient-guard exemption, the hourly sweep. |
| Worker | `supabase/functions/process-email-queue/index.ts` | Reports transport failures the browser can never see. |

**Recording and notifying are separate.** An alert that is muted, folded into a
repeat, below the severity floor, or lost because the email system was the thing
that broke is still in the console. The channel is a notification; the console
is the record.

---

## Where alerts go

Alerts are posted into `#alert-team-automation` by **email**, through the Slack
channel's own address:

```
alert-team-automation-aaaawk4tlokditwloipugpaleq@navgurukul.slack.com
```

(Slack → channel → Integrations → *Send emails to this channel*.)

That needs no credentials and no app install, and it reuses the transport the
desk already runs. The cost is honest and worth stating: **mail-delivered alerts
travel through the email system they most often report on.** Two things follow,
both deliberate:

1. Every alert is recorded regardless of delivery, and an alert whose Slack mail
   failed shows as **Not delivered** in the console with the reason.
2. A **Slack incoming webhook** can be configured in SOS → Settings. When set,
   `raise_sos_alert()` posts to it directly (via `pg_net`) and never touches the
   email queue — the delivery path that survives an email outage. If `pg_net` is
   not enabled, or the post fails, it falls back to the channel address rather
   than losing the alert; if there is no channel address either, the alert is
   marked **Not delivered** instead of pretending it went out.

If both SMTP accounts are down, the console and the webhook are how you find
out. That is why the console exists.

---

## What is watched

The console renders the live catalogue under **Monitored Failures**; the summary
below is the shape of it.

| Area | Examples |
| --- | --- |
| **Email transport** | SMTP account auto-promoted after repeated failures; a slot rejecting sends; both accounts at their daily quota; active slot with no credentials; cross-provider fallback; provider misconfigured. |
| **Email delivery** | A queued mail abandoned after its final attempt; the queue stuck or backlogged; rows stranded in `Processing`; the worker crashing or unreachable; a notification that could not be queued at all; recipients stripped by the guard; a missing or unreadable template. |
| **Request workflow** | A request update that did not save; a write silently filtered out by row-level security; an approved request that failed to auto-advance; assignment failure; **a completed booking that failed to record**; a cancellation that did not save. |
| **Finance** | **An advance deduction that did not post**; balances that failed to load; a settlement that did not persist. |
| **Sign-in** | Sign-in failing at the identity provider; a signed-in user with no loadable profile. |
| **Documents** | An upload that failed; a stored document that cannot be opened; a verification decision that did not save. |
| **Data, config** | Core data that failed to load; analytics that failed to compute; settings, policy and template saves that did not persist. |
| **Scheduled jobs** | A pg_cron run that failed; an expected job that is not registered; the overnight auto-close sweep that has stopped running. |
| **Platform** | Uncaught browser errors and unhandled rejections; the database unreachable; an SOS that could not be pushed. |

The example the system was built around: **Account B is active, starts failing,
and the worker promotes Account A.** The desk's sending identity changes with no
human involved — `SMTP_FAILOVER_PROMOTED`, critical, with the demoted slot, the
error, the failure count and today's usage attached.

---

## How noise is controlled

| Control | Default | Where |
| --- | --- | --- |
| Severity floor | `warning` and above are pushed | SOS → Settings |
| Repeat window | 30 minutes — repeats fold into the existing alert, count up, and do not re-notify | SOS → Settings |
| Muted areas | none | SOS → Settings |
| Daily push cap | 200 per IST day | SOS → Settings |
| Per-account rate limit | 30 alerts/minute from one account | `raise_sos_alert()` |
| Client throttle | 15 seconds per fingerprint, per tab | `raiseSos.ts` |

A repeat raised *after* the window opens a fresh alert, so a problem that comes
back after being quiet pages again instead of hiding inside an old row.

---

## Triage

Staff (Admin, PNC Admin, PNC, Finance) can read the feed. Admin and PNC Admin
can **Acknowledge** ("seen, working on it"), **Resolve** (with an optional note
of what fixed it) and **Reopen**. Resolved alerts older than 90 days are purged
by `purge_sos_alerts()`; open alerts are never purged, whatever their age.

Each alert carries its catalogue entry — *why it matters* and *first check* —
plus the raw context it was raised with, so a reader does not need the code to
act on it.

---

## Adding a new alert

1. Add the code to `SOS_CODES` in `utils/sos/catalog.ts` — area, severity, what
   it means, the first thing to check.
2. Raise it from the failing path:

   ```ts
   catch (err) {
     reportSos('BOOKING_RECORD_FAILED', err, { ticketId: request.id });
     toast.error('…');
   }
   ```

   From the queue worker, use the `sos({ … })` reporter in the edge function.
   From SQL, `PERFORM public.raise_sos_alert(…)`.

Nothing else needs changing: the console, the Slack message and the per-area
settings are all driven off the catalogue. `tests/sosCatalog.test.ts` keeps the
entries well-formed.

---

## The hourly sweep

`scan_sos_health()` runs at **:17 past the hour** (pg_cron job `sos-health-sweep`)
and looks for failures that have nobody to report them:

* mail due for delivery and still unsent (default: 45 minutes)
* a queue backlog above the ceiling (default: 250)
* rows claimed by a worker and never finished (default: 30 minutes)
* a run of abandoned sends in the last two hours
* both SMTP accounts at their daily cap
* the overnight auto-close sweep not having run for 36 hours
* pg_cron jobs that failed, or an expected job that is not registered

Thresholds live in `sos_settings.health_thresholds`. Like the auto-close sweep,
the schedule is guarded on pg_cron: if the extension is off, the migration says
so and skips scheduling rather than failing.

---

## When the channel goes quiet

1. Open **SOS** in the sidebar — the feed is independent of delivery.
2. Check the **Undelivered** figure. Non-zero means alerts were recorded but
   their Slack mail did not leave: look at Email Center → Provider.
3. Each alert mail links straight back to the console (`/?tab=sos`), so a
   reader in Slack lands on the record rather than the dashboard.
4. Press **Send Test Alert**. It is raised at the configured severity floor, so
   it exercises the real delivery path rather than being filtered out by the
   threshold it is meant to verify.
5. If email is the problem, configure a Slack webhook so alerting stops
   depending on it.
