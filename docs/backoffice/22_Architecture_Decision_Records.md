# TappyAI Back Office — Architecture Decision Records

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## Format

Each ADR follows this structure:

```
## ADR-XXX — Title
Status: PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED
Date: YYYY-MM-DD

### Context
What situation led to this decision?

### Decision
What was decided?

### Consequences
What are the benefits, trade-offs, and risks?
```

---

## ADR-001 — Back Office deployed within existing Next.js project

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
Two deployment options existed:
1. Separate Next.js project for back office
2. Additional routes within the existing `tappyai-mvp` Next.js project

### Decision
Back office is deployed as `/admin/*` routes within the existing project.

### Consequences
**Benefits:**
- Zero additional infrastructure
- Shared auth session (no separate admin login)
- Shared Supabase client, environment variables, TypeScript types
- Single deployment pipeline

**Trade-offs:**
- Admin code lives in the same repo as user-facing code
- Bundle contains admin code (mitigated: admin routes are server-rendered; no admin JS ships to regular users unless they visit `/admin/*`)

**Risks:**
- Low risk — Next.js App Router handles route isolation cleanly

---

## ADR-002 — Analytics stored in Supabase PostgreSQL (not dedicated analytics DB)

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
Analytics at MVP scale (< 100K MAU, < 5M events/day) does not require a dedicated analytics database. Options:
1. ClickHouse / BigQuery / Snowflake
2. Supabase PostgreSQL with pre-computed aggregation tables

### Decision
Use Supabase PostgreSQL with pre-computed `daily_snapshots` and rollup tables.

### Consequences
**Benefits:**
- No additional infrastructure or cost
- Same query language (SQL) as the rest of the system
- Pre-computed aggregates make dashboard queries trivially fast
- Easy to migrate to dedicated DB later by exporting snapshot tables

**Trade-offs:**
- Not suitable for ad-hoc queries on raw event data at scale
- Row volume in `track_events` will require periodic archival

**Risks:**
- If daily event volume exceeds 10M rows, `analytics-snapshot` cron may become slow. Mitigation: partition `track_events` by month.

**Migration trigger:** When `track_events` reaches 100M rows OR cron exceeds 10 minutes, evaluate ClickHouse migration.

---

## ADR-003 — RBAC via database table, not environment variable

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
Current system uses `ADMIN_IDS` environment variable. This is not scalable — no roles, no audit, no expiry.

### Decision
Replace with `admin_roles` table in Supabase. Seed existing `ADMIN_IDS` as `super_admin` during first deployment.

### Consequences
**Benefits:**
- Role differentiation (super_admin / admin / moderator / analyst)
- Role changes are audited
- Role expiry supported
- No deployment required to grant/revoke roles

**Trade-offs:**
- Extra DB query on every admin request (mitigated: cache role for 60s per session)
- Migration required (seed from ADMIN_IDS)

**Risks:**
- Low — the existing `ADMIN_IDS` check is a simple string comparison that can run in parallel during transition

---

## ADR-004 — AI moderation assists humans; never acts autonomously

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
AI content scanning could be used to automatically hide or ban content.

### Decision
AI scanning creates queue entries. Humans approve all consequential actions.

**One exception:** If AI confidence > 0.95 on a safety category, content may be temporarily hidden pending human review. This is reversed if a human dismisses the case.

### Consequences
**Benefits:**
- Protects platform from wrongful automated bans
- Legal protection (human in the loop)
- Builds trust with creator community

**Trade-offs:**
- Moderators must review AI-flagged content manually
- Queue may grow faster than moderation capacity

**Risks:**
- Harmful content stays live briefly after upload until moderation review. Mitigated: high-confidence flags create urgent-priority queue items.

---

## ADR-005 — Report generation is async (not synchronous)

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
Report generation for large date ranges can take 5–30 seconds. Vercel function default timeout is 10 seconds.

### Decision
Reports are generated asynchronously:
1. API returns `job_id` immediately
2. Background function generates the report
3. Admin polls for status or receives in-app notification

### Consequences
**Benefits:**
- No timeout issues
- Better UX (non-blocking)
- Retry on failure

**Trade-offs:**
- More complex flow (polling or websocket)
- Requires `report_jobs` table

**Risks:**
- Low — pattern is well-established

---

## ADR-006 — In-memory server cache for dashboard queries (no Redis)

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
Dashboard queries against `daily_snapshots` are already fast (< 50ms). However, with multiple admin users refreshing frequently, we want to avoid redundant identical queries.

### Decision
Use a simple in-memory `Map` cache with TTL in each Vercel function instance.

### Consequences
**Benefits:**
- Zero infrastructure cost
- Zero latency for cache hits
- Simple implementation

**Trade-offs:**
- Cache is per-instance (Vercel may have multiple function instances)
- No shared cache across instances

**Risks:**
- Acceptable for back office — slight redundancy across instances is fine. The queries are fast enough that redundancy has minimal cost.

**Migration trigger:** Add Upstash Redis only when concurrent admin users exceed 20 or query cost becomes measurable.

---

## ADR-007 — Audit log is INSERT-only with no application-level delete

**Status:** ACCEPTED  
**Date:** 2026-07-13

### Context
Audit logs must be tamper-proof. The database must not allow modification.

### Decision
`audit_log` table has no UPDATE or DELETE policies in RLS. Application code has no delete endpoint. Retention cleanup runs via a cron that uses the service role but is scoped to only delete records past the retention date.

### Consequences
**Benefits:**
- Cannot be tampered with by compromised admin account
- Legal defensibility

**Trade-offs:**
- Requires periodic cleanup cron for retention compliance
- Storage grows linearly with admin activity

**Risks:**
- Low — audit logs are small records (no content, no media)

---

## ADR-008 — Canonical reporting timezone = Asia/Ho_Chi_Minh (D1)

**Status:** ACCEPTED (owner-approved 2026-07-13)  
**Date:** 2026-07-13

### Context
All per-day metrics need one day-boundary timezone. UTC splits the Vietnamese evening peak across two reporting days.

### Decision
The canonical reporting timezone is **`Asia/Ho_Chi_Minh` (UTC+7)**. Events store UTC; all calendar bucketing converts to VN time; the snapshot cron runs 00:05 VN. Owner explicitly approved.

### Consequences
**Benefits:** Metrics align with the real user day; no split-peak artifacts.  
**Trade-offs:** International expansion later needs per-report timezone override (Future Rec.).  
**Risks:** Changing this after data accumulates requires historical recompute — hence locked now by owner decision.

---

## ADR-009 — Investor Dashboard: authenticated sharing only, never public (D7)

**Status:** ACCEPTED (owner-mandated 2026-07-13)  
**Date:** 2026-07-13

### Context
The v1.0 draft allowed viewing the Investor Dashboard via a signed link without login. The owner ruled this unacceptable.

### Decision
The Investor Dashboard is **never publicly accessible**. External sharing requires a secure, expiring, revocable link **plus authentication (password or email OTP)** and full audit logging. Implemented via `investor_share_grants` (Investor Dashboard §5). Supersedes the prior "accessible without login" design.

### Consequences
**Benefits:** No unauthenticated exposure of business data; per-recipient control; complete access trail.  
**Trade-offs:** Slightly more friction for the investor (one auth step); more implementation (auth gate, OTP).  
**Risks:** Low — reduces exposure surface. Failed-auth lockout + revocation mitigate credential-guessing.

---

## ADR-010 — Feature Flags brought into approved scope

**Status:** ACCEPTED (owner-requested 2026-07-13)  
**Date:** 2026-07-13

### Context
Feature flags were referenced by the Settings and Dev Tools modules but not architected, and were listed under Future Recommendations.

### Decision
Feature flags are now in scope as a first-class capability (`31_Feature_Flags.md`): backend-authoritative flag store, one cross-platform resolution endpoint, per-user overrides, audit-logged changes.

### Consequences
**Benefits:** Deploy/release decoupling; instant kill-switch for un-updatable native apps; safe gradual rollouts; foundation for experimentation.  
**Trade-offs:** One extra client call per session; flag debt if temporary flags aren't retired.  
**Risks:** Low; fail-safe bundled defaults + 5-min cache. Integrates cleanly with existing Settings/Dev Tools references — no conflict.

---

## ADR-011 — Experimentation / A-B testing brought into approved scope

**Status:** ACCEPTED (owner-requested 2026-07-13)  
**Date:** 2026-07-13

### Context
A/B testing was a Future Recommendation. Owner brought it into scope.

### Decision
First-party experimentation platform (`32_Experimentation_AB_Testing.md`) built on `variant` feature flags, the unified event pipeline, and `25` KPI definitions; PostHog for exploratory analysis. Deterministic sticky assignment, pre-registered primary metric + guardrails, power-analysis sample sizing.

### Consequences
**Benefits:** Evidence-based decisions; de-risked launches; consistent cross-platform assignment.  
**Trade-offs:** Requires statistical discipline (no peeking, sample-size patience).  
**Risks:** Underpowered/overlapping tests → false conclusions; mitigated by enforced sample size, guardrails, one primary metric, flag exclusivity. Reuses existing primitives — integrates without new blocking issues.

---

## ADR-012 — Architecture frozen at v1.0 (Approved); changes require ADR

**Status:** ACCEPTED (owner-approved 2026-07-13)  
**Date:** 2026-07-13

### Context
Owner reviewed the hardened architecture plus the five added documents (Feature Flags, Experimentation, Privacy & Data Governance, Data Retention Policy, Business KPI Dictionary), confirmed D1, and mandated the D7 change. All additions integrate cleanly and introduce no new blocking issues.

### Decision
The architecture is declared **Architecture v1.0 — Approved** and **frozen**. From this point, any architectural change MUST go through a new ADR and receive explicit owner approval **before** implementation. Implementation may now begin, following the approved documents and the roadmap.

### Consequences
**Benefits:** Stable single source of truth; controlled evolution; no silent drift.  
**Trade-offs:** Every change carries ADR overhead (intended).  
**Risks:** None material; the ADR gate is the safeguard. Emergency production fixes still require a retroactive ADR.

---

## ADR-013 — Architecture Documentation Versioning discipline; release v1.1

**Status:** ACCEPTED (owner-requested & approved 2026-07-13)  
**Date:** 2026-07-13

### Context
v1.0 was frozen (ADR-012), but the corpus lacked an explicit rule for *how* it may evolve — how to distinguish a harmless text correction from a real design change, and how to keep a durable record of which architecture version each implementation phase was built against. Without this, frozen content could drift silently and traceability would erode.

### Decision
Add **Section 8 (Architecture Documentation Versioning)** and **Section 9 (Version History)** to the Constitution. The rule:
- `v1.0` is the approved frozen baseline; the architecture-set version is the build contract per phase.
- Changes are classified as **Editorial Errata** (text alignment to an approved ADR / typos — no ADR, must be logged) or **Design Change** (any architecture/schema/API/security/scope change — requires ADR + new version).
- No silent edits to frozen content.
- Semantic versioning: major = redesign, minor = additive/governance amendment, patch = logged errata.
- Each roadmap phase records the version it was built against.

This ADR is itself the first application of the rule: it is a governance amendment (not a design change), so it releases **Architecture v1.1**.

### Consequences
**Benefits:** Permanent, auditable trace of which architecture built each stage; clear, low-friction path for errata; strong guard against silent drift.  
**Trade-offs:** Every future design change carries version + ADR overhead (intended).  
**Risks:** None material. No schema, API, security, data-flow, or scope change is introduced — purely governance. Existing document content versions (e.g. docs at v1.1 internally) are unaffected; the architecture-*set* version is now v1.1.

### Scope confirmation
This ADR changes **no** module design, database schema, API contract, security control, or roadmap dependency. It adds process rules only.

---

*End of Architecture Decision Records*
