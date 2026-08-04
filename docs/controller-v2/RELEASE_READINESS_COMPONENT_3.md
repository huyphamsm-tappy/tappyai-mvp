# Release Readiness Report — Component 3 (RBAC)

**Commit:** `c4f5b2a` on `feat/controller-v2-component3-rbac`
**Branch point:** `35233a4` · **Date:** 2026-08-04
**Verdict:** ✅ **READY FOR PULL REQUEST** — ⛔ **NOT approved for merge or deploy**

Nothing has been merged, deployed, or applied to production. No SQL was executed.

---

## 1. Verdict

| | |
|---|---|
| Known code defects | **0** |
| Blocking issues | **0** |
| Owner gate items before merge | **2** (§7) |
| Post-deploy verification requiring Owner | **1** (§7) |

Component 3 is complete against its specification and self-reviewed. The
remaining items are not code — they are actions only the Owner can perform.

## 2. Quality gates

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ exit 0, no output |
| Tests | `npx vitest run` | ✅ **63 files / 613 tests passed**, 0 failed |
| Architecture | `npm run architecture:check` | ✅ 7/7 rules passed |
| Lint | `npx next lint --dir src` | ✅ **0 errors**; pre-existing warnings only, **none in `permissions/`** |
| Build | `npx next build` | ✅ compiled; **all `/admin` routes `ƒ` dynamic** |

Test count rose from 592 (branch point) to 613: +68 new Component 3 tests, with
the delta reflecting migrated route tests being rewritten rather than added.

## 3. Specification compliance

### Required deliverables

| Requirement | Status | Where |
|---|---|---|
| Permission Engine | ✅ | `engine.ts` — the Policy Decision Point |
| Permission Registry | ✅ | `registry.ts` — 13 permissions, 6 modules |
| Role → Permission mapping | ✅ | `roleMap.ts` — union, not inheritance |
| Permission Resolver | ✅ | `resolver.ts` |
| Permission Cache | ✅ | `cache.ts` — version-safe, role-set-keyed |
| Route authorization helpers | ✅ | `guards.ts` — `requirePermission`, `requireAllPermissions` |
| UI authorization helpers | ✅ | `client.ts` — `can`, `filterByPermission` |
| Capability-aware authorization | ✅ | `engine.ts` step 3, inert until Component 5 |

### Constitutional constraints

| Constraint | Status | Evidence |
|---|---|---|
| Owner is **not** a role | ✅ | No `owner` entry exists in `AdminRole` or the registry |
| Owner is **not** a permission | ✅ | No permission grants ownership; `defaultRoles` never contains an owner |
| Owner is **not** in the permission engine | ✅ | `engine.ts:68` — bypass returns before registry, resolver and cache are touched |
| Owner enforced only by Owner Guard | ✅ | `requireOwner()` unchanged; still layered on both `security.roles.*` routes |
| Authorization consumes the Actor model | ✅ | Every guard takes/returns `Actor` from Component 2 |
| Permissions are first-class objects | ✅ | `PermissionDefinition` with 9 metadata fields |
| No hardcoded permission strings in handlers | ✅ | 19/19 guard calls use a `PERMISSIONS.*` constant — machine-checked |
| Registry is single source of truth | ✅ | `PERMISSIONS` ↔ registry bijection asserted in tests |

### Required test scenarios (11 minimum)

All present in `engine.test.ts`: permission inheritance · multiple roles · cache
invalidation · unknown permission · deprecated permission · permission conflicts
· missing registry entry · unauthorized access · authorized access · **Owner
bypass** · capability integration. Plus 9 registry-integrity invariants and a
20-test backward-compatibility lock.

## 4. The seven audits

### 4.1 Architecture — ✅ pass

Eight modules, single-direction dependencies, no cycles. `guards.ts` is the only
server-only module (it reaches `next/headers`); `index.ts` re-exports it and is
therefore server-only too. Verified that **no `'use client'` file imports
`@/lib/admin/permissions`, `guards`, `resolver`, `cache`, or `@/lib/admin/rbac`**
— zero violations. `client.ts` imports nothing but a type.

Registry, cache and engine are all injectable (`createRegistry`,
`createPermissionCache`, `createPermissionEngine`), so tests exercise fixtures
without touching the production catalogue.

### 4.2 Security — ✅ pass

| Check | Result |
|---|---|
| Owner bypass precedes registry lookup | ✅ — authority not revocable by editing the catalogue |
| Unknown permission fails **closed** | ✅ `UNKNOWN_PERMISSION` deny |
| No session fails **closed** | ✅ `UNAUTHENTICATED` deny |
| Identity resolved before authorization | ✅ Owner boot assertion runs first |
| Owner Guard still layered on `security.roles.*` | ✅ both grant and revoke |
| Database remains the final authority | ✅ `fn_grant_admin_role` / `fn_revoke_admin_role` untouched |
| No permission grants ownership | ✅ |
| No parallel authorization path remains | ✅ `page-guard.ts` **deleted**; `requireAdminRole` deprecated with 0 production callers |
| UI authorization not load-bearing | ✅ every page and handler authorizes independently; documented in `client.ts` |
| Cache cannot serve stale privilege | ✅ role-set-keyed + version-keyed |

Invariant 9 in the registry tests is the notable one: **no role other than
`super_admin` may hold a `security`-category permission**, machine-checked.

### 4.3 Permission — ✅ pass, 2 gaps found and fixed

All 13 permissions carry complete metadata. All 12 API handlers and all 8 admin
pages are gated. Two gaps found:

- `/admin` and `/admin/analytics` had **no guard of their own**, relying on the
  layout while the sidebar already hid them behind permissions — hidden doors
  that were not locked. Both now enforce their own permission.
- Every role holds both permissions today, so **no operator's access changed**;
  asserted in `migration.test.ts`.

### 4.4 Performance — ✅ pass

| Property | Finding |
|---|---|
| Role map construction | Built **once per resolver**, not per call |
| Resolution cost | Pure set union over in-memory data; no I/O added |
| Database round-trips added | **0** — the principal cache already fetched roles |
| Cache TTL | 30 s, deliberately half the 60 s principal cache |
| UI resolution | Once per request in the layout; the client receives a plain array |
| Bundle impact | `/admin` 2 kB / 124 kB first-load; nav filtering is one `Array.includes` per item |

**One bound recorded, not fixed:** caches are per-process (ADR-003), so
invalidation on Vercel clears only the writing instance; others fall back to
TTL. Worst case ≤30 s of stale permissions — tighter than the ≤60 s already
accepted for roles in Component 2. Not introduced here. → `BL-C3-01`.

### 4.5 Dead code — ✅ pass, 3 findings all resolved

| Finding | Resolution |
|---|---|
| **The entire engine had zero consumers** — green, fully tested, imported by nothing | Migrated all 18 decision points + the nav |
| `canAll` / `canAny` unconsumed | **Removed.** The registry has no read/write role split, so no screen has a viewer who cannot also act; any consumer would have been invented to justify the helper |
| `page-guard.ts` — 0 callers, 0 tests after migration | **Deleted.** It was also a parallel role-rank path that could bypass the registry |
| `requireAdminRole` — 0 production callers | **Kept, `@deprecated`.** Its tests are the coverage for the Component 1 Owner boot assertion; deleting Component 2 test coverage is out of scope |

The first finding is the one that mattered. It is the same class of blocker
Component 2 hit, at larger scale.

### 4.6 Backward compatibility — ✅ pass, machine-checked

For all 18 migrated call sites, the new permission grants **exactly** the role
set the old `ROLE_RANK` ladder admitted:

| Legacy gate | Ladder admitted | New permissions grant |
|---|---|---|
| `'analyst'` | analyst, moderator, admin, super_admin | identical |
| `'admin'` | admin, super_admin | identical |
| `'super_admin'` | super_admin | identical |

Effective sets, dumped from the built registry: `analyst` 3 · `moderator` 3 ·
`admin` 10 · `super_admin` 13.

This is asserted in `migration.test.ts`, not claimed in prose. A future silent
policy drift fails the build.

Also unchanged: role data, the Owner mechanism, every Hub feature, all public
API behaviour for authorized users.

### 4.7 Documentation — ✅ pass

Six documents produced; all cross-references verified to resolve. Every source
path cited exists, except `src/lib/admin/page-guard.ts`, which is correctly
cited **as deleted**.

`03_COMPONENT3_RBAC_DESIGN.md` · `RBAC_MANIFEST.md` · `PERMISSION_REGISTRY.md` ·
`PERMISSION_RESOLUTION_FLOW.md` · `RBAC_DEPLOYMENT_RUNBOOK.md` ·
`RBAC_PR_DESCRIPTION.md`, plus `BL-C3-01` / `BL-C3-02` in `BACKLOG.md`.

## 5. Scope discipline

| Rule | Held |
|---|---|
| Component 3 only | ✅ |
| Components 1–2 modified only where integration required | ✅ 4 changes in `rbac.ts`, each justified in the manifest |
| Component 4+ not implemented | ✅ |
| Unrelated modules untouched | ✅ no change outside `src/lib/admin`, `src/app/admin`, `src/app/api/admin`, `src/components/admin` |
| Hub features frozen | ✅ no functional change to Deals, Analytics or Audit |

## 6. Deployment risk

**Low.**

```
SQL statements ............. 0
Schema changes ............. 0
New environment variables .. 0
Role data touched .......... none
```

Rollback is promoting the previous Vercel deployment — no database state to
unwind, which was the expensive failure mode during the Component 1–2
deployment.

The residual risk is **policy, not code**: `defaultRoles` is the artefact that
could be wrong in a way no build log would reveal. `migration.test.ts` locks it
against the previous behaviour, and runbook §3.2 verifies it in production.

## 7. Open items — Owner action required

None of these are code defects. All three need the Owner.

1. **Open the PR.** `gh` CLI is unauthenticated on this machine; I cannot open
   or merge pull requests. `RBAC_PR_DESCRIPTION.md` is ready to paste.
2. **Merge with a merge commit, not a squash** — per the standing instruction
   from the Foundation merge.
3. **Post-deploy §3.2 verification needs a second admin session.** Confirming
   that an `admin` is redirected away from `/admin/rbac` requires an
   authenticated non-Owner account. I cannot create accounts or enter
   passwords.

**BL-002** (production validation of gate G1) remains open from the Foundation
phase. Per Owner instruction it does not block Component 3, which neither fixes
nor worsens it — the Owner Guard call sites are unchanged and the roles admitted
to them are provably identical. Runbook §3.2 is the natural moment to close it,
if the Owner provisions the test account during this deployment.

## 8. Honest limits of this report

- Every claim above is verified by a command that was actually run, except §7,
  which describes work not yet done.
- **Nothing has been verified against production.** The gates prove the code
  compiles, type-checks, passes 613 tests and builds. They do not prove that the
  deployed build behaves correctly for a real non-Owner admin — only runbook §3
  can, and it has not been executed.
- The build passing is not evidence that the tested build is the deployed build.
  Runbook §3.2 exists for that reason.

---

**Stopping here as instructed.** No merge, no deploy, no production change.
Awaiting Owner approval.
