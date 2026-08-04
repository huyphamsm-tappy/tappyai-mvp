# RBAC Manifest — Component 3

Complete inventory of what Component 3 adds, changes, and deletes.
**Branch point:** `35233a4` · **Totals:** 37 files changed, +1994 / −159

---

## 1. New — the permission engine

`src/lib/admin/permissions/`

| File | Lines | Purpose | Client-safe |
|---|---:|---|:---:|
| `types.ts` | 95 | `PermissionId`, `PermissionDefinition`, `Decision`, `ResolvedPermissionSet`, deny/allow reasons | ✅ |
| `registry.ts` | 244 | 13 permission definitions + `createRegistry()` + `PERMISSIONS` constants | ✅ |
| `roleMap.ts` | 67 | Role → permission map derived from `defaultRoles`; `unionPermissions()` | ✅ |
| `cache.ts` | 136 | Version-safe, role-set-keyed resolved-set cache | ✅ |
| `resolver.ts` | 46 | Actor → `ResolvedPermissionSet` | ✅ |
| `engine.ts` | 134 | The Policy Decision Point | ✅ |
| `guards.ts` | 132 | `requirePermission`, `requireAllPermissions`, `requirePagePermission` | ❌ server only |
| `client.ts` | 53 | `can`, `filterByPermission` over a plain permission list | ✅ |
| `index.ts` | 66 | Server barrel | ❌ server only |
| `engine.test.ts` | 430 | 48 tests — 11 required scenarios + registry integrity | — |
| `migration.test.ts` | 82 | 20 tests — backward-compatibility lock | — |

## 2. New — extracted UI

| File | Lines | Why |
|---|---:|---|
| `src/components/admin/dashboard/HomeDashboard.tsx` | 55 | `/admin/page.tsx` was `'use client'` and could not carry a server permission guard. UI moved here; the page became a server component. Content unchanged. |

## 3. Deleted

| File | Reason |
|---|---|
| `src/lib/admin/page-guard.ts` | `requirePageRole()` had **zero callers and zero tests** after migration. It was a parallel role-rank authorization path that would let a future route bypass the registry. |

## 4. Modified — Components 1–2 (integration only)

| File | Change | Why strictly required |
|---|---|---|
| `src/lib/admin/rbac.ts` | Added `resolveActorForUser(userId, email, source)` | Page guards need **all** roles. `resolveAdminRole()` returns only the highest, which silently drops permissions for multi-role actors under union semantics. |
| | `invalidateRoleCache()` also clears `permissionCache` | Without this, revoking a role leaves a resolved permission set live for up to 30 s. |
| | `requireOwner` widened to `ctx: { actor: Actor }` | So it accepts the context `requirePermission` returns, allowing Owner Guard to layer on top of RBAC. |
| | `requireAdminRole` marked `@deprecated` | Zero production callers remain. Kept because its tests cover the Component 1 Owner boot assertion. |

## 5. Modified — authorization decision points (18)

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

`/admin` (`dashboard.home.view`) · `/admin/analytics` (`analytics.auth.read`)

## 6. Modified — UI

| File | Change |
|---|---|
| `src/app/admin/layout.tsx` | Resolves the full Actor via `resolveActorForUser`, computes `permissions`, passes them to the shell |
| `src/components/admin/layout/AdminShell.tsx` | `NavItem.minRole` → `NavItem.permission?`; filtering via `filterByPermission(permissions, NAV, …)` |

## 7. Modified — tests

`route.test.ts` for analytics/activation, analytics/auth, and rbac/roles: mocks
moved from `requireAdminRole` on `@/lib/admin/rbac` to `requirePermission` on
`@/lib/admin/permissions`. `PERMISSIONS` and the rest of the module stay **real**,
so passing a wrong constant is still a test failure.

## 8. Verification commands

```bash
npx tsc --noEmit && npx vitest run && npm run architecture:check && npx next build
```

Results at the time of writing: `tsc` clean · **63 files / 613 tests passed** ·
7/7 architecture rules · build succeeded, all `/admin` routes `ƒ` dynamic ·
lint 0 errors (pre-existing warnings only, none in `permissions/`).

## 9. Invariants an auditor can re-check

| Claim | Command |
|---|---|
| No legacy role gate has a production caller | `grep -rn "requireAdminRole\|requirePageRole" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| grep -v "^src/lib/admin/rbac.ts"` |
| No permission string is hardcoded outside the registry | `grep -rn "requirePermission(" src \| grep -v "PERMISSIONS\."` |
| No client component imports a server-only permissions module | see `03_COMPONENT3_RBAC_DESIGN.md` §2; audit check F in the release report |
| Every `/api/admin` handler is gated | `grep -c requirePermission` per `route.ts` — 12/12 |
