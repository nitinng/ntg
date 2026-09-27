# Travel Desk lifecycle emails

How the travel lifecycle mails are triggered, written and delivered, and how to change
them. Source of truth for the copy is **"Travel Desk Stages- mails - Triggers.xlsx"**,
Final tab.

> This supersedes the stage-keyed routine described in
> [`mail_sender_routine.md`](../mail_sender_routine.md), which documents the model used
> before this migration.

---

## Why the trigger key changed

Templates used to be keyed on the stage a request landed in, as
`status_trigger` + `audience`, with a unique index allowing one published template per
stage. The sheet breaks that in three ways:

- **Several rows reach the same stage and must say different things.** Rows 2, 12 and 18
  all land on *Approval Pending*: a first submission, a resubmission after a manager
  rejection, and a resubmission after a travel-desk rejection. Rows 33 and 37 both reach
  *Cancelled by Employee*, but one says nothing is owed and the other cannot, because a
  ticket was issued.
- **Some rows are not transitions at all.** Rows 26, 26b, 27 and 28 fire on elapsed time.
  Rows 29, 30 and 31 are self-loops on *Booked*, separated only by what changed.
- **One stage can be reached by opposite events.** *Reconciled* means "nothing was
  recoverable" from a cancellation and "reconciliation finished" from a refund stage.

So a template is now keyed on **`(event, audience, context_key)`**.

| Part | Meaning |
| --- | --- |
| `event` | A `TravelEvent` — what happened. |
| `audience` | `employee`, `manager`, `pnc`, `finance`, `escalation_owner`. |
| `context_key` | Nullable discriminator. `NULL` is the fallback for that pair. |

`from_status` and `to_status` are still stored, for the admin UI and for documentation.
**They are not used to select a template.**

Resolution, in `resolveTemplate()`:

1. exact `(event, audience, context_key)`
2. `(event, audience, NULL)`
3. nothing — and nothing is sent

Step 3 matters. Nineteen sheet rows deliberately send no mail; they must not fall back
to a generic "your request was updated". `SILENT_EVENTS` lists them and the test suite
asserts each one stays quiet.

---

## Where things live

| Concern | File |
| --- | --- |
| Events, stages, audiences, CC rules | [`types.ts`](../types.ts) |
| Trigger engine — resolution, recipients, CC, queueing | [`utils/emailTriggers.ts`](../utils/emailTriggers.ts) |
| Variable rendering | [`utils/emailQueueUtils.ts`](../utils/emailQueueUtils.ts) |
| Allowed stage transitions | [`utils/workflow.ts`](../utils/workflow.ts) |
| Routing settings validation | [`utils/emailRoutingValidation.ts`](../utils/emailRoutingValidation.ts) |
| Template admin UI | [`components/MailTemplatesView.tsx`](../components/MailTemplatesView.tsx) |
| Routing settings UI | [`components/EmailSettingsView.tsx`](../components/EmailSettingsView.tsx) |
| Outbox | [`components/SentMailsView.tsx`](../components/SentMailsView.tsx) |
| Delivery worker | [`supabase/functions/process-email-queue/`](../supabase/functions/process-email-queue/) |

### Migrations, in order

1. `20260927110000_travel_lifecycle_email_triggers.sql` — stages, the new template key,
   `email_routing_settings`, `email_reminder_log`, queue provenance columns. Also archives
   the four pre-migration templates, which carry no event and so can never be selected.
2. `20260927120000_seed_travel_lifecycle_mail_templates.sql` — the 40 templates.
   **Generated; do not edit by hand.**
3. `20260927130000_email_reminder_scan.sql` — the time-based scan and its schedule.

### Deploy the migrations first

The engine writes `event`, `audience`, `context_key` and `template_key` onto every queue
row, and selects templates by event. Against an unmigrated database every send fails the
insert and is logged and skipped — no mail goes out, and no stale copy goes out either.

That is deliberate: sending superseded wording silently is worse than sending nothing
loudly. But it does mean **migrations must land before the app code**, not after.

---

## Changing the copy

The sheet is the source of truth, so changes flow sheet → generator → migration:

1. Re-export the Final tab over `scripts/email-templates/final_rows.json`.
2. Adjust `scripts/email-templates/mapping.json` if a row's trigger, audience or CC rule
   changed.
3. Regenerate:

```bash
python scripts/email-templates/generate_seed.py
```

4. Run the tests — `tests/seedTemplates.test.ts` checks the result against the enums the
   engine resolves against, so a template with an unknown event or an unfillable
   variable fails here rather than going silent in production.

```bash
npm test
```

A one-off wording fix can also be made in **Mail Templates** in the app; it is versioned
and audited in `mail_template_history`. Note that re-running the generator will overwrite
it, so anything meant to last belongs in the sheet.

### Which column wins

The sheet has both `Email Template` and `Revised Email Template`. The revised column is
the source of truth and the original is the fallback. In the current export the revised
column is populated for 39 of the 40 templates.

**Row 33 is the exception**: it carries a subject but `Na` in both template columns, so
there was no copy to import. The body in `mapping.json` under `authored` was written to
the sheet's own brief for that row. It is the only body in the seed not taken from the
sheet and should be reviewed before go-live.

---

## Routing settings

The sheet names three parties it never defines: "system set defaults" for the standing
CC, Finance on the settlement mails, and an "Escalation Owner". These are configured in
**Email Routing** in the app rather than hardcoded, along with the SLA windows.

| Key | Default | Used by |
| --- | --- | --- |
| `default_cc` | `travel.team@navgurukul.org` | every mail with `cc_rule = default*` |
| `finance_cc` | `finance@navgurukul.org` | settlement mails; recipients of row 53 |
| `escalation_owners` | `pnc@navgurukul.org` | row 27 |
| `pnc_queue_cc` | *(empty)* | extra addresses on PNC mails |
| `support_email` | `travel.team@navgurukul.org` | `{{support_email}}` |
| `portal_url` | `https://travel.navgurukul.org` | every call-to-action button |
| `info_reminder_first_hours` | 24 | row 26 |
| `info_reminder_final_hours` | 72 | row 26b |
| `info_escalation_days` | 5 | row 27 |
| `info_expiry_days` | 7 | row 28 |
| `reminders_enabled` | true | master switch for the scan |

**The defaults are placeholders.** `finance@navgurukul.org` and `pnc@navgurukul.org` were
chosen to be obviously-shaped rather than correct — confirm them with the team before the
first production send.

CC rules are per template, so the addresses can change without touching copy:

| Rule | Behaviour |
| --- | --- |
| `default` | default CC |
| `default_finance` | default CC + Finance |
| `default_manager` | default CC + the approving manager |
| `default_manager_if_approved` | default CC, plus the manager only if they approved it (row 40) |
| `manager` | manager only (row 27) |
| `none` | no CC |

A direct recipient is never also CC'd.

---

## Time-based reminders

Rows 26, 26b, 27 and 28 fire on elapsed time, so nothing in the app can raise them. They
come from `scan_email_reminders()`, a Postgres function, scheduled hourly via `pg_cron`.

It runs in SQL rather than in the edge function so that it works with no browser open and
no additional deploy target. It renders only the eight variables those four templates use;
everything else is rendered client-side by `resolveTemplateVariables`.

Milestones are evaluated newest-first, so a request that blew through several windows
while the scan was down gets the correct one mail rather than a burst:

```
>= info_expiry_days      -> INFO_REQUEST_EXPIRED     + stage becomes "Cancelled by System"
>= info_escalation_days  -> INFO_REQUEST_ESCALATED   + stage becomes "On Hold / Escalated"
>= info_reminder_final   -> INFO_REQUEST_REMINDER_72H
>= info_reminder_first   -> INFO_REQUEST_REMINDER_24H
```

Each send is guarded by `email_reminder_log`, unique on
`(ticket_id, event, hold_started_at)`, so running the scan more often than the shortest
interval cannot double-send. A request that goes on hold a second time gets a fresh
`info_requested_at` and becomes eligible again.

Closure is attributed to **Cancelled by System**, not to the employee. The sheet calls
this out at row 28: recording an SLA closure as an employee cancellation would distort
cancellation reporting and the cancellation cost split.

### If pg_cron is unavailable

The migration is guarded and will log a notice instead of failing. Call the function from
any external scheduler, hourly:

```sql
SELECT public.scan_email_reminders();
```

---

## Delivery

Unchanged. The trigger engine writes to `email_queue`; the `process-email-queue` edge
function delivers via the Gmail API and handles retries and idempotency. Queue rows now
also carry `event`, `audience`, `context_key` and `template_key`, so a delivery in **Sent
Mails** can be traced back to a sheet row.

### Attachments

There are none. The sender builds a single-part HTML message and the queue has no
attachments column. Sheet row 22 was rewritten to link to the portal and say so
explicitly rather than promise a ticket that is not there — `tests/seedTemplates.test.ts`
asserts that wording stays.

### SMTP

Not implemented. The provider abstraction covers Gmail and SES, and only Gmail is wired
into the edge function. The AWS Mail Manager SMTP credentials that were shared cannot be
used with the SES API — an SMTP password is derived from an IAM secret one-way and is not
the secret itself — so using them needs a real SMTP client in the worker. See
*Known gaps*.

---

## Known gaps

1. **None of the SQL has been executed.** There is no local Postgres or Docker in the dev
   environment, so the three migrations are syntax-checked only (via the real Postgres
   parser). Run them against a branch database before production.
2. **Row 33's copy is authored, not imported.** See *Which column wins*.
3. **Routing defaults are placeholders.** See *Routing settings*.
4. **The refund tail has no UI.** The stages, transitions, events and templates exist and
   fire, but nothing in the app yet moves a request into *Pending Refund*, *Partially
   Refunded*, *Written Off*, *Disputed* or *Reconciled*, and no screen captures the
   amounts those mails interpolate. Until that is built, rows 38–53 can only be exercised
   by updating the record directly.
5. **SMTP is not implemented.** See *Delivery*.
6. **`BOOKING_UPDATED` must be raised explicitly.** A `Booked -> Booked` transition maps
   to the silent `BOOKING_DETAIL_EDITED`. Whatever performs a material change (date, time,
   PNR, operator, route) has to call `queueEmailsForEvent(request,
   TravelEvent.BOOKING_UPDATED, …)` itself — the transition alone cannot tell a reissued
   PNR from a corrected cost centre.
