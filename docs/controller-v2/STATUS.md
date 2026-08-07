# Controller V2 — Current Status

> ## 🔒 SINGLE SOURCE OF TRUTH
> **This document is the only authoritative statement of Controller V2 project status.**
> Every other document in `docs/controller-v2/` is either a historical record or a design artefact. Where any of them states a status — `READY`, `NOT READY`, `NOT EXECUTED`, `Draft`, `Awaiting approval` — **this document overrides it**. Historical documents are deliberately not rewritten; they carry a banner pointing here.

**Last updated:** 2026-08-07

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
| **Component 7** — Audit Hardening | **READY TO OPEN PR** — not merged, not deployed, **migration not applied to any database**. See [RELEASE_READINESS_COMPONENT_7.md](RELEASE_READINESS_COMPONENT_7.md) |

> **Rows 3, 4 and 9a were corrected on 2026-08-07.** This table had said
> "Component 3 — READY TO START · NOT STARTED" since 2026-08-04 while all three
> components were live in production. It was last edited on Component 4's
> branch and then went stale through two merges. A document that declares itself
> the single source of truth is the worst place for drift, so the correction is
> recorded here rather than filed as a backlog item.

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

**Component 3 — RBAC.** Not started. See [`ROADMAP.md`](ROADMAP.md).
