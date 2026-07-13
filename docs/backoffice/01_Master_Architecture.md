# TappyAI Back Office Platform — Master Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the overall system architecture of the TappyAI Back Office Platform as a unified operational command center that serves all internal stakeholders across the full product lifecycle.

---

## 2. Design Philosophy

| Principle | Application |
|---|---|
| **Backend authoritative** | All business logic in Supabase + API. Back office UI is a read/write client. |
| **Single source of truth** | One analytics pipeline, one event schema, one permission system. |
| **Separation of concerns** | Analytics pipeline ≠ operational DB. Read paths ≠ write paths. |
| **Incremental complexity** | Start with Supabase direct queries. Add dedicated analytics DB only when query complexity demands it. |
| **Security depth** | Auth at every layer: middleware, API, RLS, audit. |

---

## 3. Platform Map

```mermaid
graph TD
    subgraph Clients
        WEB[Web App]
        AND[Android App]
        IOS[iOS App]
        BO[Back Office]
    end

    subgraph API_Layer["API Layer (Next.js)"]
        PUB[Public API Routes]
        ADM[Admin API Routes /api/admin/*]
    end

    subgraph Data_Layer["Data Layer (Supabase)"]
        AUTH[Supabase Auth]
        DB[(PostgreSQL)]
        STORAGE[Supabase Storage]
        REALTIME[Realtime]
    end

    subgraph Analytics_Layer["Analytics Layer"]
        TRACKER[Event Tracker]
        POSTHOG[PostHog]
        ROLLUP[Behavior Rollup Crons]
        SNAPSHOTS[Daily Snapshots]
    end

    subgraph External["External Services"]
        CLAUDE[Anthropic Claude]
        STRIPE[Stripe]
        APPLE[Apple App Store]
        PUSH[Web Push / APNs / FCM]
        VERCEL_BLOB[Vercel Blob]
    end

    WEB --> PUB
    AND --> PUB
    IOS --> PUB
    BO --> ADM

    PUB --> AUTH
    ADM --> AUTH
    PUB --> DB
    ADM --> DB

    WEB --> TRACKER
    AND --> TRACKER
    IOS --> TRACKER
    TRACKER --> DB

    ROLLUP --> DB
    ROLLUP --> SNAPSHOTS
    SNAPSHOTS --> DB

    PUB --> CLAUDE
    PUB --> STRIPE
    PUB --> APPLE
    PUB --> PUSH
    PUB --> VERCEL_BLOB
```

---

## 4. Back Office Module Map

```mermaid
graph LR
    subgraph Operations
        M01[Home Dashboard]
        M08[User Management]
        M09[Moderation]
        M10[Engagement Center]
        M11[CRM]
    end

    subgraph Intelligence
        M02[Product Analytics]
        M03[AI Analytics]
        M04[User Analytics]
        M05[Business Analytics]
        M06[Investor Dashboard]
        M16[Release Analytics]
    end

    subgraph Governance
        M12[RBAC]
        M13[Audit Log]
        M17[Reporting]
        M07[Export Center]
    end

    subgraph Engineering
        M14[System Monitoring]
        M15[AI Cost Monitoring]
        M18[Release Management]
        M19[Developer Tools]
    end

    subgraph Config
        M20[Settings]
        M21[Shared Services]
    end
```

---

## 5. Data Architecture Overview

### Three data layers

```mermaid
graph TD
    subgraph Operational["Operational DB (Supabase PostgreSQL)"]
        USERS[users / profiles]
        CONTENT[reviews / music / conversations]
        SOCIAL[interactions / follows / comments]
        PAYMENTS[subscriptions / iap_receipts]
        EVENTS[track_events — raw event log]
        AUDIT[audit_log — immutable]
    end

    subgraph Derived["Derived / Aggregated (Supabase PostgreSQL — same DB, separate schema)"]
        DAILY[daily_snapshots — per-day KPIs]
        COHORTS[cohort_metrics — D1/D7/D30]
        VERSION[version_analytics — per release]
        FEATURE[feature_usage_rollup]
    end

    subgraph External_Analytics["External Analytics"]
        PH[PostHog — funnel, session, heatmap]
    end

    EVENTS -->|cron rollup| DAILY
    EVENTS -->|cron rollup| COHORTS
    EVENTS -->|cron rollup| VERSION
    EVENTS -->|cron rollup| FEATURE
```

**Decision rationale:** A single PostgreSQL instance (Supabase) is sufficient for TappyAI MVP scale. Dedicated analytics DB (ClickHouse, BigQuery) is a future recommendation when daily event volume exceeds 10M rows.

---

## 6. Request Flow — Back Office

```mermaid
sequenceDiagram
    actor Admin
    participant BO as Back Office UI
    participant MW as Next.js Middleware
    participant API as /api/admin/* Route
    participant RBAC as RBAC Check
    participant DB as Supabase DB
    participant AL as Audit Log

    Admin->>BO: Action (e.g. suspend user)
    BO->>MW: HTTP Request + session cookie
    MW->>MW: Verify Supabase session
    MW->>API: Forward authenticated request
    API->>RBAC: Check permission (role, action, resource)
    RBAC-->>API: Allowed / Denied
    API->>DB: Execute operation
    DB-->>API: Result
    API->>AL: Write audit entry (async)
    API-->>BO: Response
    BO-->>Admin: Updated UI
```

---

## 7. URL Structure

All back office routes live under `/admin/`.

```
/admin                          → Home Dashboard
/admin/analytics/product        → Product Analytics
/admin/analytics/ai             → AI Analytics
/admin/analytics/users          → User Analytics
/admin/analytics/business       → Business Analytics
/admin/analytics/releases       → Release Analytics
/admin/investor                 → Investor Dashboard
/admin/reporting                → Reporting
/admin/users                    → User Management
/admin/users/[id]               → User 360
/admin/moderation               → Moderation Queue
/admin/moderation/[id]          → Moderation Case
/admin/engagement               → Engagement Center
/admin/engagement/campaigns     → Campaigns
/admin/engagement/notifications → Push Notifications
/admin/engagement/templates     → Templates
/admin/engagement/segments      → Audience Segments
/admin/crm/[id]                 → CRM — User 360 (detailed)
/admin/audit                    → Audit Log
/admin/rbac                     → Role Management
/admin/monitoring               → System Monitoring
/admin/ai-costs                 → AI Cost Monitoring
/admin/releases                 → Release Management
/admin/settings                 → Settings
/admin/dev-tools                → Developer Tools
/admin/export                   → Export Center
```

---

## 8. API Namespace

All back office API endpoints are under `/api/admin/`.

```
/api/admin/analytics/*      → Analytics data endpoints
/api/admin/users/*          → User management
/api/admin/moderation/*     → Moderation actions
/api/admin/engagement/*     → Campaigns + notifications
/api/admin/reports/*        → Report generation
/api/admin/audit/*          → Audit log queries
/api/admin/rbac/*           → Role + permission management
/api/admin/monitoring/*     → System health
/api/admin/ai-costs/*       → AI cost data
/api/admin/releases/*       → Release management
/api/admin/export/*         → Export generation
/api/admin/settings/*       → Platform settings
```

---

## 9. Technology Decisions

| Component | Technology | Rationale |
|---|---|---|
| Back office framework | Next.js App Router (same repo) | Zero new infra; shared auth + API layer; deploy to same Vercel project |
| UI component library | Shadcn/ui + Tailwind | Already used in main app; consistent design system |
| Charts | Recharts | Lightweight; React-native; already in ecosystem |
| Data tables | TanStack Table | Best-in-class for complex admin tables |
| Analytics store | Supabase PostgreSQL | Sufficient for MVP; avoids new infra dependency |
| External analytics | PostHog (existing) | Already integrated; funnel + session analytics |
| Export | Server-side generation via API routes | Keeps logic in backend |
| Auth | Supabase Auth (existing) | Same session as main app |
| Background jobs | Vercel Cron (existing) | Already used for rollups |

---

## 10. Security Architecture Summary

See `19_Security.md` for full detail.

| Layer | Mechanism |
|---|---|
| Network | HTTPS only; Vercel edge |
| Authentication | Supabase Auth session cookie |
| Route protection | Next.js middleware — redirect unauthenticated |
| Authorization | RBAC check in every `/api/admin/` route handler |
| Database | RLS policies; service role only for admin operations |
| Audit | Every admin action written to `audit_log` |
| Secrets | Vercel environment variables |

---

## 11. Strengths of Existing System

| Strength | Notes |
|---|---|
| Mature auth | Supabase Auth + middleware in production |
| Event tracking foundation | `tracker.ts` + `/api/track` already in use |
| Behavior rollup cron | Pattern exists, can be extended |
| PostHog already integrated | Funnel + session analytics ready |
| Supabase RLS | Security policies already on tables |
| Payment integration | Stripe + Apple IAP live |
| Push notification foundation | Web Push exists; FCM/APNs next |

---

## 12. Technical Debt Relevant to Back Office

| Debt | Impact | Remediation |
|---|---|---|
| `ADMIN_IDS` env var gate | Not scalable; no roles; no audit | Replace with `admin_roles` table + RBAC |
| Single `/admin/analytics` page | No real back office | Full module build |
| `track_events` stores raw JSON | No indexed analytics schema | Add `daily_snapshots` + rollup crons |
| PostHog only for web | Android/iOS not tracked in PostHog | Unified event schema (see `07_Event_Catalog.md`) |
| No audit log | Cannot trace admin actions | `audit_log` table (see `13_Audit_Log.md`) |
| Push notifications — web only | No FCM / APNs | Engagement center architecture (see `09_Notification_Architecture.md`) |

---

## 13. Future Recommendations

> These are NOT in scope for the approved architecture. Documented for future consideration only.

- **Dedicated analytics database** (ClickHouse or BigQuery) when daily events exceed 10M
- **Real-time WebSocket dashboard** (Supabase Realtime) for live concurrent user count
- **AI anomaly detection** for moderation (auto-flag, not auto-ban)
- **Multi-tenant back office** for future agency / white-label scenarios
- **Data warehouse** for long-term historical analysis
- **Customer support integration** (Intercom, Zendesk) via CRM module

---

*End of Master Architecture*
