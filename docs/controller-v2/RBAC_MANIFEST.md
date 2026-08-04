# RBAC Manifest — Component 3

Complete inventory of what Component 3 adds, changes, and deletes.
**Branch point:** `35233a4` · **Totals:** 50 files (23 added · 1 deleted · 26 modified)
**Source change:** `src/` +2409 / −194 — quoted for `src/` only, because a
whole-diff total changes every time it is written down.
**Registry version:** `2026-08-04.2`

---

## 1. New — the permission engine

`src/lib/admin/permissions/`

| File | Lines | Purpose | Client-safe |
|---|---:|---|:---:|
| `types.ts` | 95 | `PermissionId`, `PermissionDefinition`, `Decision`, `ResolvedPermissionSet`, deny/allow reasons | ✅ |
| `registry.ts` | 263 | 14 permission definitions + `createRegistry()` + `PERMISSIONS` constants | ✅ |
| `roleMap.ts` | 112 | Role → permission map; `unionPermissions()`; `PermissionSetView` + `immutableSet()` | ✅ |
| `cache.ts` | 136 | Version-safe, role-set-keyed resolved-set cache | ✅ |
| `resolver.ts` | 48 | Actor → `ResolvedPermissionSet` | ✅ |
| `engine.ts` | 134 | The Policy Decision Point | ✅ |
| `guards.ts` | 141 | `requirePermission`, `requirePagePermission` | ❌ server only |
| `client.ts` | 53 | `can`, `filterByPermission` over a plain permission list | ✅ |
| `index.ts` | 65 | Server barrel | ❌ server only |

### Tests (89 in `permissions/`, plus 12 in `nav.test.ts`)

| File | Lines | Tests | Covers |
|---|---:|---:|---|
| `engine.test.ts` | 430 | 47 | 11 required scenarios + 9 registry-integrity invariants |
| `migration.test.ts` | 111 | 23 | Backward-compatibility lock + role-map immutability, including the `Set.prototype` bypass |
| `guards.test.ts` | 191 | 12 | **Enforcement layer** — decision order, redirect targets, loop regression |
| `invalidation.test.ts` | 117 | 7 | Grant/revoke/multi-role cache flows + the invalidation wire |

## 2. New — extracted UI

| File | Lines | Why |
|---|---:|---|
| `src/components/admin/layout/nav.ts` | 84 | Nav model + `visibleNavItems()`. Extracted so the visibility rule is testable — the PR review found the migration had silently dropped the role gate from the four `ready:false` placeholders. `nav.test.ts` (12 tests) pins the visible set per role. |
| `src/components/admin/dashboard/HomeDashboard.tsx` | 55 | `/admin/page.tsx` was `'use client'` and could not carry a server permission guard. UI moved here; the page became a server component. Content unchanged. |

## 3. Deleted

| File | Reason |
|---|---|
| `src/lib/admin/page-guard.ts` | `requirePageRole()` had **zero callers and zero tests** after migration. It was a parallel role-rank authorization path that would let a future route bypass the registry. |

## 4. Modified — Components 1–2 (integration only)

| File | Change | Why strictly required |
|---|---|---|
| `src/lib/admin/rbac.ts` | Added `resolveActorForUser(userId, email, source)` | Page guards need **all** roles. `resolveAdminRole()` returns only the highest, which silently drops permissions for multi-role actors under union semantics. |
| | `resolveActor` now **delegates** to `resolveActorForUser` | Review finding R-8: adding the second function had reintroduced two inline copies of the Actor construction — the exact defect the Component 2 review fixed. One construction site restored. |
| | `invalidateRoleCache()` also clears `permissionCache` | Without this, revoking a role leaves a resolved permission set live for up to 30 s. |
| | `requireOwner` widened to `ctx: { actor: Actor }` | So it accepts the context `requirePermission` returns, allowing Owner Guard to layer on top of RBAC. |
| | `requireAdminRole` marked `@deprecated` | Zero production callers remain. Kept because its tests cover the Component 1 Owner boot assertion. |
| `src/lib/admin.ts` | Deprecation pointers now name `requirePermission` | They directed new code to `requireAdminRole`, which is itself deprecated. |

## 5. Authorization decision points (20)

### API handlers (12) — `requireAdminRole(req, role)` → `requirePermission(req, PERMISSIONS.X)`

| Route | Method | Permission |
|---|---|---|
| `/api/admin/analytics/activation` | GET | `analytics.activation.read` |
| `/api/admin/analytics/auth` | GET | `analytics.auth.read` |
| `/api/admin/audit` | GET | `audit.log.read` |
| `/api/admin/settings` | GET | `settings.config.read` |
| `/api/admin/deals` | GET | `commerce.deals.read` |
| `/api/admin/deals` | POST | `commerce.deals.create` |
| `/api/admin/deals/[id]` | PATCH | `commerce.deals.update` |
| `/api/admin/deals/[id]` | DELETE | `commerce.deals.delete` |
| `/api/admin/deals/upload` | POST | `commerce.deals.upload_media` |
| `/api/admin/rbac/roles` | GET | `security.roles.read` |
| `/api/admin/rbac/roles` | POST | `security.roles.grant` **+ Owner Guard** |
| `/api/admin/rbac/roles/[id]` | DELETE | `security.roles.revoke` **+ Owner Guard** |

### Pages (6) — `requirePageRole(role)` → `requirePagePermission(PERMISSIONS.X)`

`/admin/analytics/activation` · `/admin/analytics/auth` · `/admin/audit` ·
`/admin/deals` · `/admin/rbac` · `/admin/settings`

### Newly guarded (2) — previously layout-only

| Page | Permission | Note |
|---|---|---|
| `/admin` | `dashboard.home.view` | Passes `deniedRedirect: '/reviews'` — the default `/admin` would redirect the page to itself |
| `/admin/analytics` | `analytics.content.read` | New permission. Review finding R-7: it had borrowed `analytics.auth.read`, gating a **content**-analytics page on an **authentication** permission |

`rateLimit` and `isSameOrigin` counts per handler are byte-identical to
`35233a4` — no request-hardening was lost in the migration.

## 6. Modified — UI

| File | Change |
|---|---|
| `src/app/admin/layout.tsx` | Resolves the full Actor via `resolveActorForUser`, computes `permissions`, passes them to the shell |
| `src/components/admin/layout/AdminShell.tsx` | Nav model and visibility rule moved to `nav.ts`; renders `visibleNavItems(...)`. Takes `isOwner` so the badge names the Platform Owner instead of mislabelling a roleless Owner as "analyst". |

## 7. Modified — tests

`route.test.ts` for analytics/activation, analytics/auth, and rbac/roles: mocks
moved from `requireAdminRole` on `@/lib/admin/rbac` to `requirePermission` on
`@/lib/admin/permissions`. `PERMISSIONS` and the rest of the module stay **real**,
so passing a wrong constant is still a test failure. The rbac/roles suite also
gained an assertion that invalidation targets the **affected user**, not the
actor.

## 8. Removed during review (dead code)

| Symbol | Verdict |
|---|---|
| `canAll`, `canAny` (`client.ts`) | No consumer. The registry has no read/write role split, so no screen has a viewer who cannot also act — any consumer would have been invented. |
| `requireAllPermissions` (`guards.ts`) | No caller. No handler guards on two permissions at once. |
| `Resolver.roleMap` (`resolver.ts`) | No consumer, **and** it published a reference to the structure authorization is derived from. |

## 9. Verification commands

```bash
npx tsc --noEmit && npx vitest run && npm run architecture:check && npx next build
```

Results at the time of writing: `tsc` clean · **66 files / 647 tests passed** ·
7/7 architecture rules · build succeeded, all `/admin` routes `ƒ` dynamic ·
lint 0 errors (pre-existing warnings only, none in `permissions/`).

## 10. Invariants an auditor can re-check

| Claim | Command |
|---|---|
| No legacy role gate has a production caller | `grep -rn "requireAdminRole(\|requirePageRole(" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| grep -v "^src/lib/admin/rbac.ts"` |
| No permission string is hardcoded outside the registry | `grep -rn "requirePermission(\|requirePagePermission(" src \| grep -v guards.ts \| grep -v "\.test\." \| grep -v "PERMISSIONS\."` |
| No `'use client'` file imports a server-only permissions module | `grep -rl "^'use client'" src \| xargs grep -l "permissions/guards\|permissions/resolver\|from '@/lib/admin/rbac'"` |
| Every `/api/admin` handler is gated | `grep -c requirePermission` per `route.ts` — 12/12 |
| No exported symbol in `permissions/` is unconsumed | see the dead-export scan in the Release Readiness Report §4.5 |
