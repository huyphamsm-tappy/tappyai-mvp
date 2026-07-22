# TappyAI Back Office Platform — Architecture Documentation

**Status:** ✅ **Architecture v1.1 — APPROVED** (owner-approved 2026-07-13, ADR-013; supersedes frozen v1.0 / ADR-012)  
**Created:** 2026-07-13  
**Reviewed & Approved:** 2026-07-13 (Chief Architect review + owner sign-off)  
**Author:** Architecture Session

> **FROZEN.** Implementation may now begin against these documents and the roadmap (`23`). Any architectural change requires a new ADR (`22`) with explicit owner approval **before** implementation. See `30_Architecture_Review_Report.md` for the review that led to approval.

---

## What is this?

This directory contains the official architecture blueprint for the TappyAI Back Office Platform — the unified operational command center for the entire TappyAI ecosystem.

This documentation is the **single source of truth** for all future implementation.

No implementation begins without owner approval of these documents.

---

## Document Index

| Document | Title | Summary |
|---|---|---|
| [00_Constitution.md](00_Constitution.md) | Constitution | Supreme governing law. All rules that override everything else. |
| [01_Master_Architecture.md](01_Master_Architecture.md) | Master Architecture | System-wide blueprint, platform map, technology decisions. |
| [02_System_Architecture.md](02_System_Architecture.md) | System Architecture | Infrastructure, deployment, application structure, data flow. |
| [03_Module_Architecture.md](03_Module_Architecture.md) | Module Architecture | All 20 modules: purpose, sections, data sources. |
| [04_Database_Architecture.md](04_Database_Architecture.md) | Database Architecture | All new tables with complete schemas, indexes, and RLS policies. |
| [05_API_Architecture.md](05_API_Architecture.md) | API Architecture | Complete `/api/admin/*` endpoint catalog with request/response contracts. |
| [06_Analytics_Architecture.md](06_Analytics_Architecture.md) | Analytics Architecture | Unified analytics pipeline across Web, Android, iOS. |
| [07_Event_Catalog.md](07_Event_Catalog.md) | Event Catalog | Every trackable event with canonical names and properties. |
| [08_Reporting_Architecture.md](08_Reporting_Architecture.md) | Reporting Architecture | PDF/Excel/Word/CSV/JSON report generation. |
| [09_Notification_Architecture.md](09_Notification_Architecture.md) | Notification Architecture | Engagement center: Web Push, FCM, APNs, In-App. |
| [10_User_Management.md](10_User_Management.md) | User Management | User search, User 360, suspend/ban/delete, bulk actions. |
| [11_Moderation.md](11_Moderation.md) | Moderation | Content moderation queue, AI-assisted flagging, case management. |
| [12_RBAC.md](12_RBAC.md) | RBAC | Role-based access control: roles, permission matrix, implementation. |
| [13_Audit_Log.md](13_Audit_Log.md) | Audit Log | Immutable audit trail: what is audited, how, UI, retention. |
| [14_CRM.md](14_CRM.md) | CRM | Customer relationship management: User 360 CRM view, segments. |
| [15_Investor_Dashboard.md](15_Investor_Dashboard.md) | Investor Dashboard | Executive KPI dashboard with authenticated Share Grants (never public, per ADR-009). |
| [16_Release_Analytics.md](16_Release_Analytics.md) | Release Analytics | Version analytics, crash tracking, release registry, adoption curves. |
| [17_UI_UX_Standards.md](17_UI_UX_Standards.md) | UI/UX Standards | Design system, component patterns, layouts, accessibility. |
| [18_MultiLanguage.md](18_MultiLanguage.md) | Multi-Language | Vietnamese/English i18n architecture, date/number formatting. |
| [19_Security.md](19_Security.md) | Security | Auth, authorization, data protection, secrets, CORS, backup. |
| [20_Performance.md](20_Performance.md) | Performance | Query strategy, caching, pagination, export pipeline, indexes. |
| [21_Coding_Standards.md](21_Coding_Standards.md) | Coding Standards | Engineering conventions, handler pattern, error handling, types. |
| [22_Architecture_Decision_Records.md](22_Architecture_Decision_Records.md) | ADRs | Rationale for key architectural choices. |
| [23_Implementation_Roadmap.md](23_Implementation_Roadmap.md) | Implementation Roadmap | 6-phase rollout plan with deliverables and approval checkpoints. |
| [24_Data_Dictionary.md](24_Data_Dictionary.md) | Data Dictionary | Authoritative definition of every event/derived field, concept, and enum. |
| [25_KPI_Definitions.md](25_KPI_Definitions.md) | KPI Definitions | Exact formula, source, and cadence for every metric. |
| [26_Founder_Dashboard.md](26_Founder_Dashboard.md) | Founder Dashboard | Founders' strategic + operational control room. |
| [27_User_And_Notification_Journeys.md](27_User_And_Notification_Journeys.md) | User & Notification Journeys | Lifecycle stages, transitions, and stage-aware engagement. |
| [28_API_Governance.md](28_API_Governance.md) | API Governance | Versioning, contracts, deprecation, idempotency, rate-limit policy. |
| [29_Database_Governance.md](29_Database_Governance.md) | Database Governance | Migration process, naming, RLS discipline, retention, partitioning. |
| [30_Architecture_Review_Report.md](30_Architecture_Review_Report.md) | **Architecture Review Report** | **Chief Architect's final review, findings, and readiness recommendation.** |
| [31_Feature_Flags.md](31_Feature_Flags.md) | Feature Flags | Backend-authoritative flags, cross-platform resolution, gradual rollout. |
| [32_Experimentation_AB_Testing.md](32_Experimentation_AB_Testing.md) | Experimentation / A-B Testing | First-party assignment, pre-registered metrics, guardrails. |
| [33_Privacy_Data_Governance.md](33_Privacy_Data_Governance.md) | Privacy & Data Governance | Data classification, PII access matrix, subject rights, processors. |
| [34_Data_Retention_Policy.md](34_Data_Retention_Policy.md) | Data Retention Policy | Authoritative retention windows + deletion mechanisms per data category. |
| [35_Business_KPI_Dictionary.md](35_Business_KPI_Dictionary.md) | Business KPI Dictionary | Business/investor-facing KPI glossary (MRR, ARR, LTV, CAC, NRR…). |

---

## Quick Summary

### What this platform does

```
Back Office = Operations + Intelligence + Governance + Engineering
```

| Domain | Modules |
|---|---|
| **Operations** | Home Dashboard, User Management, Moderation, Engagement Center, CRM |
| **Intelligence** | Product Analytics, AI Analytics, User Analytics, Business Analytics, Investor Dashboard, Release Analytics |
| **Governance** | RBAC, Audit Log, Reporting, Export Center |
| **Engineering** | System Monitoring, AI Cost Monitoring, Release Management, Developer Tools |

### Key Technology Decisions

| Decision | Choice | Why |
|---|---|---|
| Deployment | Same Vercel project | Zero new infra; shared auth |
| Framework | Next.js App Router (existing) | Same repo; no new stack |
| UI components | Shadcn/ui + TanStack Table | Already in ecosystem |
| Analytics DB | Supabase PostgreSQL (pre-computed aggregates) | No new infra at MVP scale |
| External analytics | PostHog (existing integration) | Funnel + session analytics |
| Auth | Supabase Auth (existing) | Same session as main app |
| RBAC | `admin_roles` DB table | Replaces `ADMIN_IDS` env var |

### Implementation Phases

| Phase | Contents | Gate |
|---|---|---|
| 0 | Foundation (Shell + RBAC + Audit Log) | Architecture approved |
| 1 | Analytics Core | Phase 0 complete |
| 2 | User Management + Moderation | Phase 0 complete |
| 3 | Intelligence (Business + Investor + AI Cost) | Phase 1 complete |
| 4 | Engagement Center | Phase 2 complete |
| 5 | Reporting + Export | Phases 3 + 4 complete |

---

## Approval Status

| Scope | Status | Approved By | Date |
|---|---|---|---|
| All documents (00–35) — Architecture v1.1 | ✅ APPROVED | Project Owner | 2026-07-13 |

**Owner decisions recorded:** D1 (reporting timezone = Asia/Ho_Chi_Minh) approved — ADR-008. D7 (Investor Dashboard authenticated-only sharing, never public) mandated — ADR-009. Feature Flags (ADR-010) and Experimentation (ADR-011) brought into scope. Freeze at v1.0 — ADR-012. Versioning discipline added + release v1.1 — ADR-013.

**Change control (Constitution §8):** frozen content is never edited silently. **Editorial Errata** (text alignment to an approved ADR) — no ADR, must be logged. **Design Change** (any architecture/schema/API/security/scope change) — requires a new ADR + a new released architecture version.

**Implementation may now begin.** Post-freeze, every architectural change requires a new ADR with explicit owner approval before implementation.

---

*TappyAI Back Office Platform Architecture v1.0*
