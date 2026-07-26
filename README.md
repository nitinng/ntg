# NG Travel Desk ✈️

A comprehensive travel management and tracking application designed specifically for Navgurukul. This platform streamlines the process of requesting, approving, and managing travel for employees, with dedicated experiences for different organizational roles.

## Features ✨

* **Multi-Role Dashboards**: Custom interfaces and permissions for:
  * **Employees**: Submit travel requests, view booking statuses, and manage personal profiles.
  * **PNC (People and Culture)**: Review, approve, and process travel requests, manage policy violations, and track travel statuses.
  * **Finance**: Oversee travel budgets, process payments, and analyze costs.
  * **Admin**: Manage system policies, available travel modes, and generate comprehensive analytics.
* **Advanced Booking Flow**: Support for standard travel requests and specialized events (e.g., Igatpuri Meetup), complete with ticket tracking and availability calendars.
* **Policy Management**: Automated adherence tracking based on travel mode policies, providing instant violation feedback (badges and alerts) to reviewers.
* **Analytics & Reporting**: Detailed insights into travel expenditures, vendor costs, and invoice tracking.
* **Ticket Lifecycle State Machine**: Every request moves through a defined set of statuses (Not Started → Approval Pending/Processing → Booked/Rejected/Cancelled → Closed), with an audit trail of transitions. See [`ticket_lifecycle_flow.md`](./ticket_lifecycle_flow.md) for the full transition table and who gets notified at each step.
* **Mail Templates**: Admins can draft and publish mail templates keyed to specific status triggers (e.g. Approved, Rejected by PNC) via the Mail Templates view. Automated *dispatch* of these templates on status change is in progress — see [Roadmap](#roadmap--known-limitations) below.

## Documentation 📚

* [`ticket_lifecycle_flow.md`](./ticket_lifecycle_flow.md) — full state list, transition table, who gets emailed at each step, and edge cases (resubmission, cancellation, races).
* [`knowledge_graph.md`](./knowledge_graph.md) — component relationships, data models, and architecture overview.
* [`TEMPORARY_UNLOCK_FEATURE.md`](./TEMPORARY_UNLOCK_FEATURE.md) — details on the temporary document-upload unlock flow.

## Tech Stack 🛠️

* **Frontend**: React 19, TypeScript, Vite
* **Styling**: Custom CSS (Modern, premium aesthetic with smooth transitions and responsive design)
* **Backend / Database**: Supabase (PostgreSQL)

## Getting Started 🚀

### Prerequisites

* Node.js (v18 or higher recommended)
* npm (Node Package Manager)
* Supabase Account / Database

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ntg
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Database Setup:
   Ensure your Supabase project is configured using the provided SQL scripts (e.g., `supabase_schema.sql`).

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open your browser and navigate to the local development URL (usually `http://localhost:5173`).

## Roadmap / Known Limitations 🚧

The DB schema for a full ticket state machine (`ticket_status_history`, `ticket_violations`, `email_queue` — see `supabase/migrations/20260723140000_ticket_state_machine_schema.sql`) is in place, but the app doesn't fully use it yet. Current gaps:

* **On Hold info exchange**: PNC can move a ticket to On Hold without providing a reason, and the employee currently has no way to see what information is needed or reply in-platform.
* **Resubmission flow**: Employees can't yet edit and resubmit a request after it's Rejected by Manager or Rejected by PNC (`resubmission_count` exists as a column but isn't used).
* **Status history audit trail**: Transitions are currently tracked informally via a `timeline` JSON blob on each request, rather than the dedicated `ticket_status_history` table (which is only read for analytics, never written to).
* **Mail dispatch**: Templates can be authored and published, but no automated sending is wired up yet — `email_queue` exists in the schema but nothing inserts into or processes it.

These are being addressed incrementally; see `ticket_lifecycle_flow.md` for the target behavior.

## License 📄

This project is intended for internal use at Navgurukul.
