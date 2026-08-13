# Controller V2 — Roadmap

**Last updated:** 2026-08-04 · **Status authority:** [`STATUS.md`](STATUS.md) is the single source of truth; this document details sequencing only.

Approved scope: three ordered blocks (owner decision 2026-08-03). Each component ships through **PR → Review → Merge → Deploy**, with database steps gated by a runbook.

---

## Official status

| Item | Status |
|---|---|
| **Foundation Phase** | **CLOSED** |
| **Components 1–2** | **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** |
| **Component 3** | **READY TO START · NOT STARTED** |

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
| 8 | Event Bus | not started |
| 9a | Single admin-client construction point | ✅ **IN PRODUCTION** — merge commit `e8d4eb9` |
| 9b | **Secret Manager — typed boot-time config validation** | ✅ **IMPLEMENTED** — deploy-time gate over 5 required variables + typed runtime boundary; closes **D5**. See [`09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md`](09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md) |
| 10 | Rate Limiting | not started |
| 11 | Session Security | not started |

### End of Foundation

| Item | Status |
|---|---|
| Service-role hardening (`REVOKE … ON admin_roles`) | staged in `supabase/migrations/deferred/`, **not applied** — gate is the end of Foundation, per [ADR-017](../architecture/ADR-017-service-role-hardening-strategy.md) |
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
