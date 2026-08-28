# Navgurukul Travel Desk — Transactional Mail Sender Routine

This document is the authoritative specification for all transactional email notifications sent by the Navgurukul Travel Desk application.

---

## 1. System Architecture & Lifecycle Flow

```text
Travel Lifecycle State Change
            ↓
queueEmailsForTransition (Asynchronous Side Effect)
            ↓
Fetch Published Mail Template (status = 'Published')
            ↓
Resolve Dynamic Template Variables & Global CC List
            ↓
Insert into public.email_queue (Snapshot Content + Idempotency Key)
            ↓
Supabase Edge Function (process-email-queue) / Cron Trigger
            ↓
Active Provider (Gmail API) → Future Provider (Amazon SES)
            ↓
Sent Mails & Delivery Log Tracking
```

### Production Invariant
Email generation and delivery are **strictly asynchronous side effects**. If template retrieval, variable resolution, or provider transmission encounters an error, the travel ticket state transition **always succeeds**.

---

## 2. Global CC Configuration

* **Default Global CC Addresses**:
  * `travel.team@navgurukul.org`
  * `nitin.s@navgurukul.org`
* **Configuration Storage**: Stored centrally in the `settings` database table under `setting_key = 'global_email_cc'`.
* **Resolution**: All automated lifecycle emails resolve the global CC list at queue time and attach it to `email_queue.cc`.

---

## 3. Supported Dynamic Template Variables

| Variable | Description | Example / Fallback |
| :--- | :--- | :--- |
| `{{request_id}}` | Unique formatted submission ID | `TRV-O-260828-001` |
| `{{submissionId}}` | Alias for request_id | `TRV-O-260828-001` |
| `{{requester_name}}` | Full name of requesting employee | `Anita Sharma` |
| `{{requester_email}}` | Work email of requester | `anita@navgurukul.org` |
| `{{manager_name}}` | Approving manager's name | `Rahul Verma` |
| `{{manager_email}}` | Approving manager's email | `rahul@navgurukul.org` |
| `{{origin}}` | Travel departure city/location | `Pune` |
| `{{destination}}` | Travel destination city/location | `Bangalore` |
| `{{from}}` | Alias for origin | `Pune` |
| `{{to}}` | Alias for destination | `Bangalore` |
| `{{departure_date}}` | Date of travel | `2026-09-15` |
| `{{dateOfTravel}}` | Alias for departure_date | `2026-09-15` |
| `{{travel_mode}}` | Mode of travel (Flight/Train/Bus) | `Flight` |
| `{{trip_type}}` | Trip type (One-way / Round-trip) | `One-way` |
| `{{purpose}}` | Purpose of travel | `Campus Annual Review` |
| `{{estimated_cost}}` | Estimated/booked ticket cost | `₹4,500` |
| `{{ticketCost}}` | Alias for estimated_cost | `4500` |
| `{{vendor_name}}` | Travel provider / airline / agency | `IndiGo` |
| `{{vendorName}}` | Alias for vendor_name | `IndiGo` |
| `{{violation_reasons}}` | Policy violation justification | `Flight notice < 15 days` |
| `{{rejection_reason}}` | Manager or PNC rejection reason | `Travel budget cap reached` |
| `{{information_requested}}` | Clarification question from PNC | `Please provide government ID` |
| `{{employee_response}}` | Employee response to clarification | `Aadhaar card attached` |
| `{{booking_reference}}` | PNR / Booking confirmation number | `IND-88219` |
| `{{cancellation_reason}}` | Stated reason for cancellation | `Meeting rescheduled by client` |
| `{{portal_url}}` | Portal link for user action | `https://travel.navgurukul.org` |

---

## 4. Complete Lifecycle Email Matrix

| # | Trigger Event | State Transition | Template Name | Audience | Primary Recipient | CC | Subject |
|---|---|---|---|---|---|---|---|
| **1** | Request Submitted (No Violation) | `Entry` → `Not Started` | `Request Received` | `employee` | `requesterEmail` | Global CC | `Travel Request Received - {{request_id}}` |
| **2** | Request Submitted (With Violation) | `Not Started` → `Approval Pending` | `Manager Approval Required` | `manager` | `approvingManagerEmail` | Global CC | `Action Required: Travel Approval for {{requester_name}} - {{request_id}}` |
| **3** | Manager Approval | `Approval Pending` → `Approved` | `Request Approved` | `employee` | `requesterEmail` | Global CC | `Travel Request Approved - {{request_id}}` |
| **4** | Manager Approval Confirmation | `Approval Pending` → `Approved` | `Manager Approval Confirmation` | `manager` | `approvingManagerEmail` | Global CC | `Confirmation: You approved travel request {{request_id}}` |
| **5** | Manager Rejection | `Approval Pending` → `Rejected by Manager` | `Request Rejected by Manager` | `employee` | `requesterEmail` | Global CC | `Travel Request Not Approved - {{request_id}}` |
| **6** | Processing Started | `Approved` / `Not Started` → `Processing` | `Request Processing Started` | `employee` | `requesterEmail` | Global CC | `Travel Request In Processing - {{request_id}}` |
| **7** | PNC Requests Info | `Processing` → `On Hold` | `Information Required` | `employee` | `requesterEmail` | Global CC | `Clarification Needed for Travel Request - {{request_id}}` |
| **8** | Employee Responds to Info | `On Hold` → `Processing` | `Employee Response Received` | `pnc` | Active PNC / Admins | Global CC | `Update on Hold Request: {{requester_name}} responded - {{request_id}}` |
| **9** | PNC Rejection | `Processing` → `Rejected by PNC` | `Request Rejected by PNC` | `employee` | `requesterEmail` | Global CC | `Travel Request Unable to Book - {{request_id}}` |
| **10** | Employee Resubmission | `Rejected` → `Not Started` | `Request Resubmitted` | `employee` | `requesterEmail` | Global CC | `Resubmitted Travel Request Received - {{request_id}}` |
| **11** | Ticket Booked | `Processing` → `Booked` | `Travel Booked` | `employee` | `requesterEmail` | Global CC | `✈️ Confirmed Travel Itinerary - {{request_id}}` |
| **12** | Employee Cancellation (Pre-booking) | `Any Pre-Booked` → `Cancelled by Employee` | `Employee Cancellation Confirmed` | `employee` | `requesterEmail` | Global CC | `Travel Request Cancelled - {{request_id}}` |
| **13** | Employee Cancellation (Manager Stand Down) | `Approval Pending` → `Cancelled by Employee` | `Manager Approval Stand Down` | `manager` | `approvingManagerEmail` | Global CC | `Cancelled: Travel request {{request_id}} by {{requester_name}}` |
| **14** | Employee Cancellation (Post-booking) | `Booked` → `Cancelled by Employee` | `Booked Ticket Cancellation Notice` | `pnc` | Active PNC / Admins | Global CC | `Action: Booked Ticket Cancelled by Employee - {{request_id}}` |
| **15** | PNC Cancellation | `Booked` / `Processing` → `Cancelled by PNC` | `PNC Cancellation Notice` | `employee` | `requesterEmail` | Global CC | `Important: Travel Request Cancelled by Travel Desk - {{request_id}}` |
| **16** | Refund / Reconciliation Complete | `Cancelled` → `Closed` | `Refund Reconciliation Complete` | `employee` | `requesterEmail` | Global CC | `Travel Refund & Reconciliation Complete - {{request_id}}` |
| **17** | Trip Completed & Closed | `Booked` → `Closed` | `Request Closed` | `employee` | `requesterEmail` | Global CC | `Travel Completed - {{request_id}}` |

---

## 5. Negative Cases & Guardrails

1. **No Violation on Entry**:
   * If a request is submitted within policy rules, it transitions directly to `Processing` (or `Not Started`).
   * **Guardrail**: Manager approval email is **NEVER** sent if there are no violations.
2. **Manager Rejection**:
   * If a manager rejects a request, only the `Request Rejected by Manager` email is sent.
   * **Guardrail**: Approval confirmation and PNC processing notifications are **NEVER** triggered.
3. **Cancellation while in `Approval Pending`**:
   * The employee receives cancellation confirmation.
   * The manager receives a "Stand Down / Cancelled" notice.
   * **Guardrail**: PNC does **NOT** receive an alert, as the request was never in the PNC queue.
4. **Cancellation while in `Processing`**:
   * The employee and PNC receive notifications.
   * **Guardrail**: The manager is **NOT** re-notified if approval was already completed earlier.
5. **Draft Templates**:
   * If a template is in `Draft` or `Archived` status, it is **NEVER** dispatched to live users.
   * The system logs a non-blocking diagnostic record in `email_queue` (`status = 'Failed'`, `last_error = 'Template unpublished'`).

---

## 6. Idempotency & Duplicate Prevention

To guarantee zero duplicate emails across retries, re-renders, or network spikes, each queued email uses a deterministic SHA-256 / composite idempotency key:

```text
idempotency_key = ticket:{request_id}:status:{to_status}:aud:{audience}:{sorted_recipients}
```

Supabase enforces uniqueness via:
```sql
CREATE UNIQUE INDEX idx_email_queue_idempotency 
ON public.email_queue (idempotency_key) 
WHERE idempotency_key IS NOT NULL;
```
If an identical event is triggered within the same lifecycle transition, the database safely ignores the duplicate insert.

---

## 7. Visual Lifecycle & Email Flow Diagrams

### 7.1 Submission & Manager Approval Flow (Mails #1 – #5)

```mermaid
flowchart TD
    subgraph Submission["Submission Phase"]
        Start(["Employee Submits Request"]) --> CheckViolations{"Policy Violations Detected?"}
        
        CheckViolations -- "No" --> NotStarted["State: Not Started"]
        NotStarted --> Mail1["📧 Mail #1: Request Received<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request Received - [request_id]"]
        
        CheckViolations -- "Yes" --> ApprovalPending["State: Approval Pending"]
        ApprovalPending --> Mail2["📧 Mail #2: Manager Approval Required<br/><b>To:</b> Manager<br/><b>Subject:</b> Action Required: Travel Approval for [requester_name] - [request_id]"]
    end

    subgraph ManagerDecision["Manager Decision"]
        Mail2 --> ManagerAction{"Manager Action"}
        
        ManagerAction -- "Approve" --> ApprovedState["State: Approved"]
        ApprovedState --> Mail3["📧 Mail #3: Request Approved<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request Approved - [request_id]"]
        ApprovedState --> Mail4["📧 Mail #4: Manager Approval Confirmation<br/><b>To:</b> Manager<br/><b>Subject:</b> Confirmation: You approved travel request [request_id]"]
        
        ManagerAction -- "Reject" --> RejectedManager["State: Rejected by Manager"]
        RejectedManager --> Mail5["📧 Mail #5: Request Rejected by Manager<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request Not Approved - [request_id]"]
    end
```

### 7.2 PNC Processing & Clarification Loop (Mails #6 – #10)

```mermaid
flowchart TD
    subgraph Processing["PNC Processing"]
        Approved["State: Approved / Not Started"] --> StartProcessing["State: Processing"]
        StartProcessing --> Mail6["📧 Mail #6: Request Processing Started<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request In Processing - [request_id]"]
    end

    subgraph ClarificationLoop["On-Hold / Clarification Cycle"]
        StartProcessing --> PNCNeedInfo{"PNC Needs Clarification?"}
        PNCNeedInfo -- "Yes" --> OnHold["State: On Hold"]
        OnHold --> Mail7["📧 Mail #7: Information Required<br/><b>To:</b> Employee<br/><b>Subject:</b> Clarification Needed for Travel Request - [request_id]"]
        
        Mail7 --> EmpResponse["Employee Provides Response"]
        EmpResponse --> BackToProcessing["State: Processing"]
        BackToProcessing --> Mail8["📧 Mail #8: Employee Response Received<br/><b>To:</b> PNC / Admins<br/><b>Subject:</b> Update on Hold Request: [requester_name] responded - [request_id]"]
    end

    subgraph PNCRejection["PNC Rejection & Resubmission"]
        StartProcessing --> PNCRejects{"PNC Rejects Request?"}
        PNCRejects -- "Yes" --> RejectedPNC["State: Rejected by PNC"]
        RejectedPNC --> Mail9["📧 Mail #9: Request Rejected by PNC<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request Unable to Book - [request_id]"]
        
        Mail9 --> EmpResubmit["Employee Resubmits with Modifications"]
        EmpResubmit --> NotStartedAgain["State: Not Started"]
        NotStartedAgain --> Mail10["📧 Mail #10: Request Resubmitted<br/><b>To:</b> Employee<br/><b>Subject:</b> Resubmitted Travel Request Received - [request_id]"]
    end
```

### 7.3 Booking & Completion Flow (Mails #11 & #17)

```mermaid
flowchart TD
    ProcessingState["State: Processing"] --> PNCBooks["PNC Books Ticket (Uploads Ticket / PNR)"]
    PNCBooks --> BookedState["State: Booked"]
    BookedState --> Mail11["📧 Mail #11: Travel Booked<br/><b>To:</b> Employee<br/><b>Subject:</b> Confirmed Travel Itinerary - [request_id]"]

    Mail11 --> TripDone["Trip Completed (Scheduled / Admin Closure)"]
    TripDone --> ClosedState["State: Closed"]
    ClosedState --> Mail17["📧 Mail #17: Request Closed<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Completed - [request_id]"]
```

### 7.4 Cancellation & Refund Reconciliation Flows (Mails #12 – #16)

```mermaid
flowchart TD
    subgraph PreBookingCancellation["Pre-Booking Cancellation (By Employee)"]
        PendingApproval["State: Approval Pending"] -- "Employee Cancels" --> CancelPending["State: Cancelled by Employee"]
        CancelPending --> Mail12A["📧 Mail #12: Employee Cancellation Confirmed<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request Cancelled - [request_id]"]
        CancelPending --> Mail13["📧 Mail #13: Manager Approval Stand Down<br/><b>To:</b> Manager<br/><b>Subject:</b> Cancelled: Travel request [request_id] by [requester_name]"]

        InQueue["State: Not Started / Approved"] -- "Employee Cancels" --> CancelQueue["State: Cancelled by Employee"]
        CancelQueue --> Mail12B["📧 Mail #12: Employee Cancellation Confirmed<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Request Cancelled - [request_id]"]
    end

    subgraph PostBookingCancellation["Post-Booking & PNC Cancellation"]
        BookedStatus["State: Booked"] -- "Employee Cancels" --> CancelBooked["State: Cancelled by Employee"]
        CancelBooked --> Mail14["📧 Mail #14: Booked Ticket Cancellation Notice<br/><b>To:</b> PNC / Admins<br/><b>Subject:</b> Action: Booked Ticket Cancelled by Employee - [request_id]"]

        AnyActive["State: Processing / Booked"] -- "PNC Desk Cancels" --> CancelPNC["State: Cancelled by PNC"]
        CancelPNC --> Mail15["📧 Mail #15: PNC Cancellation Notice<br/><b>To:</b> Employee<br/><b>Subject:</b> Important: Travel Request Cancelled by Travel Desk - [request_id]"]
    end

    subgraph RefundSettlement["Refund & Final Closure"]
        CancelBooked --> RefundProcessing["PNC Completes Refund & Accounting Reconciliation"]
        CancelPNC --> RefundProcessing
        RefundProcessing --> ClosedCancelled["State: Closed"]
        ClosedCancelled --> Mail16["📧 Mail #16: Refund Reconciliation Complete<br/><b>To:</b> Employee<br/><b>Subject:</b> Travel Refund & Reconciliation Complete - [request_id]"]
    end
```

### 7.5 Asynchronous Delivery Sequence

```mermaid
sequenceDiagram
    autonumber
    participant UI as Travel App UI / API
    participant Queue as public.email_queue
    participant Edge as Edge Function (process-email-queue)
    participant Provider as Email Provider (Gmail / SES)
    participant User as Recipient (Employee / Manager / PNC)

    UI->>UI: Trigger State Transition (e.g. Approved)
    UI->>UI: Fetch Published Template & Resolve Variables
    UI->>Queue: Insert Email Record (Snapshot + Composite Idempotency Key)
    Note over UI,UI: Non-blocking: Ticket transition succeeds even if queue fails
    Edge->>Queue: Poll pending records (status = 'Pending')
    Edge->>Provider: Transmit RFC 2822 payload (To + Global CC)
    Provider-->>User: Deliver Transactional Email
    Provider-->>Edge: HTTP 200 / Message ID
    Edge->>Queue: Update status = 'Sent', sent_at = now()
```

