# Foundation Closure Summary — Controller V2

**Date:** 2026-08-04 · **Status authority:** [`STATUS.md`](STATUS.md)

| Item | Status |
|---|---|
| Foundation Phase | **CLOSED** |
| Components 1 & 2 | **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** |
| BL-002 (G1) | **OPEN** — Production Acceptance Task |
| Component 3 (RBAC) | **READY TO START · NOT STARTED** |

---

## Foundation achievements

**Audit finding G1 is closed.** Previously any `super_admin` could mint unlimited peers through the documented API, and no Platform Owner existed in the schema, the code or the environment.

- **The Owner is a constitutional principal, not a role.** `owner` was never added to the `admin_role` enum, so the dangerous operation is structurally unreachable rather than merely guarded — no code path connects the RBAC API to `platform_owner`.
- **"Exactly one Owner" is a database invariant** (partial unique index), not an application check that races.
- **The rules live in the database.** `fn_grant_admin_role` / `fn_revoke_admin_role` are `SECURITY DEFINER` with pinned `search_path`, enforcing: only the Owner grants or revokes `super_admin`; nobody self-promotes; the last Super Admin cannot be removed; the Owner's roles cannot be stripped.
- **Ownership is pinned in two independent places** — the `platform_owner` row and `PLATFORM_OWNER_USER_ID` — so neither a database nor an environment compromise alone can transfer it.
- **Identity became a real security principal.** `Actor` carries all active roles plus a reserved `capabilities[]`, so the interface will not change shape when the Capability Registry lands. **Owner Guard evaluates before RBAC**, pinned by tests.

Delivered as **5 production source files (+327 / −57)**; everything else was tests, migrations and documentation.

## Production deployment summary

Merged as `fb21ebe` — a merge commit preserving all 12 commits (GitHub defaulted to *Squash*; changed deliberately). Deployment reached Ready.

Runbook Steps 1 → 2 → 3 executed against production and verified by PostgreSQL catalog queries, then merge → deploy. Migration `20260803_platform_owner.sql` applied: 9/9 objects confirmed. Owner bootstrapped, UUID matching the sole active `super_admin`, idempotency proven on production. `PLATFORM_OWNER_USER_ID` set for Production, Preview and Development.

Post-deploy: public surface **8/8 → 200**; admin APIs **6/6 → 401** unauthenticated; **Boot Assertion active and passing**; **Owner Guard resolves `isOwner = true`**; self-promotion blocked with `403`. No regressions.

The deferred service-role hardening remains **staged and not applied**, per ADR-017.

## Remaining production validation

**[BL-002 — G1 Production Validation](BACKLOG.md#bl-002--g1-production-validation)** — OPEN, typed a *Production Acceptance Task*, not development work.

It needs one HTTP request issued as a **non-Owner `super_admin`**. Production has exactly one `super_admin` — the Owner — so a second authenticated session must be created manually. The rule itself is already enforced and verified at two layers: the database function raises `42501`, and `requireOwner()` has a named regression test. Only the end-to-end HTTP path on live production is unproven.

## Governance status

`STATUS.md` is declared the single source of truth. Every historical document carries a banner pointing to it; none were rewritten, so the review record stands intact. Roadmap and backlog are aligned to the same four status values. BL-001 (ADR cleanup) and BL-002 (G1) are the complete set of open backlog items, and neither blocks Component 3.

Production changes continue to follow **PR → Review → Merge → Deploy**, with database steps gated by a runbook carrying Purpose / Preconditions / Commands / Verification / Rollback / STOP per step.

## Readiness for Component 3

**Ready.** RBAC depends on Identity, which is live in production. Component 3 inherits `Actor` with `roles[]` populated, `resolveActor` as the single construction site, a real-PostgreSQL test harness so migrations can be proven before they touch production, and the runbook pattern.

Known work it must absorb: dropping the dead `admin_permissions` table, and replacing the four-rung `ROLE_RANK` ladder that cannot express hub-scoped permissions.

Two rules carried forward, both learned the hard way: a `.sql` file is not verified until it has run against a real PostgreSQL, and DDL is confirmed by querying system catalogs — never by reading UI text.
