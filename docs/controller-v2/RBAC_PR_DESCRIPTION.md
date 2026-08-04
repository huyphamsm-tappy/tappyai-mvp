# feat(controller-v2): Component 3 — RBAC permission engine

**Branch:** `feat/controller-v2-component3-rbac` → `main`
**Branch point:** `35233a4` · **Merge strategy:** merge commit, do **not** squash
**Scope:** Component 3 only. Components 1–2 touched only where integration required.

---

## Summary

Replaces the Controller's role-rank authorization ladder with a permission
registry: permissions are first-class objects with metadata, roles map to
permission sets, and every authorization decision in the back office resolves
through one Policy Decision Point.

**Nobody's access changes.** This is a mechanism change, and a machine-checked
test (`migration.test.ts`) asserts that for all 18 migrated call sites the new
permission grants *exactly* the role set the old ladder admitted.

The Platform Owner stays **completely outside RBAC** — not a role, not a
permission, not resolved through the engine. Owner bypass is the engine's first
statement, before the registry lookup, so the Owner's authority can never be
revoked by editing the catalogue.

## Why

The ladder (`requireAdminRole(req, 'admin')`) had three defects that compound
with every Hub added:

1. **Rank is one number.** It cannot express a role that is broad in one module
   and absent from another — which every future role (`support`, `partner_ops`)
   will need.
2. **The requirement lives at the call site.** No catalogue, so "who can delete
   a deal?" is answered by grepping and "what can `moderator` do?" cannot be
   answered at all.
3. **Read and write are indistinguishable.** The same gate guarded listing deals
   and deleting them.

## What changed

| | |
|---|---:|
| Files changed | 47 |
| Lines | +3441 / −177 |
| New permission engine | 9 modules + 4 test files, ~1 850 lines |
| Authorization decision points | 20 |
| Permissions defined | 14 across 6 modules |
| Tests added | 88 (47 engine + 22 migration + 12 guards + 7 invalidation) |
| **SQL statements** | **0** |
| **New environment variables** | **0** |

### New — `src/lib/admin/permissions/`

`types.ts` · `registry.ts` · `roleMap.ts` · `cache.ts` · `resolver.ts` ·
`engine.ts` · `guards.ts` (server only) · `client.ts` · `index.ts` +
`engine.test.ts` · `migration.test.ts` · `guards.test.ts` · `invalidation.test.ts`

### Migrated (18) + newly guarded (2) = 20 decision points

- **12 API handlers** — `requireAdminRole(req, role)` → `requirePermission(req, PERMISSIONS.X)`
- **6 page guards** — `requirePageRole(role)` → `requirePagePermission(PERMISSIONS.X)`
- **Sidebar** — `NavItem.minRole` → `NavItem.permission`, filtered via `filterByPermission`

### Deleted

- `src/lib/admin/page-guard.ts` — zero callers and zero tests after migration,
  and a parallel role-rank path that would let a future route bypass the
  registry.

### Components 1–2 changes (integration only)

- `resolveActorForUser()` added to `rbac.ts` — page guards need **all** roles;
  `resolveAdminRole()` returns only the highest, which silently drops
  permissions under union semantics.
- `resolveActor` now **delegates** to it, restoring the single Actor
  construction site the Component 2 review established.
- `invalidateRoleCache()` now also clears the permission cache.
- `requireOwner` widened to accept the context `requirePermission` returns.
- `requireAdminRole` marked `@deprecated` (zero production callers; kept because
  its tests cover the Component 1 Owner boot assertion).

## Design decisions worth reviewing

**Roles union, they do not inherit.** An actor with several roles gets the union
of their sets. Union is monotone — adding a role can only add permissions —
whereas a rank ladder can *reduce* effective access, because only the highest
role is consulted. This is why `resolveActorForUser` had to exist.

**Owner bypass precedes the registry lookup.** An unknown permission still
ALLOWs for the Owner. Intended: if bypass came after the lookup, deleting a
registry row would lock the Owner out of their own platform.

**Unknown permission fails closed** for everyone else. A typo denies rather than
silently ungating a route.

**The cache cannot serve a stale privilege.** Entries are keyed on the role set
they were computed from, so a revoked role stops authorizing even before TTL and
even if `invalidate()` is never called. Entries also carry `REGISTRY_VERSION`,
so a registry edit discards them.

**Capability gating is present and inert.** `CAPABILITY_GATE_ENABLED = false`
until Component 5, because `Actor.capabilities` currently means "the registry is
not installed", not "this actor has none" — gating on it now would deny
everyone, including the Owner. The branch is tested so Component 5 flips a flag.

## Findings fixed in this PR

All were found by auditing the implementation, not by tests failing.

### From the formal review (9)

| # | Finding | Severity |
|---|---|---|
| R-1 | **Infinite redirect loop.** `requirePagePermission` redirected to `/admin` on Owner Gate failure — and `/admin` now has a guard, so the fallback redirected to itself. `ERR_TOO_MANY_REDIRECTS` in the exact scenario where the Controller most needs to fail diagnosably. | **blocker** |
| R-2 | **The role map was mutable at runtime.** `ReadonlySet` is erased at compile time and `Object.freeze` does not stop `Set.add`, so a stray `.add()` could permanently widen a role. The comment claimed protection that did not exist. | security |
| R-3 | `Resolver.roleMap` — no consumer, and it published a reference to the structure authorization derives from. Removed. | dead code |
| R-4 | `requireAllPermissions` — no caller. Removed. | dead code |
| R-5 | **`guards.ts` had zero tests.** The enforcement layer was untested, which is why R-1 survived self-review. 12 tests added. | missing tests |
| R-6 | `index.ts` and `guards.ts` carried a "migration in progress" narrative after migration was complete, and referenced `requirePageRole`, which was deleted. | doc |
| R-7 | **The registry lied about what it protected.** `/admin/analytics` is a *content* analytics page gated on `analytics.auth.read`, an *authentication* permission. Added `analytics.content.read` with identical `defaultRoles`. | registry |
| R-8 | **Two Actor construction sites.** Adding `resolveActorForUser` reintroduced the duplicated field mapping the Component 2 review had removed, and left a comment claiming there was only one. | duplication |
| R-9 | `invalidateRoleCache → permissionCache.invalidate` had **no assertion behind it**. The wire could be cut by a refactor with every test still green. 7 tests added, RED/GREEN proven. | missing tests |

### From the initial self-review (6)

1. **The engine had zero consumers.** The first implementation was a complete,
   green, fully-tested library that no route, page or component imported — an
   authorization layer that authorized nothing. Fixed by migrating all 18
   decision points plus the nav. *(Same class of blocker as Component 2, at
   larger scale.)*
2. **`requirePagePermission` used `resolveAdminRole`**, i.e. the highest role
   only — which silently drops permissions for multi-role actors under union
   semantics. Fixed by adding `resolveActorForUser`.
3. **A behaviour regression was nearly shipped.** The first registry omitted
   `moderator` from analytics, but under the old ladder `moderator` outranks
   `analyst` and *can* read analytics today. Restored, with the reasoning
   inline — tightening it is a policy question for the Owner, not something to
   smuggle into a mechanism change.
4. **Two doors were hidden but not locked.** `/admin` and `/admin/analytics` had
   no guard of their own and relied on the layout, while the sidebar already
   hid them behind permissions. Both now enforce their own permission. Every
   role holds both today, so no access changes. `/admin` moved its UI to
   `HomeDashboard.tsx` so the page could become a server component — it is now
   `ƒ` dynamic instead of statically prerendered, which is correct for an
   authenticated surface.
5. **A parallel authorization path survived migration.** `page-guard.ts` had no
   callers but would have let a future route gate on role rank, bypassing the
   registry. Deleted.
6. **Dead API surface.** `canAll`/`canAny` were written and removed: the
   registry currently has no read/write role split, so no screen has a viewer
   who cannot also act, and any consumer would have been invented to justify the
   helper.

## Two lessons worth carrying forward

**Adding a guard to a fallback destination turns that fallback into a loop.**
R-1 was created by a change (guarding `/admin`) that was itself a fix. Any
future guarded page must be checked against every redirect target pointing at it.

**A green engine says nothing about the enforcement layer.** 613 tests passed
with an infinite redirect loop in the guard, because every test exercised the
decision, not the action taken on it.

## Verification

```bash
npx tsc --noEmit && npx vitest run && npm run architecture:check && npx next build
```

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `vitest run` | ✅ **65 files / 634 tests passed** |
| `architecture:check` | ✅ 7/7 rules |
| `next lint` | ✅ 0 errors (pre-existing warnings only, none in `permissions/`) |
| `next build` | ✅ compiled; all `/admin` routes `ƒ` dynamic |

Both regression fixes are proven RED/GREEN: reverting R-1 fails 3 guard tests,
cutting the R-9 wire fails 2 invalidation tests.

Required test scenarios — all covered in `engine.test.ts`: permission
inheritance · multiple roles · cache invalidation · unknown permission ·
deprecated permission · permission conflicts · missing registry entry ·
unauthorized access · authorized access · **Owner bypass** · capability
integration.

## Risk

**Low.** No SQL, no env vars, no role data touched. Rollback is promoting the
previous Vercel deployment — there is no database state to unwind, which was the
expensive failure mode in the Component 1–2 deployment.

The residual risk is policy, not code: `defaultRoles` is the thing that could be
wrong in a way a build log cannot show. That is what `migration.test.ts` locks
and what §3.2 of the runbook verifies in production.

## Known bound (inherited, not introduced)

Permission and principal caches are per-process (ADR-003). On Vercel,
invalidation clears only the instance that served the write; others fall back to
TTL. Worst case **≤30 s** of stale permissions — tighter than the ≤60 s already
accepted for roles. Recorded in `BACKLOG.md`; a cross-instance invalidation bus
is a Foundation-wide concern.

## Open items

- **BL-002** (production validation of gate G1) remains open from the Foundation
  phase. Per Owner instruction it does not block Component 3, which neither
  fixes nor worsens it — the Owner Guard call sites are unchanged.
- **Policy proposal, not included:** whether `moderator` should keep analytics
  read access. Deliberately left as-is; see design doc §9.

## Documents

`03_COMPONENT3_RBAC_DESIGN.md` · `RBAC_MANIFEST.md` · `PERMISSION_REGISTRY.md` ·
`PERMISSION_RESOLUTION_FLOW.md` · `RBAC_DEPLOYMENT_RUNBOOK.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
