# PR — Controller V2 Foundation: Components 1 & 2 (Platform Owner + Identity)

> Copy this into the GitHub PR body. `gh` CLI is not authenticated on the build machine, so the PR must be opened manually:
> https://github.com/huyphamsm-tappy/tappyai-mvp/pull/new/feat/controller-v2-foundation

**Base:** `main` (`7fa2c31`) · **Head:** `feat/controller-v2-foundation` · **Merge type:** clean fast-forward, no divergence

---

## Executive Summary

Closes **audit finding G1**, the most serious issue found in the Controller V2 Phase 0 audit: **any `super_admin` could mint unlimited additional Super Admins**, and no Platform Owner existed anywhere in the schema, the code, or the environment.

This PR introduces the Platform Owner as a **constitutional principal that is not a role**, and upgrades identity resolution from a single highest-rank enum to a full security Actor.

- 17 files, +1795 / −57. **Production source is only 327 insertions across 5 files** — the rest is migrations, tests, and documentation.
- **535 tests pass (60 files)**, +35 over the base.
- **No production behaviour changes** until a deliberate, gated deployment runbook is executed.
- Nothing has been applied to any database.

---

## Why this change exists

The Constitution (RULE 2) requires: exactly one Ultimate Owner; only the Owner may create or delete Super Admins; nobody may promote themselves.

Verified against `origin/main` before this PR, **none of that was enforced**:

- The `admin_role` enum is `('super_admin','admin','moderator','analyst')` — there is no `owner` value at all.
- `POST /api/admin/rbac/roles` required the caller to be `super_admin`, then inserted whatever role the request body named — **including `super_admin`**. `GrantRoleSchema` did not exclude it and nothing compared the granted role against the granter's own.
- The only structural protection was a floor (cannot revoke the last `super_admin`), never a ceiling.

This sits at the authorization root. Every Hub added on top inherits it, which is why it is Component 1 rather than a backlog item.

---

## Architecture changes

### Component 1 — Platform Owner

**The Owner is not a role.** `owner` is deliberately never added to the `admin_role` enum. The moment Owner became a row in `admin_roles` it would travel through the same grant API, the same UI and the same code paths as every other role, and "only the Owner may grant it" would become one more `if` statement to get wrong. Keeping it in its own table makes the dangerous operation *structurally unreachable* rather than merely guarded.

| Layer | Mechanism |
|---|---|
| Schema | `platform_owner` + partial unique index `(active) WHERE active = true` → "exactly one Owner" is a database invariant, not an application count that races under concurrency. FK `ON DELETE RESTRICT` so deleting the Owner's profile fails loudly instead of silently leaving the platform ownerless. |
| Functions | `fn_grant_admin_role` / `fn_revoke_admin_role` — `SECURITY DEFINER`, pinned `search_path`. Enforce: only the Owner may grant/revoke `super_admin`; nobody may promote themselves (the Owner included); the last `super_admin` cannot be revoked; the Owner's own roles cannot be stripped by anyone else. |
| Boot assertion | `PLATFORM_OWNER_USER_ID` must match the active owner row, so transferring ownership requires **both** database access **and** the Vercel environment. |

**Deferred by [ADR-017](../architecture/ADR-017-service-role-hardening-strategy.md):** the third layer (`REVOKE INSERT/UPDATE/DELETE ON admin_roles FROM service_role`) is staged at `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql` for the end of the Foundation. It is the one step that cannot fail safe — it removes a capability running code depends on — and its real precondition is that *nothing anywhere* writes `admin_roles` directly, which cannot be asserted while nine Foundation components remain unbuilt.

### Component 2 — Identity

`resolveActor(req)` is now the **single Actor construction site**:

```ts
{ userId, email, isOwner, roles[], highestRole, capabilities[], source, resolvedAt }
```

- `isOwner` is read from `platform_owner`, **never** inferred from a role.
- `roles` is a **list**. `admin_roles` already permitted multiple rows per user; the previous highest-rank-only resolution discarded information the Permission Engine (Component 4) needs to union permission bundles.
- `capabilities` is reserved now (owner decision) so the interface does not change shape when the Capability Registry lands in Component 5.
- `getRequestUser` is **unchanged** — its dual cookie/bearer handling is proven and was not touched.
- `resolveAdminRole` is retained as a **transition shim with a defined removal point** (end of Block A, when the PDP replaces the rank ladder). Not permanent old/new coexistence.

**Ordering (security property):** identity → **Owner Gate** → RBAC. The gate is evaluated before any role decision, and two tests pin this explicitly.

---

## Security impact

| Area | Before | After |
|---|---|---|
| `super_admin` creation | Any `super_admin`, unbounded | Owner only, enforced in the database |
| Self-promotion | Possible | Blocked at API and in `SECURITY DEFINER` functions |
| Owner concept | Did not exist | Single active principal, DB-enforced uniqueness |
| Owner demotion by others | N/A | Blocked |
| Ownership transfer | N/A | Requires DB **and** Vercel env |
| Audit granularity | `rbac.role_granted` for everything | `owner.super_admin_granted` / `owner.super_admin_revoked` separated so they can be alerted on |

**Residual risk, stated plainly:** until the deferred hardening runs, the service-role client still holds direct write access to `admin_roles`. A route achieving arbitrary code execution could bypass the functions. Bounded by: both RBAC routes now use the RPCs (asserted by test, `.insert()` is gone), and the pre-existing exposure was strictly worse — the *documented, intended* API previously allowed peer minting with no compromise at all. ADR-017 §4 records this in full.

**Rollout is fail-safe by design:** `PLATFORM_OWNER_USER_ID` unset ⇒ the gate is inert and behaviour is identical to today; set ⇒ enforced, and any mismatch denies the whole Controller while leaving product routes up. Safe because the gate is not the primary control — the DB functions are.

---

## Database impact

**One additive migration.** No `DROP`, no `REVOKE`, no `ALTER` of any existing object — verified by grep over the migration.

| Object | Type |
|---|---|
| `platform_owner` | new table, RLS enabled, deny-by-default |
| `uq_platform_owner_single_active` | new partial unique index |
| `idx_platform_owner_user` | new index |
| `fn_is_platform_owner` | new function (`SECURITY DEFINER`) |
| `fn_grant_admin_role` | new function (`SECURITY DEFINER`) |
| `fn_revoke_admin_role` | new function (`SECURITY DEFINER`) |

Existing tables, columns, rows and privileges are untouched. `admin_roles` keeps its schema and data.

---

## Migration impact

- **Idempotent:** all seven statements are `IF NOT EXISTS` or `CREATE OR REPLACE`. Re-running is safe.
- **Bootstrap is guarded:** `supabase/seed/platform_owner_bootstrap.sql` derives the Owner from the sole active `super_admin` and `RAISE`s if the count is anything other than 1. No UUID is hardcoded or guessed. Idempotent — a second run is a no-op.
- **Deferred migration is not reachable by a bulk apply:** it lives under `supabase/migrations/deferred/`, outside the normal path, with a README stating the rule. This converts "remember not to run this yet" from a comment into a structural property — the Analytics readiness review (finding R1) already recorded a real wrong-order apply in this repository.
- **Ordering:** Step 2 (schema) → Step 3 (bootstrap) → Step 4 (deploy). Steps 2 and 3 are inert to the currently deployed code, so there is no window in which production behaves inconsistently.

---

## Rollback strategy

| Stage | Rollback | Data loss |
|---|---|---|
| After schema migration | `DROP FUNCTION` ×3, `DROP TABLE platform_owner` | none — nothing deployed references them |
| After bootstrap | `UPDATE platform_owner SET active=false, revoked_at=NOW()`; unset the env var | none |
| After deploy | **Revert the merge commit and redeploy. No database action required.** | none |

The post-deploy case is the important one: the previous code has no owner gate and never reads `platform_owner`, so the table and env var are inert to it. Leaving both in place is the *lower-risk* rollback; tearing down the schema as well would add risk for no benefit.

---

## Verification performed

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **535 passed / 60 files** |
| `npm run lint` | 0 errors (pre-existing warnings only) |
| `npm run architecture:check` | 7/7 rules passed |
| `npm run build` | exit 0, 121/121 static pages |

**Runtime** (`next start`, Next.js 14.2.35 confirmed in the startup banner):

- All 6 `/api/admin/*` endpoints return `401` unauthenticated after the `rbac.ts` rewrite
- Product surface `200`: `/`, `/login`, `/reviews`, `/scam-shield`, `/api/{health,version,config,deals}`
- Unauthenticated `/admin` lands on `/login?redirect=/admin` with **no admin shell rendered** (`.admin-theme` absent, confirmed in-browser)

**Known verification limit:** the *enforced* path of the owner gate is unit-tested but not runtime-verified — exercising it requires an authenticated admin session, unavailable locally. Covered by runbook Step 4.

---

## Test results

**535 passing, 60 files** (+35 vs base). New coverage:

| File | Tests | Covers |
|---|---|---|
| `src/lib/admin/owner.test.ts` | 13 | owner resolution, caching, graceful degradation when the table is absent, all four `checkOwnerGate` outcomes |
| `src/lib/admin/rbac.test.ts` | 13 | `resolveActor` (roles[], capabilities[], expired-grant filtering, isOwner sourcing, bearer detection), `requireAdminRole` 401/403/success, **Owner-Gate-before-RBAC ordering** |
| `src/app/api/admin/rbac/roles/route.test.ts` | 9 | constitutional guards incl. a named **G1 regression test**, DB error mapping, audit action selection |
| `src/lib/admin/capabilities.test.ts` | 3 | the reserved-slot contract for `capabilities` |

Two tests are worth calling out as security assertions rather than coverage:

- *"a non-Owner `super_admin` CANNOT grant `super_admin`"* — the G1 regression.
- *"evaluates the Owner Gate BEFORE the RBAC role check"* — proven by failing the gate for a user who would *also* fail the role check, then asserting the gate's error is the one that surfaces.

---

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Bootstrap run when production has ≠ 1 active `super_admin` | High | The script itself aborts; runbook Step 1 Q1 is a pre-flight STOP gate |
| R2 | `PLATFORM_OWNER_USER_ID` set incorrectly | Medium | Fails closed and loudly — every Controller request 403s with a named log line. Product routes unaffected. Fix = env var + redeploy, no DB action |
| R3 | Service-role retains direct `admin_roles` write until the deferred hardening | Medium | Accepted and documented in ADR-017 §4; both routes use the RPCs; strictly smaller than the pre-existing exposure |
| R4 | Owner account lost | High | Break-glass runbook: DB **and** Vercel env required, maintenance mode first, fully audited, verification before service resumes |
| R5 | Enforced gate path not runtime-verified pre-merge | Low | Explicit runbook Step 4 check; fails visibly, not silently |
| R6 | 60s principal cache means revocation lags | Low | Pre-existing behaviour, unchanged; `invalidateRoleCache` is called on every grant/revoke |

---

## Files changed

**Production source (5 files, +327/−57)**
- `src/lib/admin/owner.ts` *(new)* — owner resolution, caching, boot gate
- `src/lib/admin/capabilities.ts` *(new)* — `CapabilityId`, frozen `NO_CAPABILITIES`
- `src/lib/admin/rbac.ts` — `resolveActor`, `requireOwner`, principal resolution
- `src/app/api/admin/rbac/roles/route.ts` — grant via RPC + constitutional pre-checks
- `src/app/api/admin/rbac/roles/[id]/route.ts` — revoke via RPC + Owner check

**Database (4 files)**
- `supabase/migrations/20260803_platform_owner.sql` *(applied in Step 2)*
- `supabase/seed/platform_owner_bootstrap.sql` *(applied in Step 3)*
- `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql` *(**not** applied)*
- `supabase/migrations/deferred/README.md`

**Tests (4 files, 38 tests)** — `owner.test.ts`, `rbac.test.ts`, `capabilities.test.ts`, `roles/route.test.ts`

**Documentation (4 files)** — `ADR-017`, `03_PHASE1_FOUNDATION_DESIGN.md`, `runbooks/COMPONENT_1_DEPLOYMENT.md`, `BACKLOG.md`

---

## Breaking changes

**None for the product. One internal type change.**

`AdminContext` gains a required `actor` field. Every call site is inside this PR and updated. External consumers do not exist — `AdminContext` is server-only and confined to `/api/admin/*`.

`resolveActor` returns `{ user, actor } | null` rather than the `Actor | null` named in the design document §4.2. Deliberate: it gives the function a real caller (`requireAdminRole`) instead of leaving it as speculative API, and `AdminContext` still needs to expose the Supabase `User`.

**No API contract changed.** Same routes, same request/response shapes, same status codes — with one addition: `403` where a non-Owner attempts a `super_admin` grant, which is the entire point of the change.
