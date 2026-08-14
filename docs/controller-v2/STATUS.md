# Controller V2 — Current Status

> ## 🔒 SINGLE SOURCE OF TRUTH
> **This document is the only authoritative statement of Controller V2 project status.**
> Every other document in `docs/controller-v2/` is either a historical record or a design artefact. Where any of them states a status — `READY`, `NOT READY`, `NOT EXECUTED`, `Draft`, `Awaiting approval` — **this document overrides it**. Historical documents are deliberately not rewritten; they carry a banner pointing here.

**Last updated:** 2026-08-13

---

## Official project status

| Item | Status |
|---|---|
| **Foundation Phase** | **CLOSED** |
| **Components 1 & 2** — Platform Owner + Identity | **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** |
| **BL-002** — G1 Production Validation | **OPEN** · type: **Production Acceptance Task** |
| **Component 3** — RBAC | **ACCEPTED · IN PRODUCTION** — merge commit `933c4f8` |
| **Component 4** — Audited PDP | **ACCEPTED · IN PRODUCTION** — merge commit `28f68c1` |
| **Component 5** — Capability Registry | **FROZEN** — [ADR-018](../architecture/ADR-018-capability-registry-frozen.md), merges into Component 6 |
| **Component 9a** — single admin-client construction point | **ACCEPTED · IN PRODUCTION** — merge commit `e8d4eb9` |
| **Component 7** — Audit Hardening | **ACCEPTED · IN PRODUCTION** — merge commit `f3caf59`, live in production `526157a`; F-04 grant-model source-sync (PR #18) and PH-0 audit-function hardening applied. Accepted on production evidence per Owner Decision E, 2026-08-13. See [RELEASE_READINESS_COMPONENT_7.md](RELEASE_READINESS_COMPONENT_7.md) (historical, pre-merge) |
| **Component 10** — Rate Limiting | **ACCEPTED · IN PRODUCTION** — merge commit `c226417`, verified on production 2026-08-13. Distributed limiter on a shared Upstash store, fail-closed, `Retry-After` on all 11 admin routes. **Audit finding S4 (HIGH) is CLOSED.** Contract: [`10_COMPONENT10_RATE_LIMITING_CONTRACT.md`](10_COMPONENT10_RATE_LIMITING_CONTRACT.md) |
| **Component 6** — Plugin Registry | **LIFECYCLE-COMPLETE** — contract [`06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md). `register → validate → enable → ready → disable → deregister` + permission-collision validation. rollback / health checks / migration versioning **deferred** (undefined in any authoritative source), capability gate remains inert |
| **Component 9b** — Secret Manager | **IMPLEMENTED · AWAITING PRODUCTION VERIFICATION** — typed config boundary + deploy-time gate over 5 required variables, closes **D5**. Contract: [`09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md`](09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md) |
| **Component 8** — Event Bus | **MERGED · DEPLOYED · MIGRATION NOT APPLIED** — merge commit `0ce30a9` (PR #58), production `/api/version` matches, 8th cron registered. Contract: [`08_COMPONENT8_EVENT_BUS_CONTRACT.md`](08_COMPONENT8_EVENT_BUS_CONTRACT.md). **Not complete:** `20260813_c8_event_outbox.sql` is applied by hand by the Owner and a read-only production check on 2026-08-13 found none of its objects present |
| **Component 11** — Session Security | **IMPLEMENTED · MIGRATION NOT APPLIED** — contract [`11_COMPONENT11_SESSION_SECURITY_CONTRACT.md`](11_COMPONENT11_SESSION_SECURITY_CONTRACT.md), coupling [ADR-021](../architecture/ADR-021-c11-auth-sessions-dependency.md). P-1…P-7 ratified 2026-08-13; O-1 (revocation is immediate), O-2 (3600 s TTL, therefore not the guarantee) and O-3 (`auth.sessions` readable only through a definer function) all **measured** against a non-production project 2026-08-14. **Not complete:** `supabase/migrations/20260814_c11_session_security.sql` is applied by hand by the Owner |
| **Definition of Done** | **COMPONENT-COMPLETE** (C1–C11) — Owner Decision A, 2026-08-13. See [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md) |

> **Rows 3, 4 and 9a were corrected on 2026-08-07.** This table had said
> "Component 3 — READY TO START · NOT STARTED" since 2026-08-04 while all three
> components were live in production. It was last edited on Component 4's
> branch and then went stale through two merges. A document that declares itself
> the single source of truth is the worst place for drift, so the correction is
> recorded here rather than filed as a backlog item.
>
> **Two rows were corrected on 2026-08-13 (post-C8).** The combined row
> *"Components 8, 11 — NOT STARTED — no design document exists for either"* was
> stale for C8: it is merged (`0ce30a9`), deployed, and has a contract. It is
> split above so C11's genuinely undefined scope is not hidden behind C8's
> completion. MEASURED: `0ce30a9` is an ancestor of `origin/main`; production
> `/api/version` returns it; `vercel crons ls` reports 8 jobs including
> `/api/cron/outbox-drain`. Separately, [`ROADMAP.md`](ROADMAP.md) row 10 read
> *"Rate Limiting | not started"* while this document recorded C10 as **ACCEPTED ·
> IN PRODUCTION** since 2026-08-13 — MEASURED: `c226417` is an ancestor of
> `origin/main`, and 11/11 admin routes call the distributed limiter. The
> roadmap row is corrected there, in the same style as rows 6 and 8.
>
> **Row 7 was corrected on 2026-08-08 (FOUNDATION-01 reconciliation).** It had
> said "READY TO OPEN PR — not merged, not deployed" while C7 was in fact merged
> (`f3caf59`), live in production (`526157a`), and hardened by F-04 (PR #18) and
> PH-0. MEASURED: `f3caf59` is an ancestor of `origin/main`; `/admin/audit` and
> `/api/admin/audit` serve on production; the `audit_log` hash chain is active.
> The three states are kept distinct: **IMPLEMENTED** (code merged) and
> **DEPLOYED** (running in prod) are both true; **UAT-VERIFIED** is not yet claimed
> — the owner's final production UAT is deferred. `RELEASE_READINESS_COMPONENT_7.md`
> is a pre-merge point-in-time report and is left intact with a correction banner.

**Scope of "Foundation Phase: CLOSED".** This closes the Foundation *establishment* phase — the legacy audit, the Phase 0 audit, the approved architecture, and the two components that constitute the security foundation everything else builds on, now live in production. It does **not** mean all eleven Phase 1 components are built: Components 3–11 remain, and their state is tracked in [`ROADMAP.md`](ROADMAP.md). Read the two together.

---

## Components 1 & 2 — Platform Owner + Identity

# ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK

Merged, deployed and running in production. One production acceptance task remains open — see [BL-002](BACKLOG.md#bl-002--g1-production-validation). It is **not** a blocker, **not** a failed deployment, and **not** development work.

| | |
|---|---|
| Merge commit | `fb21ebe` (merge commit — history preserved, 12 commits) |
| Production deployment | Ready |
| Database migrations applied | `20260803_platform_owner.sql` |
| Platform Owner | bootstrapped, exactly one active |
| `PLATFORM_OWNER_USER_ID` | configured in Production + Preview + Development |
| Deferred hardening | **NOT applied** — staged for end of Foundation per [ADR-017](../architecture/ADR-017-service-role-hardening-strategy.md) |

---

## Verification ledger

| Gate | Status | Evidence |
|---|---|---|
| Phase 0 audit | ✅ | [`02_PHASE0_AUDIT.md`](02_PHASE0_AUDIT.md) — 7 sub-audits |
| Security PR (Next.js 14.2.35, CVE-2025-29927) | ✅ | merged as `7fa2c31` |
| Runbook Step 1 — read-only verification | ✅ | exactly 1 active `super_admin` confirmed on production |
| Runbook Step 2 — schema migration | ✅ | 9/9 objects verified via PostgreSQL catalog |
| Runbook Step 3 — Owner bootstrap | ✅ | 1 active owner, UUID matches the sole `super_admin`, idempotency proven on production |
| Merge → production deploy | ✅ | `fb21ebe` reached Ready |
| Public surface regression | ✅ | 8/8 routes → 200 |
| Admin surface regression | ✅ | 6/6 admin APIs → 401 unauthenticated |
| **Boot Assertion** | ✅ | authenticated `GET /api/admin/settings` → **200**, no ownership-assertion failure |
| **Owner Guard resolves `isOwner`** | ✅ | non-mutating probe reached the self-promotion check |
| Self-promotion rule | ✅ | `403 "Self-promotion is not permitted"` on production |
| **G1 end-to-end HTTP** | ⏳ **OPEN** | requires a second authenticated `super_admin` session — [BL-002](BACKLOG.md#bl-002--g1-production-validation) |

---

## Why G1 is open rather than failed

Nothing failed. G1 requires an HTTP request made **as a non-Owner `super_admin`**, and production has exactly one `super_admin` — the Owner. Producing a second one requires signing in as another account, which is a manual step.

The rule G1 tests is already enforced at two layers that *are* verified:

- **Database** — `fn_grant_admin_role` raises `42501` unless the actor is the Platform Owner. This is the authoritative layer; the application check is explicitly documented as defence-in-depth only.
- **Application** — `requireOwner()` is covered by a named regression test (`"a non-Owner super_admin CANNOT grant super_admin"`).

What remains unproven is only the **end-to-end HTTP path** on live production.

---

## Next implementation target

> **Corrected 2026-08-13.** This section said *"**Component 3 — RBAC.** Not started"* while the table above recorded Component 3 as **ACCEPTED · IN PRODUCTION** since 2026-08-07 — the document contradicted itself. The stale line is replaced rather than preserved, because a *forward-looking* instruction that is wrong will be acted on, unlike a dated status snapshot.

**C8 is merged and deployed; its migration is still pending.** C6, C9b and C10 are delivered. Under Owner Decision A (Definition of Done = C1–C11), exactly **two** things stand between the project and COMPLETE:

1. **The C8 migration** — Owner action. Everything else about C8 is done and its SQL is executed against a real PostgreSQL in CI.
<<<<<<< HEAD
2. **The C11 migration** — Owner action, the same shape. C11 is implemented, contracted and tested; `20260814_c11_session_security.sql` opens with a guard that refuses to apply if GoTrue's `auth.sessions` has lost a column C11 reads, so a failed apply is information rather than a mystery.

Both are the same class of remaining work: **code is merged, schema is not**. Neither is a design question.
=======
2. **C11 (Session Security)** — **blocked on scope, not on effort.** No design document exists; its only recorded scope is a one-line title. Implementation cannot begin without an authoritative contract defining states, transitions, errors, permissions and observability, and inventing one would be exactly the semantics-invention this project forbids.
>>>>>>> origin/main

> ⚠️ **Code ships before the schema.** Merging C8 deploys `/api/cron/outbox-drain` immediately, but `supabase/migrations/20260813_c8_event_outbox.sql` is applied manually by the Owner. Between those two moments the daily 03:00 tick calls an `fn_outbox_claim` that does not exist and returns 500. Nothing is lost — there is no table to lose rows from — but the tick is noise until the migration lands.

C8's design document now exists — [`08_COMPONENT8_EVENT_BUS_CONTRACT.md`](08_COMPONENT8_EVENT_BUS_CONTRACT.md), built on `01_CONTROLLER_V2_ARCHITECTURE.md` §7 which the Owner ratified as binding on 2026-08-13. It ships the **mechanism only**: an outbox table, the `fn_outbox_publish` primitive whose grants close the lost-event window, and a daily drain cron. It creates **no producers and no consumers**, so production carries zero delivery obligations by construction.

C11 still has **no design document**, so its scope remains undetermined and authorizing it is an Owner decision. The old ordering dispute is resolved: `03_PHASE1_FOUNDATION_DESIGN.md` §2 called the build order a chain of *"hard dependencies"* while `02_PHASE0_AUDIT.md` said those items *"can proceed in parallel"*; Owner decision 2026-08-13 settled it in favour of independence, and C9b, C6, C10 and C8 have each been delivered outside the declared chain order.

Deferred within C6, carried as named debt: **rollback**, **health checks**, **migration versioning**, table-collision validation, and route-gating on disable — each undefined in any authoritative source and therefore not invented. See [`06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md) §1 and §7.

See [`ROADMAP.md`](ROADMAP.md) for the approved Phase 1 component list and [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md) for the Definition of Done.
