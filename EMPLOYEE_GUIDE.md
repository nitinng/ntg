# Navgurukul Travel Desk — Employee Guide ✈️

Welcome to the **Navgurukul Travel Desk** application! This platform simplifies and streamlines your travel request, booking, and reimbursement processes. 

Whether you are requesting travel for a team visit, manager meetup, or the Igatpuri Meetup, this guide will walk you through the key features, workflows, and rules you need to know as an employee.

---

## 📌 Table of Contents
1. [Getting Started & Profile Verification](#1-getting-started--profile-verification)
2. [Submitting a Travel Request (Step-by-Step)](#2-submitting-a-travel-request-step-by-step)
3. [Understanding the Ticket Request Lifecycle](#3-understanding-the-ticket-request-lifecycle)
4. [Handling Rejections & Resubmissions](#4-handling-rejections--resubmissions)
5. [Responding to Info Requests (On Hold)](#5-responding-to-info-requests-on-hold)
6. [Cancellations & Reconciliation](#6-cancellations--reconciliation)
7. [PNC Support Chat (Beta)](#7-pnc-support-chat-beta)
8. [What Does This Status Mean?](#8-what-does-this-status-mean)

---

## 1. Getting Started & Profile Verification

Before booking any travel, you must complete your profile and verify your identity. The system restricts travel bookings if your profile is incomplete to ensure safety, policy compliance, and smooth check-ins.

```mermaid
graph TD
    A[Log In / Register] --> B{Profile Complete?}
    B -- Yes (100%) --> C[Submit Travel Request]
    B -- No (<100%) --> D{Enforcement Enabled?}
    D -- No --> E[Warning Shown / Access Allowed] --> C
    D -- Yes --> F{Request Skip/Unlock?}
    F -- Yes --> G[Temporary Skip for X Days] --> C
    F -- No --> H[Booking Feature Locked] --> B
```

### Profile Completeness Checklist
Your profile has a completeness score. You must fill out **11 key fields** to reach 100% completeness:

1. **Full Name**
2. **Department** (Select from your organization's list)
3. **Campus Location**
4. **Manager's Name**
5. **Manager's Email Address** (Used for travel policy approvals)
6. **Phone Number** (Must be a valid 10-digit mobile number)
7. **Emergency Contact Name**
8. **Emergency Contact Phone** (Must be a valid 10-digit number)
9. **Emergency Contact Relation**
10. **Blood Group** (Select from A+, A-, B+, B-, O+, O-, AB+, AB-)
11. **Required Document Uploads**:
    * **Passport Size Photo** (Max file size: 5MB)
    * **Government ID Proof** (Aadhaar, Passport, PAN Card, Voter ID, or Driving License. Max size: 5MB)

> [!IMPORTANT]
> **Temporary Verification Unlock:** If you need to book travel urgently but your documents are still pending review by the PNC team, you can click **"Skip for Now"** on your dashboard. This temporarily unlocks the booking functionality for a limited window (defined by system policy, e.g., 7 days). After this grace period, you must complete verification to book again.

---

## 2. Submitting a Travel Request (Step-by-Step)

To request a ticket booking, click the **New Booking** button on your dashboard. The form has three guided steps:

### Step 1: Basic Information
* **Full Name & Email:** Pre-filled from your profile.
* **Phone Number & Department:** Pre-filled, but can be updated.
* **Purpose of Travel:** State a clear business reason (e.g., *Site visit to Pune*, *Partner Meeting*, or *Igatpuri Meetup*).
* **Approving Manager Name & Email:** Enter the manager who will receive notifications and approve this trip.
* **Mode of Travel:** Choose **Flight**, **Train**, or **Bus**.
* **Trip Type:** Select **One-way** or **Round-trip**.

### Step 2: Travel Logistics
* **Route details:** Fill in **From** and **To** cities/stations.
* **Departure Date:** Choose your travel date.
* **Preferred Departure Window:** Specify when you'd like to travel:
  * Morning (6AM - 12PM)
  * Afternoon (12PM - 6PM)
  * Evening (6PM - 12AM)
  * Anytime
* **Return Details:** (Only for Round-trip) Specify Return From/To, Return Date, and Return Time Window.

> [!WARNING]
> **Notice Period Policy Violations:** Each travel mode requires a minimum number of advance booking days (e.g., flights must be requested at least 14 days in advance). If your requested travel date violates this notice policy:
> 1. A warning card will appear: *"Policy Violation Detected"*.
> 2. You **must** enter a late booking justification/reason in the text area provided.
> 3. Your request will go to your manager for explicit approval before the PNC team can book it.

### Step 3: Personal & Emergency Details
* **Verify Emergency Contacts:** Confirm blood group, emergency contact details, and input any medical conditions or special assistance requirements (such as wheelchair access or dietary allergies).
* Once finalized, click **Submit**.

> [!TIP]
> **Igatpuri Meetup Visits:** If you are added to a finalized Igatpuri meetup list by your department head or coordinator, a green notification banner will appear on your dashboard. Simply click **Book Travel** on that banner, and your dates and purpose will be automatically prefilled for you!

---

## 3. Understanding the Ticket Request Lifecycle

Once submitted, your travel request moves through several stages. You can track this in real time from your dashboard, represented as a visual "Boarding Pass" card.

| Status | Meaning | What You Need to Do |
| :--- | :--- | :--- |
| **Not Started** | Request submitted. System checks for policy violations. | None. Auto-advances. |
| **Approval Pending** | Notice policy violation detected. | Waiting for your Manager to review and approve. |
| **Rejected by Manager** | Manager rejected the request. | Edit the details and resubmit (or cancel). |
| **Processing** | Manager approved (or no violations) and PNC is working on booking. | None. PNC is contacting vendors or searching fares. |
| **On Hold** | PNC requires more information from you to proceed. | Respond to the clarification request immediately. |
| **Rejected by PNC** | PNC rejected the request (e.g., budget limits, flight unavailable). | Edit and resubmit based on PNC feedback. |
| **Booked** | Ticket issued! Details (PNR, invoice, cost) are logged. | Download ticket/itinerary details from the dashboard card. |
| **Cancellation Requested**| You requested to cancel a booked ticket. | Waiting for PNC to process cancellation and refunds. |
| **Cancelled by Employee** | Ticket cancellation processed. | Reconcile any costs if determined as employee-owned. |
| **Closed** | Travel date passed and financial reconciliation is complete. | Done. |

> This covers the common path. For every status a request can reach — including
> the cancellation and refund stages — see
> [What Does This Status Mean?](#8-what-does-this-status-mean).

---

## 4. Handling Rejections & Resubmissions

If your request is rejected by either your **Manager** or the **PNC team**:
1. You will receive an email and a notification.
2. The reason for rejection will be clearly stated inside your request details (e.g., *"Wrong travel dates"* or *"Please select Train instead of Flight"*).
3. If applicable, click **Edit & Resubmit** on the request card. This opens the travel request form prefilled with your previous choices. Correct the flagged details and submit.

> [!CAUTION]
> **Resubmission Limit:** You can resubmit a request a maximum of **3 times**. If your request is rejected 3 times, the button will lock. You must then contact the PNC team or your manager directly to resolve the issue manually.
> 
> *Note: Resubmitting always re-runs the violation check from scratch.*

---

## 5. Responding to Info Requests (On Hold)

If the PNC booking team runs into questions (e.g., *"The morning flight is sold out; is an afternoon flight okay?"* or *"Please share your middle name as per Aadhaar"*), they will put your request **On Hold**.

1. You will see a warning section on your ticket card saying **Action Required: Information Requested**.
2. Click on the card to open the **Request Details Overlay**.
3. Under the **PNC Clarification Needed** block, read their query.
4. Type your reply in the **Your Response** box.
5. Click **Submit Response & Resume Processing**. This clears the hold and updates the status back to **Processing** so PNC can book your ticket immediately.

---

## 6. Cancellations & Reconciliation

If your travel plans change and you need to cancel a ticket:

### Before Booking (Processing/Approval Pending/On Hold states)
Click **Cancel Request** in the Request Detail Overlay. The request will immediately transition to a terminal cancelled state with no cancellation penalty or organizational impact.

### After Booking (Booked state)
1. Open your request card and click **Cancel Request**.
2. Confirm the cancellation. The ticket status updates to **Cancellation Requested** and enters PNC's queue.
3. PNC will process the cancellation with the vendor and record refund percentages.

### Who Bears the Cost?
Depending on why you cancelled, the cost is split based on system policy rules:
* **Cancelled by PNC/Ops (Company's responsibility):** If the flight got cancelled by the airline or cancelled due to an ops change, the organization covers 100% of the cost.
* **Cancelled by Employee (Personal reasons):** If cancelled due to personal changes of plan, you may be responsible for a portion of the non-refundable fare or penalty, as determined by the system cancellation policy.

```mermaid
graph TD
    A[Ticket Booked] --> B[Employee requests cancellation]
    B --> C[PNC reviews refund details & calculates splits]
    C --> D{Who is responsible?}
    D -- Org / PNC Change --> E[Org covers 100% loss]
    D -- Personal Change --> F[Split applied based on Policy]
    F --> G[Employee Owed Amount generated]
    G --> H[Reconciliation Payment / Salary adjustment]
```

> [!NOTE]
> **Cancellations Dashboard:** You can track cancellation refunds, organization-absorbed costs, and any balance you owe to the organization through the **Cancellations Dashboard** in the app. If you owe money for a personal cancellation, this will stay open as `Pending Refund` until settled.

---

## 7. PNC Support Chat (Beta)

Have general travel questions or need to discuss your booking directly with the PNC team? Use the built-in **PNC Support Chat (Beta)**.

### Creating a Support Thread
1. Navigate to the Chat tab in your sidebar.
2. Click **Start New Chat**.
3. Choose what you need assistance with:
   * 🎟️ **Existing Request:** Select this if you have a question about a request you already submitted. The system will prompt you to select the booking from a dropdown list, linking your conversation directly to the ticket.
   * 📅 **Future Request:** Select this to ask about a trip you plan to make in the future.
   * ❓ **Others:** General travel desk queries, reimbursement policies, or feedback.
4. Send your message. PNC admins will see this in their support dashboard and reply.

### Chat Features
* **Real-time updates:** Exchange messages instantly with PNC.
* **Attachments:** You can upload and send images or documents (e.g. visa copies, special permission letters) directly inside the chat window.

---

*Thank you for helping us keep Navgurukul travel efficient and organized. Have a safe journey!* ✈️

---

## 8. What Does This Status Mean?

<!-- STATUS-GUIDE:START -->

Every status a request can be in, grouped by where it sits in the journey. Most trips only pass through four or five of these.

> **"Action Required" is not a separate status.** It is what we call **On Hold** when you look at it — the travel desk has asked you something and your booking is paused until you reply. If you see it, the request is waiting on you and nobody else.

### Submitted

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Submitted**<br/><sub>(internally "Not Started")</sub> | Your request has been received and is being checked against travel policy. | The system, automatically. | If your request meets the advance-notice policy it goes straight to the travel desk. If not, it goes to your manager for approval. | No. |

### Approval

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Waiting for Manager Approval**<br/><sub>(internally "Approval Pending")</sub> | Your request needs your manager to approve it, usually because it was raised at shorter notice than policy allows. | Your manager. | Once they approve, it goes to the travel desk to book. If they reject it, you can edit and resubmit. | Nothing, though a nudge to your manager can help if it is urgent. |
| **Approved** | Your manager has approved the request. | The travel desk. | It moves to the desk immediately to be booked. | No. |
| **Rejected by Manager** | Your manager did not approve this request. Their reason is on the request. | You. | Nothing until you act. Editing and resubmitting sends it back for a fresh look. | Yes — read the reason, then edit and resubmit, or leave it if the trip is off. |

### With the desk

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Being Booked**<br/><sub>(internally "Processing")</sub> | The travel desk has your request and is finding and booking tickets. | The travel desk. | You get your ticket by email once it is booked. If they need something from you first, the request moves to Action Required. | No. |
| **Action Required**<br/><sub>(internally "On Hold")</sub> | The travel desk needs information from you before they can book — a date confirmation, an ID detail, a preference. | You. | Booking is paused until you reply. You will be reminded, and if nobody replies for long enough the request is escalated and eventually closed. | Yes — open the request and answer the question. This is the one status that genuinely waits on you. |
| **Action Required — Escalated**<br/><sub>(internally "On Hold / Escalated")</sub> | The desk's question has gone unanswered long enough that it has been escalated. | You, with the escalation owner now watching. | Booking is still paused. Without a reply the request will be closed automatically. | Yes — answer the outstanding question now, or cancel the request if the trip is off. |
| **Rejected by Travel Desk**<br/><sub>(internally "Rejected by PNC")</sub> | The travel desk could not proceed with this request. Their reason is on the request. | You. | Nothing until you act. Editing and resubmitting sends it back to the desk. | Yes — read the reason, then edit and resubmit if you still need to travel. |

### Booked

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Booked** | Your tickets are booked. The booking details and your ticket are on the request. | You — travel. | After the trip the request is closed, and you will be asked to submit any expenses. | Yes — download your ticket and check the details are right. Tell the desk straight away if anything is wrong. |

### Cancellation

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Cancellation Requested** | You or the desk have asked for this trip to be cancelled, and the desk is working through it. | The travel desk. | The desk cancels with the airline or operator and works out whether any money comes back. | No. |
| **Cancelled by You**<br/><sub>(internally "Cancelled by Employee")</sub> | This trip was cancelled at your request. | The travel desk, if there is money to recover. | If a refund is due the request moves to Pending Refund. If nothing is recoverable it is reconciled and closed. | Possibly — if a cancellation charge falls to you, Finance will contact you. Nothing to do until they do. |
| **Cancelled by Travel Desk**<br/><sub>(internally "Cancelled by PNC")</sub> | The travel desk cancelled this booking. The reason is on the request. | The travel desk. | Any refund is pursued and the request is closed. A desk cancellation carries no cost to you. | Yes, if you still need to travel — raise a fresh request. |
| **Closed — No Response**<br/><sub>(internally "Cancelled by System")</sub> | The desk asked for information and heard nothing back in time, so the request was closed automatically. | You, if you still need the trip. | This request stays closed. | Yes, if you still need to travel — raise a fresh request. |
| **Partly Cancelled**<br/><sub>(internally "Booked / Partially Cancelled")</sub> | Part of this trip has been cancelled — one leg of a return, say — and the rest is still booked. | The travel desk. | The desk recovers what it can on the cancelled part. Your remaining tickets are unaffected. | Yes — check which legs are still booked and travel on those as planned. |

### Refund

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Refund in Progress**<br/><sub>(internally "Pending Refund")</sub> | The booking is cancelled and the desk is chasing the refund with the airline or operator. | The travel desk and the vendor. | Refunds usually take 7–10 working days. You will be emailed when it settles. | No — you do not need to chase this. Finance will contact you separately if any part is yours to settle. |
| **Partly Refunded**<br/><sub>(internally "Partially Refunded")</sub> | Some of the fare has come back. The rest is either still being chased or was not recoverable. | The travel desk. | The desk pursues the balance, then closes the request. | No. |
| **Fully Refunded** | The whole refundable amount has been recovered. | The travel desk. | The request is reconciled and closed. | No. |
| **No Refund Possible**<br/><sub>(internally "Written Off")</sub> | Nothing could be recovered on this booking, so the cost has been written off. | The travel desk. | The request is reconciled and closed. | Possibly — if any share falls to you, Finance will have been in touch. Otherwise nothing. |
| **Refund Disputed**<br/><sub>(internally "Disputed")</sub> | The desk disagrees with the vendor about what should come back, and Finance is involved. | Finance and the travel desk. | Once settled, the request is reconciled and closed. | No. |
| **Settled**<br/><sub>(internally "Reconciled")</sub> | The money side of this trip is finished and the books agree. | Nobody. | The request is closed. | No. |

### Closed

| Status | What it means | Who acts next | What happens next | Do you need to do anything? |
| :--- | :--- | :--- | :--- | :--- |
| **Closed** | This request is finished. Nothing further will happen on it. | Nobody. | Nothing. The request stays here as a record. | Only if you paid for something yourself on this trip — submit those expenses. |
| **Closed — Self-Booked**<br/><sub>(internally "Closed / Recorded - (self-booked)")</sub> | You booked this trip yourself and it has been recorded here afterwards for the records. | Nobody. | Nothing. The request stays here as a record. | Only if you are claiming the cost back — submit those expenses. |

_22 statuses in total. This table is generated from `utils/statusGuide.ts` — run `node scripts/generate-status-guide-doc.mjs` after changing it._

<!-- STATUS-GUIDE:END -->
