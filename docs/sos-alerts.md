# SOS & desk notifications

Two Slack streams, one place to configure them:

| Stream | Carries | Settings key |
| --- | --- | --- |
| **SOS** (`alerting`) | Every failure the system can detect. | `sos_settings.alerting` |
| **Notifications** (`notifications`) | Request traffic and the end-of-day desk report. | `sos_settings.notifications` |

Both are configured on the **SOS** screen, which is **Admin only** — not PNC
Admin, not PNC, not Finance. Row-level security enforces that, so a narrower
role sees an empty feed rather than a partial one.

Both streams start on the same Slack channel address. Splitting them when the
SLA channel exists is a settings change, not a deployment.

The rule behind all of it: **nothing fails quietly, and nothing happens on the
desk that the channel does not hear about.**

---

## Where messages go

Each stream takes a **list of addresses** — one per line in the console. Mail
sent to a Slack channel address is posted into that channel (Slack → channel →
Integrations → *Send emails to this channel*), which needs no credentials and no
app install.

The honest caveat: mail-delivered alerts travel through the email system they
most often report on. So:

1. Every alert is recorded in `sos_alerts` whether or not it was delivered. One
   whose Slack mail failed shows as **Not delivered**, with the reason.
2. A **Slack webhook** on the SOS stream is posted directly from the database
   through `pg_net` and never touches the email queue — the path that survives
   an email outage. If `pg_net` is off or the post fails, it falls back to the
   channel addresses; with neither available the alert is marked **Not
   delivered** rather than pretending it went out.

The digest's PDF is only ever delivered by mail — a webhook cannot carry a file.

---

## The message format

Every message is a compact block: a heading line, then one fact per line as
`key=value`. It scans in a second and splits cleanly if anything downstream
wants to parse it. No prose, no cards.

**An SOS**

```
SOS · CRITICAL · SMTP_FAILOVER_PROMOTED
Account B failed 3 consecutive non-transient sends; Account A promoted.
area=email_transport  src=worker  at=10 Oct 21:52 IST
demoted=smtp2  failures=3  promoted=smtp  usageToday.smtp=120  usageToday.smtp2=1999
open: https://travel.navgurukul.org/?tab=sos
```

**A request**

```
REQUEST · TRV-O-261010-001 · Approval Pending
who=Priya Sharma  dept=Tech  campus=Pune
trip=Pune -> Bengaluru  date=20 Oct  mode=Flight  type=One-way
priority=High  travellers=1  manager=manager@navgurukul.org  owner=unassigned
open: https://travel.navgurukul.org/?tab=requests
```

**The digest**

```
DESK DIGEST · 10 Oct 2026 (IST)
raised=12  booked=1  closed=0  cancelled=0
open=15  assigned=10  unassigned=5  claimed=10
moved=12  stalled=3  oldest_open=168h
owners: Ravi Kumar=5  Asha Nair=5
unassigned: TRV-O-261010-004(168h) TRV-O-261010-013(12h) TRV-O-261010-010(9h)
stalled: TRV-O-261010-012(144h) TRV-O-261010-008(144h)
report: attached (PDF)
open: https://travel.navgurukul.org/?tab=all-requests
```

Subjects carry the same structure, because Slack shows the subject as the
message title: `🚨 CRITICAL · SMTP_FAILOVER_PROMOTED · …`, `🆕 TRV-O-261010-001 ·
Pune -> Bengaluru · 20 Oct`, `📊 Desk digest · 10 Oct 2026 · raised 12 ·
unassigned 5 · stalled 3`.

---

## Request traffic

Every request raised fires `trg_notify_new_request`, which posts the block
above. It is guarded by **Ping on every request** in the console, and it can
never fail the insert: if the queue refuses the ping, the request is still
created and the failure is raised as an SOS.

---

## The daily report

`send_desk_digest()` runs on a pg_cron job (`desk-daily-digest`) at **19:30 IST**
and posts the summary with the full breakdown attached as a PDF:

* **Summary** — raised, booked, closed, cancelled, open, assigned, unassigned,
  claimed, moved, stalled, oldest open.
* **Unassigned** — every open request nobody owns, with its age.
* **Stalled** — open requests with no movement for longer than the configured
  window (48h by default).
* **Desk load by owner** — who is holding what.
* **Raised in this window** — each new request with requester, trip and owner.
* **Movement in this window** — every status change, who made it and when.

The data is assembled by `build_desk_digest()`; the queue row carries it in
`email_queue.report_payload`, and the worker renders the PDF at send time.
The console's **Download report** button renders the same document in the
browser from the same code (`utils/report/pdfBuilder.ts` and
`utils/desk/digest.ts`, mirrored into the worker — `tests/mirroredReportBuilder.test.ts`
fails if the copies drift).

**To change the time**, edit the cron expression in
`supabase/migrations/20261010120000_desk_notifications_and_digest.sql` and
re-run it; the job is replaced by name. pg_cron runs on UTC, so 19:30 IST is
`0 14 * * *`.

---

## What is watched by SOS

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
| **Platform** | Uncaught browser errors and unhandled rejections; the database unreachable; an SOS that could not be pushed; a request ping that could not be queued; a report that failed to render. |

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

Admin can **Acknowledge** ("seen, working on it"), **Resolve** (with an optional
note of what fixed it) and **Reopen**. Resolved alerts older than 90 days are
purged by `purge_sos_alerts()`; open alerts are never purged, whatever their age.

Each alert carries its catalogue entry — *why it matters* and *first check* —
plus the raw context and the exact message the channel was sent.

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
3. Each alert mail links straight back to the console (`/?tab=sos`), so a reader
   in Slack lands on the record rather than the dashboard.
4. Press **Send Test Alert**. It is raised at the configured severity floor, so
   it exercises the real delivery path rather than being filtered out by the
   threshold it is meant to verify.
5. If email is the problem, configure a Slack webhook so alerting stops
   depending on it.
