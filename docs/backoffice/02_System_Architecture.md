# TappyAI Back Office — System Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the infrastructure, deployment, and system-level architecture of the TappyAI Back Office Platform.

---

## 2. Deployment Architecture

```mermaid
graph TD
    subgraph Internet
        ADMIN_USER[Admin User — Browser]
    end

    subgraph Vercel["Vercel (Existing Project)"]
        EDGE[Vercel Edge Network / CDN]
        NEXT[Next.js App — App Router]
        CRONS[Vercel Cron Jobs]
        BLOB[Vercel Blob Storage]
    end

    subgraph Supabase["Supabase (Existing Project)"]
        SAUTH[Supabase Auth]
        PG[(PostgreSQL)]
        STORAGE[Supabase Storage]
        REALTIME[Supabase Realtime]
    end

    subgraph External
        CLAUDE_API[Anthropic API]
        POSTHOG[PostHog Cloud]
        STRIPE[Stripe]
        WEBPUSH[Web Push / FCM / APNs]
    end

    ADMIN_USER -->|HTTPS| EDGE
    EDGE --> NEXT
    NEXT --> SAUTH
    NEXT --> PG
    NEXT --> STORAGE
    NEXT --> BLOB
    CRONS --> NEXT
    NEXT --> CLAUDE_API
    NEXT --> POSTHOG
    NEXT --> STRIPE
    NEXT --> WEBPUSH
```

**Decision:** The Back Office is deployed as additional routes within the **same Vercel project and Next.js application**. This is the correct choice because:
- Zero additional infrastructure cost
- Shared authentication with the main app
- Shared Supabase client + RLS
- Shared environment variables
- Single deployment pipeline
- Admin session reuses user session (no separate login)

---

## 3. Application Structure

The back office lives within the existing Next.js project at `src/app/admin/`.

```
src/
├── app/
│   ├── admin/                          ← Back office root
│   │   ├── layout.tsx                  ← Admin shell (nav + auth guard)
│   │   ├── page.tsx                    ← Home dashboard
│   │   ├── analytics/
│   │   │   ├── product/page.tsx
│   │   │   ├── ai/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── business/page.tsx
│   │   │   └── releases/page.tsx
│   │   ├── investor/page.tsx
│   │   ├── reporting/page.tsx
│   │   ├── users/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── moderation/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── engagement/
│   │   │   ├── page.tsx
│   │   │   ├── campaigns/page.tsx
│   │   │   ├── notifications/page.tsx
│   │   │   ├── templates/page.tsx
│   │   │   └── segments/page.tsx
│   │   ├── crm/[id]/page.tsx
│   │   ├── audit/page.tsx
│   │   ├── rbac/page.tsx
│   │   ├── monitoring/page.tsx
│   │   ├── ai-costs/page.tsx
│   │   ├── releases/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── dev-tools/page.tsx
│   │   └── export/page.tsx
│   └── api/
│       └── admin/                      ← Admin API routes
│           ├── analytics/
│           ├── users/
│           ├── moderation/
│           ├── engagement/
│           ├── reports/
│           ├── audit/
│           ├── rbac/
│           ├── monitoring/
│           ├── ai-costs/
│           ├── releases/
│           ├── export/
│           └── settings/
├── components/
│   └── admin/                          ← Back office UI components
│       ├── layout/
│       │   ├── AdminShell.tsx          ← Navigation + sidebar
│       │   ├── AdminNav.tsx
│       │   └── AdminBreadcrumb.tsx
│       ├── charts/                     ← Chart components
│       ├── tables/                     ← Data table components
│       ├── cards/                      ← KPI cards
│       └── shared/                     ← Shared UI primitives
└── lib/
    └── admin/                          ← Back office business logic
        ├── rbac.ts                     ← Permission checking
        ├── audit.ts                    ← Audit log writing
        ├── analytics/                  ← Analytics query helpers
        ├── moderation/
        ├── engagement/
        └── reports/
```

---

## 4. Authentication Flow

```mermaid
sequenceDiagram
    actor Admin
    participant Browser
    participant Middleware as Next.js Middleware
    participant Auth as Supabase Auth
    participant RBAC as RBAC Check (lib/admin/rbac.ts)
    participant Page as Admin Page

    Admin->>Browser: Navigate to /admin/*
    Browser->>Middleware: GET /admin/dashboard
    Middleware->>Auth: getUser() from session cookie
    Auth-->>Middleware: User | null
    alt Not authenticated
        Middleware-->>Browser: Redirect to /login?redirect=/admin/*
    else Authenticated
        Middleware->>RBAC: hasAdminAccess(user.id)
        alt No admin role
            Middleware-->>Browser: Redirect to /reviews (403)
        else Has admin role
            Middleware-->>Page: Render page with user context
        end
    end
```

**Transition plan from current system:**

Current: `ADMIN_IDS` env var in `src/lib/admin.ts`  
Target: `admin_roles` table in Supabase with role-based permissions  
Migration: Seed existing `ADMIN_IDS` into `admin_roles` table as `super_admin` during implementation

---

## 5. Data Flow Architecture

### 5.1 Write Path (Product App → Analytics)

```mermaid
graph LR
    APP[Product App — Web/Android/iOS] -->|POST /api/track| TRACK_API[Track API]
    TRACK_API -->|INSERT| TRACK_EVENTS[(track_events table)]
    TRACK_EVENTS -->|Cron every 1h| ROLLUP[Behavior Rollup]
    ROLLUP -->|INSERT/UPSERT| DAILY_SNAP[(daily_snapshots)]
    ROLLUP -->|INSERT/UPSERT| FEATURE_ROLLUP[(feature_usage_rollup)]
    ROLLUP -->|INSERT/UPSERT| COHORT[(cohort_metrics)]
    ROLLUP -->|INSERT/UPSERT| VERSION_ANALYTICS[(version_analytics)]
```

### 5.2 Read Path (Back Office → Analytics)

```mermaid
graph LR
    BO[Back Office UI] -->|GET /api/admin/analytics/*| ADMIN_API[Admin API]
    ADMIN_API -->|SELECT| DAILY_SNAP[(daily_snapshots)]
    ADMIN_API -->|SELECT| FEATURE_ROLLUP[(feature_usage_rollup)]
    ADMIN_API -->|SELECT| COHORT[(cohort_metrics)]
    ADMIN_API -->|SELECT| VERSION_ANALYTICS[(version_analytics)]
    ADMIN_API -->|SDK| POSTHOG[PostHog API]
```

---

## 6. Cron Job Architecture

### Existing Crons (to be extended)

| Cron | Schedule | Current Purpose | Back Office Extension |
|---|---|---|---|
| `behavior-rollup` | Hourly | Affinity graph rollup | Extend to populate `daily_snapshots` |
| `morning-brief` | Daily 07:00 VN | User notifications | Add snapshot finalization |
| `weekly-recap` | Weekly | User recap | Add weekly business metrics |

### New Crons Required

| Cron | Schedule | Purpose |
|---|---|---|
| `analytics-snapshot` | Daily 00:05 VN (Asia/Ho_Chi_Minh, UTC+7 = 17:05 UTC) | Finalize yesterday's metrics into `daily_snapshots` |
| `cohort-rollup` | Daily 00:10 UTC | Compute D1/D7/D30 cohort retention |
| `ai-cost-rollup` | Hourly | Aggregate AI token usage + cost |
| `notification-delivery-check` | Every 15min | Update delivery + open rates |

---

## 7. Environment Variables — Back Office Additions

| Variable | Purpose | Secret? |
|---|---|---|
| `BACKOFFICE_ENABLED` | Feature flag to enable/disable back office | No |
| `POSTHOG_SECRET_KEY` | PostHog server-side API key for analytics queries | Yes |
| `REPORT_GENERATION_SECRET` | HMAC key for signed report download URLs | Yes |
| `AUDIT_LOG_RETENTION_DAYS` | How long to retain audit logs (default: 365) | No |

---

## 8. Performance Considerations

| Concern | Strategy |
|---|---|
| Heavy analytics queries | Use pre-computed `daily_snapshots` — never query raw `track_events` for dashboard |
| Large user tables | Paginate all user list endpoints (cursor-based) |
| Report generation | Async generation + signed download URL; not synchronous streaming |
| Dashboard load time | Server-side render KPI cards; client-side hydrate charts |
| Concurrent admin users | Supabase connection pooling (PgBouncer) handles this |

---

## 9. Security Considerations

| Risk | Mitigation |
|---|---|
| Unauthorized admin access | RBAC in middleware + every API route handler |
| Privilege escalation | Only `super_admin` can assign roles; role changes are audit logged |
| Data exfiltration | Export endpoints require explicit permission; rate limited |
| CSRF on admin actions | Supabase session cookies are HttpOnly + SameSite=Lax |
| Sensitive data in logs | PII excluded from `track_events` payload; hashed user IDs in analytics |

---

## 10. Scalability Path

| Phase | Scale | Architecture |
|---|---|---|
| MVP | < 100K MAU | Supabase PostgreSQL for everything |
| Growth | 100K–1M MAU | Add read replicas; separate analytics schema |
| Scale | > 1M MAU | Dedicated analytics DB (ClickHouse/BigQuery); async export pipeline |

The architecture at MVP phase must NOT over-engineer for Growth/Scale phases. Design extension points, not premature infrastructure.

---

*End of System Architecture*
