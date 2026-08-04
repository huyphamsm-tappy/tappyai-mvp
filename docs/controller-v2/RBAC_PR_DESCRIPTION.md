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
| Files changed | 37 |
| Lines | +1994 / −159 |
| New permission engine | 11 files, ~1 480 lines |
| Authorization decision points migrated | 18 |
| Permissions defined | 13 across 6 modules |
| Tests added | 68 (48 engine + 20 migration lock) |
| **SQL statements** | **0** |
| **New environment variables** | **0** |

### New — `src/lib/admin/permissions/`

`types.ts` · `registry.ts` · `roleMap.ts` · `cache.ts` · `resolver.ts` ·
`engine.ts` · `guards.ts` (server only) · `client.ts` · `index.ts` +
`engine.test.ts` · `migration.test.ts`

### Migrated (18 decision points)

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

## Self-review findings (found and fixed in this PR)

These were found by auditing the implementation, not by tests failing:

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

## Verification

```bash
npx tsc --noEmit && npx vitest run && npm run architecture:check && npx next build
```

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `vitest run` | ✅ **63 files / 613 tests passed** |
| `architecture:check` | ✅ 7/7 rules |
| `next lint` | ✅ 0 errors (pre-existing warnings only, none in `permissions/`) |
| `next build` | ✅ compiled; all `/admin` routes `ƒ` dynamic |

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
