# Navgurukul Travel Desk — Version & Changelog

All notable changes to the **Navgurukul Travel Desk** application are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **This file is the single source of truth.** The in-app **Version & Changelog** screen and the
> version in the Settings footer are parsed from this file at build time (`utils/changelog`), so a
> release documented here appears in the app with no code change. Keep the structure below: a
> `## [vX.Y.Z] - YYYY-MM-DD` heading, a `### Title`, a `> **Badge** — summary` blockquote, one or
> more `#### Category` sections of bullets, and a `#### 📝 Commits in this Release` list whose
> entries read ``* `hash` — `message` `` with an optional `— Author — YYYY-MM-DD` suffix.

---

## Quick Navigation
* [Current Release — v2.7.0 (2026-10-09)](#v270---2026-10-09)
* [v2.6.0 (2026-10-01)](#v260---2026-10-01)
* [v2.5.0 (2026-09-28)](#v250---2026-09-28)
* [v2.4.0 (2026-08-28)](#v240---2026-08-28)
* [v2.3.0 (2026-08-28)](#v230---2026-08-28)
* [v2.2.0 (2026-07-28)](#v220---2026-07-28)
* [v2.1.0 (2026-07-26)](#v210---2026-07-26)
* [v2.0.0 (2026-07-23)](#v200---2026-07-23)
* [v1.5.0 (2026-07-16)](#v150---2026-07-16)
* [v1.0.0 (2026-02-28)](#v100---2026-02-28)

---

## [v2.7.0] - 2026-10-09

### 🔐 Security Hardening, Booking Validation & Live Email Usage

> **Security & Access** — Closed privilege-escalation and row-level-security gaps across profiles, ticket violations, request counters and file storage, locked the email queue down to authorised senders and sanitised email HTML before it is rendered to staff, plus booking form validation and a live email usage graph.

#### 🔒 Security & Access Control
* Stopped users escalating their own role through a direct `profiles` update.
* Scoped `ticket_violations` and request audit history to staff roles, with PNC Admin included in the policies.
* Enabled row-level security on `request_counters`.
* Made storage buckets private and served invoices through signed URLs, anchoring the ownership match on the path separator.
* Constrained which recipients an employee can queue email to, and required authorization on the `process-email-queue` edge function.
* Sanitised email HTML before rendering it in staff-facing views.
* Made the `ticket_violations` migration re-runnable, named the dollar-quote tags in the email queue migration, and rewrote the queue guard without a CTE body.
* Documented how to apply the email queue migration by hand.

#### ✨ Features & Improvements
* Live past-usage graph in the Email Center with trend lines and filters.
* Booking form validation with the related UI updates.
* Policy management restricted to PNC Admin, and the changelog hidden from PNC and Finance roles.
* Renamed the `Closed / Recorded` ticket status to cover self-booked trips across types, email templates, scripts and migrations.

#### 🐛 Fixes
* Restored employees' ability to submit travel requests.

#### 📝 Commits in this Release
* `7b5dba6` — `fix(security): require authorization in the email queue edge function` — Claude — 2026-10-09
* `b662e79` — `fix(security): enable row-level security on request_counters` — Claude — 2026-10-08
* `7c33163` — `docs(security): record how to apply the email queue migration by hand` — Claude — 2026-10-08
* `8c83f60` — `fix(security): rewrite the email queue guard without a CTE body` — Claude — 2026-10-08
* `e2fa089` — `fix(security): name the dollar-quote tags in the email queue migration` — Claude — 2026-10-08
* `aac7749` — `fix(security): constrain who an employee can queue email to` — Claude — 2026-10-08
* `1c86aad` — `fix(security): sanitise email HTML before rendering it in staff views` — Claude — 2026-10-08
* `c0f38a6` — `fix(security): make the ticket_violations migration re-runnable` — Claude — 2026-10-08
* `4d5ec81` — `fix(security): include PNC Admin in the ticket_violations policies` — Claude — 2026-10-08
* `2a10a20` — `fix(security): anchor invoice ownership match on the path separator` — Claude — 2026-10-08
* `987b2aa` — `fix(security): make storage buckets private and serve signed URLs` — Claude — 2026-10-08
* `abe4d82` — `fix(security): scope ticket_violations and audit history to staff` — Claude — 2026-10-08
* `5f61a1c` — `fix(security): stop users escalating their own profile role` — Claude — 2026-10-08
* `3013a1c` — `fix(requests): let employees submit travel requests again` — Claude — 2026-10-05
* `6525179` — `chore: update status string in migrations` — Nitin Sudarshan — 2026-10-02
* `07bd1f0` — `chore: update status string in email templates and scripts` — Nitin Sudarshan — 2026-10-02
* `8c79362` — `chore: rename Closed / Recorded status in types to include self-booked` — Nitin Sudarshan — 2026-10-02
* `bc1e13b` — `feat(email-center): implement live past usage graph with trend lines and filters` — Nitin Sudarshan — 2026-10-01
* `da06a08` — `feat(booking): implement booking form validation and related UI updates` — Nitin Sudarshan — 2026-10-01
* `bfc9183` — `feat(access): restrict policies to PNC Admin and remove changelog for PNC and Finance` — Nitin Sudarshan — 2026-10-01

---

## [v2.6.0] - 2026-10-01

### ✉️ Dual SMTP Slot Router & Scalable Email Architecture

> **Email Architecture** — Dual-slot SMTP routing that spreads outgoing mail across two provider accounts with per-account quota tracking and independent connection tests, email queue and template schema updates, automatic progression of approved requests to Processing, and removal of hardcoded mail credentials from source and seed data.

#### ✨ Features & Architecture
* **Dual SMTP Routing Engine**:
  * Added a robust dual-slot SMTP router allowing the application to distribute outgoing emails across two different SMTP provider accounts.
  * Increased combined daily sending quota limits tracking to 4000 emails per day.
  * Real-time exposed per-account usage quotas and available slots directly in the Email/Provider settings UI.
  * Integrated dedicated test functionalities to independently verify the connection health of each configured SMTP account.
* **Email Queue Improvements**:
  * Updated database schema for the email queue and templates to support the new routing setup.
  * Implemented automatic ticket state progression, automatically advancing approved requests to `Processing` state while concurrently queuing the necessary notification emails.
  
#### 🔒 Security & Credentials Management
* Removed hardcoded Amazon SES and generic SMTP credentials from the application source code.
* Cleared exposed/seeded SMTP and SES credentials from the initial `provider_config` database schemas to ensure production security.

### 📊 Analytics Design Polish
* Upgraded analytics dashboard sub-tabs to a modern segmented pill bar with live metrics.
* Aligned sub-tabs and time-range pills to the reference design.

#### 📝 Commits in this Release
* `ab8bf34` — `fix(db): clear seeded SMTP and SES credentials from provider_config`
* `06d979b` — `fix(email): remove hardcoded SES SMTP credentials from source`
* `4a775d6` — `feat(email): show per-account quota and test each SMTP account`
* `81a534e` — `feat(email): route queue sends across both SMTP accounts`
* `e490069` — `feat(email): expose per-account SMTP usage and slot settings`
* `4df1293` — `feat(db): track SMTP usage per account and raise quota to 4000`
* `b4b5453` — `feat(email): add dual SMTP slot router`
* `020bcb2` — `feat(db): add email templates, RLS/routing, and update email queue columns`
* `8ac2b39` — `feat(app): auto-advance approved requests to processing and queue emails`
* `4bf6819` — `style(analytics): upgrade sub-tabs to modern segmented pill bar with live metrics`
* `87bf176` — `style(analytics): align sub-tabs and time-range pills to reference design`

---

## [v2.5.0] - 2026-09-28

### 🎨 Dark Mode Neutral Palette Alignment, Email Templates & Booking Urgency Settings

> **Design System** — Aligned dark mode to the PNC ELC pure neutral palette, fixed invalid Tailwind shade classes, added the official NavGurukul brand logo to email templates, aligned the navbar active role tab background with the header, and added booking urgency and SLA settings.

#### 🎨 Dark Mode Neutral Palette Alignment (PNC ELC)
* Dark mode aligned to neutral palette (matches PNC ELC); fixed ~300 invalid Tailwind shade classes across 30+ components.
* Remapped `slate` palette through CSS variables (`--slate-50` to `--slate-950`) to resolve to shadcn pure neutral tones in `.dark` mode while keeping light mode pixel-identical.
* Synchronized Mermaid diagrams, custom scrollbars, and SVG tooltips to pure neutral dark styling on theme toggle.
* Navbar active role tab background aligned directly to the navbar header background (`dark:bg-slate-900`), and dark mode theme toggle styled with clean neutral container and warm amber sun.

#### ✉️ Email Templates & Brand Identity
* Email templates updated with official NavGurukul brand logo image header, orange divider rule (`#FF6B35`), live preview toggle in template editor, and CTA links redirected to `https://ng-travel-desk.vercel.app/`.
* Mail template modals fixed with strict 90vw width and 90vh height dimensions.
* Supabase RLS policy updated allowing all authenticated staff (Admin, PNC, Finance) to access mail templates and history.

#### ⚡ Dynamic Booking Urgency & Configurable SLA Architecture
* **Dynamic Urgency Progression Engine**:
  * Removed static default urgency dropdown in favor of an automated rule-based progression engine based on days remaining to travel:
    * **Critical**: `< 2 days`
    * **High**: `2 – 10 days`
    * **Medium**: `10 – 20 days`
    * **Low**: `> 20 days`
  * When a booking request is raised with 22 days to go, it automatically starts at Low; as time progresses and days drop below 20, it automatically escalates to Medium, High, and Critical.
  * Replaced jarring saturated urgency colors with refined modern soft pastel badges (`rose-500/10`, `amber-500/10`, `sky-500/10`, `emerald-500/10`).
* **Configurable SLA Target System**:
  * **Generic SLA Targets**: Configurable turnaround times for Manager Approval (default 24h), PNC Processing (default 48h), and Ticketing Fulfillment (default 72h).
  * **Urgency SLA Toggle**: Added an active toggle to enable tier-specific turnaround targets (Critical: 4h, High: 12h, Medium: 24h, Low: 48h) or fall back to the standard generic 72h ticketing target.
  * Polished neutral input containers across Settings (`SettingsView.tsx`) and Policies (`PolicyManagement.tsx`).

#### 📊 Analytics "TAT and SLAs" Intelligence Hub
* Added a dedicated 4th sub-tab **"TAT and SLAs"** directly after `Cancellations & Recovery` in `AnalyticsView.tsx`.
* **Executive Performance KPIs**: Overall SLA Compliance rate (%), Average Fulfillment TAT, Average Manager Approval TAT, and Breached / At Risk request counters.
* **Active Policy Status Banner**: Real-time indicator displaying whether Standard or Urgency-Tiered SLA enforcement is active.
* **Performance by Urgency Tier Matrix**: 4 distinct metric cards displaying days to travel rule, Target SLA vs Actual Average TAT, breach counts, and compliance progress bar.
* **Lifecycle Stage Bottleneck Diagnostic**: Visual progress pipeline breaking down turnaround time across Manager Approval, PNC Processing, and Ticketing Fulfillment to isolate delays.
* **Campus SLA Scorecard**: Campus rankings evaluated by ticket compliance %, breach volume, and average fulfillment turnaround.
* **Individual Request SLA Audit Ledger**: Detailed audit table with real-time text search, urgency tier filtering, SLA state filtering (`Met`, `On Track`, `At Risk`, `Breached`), sortable columns, and clean pagination.
* **Dedicated CSV Export**: Generates full audit ledger CSV export covering travel date, urgency tier, days to travel, SLA targets, and stage hours.

#### 📝 Commits in this Release
* `1e30236` — `feat(settings): add booking urgency configuration and wire into request flow and policies`
* `36c5a64` — `docs(changelog): document v2.5.0 dark mode palette, navbar polish, and email template updates`
* `13298f7` — `feat(email): embed official brand logo in email templates, redirect CTA to vercel, and add editor live preview`
* `68bd947` — `fix(navbar): align active role tab background to header and polish dark mode theme toggle`
* `8baf06b` — `style(theme): align dark mode to PNC ELC neutral palette and fix invalid Tailwind classes`

---

## [v2.4.0] - 2026-08-28

### 🚀 Production-Safe Transactional Email Engine & Template Authoring

> **Email Engine** — Full end-to-end transactional email integration connecting the travel lifecycle state machine to versioned mail templates, asynchronous queueing, Gmail API / Amazon SES dispatch, and operational delivery observability.

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

> **Architecture** — Decomposed the monolithic App.tsx into specialized domain view modules and established the pluggable email provider strategy architecture.

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

> **UI & Analytics** — Enhanced PNC, Finance, and Admin analytics with paginated data views, spend analytics, and project-wide transition optimizations.

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

> **Operations** — Engineered leg-by-leg cancellation workflows, automatic cost split calculations (Navgurukul vs Employee), and finance advance reconciliation.

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

> **Core Engine** — Standardized the ticket state machine lifecycle, replaced the Sankey diagram with an interactive SVG flowchart, and streamlined the bundle footprint.

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

> **Collaboration** — Real-time employee-to-PNC chat with thread management and unread indicators, dual Google OAuth and email/password authentication, and Tailwind-based responsive styling with dark mode support.

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

> **Initial Release** — Core travel request submission, manager approval routing, PNC booking queue, and profile management, backed by Supabase PostgreSQL and Igatpuri campus meetup coordination.

* Core travel request form submission, manager approval routing, PNC booking queue, and profile management.
* Supabase PostgreSQL database integration with profiles, policies, and role management.
* Igatpuri campus meetup availability coordination system.
