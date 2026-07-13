# TappyAI Back Office Platform — Constitution

**Version:** 1.1  
**Status:** ✅ APPROVED — Architecture v1.1 (owner-approved 2026-07-13, ADR-013; supersedes frozen v1.0 / ADR-012)  
**Date:** 2026-07-13  
**Author:** Architecture Session

> **APPROVED & VERSION-CONTROLLED.** The architecture is approved at **v1.1** (governance amendment over the frozen v1.0 baseline). Any **Design Change** MUST go through a new ADR (`22_Architecture_Decision_Records.md`) with explicit owner approval and release a new architecture version. **Editorial Errata** are permitted without an ADR but MUST be logged (Section 8–9). Implementation proceeds against the released version and the roadmap (`23`). See Section 8 for the versioning discipline.

---

## 1. Purpose

This document is the supreme governing law of the TappyAI Back Office Platform.

Every future architecture decision, implementation session, and code review must comply with the rules in this document.

This Constitution **overrides** any conflicting instruction, memory, or preference.

---

## 2. Platform Mission

The TappyAI Back Office Platform is the **command center of the entire TappyAI ecosystem**.

It must allow the team to:

- Operate the product with confidence
- Understand every metric that matters
- Act on users with precision
- Communicate with users at scale
- Audit every administrative action
- Monitor the system in real time
- Release and retire versions safely

It must serve:

- Founders (strategic view)
- Investors (business metrics)
- Product team (feature analytics)
- Moderation team (content safety)
- Customer success (user 360)
- Engineering (system health)

---

## 3. Absolute Rules

### Rule 1 — Architecture First

No code is written without an approved architecture document.

### Rule 2 — No Scope Expansion

Do not add features that are not in the approved architecture.

All ideas go into `Future Recommendations` sections.

### Rule 3 — Backend is Authoritative

Business logic belongs to the backend (Supabase + API Routes).

The Back Office UI is a client. It does NOT contain business rules.

### Rule 4 — Cross-Platform by Design

Analytics, events, and API contracts must be identical for Web, Android, and iOS.

Never build platform-specific logic that belongs to the shared layer.

### Rule 5 — Every Decision Must Be Justified

Every architectural choice must document:
- Purpose
- Benefits
- Trade-offs
- Risks
- Future scalability

### Rule 6 — Security is Non-Negotiable

Every module must design for security from the start.

Security cannot be added as a retrofit.

### Rule 7 — Audit Everything

Every administrative action must be recorded in the Audit Log.

No exceptions.

### Rule 8 — AI Assists, Humans Decide

AI-assisted moderation and AI cost monitoring are tools for humans.

AI must never automatically ban, suspend, or permanently act against users without a human in the loop.

### Rule 9 — Privacy by Default

Minimum data access per role.

No role sees data it does not need to perform its function.

### Rule 10 — Immutable Audit Log

Audit log entries must never be edited or deleted.

---

## 4. Architecture Hierarchy

```
00_Constitution.md              ← This document. Supreme law.
01_Master_Architecture.md       ← System-wide blueprint
02_System_Architecture.md       ← Infrastructure + deployment
03_Module_Architecture.md       ← All 20 modules
04_Database_Architecture.md     ← Schema + indexes + RLS
05_API_Architecture.md          ← Back office API design
06_Analytics_Architecture.md    ← Unified analytics layer
07_Event_Catalog.md             ← Every trackable event
08_Reporting_Architecture.md    ← Report generation
09_Notification_Architecture.md ← Engagement center
10_User_Management.md           ← User 360
11_Moderation.md                ← Content + user safety
12_RBAC.md                      ← Roles + permissions
13_Audit_Log.md                 ← Immutable audit trail
14_CRM.md                       ← User relationship management
15_Investor_Dashboard.md        ← KPI + business metrics
16_Release_Analytics.md         ← Version + platform analytics
17_UI_UX_Standards.md           ← Design system
18_MultiLanguage.md             ← i18n architecture
19_Security.md                  ← Security blueprint
20_Performance.md               ← Performance + caching
21_Coding_Standards.md          ← Engineering conventions
22_Architecture_Decision_Records.md ← ADRs
23_Implementation_Roadmap.md    ← Phased rollout plan
24_Data_Dictionary.md           ← Authoritative field definitions
25_KPI_Definitions.md           ← Exact metric formulas
26_Founder_Dashboard.md         ← Founders' control room
27_User_And_Notification_Journeys.md ← Lifecycle + engagement stages
28_API_Governance.md            ← API versioning + contract rules
29_Database_Governance.md       ← Migration + schema governance
30_Architecture_Review_Report.md ← Chief Architect review + go/no-go
31_Feature_Flags.md             ← Backend-authoritative feature flags
32_Experimentation_AB_Testing.md ← A/B testing platform
33_Privacy_Data_Governance.md   ← Data classification + subject rights
34_Data_Retention_Policy.md     ← Authoritative retention windows
35_Business_KPI_Dictionary.md   ← Business/investor KPI glossary
```

*Documents 24–30 were added during the 2026-07-13 Chief Architect review. Documents 31–35 were added on owner request before freeze. Documents 04, 06, 07, 13, 15 were hardened in the same pass. Architecture frozen at v1.0 (ADR-012).*

---

## 5. Existing System Inventory (as of 2026-07-13)

### What Exists Today

| Asset | Location | Status |
|---|---|---|
| Single admin page | `/admin/analytics` | EXISTS — minimal |
| Admin gate | `ADMIN_IDS` env var | EXISTS — simple list |
| Custom event tracker | `src/lib/tracking/tracker.ts` | EXISTS — basic |
| PostHog integration | `PostHogProvider.tsx` | EXISTS — pageviews |
| Supabase Auth | All API routes | EXISTS — stable |
| Push notifications | `/api/notifications/*` | EXISTS — Web Push only |
| Review moderation fields | `reviews.is_hidden` | EXISTS — field only |
| Stripe integration | `/api/stripe/*` | EXISTS — checkout + portal |
| Apple IAP | `/api/iap/apple/*` | EXISTS — JWS validation |

### What Does Not Exist

- Back office dashboard beyond the single analytics page
- RBAC system beyond `ADMIN_IDS` env var
- Audit log
- CRM / User 360
- Moderation queue
- Campaign / engagement center
- Investor dashboard
- Release analytics
- AI cost monitoring
- Structured reporting

---

## 6. Approval Protocol

1. Architecture document created → marked **DRAFT**
2. Reviewed by project owner
3. Owner approves → marked **APPROVED**
4. Implementation session begins against **APPROVED** document only
5. Implementation complete → marked **IMPLEMENTED**

No implementation begins without **APPROVED** status.

---

## 7. Amendment Protocol

To change an approved architecture document:

1. Create an ADR (Architecture Decision Record) in `22_Architecture_Decision_Records.md`
2. Document the reason, impact, migration strategy, and risks
3. Get explicit owner approval
4. Update the affected document
5. Update the ADR status to **APPROVED**

---

## 8. Architecture Documentation Versioning

**Established by ADR-013 (owner-approved 2026-07-13). This is the binding versioning discipline for the entire architecture set.**

### 8.1 Version as the Build Contract

`v1.0` is the approved, frozen baseline. The architecture-set version (tracked in this Constitution's header and in Section 9) is the **exact contract** each implementation phase is built against. When looking back, the version tells you precisely which architecture was used to build each stage of TappyAI.

### 8.2 Change Classification

Every proposed change to a frozen document MUST be classified as one of two types:

| Type | Definition | Requires ADR? | Version effect |
|---|---|---|---|
| **Editorial Errata** | Typo fixes, formatting, or alignment of stale text to an **already-approved** ADR. Changes wording, never design. | No | Patch bump + Errata log entry |
| **Design Change** | Any change to architecture, schema, API, security, data flow, scope, or a decision. | **Yes** | New minor/major version + ADR |

If there is any doubt whether a change is Editorial or Design, it is treated as a **Design Change**.

### 8.3 No Silent Edits

Frozen content is never edited silently.

- **Editorial Errata:** permitted, but MUST be recorded as an entry in the Errata log (Section 9.2) stating what changed, in which documents, and which approved ADR it aligns to. The design meaning does not change.
- **Design Change:** MUST go through the Amendment Protocol (Section 7) — a new ADR, explicit owner approval, then a new architecture version is released.

### 8.4 Version Numbering (Semantic)

- **Major (`v2.0`)** — breaking or structural redesign; multiple modules affected; migration required.
- **Minor (`v1.1`, `v1.2`)** — additive design change or governance amendment; backward-compatible; via ADR.
- **Patch (implied, logged only)** — Editorial Errata pass; no design change; recorded in the Errata log, not a new released version unless bundled.

### 8.5 Traceability Rule

Each implementation phase (Roadmap `23`) records the architecture version it was built against. No phase may begin against an unversioned or in-flight change — only against a released, approved version.

---

## 9. Version History

### 9.1 Released Versions

| Version | Date | Status | Summary |
|---|---|---|---|
| **v1.0** | 2026-07-13 | Superseded by v1.1 | Approved & frozen baseline (ADR-012). Docs 00–35. |
| **v1.1** | 2026-07-13 | ✅ **CURRENT — Approved & Frozen** | Governance amendment: added Section 8 (Architecture Documentation Versioning) and Section 9 (Version History) via ADR-013. No design/schema/API change. Includes Editorial Errata ERRATA-001…005 (W1–W5), applied 2026-07-13 — text alignment to ADR-008/ADR-009 + index accuracy, no design change. |

### 9.2 Editorial Errata Log

Editorial Errata (Section 8.2) are recorded here. Each entry aligns stale text to an already-approved ADR and changes no design.

| Date | Errata | Documents | Aligns to |
|---|---|---|---|
| 2026-07-13 | **ERRATA-001 (W1)** — Replaced stale `00:05 UTC` snapshot-cron literals with `00:05 VN (Asia/Ho_Chi_Minh, UTC+7 = 17:05 UTC)`. | `02`, `04`, `06` (diagram + §7 heading), `20` | ADR-008 |
| 2026-07-13 | **ERRATA-002 (W2)** — Aligned Investor Dashboard references to authenticated Share Grants (never public). | `03` (Module 06 security line) | ADR-009 |
| 2026-07-13 | **ERRATA-003 (W3)** — Normalized "shareable link" → "Share Grant" in normative docs. | `12` (RBAC matrix), `15` (§7 access table), `README` | ADR-009 |
| 2026-07-13 | **ERRATA-004 (W4)** — Corrected the DB index: added missing tables (`user_active_days`, `anon_identity_map`, `in_app_messages`, `report_jobs`, `investor_share_grants`, `feature_flags`, `feature_flag_overrides`, `experiments`, `experiment_assignments`), removed the non-existent `campaign_audiences` entry, and added an authoritative Table Registry. | `04` (§2, §2.1) | — (index accuracy) |
| 2026-07-13 | **ERRATA-005 (W5)** — Declared `04` the single authoritative schema source; converted the duplicate `user_active_days` DDL in `06` §8C into a reference to `04` §7A. | `04` (§2), `06` (§8C) | — (governance alignment) |
| 2026-07-13 | **ERRATA-006 (CONFLICT-1)** — Aligned docs to the **live schema**: `profiles.full_name` is the canonical name field; `display_name` removed from docs. No schema change (owner decision, Phase 0 planning). | `05`, `09`, `10`, `20` | live schema (`supabase-schema.sql`) |

> The W1–W5 items are **Editorial Errata** (Section 8.2): they align stale text to ADR-008/ADR-009 and correct index accuracy, changing **no** design, schema, API, event, or module architecture. They do not require a new ADR and do not, by themselves, bump the released version. Owner-authorized and applied 2026-07-13.
>
> **Note — preserved historical record:** `30_Architecture_Review_Report.md` §3.3 and §5 describe the *pre-decision* D7 state ("without login") as the review found it; its §12 addendum records the ADR-009 resolution. These historical findings are intentionally left intact so the review record remains truthful; they are not normative and do not govern implementation.

---

*End of Constitution — Architecture v1.1*
