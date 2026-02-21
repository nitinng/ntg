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
* **Automated Communications**: Built-in, draftable mail templates to facilitate seamless communication between stakeholders.

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

## License 📄

This project is intended for internal use at Navgurukul.
