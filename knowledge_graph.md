# Navgurukul Travel Desk - Knowledge Graph

This document provides a knowledge graph of the Navgurukul Travel Desk web application. It outlines the codebase structure, component relationships, data models, and external dependencies.

## Architecture Overview

The web application is a React-based Single Page Application (SPA) built with Vite, TypeScript, and Supabase for backend services (database, authentication, etc.).

```mermaid
graph TD
    Client[Web Browser] --> ViteDevServer[Vite Dev Server :3000]
    ViteDevServer --> ReactApp[React Application]
    ReactApp --> SupabaseAPI[Supabase Backend]
    
    subgraph "Frontend Architecture"
        ReactApp --> AppMain[App.tsx - Main Router & State]
        AppMain --> UIComponents[UI Components]
        AppMain --> AuthState[Authentication State]
        AppMain --> DataModels[types.ts - Data Models]
    end
```

## Component Relationships

The application is structured around a main `App.tsx` file that coordinates different dashboards based on user roles (Admin, PNC, Finance, Employee).

```mermaid
graph TD
    App[App.tsx]
    
    subgraph "Core UI Components"
        App --> StatusBadge[StatusBadge.tsx]
        App --> Input[Input.tsx]
        App --> Select[Select.tsx]
        App --> TextArea[TextArea.tsx]
    end
    
    subgraph "Feature Components"
        App --> AuthView[AuthView.tsx]
        App --> NewRequestModal[NewRequestModal.tsx]
        App --> MailTemplatesView[MailTemplatesView.tsx]
        App --> PNCBookingModal[PNCBookingModal.tsx]
    end
    
    subgraph "Role-based Dashboards (in App.tsx)"
        App --> AdminDashboard[Admin Dashboard]
        App --> PNCDashboard[PNC Dashboard]
        App --> FinanceDashboard[Finance Dashboard]
        App --> ManagerApprovals[Manager Approvals View]
    end
```

## Data Models (`types.ts`)

The application relies on several core TypeScript interfaces and enums to manage state and database interactions.

```mermaid
classDiagram
    class User {
        +String id
        +String name
        +String email
        +UserRole role
        +String team
        +String department
        +String campus
    }
    
    class TravelRequest {
        +String id
        +String requesterId
        +TripType tripType
        +TravelMode mode
        +ApprovalStatus approvalStatus
        +PNCStatus pncStatus
        +Priority priority
        +Number ticketCost
        +PaymentStatus paymentStatus
    }
    
    class TimelineEvent {
        +String id
        +String timestamp
        +String actor
        +String event
    }
    
    class PolicyConfig {
        +Number flightNoticeDays
        +Number autoApproveBelowAmount
    }
    
    User "1" -- "*" TravelRequest : makes >
    TravelRequest "*" -- "*" TimelineEvent : has >
```

## Enums and Statuses

The workflow of a travel request is governed by several state machines defined as enums:

- **UserRole**: `Employee`, `PNC`, `Finance`, `Admin`
- **ApprovalStatus**: `Pending`, `Approved`, `Rejected`
- **PNCStatus**: `Not Started`, `Approval Pending`, `Rejected by Manager`, `Approved`, `Processing`, `Booked`, `Rejected by PNC`, `Closed`
- **PaymentStatus**: `Pending`, `Paid`, `Reimbursed`, `N/A`
- **TravelMode**: `Flight`, `Train`, `Bus`
- **TripType**: `One-way`, `Round-trip`
- **VerificationStatus**: `Incomplete`, `Pending Verification`, `Approved`, `Rejected`

## External Services & Config

```mermaid
graph LR
    App --> Supabase[Supabase Client]
    Supabase --> Env[VITE_SUPABASE_ANON_KEY]
    App --> Sonner[Sonner Toasts]
    App --> TailwindCSS[globals.css]
```

- **Vite Config (`vite.config.ts`)**: Configures the dev server, proxies `/supabase-api` to a specific Cloudflare IP (`104.18.38.10`) for Supabase to bypass ISP DNS issues, and uses `@vitejs/plugin-react`.
- **Database (`supabaseClient.ts`)**: Initializes the Supabase client using environment variables.
- **Mock Data (`mockData.ts`)**: Provides initial dummy users and travel requests for development without a live backend.
