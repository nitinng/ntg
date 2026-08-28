# Navgurukul Travel Desk — Version & Changelog

All notable changes to the **Navgurukul Travel Desk** application are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Quick Navigation
* [Current Release — v2.4.0 (2026-08-28)](#v240---2026-08-28)
* [v2.3.0 (2026-08-28)](#v230---2026-08-28)
* [v2.2.0 (2026-07-28)](#v220---2026-07-28)
* [v2.1.0 (2026-07-26)](#v210---2026-07-26)
* [v2.0.0 (2026-07-23)](#v200---2026-07-23)
* [v1.5.0 (2026-07-16)](#v150---2026-07-16)
* [v1.0.0 (2026-02-28)](#v100---2026-02-28)

---

## [v2.4.0] - 2026-08-28

### 🚀 Production-Safe Transactional Email Engine & Template Authoring

Major milestone connecting travel lifecycle state transitions to an asynchronous email queue, Gmail API / Amazon SES provider layer, and template management.

#### ✨ Features & Improvements
* **Template Authoring Layer (`MailTemplatesView.tsx`)**:
  * Status-driven template lifecycle: `Published`, `Drafts`, and `Archived`.
  * Real-time template versioning (`version` counter) and edit history drawer tracking `changed_by`, `changed_at`, action types (`Created`, `Edited`, `Published`, `Moved to Draft`, `Archived`), and subject diffs.
  * One-click dynamic variable helper pills (`{{request_id}}`, `{{requester_name}}`, `{{origin}}`, `{{destination}}`, `{{departure_date}}`, `{{travel_mode}}`, `{{estimated_cost}}`, `{{booking_reference}}`, `{{rejection_reason}}`, `{{portal_url}}`).
* **Sent Mails & Delivery Observability (`SentMailsView.tsx`)**:
  * Outgoing email tracking with live delivery badges (`Sent`, `Pending`, `Processing`, `Failed`).
  * Live HTML & JSON payload inspector modal.
  * Template-powered Test Email Sender with dropdown selector and prefilled sample variables.
  * Outgoing queue purge action ("Clear Queue") and manual worker trigger ("Trigger Worker Now").
  * Categorized filtering: `All Types`, `Live Production`, and `Test Mails`.
* **Centralized Global CC Configuration (`PolicyManagement.tsx`)**:
  * Central settings card for Global Email CC (`travel.team@navgurukul.org`, `nitin.s@navgurukul.org`).
  * Duplicate prevention, email format validation, and persistence to `public.settings`.
* **Authoritative Routine Specification**:
  * Published `mail_sender_routine.md` documenting all 17 lifecycle trigger events, recipient mapping, CC resolution, and idempotency guarantees.

#### 🔒 Database Migrations & Security
* `20260828160000_transactional_email_system.sql`:
  * Added `status`, `version`, and `audience` columns to `public.mail_templates`.
  * Created `public.mail_template_history` table with Row Level Security (RLS) policies for Staff/Admins.
  * Seeded 17 default production-ready HTML templates.
* `20260828130000_enhance_email_queue.sql`:
  * Enhanced `public.email_queue` with composite idempotency key and nullable ticket references for standalone test emails.

#### 🧪 Automated Test Suite
* Added 95 passing Vitest tests across 18 test files:
  * `tests/emailLifecycleRoutine.test.ts` (Positive lifecycle triggers)
  * `tests/mailTemplateVersioning.test.ts` (Draft/Published lifecycle & audit history)
  * `tests/globalCcSettings.test.ts` (Global CC validation & deduplication)
  * `tests/emailProviderFailureIsolation.test.ts` (Resilience against provider/database errors)

#### 📝 Commits in this Release
* `f62cde6` — `feat(email): complete end-to-end transactional email system with audit history and global CC`
* `220f59b` — `fix(edge-function): add CORS response headers to process-email-queue`
* `ea6c05a` — `fix(email): resolve template_name schema mismatch and allow standalone test emails in email_queue`
* `7c33103` — `feat(email): add Clear Queue button to purge old email records`
* `d64246f` — `feat(email): add Sent Mails delivery tracking view, test email sender, and queue trigger`

---

## [v2.3.0] - 2026-08-28

### 🏗️ Domain Modularization & Provider Abstraction

#### ✨ Features & Architecture
* **Modularized App Architecture**:
  * Decomposed monolithic `App.tsx` into standalone domain views: `AdminDashboard`, `PNCDashboard`, `FinanceDashboard`, `ManagerApprovalsView`, `PolicyManagement`, `RequestDetailOverlay`, and `EmployeeGuideView`.
  * Added lazy-loading code splitting (`React.lazy` + `Suspense`) for optimal bundle load times.
* **Email Provider Strategy Pattern**:
  * Provider abstraction separating Gmail API provider and Amazon SES provider behind a unified `IEmailProvider` interface.
  * MIME RFC 2822 email payload builder with base64url encoding and multipart attachment support.
  * Supabase Edge Function `process-email-queue` with exponential backoff retry logic.

#### 📝 Commits in this Release
* `5cfc119` — `refactor(architecture): modularize App.tsx into dedicated domain view components and services`
* `ab4932e` — `Implement production-safe email architecture with Gmail API and SES provider abstraction`
* `3cf4dcf` — `Add production-safe test coverage for critical business workflows`
* `6db2d61` — `Improve Supabase local dev networking and remove hardcoded IP pinning`
* `c938031` — `Add env files to .gitignore and untrack .env`

---

## [v2.2.0] - 2026-07-28

### 📊 Analytics Overhaul & Design Polish

#### ✨ Features & Fixes
* **Advanced Analytics Dashboard**:
  * Enhanced PNC, Finance, and Admin analytics with paginated tables, travel spend graphs, SLA turnaround metrics, and status breakdowns.
* **UI/UX Consistency**:
  * Synchronized dark mode CSS transitions to 200ms project-wide.
  * Added `EmployeeGuideView` detailing policies, booking flows, and reimbursement rules.

#### 📝 Commits in this Release
* `4961d4c` — `Merge branch 'feat/ticket-cancellation-logic'`
* `cdefed0` — `Update PNC, Finance, and Admin Analytics with comprehensive paginated dashboards and layout fixes`
* `657f26e` — `Merge pull request #9 from nitinng/feat/ticket-cancellation-logic`
* `1805ce6` — `style: synchronize dark mode transition durations to 200ms project-wide`
* `d122112` — `feat: add Employee Travel Guide view and update branding to NG Travel Desk`
* `964ec73` — `Enhance README with new features and documentation`

---

## [v2.1.0] - 2026-07-26

### 🔄 Multi-Leg Ticket Cancellation & Policy Splits

#### ✨ Features & Compliance
* **Leg-by-Leg Cancellation Engine**:
  * Support for partial trip leg cancellations vs full booking cancellations.
  * Dynamic calculation of Navgurukul vs Employee cost absorption splits based on cancellation origin (PNC vs Employee).
  * Advance recovery and finance reconciliation workflows.
* **Department Management & Testing Tools**:
  * Added `departments` table and management dashboard for organizing campus departments.
  * Added `TestingSettingsView` for testing form validation bypass toggles in staging.

#### 📝 Commits in this Release
* `0677409` — `Merge pull request #8 from nitinng/feat/ticket-cancellation-logic`
* `3b17f5c` — `Complete ticket state machine, fix On Hold / resubmission gaps, wire up email queue and history triggers, and add audience to mail templates`
* `fdf00d9` — `feat: add testing settings dashboard and conditional form validation bypass`
* `f7e0e5b` — `feat: add departments table, management dashboard, and dropdown dropdown integration`
* `4e3e251` — `fix: active bookings filter for closed tickets and split ticket property validation`
* `a102fc3` — `feat: complete ticket cancellation & advance reconciliation rework with dashboard grouping and strict database error checks`
* `cd84199` — `feat: ticket cancellation logic, leg-by-leg multi-cancellation, policy split sync, and advance reconciliation`

---

## [v2.0.0] - 2026-07-23

### ⚡ Ticket State Machine & Interactive Flowchart

#### ✨ Features
* Replaced legacy Sankey diagram with interactive SVG/HTML Flowchart in PNC Dashboard.
* Formalized ticket state machine transitions (`Not Started` → `Approval Pending` → `Approved` → `Processing` → `Booked` → `Closed`).
* Bundle optimization with manual code chunking and tree shaking.

#### 📝 Commits in this Release
* `f92dce0` — `Merge pull request #7 from nitinng/feat/dashboard-flowchart`
* `9640e3f` — `feat: Replace Sankey with native Flowchart in PNC Dashboard & migrate SQL endpoints`
* `1a43279` — `Merge pull request #6 from nitinng/cleanup-refactoring`
* `0594595` — `fix: remove invalid // property from vercel.json for Vercel schema validation`
* `6a38936` — `Merge pull request #5 from nitinng/cleanup-refactoring`
* `8806722` — `refactor: modularize components, add routing, fix types, and optimize bundle size`

---

## [v1.5.0] - 2026-07-16

### 💬 Real-Time Chat & Authentication Modes

#### ✨ Features
* Real-time employee-to-PNC chat support with thread management and unread message indicators.
* Dual authentication support: Google OAuth + Email/Password authentication toggle.
* Tailwind CSS responsive styling with dark mode theme support.

#### 📝 Commits in this Release
* `5150f81` — `Merge pull request #4 from nitinng/_v02.01`
* `c62e776` — `feat: add Tailwind CSS support, create robots.txt, and refactor data fetching in App.tsx to use parallel execution`
* `8f81355` — `feat: add beta feature banner to main application header`
* `74a3688` — `feat: add global toggle for email/password authentication and implement AuthView component`
* `4338e45` — `feat: add real-time chat functionality with thread management and message persistence`

---

## [v1.0.0] - 2026-02-28

### 🎯 Initial Core Travel Desk Release

* Core travel request form submission, manager approval routing, PNC booking queue, and profile management.
* Supabase PostgreSQL database integration with profiles, policies, and role management.
* Igatpuri campus meetup availability coordination system.
