# Permission Resolution Flow

How a request becomes an authorization decision.
**Code:** `src/lib/admin/permissions/{guards,engine,resolver,cache,roleMap}.ts`

---

## 1. End-to-end path for an API request

```
HTTP request
   │
   ▼
requirePermission(req, PERMISSIONS.X)          guards.ts
   │
   ├─ 1. IDENTITY      resolveActor(req)       rbac.ts  (Component 2)
   │        │            ├─ Supabase session → userId, email
   │        │            ├─ principal cache (60 s)
   │        │            └─ Owner boot assertion  ← throws if misconfigured
   │        ▼
   │      Actor { userId, email, isOwner, roles[], capabilities[], source }
   │
   ├─ 2. OWNER GATE    (Component 1, unchanged)
   │
   ├─ 3. AUTHORIZE     permissionEngine.authorize(actor, X)   engine.ts
   │        │
   │        ▼
   │      Decision { allowed, reason, permission, detail? }
   │
   └─ 4. allowed ? return { user, actor }  :  throw AdminError(403)
```

The order in step 1→3 is deliberate: **identity is resolved before
authorization, and the Owner boot assertion runs before either.** A
misconfigured `PLATFORM_OWNER_USER_ID` fails the request loudly instead of
silently authorizing against an unowned platform.

## 2. Inside `authorize()`

```
authorize(actor, permission)
   │
   ├─ actor == null ?  ──────────────────────▶  DENY  UNAUTHENTICATED
   │
   ├─ actor.isOwner ?  ──────────────────────▶  ALLOW OWNER_BYPASS
   │      (before registry, resolver AND cache — see §3)
   │
   ├─ registry.get(permission) == undefined ?▶  DENY  UNKNOWN_PERMISSION
   │      (fail closed)
   │
   ├─ capabilityGate && capability missing ? ▶  DENY  CAPABILITY_UNAVAILABLE
   │      (INERT — CAPABILITY_GATE_ENABLED = false until Component 5)
   │
   ├─ resolve(actor).has(permission) ?
   │      ├─ no  ─────────────────────────────▶ DENY  NO_GRANT
   │      └─ yes ─────────────────────────────▶ ALLOW ROLE_GRANT
```

Every decision carries a machine-readable `reason`. There is no boolean-only
path in the engine: `can()` is a thin wrapper over `authorize().allowed`, so the
reason is always available when a caller needs to explain a denial.

## 3. Why Owner bypass is first

Placing it before the registry lookup is a security decision, not an
optimisation:

- The Owner's authority **does not derive from the catalogue**, so it must not
  be revocable by editing the catalogue. If bypass came after the lookup,
  deleting a registry row would lock the Owner out of their own platform.
- The Owner never depends on the cache being warm, a role being granted, or the
  resolver behaving. Fewer things between the Owner and their platform is the
  whole point of Component 1.
- It means an **unknown** permission still ALLOWs for the Owner. This is
  intended and tested.

Owner bypass is *not* a grant. `listPermissions()` reports the full catalogue
for the Owner so the UI is truthful, but no permission is ever written to an
Owner's role set, and the Owner is never resolved through `roleMap`.

## 4. Resolution: Actor → ResolvedPermissionSet

```
resolve(actor)                                  resolver.ts
   │
   ├─ cache.get(userId, actor.roles, REGISTRY_VERSION)
   │      │
   │      ├─ HIT  (all three match, not expired) ──▶ return cached set
   │      │
   │      └─ MISS / STALE ──▶ drop the entry, recompute:
   │
   ├─ unionPermissions(roleMap, actor.roles)     roleMap.ts
   │      │   roleMap is built ONCE per resolver, not per call
   │      │   union across ALL roles — not the highest role
   │      ▼
   │   sorted PermissionId[]
   │
   ├─ makeResolvedSet(...)  → frozen { permissions, has(), roles, registryVersion, resolvedAt }
   │
   └─ cache.set(userId, actor.roles, REGISTRY_VERSION, set)
```

**Union, not inheritance.** An actor with `['analyst','admin']` gets the union
of both sets. The old ladder would have used only `admin` — which can *lose*
permissions if a lower role ever holds something the higher one does not. Union
is monotone: adding a role can only add.

## 5. Cache hit/miss decision

An entry is served **only if all three match**:

| Check | Fails when | Consequence |
|---|---|---|
| `expiresAt > now` | 30 s elapsed | recompute |
| `registryVersion` matches | registry was edited and the version bumped | recompute under new rules |
| `rolesKey` matches | the actor's role set changed | **recompute — this is the anti-escalation property** |

The `rolesKey` check is the load-bearing one. Because the entry remembers the
role set it was computed from, a revoked role cannot keep authorizing even if
the TTL has not expired *and* nobody called `invalidate()`. Invalidation is
belt-and-braces, not the primary defence.

```
rolesCacheKey(['admin','analyst'])  ===  rolesCacheKey(['analyst','admin'])  // sorted
                                     →  "admin|analyst"
```

## 6. Invalidation paths

| Trigger | Path |
|---|---|
| Role granted | `POST /api/admin/rbac/roles` → `invalidateRoleCache(user_id)` → clears principal cache **and** permission cache |
| Role revoked | `DELETE /api/admin/rbac/roles/[id]` → same |
| Registry edited | `REGISTRY_VERSION` bump invalidates **every** entry implicitly |
| TTL | 30 s |

**Bound:** the caches are per-process (ADR-003). On Vercel, an explicit
invalidation clears only the instance that served the write; other warm
instances fall back to TTL. Worst case **≤30 s** of stale permissions, strictly
tighter than the ≤60 s already accepted for roles in Component 2. Not introduced
here, not fixed here — recorded in `BACKLOG.md`.

## 7. Page and UI flows

**Page guard** (`requirePagePermission`) mirrors the API path but redirects
instead of throwing:

```
Supabase session → checkOwnerGate()
                 →   FAIL → redirect('/reviews')      ← OUT of the Controller
                 → resolveActorForUser(userId, email) ← ALL roles, not the highest
                 → permissionEngine.authorize(actor, X)
                 → allowed ? render : redirect(deniedRedirect ?? '/admin')
```

⚠️ **The redirect target is a correctness property, not a UX detail.** Every
`/admin` page now carries a guard, `/admin` included — so a fallback that points
into the Controller is a fallback that can re-run the failing check forever.
Component 3 shipped exactly that loop and the review caught it:

| Failure | Target | Why |
|---|---|---|
| Owner Gate fails | `/reviews` — **always outside** `/admin` | The whole Controller is unavailable. Any in-Controller target re-runs the same failing gate. Not overridable by the caller. |
| Permission denied | `/admin` by default | The one page every admin can reach. |
| Permission denied **on `/admin`** | `/reviews` via `deniedRedirect` | The default would redirect the page to itself. |

`guards.test.ts` holds three RED/GREEN regression tests on these targets.

**UI** resolves once, server-side, in `src/app/admin/layout.tsx`:

```
layout.tsx (server)                     AdminShell (client)
   resolveActorForUser(...)      ──▶      permissions: PermissionId[]
   permissionEngine.listPermissions(actor)     │
                                               ▼
                              filterByPermission(permissions, NAV, item => item.permission)
```

The client never re-derives authorization from roles — it receives the already
resolved list. That keeps one resolution point and keeps role logic out of the
browser bundle.

> **UI authorization is presentation only.** Hiding a nav entry stops nobody who
> types the URL. Every page and every handler authorizes independently. The two
> pages that were hidden-but-unlocked (`/admin`, `/admin/analytics`) are exactly
> why this warning is written down.

## 8. Worked examples

| Actor | Permission | Path | Result |
|---|---|---|---|
| Owner | `commerce.deals.delete` | step 2 | ALLOW `OWNER_BYPASS` |
| Owner | `not.a.real.permission` | step 2 | ALLOW `OWNER_BYPASS` — authority is not catalogue-derived |
| `analyst` | `analytics.auth.read` | full pipeline | ALLOW `ROLE_GRANT` |
| `analyst` | `commerce.deals.delete` | step 5 | DENY `NO_GRANT` |
| `['analyst','admin']` | `commerce.deals.delete` | union | ALLOW — admin contributes it |
| `super_admin` (not Owner) | `security.roles.grant` | full pipeline | ALLOW `ROLE_GRANT` → then **Owner Guard denies** if target role is `super_admin` |
| anyone | `typo.perm.here` | step 3 | DENY `UNKNOWN_PERMISSION` |
| no session | anything | step 1 | DENY `UNAUTHENTICATED` |

The `super_admin` row is the one to internalise: RBAC allowing an action is not
the last word. Component 1's Owner Guard and the database's
`fn_grant_admin_role` both re-check it.
