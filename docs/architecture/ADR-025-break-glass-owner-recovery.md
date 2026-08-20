# ADR-025 — Break-glass Owner recovery is a two-step database operation the application cannot call

**Status:** Accepted
**Date:** 2026-08-20
**Context:** Controller V2 — K-6 / B8, closing `01_CONTROLLER_V2_ARCHITECTURE.md` §10 **R6** (*"Owner key loss = permanent lockout"*, severity **Critical**)
**Authority:** [Owner Decision B8, 2026-08-19](../controller-v2/STATUS.md) — *"YES in principle … design first, then ADR"* — and the Owner's delegated answers to **D1–D4**, 2026-08-20
**Design:** [`13_BREAK_GLASS_OWNER_RECOVERY_DESIGN.md`](../controller-v2/13_BREAK_GLASS_OWNER_RECOVERY_DESIGN.md)
**Related:** [ADR-017](ADR-017-service-role-hardening-strategy.md) (apply pattern) · [ADR-019](ADR-019-supabase-grant-model.md) (silence is not "closed") · [ADR-021](ADR-021-c11-auth-sessions-dependency.md) · Component 1 `20260803_platform_owner.sql` · C8 contract §5 (P4 grant shape)

---

## Background

R6 has been open since the architecture was written and is the only **Critical** risk in §10 with no mitigation built. Its stated remedy names the authority precisely: *"a DB-level owner-reassignment procedure requiring both database and Vercel env access. **This needs an owner decision before implementation.**"*

The design phase established that R6 reads as more unbuilt than it is. Four pieces shipped with Component 1 and were never described as recovery: `platform_owner.assigned_by` **already documents `'break_glass'` as an expected value**, `active` + `revoked_at` already make transfer a revoke-and-insert, `uq_platform_owner_single_active` already makes two Owners impossible **at the database**, and `ON DELETE RESTRICT` already refuses to leave the platform ownerless.

It also established the defect in the obvious implementation, and that finding shapes D1.

## The obvious implementation is wrong

The natural move is to copy `platform_owner_bootstrap.sql`, which derives the Owner from *the sole active `super_admin`* and aborts unless the count is exactly 1.

**Production has exactly one `super_admin`, and it IS the Owner** — which is precisely why [BL-002](../controller-v2/BACKLOG.md) cannot be closed. So on credential loss that derivation returns **the very account that was lost**. The script would report success and recover nothing.

Any design that derives the replacement from `admin_roles` inherits this. Hence D1.

## Decision

### The shape: two steps, database-only

**ARM → EXECUTE**, with **CANCEL** as the reversible exit.

`fn_owner_recovery_arm` · `fn_owner_recovery_execute` · `fn_owner_recovery_cancel` · `fn_owner_recovery_audit`

All four hold **EXECUTE for nobody** — not `anon`, not `authenticated`, and **not `service_role`**. This is the shape C8 gave `fn_outbox_publish` (guarantee P4), and here it is what makes *"break-glass must never become a hidden super-admin backdoor"* **structural rather than promised**:

> the application has no way to call this at all, so no second authorization path can exist.

Recovery is performed by a human with direct database access. Combined with the Owner Gate — `checkOwnerGate` already 403s the **entire** Controller on a DB-only change (`ENV_MISMATCH`) or an env-only change (`ENV_SET_BUT_NO_OWNER`) — the two accesses R6 names are both genuinely required, and a **half-completed recovery fails closed**.

### D1 — the replacement Owner is NAMED, never derived

`fn_owner_recovery_arm(p_target_user_id, p_reason, p_window_minutes)`. The target is a parameter. Validated: the profile exists (`P0002` otherwise), and the target is **not already the active Owner** (`23514`) — the structural guard against the derivation defect being repeated by hand.

**The target is deliberately NOT required to hold an admin role.** Requiring one would reproduce the lockout, for the same reason: the only `super_admin` is the lost account. The authority here is possession of database **and** deployment environment, not the target's prior standing.

### D2 — recovery-only

Not a routine ownership-transfer mechanism. **The database cannot verify "normal control is unavailable"** — the credential can be lost while the owner row is perfectly valid, which is the primary scenario — so this is enforced by what *can* be enforced: no application surface, a mandatory stored justification (≥ 20 characters, the `19_Security.md` §5 floor), and an audit row for **every** arm, cancel and execute. The remaining judgement is human; the control is that it cannot be exercised quietly.

### D3 — one-time, short-lived

The window carries `expires_at` (bounded **5–120 minutes**, default 30) and is consumed on execute. A **partial unique index** allows at most one open window, for the same reason `uq_platform_owner_single_active` exists: an application count check races under concurrency and a unique index cannot.

Replay is refused (`23514` on a consumed window), expiry is refused, and an expired or cancelled window leaves ownership untouched. **There is no permanent recovery credential** — no standing secret exists to steal.

This required a migration, which D3 anticipated. It is a **new table**, not a column on `platform_owner`: the window describes a *pending* recovery, not an owner.

### D4 — a system actor, and an audit that aborts

`audit_log.actor_id` is `UUID NOT NULL`, so a sentinel is required. The recovery records the **all-zero UUID**, `break-glass@system.invalid` (`.invalid` is RFC 2606 reserved, so it can never be deliverable) and `actor_role = 'system'` — never a fabricated user. `actor_role` is `TEXT` and never an enum, so `'system'` needs no migration elsewhere.

Each entry carries operation, target, mechanism, **correlation id** (the window id), reason, outcome and before/after owner.

**The audit write happens inside the recovery transaction, so a failure aborts the recovery.** This inverts the platform's normal rule: `writeAuditLog` in the application is deliberately fire-and-forget precisely so a failed audit can never break a user action. Here an **unaudited ownership seizure is worse than a failed recovery**.

## Classification under Constitution §8.2

**Design Change** — a security procedure with a schema change. Hence this ADR, per B8's *"design first, then ADR"*.

## Consequences

**R6 is closed at the code level.** Owner credential loss is recoverable, and the recovery is bounded, one-time, reversible before use, and audited.

**The blast radius is stated rather than hidden.** Anyone holding both the production database and the deployment environment can already do anything; they could edit `platform_owner` by hand today. This ADR does not widen that — it makes the exercise of it **procedural and auditable** instead of impossible-then-improvised.

**Costs.** One table, four functions, and a production migration that must be applied under its own authorization.

**Residual, stated rather than hidden.**

- **The Owner Gate is inert when `PLATFORM_OWNER_USER_ID` is unset** (`enforced: false` — deliberate rollout semantics in `owner.ts`). In such a deployment, database write alone suffices and the dual control does not hold. Production has it set; any environment that does not is outside this guarantee.
- **"Recovery-only" is a human judgement**, per D2 above.
- **Rollback protects a mistaken recovery, not a correct one** — reverting needs the prior credential to be usable, which in the loss scenario it is not. The reversible path is to run the recovery again toward the intended Owner.
- **The migration is not applied.** Production application is an explicit Owner/deployment gate under the ADR-017 sequence.

## Verification

**43 assertions against a real PostgreSQL 17.5** (`supabase/tests/owner_recovery_boundary.test.ts`) plus **7 source-boundary assertions** (`src/lib/admin/breakGlassBoundary.test.ts`) proving no application code reaches the functions, the table, or the system actor sentinel.

**Mutation: 22/22 killed.** Three survived the first run and every one was a real hole:

| Survivor | Why it survived | Fix |
|---|---|---|
| `service_role` dropped from the REVOKE list on **arm** and on **execute** | The harness modelled `ALTER DEFAULT PRIVILEGES … ON TABLES` but **not `ON FUNCTIONS`**. PostgreSQL's own PUBLIC default was then the only grant in play, so revoking PUBLIC alone happened to be enough — and the assertion passed **vacuously**. This is exactly the trap ADR-019 and the C8/C11 harnesses document | Model the FUNCTIONS default too, as `c8_event_outbox` and `c11_session_security` already do. Both mutants now die |
| The single-open-window index downgraded from `UNIQUE` to a plain index | The explicit `IF EXISTS` guard in `arm` still refused a second window on one connection. The index is the **concurrency** guarantee, which a single-connection test cannot exercise | Assert the index is `UNIQUE` from the catalog, exactly as `uq_platform_owner_single_active` is asserted |

The two grant survivors are the more serious finding: they were the **central security property of this ADR**, and the harness could not see them.

## What this ADR does NOT change

- **`platform_owner`** — no column, no index, no policy. A test asserts its seven columns are unchanged.
- **`checkOwnerGate`** — untouched. It already provides the dual control R6 specifies.
- **`fn_is_platform_owner`** — untouched; it answers for the new Owner after recovery, which a test proves.
- **RBAC.** The new Owner receives **no admin role**. The Owner is not a role, and `OWNER_BYPASS` already admits them.
- **Ordinary audit behaviour.** `writeAuditLog` stays fire-and-forget everywhere else; only this path aborts.
- **Production state.** No migration applied, no owner row touched, no recovery armed.

## Deliberately out of scope

Hardware-token or multi-party approval (**no authoritative source asks for either**), an application or CLI surface, and any notion of a temporary Owner beyond the one-time window.
