# Travel Ticket Request — Lifecycle Flow

## 1. Full state list

| # | Status | Type | Meaning |
|---|--------|------|---------|
| 1 | Not Started | Entry | Request just submitted, violation check runs |
| 2 | Approval Pending | Waiting on human | Manager needs to approve a policy violation |
| 3 | Rejected by Manager | Waiting on human | Manager rejected; employee can edit & resubmit |
| 4 | Approved | Automatic pass-through | Manager approved, about to auto-advance |
| 5 | Processing | Waiting on human | PNC team reviewing / booking |
| 6 | On Hold / Info Requested | Waiting on human | PNC needs more info from employee before proceeding |
| 7 | Rejected by PNC | Waiting on human | PNC rejected; employee can edit & resubmit |
| 8 | Booked | Waiting on human | Ticket issued and confirmed |
| 9 | Cancelled by Employee | Terminal (branch) | Employee-initiated cancellation |
| 10 | Cancelled by PNC | Terminal (branch) | PNC/ops-initiated cancellation (e.g. airline change, price issue) |
| 11 | Closed | Terminal | Trip complete / ticket fully reconciled |

---

## 2. Transition table (trigger, actor, email)

| From | To | Trigger | Actor | Email(s) sent |
|------|----|---------|-------|----------------|
| — | Not Started | Employee submits request | Employee | To **employee**: "Request received" |
| Not Started | Approval Pending | Auto — violation detected | System | To **manager**: "Approval needed for a policy violation." To **employee**: none extra (already got receipt mail) |
| Not Started | Processing | Auto — no violation detected | System | To **employee**: "Your request is being processed by PNC" |
| Approval Pending | Approved | Manager clicks Approve | Manager | To **employee** + **manager**: "Request approved by manager" |
| Approved | Processing | Auto, immediately after approval | System | To **employee**: "Your request is being processed by PNC" |
| Approval Pending | Rejected by Manager | Manager clicks Reject | Manager | To **employee**: "Rejected by manager" + reason |
| Rejected by Manager | Not Started | Employee edits & resubmits | Employee | To **employee**: "Resubmitted request received" (re-runs violation check from scratch) |
| Processing | On Hold / Info Requested | PNC requests clarification (manual) | PNC | To **employee**: "We need more information" + what's needed |
| On Hold | Processing | Employee replies with info | Employee | To **PNC**: "Employee responded" (internal/queue notice). Optional ack to employee |
| Processing | Rejected by PNC | PNC rejects (manual) | PNC | To **employee**: "Rejected by PNC" + reason |
| Rejected by PNC | Not Started | Employee edits & resubmits | Employee | To **employee**: "Resubmitted request received" (re-runs violation check) |
| Processing | Booked | PNC adds ticket details & marks booked (manual) | PNC | To **employee**: "Your ticket is booked" + itinerary |
| Not Started / Approval Pending / Processing / On Hold | Cancelled by Employee | Employee cancels before booking | Employee | To **employee**: cancellation confirmed. To **manager** (only if it was Approval Pending): "No longer needs your approval — cancelled." To **PNC** (only if it was Processing/On Hold): "Stand down — cancelled." |
| Booked | Cancelled by Employee | Employee cancels after booking | Employee | To **employee**: cancellation confirmed, refund/penalty terms noted. To **PNC**: "Process cancellation/refund for booked ticket" |
| Booked | Cancelled by PNC | PNC cancels (airline change, ops issue, etc.) | PNC | To **employee**: "Your booked ticket was cancelled by PNC" + reason + next steps |
| Booked | Closed | Trip date passes / reconciliation done | System (auto) or PNC (manual) | Optional: to **employee**, trip marked complete |
| Cancelled by Employee / Cancelled by PNC | Closed | Refund/reconciliation finished | System (auto) or Finance/PNC (manual) | Optional: to **employee**, refund confirmation |

---

## 3. Automatic vs. manual steps

**Automatic (system-driven, no human click needed):**
- Not Started → Approval Pending *or* Processing (violation check)
- Approved → Processing (auto pass-through)
- Booked → Closed / Cancelled → Closed (if you choose to automate reconciliation)

**Manual (a person must act):**
- Manager: Approve / Reject (Approval Pending)
- PNC: Request info (On Hold), Reject (Rejected by PNC), Book (Booked), Cancel (Cancelled by PNC)
- Employee: Resubmit after rejection, respond to On Hold, Cancel (Cancelled by Employee)

---

## 4. Resubmission logic (both rejection types)

- Resubmission always routes back to **Not Started**, so the violation check re-runs. This matters because the employee's edits (new dates, new fare class, added justification) could remove or introduce a violation — you don't want a fixed edit stuck going through manager approval again, and you don't want a still-violating edit skipping approval.
- Recommend capping resubmissions (e.g. 2–3 attempts) or logging a resubmission count per ticket, so repeatedly-bounced tickets are visible in reporting rather than looking like a fresh request each time.
- Decide whether "Rejected by Manager" and "Rejected by PNC" auto-close after N days of employee inactivity, so they don't sit open forever cluttering the queue.

---

## 5. Cancellation logic (two flavors, for reimbursement)

You wanted these split because the reimbursement/penalty logic differs:

- **Cancelled by Employee**: employee changed their mind or plans changed. Depending on how far along the ticket was:
  - Pre-booking cancel → no cost, straightforward.
  - Post-booking cancel → may involve airline change fees or non-refundable fare loss, which is typically the employee/department's cost, not the company's.
- **Cancelled by PNC**: booking was cancelled due to something outside the employee's control (airline schedule change, price error, ops decision). This is typically a full-refund / no-penalty-to-employee scenario, and may need a rebooking flow.

This split gives you a clean signal for finance/reporting on who bears the cost of a cancellation, which was the whole point of separating them.

---

## 6. Edge cases to decide on explicitly

1. **Race condition — approval vs. cancellation.** Employee cancels while still in Approval Pending, but the manager clicks Approve a second later (before seeing the cancellation). System should block/void the approval action once status has moved to Cancelled, and show the manager a clear "already cancelled" state rather than silently succeeding.
2. **Race condition — PNC mid-booking.** Employee tries to cancel while PNC has already purchased the ticket but not yet marked it Booked. Don't let self-service cancellation silently succeed here — route it as a request to PNC ("employee requested cancellation, please confirm ticket status") rather than an instant status change.
3. **On Hold with no response.** If the employee doesn't reply within X days, do you auto-remind, auto-cancel, or leave it open indefinitely? Recommend a reminder at day 3 and auto-cancel (Cancelled by Employee, "no response") at day 7–10 to keep the queue clean.
4. **Manager reassignment.** If the org chart changes while a ticket sits in Approval Pending (manager leaves, employee gets reassigned), who approves? Needs a fallback approver rule, not just "mail the manager on file."
5. **Repeated resubmission loops.** As noted in §4 — cap attempts or flag for manual review after N bounces, so a ticket doesn't cycle indefinitely between Not Started and a rejection state.
6. **Violation check on resubmission.** Confirm explicitly that resubmission re-runs the check (per §4) rather than reusing the original check result — otherwise an edited itinerary could skip required approval.
7. **Multiple violations vs. single approval mail.** If a ticket trips more than one violation rule, does the manager get one consolidated mail listing all violations, or one mail per violation? One mail is almost certainly better for a coherent approval decision.
8. **Cancelled-by-PNC needing a rebook.** When PNC cancels a booked ticket (e.g., airline pulled the flight), does the employee need to submit a brand-new ticket request, or is there a lightweight "rebook this" path that skips re-running the violation/approval steps since it was already approved once? Worth deciding since it affects how much friction the employee faces for something that wasn't their fault.
9. **Closed vs. still-open financials.** If Closed also implies "expense/reconciliation done," make sure Booked doesn't auto-close purely on travel-date-passed if there's an expense step still pending — otherwise "Closed" stops meaning what finance needs it to mean.

---

## 7. Summary: who gets emailed, at every step

| Status reached | Employee | Manager | PNC |
|---|---|---|---|
| Not Started | ✅ received | — | — |
| Approval Pending | — | ✅ approval needed | — |
| Approved | ✅ approved | ✅ (confirmation) | — |
| Rejected by Manager | ✅ rejected + reason | — | — |
| Processing | ✅ being processed | — | (queue item, not necessarily email) |
| On Hold | ✅ info needed | — | — |
| Rejected by PNC | ✅ rejected + reason | — | — |
| Booked | ✅ itinerary | — | — |
| Cancelled by Employee | ✅ confirmed | ✅ if was pending their approval | ✅ if was in their queue |
| Cancelled by PNC | ✅ cancelled + reason | — | — |
| Closed | optional ✅ | — | — |
