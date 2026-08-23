# Controller V2 — Roadmap

**Last updated:** 2026-08-04 · **Status authority:** [`STATUS.md`](STATUS.md) is the single source of truth; this document details sequencing only.

Approved scope: three ordered blocks (owner decision 2026-08-03). Each component ships through **PR → Review → Merge → Deploy**, with database steps gated by a runbook.

---

## Official status

| Item | Status |
|---|---|
| **Foundation Phase** | **CLOSED** |
| **Components 1–2** | ✅ **ACCEPTED — fully, 2026-08-22.** The open production validation task (BL-002) is **CLOSED**: G1 proven over real HTTP on production with a genuine second `super_admin` |
| **Component 3** | ✅ **ACCEPTED · IN PRODUCTION** — merge `933c4f8` |
| **Controller V2** | ✅ **COMPLETE — 2026-08-23**, production `d1ae429`. Measured against Owner **Decision F** (full architecture), which superseded Decision A on 2026-08-19. See [`STATUS.md`](STATUS.md) |

> **Corrected 2026-08-23.** The three rows above read *"Components 1–2: ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK"*
> and *"Component 3: READY TO START · NOT STARTED"* — the first stale since BL-002 closed on 2026-08-22, the second
> stale since 2026-08-07, while `STATUS.md` recorded C3 as **ACCEPTED · IN PRODUCTION**. This is the same drift
> `STATUS.md` corrected in row 10 of this file on 2026-08-13, and it is corrected here in the same style rather than
> filed as a backlog item. `STATUS.md` remains the status authority; this document details sequencing only.

"Foundation Phase: CLOSED" closes the Foundation *establishment* phase — audit, architecture, and Components 1–2 in production. Components 3–11 remain and are listed below; see [`STATUS.md`](STATUS.md) for the scope note.

---

## Phase 1 — Foundation

### Block A — Identity & Authorization

| # | Component | Status |
|---|---|---|
| 1 | **Platform Owner** | ✅ **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** — in production (`fb21ebe`) |
| 2 | **Identity** | ✅ **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** — in production (`fb21ebe`) |
| 3 | **RBAC** | ✅ **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** — in production (`933c4f8`, PR #12) |
| 4 | **Audited PDP** *(the roadmap called this "Permission Engine"; C3 shipped that — see 04_COMPONENT4_AUDITED_PDP_DESIGN.md §1)* | ✅ **IN PRODUCTION** — merge commit `28f68c1` |

### Block B — Extensibility

| # | Component | Status |
|---|---|---|
| 5 | Capability Registry | 🧊 **FROZEN** — [ADR-018](../architecture/ADR-018-capability-registry-frozen.md); merges into Component 6 |
| 6 | **Plugin Registry** | ✅ **LIFECYCLE-COMPLETE** — see [`06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md). *(This row read "not started" until 2026-08-13 while `ControllerCore` was already live in production — corrected there.)* |

### Block C — Operational Infrastructure

| # | Component | Status |
|---|---|---|
| 7 | **Audit Hardening** — tamper-evident hash chain over `audit_log` | ✅ **IMPLEMENTED · DEPLOYED · NOT YET UAT-VERIFIED** — merge `f3caf59`, live in production `526157a` (F-04 PR #18 + PH-0 applied). Corrected 2026-08-08 (FOUNDATION-01); see [STATUS.md](STATUS.md) row 7 note |
| 8 | **Event Bus** — transactional outbox, at-least-once fan-out | ✅ **ACCEPTED · IN PRODUCTION** — merge `0ce30a9` (PR #58); migration applied and verified read-only on production 2026-08-15 (P4 boundary, grants, constraints, indexes, RLS, deployed function bodies, 8 cron). Mechanism only: no producers, no consumers. See [`08_COMPONENT8_EVENT_BUS_CONTRACT.md`](08_COMPONENT8_EVENT_BUS_CONTRACT.md) |
| 9a | Single admin-client construction point | ✅ **IN PRODUCTION** — merge commit `e8d4eb9` |
| 9b | **Secret Manager — typed boot-time config validation** | ✅ **IMPLEMENTED** — deploy-time gate over 5 required variables + typed runtime boundary; closes **D5**. See [`09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md`](09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md) |
| 10 | **Rate Limiting** — distributed limiter on a shared store | ✅ **ACCEPTED · IN PRODUCTION** — merge commit `c226417` (PR #46), verified on production 2026-08-13; closes audit finding **S4 (HIGH)**. See [`10_COMPONENT10_RATE_LIMITING_CONTRACT.md`](10_COMPONENT10_RATE_LIMITING_CONTRACT.md). *(This row read "not started" until 2026-08-13 — corrected there.)* |
| 11 | **Session Security** — inventory, revocation, forced logout | ✅ **ACCEPTED · IN PRODUCTION** — merge `ed7ad3b` (PR #62); migration applied and verified read-only on production 2026-08-15. Four `SECURITY DEFINER` functions over `auth.sessions`, three admin routes, `service_role`-only EXECUTE, no credential column projected. See [`11_COMPONENT11_SESSION_SECURITY_CONTRACT.md`](11_COMPONENT11_SESSION_SECURITY_CONTRACT.md) · [ADR-021](../architecture/ADR-021-c11-auth-sessions-dependency.md) |

### End of Foundation

| Item | Status |
|---|---|
| Service-role hardening (`REVOKE … ON admin_roles`, `platform_owner`) | ✅ **APPLIED to production 2026-08-19** — the gate (every Phase 1 component shipped and soaked) was met. This row read "*staged … not applied*" until then. Evidence in [STATUS.md § Post-Foundation work](STATUS.md#post-foundation-work), per [ADR-017](../architecture/ADR-017-service-role-hardening-strategy.md) |
| Required checks on `main` (Owner Decision C) | ✅ **ENABLED 2026-08-19** — four required contexts, `enforce_admins` on. See [STATUS.md § Post-Foundation work](STATUS.md#post-foundation-work) |
| BL-001 ADR consolidation | backlog, gated on Foundation completion |

---

## What Components 1 & 2 delivered

Audit finding **G1** closed: a `super_admin` could previously mint unlimited additional Super Admins, and no Platform Owner existed in the schema, the code or the environment.

- **Platform Owner is a constitutional principal, not a role.** `owner` is deliberately absent from the `admin_role` enum, so it cannot travel through the grant API or UI at all.
- Exactly one active Owner is a **database invariant** (partial unique index), not an application check.
- `fn_grant_admin_role` / `fn_revoke_admin_role` are `SECURITY DEFINER` with pinned `search_path` and enforce the constitutional rules server-side.
- Ownership is pinned in **two independent places** — the `platform_owner` row and `PLATFORM_OWNER_USER_ID` — so neither a database compromise nor an environment compromise alone can transfer it.
- `Actor` carries `roles[]` (all active grants) and a reserved `capabilities[]`, so the interface will not change shape when the Capability Registry lands.
- **Owner Guard evaluates before RBAC**, pinned by two tests.

One production acceptance task remains open: [BL-002 — G1 Production Validation](BACKLOG.md#bl-002--g1-production-validation). It does not block Component 3.

---

## Component 3 — RBAC (next)

**Not started. No implementation until explicitly authorised.**

Expected scope, from [`03_PHASE1_FOUNDATION_DESIGN.md`](03_PHASE1_FOUNDATION_DESIGN.md) §5:

- Permission key shape `<hub>.<module>.<action>`, declared by module manifests rather than written as string literals at call sites
- Roles become **permission bundles**, replacing the four-rung `ROLE_RANK` ladder that cannot express "high in Commerce, zero in User Hub"
- `admin_permissions` — dead schema today, zero code references — dropped in the same migration that creates its replacement
- `resolveAdminRole` shim deleted once the PDP replaces the rank ladder (its defined removal point)

Carried into Component 3 from this Foundation:

- Any `.sql` file must be executed against a real PostgreSQL before it is called verified — see the regression suite added in `supabase/tests/`
- DDL is confirmed by querying system catalogs, never by reading UI text
