> **⚠️ SUPERSEDED STATUS — see [`STATUS.md`](STATUS.md).**
> Components 1 & 2 are **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** — merged (`fb21ebe`), deployed, and verified in production. The verdicts and "not yet applied" statements below were accurate when written and are retained as the historical record of the review; they no longer describe current state.

<!--
  THIS ENTIRE FILE IS THE PR BODY. Copy it verbatim, including this comment or
  not — GitHub hides HTML comments when rendering.

  Open at: https://github.com/huyphamsm-tappy/tappyai-mvp/pull/new/feat/controller-v2-foundation
  Title, labels, reviewers and merge strategy: docs/controller-v2/DEPLOYMENT_READINESS_COMPONENT_1_2.md §1
-->

**Base:** `main` ← **Head:** `feat/controller-v2-foundation` · clean fast-forward, 0 behind, 0 conflicts

*(Commit count, head SHA and total diff stat are rendered by GitHub above — deliberately not restated here, because every edit to this body would change them and make the text stale.)*

---

# Executive Summary

Closes **audit finding G1**, the most serious issue found in the Controller V2 Phase 0 audit: **any `super_admin` could mint unlimited additional Super Admins**, and no Platform Owner existed anywhere — not in the schema, not in the code, not in the environment.

This PR introduces the Platform Owner as a **constitutional principal that is not a role**, and upgrades identity resolution from a single highest-rank enum to a full security Actor.

| | |
|---|---|
| **Production source** | **5 files, +327 / −57** — this is the entire behavioural change |
| Everything else | tests (4 files), migrations + seed (4 files), documentation (8 files) |
| Tests | **535 passing / 60 files** (+38 vs base 497/56) |
| Production behaviour today | **unchanged** until a gated deployment runbook is executed |
| Applied to any database | **nothing** |

⚠️ **This PR must not be merged until three owner-run SQL steps are complete.** Merging is the deploy. See [Deployment](#deployment) and the [Deployment Gate](#deployment-gate).

---

# Problem Statement

The Constitution (RULE 2) requires: exactly one Ultimate Owner; only the Owner may create or delete Super Admins; nobody may promote themselves.

Verified against `origin/main` during the Phase 0 audit, **none of that was enforced**:

- The `admin_role` enum is `('super_admin','admin','moderator','analyst')` — there is **no `owner` value at all**.
- `POST /api/admin/rbac/roles` required the caller to hold `super_admin`, then inserted whatever role the request body named — **including `super_admin`**. `GrantRoleSchema` did not exclude it, and nothing compared the granted role against the granter's own.
- The only structural protection was a *floor* (cannot revoke the last `super_admin`), never a *ceiling*.

So a single compromised or careless Super Admin could permanently multiply itself, and the audit log could not even distinguish the founding admin from one granted five minutes earlier.

**Why this is Component 1 and not a backlog item:** this is the authorization root. Every Hub added on top of the Controller inherits it. Fixing it after building Hubs means re-auditing every one of them.

**Why Component 2 ships with it:** the Owner check needs somewhere to live. `resolveAdminRole` returned a single `AdminRole | null` — it had no place to carry "is this the Owner", and no place to carry the multiple active roles the Permission Engine (Component 4) will need. Identity had to grow before the Owner could be expressed cleanly.

---

# Architecture

## Platform Owner

A single constitutional principal stored in its own table:

```
platform_owner (id, user_id → profiles ON DELETE RESTRICT,
                active, assigned_at, assigned_by, revoked_at, notes)

CREATE UNIQUE INDEX uq_platform_owner_single_active
  ON platform_owner (active) WHERE active = true;
```

"Exactly one Owner" is a **database invariant**, not an application count. An application-level check races under concurrency; a partial unique index cannot. `ON DELETE RESTRICT` means deleting the Owner's profile fails loudly rather than silently leaving the platform ownerless.

## Why Owner is NOT a Role

This is the central design decision, and it was deliberate.

Adding `'owner'` to the `admin_role` enum is the obvious move and the wrong one. The moment Owner becomes a row in `admin_roles`, it travels through the **same grant API, the same UI, the same cache, and the same code paths** as every other role — and "only the Owner may grant it" degrades into one more `if` statement that some future handler forgets.

Keeping the Owner in a separate table makes the dangerous operation **structurally unreachable rather than merely guarded**. There is no code path from the RBAC API to `platform_owner` at all. The table is written only by the bootstrap seed and the break-glass runbook, both run manually.

Consequence worth stating: the Owner is invisible to RBAC. `hasRole()` knows nothing about it, and `admin_roles` is never consulted to answer "is this the Owner".

## Identity

`resolveActor(req)` is the **single Actor construction site**. `requireAdminRole` delegates to it, so the two can never drift.

```ts
interface Actor {
  userId: string
  email: string
  isOwner: boolean                        // from platform_owner — NEVER from admin_roles
  roles: AdminRole[]                      // ALL active grants, not just the highest
  highestRole: AdminRole | null
  capabilities: readonly CapabilityId[]   // reserved for Component 5
  source: 'cookie' | 'bearer'
  resolvedAt: number
}
```

- **`roles` is a list.** `admin_roles` already permitted multiple rows per user (`UNIQUE(user_id, role)`); the previous highest-rank-only resolution silently discarded information the Permission Engine needs to union permission bundles.
- **`capabilities` is reserved now** so the interface does not change shape when the Capability Registry lands. Its contract is test-locked: **empty means "registry not installed", not "denied everything"**. Gating on it today would deny every actor including the Owner.
- **`getRequestUser` is unchanged.** Its dual cookie/bearer handling is proven and was not touched.
- **`resolveAdminRole` is retained as a transition shim** with a defined removal point (end of Block A, when the PDP replaces the rank ladder). Not permanent old/new coexistence.

## Owner Guard and the RBAC boundary

`requireAdminRole` evaluates in a fixed order:

```
1. Identity      resolveActor(req)     → 401 if unauthenticated
2. Owner Guard   checkOwnerGate()      → 403 if the ownership assertion fails
3. RBAC          hasRole(role,minRole) → 403 if the role is insufficient
```

**The Owner Guard runs before any RBAC decision.** This is a security property, not an implementation detail, and two tests pin it — one fails the gate for a user who would *also* fail the role check and asserts the gate's error is the one that surfaces; the other denies a valid `super_admin` when the gate fails.

The boundary is therefore: **RBAC answers "what may this role do"; the Owner Guard answers "is this Controller instance operating under the ownership it was configured for".** They are independent questions and neither can satisfy the other.

`requireOwner(ctx, operation)` is a thin third check used only on the `super_admin` grant/revoke paths, so the API can answer a clear 403 instead of surfacing a raw Postgres `42501`. It is UX and defence in depth — **the authoritative check lives in the database functions**.

---

# Security

## Threat model

| Threat | Before | After |
|---|---|---|
| A Super Admin multiplies itself | **Possible via the documented API**, unbounded | Owner only, enforced in `SECURITY DEFINER` functions |
| An admin promotes themselves | Possible | Blocked at API and in the database, for everyone including the Owner |
| A Super Admin demotes the founder | Possible | Blocked — the Owner's roles cannot be stripped by anyone else |
| A Super Admin removes the last Super Admin | Blocked (app-level only) | Blocked inside the function, unbypassable by other write paths |
| Ownership silently transferred by a DB compromise | N/A | Requires the Vercel environment as well |
| Ownership silently transferred by an env compromise | N/A | Requires database write as well |
| Privilege change is untraceable | `rbac.role_granted` for everything | `owner.super_admin_granted` / `owner.super_admin_revoked` separated for alerting |

## Privilege escalation prevention

Three layers, two of which ship in this PR:

1. **Schema** — single-active-owner invariant enforced by a partial unique index.
2. **Functions** — `fn_grant_admin_role` / `fn_revoke_admin_role`, `SECURITY DEFINER` with pinned `search_path`, enforcing all four constitutional rules server-side. Both RBAC routes now call these RPCs; `.insert()` on `admin_roles` is gone from the handlers, asserted by test.
3. **Privilege revocation** — *deferred*, see below.

## Owner bootstrap

`supabase/seed/platform_owner_bootstrap.sql` **derives** the Owner from the sole active `super_admin` and `RAISE`s if the count is anything other than exactly 1. No UUID is hardcoded and none is guessed — if production state is ambiguous, the bootstrap refuses rather than making someone the Owner by accident. Idempotent: a second run is a no-op.

## Boot assertion

`PLATFORM_OWNER_USER_ID` must match the active `platform_owner` row. Transferring ownership therefore requires **both** database access **and** the Vercel environment.

Rollout semantics are deliberate and asymmetric:

- **env unset** → gate inert; behaviour identical to today. This is what makes deploy-then-configure safe.
- **env set** → gate enforced; any mismatch denies the entire Controller while leaving product routes untouched.

The asymmetry is acceptable because this gate is **not the primary control** — privilege escalation is blocked by the database functions regardless of the env var. The gate defends against a database-only compromise.

## Deferred hardening strategy

The third layer — `REVOKE INSERT, UPDATE, DELETE ON admin_roles FROM service_role` — is **staged, not shipped**, per [ADR-017](https://github.com/huyphamsm-tappy/tappyai-mvp/blob/feat/controller-v2-foundation/docs/architecture/ADR-017-service-role-hardening-strategy.md).

It is the one step in Component 1 that **cannot fail safe**: every other artefact is additive and inert on rollback, while this removes a capability running code depends on. Its true precondition is also broader than this component — *nothing anywhere* may write `admin_roles` directly — which cannot be asserted while nine Foundation components remain unbuilt.

**Accepted residual risk, stated plainly:** until it runs, a route achieving arbitrary code execution could bypass the functions and write role rows directly. Bounded by two facts — both RBAC routes now use the RPCs, and the pre-existing exposure was strictly worse, since the *documented, intended* API previously allowed peer minting with no compromise at all. ADR-017 §4 records this in full.

---

# Database

## Immediate migrations — apply during deployment

### `supabase/migrations/20260803_platform_owner.sql` (runbook Step 2)

Purely additive. No `DROP`, no `REVOKE`, no `ALTER` of any existing object.

| Object | Type | Notes |
|---|---|---|
| `platform_owner` | table | RLS enabled, deny-by-default |
| `uq_platform_owner_single_active` | partial unique index | the single-Owner invariant |
| `idx_platform_owner_user` | index | lookup by user |
| `fn_is_platform_owner` | function | `SECURITY DEFINER`, single definition of "is the Owner" |
| `fn_grant_admin_role` | function | `SECURITY DEFINER`, constitutional guards |
| `fn_revoke_admin_role` | function | `SECURITY DEFINER`, guards + lockout protection |
| `GRANT EXECUTE` ×3 | privilege | `service_role` may call the three functions |
| `GRANT SELECT ON platform_owner` | privilege | `owner.ts` reads this table on every admin request |

**Idempotent:** every statement is `IF NOT EXISTS`, `CREATE OR REPLACE`, or a re-`GRANT`. Re-running is safe. Existing tables, columns, rows and privileges are untouched — `admin_roles` keeps its schema and its data.

**Self-contained (owner decision, 2026-08-03).** The grants are explicit rather than inherited from ambient database defaults. Two implicit assumptions were removed:

- **A1** — PostgreSQL grants `EXECUTE` to `PUBLIC` on new functions by default. True today, but implicit, and six other migrations in this repository already grant explicitly. Had `PUBLIC` execute ever been revoked as a hardening step, every role grant would have returned HTTP 500 with no obvious cause.
- **A4** — Supabase's default privileges grant table access to `service_role`. Same class, worse failure mode: `owner.ts` reads `platform_owner` as a **table**, not through an RPC, and a failed read degrades to "no owner assigned" — which, with `PLATFORM_OWNER_USER_ID` set, returns **403 for the entire Controller**.

Nothing is granted to `anon` or `authenticated`; the ownership record must never be client-readable, and RLS remains deny-by-default with zero policies. Runbook Step 2 verifies all three conditions.

Full analysis: [`ASSUMPTION_REGISTER_COMPONENT_1_2.md`](https://github.com/huyphamsm-tappy/tappyai-mvp/blob/feat/controller-v2-foundation/docs/controller-v2/ASSUMPTION_REGISTER_COMPONENT_1_2.md).

### `supabase/seed/platform_owner_bootstrap.sql` (runbook Step 3)

Assigns the Owner, guarded as described above. Idempotent.

## Deferred migration — MUST NOT be executed now

### `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql`

**Gate:** end of the Controller V2 Foundation, after all Phase 1 components have shipped and soaked.

**Why it must not run now:**

1. **It removes a privilege the currently deployed code uses.** Applied before the application deploy, role granting breaks in production immediately.
2. **Its precondition is not yet satisfiable.** It is safe only once *no code anywhere* writes `admin_roles` directly. This PR fixes the two RBAC routes; nine Foundation components are still unbuilt and may legitimately need role writes during development.
3. **It is subtractive, so it cannot fail safe.** Every other migration in this PR is inert on rollback.

**How that is enforced structurally, not by convention:** the file lives **outside** `supabase/migrations/`, in `deferred/`, with a README stating the rule. No bulk or directory-default apply can reach it. This matters because the Analytics production-readiness review (finding R1) already recorded a *real* incident in this repository where directory-order apply ran migrations out of dependency order.

---

# Deployment

## Order

```
Step 1  Read-only verification      (owner runs SQL — HARD STOP GATE)
Step 2  Apply schema migration      (owner runs SQL)
Step 3  Bootstrap Owner + set env   (owner runs SQL + Vercel)
────────────────────────────────────────────────────────────
Merge   ← merging IS the deploy
Deploy  Vercel builds and ships main
Verify  Step 4 post-deploy checks
Rollback (if needed) revert the merge commit — no DB action
```

Full detail: [`docs/controller-v2/runbooks/COMPONENT_1_DEPLOYMENT.md`](https://github.com/huyphamsm-tappy/tappyai-mvp/blob/feat/controller-v2-foundation/docs/controller-v2/runbooks/COMPONENT_1_DEPLOYMENT.md). Every step carries Purpose, Preconditions, Commands, Verification, Rollback and STOP conditions.

## Why merge MUST NOT happen before the SQL steps

**On this repository, merging to `main` triggers the production deploy.** There is no separate promotion step, so the ordering cannot be enforced by the runbook alone — it has to be enforced at the merge button.

If the code ships before Step 2:

- `fn_grant_admin_role` does not exist → the RPC returns Postgres `42883` (undefined_function) → that code is not mapped to 409/403 → it falls through to the generic handler → **HTTP 500 on every role grant, not just `super_admin`**.
- Everything else degrades gracefully: `owner.ts` catches the missing table and treats it as "no owner", so `/admin`, analytics, audit, deals and the entire product surface are unaffected.

If the code ships after Step 2 but before Step 3 (no Owner row):

- `isOwner` is false for everyone, so **no one can grant `super_admin`** — including the founder. Lower-privilege grants still work.

Neither is a code defect. Both are deployment-order dependencies, which is why the [Deployment Gate](#deployment-gate) exists.

## Rollback

| Stage | Action | Data loss |
|---|---|---|
| After Step 2 | `DROP FUNCTION` ×3, `DROP TABLE platform_owner` | none — nothing deployed references them |
| After Step 3 | `UPDATE platform_owner SET active=false, revoked_at=NOW()`; unset the env var | none |
| **After deploy** | **Revert the merge commit and redeploy. No database action required.** | none |

The post-deploy case matters most: the previous code has no Owner Guard and never reads `platform_owner`, so the table and the env var are **inert to it**. Leaving both in place is the *lower-risk* rollback; tearing down the schema as well would add risk for no benefit.

---

# Verification

All gates re-run against the branch head after every change, including the final one.

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **clean** |
| Lint | `npm run lint` | **0 errors** (pre-existing warnings only) |
| Tests | `npm test` | **535 passed / 60 files** |
| Architecture | `npm run architecture:check` | **7 / 7 rules passed** |
| Build | `npm run build` | **exit 0, 121 / 121 static pages** |

## Runtime

`next start`, Next.js **14.2.35** confirmed in the startup banner (the worktree's own binary, not the primary tree's — a known trap on this repo).

| Check | Result |
|---|---|
| `/api/admin/{audit,settings,rbac/roles,deals,analytics/auth,analytics/activation}` unauthenticated | **401 × 6** |
| Product surface `/`, `/login`, `/reviews`, `/scam-shield`, `/api/{health,version,config,deals}` | **200 × 8** |
| Unauthenticated `/admin` | → `/login?redirect=/admin`, **no admin shell rendered** (`.admin-theme` absent, browser-confirmed) |

## Regression

- All six admin endpoints behave exactly as before the `rbac.ts` rewrite.
- Product routes untouched — Component 1 shares no code path with them.
- The pre-existing last-`super_admin` lockout guard is preserved, now enforced inside the database function rather than only in the handler.

## Coverage increase

**+38 tests, +4 files** vs base: `origin/main` `7fa2c31` measures **497 tests / 56 files**; this branch measures **535 / 60**. The four new files below account for exactly 38 tests (13 + 13 + 9 + 3).

| File | Tests | Covers |
|---|---|---|
| `src/lib/admin/owner.test.ts` | 13 | owner resolution, caching, graceful degradation when the table is absent, all four `checkOwnerGate` outcomes |
| `src/lib/admin/rbac.test.ts` | 13 | `resolveActor` (roles[], capabilities[], expired-grant filtering, isOwner sourcing, bearer detection), `requireAdminRole` 401/403/success, **Owner-Guard-before-RBAC ordering** |
| `src/app/api/admin/rbac/roles/route.test.ts` | 9 | constitutional guards incl. a named **G1 regression test**, DB error mapping, audit action selection |
| `src/lib/admin/capabilities.test.ts` | 3 | the reserved-slot contract for `capabilities` |

Two are security assertions rather than coverage: *"a non-Owner `super_admin` CANNOT grant `super_admin`"* (the G1 regression) and *"evaluates the Owner Gate BEFORE the RBAC role check"*.

**Known verification limit:** the *enforced* path of the Owner Gate is unit-tested but not runtime-verified — exercising it requires an authenticated admin session, unavailable locally. Covered by runbook Step 4.

---

# Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Bootstrap run when production has ≠ 1 active `super_admin` | High | The script aborts itself; runbook Step 1 Q1 is a pre-flight STOP gate |
| R2 | `PLATFORM_OWNER_USER_ID` misconfigured | Medium | Fails closed and loudly with a named log line; product routes unaffected; fix is env + redeploy, no DB action |
| R3 | Service-role retains direct `admin_roles` write until the deferred hardening | Medium | ADR-017 §4; both routes use the RPCs; strictly smaller than the pre-existing exposure |
| R4 | Owner account lost | High | Break-glass runbook — DB **and** env required, maintenance mode first, fully audited, verification before service resumes |
| R5 | Enforced Owner Gate path not runtime-verified pre-merge | Low | Runbook Step 4; fails visibly, never silently |
| R6 | 60s principal cache means revocation lags | Low | Pre-existing behaviour, unchanged; `invalidateRoleCache` is called on every grant/revoke |
| **R7** | **Deployment dependency — merge before SQL steps** | **High** | See below |

## R7 — Deployment Dependency Risk

**Cause.** Merging to `main` triggers the production deploy on this repository. The application code assumes `fn_grant_admin_role`, `fn_revoke_admin_role` and `platform_owner` already exist, because runbook Steps 2 and 3 were designed to run first. Nothing in Git enforces that ordering.

**Impact.**

- *Merged before Step 2:* `fn_grant_admin_role` is undefined → RPC returns `42883` → unmapped → **HTTP 500 on every role grant**, not only `super_admin`. All other Controller surfaces and the entire product surface continue working normally, because `owner.ts` already degrades gracefully on a missing table.
- *Merged after Step 2 but before Step 3:* no Owner row exists → `isOwner` is false for everyone → **nobody can grant `super_admin`**, including the founder. Lower roles still grant normally.

**Mitigation.** The [Deployment Gate](#deployment-gate) below must be fully checked before merge. Steps 1–3 are owner-run SQL and are the gate's core items. Step 1 Q1 is a hard STOP: if production does not have exactly one active `super_admin`, do not proceed.

**Rollback.** Revert the merge commit and redeploy. **No database action is required** — the previous code never reads `platform_owner` and does not call the RPCs, so any partially-applied schema is inert to it. Role granting returns to its previous behaviour immediately on redeploy. If a full teardown is genuinely wanted, run Step 3's then Step 2's rollback *after* the code revert is live, never before.

---

# Breaking Changes

**None** — with one deliberate exception, which is the entire purpose of this PR:

> **Only the Platform Owner may grant Super Admin.**
>
> A non-Owner `super_admin` attempting to grant `super_admin` now receives **HTTP 403**. Previously this succeeded.

Everything else is unchanged:

- **No API contract changed.** Same routes, same request and response shapes, same status codes.
- **No product behaviour changed.** Component 1 shares no code path with the consumer app.
- **No schema changed.** `admin_roles` keeps its columns, its rows and its enum.
- **No dependency changed.** `package.json` and `package-lock.json` are untouched.

**Internal type change (not a public break):** `AdminContext` gains a required `actor` field, and `resolveActor` returns `{ user, actor } | null` rather than `Actor | null`. Every call site is inside this PR. `AdminContext` is server-only and confined to `/api/admin/*`; no external consumer exists.

---

# Deployment Gate

**Nothing may be merged until every box is checked.**

```
□  PR approved by the owner
□  Tests passed (535 / 60 files) — run LOCALLY; CI does not run tests on this repo
□  Runbook reviewed: docs/controller-v2/runbooks/COMPONENT_1_DEPLOYMENT.md
□  SQL Step 1 completed — read-only verification
□  Exactly one active super_admin verified (Step 1, Q1 = 1)   ← HARD STOP if ≠ 1
□  Step 1 Q2 confirmed Component 1 not already applied
□  Step 1 Q3 confirmed no function-name collision
□  Step 1 Q4 confirmed admin_role / admin_roles / profiles exist
□  SQL Step 2 completed — schema migration applied
□  Step 2 verification 1: all six object assertions true (incl. prosecdef = true on both functions)
□  Step 2 verification 2: A1 service_role EXECUTE ×3, A4 SELECT on platform_owner, A4b RLS on + 0 policies
□  Step 2: NOTIFY pgrst, 'reload schema' issued
□  SQL Step 3 completed — Owner bootstrapped, exactly one active owner row
□  PLATFORM_OWNER_USER_ID set in Vercel (Production + Preview + Development) and matches the owner row
□  Rollback reviewed and understood for Steps 2, 3 and post-deploy
□  Deferred migration confirmed NOT applied (service_role still holds INSERT/UPDATE/DELETE on admin_roles)
□  Merge approved
```

**After merge (runbook Step 4 — post-deploy verification):**

```
□  /admin loads for the Owner
□  /admin unchanged for a non-owner admin
□  Owner grants analyst to a test user → 200
□  Non-owner super_admin grants super_admin → 403        ← the G1 regression check
□  Any actor grants a role to themselves → 403
□  Revoking the last super_admin → 409
□  audit_log contains owner.super_admin_granted after an Owner grant
□  Product routes (/, /reviews, /scam-shield) → 200
```
